#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_operation_vouchers_service_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_OPERATION_VOUCHERS_SERVICE_TEST missing POSTGRES_PASSWORD"
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
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { OperationVouchersService } = require('./apps/api/dist/modules/operation-vouchers/operation-vouchers.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
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

function amount(value) {
  return Number(value);
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new OperationVouchersService(prisma);
  const run = 'OV-SVC-' + Date.now();

  const customer = await prisma.customer.create({
    data: {
      code: run + '-CUS',
      fullName: 'Operation Voucher Customer',
      phone: '093' + String(Date.now()).slice(-7),
      email: run.toLowerCase() + '@smarttour.local',
      branch: 'OV-BR',
      department: 'OV-DEP',
    },
  });
  const category = await prisma.supplierCategory.create({ data: { name: run + '-SUP-CAT' } });
  const supplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: run + '-SUP',
      name: 'Operation Voucher Supplier',
      status: 'ACTIVE',
    },
  });
  const order = await prisma.order.create({
    data: {
      type: 'SINGLE_SERVICE',
      systemCode: run + '-ORD',
      name: 'Operation Voucher Linked Order',
      customerId: customer.id,
      branch: 'OV-BR',
      department: 'OV-DEP',
    },
  });
  const tour = await prisma.tour.create({
    data: {
      type: 'FIT',
      systemCode: run + '-TOUR-SYS',
      tourCode: run + '-TOUR',
      name: 'Operation Voucher Linked Tour',
      orderId: order.id,
      branch: 'OV-BR',
      department: 'OV-DEP',
    },
  });
  const tourProgram = await prisma.tourProgram.create({
    data: {
      code: run + '-PROGRAM',
      name: 'Operation Voucher Tour Program',
      durationDays: 3,
    },
  });
  const booking = await prisma.booking.create({
    data: {
      code: run + '-BOOKING',
      tourProgramId: tourProgram.id,
      customerId: customer.id,
      orderId: order.id,
      tourId: tour.id,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      paxCount: 2,
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-03T00:00:00.000Z'),
    },
  });

  await rejects(() => service.create({
    voucherCode: run + '-EMPTY',
    supplierName: supplier.name,
    serviceType: 'Hotel',
    serviceName: 'Empty detail voucher',
    serviceDate: '2026-11-01',
    details: [],
  }), 'create should reject empty detail array');
  await rejects(() => service.create({
    voucherCode: run + '-BAD-DEADLINE',
    supplierName: supplier.name,
    serviceType: 'Hotel',
    serviceName: 'Bad deadline voucher',
    serviceDate: '2026-11-05',
    paymentDeadline: '2026-11-04',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 1000, vat: 0 }],
  }), 'create should reject paymentDeadline before serviceDate');

  const created = await service.create({
    voucherCode: run + '-001',
    bookingId: booking.id,
    supplierId: supplier.id,
    serviceType: 'Hotel',
    serviceName: 'Hotel package',
    serviceDate: '2026-11-01',
    paymentDeadline: '2026-11-06',
    createdBy: 'operation-vouchers-test',
    details: [
      { sku: 'ROOM', serviceName: 'Room NET', quantity: 2, unit: 'night', netPrice: 1000, vat: 10 },
      { sku: 'GUIDE', serviceName: 'Guide fee', quantity: 1, unit: 'day', netPrice: 500, vat: 0 },
    ],
  });
  assert(created.voucherCode === run + '-001', 'create should persist voucher code');
  assert(created.bookingId === booking.id && created.tourId === tour.id && created.orderId === order.id, 'create should resolve booking to tour/order links');
  assert(created.supplierId === supplier.id && created.supplierName === supplier.name, 'create should link supplier and fill supplierName');
  assert(dateOnly(created.serviceDate) === '2026-11-01' && dateOnly(created.paymentDeadline) === '2026-11-06', 'create should parse serviceDate/paymentDeadline');
  assert(created.details.length === 2, 'create should persist voucher details');
  assert(amount(created.details[0].amount) === 2200 && amount(created.details[1].amount) === 500, 'create should calculate each detail amount from netPrice and VAT');
  assert(amount(created.totalAmount) === 2700 && amount(created.paidAmount) === 0 && amount(created.remainAmount) === 2700 && created.status === 'PENDING', 'create should calculate total and remaining amount');

  const allRows = await service.list(run);
  assert(allRows.some((row) => row.id === created.id), 'list should include created voucher');
  assert((await service.list('operation voucher supplier')).some((row) => row.id === created.id), 'search should match supplierName');
  assert((await service.list('Hotel package')).some((row) => row.id === created.id), 'search should match serviceName');
  assert((await service.list(undefined, 'PENDING')).some((row) => row.id === created.id), 'status filter should match pending voucher');
  await rejects(() => service.list(undefined, 'BAD_STATUS'), 'list should reject invalid status filter');

  const detail = await service.detail(created.id);
  assert(detail.id === created.id && detail.details.length === 2, 'detail should load details');
  assert(detail.supplier?.id === supplier.id && detail.booking?.id === booking.id && detail.order?.id === order.id && detail.tour?.id === tour.id, 'detail should include supplier/booking/order/tour for edit form');
  assert(Array.isArray(detail.payments) && Array.isArray(detail.financePayments), 'detail should include payment relations for edit form');

  const updated = await service.update(created.id, {
    serviceName: 'Updated hotel package',
    serviceDate: '2026-12-01',
    paymentDeadline: '2026-12-03',
    details: [{ sku: 'ROOM2', serviceName: 'Updated room NET', quantity: 3, unit: 'night', netPrice: 200, vat: 5 }],
  });
  assert(updated.serviceName === 'Updated hotel package', 'update should persist serviceName');
  assert(dateOnly(updated.serviceDate) === '2026-12-01' && dateOnly(updated.paymentDeadline) === '2026-12-03', 'update should parse serviceDate/paymentDeadline');
  assert(updated.details.length === 1 && amount(updated.details[0].amount) === 630, 'update should replace details and calculate detail amount');
  assert(amount(updated.totalAmount) === 630 && amount(updated.remainAmount) === 630 && updated.status === 'PENDING', 'update should recalculate total and remaining');
  await rejects(() => service.update(created.id, {
    paymentDeadline: '2026-11-30',
    details: [{ serviceName: 'Bad date', quantity: 1, netPrice: 100, vat: 0 }],
  }), 'update should reject paymentDeadline before serviceDate');

  await rejects(() => service.addPayment(created.id, { paymentAmount: 0, paymentDate: '2026-12-02' }), 'add payment should reject zero paymentAmount');
  await rejects(() => service.addPayment(created.id, { paymentAmount: -1, paymentDate: '2026-12-02' }), 'add payment should reject negative paymentAmount');
  await rejects(() => service.addPayment(created.id, { paymentAmount: 631, paymentDate: '2026-12-02' }), 'add payment should reject amount above remaining amount');

  const partiallyPaid = await service.addPayment(created.id, {
    paymentAmount: 200,
    paymentDate: '2026-12-02',
    note: 'Partial payment from test',
  });
  assert(amount(partiallyPaid.paidAmount) === 200 && amount(partiallyPaid.remainAmount) === 430 && partiallyPaid.status === 'PARTIAL', 'add payment should update paidAmount/remainAmount/status');
  assert(partiallyPaid.payments.length === 1 && amount(partiallyPaid.payments[0].paidAmount) === 200 && dateOnly(partiallyPaid.payments[0].paymentDate) === '2026-12-02', 'add payment should create payment history row');
  await rejects(() => service.update(created.id, { serviceName: 'Blocked after payment' }), 'update should reject voucher with payment history');
  await rejects(() => service.remove(created.id), 'delete should reject voucher with payment history');
  await rejects(() => service.addPayment(created.id, { paymentAmount: 431 }), 'partial voucher should reject payment above remaining amount');

  const fullyPaid = await service.addPayment(created.id, { paidAmount: 430, paymentDate: '2026-12-03' });
  assert(amount(fullyPaid.paidAmount) === 630 && amount(fullyPaid.remainAmount) === 0 && fullyPaid.status === 'PAID', 'second payment should settle voucher totals');
  assert(fullyPaid.payments.length === 2, 'second payment should append another payment row');
  await rejects(() => service.addPayment(created.id, { paymentAmount: 1 }), 'paid voucher should reject more payments');

  const standalone = await service.create({
    voucherCode: run + '-STANDALONE',
    supplierName: 'Manual Supplier Name',
    serviceType: 'Transport',
    serviceName: 'Manual transport',
    serviceDate: '2026-12-10',
    details: [{ serviceName: 'Transport NET', quantity: 1, netPrice: 100, vat: 0 }],
  });
  assert(!standalone.bookingId && !standalone.tourId && !standalone.orderId && standalone.supplierName === 'Manual Supplier Name', 'create should allow manual supplierName without booking/tour/order links for unrestricted users');

  await rejects(() => service.createPaymentVoucher(created.id), 'createPaymentVoucher should reject paid vouchers before creating finance payment');

  await prisma.$disconnect();
  console.log('TEST_OPERATION_VOUCHERS_SERVICE_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
