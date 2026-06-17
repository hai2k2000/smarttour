#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SOURCE_LABEL = 'TourKit booking export 16/06/2026';
const IMPORT_MARKER = 'TOURKIT_BOOKING_IMPORT_2026_06_16';
const CUSTOMER_CODE_PREFIX = 'TKCUS-BOOKING-20260616';
const DEFAULT_BRANCH = 'Chi Nhánh Tổng';
const DEFAULT_DEPARTMENT = 'Điều hành';
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

function rowValue(row, label) {
  const wanted = key(label);
  const entry = Object.entries(row).find(([header]) => key(header) === wanted);
  return entry ? entry[1] : undefined;
}

function digits(value) {
  return text(value).replace(/\D+/g, '');
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value));
}

function parseDate(value) {
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
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateKey(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function inclusiveDays(startDate, endDate) {
  return Math.max(1, Math.round((dateKey(endDate) - dateKey(startDate)) / MS_PER_DAY) + 1);
}

function compactCode(value, fallback) {
  const base = key(value || fallback)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  const code = base || key(fallback).replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
  return (code || 'TOURKIT-BOOKING').slice(0, 64);
}

function uniqueCodes(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const count = seen.get(row.bookingCode) || 0;
    seen.set(row.bookingCode, count + 1);
    if (!count) return row;
    const suffix = `-${count + 1}`;
    return { ...row, bookingCode: `${row.bookingCode.slice(0, 64 - suffix.length)}${suffix}` };
  });
}

function bookingStatus(row) {
  if (row.totalRevenue <= 0 && row.paidAmount <= 0 && row.totalCost <= 0) return 'DRAFT';
  if (dateKey(row.endDate) < dateKey(STATUS_AS_OF)) return 'COMPLETED';
  return 'CONFIRMED';
}

function orderStatus(row) {
  if (row.totalRevenue <= 0 && row.paidAmount <= 0 && row.totalCost <= 0) return 'DRAFT';
  if (dateKey(row.endDate) < dateKey(STATUS_AS_OF)) return 'COMPLETED';
  if (dateKey(row.startDate) <= dateKey(STATUS_AS_OF) && dateKey(STATUS_AS_OF) <= dateKey(row.endDate)) return 'RUNNING';
  return 'UPCOMING';
}

function paymentStatus(totalRevenue, paidAmount) {
  if (totalRevenue <= 0 || paidAmount <= 0) return 'UNPAID';
  return paidAmount >= totalRevenue ? 'PAID' : 'PARTIAL';
}

function costStatus(totalCost, paidCost) {
  if (totalCost <= 0 || paidCost <= 0) return 'PENDING';
  return paidCost >= totalCost ? 'PAID' : 'PARTIAL';
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload.records) ? payload.records : Array.isArray(payload.rows) ? payload.rows : [];
  return uniqueCodes(rows
    .map((row, index) => {
      const requestCode = text(rowValue(row, 'Mã yêu cầu'));
      const legacyCode = nullableText(rowValue(row, 'Mã Code'));
      const name = text(rowValue(row, 'Tên'));
      const customerName = text(rowValue(row, 'Tên KH'));
      const customerPhone = digits(rowValue(row, 'SĐT'));
      const startDate = parseDate(rowValue(row, 'Ngày check in'));
      const endDate = parseDate(rowValue(row, 'Ngày check Out'));
      const totalRevenue = numberValue(rowValue(row, 'Tổng thu'));
      const paidAmount = numberValue(rowValue(row, 'Thực thu'));
      const totalCost = numberValue(rowValue(row, 'Tổng chi'));
      const paidCost = numberValue(rowValue(row, 'Thực chi'));
      const quantity = numberValue(rowValue(row, 'Số lượng'));
      const fallbackCode = `TKBKG-20260616-${String(index + 1).padStart(4, '0')}`;
      return {
        index: index + 1,
        requestCode,
        legacyCode,
        bookingCode: compactCode(requestCode || legacyCode, fallbackCode),
        orderSystemCode: requestCode || legacyCode || fallbackCode,
        name,
        customerName,
        customerPhone,
        customerEmail: nullableText(rowValue(row, 'Email')),
        bookingDate: parseDate(rowValue(row, 'Ngày tạo đơn')),
        startDate,
        endDate,
        marketGroup: nullableText(rowValue(row, 'Nhóm/Thị trường')),
        note: nullableText(rowValue(row, 'Note')),
        quantity,
        paxCount: Math.max(1, Math.trunc(quantity || 1)),
        totalRevenue,
        paidAmount,
        remainingRevenue: Math.max(0, totalRevenue - paidAmount),
        totalCost,
        paidCost,
        remainingCost: Math.max(0, totalCost - paidCost),
        sourceProfit: numberValue(rowValue(row, 'Lợi nhuận')),
        sourceDebt: numberValue(rowValue(row, 'Còn nợ')),
        createdBy: nullableText(rowValue(row, 'Người tạo')),
        collaborator: nullableText(rowValue(row, 'CTV')),
        operatorOwner: nullableText(rowValue(row, 'Nhân viên Điều hành')),
        branch: DEFAULT_BRANCH,
        department: DEFAULT_DEPARTMENT,
        raw: row,
      };
    })
    .filter((row) => row.requestCode && row.name && row.customerName && row.customerPhone && row.startDate && row.endDate));
}

