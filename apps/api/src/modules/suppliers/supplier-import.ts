import { BadRequestException } from '@nestjs/common';
import { parseXlsxRows } from '../../common/xlsx-workbook';
import type { CreateSupplierDto } from './dto/create-supplier.dto';

export type SupplierImportRecord = Record<string, unknown>;
export type SupplierImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

export const MAX_SUPPLIER_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_SUPPLIER_IMPORT_ROWS = 500;

type SupplierImportField = keyof CreateSupplierDto | 'categoryName';
type SupplierImportDtoRecord = Partial<CreateSupplierDto>;

export type SupplierImportError = {
  line: number;
  field: string;
  message: string;
};

export type NormalizedSupplierImportRow = {
  line: number;
  dto: SupplierImportDtoRecord;
  categoryName?: string;
  source: SupplierImportRecord;
  unsupportedFields: string[];
};

export type SupplierImportNormalizeResult = {
  totalRows: number;
  validRows: number;
  failedRows: number;
  errors: SupplierImportError[];
  rows: NormalizedSupplierImportRow[];
};

const FINANCE_SENSITIVE_SUPPLIER_IMPORT_FIELDS = new Set<SupplierImportField>([
  'taxCode',
  'bankAccountName',
  'bankAccountNumber',
  'bankName',
  'pricePolicy',
  'debtNote',
]);

const SUPPLIER_IMPORT_COLUMNS: Record<string, SupplierImportField> = {
  suppliercode: 'supplierCode',
  categoryid: 'categoryId',
  categoryname: 'categoryName',
  category: 'categoryName',
  name: 'name',
  taxcode: 'taxCode',
  contactperson: 'contactPerson',
  phone: 'phone',
  email: 'email',
  country: 'country',
  province: 'province',
  address: 'address',
  website: 'website',
  link: 'link',
  rating: 'rating',
  market: 'market',
  bankaccountname: 'bankAccountName',
  bankaccountnumber: 'bankAccountNumber',
  bankname: 'bankName',
  pricepolicy: 'pricePolicy',
  debtnote: 'debtNote',
  notes: 'notes',
  status: 'status',
};

export function supplierImportInterceptorOptions() {
  return {
    limits: { fileSize: MAX_SUPPLIER_IMPORT_BYTES },
    fileFilter: (_request: unknown, file: Pick<SupplierImportFile, 'originalname' | 'mimetype'>, callback: (error: Error | null, acceptFile: boolean) => void) => {
      const supported = isCsvFile(file) || isXlsxFile(file);
      callback(supported ? null : new BadRequestException('Chỉ hỗ trợ file CSV hoặc XLSX.'), supported);
    },
  };
}

export function supplierImportRows(dto: SupplierImportRecord, file?: SupplierImportFile) {
  let rows: unknown[];
  if (file) {
    if (file.size > MAX_SUPPLIER_IMPORT_BYTES || file.buffer.length > MAX_SUPPLIER_IMPORT_BYTES) {
      throw new BadRequestException('File import không được vượt quá 5 MB');
    }
    if (isXlsxFile(file)) rows = parseXlsxRows(file.buffer);
    else if (isCsvFile(file)) rows = parseCsv(file.buffer.toString('utf8'));
    else throw new BadRequestException('Chỉ hỗ trợ import CSV hoặc XLSX.');
  } else if (Array.isArray(dto.rows)) {
    rows = dto.rows;
  } else if (typeof dto.csv === 'string') {
    if (Buffer.byteLength(dto.csv, 'utf8') > MAX_SUPPLIER_IMPORT_BYTES) throw new BadRequestException('Dữ liệu CSV không được vượt quá 5 MB');
    rows = parseCsv(dto.csv);
  } else {
    throw new BadRequestException('Cần tải lên file CSV/XLSX hoặc gửi mảng rows');
  }
  if (!rows.length) throw new BadRequestException('File import không có dòng dữ liệu');
  if (rows.length > MAX_SUPPLIER_IMPORT_ROWS) throw new BadRequestException(`Mỗi lần chỉ được import tối đa ${MAX_SUPPLIER_IMPORT_ROWS} dòng`);
  if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new BadRequestException('Dữ liệu import không hợp lệ');
  return rows as SupplierImportRecord[];
}

export function normalizeSupplierImportRows(rows: SupplierImportRecord[], options: { canWriteFinancialFields?: boolean } = {}): SupplierImportNormalizeResult {
  if (rows.length > MAX_SUPPLIER_IMPORT_ROWS) throw new BadRequestException(`Mỗi lần chỉ được import tối đa ${MAX_SUPPLIER_IMPORT_ROWS} dòng`);
  const normalizedRows: NormalizedSupplierImportRow[] = [];
  const errors: SupplierImportError[] = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const dto: SupplierImportDtoRecord = {};
    let categoryName: string | undefined;
    const unsupportedFields: string[] = [];
    let rowHasErrors = false;

    Object.entries(row).forEach(([rawField, rawValue]) => {
      const field = SUPPLIER_IMPORT_COLUMNS[columnKey(rawField)];
      if (!field) {
        if (rawField.trim()) unsupportedFields.push(rawField);
        return;
      }
      if (!hasImportValue(rawValue)) return;
      if (FINANCE_SENSITIVE_SUPPLIER_IMPORT_FIELDS.has(field) && !options.canWriteFinancialFields) {
        rowHasErrors = true;
        errors.push({
          line,
          field,
          message: 'Thiếu quyền cập nhật thông tin tài chính nhà cung cấp',
        });
        return;
      }
      try {
        const value = normalizeImportValue(field, rawValue);
        if (value === undefined) return;
        if (field === 'categoryName') categoryName = String(value);
        else dto[field] = value as never;
      } catch (error) {
        rowHasErrors = true;
        errors.push({ line, field, message: error instanceof Error ? error.message : String(error) });
      }
    });

    if (unsupportedFields.length) {
      rowHasErrors = true;
      unsupportedFields.forEach((field) => errors.push({
        line,
        field,
        message: `Cột import không được hỗ trợ: ${field}`,
      }));
    }

    if (!rowHasErrors) {
      normalizedRows.push({ line, dto, categoryName, source: row, unsupportedFields });
    }
  });

  const failedLines = new Set(errors.map((error) => error.line));
  return {
    totalRows: rows.length,
    validRows: rows.length - failedLines.size,
    failedRows: failedLines.size,
    errors,
    rows: normalizedRows,
  };
}

function isCsvFile(file: Pick<SupplierImportFile, 'originalname' | 'mimetype'>) {
  return file.originalname.toLowerCase().endsWith('.csv') || ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype.toLowerCase());
}

function isXlsxFile(file: Pick<SupplierImportFile, 'originalname' | 'mimetype'>) {
  return file.originalname.toLowerCase().endsWith('.xlsx') || file.mimetype.toLowerCase() === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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

function columnKey(value: string) {
  return value.replace(/^\uFEFF/, '').trim().replace(/[\s_-]+/g, '').toLowerCase();
}

function hasImportValue(value: unknown) {
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '');
}

function normalizeImportValue(field: SupplierImportField, value: unknown) {
  if (field === 'rating') {
    const rating = Number(value);
    if (!Number.isFinite(rating)) throw new BadRequestException('Xếp hạng nhà cung cấp không hợp lệ');
    return rating;
  }
  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') {
    throw new BadRequestException(`${field} phải là giá trị văn bản`);
  }
  const text = String(value).trim();
  if (!text) return undefined;
  return field === 'status' ? text.toUpperCase() : text;
}
