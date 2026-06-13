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

async function rejectsMessage(action, expected, label) {
  let message = '';
  try {
    await action();
  } catch (error) {
    message = error?.message || String(error);
  }
  assert(message && message.includes(expected), `${label}: expected message containing "${expected}", got "${message}"`);
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
  const actorUser = { id: 'operation-voucher-user', username: 'operation-voucher-server-actor', roles: [{ role: { permissions: [{ permission: 'data.scope.all' }] } }] };

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

  await rejectsMessage(() => service.create({
    voucherCode: run + '-EMPTY',
    supplierName: supplier.name,
    serviceType: 'Hotel',
    serviceName: 'Empty detail voucher',
    serviceDate: '2026-11-01',
    details: [],
  }), 'Cần ít nhất một dòng chi tiết dịch vụ', 'create should reject empty detail array with Vietnamese message');
  await rejectsMessage(() => service.create({
    voucherCode: 'bad code!',
    supplierName: supplier.name,
    serviceType: 'Hotel',
    serviceName: 'Bad code voucher',
    serviceDate: '2026-11-01',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 1000, vat: 0 }],
  }), 'Mã phiếu điều hành phải dài 2-64 ký tự', 'create should reject invalid voucherCode with Vietnamese message');
  await rejectsMessage(() => service.create({
    voucherCode: run + '-NO-SUPPLIER',
    serviceType: 'Hotel',
    serviceName: 'Missing supplier voucher',
    serviceDate: '2026-11-01',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 1000, vat: 0 }],
  }), 'Cần nhập tên nhà cung cấp', 'create should reject missing supplierName when supplierId is not provided');
  await rejectsMessage(() => service.create({
    voucherCode: run + '-BAD-DATE',
    supplierName: supplier.name,
    serviceType: 'Hotel',
    serviceName: 'Bad date voucher',
    serviceDate: '2026-02-31',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 1000, vat: 0 }],
  }), 'ngày dịch vụ không hợp lệ', 'create should reject invalid serviceDate with Vietnamese message');
  await rejectsMessage(() => service.create({
    voucherCode: run + '-BAD-DEADLINE',
    supplierName: supplier.name,
    serviceType: 'Hotel',
    serviceName: 'Bad deadline voucher',
    serviceDate: '2026-11-05',
    paymentDeadline: '2026-11-04',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 1000, vat: 0 }],
  }), 'Hạn thanh toán không được trước ngày dịch vụ', 'create should reject paymentDeadline before serviceDate with Vietnamese message');
  await rejectsMessage(() => service.create({
    voucherCode: run + '-BAD-DETAIL',
    supplierName: supplier.name,
    serviceType: 'Hotel',
    serviceName: 'Bad detail voucher',
    serviceDate: '2026-11-01',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 100, vat: 120 }],
  }), 'VAT không được vượt quá 100%', 'create should reject invalid detail VAT with Vietnamese message');

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
  assert(created.voucherCode === run + '-001', 'create should persist normalized voucher code');
  assert(created.createdBy === 'operation', 'create should ignore client createdBy when request.user is absent');
  assert(created.bookingId === booking.id && created.tourId === tour.id && created.orderId === order.id, 'create should resolve booking to tour/order links');
  assert(created.supplierId === supplier.id && created.supplierName === supplier.name, 'create should link supplier and fill supplierName');
  assert(dateOnly(created.serviceDate) === '2026-11-01' && dateOnly(created.paymentDeadline) === '2026-11-06', 'create should parse serviceDate/paymentDeadline');
  assert(created.details.length === 2, 'create should persist voucher details');
  const roomAmount = amount(created.details.find((item) => item.sku === 'ROOM')?.amount);
  const guideAmount = amount(created.details.find((item) => item.sku === 'GUIDE')?.amount);
  assert(roomAmount === 2 * 1000 * 1.1 && guideAmount === 1 * 500, 'create should calculate each detail amount from quantity, netPrice, and VAT');
  assert(amount(created.totalAmount) === roomAmount + guideAmount && amount(created.paidAmount) === 0 && amount(created.remainAmount) === roomAmount + guideAmount && created.status === 'PENDING', 'create should calculate total and remaining amount from detail line totals');

  const allRows = await service.list(run);
  assert(allRows.some((row) => row.id === created.id), 'list should include created voucher');
  assert((await service.list('operation voucher supplier')).some((row) => row.id === created.id), 'search should match supplierName');
  assert((await service.list(supplier.supplierCode)).some((row) => row.id === created.id), 'search should match supplierCode relation');
  assert((await service.list(booking.code)).some((row) => row.id === created.id), 'search should match booking code relation');
  assert((await service.list(order.systemCode)).some((row) => row.id === created.id), 'search should match order code relation');
  assert((await service.list(tour.tourCode)).some((row) => row.id === created.id), 'search should match tour code relation');
  assert((await service.list('Hotel package')).some((row) => row.id === created.id), 'search should match serviceName');
  assert((await service.list('Hotel')).some((row) => row.id === created.id), 'search should match serviceType');
  assert((await service.list(undefined, 'PENDING')).some((row) => row.id === created.id), 'status filter should match pending voucher');
  assert((await service.list(run, undefined, undefined, 1)).length === 1, 'list should honor take limit');
  await rejectsMessage(() => service.list(undefined, 'BAD_STATUS'), 'Trạng thái phiếu điều hành không hợp lệ', 'list should reject invalid status filter with Vietnamese message');

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
  assert(updated.bookingId === booking.id && updated.tourId === tour.id && updated.orderId === order.id && updated.supplierId === supplier.id, 'partial update should keep booking/tour/order/supplier links');
  assert(updated.details.length === 1 && amount(updated.details[0].amount) === 3 * 200 * 1.05, 'update should replace details and calculate detail amount from netPrice and VAT');
  assert(amount(updated.totalAmount) === amount(updated.details[0].amount) && amount(updated.remainAmount) === amount(updated.totalAmount) && updated.status === 'PENDING', 'update should recalculate total and remaining from edited details');
  const savedAfterUpdate = await service.detail(created.id);
  assert(dateOnly(savedAfterUpdate.serviceDate) === '2026-12-01' && dateOnly(savedAfterUpdate.paymentDeadline) === '2026-12-03', 'detail after update should return saved serviceDate/paymentDeadline for edit form');
  assert(savedAfterUpdate.booking?.id === booking.id && savedAfterUpdate.tour?.id === tour.id && savedAfterUpdate.order?.id === order.id && savedAfterUpdate.supplier?.id === supplier.id, 'detail after update should keep full booking/tour/order/supplier relations');
  await rejectsMessage(() => service.update(created.id, {
    paymentDeadline: '2026-11-30',
    details: [{ serviceName: 'Bad date', quantity: 1, netPrice: 100, vat: 0 }],
  }), 'Hạn thanh toán không được trước ngày dịch vụ', 'update should reject paymentDeadline before serviceDate with Vietnamese message');

  await rejectsMessage(() => service.addPayment(created.id, { paymentAmount: 0, paymentDate: '2026-12-02' }), 'Số tiền thanh toán phải lớn hơn 0', 'add payment should reject zero paymentAmount with Vietnamese message');
  await rejectsMessage(() => service.addPayment(created.id, { paymentAmount: -1, paymentDate: '2026-12-02' }), 'Số tiền thanh toán phải lớn hơn 0', 'add payment should reject negative paymentAmount with Vietnamese message');
  await rejectsMessage(() => service.addPayment(created.id, { paymentAmount: 631, paymentDate: '2026-12-02' }), 'Số tiền thanh toán không được vượt quá công nợ còn lại', 'add payment should reject amount above remaining amount with Vietnamese message');
  await rejectsMessage(() => service.addPayment(created.id, { paymentAmount: 1, paymentDate: '2026-02-31' }), 'ngày thanh toán không hợp lệ', 'add payment should reject invalid paymentDate with Vietnamese message');
  await rejects(() => service.addPayment(created.id, { paymentAmount: 200, paymentDate: '2026-12-02' }), 'add payment should require an approved finance payment');

  const partialFinancePayment = await prisma.financePayment.create({
    data: { voucherCode: run + '-PAY-PARTIAL', operationVoucherId: created.id, paymentAmount: 200, totalAmount: 200, approvalStatus: 'APPROVED' },
  });
  const partiallyPaid = await service.addPayment(created.id, {
    paymentVoucherId: partialFinancePayment.id,
    paymentAmount: 200,
    paymentDate: '2026-12-02',
    note: 'Partial payment from test',
  });
  assert(amount(partiallyPaid.paidAmount) === 200 && amount(partiallyPaid.remainAmount) === amount(partiallyPaid.totalAmount) - 200 && partiallyPaid.status === 'PARTIAL', 'add payment should update paidAmount/remainAmount/status');
  assert(partiallyPaid.payments.length === 1 && amount(partiallyPaid.payments[0].paidAmount) === 200 && dateOnly(partiallyPaid.payments[0].paymentDate) === '2026-12-02', 'add payment should create payment history row');
  const partialReload = await service.detail(created.id);
  const partialPaymentTotal = partialReload.payments.reduce((sum, item) => sum + amount(item.paidAmount), 0);
  assert(partialPaymentTotal === amount(partialReload.paidAmount) && amount(partialReload.remainAmount) === amount(partialReload.totalAmount) - partialPaymentTotal, 'detail after payment should keep paid/remain amounts in sync with payment history');
  await rejectsMessage(() => service.update(created.id, { serviceName: 'Blocked after payment' }), 'Chỉ phiếu chưa thanh toán mới được chỉnh sửa', 'update should reject voucher with payment history using Vietnamese message');
  await rejectsMessage(() => service.remove(created.id), 'Chỉ phiếu chưa thanh toán mới được xóa', 'delete should reject voucher with payment history using Vietnamese message');
  await rejectsMessage(() => service.addPayment(created.id, { paymentAmount: 431 }), 'Số tiền thanh toán không được vượt quá công nợ còn lại', 'partial voucher should reject payment above remaining amount with Vietnamese message');

  const finalFinancePayment = await prisma.financePayment.create({
    data: { voucherCode: run + '-PAY-FINAL', operationVoucherId: created.id, paymentAmount: 430, totalAmount: 430, approvalStatus: 'APPROVED' },
  });
  const fullyPaid = await service.addPayment(created.id, { paymentVoucherId: finalFinancePayment.id, paidAmount: 430, paymentDate: '2026-12-03' });
  assert(amount(fullyPaid.paidAmount) === amount(fullyPaid.totalAmount) && amount(fullyPaid.remainAmount) === 0 && fullyPaid.status === 'PAID', 'second payment should settle voucher totals');
  assert(fullyPaid.payments.length === 2 && fullyPaid.payments.reduce((sum, item) => sum + amount(item.paidAmount), 0) === amount(fullyPaid.totalAmount), 'second payment should append another payment row and match total paid amount');
  await rejectsMessage(() => service.addPayment(created.id, { paymentAmount: 1 }), 'Phiếu điều hành đã thanh toán đủ', 'paid voucher should reject more payments with Vietnamese message');

  const standalone = await service.create({
    voucherCode: run + '-STANDALONE',
    supplierName: 'Manual Supplier Name',
    serviceType: 'Transport',
    serviceName: 'Manual transport',
    serviceDate: '2026-12-10',
    details: [{ serviceName: 'Transport NET', quantity: 1, netPrice: 100, vat: 0 }],
  });
  assert(!standalone.bookingId && !standalone.tourId && !standalone.orderId && standalone.supplierName === 'Manual Supplier Name', 'create should allow manual supplierName without booking/tour/order links for unrestricted users');

  const reuseTarget = await service.create({
    voucherCode: run + '-REUSE-TARGET',
    supplierName: 'Manual Supplier Name',
    serviceType: 'Transport',
    serviceName: 'Manual transport reuse target',
    serviceDate: '2026-12-10',
    details: [{ serviceName: 'Transport NET', quantity: 1, netPrice: 100, vat: 0 }],
  });
  const unlinkedFinancePayment = await prisma.financePayment.create({
    data: {
      voucherCode: run + '-PAY-UNLINKED',
      paymentAmount: 100,
      totalAmount: 100,
      approvalStatus: 'APPROVED',
    },
  });
  await rejectsMessage(
    () => service.addPayment(standalone.id, {
      paymentVoucherId: unlinkedFinancePayment.id,
      paymentAmount: 60,
      paymentDate: '2026-12-12',
    }),
    'Số tiền ghi nhận phải khớp với phiếu chi tài chính đã duyệt',
    'addPayment should reject partial use of an approved finance payment',
  );
  const firstUnlinkedUse = await service.addPayment(standalone.id, {
    paymentVoucherId: unlinkedFinancePayment.id,
    paymentAmount: 100,
    paymentDate: '2026-12-12',
  });
  assert(firstUnlinkedUse.payments.some((payment) => payment.paymentVoucherId === unlinkedFinancePayment.id && amount(payment.paidAmount) === 100), 'addPayment should use the approved finance payment amount when recording payment');
  await rejects(
    () => service.addPayment(reuseTarget.id, { paymentVoucherId: unlinkedFinancePayment.id, paymentAmount: 100, paymentDate: '2026-12-13' }),
    'addPayment should reject reusing one approved finance payment across operation vouchers',
  );

  const serverAmountVoucher = await service.create({
    voucherCode: run + '-SERVER-AMOUNT',
    supplierName: 'Manual Supplier Name',
    serviceType: 'Transport',
    serviceName: 'Manual transport server amount',
    serviceDate: '2026-12-10',
    details: [{ serviceName: 'Transport NET', quantity: 1, netPrice: 100, vat: 0 }],
  });
  const serverAmountPayment = await prisma.financePayment.create({
    data: {
      voucherCode: run + '-PAY-SERVER-AMOUNT',
      paymentAmount: 100,
      totalAmount: 100,
      approvalStatus: 'APPROVED',
    },
  });
  const serverAmountResult = await service.addPayment(serverAmountVoucher.id, {
    paymentVoucherId: serverAmountPayment.id,
    paymentDate: '2026-12-14',
  });
  assert(amount(serverAmountResult.paidAmount) === 100, 'addPayment should derive paidAmount from approved finance payment when client omits amount');

  const smallVoucher = await service.create({
    voucherCode: run + '-SMALL-VOUCHER',
    supplierName: 'Manual Supplier Name',
    serviceType: 'Transport',
    serviceName: 'Manual transport small voucher',
    serviceDate: '2026-12-10',
    details: [{ serviceName: 'Transport NET', quantity: 1, netPrice: 60, vat: 0 }],
  });
  const largePayment = await prisma.financePayment.create({
    data: {
      voucherCode: run + '-PAY-LARGE',
      paymentAmount: 100,
      totalAmount: 100,
      approvalStatus: 'APPROVED',
    },
  });
  await rejectsMessage(
    () => service.addPayment(smallVoucher.id, { paymentVoucherId: largePayment.id, paymentAmount: 60, paymentDate: '2026-12-15' }),
    'Số tiền ghi nhận phải khớp với phiếu chi tài chính đã duyệt',
    'addPayment should reject client amount that does not match the approved finance payment amount',
  );
  await rejectsMessage(
    () => service.addPayment(smallVoucher.id, { paymentVoucherId: largePayment.id, paymentAmount: 100, paymentDate: '2026-12-15' }),
    'Số tiền thanh toán không được vượt quá công nợ còn lại',
    'addPayment should reject approved finance payment amount that exceeds operation voucher debt',
  );
  const largePaymentAfterReject = await prisma.financePayment.findUniqueOrThrow({ where: { id: largePayment.id }, select: { operationVoucherId: true } });
  assert(!largePaymentAfterReject.operationVoucherId, 'addPayment should not lock a finance payment when reconciliation is rejected');

  const financeSource = await service.create({
    voucherCode: run + '-FINANCE',
    orderId: order.id,
    supplierId: supplier.id,
    serviceType: 'Meal',
    serviceName: 'Finance linked meal',
    serviceDate: '2026-12-11',
    createdBy: 'client-spoof',
    details: [{ serviceName: 'Meal NET', quantity: 1, netPrice: 300, vat: 0 }],
  }, actorUser);
  assert(financeSource.createdBy === actorUser.username, 'create should derive createdBy from request.user');
  const financeLinked = await service.createPaymentVoucher(financeSource.id, actorUser);
  assert(financeLinked.status === 'PENDING' && amount(financeLinked.paidAmount) === 0 && amount(financeLinked.remainAmount) === 300, 'createPaymentVoucher should not settle operation voucher before finance approval');
  assert(financeLinked.financePayments.length === 1 && financeLinked.financePayments[0].operationVoucherId === financeSource.id, 'createPaymentVoucher should link finance payment back to operation voucher');
  assert(financeLinked.financePayments[0].voucherCode.startsWith('PC-') && amount(financeLinked.financePayments[0].paymentAmount) === 300 && financeLinked.financePayments[0].approvalStatus === 'PENDING', 'createPaymentVoucher should create a pending finance payment for the remaining amount');
  assert(financeLinked.financePayments[0].createdBy === actorUser.username, 'createPaymentVoucher should derive finance payment createdBy from request.user');
  assert(financeLinked.financePayments[0].reason === `Thanh toán phiếu điều hành ${financeSource.voucherCode}`, 'createPaymentVoucher should use Vietnamese finance payment reason');
  assert(financeLinked.payments.length === 0, 'createPaymentVoucher should not create operation voucher payment history before finance approval');
  await rejects(() => service.addPayment(financeSource.id, { paymentVoucherId: financeLinked.financePayments[0].id, paymentAmount: 300 }, actorUser), 'addPayment should reject pending finance payment');
  await rejects(() => service.createPaymentVoucher(financeSource.id, actorUser), 'createPaymentVoucher should reject another active pending finance payment');
  await rejectsMessage(() => service.createPaymentVoucher(created.id), 'Phiếu điều hành đã thanh toán đủ', 'createPaymentVoucher should reject paid vouchers before creating finance payment');

  await prisma.$disconnect();
  console.log('TEST_OPERATION_VOUCHERS_SERVICE_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
