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

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(actualJson === expectedJson, `${label}: expected ${expectedJson}, got ${actualJson}`);
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

const observedErrorMessages = [];

async function rejectsMessage(action, expected, label) {
  try {
    await action();
  } catch (error) {
    const message = error?.response?.message || error?.message || '';
    observedErrorMessages.push(message);
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
  await prisma.user.create({
    data: {
      id: 'test-user',
      username: 'operations-service-test-user',
      email: 'operations-service-test-user@smarttour.local',
      name: 'Operations Service Test User',
      passwordHash: 'not-used-in-service-test',
    },
  });
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CodeSequence_scope_prefix_year_month_branch_expr_key"
    ON "CodeSequence"("scope", "prefix", "year", COALESCE("month", 0), COALESCE("branch", ''))`);
  const service = new OperationsService(prisma);
  const run = 'OPS-SVC-' + Date.now();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const next14End = new Date(todayStart);
  next14End.setDate(next14End.getDate() + 14);
  next14End.setHours(23, 59, 59, 999);

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

  await rejectsMessage(() => service.createForm({}, undefined), 'Cần chọn booking để tạo phiếu điều hành', 'create form missing booking should be Vietnamese');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD'), services: [] }, undefined), 'Cần ít nhất một dòng dịch vụ điều hành', 'create form missing services should be Vietnamese');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-TASKS'), tasks: [] }, undefined), 'Cần ít nhất một công việc điều hành', 'create form missing tasks should be Vietnamese');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-COSTS'), costs: [] }, undefined), 'Cần ít nhất một dòng chi phí điều hành', 'create form missing costs should be Vietnamese');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-SUPPLIER'), services: [{ supplierServiceId: supplierServiceA.id, serviceType: 'HOTEL', serviceName: 'Thiếu nhà cung cấp', expectedCost: 100, actualCost: 80 }] }, undefined), 'Cần chọn nhà cung cấp', 'form service should require supplier');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-SUPPLIER-SERVICE'), services: [{ supplierId: supplierA.id, serviceType: 'HOTEL', serviceName: 'Thiếu dịch vụ nhà cung cấp', expectedCost: 100, actualCost: 80 }] }, undefined), 'Cần chọn dịch vụ nhà cung cấp', 'form service should require supplier service');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-SERVICE-TYPE'), services: [{ supplierId: supplierA.id, supplierServiceId: supplierServiceA.id, serviceName: 'Thiếu loại dịch vụ', expectedCost: 100, actualCost: 80 }] }, undefined), 'Cần nhập loại dịch vụ', 'form service should require service type');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-SERVICE-NAME'), services: [{ supplierId: supplierA.id, supplierServiceId: supplierServiceA.id, serviceType: 'HOTEL', expectedCost: 100, actualCost: 80 }] }, undefined), 'Cần nhập tên dịch vụ điều hành', 'form service should require service name');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-CONFIRMATION'), services: [{ supplierId: supplierA.id, supplierServiceId: supplierServiceA.id, serviceType: 'HOTEL', serviceName: 'Sai trạng thái', confirmationStatus: 'SAI', expectedCost: 100, actualCost: 80 }] }, undefined), 'Trạng thái xác nhận dịch vụ không hợp lệ', 'form service should validate confirmation status');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-TASK-DATE'), tasks: [{ title: 'Sai ngày', dueDate: 'not-a-date', status: 'PENDING' }] }, undefined), 'Hạn công việc không hợp lệ', 'form task should validate due date');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-TASK-STATUS'), tasks: [{ title: 'Sai trạng thái', dueDate: yesterday.toISOString(), status: 'SAI' }] }, undefined), 'Trạng thái công việc điều hành không hợp lệ', 'form task should validate status');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-COST-NAME'), costs: [{ expectedAmount: 100, actualAmount: 80 }] }, undefined), 'Cần nhập tên chi phí', 'form cost should require cost name');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-COST-AMOUNT'), costs: [{ costName: 'Sai tiền', expectedAmount: 0, actualAmount: 0 }] }, undefined), 'Số tiền dự kiến phải lớn hơn 0', 'form cost should validate expected amount');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceB, 'WRONG-SUPPLIER') }, undefined), 'Dịch vụ nhà cung cấp không thuộc nhà cung cấp đã chọn', 'create form should reject wrong supplier service in Vietnamese');

  const formA = await service.createForm(formPayload(bookingA, supplierA, supplierServiceA, 'A', 'creator-a'));
  const formB = await service.createForm(formPayload(bookingB, supplierB, supplierServiceB, 'B', 'creator-b'));
  assert(formA.bookingId === bookingA.id && formA.orderId === orderA.id && formA.tourId === tourA.id, 'create form should map booking to order/tour');
  assert(formA.services.length === 1 && formA.tasks.length === 1 && formA.costs.length === 1, 'create form should persist services/tasks/costs');
  assert(formA.costs[0].serviceId === formA.services[0].id, 'create form should link cost to created operation service');
  const originalFormAServiceId = formA.services[0].id;
  const originalFormACostId = formA.costs[0].id;

  const allForms = await service.listForms({ take: 50 });
  assert(allForms.length === 2, 'list forms should include created forms');
  const listedFormA = allForms.find((row) => row.id === formA.id);
  assert(listedFormA?.costs?.[0]?.serviceId === originalFormAServiceId, 'list forms should expose cost serviceId for supplier/payment mapping');
  assert((await service.listForms({ status: 'PENDING' })).length === 2, 'list forms status filter should work');
  assert((await service.listForms({ search: customerA.phone })).some((row) => row.id === formA.id), 'list forms search should match booking customer phone');
  assert((await service.listForms({ search: orderA.systemCode })).some((row) => row.id === formA.id), 'list forms search should match order system code');
  assert((await service.listForms({ bookingId: bookingA.id })).length === 1, 'list forms booking filter should work');
  assert((await service.listForms({ take: 999 })).length === 2, 'list forms take cap should still return available rows');

  const branchAUser = user('data.scope.branch', 'BR-A', null);
  const depAUser = user('data.scope.department', null, 'DEP-A');
  const branchDepAUser = user(['data.scope.branch', 'data.scope.department'], 'BR-A', 'DEP-A');
  const branchADepBUser = user(['data.scope.branch', 'data.scope.department'], 'BR-A', 'DEP-B');
  assert((await service.listForms({ take: 50 }, branchAUser)).map((row) => row.id).join(',') === formA.id, 'branch scoped user should only see branch A form');
  assert((await service.listForms({ take: 50 }, depAUser)).map((row) => row.id).join(',') === formA.id, 'department scoped user should only see department A form');
  assert((await service.listForms({ take: 50 }, branchDepAUser)).map((row) => row.id).join(',') === formA.id, 'branch and department scoped user should only see matching form');
  assert((await service.listForms({ take: 50 }, branchADepBUser)).length === 0, 'branch and department scoped user should not see data when department mismatches');
  assert((await service.listForms({ take: 50 }, user('data.scope.branch', null, null))).length === 0, 'missing branch scope value should see no forms');
  await rejectsMessage(() => service.formDetail(formB.id, branchAUser), 'Không tìm thấy phiếu điều hành', 'branch scoped user cannot read another branch form detail');
  await rejectsMessage(() => service.formDetail(formA.id, branchADepBUser), 'Không tìm thấy phiếu điều hành', 'mismatched branch and department user cannot read form detail');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingB, supplierB, supplierServiceB, 'OUT-OF-SCOPE'), actor: 'branch-a' }, branchAUser), 'Không tìm thấy booking', 'branch scoped user cannot create form from another branch booking');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-ORDER'), bookingId: bookingA.id, orderId: orderB.id }, undefined), 'Đơn hàng đã chọn không thuộc booking đã chọn', 'create form should reject order outside booking');
  await rejectsMessage(() => service.createForm({ ...formPayload(bookingA, supplierA, supplierServiceA, 'BAD-TOUR'), bookingId: bookingA.id, tourId: tourB.id }, undefined), 'Tour đã chọn không thuộc booking đã chọn', 'create form should reject tour outside booking');
  await rejectsMessage(() => service.updateForm(formB.id, { notes: 'Không được sửa', actor: 'branch-a' }, branchAUser), 'Không tìm thấy phiếu điều hành', 'branch scoped user cannot update another branch form');

  const { order: resolveOrder, tour: resolveTour } = await makeOrder('RESOLVE', customerA, 'BR-A', 'DEP-A', 'COMPLETED', true);
  const resolveBooking = await makeBooking('RESOLVE', customerA, resolveOrder, resolveTour);
  const resolvedForm = await service.createForm(formPayload(resolveBooking, supplierA, supplierServiceA, 'RESOLVE'));
  assert(resolvedForm.bookingId === resolveBooking.id && resolvedForm.orderId === resolveOrder.id && resolvedForm.tourId === resolveTour.id, 'resolve booking/order/tour should map booking links when creating a form');
  const { order: orderOnly } = await makeOrder('ORDER-ONLY', customerA, 'BR-A', 'DEP-A', 'COMPLETED', false);
  const orderOnlyBooking = await makeBooking('ORDER-ONLY', customerA, orderOnly, null);
  const orderOnlyForm = await service.createForm(formPayload(orderOnlyBooking, supplierA, supplierServiceA, 'ORDER-ONLY'));
  assert(orderOnlyForm.orderId === orderOnly.id && orderOnlyForm.tourId === null, 'resolve booking/order/tour should allow booking with order but no tour');
  await rejectsMessage(() => service.updateForm(orderOnlyForm.id, { tourId: resolveTour.id, actor: 'resolve-mismatch' }), 'Tour đã chọn không thuộc đơn hàng của booking đã chọn', 'resolve booking/order/tour should reject mismatched tour on update');
  await service.changeFormStatus(resolvedForm.id, 'DONE', { actor: 'dashboard-cleanup' });
  await service.changeFormStatus(orderOnlyForm.id, 'DONE', { actor: 'dashboard-cleanup' });

  const updatedFormA = await service.updateForm(formA.id, {
    actor: 'updater-a',
    notes: 'Phiếu đã cập nhật',
    tasks: [{ title: 'Task mới', dueDate: yesterday.toISOString(), status: 'IN_PROGRESS', notes: 'Đã phân công' }],
  });
  assert(updatedFormA.status === 'PENDING' && updatedFormA.notes, 'normal update should persist notes without changing lifecycle status');
  await rejectsMessage(() => service.updateForm(formA.id, { status: 'IN_PROGRESS', actor: 'status-bypass' }), 'action endpoint', 'normal update should reject operation form status changes');
  const startedFormA = await service.changeFormStatus(formA.id, 'IN_PROGRESS', { actor: 'updater-a' });
  assert(startedFormA.status === 'IN_PROGRESS', 'status action should move operation form to in progress');
  assert(updatedFormA.tasks.length === 1 && updatedFormA.tasks[0].title === 'Task mới', 'update form should replace tasks when provided');
  assert(updatedFormA.services.length === 1 && updatedFormA.services[0].id === originalFormAServiceId, 'partial update should not replace services when services payload is omitted');
  assert(updatedFormA.costs.length === 1 && updatedFormA.costs[0].id === originalFormACostId, 'partial update should not replace costs when costs payload is omitted');
  const updatedFormATaskId = updatedFormA.tasks[0].id;
  await rejectsMessage(() => service.updateForm(formA.id, { costs: [{ serviceId: formB.services[0].id, costName: 'Chi phí sai dịch vụ', expectedAmount: 100, actualAmount: 80 }] }), 'Chi phí điều hành chỉ được liên kết với dịch vụ thuộc cùng phiếu điều hành', 'update form should reject cost linked to another form service');
  await rejectsMessage(() => service.changeFormStatus(formA.id, 'SAI', { actor: 'bad-status' }), 'kh', 'invalid operation status should be Vietnamese');
  const auditAt = new Date('2026-01-02T03:04:05.000Z');
  const noteOnlyUpdatedFormA = await service.updateForm(formA.id, { actor: 'audit-json', notes: 'Audit JSON', auditAt, ignoredUndefined: undefined });
  assert(noteOnlyUpdatedFormA.services.length === 1 && noteOnlyUpdatedFormA.services[0].id === originalFormAServiceId, 'note-only update should keep existing services');
  assert(noteOnlyUpdatedFormA.tasks.length === 1 && noteOnlyUpdatedFormA.tasks[0].id === updatedFormATaskId, 'note-only update should keep existing tasks');
  assert(noteOnlyUpdatedFormA.costs.length === 1 && noteOnlyUpdatedFormA.costs[0].id === originalFormACostId, 'note-only update should keep existing costs');

  await rejectsMessage(() => service.cancelForm(formB.id, { actor: 'canceller-b' }), 'Cần nhập lý do hủy phiếu điều hành để lưu lịch sử xử lý', 'cancel form should require Vietnamese reason');
  const cancelledFormB = await service.cancelForm(formB.id, { actor: 'canceller-b', reason: 'Khách đổi lịch' });
  assert(cancelledFormB.status === 'CANCELLED' && cancelledFormB.notes === 'Khách đổi lịch', 'cancel form should set status and reason');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-request', items: [] }), 'Cần ít nhất một dòng thanh toán nhà cung cấp', 'create payment request should reject empty items');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-request', items: [{ costId: formA.costs[0].id, amount: 100 }] }), 'Cần chọn nhà cung cấp', 'payment item should require supplier');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-request', items: [{ supplierId: supplierA.id, amount: 100 }] }), 'Cần chọn chi phí', 'payment item should require cost');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-request', items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: 0 }] }), 'Số tiền thanh toán phải lớn hơn 0', 'payment item should require positive amount');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-request', items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: 900 }] }), 'Số tiền thanh toán không được vượt quá số tiền chi phí điều hành', 'payment amount above cost should be Vietnamese');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-request', items: [{ supplierId: supplierB.id, costId: formA.costs[0].id, amount: 100 }] }), 'Nhà cung cấp thanh toán không khớp với nhà cung cấp của dịch vụ điều hành', 'payment request should reject supplier that does not match selected operation cost service');

  const request = await service.createPaymentRequest({
    actor: 'payment-creator',
    code: `${run}-PAY-A`,
    items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: '700', notes: 'Thanh toán khách sạn' }],
  });
  assert(request.status === 'DRAFT' && request.requestedBy === 'payment-creator' && request.items.length === 1 && amount(request.items[0].amount) === 700, 'create payment request should create draft with actor/requestedBy and item');
  assert(request.items[0].supplierId === supplierA.id && request.items[0].costId === formA.costs[0].id, 'create payment request should keep supplier and cost selected from operation form');
  assert((await service.listPaymentRequests({ search: request.code })).some((row) => row.id === request.id), 'list payment requests search should match code');
  assert((await service.listPaymentRequests({ supplierId: supplierA.id })).some((row) => row.id === request.id), 'list payment requests supplier filter should work');
  assert((await service.listPaymentRequests({ take: 50 }, branchAUser)).some((row) => row.id === request.id), 'branch scoped user should see request via operation form cost');
  assert((await service.listPaymentRequests({ take: 50 }, depAUser)).some((row) => row.id === request.id), 'department scoped user should see request via operation form cost');
  assert((await service.listPaymentRequests({ take: 50 }, branchDepAUser)).some((row) => row.id === request.id), 'branch and department scoped user should see matching payment request');
  assert((await service.listPaymentRequests({ take: 50 }, branchADepBUser)).every((row) => row.id !== request.id), 'branch and department scoped user should not see payment request when department mismatches');
  assert((await service.listPaymentRequests({ take: 50 }, user('data.scope.branch', 'BR-B', null))).every((row) => row.id !== request.id), 'other branch should not see branch A request');
  await rejectsMessage(() => service.paymentRequestDetail(request.id, branchADepBUser), 'Không tìm thấy yêu cầu thanh toán nhà cung cấp', 'mismatched branch and department user cannot read payment request detail');
  await rejectsMessage(() => service.paymentRequestDetail(request.id, user('data.scope.branch', 'BR-B', null)), 'Không tìm thấy yêu cầu thanh toán nhà cung cấp', 'other branch user cannot read payment request detail');
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-scope', items: [{ supplierId: supplierA.id, amount: 100 }] }, branchAUser), 'Cần chọn chi phí', 'scoped payment request should require cost id');
  const scopeBookingB = await makeBooking('SCOPE-B', customerB, orderB, tourB);
  const scopeFormB = await service.createForm(formPayload(scopeBookingB, supplierB, supplierServiceB, 'SCOPE-B'));
  await rejectsMessage(() => service.createPaymentRequest({ actor: 'bad-scope', items: [{ supplierId: supplierB.id, costId: scopeFormB.costs[0].id, amount: 100 }] }, branchAUser), 'Không tìm thấy chi phí điều hành', 'branch scoped user cannot request payment for another branch cost');
  await service.changeFormStatus(scopeFormB.id, 'DONE', { actor: 'dashboard-cleanup' });

  const updatedRequest = await service.updatePaymentRequest(request.id, {
    actor: 'payment-updater',
    requestedBy: 'payment-updater',
    items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: '750', notes: 'Cập nhật số tiền' }],
  });
  assert(updatedRequest.requestedBy === 'payment-updater' && amount(updatedRequest.items[0].amount) === 750, 'update payment request should replace editable fields and items');
  await rejectsMessage(() => service.updatePaymentRequest(request.id, { items: [{ supplierId: supplierA.id, costId: formA.costs[0].id, amount: 900 }] }), 'Số tiền thanh toán không được vượt quá số tiền chi phí điều hành', 'invalid payment request update should be rejected before replacing items');
  const unchangedRequest = await service.paymentRequestDetail(request.id);
  assert(unchangedRequest.items.length === 1 && amount(unchangedRequest.items[0].amount) === 750, 'failed payment request item update should keep previous items');
  await rejectsMessage(() => service.updatePaymentRequest(request.id, { status: 'REQUESTED' }), 'đường dẫn hành động', 'direct status update should be Vietnamese action-endpoint error');

  const defaultCodeBooking = await makeBooking('DEFAULT-CODE', customerA, orderA, tourA);
  const defaultCodeForm = await service.createForm(formPayload(defaultCodeBooking, supplierA, supplierServiceA, 'DEFAULT-CODE'));
  const defaultCodeRequest = await service.createPaymentRequest({ actor: 'payment-code-generator', items: [{ supplierId: supplierA.id, costId: defaultCodeForm.costs[0].id, amount: 100 }] }, branchAUser);
  assert(/^YCTT-\d{6}-\d{6}$/.test(defaultCodeRequest.code), `generated payment request code should match YCTT-YYYYMM-000001 format, got ${defaultCodeRequest.code}`);
  const defaultCodeCollisionBooking = await makeBooking('DEFAULT-CODE-COLLISION', customerA, orderA, tourA);
  const defaultCodeCollisionForm = await service.createForm(formPayload(defaultCodeCollisionBooking, supplierA, supplierServiceA, 'DEFAULT-CODE-COLLISION'));
  const nowForCode = new Date();
  await prisma.$executeRawUnsafe(
    `UPDATE "CodeSequence" SET "currentNo" = 0
     WHERE "scope" = $1
       AND "prefix" = $2
       AND "year" = $3
       AND COALESCE("month", 0) = $4
       AND COALESCE("branch", '') = $5`,
    'SUPPLIER_PAYMENT_REQUEST',
    'YCTT',
    nowForCode.getFullYear(),
    nowForCode.getMonth() + 1,
    'BR-A',
  );
  const defaultCodeCollisionRequest = await service.createPaymentRequest({ actor: 'payment-code-generator', items: [{ supplierId: supplierA.id, costId: defaultCodeCollisionForm.costs[0].id, amount: 100 }] }, branchAUser);
  assert(defaultCodeCollisionRequest.code !== defaultCodeRequest.code && /^YCTT-\d{6}-\d{6}$/.test(defaultCodeCollisionRequest.code), 'generated payment request code should skip existing request codes');
  await service.deletePaymentRequest(defaultCodeCollisionRequest.id, branchAUser);
  await service.deletePaymentRequest(defaultCodeRequest.id, branchAUser);
  await service.changeFormStatus(defaultCodeCollisionForm.id, 'DONE', { actor: 'dashboard-cleanup' });
  await service.changeFormStatus(defaultCodeForm.id, 'DONE', { actor: 'dashboard-cleanup' });

  const deleteBooking = await makeBooking('DELETE', customerA, orderA, tourA);
  const deleteForm = await service.createForm(formPayload(deleteBooking, supplierA, supplierServiceA, 'DELETE'));
  const deleteRequest = await service.createPaymentRequest({ code: `${run}-PAY-DELETE`, items: [{ supplierId: supplierA.id, costId: deleteForm.costs[0].id, amount: 100 }] });
  const deletedRequest = await service.deletePaymentRequest(deleteRequest.id, branchAUser);
  assert(deletedRequest.id === deleteRequest.id, 'delete payment request should delete draft request');
  assert((await service.listPaymentRequests({ search: deleteRequest.code })).length === 0, 'deleted payment request should not be listed');
  await service.changeFormStatus(deleteForm.id, 'DONE', { actor: 'dashboard-cleanup' });

  const rejectBooking = await makeBooking('REJECT', customerA, orderA, tourA);
  const rejectForm = await service.createForm(formPayload(rejectBooking, supplierA, supplierServiceA, 'REJECT'));
  const rejectRequest = await service.createPaymentRequest({ code: `${run}-PAY-REJECT`, items: [{ supplierId: supplierA.id, costId: rejectForm.costs[0].id, amount: 100 }] });
  await rejectsMessage(() => service.rejectPaymentRequest(rejectRequest.id, { actor: 'approver' }), 'Không thể chuyển yêu cầu thanh toán nhà cung cấp từ DRAFT sang REJECTED', 'reject draft payment request should be blocked');
  await rejectsMessage(() => service.approvePaymentRequest(rejectRequest.id, { actor: 'approver' }), 'Chỉ yêu cầu đã gửi mới được duyệt', 'approve draft payment request should be blocked');
  const submittedReject = await service.submitPaymentRequest(rejectRequest.id, { actor: 'submitter' });
  assert(submittedReject.status === 'REQUESTED', 'submit payment request should move draft to requested');
  const rejected = await service.rejectPaymentRequest(rejectRequest.id, { actor: 'approver', note: 'Thiếu chứng từ' });
  assert(rejected.status === 'REJECTED' && rejected.approvedBy === 'approver', 'reject payment request should move requested to rejected');
  await service.changeFormStatus(rejectForm.id, 'DONE', { actor: 'dashboard-cleanup' });

  const submitted = await service.submitPaymentRequest(request.id, { actor: 'submitter-a' });
  assert(submitted.status === 'REQUESTED' && submitted.requestedBy === 'submitter-a', 'submit payment request should update actor');
  await rejectsMessage(() => service.submitPaymentRequest(request.id, { actor: 'submitter-a' }), 'Không thể chuyển yêu cầu thanh toán nhà cung cấp từ REQUESTED sang REQUESTED', 'submit requested payment request should be blocked');
  await rejectsMessage(() => service.deletePaymentRequest(request.id, branchAUser), 'Chỉ yêu cầu ở trạng thái nháp hoặc bị từ chối mới được xóa', 'delete requested payment request should be blocked');
  await rejectsMessage(() => service.createFinancePaymentForRequest(request.id, { actor: 'finance' }), 'Chỉ yêu cầu đã duyệt mới được tạo phiếu chi tài chính', 'finance payment before approval should be Vietnamese');
  const approved = await service.approvePaymentRequest(request.id, { actor: 'approver-a' });
  assert(approved.status === 'APPROVED' && approved.approvedBy === 'approver-a', 'approve payment request should move requested to approved');
  const approvedLedger = await prisma.supplierLedgerEntry.findFirstOrThrow({ where: { sourceId: approved.items[0].id, entryType: 'CREDIT' } });
  assert(approvedLedger.createdBy === 'approver-a' && approvedLedger.description === 'Cập nhật số tiền', 'approve payment request should create supplier ledger credit with actor and Vietnamese description');
  assert(approvedLedger.supplierId === supplierA.id && amount(approvedLedger.creditAmount) === 750 && approvedLedger.documentCode === request.code, 'approve payment request should create ledger credit for the supplier, amount, and request code');
  assert(approvedLedger.documentDate.getTime() === approved.requestedAt.getTime(), 'approve payment request ledger date should match request date');
  await rejectsMessage(() => service.approvePaymentRequest(request.id, { actor: 'approver-a' }), 'Chỉ yêu cầu đã gửi mới được duyệt', 'approve approved payment request should be blocked');

  const linked = await service.createFinancePaymentForRequest(request.id, {
    actor: 'finance-a',
    paymentDate: tomorrow.toISOString(),
    paymentMethod: 'bank_transfer',
    reason: 'Chi theo yêu cầu test',
  }, branchAUser);
  assert(linked.financePaymentId, 'create finance payment should link request to finance payment');
  assert(linked.financePayment?.approvalStatus === 'PENDING', 'linked finance payment should use pending approval status before finance approval');
  assert(linked.financePayment && amount(linked.financePayment.paymentAmount) === 750, 'linked finance payment should use request total amount');
  const financePayment = await prisma.financePayment.findUniqueOrThrow({ where: { id: linked.financePaymentId } });
  assert(financePayment.approvalStatus === 'PENDING', 'finance payment should start with pending approval status');
  assert(financePayment.orderId === orderA.id && financePayment.tourId === tourA.id, 'finance payment should link request to order/tour');
  assert(financePayment.reason === 'Chi theo yêu cầu test' && financePayment.createdBy === 'finance-a', 'finance payment should keep Vietnamese reason and actor');
  assert(financePayment.branch === 'BR-A' && financePayment.department === 'DEP-A', 'finance payment should apply branch and department data scope');
  assert(financePayment.supplierId === supplierA.id && amount(financePayment.totalAmount) === 750 && amount(financePayment.paymentAmount) === 750, 'finance payment should keep supplier and request total amount');
  const linkedRequestInDb = await prisma.supplierPaymentRequest.findUniqueOrThrow({ where: { id: request.id }, include: { financePayment: true } });
  assert(linkedRequestInDb.financePaymentId === financePayment.id && linkedRequestInDb.financePayment?.id === financePayment.id, 'finance payment creation should persist request link in both directions');
  await rejectsMessage(() => service.paymentRequestDetail(request.id, branchADepBUser), 'Không tìm thấy yêu cầu thanh toán nhà cung cấp', 'finance-linked request should still respect branch and department scope');
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
  const expectedDashboardFromDb = {
    upcomingDepartures:
      (await prisma.order.count({ where: { deletedAt: null, startDate: { gte: todayStart, lte: next14End }, status: { in: ['UPCOMING', 'RUNNING'] } } })) +
      (await prisma.booking.count({ where: { orderId: null, startDate: { gte: todayStart, lte: next14End }, status: { in: ['CONFIRMED', 'OPERATING'] } } })),
    operatingTours:
      (await prisma.tour.count({ where: { deletedAt: null, status: 'RUNNING' } })) +
      (await prisma.order.count({ where: { deletedAt: null, status: 'RUNNING', tours: { none: {} } } })),
    overdueTasks: await prisma.operationTask.count({ where: { dueDate: { lt: todayStart }, status: { notIn: ['DONE', 'CANCELLED'] }, operationForm: { status: { notIn: ['DONE', 'CANCELLED'] } } } }),
    waitingSupplierConfirmations: await prisma.operationService.count({ where: { confirmationStatus: { in: ['WAITING', 'REQUESTED'] }, operationForm: { status: { notIn: ['DONE', 'CANCELLED'] } } } }),
    pendingSupplierPayments: await prisma.supplierPaymentRequest.count({ where: { status: { in: ['REQUESTED', 'APPROVED'] } } }),
    lowMarginTours: await prisma.order.count({ where: { deletedAt: null, status: { in: ['UPCOMING', 'RUNNING', 'COMPLETED'] }, totalRevenue: { gt: 0 }, profit: { lt: 0 } } }),
  };
  assertDeepEqual(dashboard, expectedDashboardFromDb, 'dashboard metrics should match independent database counts');
  assertDeepEqual(dashboard, {
    upcomingDepartures: 4,
    operatingTours: 1,
    overdueTasks: 1,
    waitingSupplierConfirmations: 1,
    pendingSupplierPayments: 1,
    lowMarginTours: 1,
  }, 'dashboard metrics snapshot should match seeded operations data');
  const scopedDashboard = await service.getDashboard(branchAUser);
  const branchAFormScope = { status: { notIn: ['DONE', 'CANCELLED'] }, OR: [{ booking: { customer: { branch: 'BR-A' } } }, { order: { branch: 'BR-A' } }, { tour: { branch: 'BR-A' } }] };
  const expectedScopedDashboardFromDb = {
    upcomingDepartures:
      (await prisma.order.count({ where: { deletedAt: null, startDate: { gte: todayStart, lte: next14End }, status: { in: ['UPCOMING', 'RUNNING'] }, branch: 'BR-A' } })) +
      (await prisma.booking.count({ where: { orderId: null, startDate: { gte: todayStart, lte: next14End }, status: { in: ['CONFIRMED', 'OPERATING'] }, OR: [{ customer: { branch: 'BR-A' } }, { order: { branch: 'BR-A' } }, { tour: { branch: 'BR-A' } }] } })),
    operatingTours:
      (await prisma.tour.count({ where: { deletedAt: null, status: 'RUNNING', branch: 'BR-A' } })) +
      (await prisma.order.count({ where: { deletedAt: null, status: 'RUNNING', tours: { none: {} }, branch: 'BR-A' } })),
    overdueTasks: await prisma.operationTask.count({ where: { dueDate: { lt: todayStart }, status: { notIn: ['DONE', 'CANCELLED'] }, operationForm: branchAFormScope } }),
    waitingSupplierConfirmations: await prisma.operationService.count({ where: { confirmationStatus: { in: ['WAITING', 'REQUESTED'] }, operationForm: branchAFormScope } }),
    pendingSupplierPayments: await prisma.supplierPaymentRequest.count({ where: { status: { in: ['REQUESTED', 'APPROVED'] }, OR: [{ financePayment: { branch: 'BR-A' } }, { items: { some: { cost: { operationForm: { OR: [{ booking: { customer: { branch: 'BR-A' } } }, { order: { branch: 'BR-A' } }, { tour: { branch: 'BR-A' } }] } } } } }] } }),
    lowMarginTours: await prisma.order.count({ where: { deletedAt: null, status: { in: ['UPCOMING', 'RUNNING', 'COMPLETED'] }, totalRevenue: { gt: 0 }, profit: { lt: 0 }, branch: 'BR-A' } }),
  };
  assertDeepEqual(scopedDashboard, expectedScopedDashboardFromDb, 'dashboard branch scope metrics should match independent database counts');
  assertDeepEqual(scopedDashboard, {
    upcomingDepartures: 3,
    operatingTours: 1,
    overdueTasks: 1,
    waitingSupplierConfirmations: 1,
    pendingSupplierPayments: 1,
    lowMarginTours: 1,
  }, 'dashboard branch scope snapshot should match seeded operations data');

  const auditLogs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
  const auditPairs = auditLogs.map((log) => `${log.action}:${log.entity}`);
  for (const pair of [
    'CREATE:OperationForm',
    'UPDATE:OperationForm',
    'CANCEL:OperationForm',
    'CREATE:SupplierPaymentRequest',
    'UPDATE:SupplierPaymentRequest',
    'DELETE:SupplierPaymentRequest',
    'SUBMIT:SupplierPaymentRequest',
    'APPROVE:SupplierPaymentRequest',
    'REJECT:SupplierPaymentRequest',
    'CREATE_FINANCE_PAYMENT:SupplierPaymentRequest',
  ]) {
    assert(auditPairs.includes(pair), `missing audit log ${pair}`);
  }
  const jsonAudit = auditLogs.find((log) => log.action === 'UPDATE' && log.entityId === formA.id && log.metadata?.actor === 'audit-json');
  assert(jsonAudit?.metadata?.payload?.auditAt === auditAt.toISOString() && !Object.prototype.hasOwnProperty.call(jsonAudit.metadata.payload, 'ignoredUndefined'), 'audit metadata should serialize dates and omit undefined fields');
  const cancelAudit = auditLogs.find((log) => log.action === 'CANCEL' && log.entityId === formB.id);
  assert(cancelAudit?.metadata?.reason === 'Khách đổi lịch' && cancelAudit.metadata.actor === 'canceller-b', 'cancel audit should include actor and reason');
  const deleteAudit = auditLogs.find((log) => log.action === 'DELETE' && log.entityId === deleteRequest.id);
  assert(deleteAudit?.metadata?.actor === 'test-user' && deleteAudit.metadata.code === deleteRequest.code, 'delete payment request audit should include actor and code');
  const submitAudit = auditLogs.find((log) => log.action === 'SUBMIT' && log.entityId === request.id);
  assert(submitAudit?.metadata?.actor === 'submitter-a', 'submit payment request audit should include actor');
  const rejectAudit = auditLogs.find((log) => log.action === 'REJECT' && log.entityId === rejectRequest.id);
  assert(rejectAudit?.metadata?.actor === 'approver' && rejectAudit.metadata.note === 'Thiếu chứng từ', 'reject payment request audit should include actor and note');
  const approveAudit = auditLogs.find((log) => log.action === 'APPROVE' && log.entityId === request.id);
  assert(approveAudit?.metadata?.actor === 'approver-a', 'approve payment request audit should include actor');
  const financeAudit = auditLogs.find((log) => log.action === 'CREATE_FINANCE_PAYMENT' && log.entityId === request.id);
  assert(financeAudit?.metadata?.actor === 'finance-a' && financeAudit.metadata.financePaymentId === linked.financePaymentId && financeAudit.metadata.total === 750, 'create finance payment audit should include actor, link, and total');

  const errorMessages = [
    'Cần chọn booking để tạo phiếu điều hành',
    'Cần ít nhất một dòng dịch vụ điều hành',
    'Dịch vụ nhà cung cấp không thuộc nhà cung cấp đã chọn',
    'Trạng thái phiếu điều hành không hợp lệ',
    'Cần nhập lý do hủy phiếu điều hành để lưu lịch sử xử lý',
    'Số tiền thanh toán không được vượt quá số tiền chi phí điều hành',
    'Chỉ yêu cầu đã duyệt mới được tạo phiếu chi tài chính',
  ];
  for (const message of errorMessages) assert(hasVietnameseText(message), `error message should be Vietnamese: ${message}`);
  assert(observedErrorMessages.length >= 20, 'service flow should exercise Vietnamese validation failures');
  for (const message of observedErrorMessages) assert(hasVietnameseText(message), `observed error message should include Vietnamese text: ${message}`);

  await prisma.$disconnect();
  console.log('TEST_OPERATIONS_SERVICE_FLOWS_OK');
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