function assertRows(rows) {
  const duplicateBookingCodes = rows.map((row) => row.bookingCode).filter((code, index, all) => all.indexOf(code) !== index);
  if (duplicateBookingCodes.length) throw new Error(`Mã booking bị trùng sau chuẩn hóa: ${Array.from(new Set(duplicateBookingCodes)).join(', ')}`);
  const invalidDates = rows.filter((row) => dateKey(row.startDate) > dateKey(row.endDate));
  if (invalidDates.length) throw new Error(`Ngày check in/check out không hợp lệ ở dòng: ${invalidDates.map((row) => row.index).join(', ')}`);
}

function bookingNote(row) {
  return [
    row.note,
    `Nguồn: ${SOURCE_LABEL}`,
    `Mã yêu cầu gốc: ${row.requestCode}`,
    `Mã Code gốc: ${row.legacyCode || '-'}`,
    `Số lượng gốc: ${row.quantity}`,
    `Tổng thu TourKit: ${money(row.totalRevenue)} VND`,
    `Thực thu TourKit: ${money(row.paidAmount)} VND`,
    `Tổng chi TourKit: ${money(row.totalCost)} VND`,
    `Thực chi TourKit: ${money(row.paidCost)} VND`,
    `Lợi nhuận gốc TourKit: ${money(row.sourceProfit)} VND`,
    `Còn nợ gốc TourKit: ${money(row.sourceDebt)} VND`,
    `Import marker: ${IMPORT_MARKER}`,
  ].filter(Boolean).join('\n');
}

function orderData(row, customer) {
  return {
    type: 'HOTEL_BOOKING',
    systemCode: row.orderSystemCode,
    customerId: customer?.id || null,
    tourCode: row.legacyCode,
    name: row.name,
    route: row.name,
    marketGroup: row.marketGroup,
    bookingDate: row.bookingDate,
    startDate: row.startDate,
    endDate: row.endDate,
    status: orderStatus(row),
    paymentStatus: paymentStatus(row.totalRevenue, row.paidAmount),
    costStatus: costStatus(row.totalCost, row.paidCost),
    createdBy: row.createdBy || IMPORT_MARKER,
    createdDate: row.bookingDate,
    branch: row.branch,
    department: row.department,
    customerName: row.customerName,
    customerType: 'Booking phòng khách sạn',
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    collaborator: row.collaborator,
    operatorOwner: row.operatorOwner,
    quantity: row.paxCount,
    totalRevenue: row.totalRevenue,
    paidAmount: row.paidAmount,
    remainingRevenue: row.remainingRevenue,
    totalCost: row.totalCost,
    paidCost: row.paidCost,
    remainingCost: row.remainingCost,
    profit: row.totalRevenue - row.totalCost,
    note: bookingNote(row),
    deletedAt: null,
    ...(orderStatus(row) === 'SETTLED' ? { settledAt: new Date() } : { settledAt: null }),
  };
}

function salesItem(row) {
  return {
    serviceType: 'HOTEL_BOOKING',
    description: row.name,
    quantity: row.paxCount,
    serviceCount: 1,
    unitPrice: row.paxCount > 0 ? row.totalRevenue / row.paxCount : row.totalRevenue,
    vat: 0,
    amount: row.totalRevenue,
    note: `Doanh thu booking phòng import từ TourKit. ${IMPORT_MARKER}`,
    sortOrder: 1,
  };
}

