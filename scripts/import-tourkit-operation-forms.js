#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SOURCE_LABEL = 'TourKit phiếu điều hành export 17/06/2026';
const IMPORT_MARKER = 'TOURKIT_OPERATION_IMPORT_2026_06_17';
const DEFAULT_BRANCH = 'Chi Nhánh Tổng';
const DEFAULT_DEPARTMENT = 'Điều hành';
const DEFAULT_CATEGORY = 'Chi phí khác';
const IMPORT_AS_OF = new Date(Date.UTC(2026, 5, 17, 12));

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

function codeKey(value) {
  return text(value).replace(/\s+/g, '').toUpperCase();
}

function slugCode(value, fallback = 'TOURKIT') {
  const slug = key(value || fallback)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  return (slug || fallback).slice(0, 80);
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).replace(/\s/g, '').trim();
  if (!raw) return 0;
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value));
}

function parseDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
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
  return Math.max(1, Math.round((dateKey(endDate) - dateKey(startDate)) / (24 * 60 * 60 * 1000)) + 1);
}

function voucherStatus(row) {
  const normalized = key(row.rawStatus);
  if (/hoan thanh|paid/.test(normalized)) return 'PAID';
  if (/dat coc|partial/.test(normalized)) return 'PARTIAL';
  if (row.totalAmount > 0 && row.paidAmount >= row.totalAmount) return 'PAID';
  if (row.paidAmount > 0) return 'PARTIAL';
  return 'PENDING';
}

function formStatus(rows) {
  if (rows.length && rows.every((row) => voucherStatus(row) === 'PAID')) return 'DONE';
  if (rows.some((row) => row.paidAmount > 0 || voucherStatus(row) === 'PARTIAL')) return 'IN_PROGRESS';
  return 'PENDING';
}

function bookingStatusForGroup(group) {
  if (group.rows.every((row) => voucherStatus(row) === 'PAID')) return 'COMPLETED';
  const endDate = group.endDate || group.startDate;
  if (endDate && dateKey(endDate) < dateKey(IMPORT_AS_OF)) return 'COMPLETED';
  return 'CONFIRMED';
}

function serviceTypeFor(row) {
  const haystack = key(`${row.supplierName} ${row.serviceName}`);
  if (/khach san|hotel|ks|phong|room/.test(haystack)) return 'HOTEL';
  if (/ve may bay|flight|phong ve|hang khong/.test(haystack)) return 'FLIGHT';
  if (/xe|van chuyen|transport|bus|oto|o to/.test(haystack)) return 'TRANSPORT';
  if (/huong dan|hdv|guide/.test(haystack)) return 'GUIDE';
  if (/nha hang|an|com|buffet|meal|bbq/.test(haystack)) return 'MEAL';
  if (/tham quan|ticket|ve /.test(haystack)) return 'TICKET';
  if (/landtour|tour/.test(haystack)) return 'LANDTOUR';
  return 'OTHER';
}

