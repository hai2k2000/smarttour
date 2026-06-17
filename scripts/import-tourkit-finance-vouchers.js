#!/usr/bin/env node
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const IMPORT_MARKER = 'TOURKIT_FINANCE_VOUCHER_IMPORT_2026_06_17';
const IMPORT_ACTOR = 'tourkit-finance-voucher-import';
const LEGACY_IMPORT_MARKERS = ['TOURKIT_FINANCE_SERVICE_IMPORT_2026_06_16'];
const DEFAULT_BRANCH = 'Chi Nhánh Tổng';
const DEFAULT_DEPARTMENT = 'Kế toán';

function arg(name) {
  const prefix = `${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function flag(name) {
  return process.argv.includes(name);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function nullableText(value) {
  const valueText = text(value);
  return valueText || null;
}

function key(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

function compactCode(value) {
  return text(value)
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/--+/g, '-');
}

function cleanCode(value) {
  return compactCode(value)
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function digits(value) {
  return text(value).replace(/\D+/g, '');
}

function phoneValue(value, fallbackSeed) {
  const valueDigits = digits(value);
  if (valueDigits.length >= 6) return valueDigits.slice(0, 32);
  return `TK-${cleanCode(fallbackSeed)}`.slice(0, 32);
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = text(value).replace(/[^\d.-]+/g, '');
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30, 12);
    return new Date(excelEpoch + Math.round(value) * 24 * 60 * 60 * 1000);
  }
  const valueText = text(value);
  if (!valueText) return null;
  const dmy = valueText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  }
  const ymd = valueText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  }
  const parsed = new Date(valueText);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12));
}

function rowsFromFile(filePath) {
  if (!filePath) return [];
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.sheets) && payload.sheets[0]?.rows) return payload.sheets[0].rows;
  return [];
}

function rowValue(row, ...headers) {
  for (const header of headers) {
    if (Object.prototype.hasOwnProperty.call(row, header)) return row[header];
  }
  const byKey = new Map(Object.keys(row).map((header) => [key(header), header]));
  for (const header of headers) {
    const actual = byKey.get(key(header));
    if (actual) return row[actual];
  }
  return undefined;
}

function validReceiptRows(rows) {
  return rows.filter((row) => text(rowValue(row, 'Mã Phiếu thu', 'Mã phiếu thu')));
}

function validPaymentRows(rows) {
  return rows.filter((row) => text(rowValue(row, 'Số chứng từ', 'Mã phiếu chi')));
}

function duplicateCodes(rows, codeGetter) {
  const counts = new Map();
  for (const row of rows) {
    const code = compactCode(codeGetter(row));
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([code, count]) => ({ code, count }));
}

function statusFromApproval(value) {
  const status = key(value);
  if (status.includes('da duyet') || status.includes('approved')) return 'APPROVED';
  if (status.includes('cho duyet') || status.includes('pending')) return 'PENDING';
  if (status.includes('tu choi') || status.includes('reject')) return 'REJECTED';
  if (status.includes('huy') || status.includes('cancel')) return 'CANCELLED';
  return 'DRAFT';
}

function paymentMethod(value) {
  const method = key(value);
  if (method.includes('tien mat') || method.includes('cash')) return 'CASH';
  if (method.includes('qr')) return 'QR';
  if (method.includes('the') || method.includes('card')) return 'CARD';
  if (method.includes('bu tru')) return 'OFFSET';
  if (method.includes('khac')) return 'OTHER';
  return 'BANK_TRANSFER';
}

function receiptType(value) {
  const type = key(value);
  if (type.includes('coc')) return 'DEPOSIT';
  if (type.includes('cong no')) return 'CUSTOMER_DEBT';
  if (type.includes('thu ho')) return 'COLLECT_ON_BEHALF';
  if (type.includes('nha cung cap') || type.includes('ncc')) return 'SUPPLIER_FUND_REFUND';
  if (type.includes('khach') || type.includes('tour') || type.includes('doan')) return 'TOUR_PAYMENT';
  return 'OTHER';
}

function paymentType(value, supplierId) {
  const type = key(value);
  if (type.includes('coc')) return 'SUPPLIER_DEPOSIT';
  if (type.includes('hoa hong') || type.includes('commission')) return 'COMMISSION';
  if (type.includes('tam ung') || type.includes('advance')) return 'ADVANCE';
  if (type.includes('hoan') && type.includes('khach')) return 'CUSTOMER_REFUND';
  if (supplierId || type.includes('nha cung cap') || type.includes('ncc')) return 'SUPPLIER_PAYMENT';
  if (type.includes('noi bo') || type.includes('van phong') || type.includes('luong') || type.includes('thue')) return 'INTERNAL_EXPENSE';
  return 'OTHER';
}

function sourceNote(parts) {
  return [
    `[${IMPORT_MARKER}]`,
    ...parts.filter((part) => text(part)),
  ].join(' | ');
}

function isImportedRecord(row) {
  const createdBy = text(row?.createdBy);
  const note = text(row?.note);
  return createdBy === IMPORT_ACTOR
    || createdBy.startsWith('tourkit-')
    || note.includes(IMPORT_MARKER)
    || LEGACY_IMPORT_MARKERS.some((marker) => note.includes(marker));
}

function stableCode(prefix, seed) {
  const cleaned = cleanCode(seed) || 'UNKNOWN';
  let hash = 0;
  for (const char of text(seed)) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return `${prefix}-${cleaned}-${hash.toString(36).toUpperCase()}`.slice(0, 64);
}

function unique(values) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function putMany(map, row, ...values) {
  for (const value of values) {
    const code = compactCode(value);
    if (code && !map.has(code)) map.set(code, row);
  }
}

async function loadReferenceData(receipts, payments) {
  const codes = unique([
    ...receipts.flatMap((row) => [rowValue(row, 'Mã tour'), rowValue(row, 'Mã giữ chỗ')]),
    ...payments.flatMap((row) => [rowValue(row, 'Mã tour'), rowValue(row, 'Mã giữ chỗ')]),
  ]).map(compactCode).filter(Boolean);
  const phones = unique([
    ...receipts.map((row) => phoneValue(rowValue(row, 'Số điện thoại'), rowValue(row, 'Mã Phiếu thu'))),
    ...payments.map((row) => phoneValue(rowValue(row, 'SĐT', 'Số điện thoại'), rowValue(row, 'Số chứng từ'))),
  ]);
  const supplierNames = unique(payments.flatMap((row) => [rowValue(row, 'Nhà cung cấp'), rowValue(row, 'Người nhận')]));

  const [orders, tours, bookings, customers, suppliers] = await Promise.all([
    codes.length ? prisma.order.findMany({
      where: {
        OR: [
          { systemCode: { in: codes } },
          { tourCode: { in: codes } },
          { holdCode: { in: codes } },
        ],
      },
      select: {
        id: true,
        systemCode: true,
        tourCode: true,
        holdCode: true,
        name: true,
        customerId: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        branch: true,
        department: true,
      },
    }) : [],
    codes.length ? prisma.tour.findMany({
      where: { OR: [{ systemCode: { in: codes } }, { tourCode: { in: codes } }] },
      select: { id: true, systemCode: true, tourCode: true, name: true, orderId: true, branch: true, department: true },
    }) : [],
    codes.length ? prisma.booking.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, orderId: true, tourId: true, customerId: true, customerName: true, customerPhone: true, customerEmail: true },
    }) : [],
    phones.length ? prisma.customer.findMany({
      where: { phone: { in: phones } },
      select: { id: true, code: true, fullName: true, phone: true, email: true, branch: true, department: true },
    }) : [],
    supplierNames.length ? prisma.supplier.findMany({
      where: { name: { in: supplierNames }, deletedAt: null },
      select: { id: true, supplierCode: true, name: true, phone: true, categoryId: true },
    }) : [],
  ]);

  const orderByCode = new Map();
  for (const order of orders) putMany(orderByCode, order, order.systemCode, order.tourCode, order.holdCode);
  const tourByCode = new Map();
  for (const tour of tours) putMany(tourByCode, tour, tour.systemCode, tour.tourCode);
  const bookingByCode = new Map();
  for (const booking of bookings) putMany(bookingByCode, booking, booking.code);
  const customerByPhone = new Map(customers.map((customer) => [customer.phone, customer]));
  const supplierByName = new Map(suppliers.map((supplier) => [key(supplier.name), supplier]));

  return { orderByCode, tourByCode, bookingByCode, customerByPhone, supplierByName };
}

function contextFor(row, refs) {
  const tourCode = compactCode(rowValue(row, 'Mã tour'));
  const holdCode = compactCode(rowValue(row, 'Mã giữ chỗ'));
  const candidates = [tourCode, holdCode].filter(Boolean);
  const order = candidates.map((code) => refs.orderByCode.get(code)).find(Boolean) || null;
  const booking = candidates.map((code) => refs.bookingByCode.get(code)).find(Boolean) || null;
  const tour = candidates.map((code) => refs.tourByCode.get(code)).find(Boolean) || null;
  return { tourCode, holdCode, order, booking, tour };
}

async function ensureCustomer(tx, row, context, refs) {
  const receiptCode = compactCode(rowValue(row, 'Mã Phiếu thu', 'Mã phiếu thu'));
  const payerName = nullableText(rowValue(row, 'Người đóng')) || context.order?.customerName || context.booking?.customerName || 'Khách TourKit';
  const payerPhone = phoneValue(rowValue(row, 'Số điện thoại'), receiptCode || payerName);
  if (context.order?.customerId) return context.order.customerId;
  if (context.booking?.customerId) return context.booking.customerId;
  const cached = refs.customerByPhone.get(payerPhone);
  if (cached) return cached.id;
  const customer = await tx.customer.upsert({
    where: { phone: payerPhone },
    update: {
      fullName: payerName,
      email: context.order?.customerEmail || context.booking?.customerEmail || undefined,
      branch: context.order?.branch || DEFAULT_BRANCH,
      department: DEFAULT_DEPARTMENT,
      latestComment: sourceNote([`Mã phiếu thu: ${receiptCode}`, `Số điện thoại gốc: ${text(rowValue(row, 'Số điện thoại'))}`]),
    },
    create: {
      code: stableCode('TKC', receiptCode || payerPhone || payerName),
      fullName: payerName,
      phone: payerPhone,
      email: context.order?.customerEmail || context.booking?.customerEmail || null,
      branch: context.order?.branch || DEFAULT_BRANCH,
      department: DEFAULT_DEPARTMENT,
      source: 'TourKit',
      createdBy: IMPORT_ACTOR,
      latestComment: sourceNote([`Mã phiếu thu: ${receiptCode}`, `Số điện thoại gốc: ${text(rowValue(row, 'Số điện thoại'))}`]),
    },
    select: { id: true, phone: true, fullName: true },
  });
  refs.customerByPhone.set(customer.phone, customer);
  return customer.id;
}

async function ensureSupplierCategory(tx) {
  return tx.supplierCategory.upsert({
    where: { name: 'Chi phí khác' },
    update: {},
    create: { name: 'Chi phí khác' },
    select: { id: true },
  });
}

async function ensureSupplier(tx, row, refs) {
  const supplierName = nullableText(rowValue(row, 'Nhà cung cấp')) || nullableText(rowValue(row, 'Người nhận'));
  if (!supplierName) return null;
  const cached = refs.supplierByName.get(key(supplierName));
  if (cached) return cached.id;
  const existing = await tx.supplier.findFirst({
    where: { name: supplierName, deletedAt: null },
    select: { id: true, supplierCode: true, name: true, phone: true, categoryId: true },
  });
  if (existing) {
    refs.supplierByName.set(key(existing.name), existing);
    return existing.id;
  }
  const category = await ensureSupplierCategory(tx);
  const created = await tx.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: stableCode('TKSUP', supplierName),
      name: supplierName,
      contactPerson: nullableText(rowValue(row, 'Người nhận')),
      phone: digits(rowValue(row, 'SĐT', 'Số điện thoại')) || null,
      bankAccountName: nullableText(rowValue(row, 'Tên TK')),
      bankAccountNumber: nullableText(rowValue(row, 'Số tài khoản')),
      bankName: nullableText(rowValue(row, 'Ngân hàng')),
      notes: sourceNote([`Tạo từ phiếu chi TourKit: ${text(rowValue(row, 'Số chứng từ'))}`]),
      createdBy: IMPORT_ACTOR,
      status: 'ACTIVE',
    },
    select: { id: true, supplierCode: true, name: true, phone: true, categoryId: true },
  });
  refs.supplierByName.set(key(created.name), created);
  return created.id;
}

async function guardConflicts(receipts, payments) {
  const receiptCodes = receipts.map((row) => compactCode(rowValue(row, 'Mã Phiếu thu', 'Mã phiếu thu'))).filter(Boolean);
  const paymentCodes = payments.map((row) => compactCode(rowValue(row, 'Số chứng từ', 'Mã phiếu chi'))).filter(Boolean);
  const [existingReceipts, existingPayments] = await Promise.all([
    receiptCodes.length ? prisma.financeReceipt.findMany({ where: { receiptCode: { in: receiptCodes } }, select: { receiptCode: true, createdBy: true, note: true } }) : [],
    paymentCodes.length ? prisma.financePayment.findMany({ where: { voucherCode: { in: paymentCodes } }, select: { voucherCode: true, createdBy: true, note: true } }) : [],
  ]);
  const receiptConflicts = existingReceipts.filter((row) => !isImportedRecord(row)).map((row) => row.receiptCode);
  const paymentConflicts = existingPayments.filter((row) => !isImportedRecord(row)).map((row) => row.voucherCode);
  if (receiptConflicts.length || paymentConflicts.length) {
    throw new Error(`Mã phiếu đã tồn tại ngoài dữ liệu TourKit import: receipts=${receiptConflicts.join(',') || '-'} payments=${paymentConflicts.join(',') || '-'}`);
  }
}

async function importReceipt(tx, row, refs) {
  const receiptCode = compactCode(rowValue(row, 'Mã Phiếu thu', 'Mã phiếu thu'));
  if (!receiptCode) return null;
  const context = contextFor(row, refs);
  const receiptDate = parseDate(rowValue(row, 'Ngày thanh toán'));
  const amount = numberValue(rowValue(row, 'Số tiền thu'));
  const status = statusFromApproval(rowValue(row, 'Trạng thái duyệt'));
  const customerId = await ensureCustomer(tx, row, context, refs);
  const note = sourceNote([
    `File: phieuthu.xls`,
    `Mã tour: ${text(rowValue(row, 'Mã tour'))}`,
    `Mã giữ chỗ: ${text(rowValue(row, 'Mã giữ chỗ'))}`,
    `Phương thức gốc: ${text(rowValue(row, 'Phương thức thanh toán'))}`,
  ]);
  const data = {
    receiptName: nullableText(rowValue(row, 'Tên Phiếu thu', 'Tên phiếu thu')) || receiptCode,
    receiptType: receiptType(rowValue(row, 'Loại phiếu thu')),
    documentDate: receiptDate,
    transferDate: receiptDate,
    paymentDate: receiptDate,
    paymentMethod: paymentMethod(rowValue(row, 'Phương thức thanh toán')),
    customerId,
    tourId: context.tour?.id || null,
    payerName: nullableText(rowValue(row, 'Người đóng')) || context.order?.customerName || context.booking?.customerName || null,
    payerPhone: phoneValue(rowValue(row, 'Số điện thoại'), receiptCode),
    payerEmail: context.order?.customerEmail || context.booking?.customerEmail || null,
    reason: nullableText(rowValue(row, 'Lý do')),
    partnerName: nullableText(rowValue(row, 'Phương thức thanh toán')),
    note,
    totalAmount: amount,
    paidBefore: 0,
    receiptAmount: amount,
    remainingAmount: 0,
    approvalStatus: status,
    approvedBy: status === 'APPROVED' ? IMPORT_ACTOR : null,
    approvedAt: status === 'APPROVED' ? receiptDate || new Date() : null,
    branch: context.order?.branch || context.tour?.branch || DEFAULT_BRANCH,
    department: DEFAULT_DEPARTMENT,
    assignedStaff: nullableText(rowValue(row, 'Nhân viên phụ trách')),
    createdBy: IMPORT_ACTOR,
  };
  const existing = await tx.financeReceipt.findUnique({ where: { receiptCode } });
  const receipt = existing
    ? await tx.financeReceipt.update({ where: { receiptCode }, data, select: { id: true, receiptCode: true } })
    : await tx.financeReceipt.create({ data: { receiptCode, ...data }, select: { id: true, receiptCode: true } });

  await tx.financeReceiptOrder.deleteMany({ where: { receiptId: receipt.id } });
  await tx.financeReceiptOrder.create({
    data: {
      receiptId: receipt.id,
      orderId: context.order?.id || context.tour?.orderId || context.booking?.orderId || null,
      orderCode: context.order?.systemCode || context.holdCode || null,
      tourCode: context.tourCode || context.tour?.tourCode || null,
      tourName: context.order?.name || context.tour?.name || null,
      amount,
    },
  });

  if (status === 'APPROVED' && amount > 0) {
    await tx.financeCashflowEntry.upsert({
      where: { sourceType_sourceId: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id } },
      update: {
        entryType: 'RECEIPT',
        amount,
        paymentMethod: data.paymentMethod,
        paymentDate: receiptDate,
        branch: data.branch,
        department: data.department,
        staff: data.assignedStaff,
        orderId: context.order?.id || context.tour?.orderId || context.booking?.orderId || null,
        tourId: context.tour?.id || context.booking?.tourId || null,
        customerId,
        receiptId: receipt.id,
        note: `Thu TourKit ${receiptCode}`,
      },
      create: {
        sourceType: 'FINANCE_RECEIPT',
        sourceId: receipt.id,
        entryType: 'RECEIPT',
        amount,
        paymentMethod: data.paymentMethod,
        paymentDate: receiptDate,
        branch: data.branch,
        department: data.department,
        staff: data.assignedStaff,
        orderId: context.order?.id || context.tour?.orderId || context.booking?.orderId || null,
        tourId: context.tour?.id || context.booking?.tourId || null,
        customerId,
        receiptId: receipt.id,
        note: `Thu TourKit ${receiptCode}`,
      },
    });
    await tx.customerLedgerEntry.upsert({
      where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } },
      update: {
        customerId,
        orderId: context.order?.id || context.tour?.orderId || context.booking?.orderId || null,
        tourId: context.tour?.id || context.booking?.tourId || null,
        receiptId: receipt.id,
        debitAmount: 0,
        creditAmount: amount,
        documentCode: receiptCode,
        documentDate: receiptDate,
        branch: data.branch,
        department: data.department,
        staff: data.assignedStaff,
        description: `Thu tiền TourKit: ${data.receiptName}`,
        createdBy: IMPORT_ACTOR,
      },
      create: {
        customerId,
        orderId: context.order?.id || context.tour?.orderId || context.booking?.orderId || null,
        tourId: context.tour?.id || context.booking?.tourId || null,
        receiptId: receipt.id,
        sourceType: 'FINANCE_RECEIPT',
        sourceId: receipt.id,
        entryType: 'CREDIT',
        debitAmount: 0,
        creditAmount: amount,
        documentCode: receiptCode,
        documentDate: receiptDate,
        branch: data.branch,
        department: data.department,
        staff: data.assignedStaff,
        description: `Thu tiền TourKit: ${data.receiptName}`,
        createdBy: IMPORT_ACTOR,
      },
    });
  } else {
    await tx.financeCashflowEntry.deleteMany({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id } });
    await tx.customerLedgerEntry.deleteMany({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id } });
  }

  return receipt;
}

async function importPayment(tx, row, refs) {
  const voucherCode = compactCode(rowValue(row, 'Số chứng từ', 'Mã phiếu chi'));
  if (!voucherCode) return null;
  const context = contextFor(row, refs);
  const documentDate = parseDate(rowValue(row, 'Ngày chứng từ')) || parseDate(rowValue(row, 'Ngày thanh toán'));
  const paymentDate = parseDate(rowValue(row, 'Ngày thanh toán')) || documentDate;
  const amount = numberValue(rowValue(row, 'Số tiền'));
  const status = statusFromApproval(rowValue(row, 'Trạng thái duyệt'));
  const supplierId = await ensureSupplier(tx, row, refs);
  const method = paymentMethod(rowValue(row, 'Phương thức thanh toán'));
  const voucherName = nullableText(rowValue(row, 'Tên phiếu chi')) || voucherCode;
  const branch = context.order?.branch || context.tour?.branch || DEFAULT_BRANCH;
  const data = {
    voucherName,
    voucherType: paymentType(rowValue(row, 'Loại phiếu chi'), supplierId),
    documentDate,
    transferDate: paymentDate,
    paymentDate,
    paymentMethod: method,
    supplierId,
    orderId: context.order?.id || context.tour?.orderId || context.booking?.orderId || null,
    tourId: context.tour?.id || context.booking?.tourId || null,
    receiverName: nullableText(rowValue(row, 'Người nhận')) || nullableText(rowValue(row, 'Nhà cung cấp')),
    receiverPhone: phoneValue(rowValue(row, 'SĐT', 'Số điện thoại'), voucherCode),
    reason: nullableText(rowValue(row, 'Lý do')),
    partnerName: nullableText(rowValue(row, 'Đối tác')),
    note: sourceNote([
      `File: phieu chi.xls`,
      `Mã tour: ${text(rowValue(row, 'Mã tour'))}`,
      `Mã giữ chỗ: ${text(rowValue(row, 'Mã giữ chỗ'))}`,
      `Phương thức gốc: ${text(rowValue(row, 'Phương thức thanh toán'))}`,
      `Nhà cung cấp gốc: ${text(rowValue(row, 'Nhà cung cấp'))}`,
    ]),
    totalAmount: amount,
    paymentAmount: amount,
    remainingAmount: 0,
    bankAccountName: nullableText(rowValue(row, 'Tên TK')),
    bankAccountNumber: nullableText(rowValue(row, 'Số tài khoản')),
    bankName: nullableText(rowValue(row, 'Ngân hàng')),
    isSupplierDeposit: paymentType(rowValue(row, 'Loại phiếu chi'), supplierId) === 'SUPPLIER_DEPOSIT',
    approvalStatus: status,
    approvedBy: status === 'APPROVED' ? IMPORT_ACTOR : null,
    approvedAt: status === 'APPROVED' ? paymentDate || new Date() : null,
    branch,
    department: DEFAULT_DEPARTMENT,
    assignedStaff: nullableText(rowValue(row, 'Người phụ trách')),
    createdBy: IMPORT_ACTOR,
  };
  const existing = await tx.financePayment.findUnique({ where: { voucherCode } });
  const payment = existing
    ? await tx.financePayment.update({ where: { voucherCode }, data, select: { id: true, voucherCode: true } })
    : await tx.financePayment.create({ data: { voucherCode, ...data }, select: { id: true, voucherCode: true } });

  if (status === 'APPROVED' && amount > 0) {
    await tx.financeCashflowEntry.upsert({
      where: { sourceType_sourceId: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id } },
      update: {
        entryType: 'PAYMENT',
        amount,
        paymentMethod: method,
        paymentDate,
        branch,
        department: DEFAULT_DEPARTMENT,
        staff: data.assignedStaff,
        orderId: data.orderId,
        tourId: data.tourId,
        supplierId,
        paymentId: payment.id,
        note: `Chi TourKit ${voucherCode}`,
      },
      create: {
        sourceType: 'FINANCE_PAYMENT',
        sourceId: payment.id,
        entryType: 'PAYMENT',
        amount,
        paymentMethod: method,
        paymentDate,
        branch,
        department: DEFAULT_DEPARTMENT,
        staff: data.assignedStaff,
        orderId: data.orderId,
        tourId: data.tourId,
        supplierId,
        paymentId: payment.id,
        note: `Chi TourKit ${voucherCode}`,
      },
    });
    if (supplierId) {
      await tx.supplierLedgerEntry.upsert({
        where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } },
        update: {
          supplierId,
          orderId: data.orderId,
          tourId: data.tourId,
          paymentId: payment.id,
          debitAmount: amount,
          creditAmount: 0,
          documentCode: voucherCode,
          documentDate: paymentDate,
          branch,
          department: DEFAULT_DEPARTMENT,
          staff: data.assignedStaff,
          description: `Chi tiền TourKit: ${voucherName}`,
          createdBy: IMPORT_ACTOR,
        },
        create: {
          supplierId,
          orderId: data.orderId,
          tourId: data.tourId,
          paymentId: payment.id,
          sourceType: 'FINANCE_PAYMENT',
          sourceId: payment.id,
          entryType: 'DEBIT',
          debitAmount: amount,
          creditAmount: 0,
          documentCode: voucherCode,
          documentDate: paymentDate,
          branch,
          department: DEFAULT_DEPARTMENT,
          staff: data.assignedStaff,
          description: `Chi tiền TourKit: ${voucherName}`,
          createdBy: IMPORT_ACTOR,
        },
      });
    }
  } else {
    await tx.financeCashflowEntry.deleteMany({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id } });
    await tx.supplierLedgerEntry.deleteMany({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id } });
  }

  return payment;
}

async function main() {
  const receiptsPath = arg('--receipts');
  const paymentsPath = arg('--payments');
  const dryRun = flag('--dry-run');
  if (!receiptsPath && !paymentsPath) {
    throw new Error('Missing --receipts=/path/to/phieuthu.json or --payments=/path/to/phieuchi.json');
  }

  const receipts = validReceiptRows(rowsFromFile(receiptsPath));
  const payments = validPaymentRows(rowsFromFile(paymentsPath));
  const duplicateReceiptCodes = duplicateCodes(receipts, (row) => rowValue(row, 'Mã Phiếu thu', 'Mã phiếu thu'));
  const duplicatePaymentCodes = duplicateCodes(payments, (row) => rowValue(row, 'Số chứng từ', 'Mã phiếu chi'));
  if (duplicateReceiptCodes.length || duplicatePaymentCodes.length) {
    throw new Error(`File có mã phiếu trùng: receipts=${JSON.stringify(duplicateReceiptCodes)} payments=${JSON.stringify(duplicatePaymentCodes)}`);
  }

  await guardConflicts(receipts, payments);
  const refs = await loadReferenceData(receipts, payments);
  const summary = {
    dryRun,
    receipts: {
      input: receipts.length,
      approved: receipts.filter((row) => statusFromApproval(rowValue(row, 'Trạng thái duyệt')) === 'APPROVED').length,
      pending: receipts.filter((row) => statusFromApproval(rowValue(row, 'Trạng thái duyệt')) === 'PENDING').length,
      imported: 0,
    },
    payments: {
      input: payments.length,
      approved: payments.filter((row) => statusFromApproval(rowValue(row, 'Trạng thái duyệt')) === 'APPROVED').length,
      pending: payments.filter((row) => statusFromApproval(rowValue(row, 'Trạng thái duyệt')) === 'PENDING').length,
      imported: 0,
    },
  };

  if (!dryRun) {
    for (const row of receipts) {
      await prisma.$transaction(async (tx) => {
        const receipt = await importReceipt(tx, row, refs);
        if (receipt) summary.receipts.imported += 1;
      }, { timeout: 30000 });
    }
    for (const row of payments) {
      await prisma.$transaction(async (tx) => {
        const payment = await importPayment(tx, row, refs);
        if (payment) summary.payments.imported += 1;
      }, { timeout: 30000 });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