function operationItem(row) {
  const status = orderStatus(row) === 'COMPLETED' ? 'COMPLETED' : orderStatus(row) === 'RUNNING' ? 'OPERATING' : 'WAITING';
  return {
    serviceType: 'HOTEL_BOOKING',
    bookingCode: row.bookingCode,
    serviceDate: row.startDate,
    quantity: row.paxCount,
    netPrice: row.paxCount > 0 ? row.totalCost / row.paxCount : row.totalCost,
    vat: 0,
    amount: row.totalCost,
    status,
    note: `Chi phí booking phòng import từ TourKit. ${IMPORT_MARKER}`,
    sortOrder: 1,
  };
}

function tourProgramData(row) {
  const durationDays = inclusiveDays(row.startDate, row.endDate);
  return {
    code: `TKBKG-TP-${row.bookingCode}`.slice(0, 80),
    name: row.name,
    route: row.name,
    durationDays,
    description: bookingNote(row),
  };
}

function bookingData(row, customer, order, tourProgram) {
  return {
    code: row.bookingCode,
    tourProgramId: tourProgram.id,
    customerId: customer?.id || null,
    orderId: order?.id || null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    paxCount: row.paxCount,
    startDate: row.startDate,
    endDate: row.endDate,
    saleOwner: row.createdBy,
    operatorOwner: row.operatorOwner,
    status: bookingStatus(row),
    totalSellPrice: row.totalRevenue,
    createdAt: row.bookingDate || new Date(),
  };
}

async function ensureCustomer(tx, row) {
  const existing = await tx.customer.findUnique({ where: { phone: row.customerPhone }, select: { id: true } });
  if (existing) return existing;
  return tx.customer.create({
    data: {
      code: `${CUSTOMER_CODE_PREFIX}-${String(row.index).padStart(4, '0')}`,
      fullName: row.customerName,
      phone: row.customerPhone,
      email: row.customerEmail,
      status: 'ACTIVE',
      kind: 'INDIVIDUAL',
      country: 'Việt Nam',
      source: SOURCE_LABEL,
      owner: row.createdBy,
      branch: row.branch,
      department: row.department,
      createdBy: IMPORT_MARKER,
      latestComment: `Tạo tự động khi import danh sách booking TourKit. Import marker: ${IMPORT_MARKER}`,
      timeline: {
        create: [{
          eventType: 'TOURKIT_BOOKING_IMPORT_CREATE_CUSTOMER',
          title: 'Tạo khách hàng từ import booking TourKit',
          actor: IMPORT_MARKER,
          content: `Nguồn: ${SOURCE_LABEL}; booking: ${row.requestCode}`,
          metadata: { marker: IMPORT_MARKER, source: SOURCE_LABEL, bookingCode: row.requestCode },
        }],
      },
    },
    select: { id: true },
  });
}

async function ensureTourProgram(tx, row) {
  const data = tourProgramData(row);
  const existing = await tx.tourProgram.findUnique({ where: { code: data.code }, select: { id: true } });
  let tourProgram;
  if (existing) {
    await tx.tourItineraryDay.deleteMany({ where: { tourProgramId: existing.id } });
    tourProgram = await tx.tourProgram.update({ where: { id: existing.id }, data, select: { id: true } });
  } else {
    tourProgram = await tx.tourProgram.create({ data, select: { id: true } });
  }
  await tx.tourItineraryDay.createMany({
    data: Array.from({ length: data.durationDays }, (_, index) => ({
      tourProgramId: tourProgram.id,
      dayNumber: index + 1,
      title: `Ngày ${index + 1}: ${row.name}`,
      description: index === 0 ? bookingNote(row) : `Ngày ${index + 1} của booking ${row.requestCode}`,
    })),
  });
  return tourProgram;
}

async function findOrder(tx, row) {
  const codes = [row.orderSystemCode, row.legacyCode, row.bookingCode].map((code) => text(code)).filter(Boolean);
  return tx.order.findFirst({ where: { systemCode: { in: Array.from(new Set(codes)) } }, select: { id: true, status: true } });
}

