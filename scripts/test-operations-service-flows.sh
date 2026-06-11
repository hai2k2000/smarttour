#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_operations_service_flows_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_OPERATIONS_SERVICE_FLOWS_TEST missing POSTGRES_PASSWORD"
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
const { OperationsService } = require('./apps/api/dist/modules/operations/operations.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function amount(value) {
  return Number(value);
}

function user(scope, branch = null, department = null) {
  const permissions = Array.isArray(scope) ? scope : [scope];
  return {
    id: 'test-user',
    branch,
    department,
    roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

async function rejectsMessage(action, expected, label) {
  try {
    await action();
  } catch (error) {
    const message = error?.response?.message || error?.message || '';
    assert(message.includes(expected), `${label}: expected "${expected}", got "${message}"`);
    return error;
  }
  throw new Error(`${label}: expected rejection`);
}

function hasVietnameseText(text) {
  return /[À-ỹ]|\\u[0-9a-fA-F]{4}/.test(text);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CodeSequence_scope_prefix_year_month_branch_expr_key"
    ON "CodeSequence"("scope", "prefix", "year", COALESCE("month", 0), COALESCE("branch", ''))`);
  const service = new OperationsService(prisma);
  const run = 'OPS-SVC-' + Date.now();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const category = await prisma.supplierCategory.create({ data: { name: run + '-CAT' } });
  const supplierA = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: run + '-SUP-A', name: 'Nhà cung cấp A', status: 'ACTIVE' } });
  const supplierB = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: run + '-SUP-B', name: 'Nhà cung cấp B', status: 'ACTIVE' } });
  const supplierServiceA = await prisma.supplierService.create({ data: { supplierId: supplierA.id, sku: run + '-SVC-A', serviceName: 'Khách sạn A', netPrice: 1000, sellingPrice: 1200 } });
  const supplierServiceB = await prisma.supplierService.create({ data: { supplierId: supplierB.id, sku: run + '-SVC-B', serviceName: 'Xe B', netPrice: 500, sellingPrice: 650 } });
  const tourProgram = await prisma.tourProgram.create({ data: { code: run + '-PROGRAM', name: 'Tour mẫu operations', durationDays: 3 } });
  let phoneSeq = 1000;

  async function makeCustomer(suffix, branch, department) {
    phoneSeq += 1;
    return prisma.customer.create({
      data: {
        code: `${run}-CUS-${suffix}`,
        fullName: `Khách ${suffix}`,
        phone: `09${String(Date.now()).slice(-4)}${String(phoneSeq).padStart(4, '0')}`,
        email: `${run.toLowerCase()}-${suffix}@smarttour.local`,
        branch,
        department,
      },
    });
  }

  async function makeOrder(suffix, customer, branch, department, status = 'UPCOMING', withTour = true, profit = 1000, totalRevenue = 5000) {
    const order = await prisma.order.create({
      data: {
        type: 'SINGLE_SERVICE',
        systemCode: `${run}-ORD-${suffix}`,
        tourCode: `${run}-TC-${suffix}`,
        name: `Đơn hàng ${suffix}`,
        route: `Tuyến ${suffix}`,
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        startDate: nextWeek,
        endDate: new Date(nextWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
        status,
        branch,
        department,
        totalRevenue,
        profit,
      },
    });
    let tour = null;
    if (withTour) {
      tour = await prisma.tour.create({
        data: {
          type: 'FIT',
          status: status === 'RUNNING' ? 'RUNNING' : 'UPCOMING',
          systemCode: `${run}-TOUR-SYS-${suffix}`,
          tourCode: `${run}-TOUR-${suffix}`,
          name: `Tour ${suffix}`,
          orderId: order.id,
          startDate: nextWeek,
          endDate: new Date(nextWeek.getTime() + 2 * 24 * 60 * 60 * 1000),
          branch,
          department,
          route: `Tuyến ${suffix}`,
        },
      });
    }
    return { order, tour };
  }

  async function makeBooking(suffix, customer, order, tour, branchStatus = 'CONFIRMED') {
    return prisma.booking.create({
      data: {
        code: `${run}-BOOK-${suffix}`,
        tourProgramId: tourProgram.id,
        customerId: customer.id,
        orderId: order?.id ?? null,
        tourId: tour?.id ?? null,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        paxCount: 2,
        startDate: tomorrow,
        endDate: new Date(tomorrow.getTime() + 2 * 24 * 60 * 60 * 1000),
        status: branchStatus,
      },
    });
  }

  function formPayload(booking, supplier, supplierService, suffix, actor = 'operation-test') {
    return {
      actor,
      bookingId: booking.id,
      services: [{
        supplierId: supplier.id,
        supplierServiceId: supplierService.id,
        serviceType: 'HOTEL',
        serviceName: `Dịch vụ ${suffix}`,
        confirmationStatus: 'WAITING',
        expectedCost: '1000',
        actualCost: '800',
        notes: `Ghi chú dịch vụ ${suffix}`,
      }],
      tasks: [{
        title: `Task ${suffix}`,
        assignee: 'Điều hành',
        dueDate: yesterday.toISOString(),
        status: 'PENDING',
        notes: 'Cần xử lý',
      }],
      costs: [{
        costName: `Chi phí ${suffix}`,
        expectedAmount: '1000',
        actualAmount: '800',
        currency: 'VND',
        invoiceNo: `${run}-INV-${suffix}`,
        notes: `Ghi chú chi phí ${suffix}`,
      }],
      notes: `Phiếu ${suffix}`,
    };
  }

  const customerA = await makeCustomer('A', 'BR-A', 'DEP-A');
  const customerB = await makeCustomer('B', 'BR-B', 'DEP-B');
  const { order: orderA, tour: tourA } = await makeOrder('A', customerA, 'BR-A', 'DEP-A', 'UPCOMING', true);
  const { order: orderB, tour: tourB } = await makeOrder('B', customerB, 'BR-B', 'DEP-B', 'UPCOMING', true);
  const bookingA = await makeBooking('A', customerA, orderA, tourA);
  const bookingB = await makeBooking('B', customerB, orderB, tourB);

  await rejectsMessage(() => service.createForm({}, undefined), 'Cần chọn booking', 'create form missing booking should be Vietnamese');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD'), services: [] }, undefined), 'Cần ít nhất một service là bắt buộc', 'create form missing services should be Vietnamese');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceB, 'WRONG-SUPPLIER') }, undefined), 'Dịch vụ nhà cung cấp không thuộc nhà cung cấp đã chọn', 'create form should reject wrong supplier service in Vietnamese');

  const formA = await service.createForm(formPayload(bookingA, supplierA, supplierServiceA, 'A', 'creator-a'));
  const formB = await service.createForm(formPayload(bookingB, supplierB, supplierServiceB, 'B', 'creator-b'));
  assert(formA.bookingId === bookingA.id && formA.orderId === orderA.id && formA.tourId === tourA.id, 'create form should map booking to order/tour');
  assert(formA.services.length === 1 && formA.tasks.length === 1 && formA.costs.length === 1, 'create form should persist services/tasks/costs');
  assert(formA.costs[0].serviceId === formA.services[0].id, 'create form should link cost to created operation service');

  const allForms = await service.listForms({ take: 50 });
  assert(allForms.length === 2, 'list forms should include created forms');
  assert((await service.listForms({ status: 'PENDING' })).length === 2, 'list forms status filter should work');
  assert((await service.listForms({ search: customerA.phone })).some((row) => row.id === formA.id), 'list forms search should match booking customer phone');
  assert((await service.listForms({ search: orderA.systemCode })).some((row) => row.id === formA.id), 'list forms search should match order system code');
  assert((await service.listForms({ bookingId: bookingA.id })).length === 1, 'list forms booking filter should work');
  assert((await service.listForms({ take: 999 })).length === 2, 'list forms take cap should still return available rows');

  const branchAUser = user('data.scope.branch', 'BR-A', null);
  const depAUser = user('data.scope.department', null, 'DEP-A');
  assert((await service.listForms({ take: 50 }, branchAUser)).map((row) => row.id).join(',') === formA.id, 'branch scoped user should only see branch A form');
  assert((await service.listForms({ take: 50 }, depAUser)).map((row) => row.id).join(',') === formA.id, 'department scoped user should only see department A form');
  assert((await service.listForms({ take: 50 }, user('data.scope.branch', null, null))).length === 0, 'missing branch scope value should see no forms');
  await rejectsMessage(() => service.updateForm(formB.id, { notes: 'Không được sửa', actor: 'branch-a' }, branchAUser), 'Không tìm thấy phiếu điều hành', 'branch scoped user cannot update another branch form');

  const updatedFormA = await service.updateForm(formA.id, {
    actor: 'updater-a',
    status: 'IN_PROGRESS',
    notes: 'Phiếu đã cập nhật',
    tasks: [{ title: 'Task mới', dueDate: yesterday.toISOString(), status: 'IN_PROGRESS', notes: 'Đã phân công' }],
  });
  assert(updatedFormA.status === 'IN_PROGRESS' && updatedFormA.notes === 'Phiếu đã cập nhật', 'update form should persist status and notes');
  assert(updatedFormA.tasks.length === 1 && updatedFormA.tasks[0].title === 'Task mới', 'update form should replace tasks when provided');
  await rejectsMessage(() => service.updateForm(formA.id, { status: 'SAI' }), 'Trạng thái phiếu điều hành không hợp lệ', 'invalid operation status should be Vietnamese');

  await rejectsMessage(() => service.cancelForm(formB.id, { actor: 'canceller-b' }), 'Cần nhập lý do hủy phiếu điều hành', 'cancel form should require Vietnamese reason');
  const cancelledFormB = await service.cancelForm(formB.id, { actor: 'canceller-b', reason: 'Khách đổi lịch' });
  assert(cancelledFormB.status === 'CANCELLED' && cancelledFormB.notes === 'Khách đổi lịch', 'cancel form should set status and reason');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-request', items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: 900 }] }), 'Số tiền thanh toán không được vượt quá số tiền chi phí điều hành', 'payment amount above cost should be Vietnamese');

  const request = await service.createPaymentRequest({
    actor: 'payment-creator',
    code: `${run}-PAY-A`,
    items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: '700', notes: 'Thanh toán khách sạn' }],
  });
  assert(request.status === 'DRAFT' && request.items.length === 1 && amount(request.items[0].amount) === 700, 'create payment request should create draft with item');
  assert((await service.listPaymentRequests({ search: request.code })).some((row) => row.id === request.id), 'list payment requests search should match code');
  assert((await service.listPaymentRequests({ supplierId: supplierA.id })).some((row) => row.id === request.id), 'list payment requests supplier filter should work');
  assert((await service.listPaymentRequests({ take: 50 }, branchAUser)).some((row) => row.id === request.id), 'branch scoped user should see request via operation form cost');
  assert((await service.listPaymentRequests({ take: 50 }, depAUser)).some((row) => row.id === request.id), 'department scoped user should see request via operation form cost');
  assert((await service.listPaymentRequests({ take: 50 }, user('data.scope.branch', 'BR-B', null))).every((row) => row.id !== request.id), 'other branch should not see branch A request');

  const updatedRequest = await service.updatePaymentRequest(request.id, {
    actor: 'payment-updater',
    requestedBy: 'payment-updater',
    items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: '750', notes: 'Cập nhật số tiền' }],
  });
  assert(updatedRequest.requestedBy === 'payment-updater' && amount(updatedRequest.items[0].amount) === 750, 'update payment request should replace editable fields and items');
  await rejectsMessage(() => service.updatePaymentRequest(request.id, { status: 'REQUESTED' }), 'endpoint hành động', 'direct status update should be Vietnamese action-endpoint error');

  const deleteBooking = await makeBooking('DELETE', customerA, orderA, tourA);
  const deleteForm = await service.createForm(formPayload(deleteBooking, supplierA, supplierServiceA, 'DELETE'));
  const deleteRequest = await service.createPaymentRequest({ code: `${run}-PAY-DELETE`, items: [{ supplierId: supplierA.id, costId: deleteForm.costs[0].id, amount: 100 }] });
  const deletedRequest = await service.deletePaymentRequest(deleteRequest.id);
  assert(deletedRequest.id === deleteRequest.id, 'delete payment request should delete draft request');
  assert((await service.listPaymentRequests({ search: deleteRequest.code })).length === 0, 'deleted payment request should not be listed');
  await service.updateForm(deleteForm.id, { status: 'DONE', actor: 'dashboard-cleanup' });

  const rejectBooking = await makeBooking('REJECT', customerA, orderA, tourA);
  const rejectForm = await service.createForm(formPayload(rejectBooking, supplierA, supplierServiceA, 'REJECT'));
  const rejectRequest = await service.createPaymentRequest({ code: `${run}-PAY-REJECT`, items: [{ supplierId: supplierA.id, costId: rejectForm.costs[0].id, amount: 100 }] });
  const submittedReject = await service.submitPaymentRequest(rejectRequest.id, { actor: 'submitter' });
  assert(submittedReject.status === 'REQUESTED', 'submit payment request should move draft to requested');
  const rejected = await service.rejectPaymentRequest(rejectRequest.id, { actor: 'approver', note: 'Thiếu chứng từ' });
  assert(rejected.status === 'REJECTED' && rejected.approvedBy === 'approver', 'reject payment request should move requested to rejected');
  await service.updateForm(rejectForm.id, { status: 'DONE', actor: 'dashboard-cleanup' });

  const submitted = await service.submitPaymentRequest(request.id, { actor: 'submitter-a' });
  assert(submitted.status === 'REQUESTED' && submitted.requestedBy === 'submitter-a', 'submit payment request should update actor');
  await rejectsMessage(() => service.createFinancePaymentForRequest(request.id, { actor: 'finance' }), 'Chỉ yêu cầu đã duyệt mới được tạo phiếu chi tài chính', 'finance payment before approval should be Vietnamese');
  const approved = await service.approvePaymentRequest(request.id, { actor: 'approver-a' });
  assert(approved.status === 'APPROVED' && approved.approvedBy === 'approver-a', 'approve payment request should move requested to approved');
  assert(await prisma.supplierLedgerEntry.count({ where: { sourceId: approved.items[0].id, entryType: 'CREDIT' } }) === 1, 'approve payment request should create supplier ledger credit');

  const linked = await service.createFinancePaymentForRequest(request.id, {
    actor: 'finance-a',
    paymentDate: tomorrow.toISOString(),
    paymentMethod: 'bank_transfer',
    reason: 'Chi theo yêu cầu test',
  }, branchAUser);
  assert(linked.financePaymentId, 'create finance payment should link request to finance payment');
  assert(linked.financePayment && amount(linked.financePayment.paymentAmount) === 750, 'linked finance payment should use request total amount');
  const financePayment = await prisma.financePayment.findUniqueOrThrow({ where: { id: linked.financePaymentId } });
  assert(financePayment.orderId === orderA.id && financePayment.tourId === tourA.id, 'finance payment should link request to order/tour');
  assert(financePayment.branch === 'BR-A', 'finance payment should apply branch data scope');
  const idempotentLinked = await service.createFinancePaymentForRequest(request.id, { actor: 'finance-a' });
  assert(idempotentLinked.financePaymentId === linked.financePaymentId, 'create finance payment should be idempotent for linked requests');
  assert((await service.listPaymentRequests({ financePaymentId: linked.financePaymentId })).some((row) => row.id === request.id), 'list payment requests finance payment filter should work');

  const runningCustomer = await makeCustomer('RUN', 'BR-A', 'DEP-A');
  const { order: runningLegacyOrder } = await makeOrder('RUN-LEGACY', runningCustomer, 'BR-A', 'DEP-A', 'RUNNING', false);
  await prisma.order.update({ where: { id: runningLegacyOrder.id }, data: { startDate: yesterday, endDate: yesterday } });
  await makeOrder('LOW-MARGIN', runningCustomer, 'BR-A', 'DEP-A', 'UPCOMING', false, -100, 1000);
  const standaloneBooking = await prisma.booking.create({
    data: {
      code: `${run}-BOOK-STANDALONE`,
      tourProgramId: tourProgram.id,
      customerId: runningCustomer.id,
      customerName: runningCustomer.fullName,
      customerPhone: runningCustomer.phone,
      paxCount: 1,
      startDate: tomorrow,
      endDate: nextWeek,
      status: 'CONFIRMED',
    },
  });
  assert(standaloneBooking.orderId === null, 'standalone booking seed should have no order');
  const dashboard = await service.getDashboard();
  assert(dashboard.upcomingDepartures === 4, `dashboard upcomingDepartures expected 4 got ${dashboard.upcomingDepartures}`);
  assert(dashboard.operatingTours === 1, `dashboard operatingTours expected 1 got ${dashboard.operatingTours}`);
  assert(dashboard.overdueTasks === 1, `dashboard overdueTasks expected 1 got ${dashboard.overdueTasks}`);
  assert(dashboard.waitingSupplierConfirmations === 1, `dashboard waitingSupplierConfirmations expected 1 got ${dashboard.waitingSupplierConfirmations}`);
  assert(dashboard.pendingSupplierPayments === 1, `dashboard pendingSupplierPayments expected 1 got ${dashboard.pendingSupplierPayments}`);
  assert(dashboard.lowMarginTours === 1, `dashboard lowMarginTours expected 1 got ${dashboard.lowMarginTours}`);
  const scopedDashboard = await service.getDashboard(branchAUser);
  assert(scopedDashboard.upcomingDepartures === 3 && scopedDashboard.waitingSupplierConfirmations === 1, 'dashboard should honor branch data scope');

  const auditLogs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
  const auditPairs = auditLogs.map((log) => `${log.action}:${log.entity}`);
  for (const pair of [
    'CREATE:OperationForm',
    'UPDATE:OperationForm',
    'CANCEL:OperationForm',
    'CREATE:SupplierPaymentRequest',
    'UPDATE:SupplierPaymentRequest',
    'REQUESTED:SupplierPaymentRequest',
    'APPROVE:SupplierPaymentRequest',
    'REJECTED:SupplierPaymentRequest',
    'CREATE_FINANCE_PAYMENT:SupplierPaymentRequest',
  ]) {
    assert(auditPairs.includes(pair), `missing audit log ${pair}`);
  }
  const cancelAudit = auditLogs.find((log) => log.action === 'CANCEL' && log.entityId === formB.id);
  assert(cancelAudit?.metadata?.reason === 'Khách đổi lịch' && cancelAudit.metadata.actor === 'canceller-b', 'cancel audit should include actor and reason');

  const errorMessages = [
    'Cần chọn booking',
    'Cần ít nhất một service là bắt buộc',
    'Dịch vụ nhà cung cấp không thuộc nhà cung cấp đã chọn',
    'Trạng thái phiếu điều hành không hợp lệ',
    'Cần nhập lý do hủy phiếu điều hành',
    'Số tiền thanh toán không được vượt quá số tiền chi phí điều hành',
    'Chỉ yêu cầu đã duyệt mới được tạo phiếu chi tài chính',
  ];
  for (const message of errorMessages) assert(hasVietnameseText(message), `error message should be Vietnamese: ${message}`);

  await prisma.$disconnect();
  console.log('TEST_OPERATIONS_SERVICE_FLOWS_OK');
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