function paymentRefs(value) {
  const raw = text(value);
  if (!raw) return [];
  return raw
    .split(/\n+|;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [amountText, codeText] = part.split('|');
      return {
        amount: numberValue(amountText),
        code: text(codeText),
        raw: part,
      };
    });
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload.records) ? payload.records : Array.isArray(payload.rows) ? payload.rows : [];
  const normalized = [];
  let current = null;
  let continuationCount = 0;
  rows.forEach((raw, index) => {
    const voucherCode = text(rowValue(raw, 'Mã phiếu'));
    const continuationService = text(rowValue(raw, 'Tên dịch vụ'));
    if (!voucherCode) {
      if (current && continuationService) {
        current.continuations.push({
          serviceName: continuationService,
          serviceDate: parseDate(rowValue(raw, 'Ngày sử dụng')),
          raw,
        });
        continuationCount += 1;
      }
      return;
    }
    const serviceDate = parseDate(rowValue(raw, 'Ngày sử dụng'));
    const startDate = parseDate(rowValue(raw, 'Ngày đi')) || serviceDate;
    const endDate = parseDate(rowValue(raw, 'Ngày về')) || startDate || serviceDate;
    const totalAmount = numberValue(rowValue(raw, 'Tổng tiền chi'));
    const paidAmount = numberValue(rowValue(raw, 'Đã thanh toán'));
    const remainAmount = Math.max(0, numberValue(rowValue(raw, 'Còn thiếu')) || totalAmount - paidAmount);
    current = {
      index: index + 1,
      voucherCode,
      supplierCode: text(rowValue(raw, 'Mã NCC')),
      supplierName: text(rowValue(raw, 'Nhà cung cấp')),
      serviceName: text(rowValue(raw, 'Tên dịch vụ')) || `Dịch vụ ${voucherCode}`,
      serviceDate,
      totalAmount,
      paidAmount,
      remainAmount,
      paymentRefs: paymentRefs(rowValue(raw, 'Phiếu chi tương ứng')),
      tourCode: text(rowValue(raw, 'Mã tour')),
      tourName: text(rowValue(raw, 'Tên tour')) || text(rowValue(raw, 'Mã tour')) || voucherCode,
      createdBy: nullableText(rowValue(raw, 'Người tạo tour')),
      tourCreatedDate: parseDate(rowValue(raw, 'Ngày tạo tour')),
      startDate,
      endDate,
      rawStatus: text(rowValue(raw, 'Trạng thái')),
      continuations: [],
      raw,
    };
    normalized.push(current);
  });
  return { rows: normalized.filter((row) => row.voucherCode && row.tourCode && row.supplierName && row.totalAmount >= 0), continuationCount };
}

function assertRows(rows) {
  const duplicateVoucherCodes = rows.map((row) => row.voucherCode).filter((code, index, all) => all.indexOf(code) !== index);
  if (duplicateVoucherCodes.length) throw new Error(`Mã phiếu bị trùng trong file: ${Array.from(new Set(duplicateVoucherCodes)).join(', ')}`);
  const invalidDateRows = rows.filter((row) => row.startDate && row.endDate && dateKey(row.startDate) > dateKey(row.endDate));
  if (invalidDateRows.length) throw new Error(`Ngày đi/ngày về không hợp lệ ở dòng: ${invalidDateRows.map((row) => row.index).join(', ')}`);
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = codeKey(row.tourCode);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        tourCode: row.tourCode,
        tourName: row.tourName,
        createdBy: row.createdBy,
        tourCreatedDate: row.tourCreatedDate,
        startDate: row.startDate || row.serviceDate || IMPORT_AS_OF,
        endDate: row.endDate || row.startDate || row.serviceDate || IMPORT_AS_OF,
        rows: [],
      });
    }
    const group = groups.get(groupKey);
    group.rows.push(row);
    if (!group.startDate || (row.startDate && dateKey(row.startDate) < dateKey(group.startDate))) group.startDate = row.startDate;
    if (!group.endDate || (row.endDate && dateKey(row.endDate) > dateKey(group.endDate))) group.endDate = row.endDate;
  }
  return Array.from(groups.values());
}

function rowNote(row) {
  return [
    `Nguồn: ${SOURCE_LABEL}`,
    `Mã phiếu TourKit: ${row.voucherCode}`,
    `Mã tour TourKit: ${row.tourCode}`,
    `Trạng thái gốc TourKit: ${row.rawStatus || '-'}`,
    `Tổng tiền chi TourKit: ${money(row.totalAmount)} VND`,
    `Đã thanh toán TourKit: ${money(row.paidAmount)} VND`,
    `Còn thiếu TourKit: ${money(row.remainAmount)} VND`,
    row.paymentRefs.length ? `Phiếu chi tương ứng: ${row.paymentRefs.map((item) => item.raw).join('; ')}` : null,
    row.continuations.length ? `Dòng dịch vụ phụ: ${row.continuations.map((item) => item.serviceName).join('; ')}` : null,
    `Import marker: ${IMPORT_MARKER}`,
  ].filter(Boolean).join('\n');
}