async function ensureOrder(tx, row, customer) {
  const existing = await findOrder(tx, row);
  if (existing) {
    await Promise.all([
      tx.orderSalesItem.deleteMany({ where: { orderId: existing.id, note: { contains: IMPORT_MARKER } } }),
      tx.orderOperationItem.deleteMany({ where: { orderId: existing.id, note: { contains: IMPORT_MARKER } } }),
      tx.orderLog.deleteMany({ where: { orderId: existing.id, action: { in: ['TOURKIT_BOOKING_IMPORT_CREATE', 'TOURKIT_BOOKING_IMPORT_UPDATE'] } } }),
    ]);
    const order = await tx.order.update({ where: { id: existing.id }, data: { ...orderData(row, customer), status: existing.status }, select: { id: true, systemCode: true } });
    await tx.orderSalesItem.create({ data: { ...salesItem(row), orderId: order.id } });
    await tx.orderOperationItem.create({ data: { ...operationItem(row), orderId: order.id } });
    await tx.orderLog.create({ data: { orderId: order.id, action: 'TOURKIT_BOOKING_IMPORT_UPDATE', newValue: { marker: IMPORT_MARKER, source: SOURCE_LABEL, row: row.index } } });
    return { order, created: false };
  }

  const order = await tx.order.create({
    data: {
      ...orderData(row, customer),
      salesItems: { create: [salesItem(row)] },
      operationItems: { create: [operationItem(row)] },
      logs: { create: [{ action: 'TOURKIT_BOOKING_IMPORT_CREATE', newValue: { marker: IMPORT_MARKER, source: SOURCE_LABEL, row: row.index } }] },
    },
    select: { id: true, systemCode: true },
  });
  return { order, created: true };
}

async function deleteBookingDependencies(tx, bookingIds) {
  if (!bookingIds.length) return {
    supplierPaymentItems: 0,
    supplierPaymentRequests: 0,
    operationCosts: 0,
    operationServices: 0,
    operationTasks: 0,
    operationForms: 0,
  };

  const operationForms = await tx.operationForm.findMany({ where: { bookingId: { in: bookingIds } }, select: { id: true } });
  const operationFormIds = operationForms.map((row) => row.id);
  if (!operationFormIds.length) return {
    supplierPaymentItems: 0,
    supplierPaymentRequests: 0,
    operationCosts: 0,
    operationServices: 0,
    operationTasks: 0,
    operationForms: 0,
  };
  const costs = await tx.operationCost.findMany({ where: { operationFormId: { in: operationFormIds } }, select: { id: true } });
  const costIds = costs.map((row) => row.id);
  const paymentItems = costIds.length
    ? await tx.supplierPaymentItem.findMany({ where: { costId: { in: costIds } }, select: { requestId: true } })
    : [];
  const requestIds = Array.from(new Set(paymentItems.map((item) => item.requestId)));

  const deletedPaymentItems = costIds.length ? await tx.supplierPaymentItem.deleteMany({ where: { costId: { in: costIds } } }) : { count: 0 };
  const deletedCosts = await tx.operationCost.deleteMany({ where: { operationFormId: { in: operationFormIds } } });
  const deletedServices = await tx.operationService.deleteMany({ where: { operationFormId: { in: operationFormIds } } });
  const deletedTasks = await tx.operationTask.deleteMany({ where: { operationFormId: { in: operationFormIds } } });
  const deletedForms = await tx.operationForm.deleteMany({ where: { id: { in: operationFormIds } } });
  const deletedRequests = requestIds.length
    ? await tx.supplierPaymentRequest.deleteMany({
        where: {
          id: { in: requestIds },
          items: { none: {} },
        },
      })
    : { count: 0 };

  return {
    supplierPaymentItems: deletedPaymentItems.count,
    supplierPaymentRequests: deletedRequests.count,
    operationCosts: deletedCosts.count,
    operationServices: deletedServices.count,
    operationTasks: deletedTasks.count,
    operationForms: deletedForms.count,
  };
}

