#!/usr/bin/env node
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const IMPORT_MARKER = 'TOURKIT_FINANCE_SERVICE_IMPORT_2026_06_16';
const IMPORT_ACTOR = 'tourkit-finance-service-import';
const DEFAULT_BRANCH = 'Chi Nhánh Tổng';
const DEFAULT_DEPARTMENT = 'Kế toán';
const OPERATION_DEPARTMENT = 'Điều hành';
const STATUS_AS_OF = new Date(Date.UTC(2026, 5, 16, 12));
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function arg(name) {
  const prefix = `${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
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

function normalizedCompare(value) {
  return compactCode(value).replace(/_+/g, '_');
}

function rows(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).sheets[0].rows;
}

function validServiceRows(values) {
  return values.filter((row) => text(row['Mã phiếu']) && text(row['Mã tour']));
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function digits(value) {
  return text(value).replace(/\D+/g, '');
}

function parseDate(value) {
  const valueText = text(value);
  if (!valueText) return null;
  const dmy = valueText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  }
  const parsed = new Date(valueText);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateKey(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function inclusiveDays(startDate, endDate) {
  const days = Math.round((dateKey(endDate) - dateKey(startDate)) / MS_PER_DAY) + 1;
  return Math.max(days, 1);
}

function statusFromApproval(value) {
  const status = key(value);
  if (status.includes('da duyet')) return 'APPROVED';
  if (status.includes('cho duyet')) return 'PENDING';
  if (status.includes('tu choi')) return 'REJECTED';
  if (status.includes('huy')) return 'CANCELLED';
  return 'DRAFT';
}

function operationStatus(value) {
  const status = key(value);
  if (status.includes('hoan thanh')) return 'DONE';
  if (status.includes('dat coc')) return 'IN_PROGRESS';
  if (status.includes('chua thanh toan')) return 'PENDING';
  return 'PENDING';
}

function bookingStatus(startDate, endDate, serviceStatuses) {
  if (serviceStatuses.every((status) => operationStatus(status) === 'DONE')) return 'COMPLETED';
  if (endDate && endDate < STATUS_AS_OF) return 'COMPLETED';
  if (startDate && startDate <= STATUS_AS_OF && endDate && endDate >= STATUS_AS_OF) return 'OPERATING';
  return 'CONFIRMED';
}

function orderStatus(startDate, endDate) {
  if (!startDate || !endDate) return 'UPCOMING';
  if (endDate < STATUS_AS_OF) return 'COMPLETED';
  if (startDate <= STATUS_AS_OF && endDate >= STATUS_AS_OF) return 'RUNNING';
  return 'UPCOMING';
}

function paymentMethod(raw) {
  const value = key(raw);
  if (value.includes('tien mat') || value.includes('cash')) return 'CASH';
  if (value.includes('qr')) return 'QR';
  if (value.includes('the') || value.includes('card')) return 'CARD';
  if (value.includes('bu tru')) return 'OFFSET';
  return 'BANK_TRANSFER';
}

function receiptType(raw) {
  const value = key(raw);
  if (value.includes('coc')) return 'DEPOSIT';
  if (value.includes('cong no')) return 'CUSTOMER_DEBT';
  if (value.includes('thu ho')) return 'COLLECT_ON_BEHALF';
  if (value.includes('nha cung cap')) return 'SUPPLIER_FUND_REFUND';
  return 'TOUR_PAYMENT';
}

function paymentType(row, supplierId) {
  if (supplierId) return 'SUPPLIER_PAYMENT';
  const haystack = key(`${row['Tên phiếu chi']} ${row['Lý do']} ${row['Người nhận']}`);
  if (haystack.includes('thue') || haystack.includes('bhxh') || haystack.includes('thuong')) return 'INTERNAL_EXPENSE';
  return 'OTHER';
}

function serviceRequestStatus(financePaymentStatus, amount) {
  if (amount <= 0) return 'DRAFT';
  if (financePaymentStatus === 'APPROVED') return 'PAID';
  if (financePaymentStatus === 'PENDING') return 'APPROVED';
  return 'APPROVED';
}

function parsePaymentRefs(rawValue) {
  const raw = text(rawValue);
  if (!raw) return [];
  const refs = [];
  const regex = /([\d,]+)\|(.+?)(?=\s+\d[\d,]*\||$)/g;
  let match;
  while ((match = regex.exec(raw))) {
    const amount = numberValue(match[1]);
    const code = text(match[2]);
    if (amount > 0 && code) refs.push({ amount, code });
  }
  return refs;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function duplicate(values) {
  const counts = new Map();
  for (const value of values.map(text).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function groupBy(values, getKey) {
  const groups = new Map();
  for (const value of values) {
    const groupKey = getKey(value);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(value);
  }
  return groups;
}

function statusCounts(values, field) {
  return values.reduce((acc, row) => {
    const status = text(row[field]) || '(blank)';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function amountSummary(values, field) {
  return values.reduce((sum, row) => sum + numberValue(row[field]), 0);
}

function cleanCodePrefix(value) {
  return compactCode(value).replace(/[^A-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function customerCode(prefix, seed) {
  return `${prefix}-${cleanCodePrefix(seed)}`.slice(0, 64);
}

function placeholderPhone(seed) {
  return `TK-${cleanCodePrefix(seed)}`.slice(0, 32);
}

function serviceTypeName(row) {
  const supplierName = key(row['Nhà cung cấp']);
  const serviceName = key(row['Tên dịch vụ']);
  if (supplierName.includes('khach san') || serviceName.includes('phong')) return 'HOTEL';
  if (serviceName.includes('ve may bay') || serviceName.includes('flight')) return 'FLIGHT';
  if (serviceName.includes('landtour') || serviceName.includes('tour')) return 'LANDTOUR';
  return 'SERVICE';
}

function firstDate(...dates) {
  return dates.find((date) => date instanceof Date && Number.isFinite(date.getTime())) || null;
}

function findByCode(rows, code, fields) {
  const wanted = normalizedCompare(code);
  return rows.find((row) => fields.some((field) => normalizedCompare(row[field]) === wanted)) || null;
}

function buildPaymentRefs(services) {
  const refs = [];
  for (const row of services) {
    for (const ref of parsePaymentRefs(row['Phiếu chi tương ứng'])) {
      refs.push({ ...ref, serviceCode: text(row['Mã phiếu']), row });
    }
  }
  return refs;
}

async function loadReferenceData(receipts, payments, services) {
  const tourCodes = unique([
    ...receipts.map((row) => text(row['Mã tour'])),
    ...payments.map((row) => text(row['Mã tour'])),
    ...services.map((row) => text(row['Mã tour'])),
  ]);
  const supplierCodes = unique(services.map((row) => text(row['Mã NCC'])));
  const supplierNames = unique([...payments.map((row) => text(row['Nhà cung cấp'])), ...services.map((row) => text(row['Nhà cung cấp']))]);
  const phones = unique([...receipts.map((row) => digits(row['Số điện thoại'])), ...payments.map((row) => digits(row['SĐT']))]);

  const [orders, bookings, tours, suppliersByCode, suppliersByName, customersByPhone] = await Promise.all([
    prisma.order.findMany({
      where: { OR: tourCodes.flatMap((code) => [{ systemCode: code }, { tourCode: code }, { holdCode: code }]) },
      select: { id: true, systemCode: true, tourCode: true, holdCode: true, name: true, type: true, customerId: true, customerName: true, customerPhone: true, customerEmail: true, branch: true, department: true, startDate: true, endDate: true, totalRevenue: true, paidAmount: true, totalCost: true, paidCost: true },
    }),
    prisma.booking.findMany({
      where: { code: { in: tourCodes.map(compactCode) } },
      select: { id: true, code: true, customerId: true, customerName: true, customerPhone: true, orderId: true, tourId: true, tourProgramId: true, startDate: true, endDate: true, paxCount: true, totalSellPrice: true },
    }),
    prisma.tour.findMany({
      where: { OR: tourCodes.flatMap((code) => [{ systemCode: code }, { tourCode: code }]) },
      select: { id: true, systemCode: true, tourCode: true, name: true, orderId: true, branch: true, department: true },
    }),
    prisma.supplier.findMany({ where: { supplierCode: { in: supplierCodes }, deletedAt: null }, select: { id: true, supplierCode: true, name: true } }),
    prisma.supplier.findMany({ where: { name: { in: supplierNames }, deletedAt: null }, select: { id: true, supplierCode: true, name: true } }),
    prisma.customer.findMany({ where: { phone: { in: phones } }, select: { id: true, code: true, fullName: true, phone: true, branch: true, department: true } }),
  ]);

  return { tourCodes, supplierCodes, supplierNames, phones, orders, bookings, tours, suppliersByCode, suppliersByName, customersByPhone };
}

function findOrder(refs, code) {
  return findByCode(refs.orders, code, ['systemCode', 'tourCode', 'holdCode']);
}

function findBooking(refs, code) {
  const wanted = normalizedCompare(compactCode(code));
  return refs.bookings.find((booking) => normalizedCompare(booking.code) === wanted) || null;
}

function findTour(refs, code) {
  return findByCode(refs.tours, code, ['systemCode', 'tourCode']);
}

function findSupplier(refs, code, name) {
  const byCode = refs.suppliersByCode.find((supplier) => normalizedCompare(supplier.supplierCode) === normalizedCompare(code));
  if (byCode) return byCode;
  return refs.suppliersByName.find((supplier) => normalizedCompare(supplier.name) === normalizedCompare(name)) || null;
}

function findCustomer(refs, phone) {
  const phoneDigits = digits(phone);
  return refs.customersByPhone.find((customer) => customer.phone === phoneDigits) || null;
}

function auditPayload(receipts, payments, services, refs) {
  const paymentRefs = buildPaymentRefs(services);
  const paymentCodes = unique([...payments.map((row) => text(row['Số chứng từ'])), ...paymentRefs.map((ref) => ref.code)]);
  const serviceCodes = services.map((row) => text(row['Mã phiếu']));
  const tourCodes = refs.tourCodes;
  const matchedTours = tourCodes.map((code) => {
    const order = findOrder(refs, code);
    const booking = findBooking(refs, code);
    const tour = findTour(refs, code);
    return { code, order: order?.systemCode || order?.tourCode || null, booking: booking?.code || null, tour: tour?.systemCode || tour?.tourCode || null };
  });
  const unmatchedSuppliers = unique(services.map((row) => `${text(row['Mã NCC'])}|||${text(row['Nhà cung cấp'])}`))
    .map((item) => {
      const [code, name] = item.split('|||');
      return { code, name, matched: Boolean(findSupplier(refs, code, name)) };
    })
    .filter((item) => (item.code || item.name) && !item.matched);

  return {
    rowCounts: { receipts: receipts.length, payments: payments.length, services: services.length, servicePaymentRefs: paymentRefs.length },
    totals: {
      receiptAmount: amountSummary(receipts, 'Số tiền thu'),
      paymentFileAmount: amountSummary(payments, 'Số tiền'),
      serviceCost: amountSummary(services, 'Tổng tiền chi'),
      servicePaidColumn: amountSummary(services, 'Đã thanh toán'),
      servicePaymentRefAmount: paymentRefs.reduce((sum, ref) => sum + ref.amount, 0),
      serviceRemain: amountSummary(services, 'Còn thiếu'),
    },
    statuses: {
      receipts: statusCounts(receipts, 'Trạng thái duyệt'),
      payments: statusCounts(payments, 'Trạng thái duyệt'),
      services: statusCounts(services, 'Trạng thái'),
    },
    duplicates: {
      receiptCodes: duplicate(receipts.map((row) => text(row['Mã Phiếu thu']))),
      paymentCodes: duplicate(paymentCodes),
      serviceCodes: duplicate(serviceCodes),
    },
    unmatchedTours: matchedTours.filter((row) => !row.order && !row.booking && !row.tour),
    unmatchedSuppliers,
    paymentRefsNotInPaymentFile: paymentRefs.filter((ref) => !payments.some((row) => normalizedCompare(row['Số chứng từ']) === normalizedCompare(ref.code))).length,
  };
}

async function ensureSupplierCategory(tx) {
  const existing = await tx.supplierCategory.findFirst({ where: { name: 'TourKit Import' }, select: { id: true } });
  if (existing) return existing.id;
  const row = await tx.supplierCategory.create({ data: { name: 'TourKit Import' } });
  return row.id;
}

async function ensureSupplier(tx, cache, categoryId, code, name) {
  const codeText = nullableText(code);
  const nameText = nullableText(name);
  if (!codeText && !nameText) return null;
  const cacheKey = `${normalizedCompare(codeText)}|${normalizedCompare(nameText)}`;
  if (cache.suppliers.has(cacheKey)) return cache.suppliers.get(cacheKey);

  let supplier = codeText ? await tx.supplier.findFirst({ where: { supplierCode: codeText, deletedAt: null }, select: { id: true, supplierCode: true, name: true } }) : null;
  if (!supplier && nameText) supplier = await tx.supplier.findFirst({ where: { name: nameText, deletedAt: null }, select: { id: true, supplierCode: true, name: true } });
  if (!supplier) {
    supplier = await tx.supplier.create({
      data: {
        categoryId,
        supplierCode: codeText || `TK-NCC-${cleanCodePrefix(nameText)}`.slice(0, 40),
        name: nameText || codeText,
        country: 'Việt Nam',
        status: 'ACTIVE',
        notes: IMPORT_MARKER,
        createdBy: IMPORT_ACTOR,
      },
      select: { id: true, supplierCode: true, name: true },
    });
  }
  cache.suppliers.set(cacheKey, supplier);
  return supplier;
}

async function ensureCustomer(tx, cache, payload) {
  const phone = digits(payload.phone) || placeholderPhone(payload.seed);
  if (cache.customers.has(phone)) return cache.customers.get(phone);
  let customer = await tx.customer.findUnique({ where: { phone }, select: { id: true, code: true, fullName: true, phone: true, branch: true, department: true } });
  if (!customer) {
    customer = await tx.customer.create({
      data: {
        code: customerCode(payload.prefix || 'TKCUS-FIN', phone || payload.seed),
        fullName: text(payload.fullName) || `Khách TourKit ${payload.seed}`,
        phone,
        email: nullableText(payload.email),
        source: payload.source || 'TourKit finance/service import 16/06/2026',
        branch: payload.branch || DEFAULT_BRANCH,
        department: payload.department || DEFAULT_DEPARTMENT,
        createdBy: IMPORT_ACTOR,
        latestComment: IMPORT_MARKER,
      },
      select: { id: true, code: true, fullName: true, phone: true, branch: true, department: true },
    });
  }
  cache.customers.set(phone, customer);
  return customer;
}

async function ensureTourProgram(tx, code, name, route, startDate, endDate) {
  const programCode = `TKSRV-TP-${cleanCodePrefix(code)}`.slice(0, 64);
  const durationDays = inclusiveDays(startDate, endDate);
  const program = await tx.tourProgram.upsert({
    where: { code: programCode },
    create: { code: programCode, name: name || code, route: route || name || code, durationDays, description: IMPORT_MARKER },
    update: { name: name || code, route: route || name || code, durationDays, description: IMPORT_MARKER },
  });
  for (let day = 1; day <= durationDays; day += 1) {
    await tx.tourItineraryDay.upsert({
      where: { tourProgramId_dayNumber: { tourProgramId: program.id, dayNumber: day } },
      create: { tourProgramId: program.id, dayNumber: day, title: `Ngày ${day}`, description: IMPORT_MARKER },
      update: { title: `Ngày ${day}` },
    });
  }
  return program;
}

async function ensureOrderAndBooking(tx, cache, tourCode, seedRows) {
  const normalizedTourCode = compactCode(tourCode);
  if (cache.bookings.has(normalizedTourCode)) return cache.bookings.get(normalizedTourCode);

  const serviceRows = seedRows.filter((row) => normalizedCompare(row['Mã tour']) === normalizedCompare(tourCode));
  const first = serviceRows[0] || {};
  let order = await tx.order.findFirst({
    where: { OR: [{ systemCode: tourCode }, { tourCode }, { holdCode: tourCode }] },
    select: { id: true, systemCode: true, tourCode: true, holdCode: true, name: true, type: true, customerId: true, customerName: true, customerPhone: true, customerEmail: true, branch: true, department: true, startDate: true, endDate: true, totalRevenue: true, paidAmount: true, totalCost: true, paidCost: true },
  });
  let booking = await tx.booking.findUnique({
    where: { code: normalizedTourCode },
    select: { id: true, code: true, customerId: true, customerName: true, customerPhone: true, orderId: true, tourId: true, tourProgramId: true, startDate: true, endDate: true, paxCount: true, totalSellPrice: true },
  });
  if (booking) {
    cache.bookings.set(normalizedTourCode, { booking, order });
    return { booking, order };
  }

  const startDate = firstDate(parseDate(first['Ngày đi']), parseDate(first['Ngày sử dụng']), order?.startDate, STATUS_AS_OF);
  const endDate = firstDate(parseDate(first['Ngày về']), order?.endDate, startDate);
  const customer = order?.customerId
    ? null
    : await ensureCustomer(tx, cache, {
        seed: normalizedTourCode,
        prefix: 'TKCUS-SERVICE',
        fullName: order?.customerName || `Khách TourKit ${tourCode}`,
        phone: order?.customerPhone || placeholderPhone(normalizedTourCode),
        email: order?.customerEmail,
        source: 'TourKit service manager import 16/06/2026',
        branch: order?.branch || DEFAULT_BRANCH,
        department: order?.department || OPERATION_DEPARTMENT,
      });
  const customerId = order?.customerId || customer?.id || null;
  const customerName = order?.customerName || customer?.fullName || `Khách TourKit ${tourCode}`;
  const customerPhone = order?.customerPhone || customer?.phone || placeholderPhone(normalizedTourCode);
  const totalCost = serviceRows.reduce((sum, row) => sum + numberValue(row['Tổng tiền chi']), 0);
  const paidCost = serviceRows.reduce((sum, row) => sum + Math.max(numberValue(row['Đã thanh toán']), parsePaymentRefs(row['Phiếu chi tương ứng']).reduce((refSum, ref) => refSum + ref.amount, 0)), 0);

  if (!order) {
    order = await tx.order.create({
      data: {
        type: normalizedTourCode.startsWith('GIT') ? 'GIT_COMBO' : 'FIT_TOUR',
        systemCode: tourCode,
        tourCode,
        name: text(first['Tên tour']) || text(first['Tên dịch vụ']) || tourCode,
        route: text(first['Tên tour']) || text(first['Tên dịch vụ']) || tourCode,
        startDate,
        endDate,
        status: orderStatus(startDate, endDate),
        customerId,
        customerName,
        customerPhone,
        quantity: 1,
        totalRevenue: 0,
        paidAmount: 0,
        remainingRevenue: 0,
        totalCost,
        paidCost,
        remainingCost: Math.max(totalCost - paidCost, 0),
        branch: DEFAULT_BRANCH,
        department: OPERATION_DEPARTMENT,
        createdBy: IMPORT_ACTOR,
        createdDate: parseDate(first['Ngày tạo tour']) || new Date(),
        note: IMPORT_MARKER,
      },
      select: { id: true, systemCode: true, tourCode: true, holdCode: true, name: true, type: true, customerId: true, customerName: true, customerPhone: true, customerEmail: true, branch: true, department: true, startDate: true, endDate: true, totalRevenue: true, paidAmount: true, totalCost: true, paidCost: true },
    });
  }

  const program = await ensureTourProgram(tx, normalizedTourCode, text(first['Tên tour']) || order.name, text(first['Tên tour']) || order.route, startDate, endDate);
  booking = await tx.booking.create({
    data: {
      code: normalizedTourCode,
      tourProgramId: program.id,
      customerId,
      orderId: order.id,
      customerName,
      customerPhone,
      paxCount: 1,
      startDate,
      endDate,
      saleOwner: text(first['Người tạo tour']) || order.createdBy,
      operatorOwner: text(first['Người tạo tour']) || order.createdBy,
      status: bookingStatus(startDate, endDate, serviceRows.map((row) => text(row['Trạng thái']))),
      totalSellPrice: Number(order.totalRevenue || 0),
    },
    select: { id: true, code: true, customerId: true, customerName: true, customerPhone: true, orderId: true, tourId: true, tourProgramId: true, startDate: true, endDate: true, paxCount: true, totalSellPrice: true },
  });
  cache.bookings.set(normalizedTourCode, { booking, order });
  return { booking, order };
}

async function itineraryDayForDate(tx, booking, serviceDate) {
  if (!serviceDate) return null;
  const offset = Math.round((dateKey(serviceDate) - dateKey(booking.startDate)) / MS_PER_DAY) + 1;
  if (offset < 1) return null;
  const day = await tx.tourItineraryDay.findUnique({
    where: { tourProgramId_dayNumber: { tourProgramId: booking.tourProgramId, dayNumber: offset } },
    select: { id: true },
  });
  return day?.id || null;
}

async function ensureSupplierService(tx, supplier, row) {
  if (!supplier) return null;
  const serviceName = text(row['Tên dịch vụ']) || text(row['Mã phiếu']);
  const sku = text(row['Mã phiếu']) || null;
  const existing = await tx.supplierService.findFirst({
    where: { supplierId: supplier.id, sku, deletedAt: null },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const service = await tx.supplierService.create({
    data: {
      supplierId: supplier.id,
      sku,
      serviceName,
      startDate: parseDate(row['Ngày sử dụng']) || parseDate(row['Ngày đi']),
      endDate: parseDate(row['Ngày sử dụng']) || parseDate(row['Ngày về']),
      quantity: 1,
      accountingPrice: numberValue(row['Tổng tiền chi']),
      netPrice: numberValue(row['Tổng tiền chi']),
      sellingPrice: 0,
      description: text(row['Tên tour']),
      note: IMPORT_MARKER,
      status: 'ACTIVE',
      metadata: { source: IMPORT_MARKER, tourCode: text(row['Mã tour']), providerCode: text(row['Mã NCC']) },
    },
    select: { id: true },
  });
  return { id: service.id, created: true };
}

async function createFinanceReceipt(tx, cache, row) {
  const code = text(row['Mã Phiếu thu']);
  const amount = numberValue(row['Số tiền thu']);
  const paymentDate = parseDate(row['Ngày thanh toán']) || STATUS_AS_OF;
  const customer = await ensureCustomer(tx, cache, {
    seed: digits(row['Số điện thoại']) || code,
    prefix: 'TKCUS-RECEIPT',
    fullName: text(row['Người đóng']) || `Khách phiếu thu ${code}`,
    phone: row['Số điện thoại'],
    source: 'TourKit receipt import 16/06/2026',
  });
  const order = await tx.order.findFirst({ where: { OR: [{ systemCode: text(row['Mã tour']) }, { tourCode: text(row['Mã tour']) }, { holdCode: text(row['Mã giữ chỗ']) }] }, select: { id: true, systemCode: true, tourCode: true, name: true, branch: true, department: true } });
  const approvalStatus = statusFromApproval(row['Trạng thái duyệt']);
  const receipt = await tx.financeReceipt.create({
    data: {
      receiptCode: code,
      receiptName: text(row['Tên Phiếu thu']) || code,
      receiptType: receiptType(row['Loại phiếu thu']),
      documentDate: paymentDate,
      transferDate: paymentDate,
      paymentDate,
      paymentMethod: paymentMethod(row['Phương thức thanh toán']),
      customerId: customer.id,
      payerName: text(row['Người đóng']),
      payerPhone: digits(row['Số điện thoại']) || null,
      reason: text(row['Lý do']),
      partnerName: text(row['Phương thức thanh toán']),
      note: `${IMPORT_MARKER}; mã tour: ${text(row['Mã tour'])}; mã giữ chỗ: ${text(row['Mã giữ chỗ'])}`,
      totalAmount: amount,
      receiptAmount: amount,
      remainingAmount: 0,
      approvalStatus,
      branch: order?.branch || customer.branch || DEFAULT_BRANCH,
      department: order?.department || customer.department || DEFAULT_DEPARTMENT,
      assignedStaff: text(row['Nhân viên phụ trách']),
      approvedBy: approvalStatus === 'APPROVED' ? text(row['Nhân viên phụ trách']) || IMPORT_ACTOR : null,
      approvedAt: approvalStatus === 'APPROVED' ? paymentDate : null,
      lockedAt: approvalStatus === 'APPROVED' ? paymentDate : null,
      createdBy: IMPORT_ACTOR,
      ...(amount > 0 ? { orders: { create: [{ orderId: order?.id || null, orderCode: order?.systemCode || text(row['Mã tour']) || null, tourCode: text(row['Mã tour']) || null, tourName: order?.name || text(row['Tên Phiếu thu']) || null, amount }] } } : {}),
    },
    include: { orders: true },
  });
  if (approvalStatus === 'APPROVED' && amount > 0) {
    await tx.financeCashflowEntry.upsert({
      where: { sourceType_sourceId: { sourceType: 'RECEIPT', sourceId: receipt.id } },
      create: { sourceType: 'RECEIPT', sourceId: receipt.id, entryType: 'RECEIPT', amount, paymentMethod: receipt.paymentMethod, paymentDate, branch: receipt.branch, department: receipt.department, staff: receipt.assignedStaff, customerId: customer.id, receiptId: receipt.id, note: receipt.reason },
      update: { amount, paymentMethod: receipt.paymentMethod, paymentDate, branch: receipt.branch, department: receipt.department, staff: receipt.assignedStaff, customerId: customer.id, receiptId: receipt.id, note: receipt.reason },
    });
    await tx.customerLedgerEntry.upsert({
      where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } },
      create: { customerId: customer.id, receiptId: receipt.id, orderId: order?.id || null, sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT', creditAmount: amount, documentCode: code, documentDate: paymentDate, branch: receipt.branch, department: receipt.department, staff: receipt.assignedStaff, description: receipt.reason || receipt.receiptName, createdBy: receipt.approvedBy || IMPORT_ACTOR },
      update: { customerId: customer.id, receiptId: receipt.id, orderId: order?.id || null, creditAmount: amount, documentCode: code, documentDate: paymentDate, branch: receipt.branch, department: receipt.department, staff: receipt.assignedStaff, description: receipt.reason || receipt.receiptName },
    });
  }
  return receipt;
}

async function createFinancePayment(tx, cache, row, opts = {}) {
  const code = text(opts.code || row['Số chứng từ']);
  if (!code) return null;
  const amount = numberValue(opts.amount ?? row['Số tiền']);
  if (amount <= 0) return null;
  const supplier = opts.supplier || await ensureSupplier(tx, cache, cache.categoryId, row['Mã NCC'], row['Nhà cung cấp']);
  const order = opts.order || await tx.order.findFirst({ where: { OR: [{ systemCode: text(row['Mã tour']) }, { tourCode: text(row['Mã tour']) }, { holdCode: text(row['Mã giữ chỗ']) }] }, select: { id: true, systemCode: true, tourCode: true, name: true, branch: true, department: true } });
  const documentDate = parseDate(row['Ngày chứng từ']) || parseDate(row['Ngày tạo tour']) || opts.paymentDate || STATUS_AS_OF;
  const paymentDate = parseDate(row['Ngày thanh toán']) || opts.paymentDate || documentDate;
  const approvalStatus = opts.approvalStatus || statusFromApproval(row['Trạng thái duyệt']) || 'APPROVED';
  const payment = await tx.financePayment.create({
    data: {
      voucherCode: code,
      voucherName: text(opts.voucherName || row['Tên phiếu chi']) || code,
      voucherType: paymentType(row, supplier?.id),
      documentDate,
      transferDate: paymentDate,
      paymentDate,
      paymentMethod: paymentMethod(row['Phương thức thanh toán']),
      supplierId: supplier?.id || null,
      orderId: order?.id || null,
      receiverName: text(row['Người nhận']) || supplier?.name || text(row['Nhà cung cấp']),
      receiverPhone: digits(row['SĐT']) || null,
      reason: text(opts.reason || row['Lý do']) || text(opts.voucherName || row['Tên phiếu chi']) || code,
      partnerName: text(row['Đối tác']) || text(row['Nhà cung cấp']) || supplier?.name || null,
      note: `${IMPORT_MARKER}; mã tour: ${text(row['Mã tour'])}; mã giữ chỗ: ${text(row['Mã giữ chỗ'])}`,
      totalAmount: amount,
      paymentAmount: amount,
      remainingAmount: 0,
      bankAccountName: text(row['Tên TK']),
      bankAccountNumber: text(row['Số tài khoản']),
      bankName: text(row['Ngân hàng']),
      isSupplierDeposit: key(row['Loại phiếu chi']).includes('coc') || key(opts.serviceStatus).includes('dat coc'),
      approvalStatus,
      branch: order?.branch || DEFAULT_BRANCH,
      department: order?.department || DEFAULT_DEPARTMENT,
      assignedStaff: text(row['Người phụ trách']) || text(row['Người tạo tour']) || IMPORT_ACTOR,
      approvedBy: approvalStatus === 'APPROVED' ? text(row['Người phụ trách']) || text(row['Người tạo tour']) || IMPORT_ACTOR : null,
      approvedAt: approvalStatus === 'APPROVED' ? paymentDate : null,
      lockedAt: approvalStatus === 'APPROVED' ? paymentDate : null,
      createdBy: IMPORT_ACTOR,
    },
  });
  if (approvalStatus === 'APPROVED') {
    await tx.financeCashflowEntry.upsert({
      where: { sourceType_sourceId: { sourceType: 'PAYMENT', sourceId: payment.id } },
      create: { sourceType: 'PAYMENT', sourceId: payment.id, entryType: 'PAYMENT', amount, paymentMethod: payment.paymentMethod, paymentDate, branch: payment.branch, department: payment.department, staff: payment.assignedStaff, orderId: order?.id || null, supplierId: supplier?.id || null, paymentId: payment.id, note: payment.reason },
      update: { amount, paymentMethod: payment.paymentMethod, paymentDate, branch: payment.branch, department: payment.department, staff: payment.assignedStaff, orderId: order?.id || null, supplierId: supplier?.id || null, paymentId: payment.id, note: payment.reason },
    });
    if (supplier?.id) {
      await tx.supplierLedgerEntry.upsert({
        where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } },
        create: { supplierId: supplier.id, paymentId: payment.id, orderId: order?.id || null, sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT', debitAmount: amount, documentCode: code, documentDate: paymentDate, branch: payment.branch, department: payment.department, staff: payment.assignedStaff, description: payment.reason || payment.voucherName, createdBy: payment.approvedBy || IMPORT_ACTOR },
        update: { supplierId: supplier.id, paymentId: payment.id, orderId: order?.id || null, debitAmount: amount, documentCode: code, documentDate: paymentDate, branch: payment.branch, department: payment.department, staff: payment.assignedStaff, description: payment.reason || payment.voucherName },
      });
    }
  }
  cache.financePayments.set(normalizedCompare(code), payment);
  return payment;
}

async function cleanupImportedData(tx, receiptCodes, paymentCodes, requestCodes) {
  const receipts = await tx.financeReceipt.findMany({ where: { OR: [{ receiptCode: { in: receiptCodes } }, { createdBy: IMPORT_ACTOR }, { note: { contains: IMPORT_MARKER } }] }, select: { id: true } });
  const payments = await tx.financePayment.findMany({
    where: {
      OR: [
        { voucherCode: { in: paymentCodes } },
        { createdBy: IMPORT_ACTOR },
        { note: { contains: IMPORT_MARKER } },
        { createdBy: { in: ['operation-voucher-smoke', 'operation-payment-approver', 'smoke'] } },
        { voucherName: { contains: 'SMOKE' } },
        { reason: { contains: 'SMOKE' } },
      ],
    },
    select: { id: true },
  });
  const receiptIds = receipts.map((row) => row.id);
  const paymentIds = payments.map((row) => row.id);

  await tx.supplierPaymentRequest.updateMany({ where: { financePaymentId: { in: paymentIds } }, data: { financePaymentId: null } });
  await tx.financeCashflowEntry.deleteMany({ where: { OR: [{ receiptId: { in: receiptIds } }, { paymentId: { in: paymentIds } }, { sourceId: { in: [...receiptIds, ...paymentIds] } }] } });
  await tx.customerLedgerEntry.deleteMany({ where: { OR: [{ receiptId: { in: receiptIds } }, { sourceId: { in: receiptIds } }] } });
  await tx.supplierLedgerEntry.deleteMany({
    where: {
      OR: [
        { paymentId: { in: paymentIds } },
        { sourceId: { in: paymentIds } },
        { documentCode: { in: requestCodes } },
        { createdBy: IMPORT_ACTOR },
        { createdBy: { in: ['operation-voucher-smoke', 'operation-payment-approver', 'smoke'] } },
        { documentCode: { contains: 'SMOKE' } },
        { description: { contains: 'SMOKE' } },
      ],
    },
  });
  await tx.financeReceipt.deleteMany({ where: { id: { in: receiptIds } } });
  await tx.financePayment.deleteMany({ where: { id: { in: paymentIds } } });

  const requests = await tx.supplierPaymentRequest.findMany({
    where: { OR: [{ code: { in: requestCodes } }, { requestedBy: IMPORT_ACTOR }, { approvedBy: IMPORT_ACTOR }] },
    select: { id: true },
  });
  const requestIds = requests.map((row) => row.id);
  await tx.supplierPaymentItem.deleteMany({ where: { requestId: { in: requestIds } } });
  await tx.supplierPaymentRequest.deleteMany({ where: { id: { in: requestIds } } });

  const forms = await tx.operationForm.findMany({ where: { notes: { contains: IMPORT_MARKER } }, select: { id: true } });
  const formIds = forms.map((row) => row.id);
  await tx.operationCost.deleteMany({ where: { operationFormId: { in: formIds } } });
  await tx.operationService.deleteMany({ where: { operationFormId: { in: formIds } } });
  await tx.operationTask.deleteMany({ where: { operationFormId: { in: formIds } } });
  await tx.operationForm.deleteMany({ where: { id: { in: formIds } } });

  return { deletedReceipts: receiptIds.length, deletedPayments: paymentIds.length, deletedRequests: requestIds.length, deletedOperationForms: formIds.length };
}

async function importServiceManager(tx, cache, services) {
  const byTour = groupBy(services, (row) => compactCode(row['Mã tour']));
  const created = { operationForms: 0, operationServices: 0, operationCosts: 0, supplierServices: 0, supplierPaymentRequests: 0, supplierPaymentItems: 0, generatedFinancePayments: 0 };

  for (const [tourKey, groupRows] of byTour.entries()) {
    const tourCode = text(groupRows[0]['Mã tour']) || tourKey;
    const { booking, order } = await ensureOrderAndBooking(tx, cache, tourCode, groupRows);
    const formStatusValues = groupRows.map((row) => operationStatus(row['Trạng thái']));
    const formStatus = formStatusValues.every((status) => status === 'DONE') ? 'DONE' : formStatusValues.some((status) => status === 'IN_PROGRESS') ? 'IN_PROGRESS' : 'PENDING';
    const form = await tx.operationForm.create({
      data: {
        bookingId: booking.id,
        orderId: booking.orderId || order?.id || null,
        tourId: booking.tourId || null,
        status: formStatus,
        notes: `${IMPORT_MARKER}; mã tour: ${tourCode}`,
      },
    });
    created.operationForms += 1;

    for (const row of groupRows) {
      const supplier = await ensureSupplier(tx, cache, cache.categoryId, row['Mã NCC'], row['Nhà cung cấp']);
      const supplierService = await ensureSupplierService(tx, supplier, row);
      const supplierServiceId = supplierService?.id || null;
      if (supplierService?.created) created.supplierServices += 1;
      const serviceDate = parseDate(row['Ngày sử dụng']) || parseDate(row['Ngày đi']);
      const itineraryDayId = await itineraryDayForDate(tx, booking, serviceDate);
      const service = await tx.operationService.create({
        data: {
          operationFormId: form.id,
          itineraryDayId,
          supplierId: supplier?.id || null,
          supplierServiceId,
          serviceType: serviceTypeName(row),
          serviceName: text(row['Tên dịch vụ']) || text(row['Mã phiếu']),
          confirmationStatus: operationStatus(row['Trạng thái']) === 'DONE' ? 'CONFIRMED' : 'WAITING',
          expectedCost: numberValue(row['Tổng tiền chi']),
          actualCost: numberValue(row['Tổng tiền chi']),
          notes: `${IMPORT_MARKER}; trạng thái TourKit: ${text(row['Trạng thái'])}; đã thanh toán: ${text(row['Đã thanh toán'])}; còn thiếu: ${text(row['Còn thiếu'])}`,
        },
      });
      created.operationServices += 1;
      const cost = await tx.operationCost.create({
        data: {
          operationFormId: form.id,
          serviceId: service.id,
          costName: text(row['Tên dịch vụ']) || text(row['Mã phiếu']),
          expectedAmount: numberValue(row['Tổng tiền chi']),
          actualAmount: numberValue(row['Tổng tiền chi']),
          currency: 'VND',
          invoiceNo: text(row['Mã phiếu']),
          notes: `${IMPORT_MARKER}; phiếu chi tương ứng: ${text(row['Phiếu chi tương ứng'])}; trạng thái: ${text(row['Trạng thái'])}`,
        },
      });
      created.operationCosts += 1;

      for (const ref of parsePaymentRefs(row['Phiếu chi tương ứng'])) {
        if (!supplier?.id || ref.amount <= 0) continue;
        let financePayment = cache.financePayments.get(normalizedCompare(ref.code));
        if (!financePayment) {
          financePayment = await createFinancePayment(tx, cache, row, {
            code: ref.code,
            amount: ref.amount,
            supplier,
            order,
            voucherName: `Thanh toán dịch vụ ${text(row['Mã phiếu'])}`,
            reason: `Thanh toán ${text(row['Tên dịch vụ'])}`,
            paymentDate: serviceDate || booking.startDate,
            approvalStatus: 'APPROVED',
            serviceStatus: row['Trạng thái'],
          });
          if (financePayment) created.generatedFinancePayments += 1;
        }
        const status = serviceRequestStatus(financePayment?.approvalStatus, ref.amount);
        const request = await tx.supplierPaymentRequest.create({
          data: {
            code: ref.code,
            status,
            financePaymentId: financePayment?.id || null,
            requestedBy: text(row['Người tạo tour']) || IMPORT_ACTOR,
            approvedBy: status === 'PAID' || status === 'APPROVED' ? text(row['Người tạo tour']) || IMPORT_ACTOR : null,
            requestedAt: financePayment?.paymentDate || serviceDate || booking.startDate,
            items: { create: [{ supplierId: supplier.id, costId: cost.id, amount: ref.amount, notes: `${IMPORT_MARKER}; ${text(row['Mã phiếu'])}` }] },
          },
          include: { items: true },
        });
        created.supplierPaymentRequests += 1;
        created.supplierPaymentItems += request.items.length;
        if (status === 'PAID' || status === 'APPROVED') {
          for (const item of request.items) {
            await tx.supplierLedgerEntry.upsert({
              where: { sourceType_sourceId_entryType: { sourceType: 'MANUAL', sourceId: item.id, entryType: 'CREDIT' } },
              create: { supplierId: supplier.id, orderId: form.orderId, sourceType: 'MANUAL', sourceId: item.id, entryType: 'CREDIT', creditAmount: item.amount, documentCode: request.code, documentDate: request.requestedAt, branch: order?.branch || DEFAULT_BRANCH, department: order?.department || OPERATION_DEPARTMENT, staff: request.approvedBy || request.requestedBy, description: item.notes || `Yêu cầu thanh toán nhà cung cấp ${request.code}`, createdBy: request.approvedBy || IMPORT_ACTOR },
              update: { supplierId: supplier.id, orderId: form.orderId, creditAmount: item.amount, documentCode: request.code, documentDate: request.requestedAt, branch: order?.branch || DEFAULT_BRANCH, department: order?.department || OPERATION_DEPARTMENT, staff: request.approvedBy || request.requestedBy, description: item.notes || `Yêu cầu thanh toán nhà cung cấp ${request.code}` },
            });
          }
        }
      }
    }
  }
  return created;
}

async function main() {
  const receiptFile = arg('--receipts') || 'backups/imports/tourkit-receipts-20260616.json';
  const paymentFile = arg('--payments') || 'backups/imports/tourkit-payments-20260616.json';
  const serviceFile = arg('--services') || 'backups/imports/tourkit-services-20260616.json';
  const dryRun = process.argv.includes('--dry-run');

  const receipts = rows(receiptFile);
  const payments = rows(paymentFile);
  const rawServices = rows(serviceFile);
  const services = validServiceRows(rawServices);
  const refs = await loadReferenceData(receipts, payments, services);
  const audit = auditPayload(receipts, payments, services, refs);
  audit.skippedInvalidServiceRows = rawServices.length - services.length;
  const paymentRefs = buildPaymentRefs(services);
  const receiptCodes = receipts.map((row) => text(row['Mã Phiếu thu'])).filter(Boolean);
  const paymentCodes = unique([...payments.map((row) => text(row['Số chứng từ'])), ...paymentRefs.map((ref) => ref.code)]);
  const requestCodes = unique(paymentRefs.map((ref) => ref.code));

  const dbCountsBefore = {
    financeReceipt: await prisma.financeReceipt.count({ where: { deletedAt: null } }),
    financePayment: await prisma.financePayment.count({ where: { deletedAt: null } }),
    operationForm: await prisma.operationForm.count(),
    operationService: await prisma.operationService.count(),
    operationCost: await prisma.operationCost.count(),
    supplierPaymentRequest: await prisma.supplierPaymentRequest.count(),
    supplierPaymentItem: await prisma.supplierPaymentItem.count(),
  };

  if (dryRun) {
    console.log(JSON.stringify({ receiptFile, paymentFile, serviceFile, dryRun: true, audit, dbCountsBefore }, null, 2));
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const cleanup = await cleanupImportedData(tx, receiptCodes, paymentCodes, requestCodes);
    const cache = {
      categoryId: await ensureSupplierCategory(tx),
      suppliers: new Map(),
      customers: new Map(),
      bookings: new Map(),
      financePayments: new Map(),
    };

    let createdReceipts = 0;
    let createdPaymentsFromFile = 0;
    for (const row of receipts) {
      await createFinanceReceipt(tx, cache, row);
      createdReceipts += 1;
    }
    for (const row of payments) {
      const payment = await createFinancePayment(tx, cache, row);
      if (payment) createdPaymentsFromFile += 1;
    }
    const serviceImport = await importServiceManager(tx, cache, services);
    await tx.auditLog.create({
      data: {
        action: 'IMPORT',
        entity: 'TourKitFinanceServices',
        entityId: IMPORT_MARKER,
        metadata: { source: { receiptFile, paymentFile, serviceFile }, audit, cleanup, createdReceipts, createdPaymentsFromFile, serviceImport },
      },
    });
    return { cleanup, createdReceipts, createdPaymentsFromFile, serviceImport };
  }, { timeout: 120000 });

  const dbCountsAfter = {
    financeReceipt: await prisma.financeReceipt.count({ where: { deletedAt: null } }),
    financePayment: await prisma.financePayment.count({ where: { deletedAt: null } }),
    operationForm: await prisma.operationForm.count(),
    operationService: await prisma.operationService.count(),
    operationCost: await prisma.operationCost.count(),
    supplierPaymentRequest: await prisma.supplierPaymentRequest.count(),
    supplierPaymentItem: await prisma.supplierPaymentItem.count(),
    cashflow: await prisma.financeCashflowEntry.count(),
    customerLedger: await prisma.customerLedgerEntry.count(),
    supplierLedger: await prisma.supplierLedgerEntry.count(),
  };

  console.log(JSON.stringify({ receiptFile, paymentFile, serviceFile, dryRun: false, audit, dbCountsBefore, result, dbCountsAfter }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