function formNote(group) {
  const totalAmount = group.rows.reduce((sum, row) => sum + row.totalAmount, 0);
  const paidAmount = group.rows.reduce((sum, row) => sum + row.paidAmount, 0);
  return [
    `Nguồn: ${SOURCE_LABEL}`,
    `Mã tour TourKit: ${group.tourCode}`,
    `Tên tour TourKit: ${group.tourName}`,
    `Số phiếu dịch vụ: ${group.rows.length}`,
    `Tổng tiền chi TourKit: ${money(totalAmount)} VND`,
    `Đã thanh toán TourKit: ${money(paidAmount)} VND`,
    `Import marker: ${IMPORT_MARKER}`,
  ].join('\n');
}

function preserveManualFormNotes(notes) {
  const value = text(notes);
  if (!value) return null;
  const markerIndex = value.indexOf(`Nguồn: ${SOURCE_LABEL}`);
  const preserved = markerIndex >= 0 ? value.slice(0, markerIndex).trim() : value;
  return preserved || null;
}

function bookingData(group, order, tourProgram, tour) {
  return {
    code: group.tourCode,
    tourProgramId: tourProgram.id,
    orderId: order?.id || null,
    tourId: tour?.id || null,
    customerId: order?.customerId || null,
    customerName: order?.customerName || `Khách điều hành TourKit - ${group.tourCode}`,
    customerPhone: order?.customerPhone || null,
    customerEmail: order?.customerEmail || null,
    paxCount: Math.max(1, Number(order?.quantity || order?.adultQty || 1)),
    startDate: group.startDate || order?.startDate || IMPORT_AS_OF,
    endDate: group.endDate || order?.endDate || group.startDate || IMPORT_AS_OF,
    saleOwner: order?.createdBy || group.createdBy,
    operatorOwner: order?.operatorOwner || group.createdBy,
    status: bookingStatusForGroup(group),
    totalSellPrice: order?.totalRevenue || 0,
    createdAt: group.tourCreatedDate || new Date(),
  };
}

function tourProgramData(group) {
  return {
    code: `TKOP-TP-${slugCode(group.tourCode)}`.slice(0, 80),
    name: group.tourName || group.tourCode,
    route: group.tourName || group.tourCode,
    durationDays: inclusiveDays(group.startDate || IMPORT_AS_OF, group.endDate || group.startDate || IMPORT_AS_OF),
    description: formNote(group),
  };
}

function supplierData(row, categoryId) {
  return {
    categoryId,
    supplierCode: row.supplierCode || `TKOP-SUP-${slugCode(row.supplierName)}`,
    name: row.supplierName,
    country: 'Việt Nam',
    market: 'TourKit',
    notes: `Tạo tự động khi import phiếu điều hành TourKit.\nNguồn: ${SOURCE_LABEL}\nImport marker: ${IMPORT_MARKER}`,
    status: 'ACTIVE',
    createdBy: IMPORT_MARKER,
    deletedAt: null,
  };
}

async function ensureTourProgram(tx, group) {
  const data = tourProgramData(group);
  const existing = await tx.tourProgram.findUnique({ where: { code: data.code }, select: { id: true } });
  const tourProgram = existing
    ? await tx.tourProgram.update({ where: { id: existing.id }, data, select: { id: true } })
    : await tx.tourProgram.create({ data, select: { id: true } });
  const existingDays = await tx.tourItineraryDay.count({ where: { tourProgramId: tourProgram.id } });
  if (!existingDays) {
    await tx.tourItineraryDay.createMany({
      data: Array.from({ length: data.durationDays }, (_, index) => ({
        tourProgramId: tourProgram.id,
        dayNumber: index + 1,
        title: `Ngày ${index + 1}: ${group.tourName || group.tourCode}`,
        description: index === 0 ? formNote(group) : `Ngày ${index + 1} của phiếu điều hành ${group.tourCode}`,
      })),
    });
  }
  return tourProgram;
}

async function resolveSupplier(tx, row, categoryId) {
  const supplierCode = text(row.supplierCode);
  if (supplierCode) {
    const byCode = await tx.supplier.findUnique({ where: { supplierCode }, select: { id: true, supplierCode: true, name: true } }).catch(() => null);
    if (byCode) return byCode;
  }
  const byName = await tx.supplier.findFirst({ where: { deletedAt: null, name: { equals: row.supplierName, mode: 'insensitive' } }, select: { id: true, supplierCode: true, name: true } });
  if (byName) return byName;
  return tx.supplier.create({ data: supplierData(row, categoryId), select: { id: true, supplierCode: true, name: true } });
}

