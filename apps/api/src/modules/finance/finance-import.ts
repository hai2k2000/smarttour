import { BadRequestException } from '@nestjs/common';

export type FinanceImportRecord = Record<string, unknown>;
export type FinanceImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
export const MAX_FINANCE_IMPORT_BYTES = 5 * 1024 * 1024;


export function financeImportInterceptorOptions() {
  return {
    limits: { fileSize: MAX_FINANCE_IMPORT_BYTES },
    fileFilter: (_request: unknown, file: Pick<FinanceImportFile, 'originalname' | 'mimetype'>, callback: (error: Error | null, acceptFile: boolean) => void) => {
      const isCsv = file.originalname.toLowerCase().endsWith('.csv') || ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype.toLowerCase());
      callback(isCsv ? null : new BadRequestException('Chỉ hỗ trợ file CSV. XLSX cần được xuất thành CSV trước khi tải lên.'), isCsv);
    },
  };
}

export function financeImportRows(dto: FinanceImportRecord, file?: FinanceImportFile) {
  let rows: unknown[];
  if (file) {
    if (file.size > MAX_FINANCE_IMPORT_BYTES || file.buffer.length > MAX_FINANCE_IMPORT_BYTES) {
      throw new BadRequestException('File CSV không được vượt quá 5 MB');
    }
    const isCsv = file.originalname.toLowerCase().endsWith('.csv') || ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype.toLowerCase());
    if (!isCsv) throw new BadRequestException('Chỉ hỗ trợ import CSV. XLSX cần được xuất thành CSV trước khi tải lên.');
    rows = parseCsv(file.buffer.toString('utf8'));
  } else if (Array.isArray(dto.rows)) {
    rows = dto.rows;
  } else if (typeof dto.csv === 'string') {
    if (Buffer.byteLength(dto.csv, 'utf8') > MAX_FINANCE_IMPORT_BYTES) throw new BadRequestException('Dữ liệu CSV không được vượt quá 5 MB');
    rows = parseCsv(dto.csv);
  } else {
    throw new BadRequestException('Cần tải lên file CSV hoặc gửi mảng rows');
  }
  if (!rows.length) throw new BadRequestException('File import không có dòng dữ liệu');
  if (rows.length > 500) throw new BadRequestException('Mỗi lần chỉ được import tối đa 500 dòng');
  if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new BadRequestException('Dữ liệu import không hợp lệ');
  return rows as FinanceImportRecord[];
}

export function validateReceiptImportRow(row: FinanceImportRecord, line: number) {
  const receiptAmount = importNumber(row.receiptAmount, 'receiptAmount', line, true);
  const paidBefore = importNumber(row.paidBefore, 'paidBefore', line);
  const totalAmount = importNumber(row.totalAmount, 'totalAmount', line, false, receiptAmount);
  if (totalAmount < paidBefore + receiptAmount) throw new BadRequestException(`Dòng ${line}: totalAmount phải lớn hơn hoặc bằng paidBefore + receiptAmount`);
  return {
    ...row,
    receiptName: requiredImportText(row.receiptName, 'receiptName', line),
    receiptType: importEnum(row.receiptType, 'receiptType', line, ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER']) || 'TOUR_PAYMENT',
    paymentMethod: importEnum(row.paymentMethod, 'paymentMethod', line, ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER']) || 'BANK_TRANSFER',
    paymentDate: importDate(row.paymentDate, 'paymentDate', line),
    documentDate: importDate(row.documentDate, 'documentDate', line),
    transferDate: importDate(row.transferDate, 'transferDate', line),
    totalAmount,
    paidBefore,
    receiptAmount,
    approvalStatus: 'DRAFT',
    createdBy: text(row.createdBy) || 'finance-import',
  };
}

export function validatePaymentImportRow(row: FinanceImportRecord, line: number) {
  const paymentAmount = importNumber(row.paymentAmount, 'paymentAmount', line, true);
  const totalAmount = importNumber(row.totalAmount, 'totalAmount', line, false, paymentAmount);
  if (totalAmount < paymentAmount) throw new BadRequestException(`Dòng ${line}: totalAmount phải lớn hơn hoặc bằng paymentAmount`);
  return {
    ...row,
    voucherName: requiredImportText(row.voucherName, 'voucherName', line),
    voucherType: importEnum(row.voucherType, 'voucherType', line, ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER']) || 'SUPPLIER_PAYMENT',
    paymentMethod: importEnum(row.paymentMethod, 'paymentMethod', line, ['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER']) || 'BANK_TRANSFER',
    paymentDate: importDate(row.paymentDate, 'paymentDate', line),
    documentDate: importDate(row.documentDate, 'documentDate', line),
    transferDate: importDate(row.transferDate, 'transferDate', line),
    totalAmount,
    paymentAmount,
    approvalStatus: 'DRAFT',
    createdBy: text(row.createdBy) || 'finance-import',
  };
}

function parseCsv(value: string) {
  const csv = value.replace(/^\uFEFF/, '');
  const firstLine = csv.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : ',';
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      lines.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new BadRequestException('CSV có dấu ngoặc kép chưa đóng');
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    lines.push(row);
  }
  const header = (lines.shift() || []).map((column) => column.trim());
  if (!header.length || header.some((column) => !column)) throw new BadRequestException('CSV thiếu header hợp lệ');
  if (new Set(header).size !== header.length) throw new BadRequestException('CSV có header trùng lặp');
  return lines.filter((cells) => cells.some((entry) => entry.trim())).map((cells, index) => {
    if (cells.length > header.length) throw new BadRequestException(`CSV dòng ${index + 2} có quá nhiều cột`);
    return Object.fromEntries(header.map((column, columnIndex) => [column, cells[columnIndex]?.trim() || undefined]));
  });
}

function requiredImportText(value: unknown, field: string, line: number) {
  const normalized = text(value);
  if (!normalized) throw new BadRequestException(`Dòng ${line}: thiếu ${field}`);
  return normalized;
}

function importNumber(value: unknown, field: string, line: number, positive = false, fallback = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (positive && number <= 0)) throw new BadRequestException(`Dòng ${line}: ${field} không hợp lệ`);
  return number;
}

function importDate(value: unknown, field: string, line: number) {
  const normalized = text(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Dòng ${line}: ${field} không hợp lệ`);
  return normalized;
}

function importEnum(value: unknown, field: string, line: number, allowed: string[]) {
  const normalized = text(value);
  if (!normalized) return undefined;
  if (!allowed.includes(normalized)) throw new BadRequestException(`Dòng ${line}: ${field} không hợp lệ`);
  return normalized;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