async function main() {
  const file = arg('--file') || process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const preserveExisting = process.argv.includes('--preserve-existing') || process.argv.includes('--append');
  if (!file) throw new Error('Cần truyền --file=/path/to/tourkit-bookings.json');
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  const rows = normalizeRows(payload);
  assertRows(rows);
  const importCodes = rows.map((row) => row.bookingCode);
  const obsoleteBookings = preserveExisting
    ? []
    : await prisma.booking.findMany({
      where: { code: { notIn: importCodes } },
      select: { id: true, code: true, customerName: true, tourProgramId: true },
      orderBy: { code: 'asc' },
    });
  const existingImportBookings = await prisma.booking.findMany({
    where: { code: { in: importCodes } },
    select: { id: true, code: true },
  });
  const missingCustomers = [];
  const linkedOrders = [];
  const newOrders = [];
  for (const row of rows) {
    const customer = await prisma.customer.findUnique({ where: { phone: row.customerPhone }, select: { id: true } });
    if (!customer) missingCustomers.push({ row: row.index, phone: row.customerPhone, customerName: row.customerName });
    const order = await findOrder(prisma, row);
    if (order) linkedOrders.push({ row: row.index, bookingCode: row.bookingCode, orderId: order.id });
    else newOrders.push({ row: row.index, bookingCode: row.bookingCode, systemCode: row.orderSystemCode });
  }

  console.log(JSON.stringify({
    source: payload.source || payload.sourceFile || file,
    rowCount: rows.length,
    statusCounts: rows.reduce((acc, row) => ({ ...acc, [bookingStatus(row)]: (acc[bookingStatus(row)] || 0) + 1 }), {}),
    obsoleteBookingCount: obsoleteBookings.length,
    obsoleteBookingSample: obsoleteBookings.slice(0, 10),
    existingImportBookingCount: existingImportBookings.length,
    missingCustomers,
    linkedOrders: linkedOrders.slice(0, 20),
    newOrders,
    dryRun,
    preserveExisting,
  }, null, 2));
  if (dryRun) return;

  const result = await prisma.$transaction(async (tx) => {
    const obsoleteIds = obsoleteBookings.map((booking) => booking.id);
    const obsoleteProgramIds = Array.from(new Set(obsoleteBookings.map((booking) => booking.tourProgramId)));
    const dependencyDeletes = await deleteBookingDependencies(tx, obsoleteIds);
    if (obsoleteIds.length) {
      await tx.operationVoucher.updateMany({ where: { bookingId: { in: obsoleteIds } }, data: { bookingId: null } });
      await tx.supplierAllotmentAllocation.updateMany({ where: { bookingId: { in: obsoleteIds } }, data: { bookingId: null } });
      await tx.booking.deleteMany({ where: { id: { in: obsoleteIds } } });
    }
    if (obsoleteProgramIds.length) {
      const unusedPrograms = await tx.tourProgram.findMany({
        where: { id: { in: obsoleteProgramIds }, bookings: { none: {} } },
        select: { id: true },
      });
      const unusedProgramIds = unusedPrograms.map((program) => program.id);
      if (unusedProgramIds.length) {
        await tx.tourItineraryDay.deleteMany({ where: { tourProgramId: { in: unusedProgramIds } } });
        await tx.tourProgram.deleteMany({ where: { id: { in: unusedProgramIds } } });
      }
    }

    let created = 0;
    let updated = 0;
    let createdCustomers = 0;
    let createdOrders = 0;
    let updatedOrders = 0;
    for (const row of rows) {
      const customerBefore = await tx.customer.findUnique({ where: { phone: row.customerPhone }, select: { id: true } });
      const customer = customerBefore || await ensureCustomer(tx, row);
      if (!customerBefore) createdCustomers += 1;
      const { order, created: orderCreated } = await ensureOrder(tx, row, customer);
      if (orderCreated) createdOrders += 1;
      else updatedOrders += 1;
      const tourProgram = await ensureTourProgram(tx, row);
      const existing = await tx.booking.findUnique({ where: { code: row.bookingCode }, select: { id: true } });
      if (existing) {
        await tx.booking.update({ where: { id: existing.id }, data: bookingData(row, customer, order, tourProgram) });
        updated += 1;
      } else {
        await tx.booking.create({ data: bookingData(row, customer, order, tourProgram) });
        created += 1;
      }
    }
    await tx.auditLog.create({
      data: {
        action: 'IMPORT',
        entity: 'Booking',
        metadata: {
          marker: IMPORT_MARKER,
          source: SOURCE_LABEL,
          rowCount: rows.length,
          created,
          updated,
          createdCustomers,
          createdOrders,
          updatedOrders,
          deletedObsoleteBookings: obsoleteIds.length,
          dependencyDeletes,
        },
      },
    });
    return { deletedObsoleteBookings: obsoleteIds.length, dependencyDeletes, created, updated, createdCustomers, createdOrders, updatedOrders };
  }, { timeout: 90_000 });

  const [bookingCount, orderCount, byStatus] = await Promise.all([
    prisma.booking.count(),
    prisma.order.count({ where: { deletedAt: null, type: 'HOTEL_BOOKING' } }),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
  ]);
  console.log(JSON.stringify({
    ...result,
    bookingCount,
    activeHotelBookingOrderCount: orderCount,
    byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