function mapsByCode(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const code of row.codes) {
      const normalized = codeKey(code);
      if (normalized && !map.has(normalized)) map.set(normalized, row.value);
    }
  }
  return map;
}

async function loadLinkMaps(tx) {
  const [bookings, orders, tours] = await Promise.all([
    tx.booking.findMany({ select: { id: true, code: true, orderId: true, tourId: true, customerName: true, customerPhone: true, startDate: true, endDate: true } }),
    tx.order.findMany({ where: { deletedAt: null }, select: { id: true, systemCode: true, tourCode: true, name: true, customerId: true, customerName: true, customerPhone: true, customerEmail: true, quantity: true, adultQty: true, startDate: true, endDate: true, createdBy: true, operatorOwner: true, totalRevenue: true } }),
    tx.tour.findMany({ where: { deletedAt: null }, select: { id: true, systemCode: true, tourCode: true, orderId: true, name: true, startDate: true, endDate: true } }),
  ]);
  const bookingByCode = mapsByCode(bookings.map((booking) => ({ codes: [booking.code], value: booking })));
  const orderByCode = mapsByCode(orders.map((order) => ({ codes: [order.systemCode, order.tourCode], value: order })));
  const tourByCode = mapsByCode(tours.map((tour) => ({ codes: [tour.systemCode, tour.tourCode], value: tour })));
  const tourByOrder = new Map();
  for (const tour of tours) {
    if (tour.orderId && !tourByOrder.has(tour.orderId)) tourByOrder.set(tour.orderId, tour);
  }
  return { bookingByCode, orderByCode, tourByCode, tourByOrder };
}

async function ensureBookingForGroup(tx, group, maps) {
  const normalized = codeKey(group.tourCode);
  const existingBooking = maps.bookingByCode.get(normalized);
  const matchedOrder = orderForGroup(group, maps, existingBooking);
  const matchedTour = tourForGroup(group, maps, existingBooking, matchedOrder);
  if (existingBooking) {
    if ((!existingBooking.orderId && matchedOrder) || (!existingBooking.tourId && matchedTour)) {
      await tx.booking.update({
        where: { id: existingBooking.id },
        data: {
          ...(!existingBooking.orderId && matchedOrder ? { orderId: matchedOrder.id } : {}),
          ...(!existingBooking.tourId && matchedTour ? { tourId: matchedTour.id } : {}),
        },
      });
    }
    return { booking: existingBooking, order: matchedOrder, tour: matchedTour, created: false };
  }
  const tourProgram = await ensureTourProgram(tx, group);
  const booking = await tx.booking.create({
    data: bookingData(group, matchedOrder, tourProgram, matchedTour),
    select: { id: true, code: true, orderId: true, tourId: true, customerName: true, customerPhone: true, startDate: true, endDate: true },
  });
  maps.bookingByCode.set(normalized, booking);
  return { booking, order: matchedOrder, tour: matchedTour, created: true };
}

function orderForGroup(group, maps, booking) {
  if (booking?.orderId) {
    for (const order of maps.orderByCode.values()) if (order.id === booking.orderId) return order;
  }
  return maps.orderByCode.get(codeKey(group.tourCode)) || null;
}

function tourForGroup(group, maps, booking, order) {
  if (booking?.tourId) {
    for (const tour of maps.tourByCode.values()) if (tour.id === booking.tourId) return tour;
  }
  return maps.tourByCode.get(codeKey(group.tourCode)) || (order?.id ? maps.tourByOrder.get(order.id) : null) || null;
}

async function ensureOperationForm(tx, group, links) {
  const existing = await tx.operationForm.findUnique({ where: { bookingId: links.booking.id }, select: { id: true, notes: true } });
  const data = {
    bookingId: links.booking.id,
    orderId: links.order?.id || links.booking.orderId || null,
    tourId: links.tour?.id || links.booking.tourId || null,
    status: formStatus(group.rows),
    notes: [preserveManualFormNotes(existing?.notes), formNote(group)].filter(Boolean).join('\n\n'),
  };
  if (existing) {
    await tx.operationForm.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false };
  }
  const form = await tx.operationForm.create({ data, select: { id: true } });
  return { id: form.id, created: true };
}

