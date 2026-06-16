#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SOURCE_LABEL = 'TourKit order export 16/06/2026';
const IMPORT_MARKER = 'TOURKIT_ORDER_IMPORT_2026_06_16';

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

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value));
}

function orderType(value) {
  const normalized = key(value);
  if (/booking phong|hotel|khach san/.test(normalized)) return 'HOTEL_BOOKING';
  if (/git/.test(normalized)) return 'GIT_COMBO';
  if (/landtour|combo/.test(normalized)) return 'LANDTOUR';
  if (/flight|may bay/.test(normalized)) return 'FLIGHT_ORDER';
  return 'SINGLE_SERVICE';
}

function orderStatus(value) {
  const normalized = key(value);
  if (/huy/.test(normalized)) return 'CANCELLED';
  if (/hoan thanh/.test(normalized)) return 'COMPLETED';
  if (/dang booking|draft/.test(normalized)) return 'DRAFT';
  if (/dang chay|running/.test(normalized)) return 'RUNNING';
  if (/tat toan|settled/.test(normalized)) return 'SETTLED';
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

function tourType(row) {
  if (row.type === 'GIT_COMBO') return 'GIT';
  if (row.type === 'LANDTOUR') return 'LANDTOUR';
  return 'FIT';
}

function tourServiceStatus(row) {
  if (row.status === 'CANCELLED') return 'CANCELLED';
  if (row.status === 'COMPLETED' || row.status === 'SETTLED') return 'COMPLETED';
  if (row.status === 'RUNNING') return 'OPERATING';
  return 'WAITING';
}

function tourOperationStatus(row) {
  if (row.status === 'CANCELLED') return 'CANCELLED';
  if (row.status === 'COMPLETED' || row.status === 'SETTLED') return 'DONE';
  if (row.status === 'RUNNING') return 'IN_PROGRESS';
  return 'PENDING';
}

function tourCostPaymentStatus(row) {
  const status = costStatus(row.totalCost, row.paidCost);
  if (status === 'PAID') return 'PAID';
  if (status === 'PARTIAL') return 'PARTIAL';
  return 'UNPAID';
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  return rows
    .map((row, index) => {
      const systemCode = text(rowValue(row, 'Mã hệ thống'));
      const totalRevenue = numberValue(rowValue(row, 'Tổng thu'));
      const paidAmount = numberValue(rowValue(row, 'Thực thu'));
      const totalCost = numberValue(rowValue(row, 'Tổng chi'));
      const paidCost = numberValue(rowValue(row, 'Thực chi'));
      const sourceDebt = numberValue(rowValue(row, 'Còn nợ'));
      return {
        index: index + 1,
        systemCode,
        tourCode: nullableText(rowValue(row, 'Mã Tour')),
        bookingDate: parseDate(rowValue(row, 'Ngày đặt Tour (Ngày tạo đơn)')),
        name: text(rowValue(row, 'Lịch trình')),
        customerName: text(rowValue(row, 'Tên KH')),
        marketType: nullableText(rowValue(row, 'Loại hình')),
        rawTourType: nullableText(rowValue(row, 'Loại Tour')),
        type: orderType(rowValue(row, 'Loại Tour')),
        marketGroup: nullableText(rowValue(row, 'Nhóm/Thị trường')),
        customerPhone: digits(rowValue(row, 'SĐT')),
        customerEmail: nullableText(rowValue(row, 'Email')),
        startDate: parseDate(rowValue(row, 'Ngày check in')),
        endDate: parseDate(rowValue(row, 'Ngày check Out')),
        adultQty: numberValue(rowValue(row, 'Người lớn')),
        childQty: numberValue(rowValue(row, 'Trẻ em')),
        infantQty: numberValue(rowValue(row, 'Trẻ nhỏ')),
        note: nullableText(rowValue(row, 'Ghi chú')),
        totalRevenue,
        paidAmount,
        remainingRevenue: Math.max(0, totalRevenue - paidAmount),
        totalCost,
        paidCost,
        remainingCost: Math.max(0, totalCost - paidCost),
        profit: totalRevenue - totalCost,
        sourceProfit: numberValue(rowValue(row, 'Lợi nhuận')),
        sourceDebt,
        createdBy: nullableText(rowValue(row, 'Người tạo')),
        branch: nullableText(rowValue(row, 'Chi nhánh')),
        department: nullableText(rowValue(row, 'Phòng ban')),
        group: nullableText(rowValue(row, 'Nhóm')),
        collaborator: nullableText(rowValue(row, 'CTV')),
        operatorOwner: nullableText(rowValue(row, 'Nhân viên Điều hành')),
        rawStatus: nullableText(rowValue(row, 'Trạng thái')),
        status: orderStatus(rowValue(row, 'Trạng thái')),
      };
    })
    .filter((row) => row.systemCode && row.name && row.customerName && row.customerPhone);
}

function orderNote(row) {
  return [
    row.note,
    `Nguồn: ${SOURCE_LABEL}`,
    `Loại hình gốc: ${row.marketType || '-'}`,
    `Loại Tour gốc: ${row.rawTourType || '-'}`,
    `Trạng thái gốc: ${row.rawStatus || '-'}`,
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
    type: row.type,
    systemCode: row.systemCode,
    customerId: customer?.id || null,
    tourCode: row.tourCode,
    name: row.name,
    route: row.name,
    marketGroup: row.marketGroup,
    bookingDate: row.bookingDate,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    paymentStatus: paymentStatus(row.totalRevenue, row.paidAmount),
    costStatus: costStatus(row.totalCost, row.paidCost),
    createdBy: row.createdBy || IMPORT_MARKER,
    createdDate: row.bookingDate,
    branch: row.branch,
    department: row.department,
    customerName: row.customerName,
    customerType: row.rawTourType,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    collaborator: row.collaborator,
    operatorOwner: row.operatorOwner,
    adultQty: row.adultQty,
    childQty: row.childQty,
    infantQty: row.infantQty,
    quantity: Math.max(1, row.adultQty + row.childQty + row.infantQty),
    totalRevenue: row.totalRevenue,
    paidAmount: row.paidAmount,
    remainingRevenue: row.remainingRevenue,
    totalCost: row.totalCost,
    paidCost: row.paidCost,
    remainingCost: row.remainingCost,
    profit: row.profit,
    note: orderNote(row),
    deletedAt: null,
    ...(row.status === 'SETTLED' ? { settledAt: new Date() } : { settledAt: null }),
  };
}

function salesItem(row) {
  return {
    serviceType: row.rawTourType || row.type,
    description: row.name,
    quantity: 1,
    serviceCount: 1,
    unitPrice: row.totalRevenue,
    vat: 0,
    amount: row.totalRevenue,
    note: `Doanh thu tổng import từ TourKit. ${IMPORT_MARKER}`,
    sortOrder: 1,
  };
}

function operationItem(row) {
  return {
    serviceType: row.rawTourType || row.type,
    bookingCode: row.systemCode,
    serviceDate: row.startDate,
    quantity: 1,
    netPrice: row.totalCost,
    vat: 0,
    amount: row.totalCost,
    status: row.status === 'CANCELLED' ? 'CANCELLED' : row.status === 'COMPLETED' || row.status === 'SETTLED' ? 'COMPLETED' : 'WAITING',
    note: `Chi phí tổng import từ TourKit. ${IMPORT_MARKER}`,
    sortOrder: 1,
  };
}

function tourData(row, order) {
  return {
    type: tourType(row),
    status: row.status,
    paymentStatus: paymentStatus(row.totalRevenue, row.paidAmount),
    systemCode: row.systemCode,
    orderId: order.id,
    tourCode: row.tourCode || row.systemCode,
    name: row.name,
    marketGroup: row.marketGroup,
    productType: row.rawTourType || row.type,
    bookingDate: row.bookingDate,
    startDate: row.startDate,
    endDate: row.endDate,
    createdBy: row.createdBy || IMPORT_MARKER,
    operatorOwner: row.operatorOwner,
    branch: row.branch,
    department: row.department,
    customerSource: SOURCE_LABEL,
    route: row.name,
    notes: orderNote(row),
    deletedAt: null,
    ...(row.status === 'SETTLED' ? { closedAt: new Date(), closedBy: row.operatorOwner || row.createdBy || IMPORT_MARKER } : { closedAt: null, closedBy: null }),
  };
}

function tourCustomerData(row, tourId, customer) {
  return {
    tourId,
    crmCustomerId: customer?.id || null,
    customerType: 'CUSTOMER',
    name: row.customerName,
    phone: row.customerPhone,
    email: row.customerEmail,
    groupName: row.marketGroup,
    isPrimary: true,
    notes: `Imported from ${SOURCE_LABEL}. ${IMPORT_MARKER}`,
  };
}

function tourRevenueData(row, tourId, customerId) {
  return {
    tourId,
    customerId,
    description: row.name,
    quantity: Math.max(1, row.adultQty + row.childQty + row.infantQty),
    unitPrice: row.totalRevenue,
    currency: 'VND',
    exchangeRate: 1,
    vat: 0,
    amount: row.totalRevenue,
    paymentStatus: paymentStatus(row.totalRevenue, row.paidAmount),
    notes: `Imported total revenue from ${SOURCE_LABEL}. ${IMPORT_MARKER}`,
  };
}

function tourServiceData(row, tourId) {
  return {
    tourId,
    serviceType: row.rawTourType || row.type,
    serviceDate: row.startDate,
    description: row.name,
    quantity: 1,
    unit: 'tour',
    currency: 'VND',
    exchangeRate: 1,
    salesUnitPrice: row.totalRevenue,
    budgetUnitPrice: row.totalCost,
    confirmedUnitPrice: row.totalCost,
    vat: 0,
    salesAmount: row.totalRevenue,
    budgetAmount: row.totalCost,
    confirmedAmount: row.totalCost,
    confirmationStatus: tourServiceStatus(row),
    bookingCode: row.systemCode,
    notes: `Imported service summary from ${SOURCE_LABEL}. ${IMPORT_MARKER}`,
  };
}

function tourCostData(row, tourId, serviceId) {
  return {
    tourId,
    serviceId,
    costType: row.rawTourType || row.type,
    description: row.name,
    expectedAmount: row.totalCost,
    actualAmount: row.totalCost,
    currency: 'VND',
    exchangeRate: 1,
    vat: 0,
    paymentStatus: tourCostPaymentStatus(row),
    notes: `Imported total cost from ${SOURCE_LABEL}. ${IMPORT_MARKER}`,
  };
}

function tourOperationData(row, tourId) {
  return {
    tourId,
    title: `Dieu hanh ${row.tourCode || row.systemCode}`,
    assignee: row.operatorOwner,
    dueDate: row.startDate,
    status: tourOperationStatus(row),
    priority: 'NORMAL',
    notes: `Imported operation summary from ${SOURCE_LABEL}. ${IMPORT_MARKER}`,
  };
}

async function upsertImportedTourCustomer(tx, row, tourId, customer) {
  const data = tourCustomerData(row, tourId, customer);
  const existing = await tx.tourCustomer.findFirst({
    where: { tourId, notes: { contains: IMPORT_MARKER } },
    select: { id: true },
  });
  if (existing) return tx.tourCustomer.update({ where: { id: existing.id }, data });
  return tx.tourCustomer.create({ data });
}

async function upsertImportedTourRevenue(tx, row, tourId, customerId) {
  if (row.totalRevenue <= 0) return null;
  const data = tourRevenueData(row, tourId, customerId);
  const existing = await tx.tourRevenue.findFirst({
    where: { tourId, notes: { contains: IMPORT_MARKER } },
    select: { id: true },
  });
  if (existing) return tx.tourRevenue.update({ where: { id: existing.id }, data });
  return tx.tourRevenue.create({ data });
}

async function upsertImportedTourService(tx, row, tourId) {
  if (row.totalRevenue <= 0 && row.totalCost <= 0) return null;
  const data = tourServiceData(row, tourId);
  const existing = await tx.tourService.findFirst({
    where: { tourId, notes: { contains: IMPORT_MARKER } },
    select: { id: true },
  });
  if (existing) return tx.tourService.update({ where: { id: existing.id }, data });
  return tx.tourService.create({ data });
}

async function upsertImportedTourCost(tx, row, tourId, serviceId) {
  if (row.totalCost <= 0) return null;
  const data = tourCostData(row, tourId, serviceId);
  const existing = await tx.tourCost.findFirst({
    where: { tourId, notes: { contains: IMPORT_MARKER } },
    select: { id: true },
  });
  if (existing) return tx.tourCost.update({ where: { id: existing.id }, data });
  return tx.tourCost.create({ data });
}

async function upsertImportedTourOperation(tx, row, tourId) {
  const data = tourOperationData(row, tourId);
  const existing = await tx.tourOperation.findFirst({
    where: { tourId, notes: { contains: IMPORT_MARKER } },
    select: { id: true },
  });
  if (existing) return tx.tourOperation.update({ where: { id: existing.id }, data });
  return tx.tourOperation.create({ data });
}

async function linkOrderChildrenToTour(tx, orderId, tourId) {
  await tx.booking.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.operationForm.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.operationVoucher.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.financePayment.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.financeInvoice.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.financeCashflowEntry.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.customerLedgerEntry.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.supplierLedgerEntry.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.supplierAllotmentAllocation.updateMany({ where: { orderId, tourId: null }, data: { tourId } });
  await tx.guideSchedule.updateMany({ where: { orderId, tourId: null }, data: { tourId } });

  const receiptLinks = await tx.financeReceiptOrder.findMany({
    where: { orderId },
    select: { receiptId: true },
  });
  const receiptIds = Array.from(new Set(receiptLinks.map((item) => item.receiptId).filter(Boolean)));
  if (receiptIds.length) {
    await tx.financeReceipt.updateMany({ where: { id: { in: receiptIds }, tourId: null }, data: { tourId } });
  }
}

async function findExistingTour(tx, orderId, systemCode) {
  const byOrder = await tx.tour.findFirst({ where: { orderId }, select: { id: true } });
  if (byOrder) return byOrder;
  return tx.tour.findUnique({ where: { systemCode }, select: { id: true } });
}

async function ensureTour(tx, row, order, customer) {
  const existing = await findExistingTour(tx, order.id, row.systemCode);
  const data = tourData(row, order);
  const tour = existing
    ? await tx.tour.update({ where: { id: existing.id }, data, select: { id: true } })
    : await tx.tour.create({ data, select: { id: true } });

  const tourCustomer = await upsertImportedTourCustomer(tx, row, tour.id, customer);
  await upsertImportedTourRevenue(tx, row, tour.id, tourCustomer.id);
  const tourService = await upsertImportedTourService(tx, row, tour.id);
  await upsertImportedTourCost(tx, row, tour.id, tourService?.id || null);
  await upsertImportedTourOperation(tx, row, tour.id);
  await linkOrderChildrenToTour(tx, order.id, tour.id);
  await tx.tourLog.create({
    data: {
      tourId: tour.id,
      action: existing ? 'TOURKIT_ORDER_IMPORT_UPDATE_TOUR' : 'TOURKIT_ORDER_IMPORT_CREATE_TOUR',
      entity: 'Order',
      entityId: order.id,
      metadata: { marker: IMPORT_MARKER, source: SOURCE_LABEL, row: row.index, systemCode: row.systemCode },
    },
  });
  return { id: tour.id, created: !existing };
}

async function ensureCustomer(tx, row) {
  const existing = await tx.customer.findUnique({ where: { phone: row.customerPhone }, select: { id: true } });
  if (existing) return existing;
  return tx.customer.create({
    data: {
      code: `TKCUS-ORDER-20260616-${String(row.index).padStart(4, '0')}`,
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
      latestComment: `Tạo tự động khi import đơn hàng TourKit. Import marker: ${IMPORT_MARKER}`,
      timeline: {
        create: [{
          eventType: 'TOURKIT_ORDER_IMPORT_CREATE_CUSTOMER',
          title: 'Tạo khách hàng từ import đơn hàng TourKit',
          actor: IMPORT_MARKER,
          content: `Nguồn: ${SOURCE_LABEL}`,
          metadata: { marker: IMPORT_MARKER, source: SOURCE_LABEL, orderCode: row.systemCode },
        }],
      },
    },
    select: { id: true },
  });
}

async function main() {
  const file = arg('--file') || process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  const syncToursOnly = process.argv.includes('--sync-tours-only');
  if (!file) throw new Error('Cần truyền --file=/path/to/tourkit-orders.json');
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
  const rows = normalizeRows(payload);
  const duplicateCodes = rows.map((row) => row.systemCode).filter((code, index, all) => all.indexOf(code) !== index);
  if (duplicateCodes.length) throw new Error(`Mã hệ thống bị trùng trong file: ${Array.from(new Set(duplicateCodes)).join(', ')}`);
  const importCodes = rows.map((row) => row.systemCode);
  const activeObsolete = syncToursOnly
    ? []
    : await prisma.order.findMany({
      where: { deletedAt: null, systemCode: { notIn: importCodes } },
      select: { id: true, systemCode: true, name: true, type: true, status: true },
    });
  const existingOrderCodes = await prisma.order.findMany({
    where: { systemCode: { in: importCodes } },
    select: { systemCode: true },
  });
  const existingOrderCodeSet = new Set(existingOrderCodes.map((order) => order.systemCode));
  const missingOrdersForTourSync = syncToursOnly
    ? rows.filter((row) => !existingOrderCodeSet.has(row.systemCode)).map((row) => ({ row: row.index, systemCode: row.systemCode }))
    : [];
  const missingCustomers = [];
  for (const row of rows) {
    const found = await prisma.customer.findUnique({ where: { phone: row.customerPhone }, select: { id: true } });
    if (!found) missingCustomers.push({ row: row.index, phone: row.customerPhone, customerName: row.customerName });
  }
  console.log(JSON.stringify({
    sourceFile: payload.sourceFile,
    rowCount: rows.length,
    typeCounts: rows.reduce((acc, row) => ({ ...acc, [row.type]: (acc[row.type] || 0) + 1 }), {}),
    statusCounts: rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {}),
    activeObsoleteCount: activeObsolete.length,
    activeObsoleteSample: activeObsolete.slice(0, 10),
    missingOrdersForTourSync,
    missingCustomers,
    dryRun,
    syncToursOnly,
  }, null, 2));
  if (dryRun) return;

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    if (activeObsolete.length) {
      await tx.order.updateMany({
        where: { id: { in: activeObsolete.map((order) => order.id) } },
        data: { deletedAt: now, status: 'CANCELLED' },
      });
    }

    let created = 0;
    let updated = 0;
    let createdTours = 0;
    let updatedTours = 0;
    let createdCustomers = 0;
    let missingOrders = 0;
    for (const row of rows) {
      const customerBefore = await tx.customer.findUnique({ where: { phone: row.customerPhone }, select: { id: true } });
      const customer = customerBefore || await ensureCustomer(tx, row);
      if (!customerBefore) createdCustomers += 1;
      const existing = await tx.order.findUnique({ where: { systemCode: row.systemCode }, select: { id: true } });
      if (syncToursOnly) {
        if (!existing) {
          missingOrders += 1;
          continue;
        }
        const tour = await ensureTour(tx, row, existing, customer);
        if (tour.created) createdTours += 1;
        else updatedTours += 1;
        continue;
      }
      if (existing) {
        await Promise.all([
          tx.orderSalesItem.deleteMany({ where: { orderId: existing.id } }),
          tx.orderOperationItem.deleteMany({ where: { orderId: existing.id } }),
          tx.orderLog.deleteMany({ where: { orderId: existing.id, action: { in: ['TOURKIT_IMPORT_CREATE', 'TOURKIT_IMPORT_UPDATE'] } } }),
        ]);
        const order = await tx.order.update({ where: { id: existing.id }, data: orderData(row, customer), select: { id: true } });
        await tx.orderSalesItem.create({ data: { ...salesItem(row), orderId: order.id } });
        await tx.orderOperationItem.create({ data: { ...operationItem(row), orderId: order.id } });
        await tx.orderLog.create({ data: { orderId: order.id, action: 'TOURKIT_IMPORT_UPDATE', newValue: { marker: IMPORT_MARKER, source: SOURCE_LABEL, row: row.index } } });
        const tour = await ensureTour(tx, row, order, customer);
        if (tour.created) createdTours += 1;
        else updatedTours += 1;
        updated += 1;
      } else {
        const order = await tx.order.create({
          data: {
            ...orderData(row, customer),
            salesItems: { create: [salesItem(row)] },
            operationItems: { create: [operationItem(row)] },
            logs: { create: [{ action: 'TOURKIT_IMPORT_CREATE', newValue: { marker: IMPORT_MARKER, source: SOURCE_LABEL, row: row.index } }] },
          },
          select: { id: true },
        });
        if (!order.id) throw new Error(`Không tạo được đơn ${row.systemCode}`);
        const tour = await ensureTour(tx, row, order, customer);
        if (tour.created) createdTours += 1;
        else updatedTours += 1;
        created += 1;
      }
    }
    return { softDeletedActiveObsolete: activeObsolete.length, created, updated, createdCustomers, createdTours, updatedTours, missingOrders };
  }, { timeout: 60_000 });

  const activeCount = await prisma.order.count({ where: { deletedAt: null } });
  const activeByType = await prisma.order.groupBy({ by: ['type'], where: { deletedAt: null }, _count: { _all: true }, orderBy: { type: 'asc' } });
  const activeByStatus = await prisma.order.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true }, orderBy: { status: 'asc' } });
  console.log(JSON.stringify({
    ...result,
    activeCount,
    activeByType: activeByType.map((row) => ({ type: row.type, count: row._count._all })),
    activeByStatus: activeByStatus.map((row) => ({ status: row.status, count: row._count._all })),
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
