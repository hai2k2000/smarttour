#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_list_perf_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
PERF_ROWS="${PERF_ROWS:-300}"
PERF_MAX_MS="${PERF_MAX_MS:-5000}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_LIST_PERF_TEST missing POSTGRES_PASSWORD"
  exit 1
fi

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

cleanup() {
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  -e PERF_ROWS="$PERF_ROWS" \
  -e PERF_MAX_MS="$PERF_MAX_MS" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { OrdersService } = require('./apps/api/dist/modules/orders/orders.service');
const { BookingsService } = require('./apps/api/dist/modules/bookings/bookings.service');
const { OperationVouchersService } = require('./apps/api/dist/modules/operation-vouchers/operation-vouchers.service');
const { FinanceService } = require('./apps/api/dist/modules/finance/finance.service');
const { CommissionReportsService } = require('./apps/api/dist/modules/commission-reports/commission-reports.service');
const { CustomersService } = require('./apps/api/dist/modules/customers/customers.service');
const { ToursService } = require('./apps/api/dist/modules/tours/tours.service');
const { TourCoreService } = require('./apps/api/dist/modules/tours/tour-core.service');
const { TourProgramsService } = require('./apps/api/dist/modules/tour-programs/tour-programs.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function timed(label, action, maxMs) {
  const start = process.hrtime.bigint();
  const result = await action();
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
  console.log(`LIST_PERF ${label} rows=${Array.isArray(result) ? result.length : result.rows?.length ?? 'n/a'} ms=${elapsedMs.toFixed(1)}`);
  assert(elapsedMs <= maxMs, `${label} exceeded ${maxMs}ms`);
  return result;
}

async function rejects(action, label) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const rows = Number(process.env.PERF_ROWS || 300);
  const maxMs = Number(process.env.PERF_MAX_MS || 5000);
  const run = 'LIST-PERF-' + Date.now();

  const customer = await prisma.customer.create({
    data: { code: run + '-CUS', fullName: 'List Perf Customer', phone: '098' + String(Date.now()).slice(-7), branch: 'PERF-BR', department: 'PERF-DEP' },
  });
  const tourProgram = await prisma.tourProgram.create({
    data: { code: run + '-TP', name: 'List Perf Program', route: 'Ha Noi - Ha Long', durationDays: 3 },
  });
  await prisma.customer.createMany({
    data: Array.from({ length: rows }, (_, index) => ({
      code: `${run}-CUS-${index}`,
      fullName: `List Perf Customer ${index}`,
      phone: `097${String(Date.now()).slice(-4)}${String(index).padStart(4, '0')}`,
      email: `${run.toLowerCase()}-${index}@smarttour.local`,
      branch: 'PERF-BR',
      department: 'PERF-DEP',
      owner: 'sales-a',
    })),
  });
  await prisma.tourProgram.createMany({
    data: Array.from({ length: rows }, (_, index) => ({
      code: `${run}-TP-${index}`,
      name: `List Perf Program ${index}`,
      route: 'Ha Noi - Ha Long',
      durationDays: 3,
      description: 'Perf program list row',
    })),
  });
  const supplierCategory = await prisma.supplierCategory.create({ data: { name: run + '-SUP-CAT' } });
  const supplier = await prisma.supplier.create({
    data: { categoryId: supplierCategory.id, supplierCode: run + '-SUP', name: 'List Perf Supplier', status: 'ACTIVE' },
  });

  const orders = await Promise.all(Array.from({ length: rows }, (_, index) => prisma.order.create({
    data: {
      type: 'FIT_TOUR',
      systemCode: `${run}-ORD-${index}`,
      tourCode: `${run}-TOUR-${index}`,
      name: `Perf Order ${index}`,
      customerId: customer.id,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-03'),
      totalRevenue: 1000 + index,
      totalCost: 700 + index,
      profit: 300,
      branch: 'PERF-BR',
      department: 'PERF-DEP',
      salesItems: { create: { serviceType: 'HOTEL', description: 'Hotel', quantity: 1, unitPrice: 100, amount: 100 } },
      operationItems: { create: { serviceType: 'HOTEL', quantity: 1, netPrice: 80, amount: 80 } },
      members: { create: { fullName: `Guest ${index}` } },
    },
  })));

  await prisma.tour.createMany({
    data: orders.map((order, index) => ({
      type: 'FIT',
      systemCode: `${run}-TOUR-SYS-${index}`,
      orderId: order.id,
      tourCode: `${run}-T-${index}`,
      name: `Perf Tour ${index}`,
      status: 'UPCOMING',
      branch: 'PERF-BR',
      department: 'PERF-DEP',
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-03'),
    })),
  });

  await prisma.booking.createMany({
    data: orders.map((order, index) => ({
      code: `${run}-BOOK-${index}`,
      tourProgramId: tourProgram.id,
      customerId: customer.id,
      orderId: order.id,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      paxCount: 2,
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-03'),
      totalSellPrice: 1000 + index,
      status: 'CONFIRMED',
    })),
  });

  const vouchers = await Promise.all(orders.map((order, index) => prisma.operationVoucher.create({
    data: {
      voucherCode: `${run}-VCH-${index}`,
      orderId: order.id,
      supplierId: supplier.id,
      supplierName: supplier.name,
      serviceType: 'HOTEL',
      serviceName: `Hotel voucher ${index}`,
      serviceDate: new Date('2027-01-02'),
      totalAmount: 100,
      remainAmount: 100,
      status: 'PENDING',
    },
  })));

  await prisma.financeInvoice.createMany({
    data: orders.map((order, index) => ({
      invoiceCode: `${run}-INV-${index}`,
      orderId: order.id,
      customerId: customer.id,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      invoiceType: 'VAT',
      issuedDate: new Date('2027-01-04'),
      totalBeforeTax: 100,
      totalTax: 10,
      totalAfterTax: 110,
    })),
  });

  const receipts = await Promise.all(orders.map((order, index) => prisma.financeReceipt.create({
    data: {
      receiptCode: `${run}-REC-${index}`,
      receiptName: `Perf Receipt ${index}`,
      receiptType: index % 5 === 0 ? 'DEPOSIT' : 'TOUR_PAYMENT',
      paymentDate: new Date('2027-01-05'),
      paymentMethod: 'BANK_TRANSFER',
      customerId: customer.id,
      payerName: customer.fullName,
      payerPhone: customer.phone,
      totalAmount: 100 + index,
      paidBefore: 0,
      receiptAmount: 100 + index,
      remainingAmount: 0,
      approvalStatus: index % 3 === 0 ? 'APPROVED' : 'DRAFT',
      branch: 'PERF-BR',
      department: 'PERF-DEP',
      assignedStaff: 'sales-a',
      orders: {
        create: {
          orderId: order.id,
          orderCode: order.systemCode,
          tourCode: order.tourCode,
          tourName: order.name,
          amount: 100 + index,
        },
      },
    },
  })));

  const payments = await Promise.all(orders.map((order, index) => prisma.financePayment.create({
    data: {
      voucherCode: `${run}-PAY-${index}`,
      voucherName: `Perf Payment ${index}`,
      voucherType: 'SUPPLIER_PAYMENT',
      paymentDate: new Date('2027-01-06'),
      paymentMethod: 'BANK_TRANSFER',
      supplierId: supplier.id,
      operationVoucherId: vouchers[index].id,
      orderId: order.id,
      receiverName: supplier.name,
      totalAmount: 80 + index,
      paymentAmount: 80 + index,
      remainingAmount: 0,
      approvalStatus: index % 4 === 0 ? 'APPROVED' : 'DRAFT',
      branch: 'PERF-BR',
      department: 'PERF-DEP',
      assignedStaff: 'ops-a',
    },
  })));

  await prisma.supplierPaymentRequest.createMany({
    data: payments.map((payment, index) => ({
      code: `${run}-SPR-${index}`,
      status: 'REQUESTED',
      financePaymentId: payment.id,
      requestedBy: 'ops-a',
    })),
  });

  await prisma.financeCashflowEntry.createMany({
    data: receipts.map((receipt, index) => ({
      sourceType: 'FINANCE_RECEIPT',
      sourceId: receipt.id,
      receiptId: receipt.id,
      entryType: 'RECEIPT',
      amount: 100 + index,
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: new Date('2027-01-05'),
      branch: 'PERF-BR',
      department: 'PERF-DEP',
      staff: 'sales-a',
      orderId: orders[index].id,
      customerId: customer.id,
      note: `Perf receipt cashflow ${index}`,
    })),
  });

  await prisma.commissionEntry.createMany({
    data: orders.map((order, index) => ({
      orderId: order.id,
      orderCode: order.systemCode,
      orderType: order.type,
      tourCode: order.tourCode,
      customerName: order.customerName,
      salesOwner: 'sales-a',
      department: order.department,
      branch: order.branch,
      revenue: order.totalRevenue,
      profit: order.profit,
      commissionAmount: 30,
      remainingAmount: 30,
      milestoneDate: new Date('2027-01-01'),
      note: `Perf commission ${index}`,
    })),
  });

  const ordersService = new OrdersService(prisma);
  const bookingsService = new BookingsService(prisma);
  const vouchersService = new OperationVouchersService(prisma);
  const financeService = new FinanceService(prisma, {});
  const commissionService = new CommissionReportsService(prisma);
  const customersService = new CustomersService(prisma, {});
  const tourCore = new TourCoreService(prisma);
  const toursService = new ToursService(prisma, tourCore);
  const tourProgramsService = new TourProgramsService(prisma);

  const orderRows = await timed('orders.list', () => ordersService.list('fit-tours', run), maxMs);
  assert(orderRows[0]._count && !orderRows[0].salesItems, 'orders list should not include child arrays');
  const shortSearchRows = await timed('orders.list short search ignored', () => ordersService.list('fit-tours', 'L'), maxMs);
  assert(shortSearchRows.length === rows, 'one-character list search should not add broad contains filters');
  const trimmedSearchRows = await timed('orders.list trimmed search', () => ordersService.list('fit-tours', `  ${run}-ORD-1  `), maxMs);
  assert(trimmedSearchRows.length > 0 && trimmedSearchRows.every((row) => row.systemCode.includes(`${run}-ORD-1`)), 'list search should trim leading and trailing whitespace');
  await rejects(() => ordersService.list('fit-tours', 'x'.repeat(81)), 'overlong list search should be rejected');

  const customerResult = await timed('customers.list', () => customersService.list({ search: run, take: String(rows) }), maxMs);
  assert(customerResult.rows[0]._count && !customerResult.rows[0].contacts, 'customers list should not include contact/task arrays');

  const tourRows = await timed('tours.list', () => toursService.list(run), maxMs);
  assert(tourRows[0]._count && !tourRows[0].services, 'tours list should not include deep service arrays');

  const tourProgramRows = await timed('tourPrograms.list', () => tourProgramsService.list(run), maxMs);
  assert(tourProgramRows[0]._count && !tourProgramRows[0].itineraryDays[0]?.description, 'tour program list should only include itinerary preview fields');

  const defaultBookingRows = await timed('bookings.list default page', () => bookingsService.list(run), maxMs);
  assert(defaultBookingRows.length === Math.min(rows, 100), 'bookings list should cap the default page size');
  const bookingRows = await timed('bookings.list requested page', () => bookingsService.list(run, undefined, undefined, undefined, rows), maxMs);
  assert(bookingRows[0].tourProgram && !bookingRows[0].tourProgram.itineraryDays, 'bookings list should not include itinerary days');
  assert(!('customerId' in bookingRows[0]) && !('createdAt' in bookingRows[0]), 'bookings list should omit detail-only fields');
  const bookingBytesPerRow = Buffer.byteLength(JSON.stringify(bookingRows)) / bookingRows.length;
  console.log(`LIST_PERF bookings.payload bytes_per_row=${bookingBytesPerRow.toFixed(1)}`);
  assert(bookingBytesPerRow < 700, 'bookings list payload should remain lightweight');

  const voucherRows = await timed('operationVouchers.list', () => vouchersService.list(run), maxMs);
  assert(voucherRows[0]._count && !voucherRows[0].details, 'voucher list should not include detail arrays');

  const invoiceResult = await timed('finance.listInvoices', () => financeService.listInvoices({ search: run, take: String(rows) }), maxMs);
  assert(!invoiceResult.rows[0].items && !invoiceResult.rows[0].files, 'invoice list should not include items/files');

  const receiptResult = await timed('finance.listReceipts', () => financeService.listReceipts({ search: run, take: String(rows) }), maxMs);
  const receiptLine = receiptResult.rows[0].orders[0];
  assert(receiptLine && !('receiptId' in receiptLine) && !('createdAt' in receiptLine) && !receiptResult.rows[0].cashflowEntries, 'receipt list should only include lightweight order lines');

  const paymentResult = await timed('finance.listPayments', () => financeService.listPayments({ search: run, take: String(rows) }), maxMs);
  const paymentRow = paymentResult.rows[0];
  const paymentRequest = paymentRow.supplierPaymentRequests[0];
  assert(paymentRow.operationVoucher && !paymentRow.cashflowEntries && !paymentRow.supplierLedger && !paymentRow.operationVoucherPayments, 'payment list should not include payment detail arrays');
  assert(paymentRequest && !('items' in paymentRequest), 'payment list should only include supplier payment request previews');

  const cashflowResult = await timed('finance.cashflow', () => financeService.cashflow({ branch: 'PERF-BR', take: String(rows) }), maxMs);
  assert(cashflowResult.rows[0] && !cashflowResult.rows[0].order && !cashflowResult.rows[0].supplier && !cashflowResult.rows[0].customer, 'cashflow list should not include related entities');

  const commissionResult = await timed('commissionReports.list', () => commissionService.list({ search: run, take: String(rows) }), maxMs);
  assert(commissionResult.rows[0].logs.length <= 1 && commissionResult.rows[0].payments.length <= 1, 'commission list should only include latest log/payment previews');

  await prisma.$disconnect();
  console.log('TEST_LIST_VIEW_PERFORMANCE_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