async function deleteImportedFormChildren(tx, formId) {
  const importedCosts = await tx.operationCost.findMany({ where: { operationFormId: formId, notes: { contains: IMPORT_MARKER } }, select: { id: true } });
  const costIds = importedCosts.map((cost) => cost.id);
  if (costIds.length) await tx.supplierPaymentItem.deleteMany({ where: { costId: { in: costIds } } });
  await tx.operationCost.deleteMany({ where: { operationFormId: formId, notes: { contains: IMPORT_MARKER } } });
  await tx.operationService.deleteMany({ where: { operationFormId: formId, notes: { contains: IMPORT_MARKER } } });
  await tx.operationTask.deleteMany({ where: { operationFormId: formId, notes: { contains: IMPORT_MARKER } } });
}

async function createFormRows(tx, formId, group, supplierByVoucher) {
  let serviceCount = 0;
  let costCount = 0;
  for (const row of group.rows) {
    const supplier = supplierByVoucher.get(row.voucherCode);
    const type = serviceTypeFor(row);
    const notes = rowNote(row);
    const service = await tx.operationService.create({
      data: {
        operationFormId: formId,
        supplierId: supplier?.id || null,
        serviceType: type,
        serviceName: row.serviceName,
        confirmationStatus: voucherStatus(row) === 'PAID' ? 'COMPLETED' : row.paidAmount > 0 ? 'CONFIRMED' : 'WAITING',
        expectedCost: row.totalAmount,
        actualCost: row.totalAmount,
        notes,
      },
      select: { id: true },
    });
    serviceCount += 1;
    await tx.operationCost.create({
      data: {
        operationFormId: formId,
        serviceId: service.id,
        costName: `${row.voucherCode} - ${row.serviceName}`.slice(0, 240),
        expectedAmount: row.totalAmount,
        actualAmount: row.totalAmount,
        currency: 'VND',
        invoiceNo: row.voucherCode,
        notes,
      },
    });
    costCount += 1;
  }
  return { serviceCount, costCount };
}

async function upsertVoucher(tx, row, links, supplier) {
  const status = voucherStatus(row);
  const serviceDate = row.serviceDate || row.startDate || links.booking.startDate || IMPORT_AS_OF;
  const note = rowNote(row);
  const data = {
    tourId: links.tour?.id || links.booking.tourId || null,
    bookingId: links.booking.id,
    orderId: links.order?.id || links.booking.orderId || null,
    supplierId: supplier?.id || null,
    supplierName: row.supplierName,
    serviceType: serviceTypeFor(row),
    serviceName: row.serviceName,
    serviceDate,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    remainAmount: row.remainAmount,
    paymentDeadline: row.remainAmount > 0 ? serviceDate : null,
    status,
    note,
    createdBy: row.createdBy || IMPORT_MARKER,
    deletedAt: null,
  };
  const existing = await tx.operationVoucher.findUnique({ where: { voucherCode: row.voucherCode }, select: { id: true } });
  const voucher = existing
    ? await tx.operationVoucher.update({ where: { id: existing.id }, data: { voucherCode: row.voucherCode, ...data }, select: { id: true } })
    : await tx.operationVoucher.create({ data: { voucherCode: row.voucherCode, ...data }, select: { id: true } });
  await tx.operationVoucherDetail.deleteMany({ where: { voucherId: voucher.id } });
  await tx.operationVoucherDetail.create({
    data: {
      voucherId: voucher.id,
      sku: row.supplierCode || row.voucherCode,
      serviceName: row.serviceName,
      quantity: 1,
      unit: 'dịch vụ',
      netPrice: row.totalAmount,
      vat: 0,
      amount: row.totalAmount,
      note,
      sortOrder: 0,
    },
  });
  return { created: !existing };
}

async function dryRunSummary(rows, groups) {
  const maps = await loadLinkMaps(prisma);
  const existingVouchers = await prisma.operationVoucher.findMany({ where: { voucherCode: { in: rows.map((row) => row.voucherCode) } }, select: { voucherCode: true } });
  const voucherSet = new Set(existingVouchers.map((item) => item.voucherCode));
  let matchedBookings = 0;
  let orderOnly = 0;
  let missingLinks = 0;
  for (const group of groups) {
    const booking = maps.bookingByCode.get(codeKey(group.tourCode));
    if (booking) matchedBookings += 1;
    else if (maps.orderByCode.get(codeKey(group.tourCode))) orderOnly += 1;
    else missingLinks += 1;
  }
  return {
    matchedBookings,
    orderOnlyWouldCreateBookings: orderOnly,
    missingLinks,
    existingVouchers: existingVouchers.length,
    newVouchers: rows.length - rows.filter((row) => voucherSet.has(row.voucherCode)).length,
  };
}

async function main() {
  const file = arg('--file') || process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file) throw new Error('Cần truyền --file=/path/to/tourkit-operation-forms.json');
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  const normalized = normalizeRows(payload);
  const rows = normalized.rows;
  assertRows(rows);
  const groups = groupRows(rows);
  const statusCounts = rows.reduce((acc, row) => {
    const status = voucherStatus(row);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const summary = {
    sourceFile: payload.sourceFile || file,
    sheet: payload.sheet,
    rowCount: rows.length,
    continuationRows: normalized.continuationCount,
    groupCount: groups.length,
    voucherStatusCounts: statusCounts,
    dryRun,
    ...(await dryRunSummary(rows, groups)),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) return;

  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.supplierCategory.upsert({ where: { name: DEFAULT_CATEGORY }, update: {}, create: { name: DEFAULT_CATEGORY } });
    const maps = await loadLinkMaps(tx);
    let createdBookings = 0;
    let createdForms = 0;
    let updatedForms = 0;
    let createdServices = 0;
    let createdCosts = 0;
    let createdVouchers = 0;
    let updatedVouchers = 0;
    const supplierByVoucher = new Map();
    for (const row of rows) {
      supplierByVoucher.set(row.voucherCode, await resolveSupplier(tx, row, category.id));
    }
    const linksByGroup = new Map();
    for (const group of groups) {
      const links = await ensureBookingForGroup(tx, group, maps);
      if (links.created) createdBookings += 1;
      linksByGroup.set(group.key, links);
      const form = await ensureOperationForm(tx, group, links);
      if (form.created) createdForms += 1;
      else updatedForms += 1;
      await deleteImportedFormChildren(tx, form.id);
      const childCounts = await createFormRows(tx, form.id, group, supplierByVoucher);
      createdServices += childCounts.serviceCount;
      createdCosts += childCounts.costCount;
    }
    for (const row of rows) {
      const links = linksByGroup.get(codeKey(row.tourCode));
      const supplier = supplierByVoucher.get(row.voucherCode);
      const voucher = await upsertVoucher(tx, row, links, supplier);
      if (voucher.created) createdVouchers += 1;
      else updatedVouchers += 1;
    }
    await tx.auditLog.create({
      data: {
        action: 'IMPORT',
        entity: 'OperationForm',
        metadata: {
          marker: IMPORT_MARKER,
          source: SOURCE_LABEL,
          rowCount: rows.length,
          continuationRows: normalized.continuationCount,
          groupCount: groups.length,
          createdBookings,
          createdForms,
          updatedForms,
          createdServices,
          createdCosts,
          createdVouchers,
          updatedVouchers,
        },
      },
    });
    return { createdBookings, createdForms, updatedForms, createdServices, createdCosts, createdVouchers, updatedVouchers };
  }, { timeout: 120_000 });

  const [operationForms, operationServices, operationCosts, operationVouchers] = await Promise.all([
    prisma.operationForm.count(),
    prisma.operationService.count({ where: { notes: { contains: IMPORT_MARKER } } }),
    prisma.operationCost.count({ where: { notes: { contains: IMPORT_MARKER } } }),
    prisma.operationVoucher.count({ where: { note: { contains: IMPORT_MARKER }, deletedAt: null } }),
  ]);
  console.log(JSON.stringify({ ...result, operationForms, importedOperationServices: operationServices, importedOperationCosts: operationCosts, importedOperationVouchers: operationVouchers }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
