#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
RUN_ID="SMOKE-OPS-$(date +%s)"
ROLE_PASSWORD="OpsSmoke123!26"
RUN_ID_LOWER="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
RUN_ID_SAFE="$(printf '%s' "$RUN_ID_LOWER" | tr -c 'a-z0-9_' '_')"
ADMIN_TOKEN="${ADMIN_TOKEN:-${RUN_ID}.ops-admin-token}"
ADMIN_TOKEN_HASH="$(printf '%s' "$ADMIN_TOKEN" | sha256sum | awk '{print $1}')"
NOBRANCH_TOKEN="${NOBRANCH_TOKEN:-${RUN_ID}.ops-nobranch-token}"
NOBRANCH_TOKEN_HASH="$(printf '%s' "$NOBRANCH_TOKEN" | sha256sum | awk '{print $1}')"
VIEW_TOKEN="${VIEW_TOKEN:-${RUN_ID}.ops-view-token}"
VIEW_TOKEN_HASH="$(printf '%s' "$VIEW_TOKEN" | sha256sum | awk '{print $1}')"
REQUEST_CREATE_TOKEN="${REQUEST_CREATE_TOKEN:-${RUN_ID}.ops-request-create-token}"
REQUEST_CREATE_TOKEN_HASH="$(printf '%s' "$REQUEST_CREATE_TOKEN" | sha256sum | awk '{print $1}')"
ADMIN_ROLE_ID="role_ops_admin_${RUN_ID_SAFE}"
ADMIN_USER_ID="user_ops_admin_${RUN_ID_SAFE}"
ADMIN_SESSION_ID="session_ops_admin_${RUN_ID_SAFE}"
NOBRANCH_ROLE_ID="role_ops_nobranch_${RUN_ID_SAFE}"
NOBRANCH_USER_ID="user_ops_nobranch_${RUN_ID_SAFE}"
NOBRANCH_SESSION_ID="session_ops_nobranch_${RUN_ID_SAFE}"
VIEW_ROLE_ID="role_ops_view_${RUN_ID_SAFE}"
VIEW_USER_ID="user_ops_view_${RUN_ID_SAFE}"
VIEW_SESSION_ID="session_ops_view_${RUN_ID_SAFE}"
REQUEST_CREATE_ROLE_ID="role_ops_request_create_${RUN_ID_SAFE}"
REQUEST_CREATE_USER_ID="user_ops_request_create_${RUN_ID_SAFE}"
REQUEST_CREATE_SESSION_ID="session_ops_request_create_${RUN_ID_SAFE}"

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U smarttour -d smarttour "$@"
}

cleanup() {
  psql_exec >/dev/null <<SQL || true
DELETE FROM "FinanceCashflowEntry" WHERE "paymentId" IN (
  SELECT id FROM "FinancePayment" WHERE reason LIKE '%${RUN_ID}%' OR "voucherName" LIKE '%${RUN_ID}%' OR "cancelReason" LIKE '%${RUN_ID}%'
);
DELETE FROM "SupplierLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%'
  OR description LIKE '%${RUN_ID}%'
  OR "paymentId" IN (SELECT id FROM "FinancePayment" WHERE reason LIKE '%${RUN_ID}%' OR "voucherName" LIKE '%${RUN_ID}%' OR "cancelReason" LIKE '%${RUN_ID}%');
UPDATE "SupplierPaymentRequest" SET "financePaymentId" = NULL WHERE code LIKE '${RUN_ID}%';
DELETE FROM "FinancePayment" WHERE reason LIKE '%${RUN_ID}%' OR "voucherName" LIKE '%${RUN_ID}%' OR "cancelReason" LIKE '%${RUN_ID}%';
DELETE FROM "SupplierPaymentItem" WHERE "requestId" IN (SELECT id FROM "SupplierPaymentRequest" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "SupplierPaymentRequest" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "OperationTask" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationCost" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationService" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%';
DELETE FROM "Tour" WHERE "systemCode" LIKE '${RUN_ID}%' OR "tourCode" LIKE '${RUN_ID}%';
DELETE FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%';
DELETE FROM "Booking" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "TourItineraryDay" WHERE "tourProgramId" IN (SELECT id FROM "TourProgram" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "TourProgram" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "CustomerTimeline" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "Customer" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "SupplierContact" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "SupplierService" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%';
DELETE FROM "UserSession" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '%${RUN_ID,,}%');
DELETE FROM "UserRole" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '%${RUN_ID,,}%');
DELETE FROM "User" WHERE email LIKE '%${RUN_ID,,}%';
DELETE FROM "RolePermission" WHERE "roleId" IN ('${ADMIN_ROLE_ID}', '${NOBRANCH_ROLE_ID}', '${VIEW_ROLE_ID}', '${REQUEST_CREATE_ROLE_ID}');
DELETE FROM "Role" WHERE id IN ('${ADMIN_ROLE_ID}', '${NOBRANCH_ROLE_ID}', '${VIEW_ROLE_ID}', '${REQUEST_CREATE_ROLE_ID}');
SQL
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "$POSTGRES_CONTAINER is not running" >&2
  exit 1
fi

cleanup

if [ -z "$ADMIN_PASSWORD" ]; then
  psql_exec >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES ('${ADMIN_ROLE_ID}', 'ops-admin-${RUN_ID_LOWER}', 'Operations smoke admin role', false, 'ACTIVE', now(), now());

INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES ('${ADMIN_ROLE_ID}_rp_all', '${ADMIN_ROLE_ID}', '*', now());

INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES ('${ADMIN_USER_ID}', 'ops-admin-${RUN_ID_LOWER}', 'ops-admin-${RUN_ID_LOWER}@smarttour.local', 'Operations Smoke Admin', 'not-used-by-token-smoke', 'ACTIVE', 'OPS-BR-A', 'OPS-DEP-A', now(), now());

INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES ('ur_ops_admin_${RUN_ID_SAFE}', '${ADMIN_USER_ID}', '${ADMIN_ROLE_ID}', now());

INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES ('${ADMIN_SESSION_ID}', '${ADMIN_USER_ID}', '${ADMIN_TOKEN_HASH}', 'operations-smoke', '127.0.0.1', now() + interval '1 hour', now(), now());
SQL
fi

psql_exec >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES ('${NOBRANCH_ROLE_ID}', 'ops-nobranch-${RUN_ID_LOWER}', 'Operations smoke missing branch role', false, 'ACTIVE', now(), now());

INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES
  ('${NOBRANCH_ROLE_ID}_rp_form_view', '${NOBRANCH_ROLE_ID}', 'operation.form.view', now()),
  ('${NOBRANCH_ROLE_ID}_rp_form_manage', '${NOBRANCH_ROLE_ID}', 'operation.form.manage', now()),
  ('${NOBRANCH_ROLE_ID}_rp_request_view', '${NOBRANCH_ROLE_ID}', 'operation.payment-request.view', now()),
  ('${NOBRANCH_ROLE_ID}_rp_request_create', '${NOBRANCH_ROLE_ID}', 'operation.payment-request.create', now()),
  ('${NOBRANCH_ROLE_ID}_rp_scope_branch', '${NOBRANCH_ROLE_ID}', 'data.scope.branch', now());

INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES ('${NOBRANCH_USER_ID}', 'ops-nobranch-${RUN_ID_LOWER}', 'ops-nobranch-${RUN_ID_LOWER}@smarttour.local', 'Operations Missing Branch Smoke', 'not-used-by-token-smoke', 'ACTIVE', NULL, NULL, now(), now());

INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES ('ur_ops_nobranch_${RUN_ID_SAFE}', '${NOBRANCH_USER_ID}', '${NOBRANCH_ROLE_ID}', now());

INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES ('${NOBRANCH_SESSION_ID}', '${NOBRANCH_USER_ID}', '${NOBRANCH_TOKEN_HASH}', 'operations-smoke', '127.0.0.1', now() + interval '1 hour', now(), now());

INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES
  ('${VIEW_ROLE_ID}', 'ops-view-${RUN_ID_LOWER}', 'Operations smoke view role', false, 'ACTIVE', now(), now()),
  ('${REQUEST_CREATE_ROLE_ID}', 'ops-request-create-${RUN_ID_LOWER}', 'Operations smoke request create role', false, 'ACTIVE', now(), now());

INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES
  ('${VIEW_ROLE_ID}_rp_form_view', '${VIEW_ROLE_ID}', 'operation.form.view', now()),
  ('${VIEW_ROLE_ID}_rp_request_view', '${VIEW_ROLE_ID}', 'operation.payment-request.view', now()),
  ('${VIEW_ROLE_ID}_rp_scope_all', '${VIEW_ROLE_ID}', 'data.scope.all', now()),
  ('${REQUEST_CREATE_ROLE_ID}_rp_form_view', '${REQUEST_CREATE_ROLE_ID}', 'operation.form.view', now()),
  ('${REQUEST_CREATE_ROLE_ID}_rp_request_view', '${REQUEST_CREATE_ROLE_ID}', 'operation.payment-request.view', now()),
  ('${REQUEST_CREATE_ROLE_ID}_rp_request_create', '${REQUEST_CREATE_ROLE_ID}', 'operation.payment-request.create', now()),
  ('${REQUEST_CREATE_ROLE_ID}_rp_scope_all', '${REQUEST_CREATE_ROLE_ID}', 'data.scope.all', now());

INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES
  ('${VIEW_USER_ID}', 'ops-view-${RUN_ID_LOWER}', 'ops-view-${RUN_ID_LOWER}@smarttour.local', 'Operations View Smoke', 'not-used-by-token-smoke', 'ACTIVE', 'OPS-BR-A', 'OPS-DEP-A', now(), now()),
  ('${REQUEST_CREATE_USER_ID}', 'ops-request-create-${RUN_ID_LOWER}', 'ops-request-create-${RUN_ID_LOWER}@smarttour.local', 'Operations Request Create Smoke', 'not-used-by-token-smoke', 'ACTIVE', 'OPS-BR-B', 'OPS-DEP-B', now(), now());

INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES
  ('ur_ops_view_${RUN_ID_SAFE}', '${VIEW_USER_ID}', '${VIEW_ROLE_ID}', now()),
  ('ur_ops_request_create_${RUN_ID_SAFE}', '${REQUEST_CREATE_USER_ID}', '${REQUEST_CREATE_ROLE_ID}', now());

INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES
  ('${VIEW_SESSION_ID}', '${VIEW_USER_ID}', '${VIEW_TOKEN_HASH}', 'operations-smoke', '127.0.0.1', now() + interval '1 hour', now(), now()),
  ('${REQUEST_CREATE_SESSION_ID}', '${REQUEST_CREATE_USER_ID}', '${REQUEST_CREATE_TOKEN_HASH}', 'operations-smoke', '127.0.0.1', now() + interval '1 hour', now(), now());
SQL

export API_URL RUN_ID ADMIN_EMAIL ADMIN_PASSWORD ADMIN_TOKEN NOBRANCH_TOKEN VIEW_TOKEN REQUEST_CREATE_TOKEN ROLE_PASSWORD

run_node() {
  if command -v node >/dev/null 2>&1; then
    node
    return
  fi
  docker run --rm --network host -i \
    -e API_URL \
    -e RUN_ID \
    -e ADMIN_EMAIL \
    -e ADMIN_PASSWORD \
    -e ADMIN_TOKEN \
    -e NOBRANCH_TOKEN \
    -e VIEW_TOKEN \
    -e REQUEST_CREATE_TOKEN \
    -e ROLE_PASSWORD \
    node:22-alpine node
}

run_node <<'NODE'
const api = process.env.API_URL || 'http://127.0.0.1:4000/api';
const run = process.env.RUN_ID;
const adminEmail = process.env.ADMIN_EMAIL || 'admin@smarttour.local';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminToken = process.env.ADMIN_TOKEN;
const noBranchToken = process.env.NOBRANCH_TOKEN;
const viewToken = process.env.VIEW_TOKEN;
const requestCreateToken = process.env.REQUEST_CREATE_TOKEN;
const rolePassword = process.env.ROLE_PASSWORD || 'OpsSmoke123!26';
const denied = [401, 403];

async function login(identifier, password) {
  if (!password) return adminToken;
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: identifier, username: identifier, password }) });
  const data = await response.json().catch(() => ({}));
  const token = data.token || data.accessToken;
  if (!response.ok || !token) throw new Error('Login failed for ' + identifier + ': ' + response.status + ' ' + JSON.stringify(data));
  return token;
}

async function request(token, method, path, body, ok = [200, 201]) {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!ok.includes(response.status)) throw new Error(method + ' ' + path + ' -> ' + response.status + ' ' + text.slice(0, 500));
  console.log(response.status + ' ' + method + ' ' + path);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function addDays(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function createBookingSet(token, suffix, branch, department) {
  const customer = await request(token, 'POST', '/customers', {
    code: run + '-CUS-' + suffix,
    fullName: 'Operations Smoke Customer ' + suffix,
    phone: '088' + String(Date.now()).slice(-7) + suffix.length,
    branch,
    department,
  });
  const program = await request(token, 'POST', '/tour-programs', {
    code: run + '-TP-' + suffix,
    name: 'Operations Smoke Program ' + suffix,
    route: 'HN',
    durationDays: 1,
  });
  await request(token, 'POST', '/tour-programs/' + program.id + '/itinerary-days', {
    dayNumber: 1,
    title: 'Operations Smoke Day ' + suffix,
    description: run + ' itinerary day ' + suffix,
  });
  const booking = await request(token, 'POST', '/bookings', {
    code: run + '-BKG-' + suffix,
    tourProgramId: program.id,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    paxCount: 2,
    startDate: '2026-08-10',
    endDate: '2026-08-10',
  });
  return { customer, program, booking };
}

function formPayload(bookingId, supplier, supplierServiceId, suffix, amount) {
  return {
    bookingId,
    notes: run + ' operation form ' + suffix,
    services: [{
      supplierId: supplier.id,
      supplierServiceId,
      serviceType: 'MEAL',
      serviceName: 'Lunch ' + suffix,
      confirmationStatus: 'WAITING',
      expectedCost: amount,
      actualCost: amount,
    }],
    tasks: [{ title: 'Confirm supplier ' + suffix, dueDate: isoDate(addDays(-1)), status: 'PENDING' }],
    costs: [{ costName: 'Lunch cost ' + suffix, expectedAmount: amount, actualAmount: amount, currency: 'VND', notes: run + ' cost ' + suffix }],
  };
}

(async () => {
  const admin = await login(adminEmail, adminPassword);
  const branchAName = run + '-BR-A';
  const departmentAName = run + '-DEP-A';
  const branchBName = run + '-BR-B';
  const departmentBName = run + '-DEP-B';
  const upcomingDate = isoDate(addDays(5));
  const runningDate = isoDate(addDays(1));

  await request(admin, 'POST', '/operations/forms', {}, [400]);
  await request(admin, 'POST', '/operations/supplier-payment-requests', {}, [400]);

  const supplier = await request(admin, 'POST', '/suppliers/restaurants', {
    supplierCode: run + '-SUP',
    name: 'Operations Smoke Supplier',
    phone: '0900000000',
    email: 'supplier-' + run.toLowerCase() + '@smarttour.local',
    province: 'HN',
    services: [{ serviceName: 'Set menu', quantity: 1, netPrice: 510000, sellingPrice: 560000 }],
  });
  const supplierServiceId = supplier.supplierServices?.[0]?.id;
  assert(supplierServiceId, 'Supplier service was not created');

  const supplierMismatch = await request(admin, 'POST', '/suppliers/restaurants', {
    supplierCode: run + '-SUP-MISMATCH',
    name: 'Operations Smoke Supplier Mismatch',
    phone: '0900000001',
    email: 'supplier-mismatch-' + run.toLowerCase() + '@smarttour.local',
    province: 'HN',
    services: [{ serviceName: 'Set menu mismatch', quantity: 1, netPrice: 400000, sellingPrice: 450000 }],
  });
  const mismatchServiceId = supplierMismatch.supplierServices?.[0]?.id;
  assert(mismatchServiceId, 'Mismatch supplier service was not created');

  const branchA = await createBookingSet(admin, 'A', branchAName, departmentAName);
  const branchB = await createBookingSet(admin, 'B', branchBName, departmentBName);
  const branchC = await createBookingSet(admin, 'C', branchBName, departmentBName);
  const branchD = await createBookingSet(admin, 'D', branchBName, departmentBName);
  const branchE = await createBookingSet(admin, 'E', branchAName, departmentAName);
  const branchF = await createBookingSet(admin, 'F', branchBName, departmentBName);

  const negativeOrder = await request(admin, 'POST', '/orders/fit-tours', {
    systemCode: run + '-ORD-A',
    name: 'Operations Smoke Negative Margin Order',
    branch: branchAName,
    department: departmentAName,
    status: 'UPCOMING',
    startDate: upcomingDate,
    endDate: upcomingDate,
    salesItems: [{ serviceType: 'TOUR', description: 'Revenue line', quantity: 1, serviceCount: 1, unitPrice: 100000, vat: 0 }],
    operationItems: [{ serviceType: 'HOTEL', bookingCode: run + '-OPS', quantity: 1, netPrice: 150000, vat: 0, status: 'WAITING' }],
  });
  assert(Number(negativeOrder.profit) < 0, 'Negative margin order was not created with negative profit');

  const runningTour = await request(admin, 'POST', '/tours', {
    type: 'FIT',
    systemCode: run + '-TOUR-A',
    tourCode: run + '-TOUR-A',
    name: 'Operations Smoke Running Tour',
    branch: branchAName,
    department: departmentAName,
    status: 'RUNNING',
    startDate: runningDate,
    endDate: runningDate,
  });
  assert(runningTour.status === 'RUNNING', 'Running tour was not created');

  await request(admin, 'POST', '/operations/forms', {
    ...formPayload(branchA.booking.id, supplier, supplierServiceId, 'INVALID', 510000),
    services: [{ supplierId: supplier.id, serviceType: 'MEAL', serviceName: 'Invalid service', expectedCost: 510000, actualCost: 510000 }],
  }, [400]);
  await request(admin, 'POST', '/operations/forms', {
    ...formPayload(branchA.booking.id, supplier, mismatchServiceId, 'MISMATCH', 510000),
  }, [400]);

  let formA = await request(admin, 'POST', '/operations/forms', formPayload(branchA.booking.id, supplier, supplierServiceId, 'A', 510000));
  let formB = await request(admin, 'POST', '/operations/forms', formPayload(branchB.booking.id, supplier, supplierServiceId, 'B', 320000));
  const formE = await request(admin, 'POST', '/operations/forms', formPayload(branchE.booking.id, supplier, supplierServiceId, 'E', 120000));
  const formPermission = await request(admin, 'POST', '/operations/forms', formPayload(branchF.booking.id, supplier, supplierServiceId, 'PERMISSION', 130000));
  assert(formA.services?.[0]?.supplierServiceId === supplierServiceId, 'Operation service did not keep supplierServiceId');
  assert(formA.costs?.[0]?.id, 'Operation form A did not create cost');
  assert(formA.costs?.[0]?.serviceId === formA.services?.[0]?.id, 'Operation form A cost was not linked to created service');
  assert(formB.costs?.[0]?.id, 'Operation form B did not create cost');
  assert(formE.costs?.[0]?.serviceId === formE.services?.[0]?.id, 'Operation form E cost was not linked to created service');
  await request(viewToken, 'GET', '/operations/dashboard');
  await request(viewToken, 'GET', '/operations/forms?search=' + encodeURIComponent(run));
  await request(viewToken, 'GET', '/operations/forms/' + formA.id);
  await request(viewToken, 'POST', '/operations/forms', formPayload(branchA.booking.id, supplier, supplierServiceId, 'VIEW-DENY', 100000), denied);
  await request(viewToken, 'PUT', '/operations/forms/' + formA.id, { notes: run + ' denied form update' }, denied);
  const cancelledFormE = await request(admin, 'POST', '/operations/forms/' + formE.id + '/cancel', { reason: run + ' cancel no dependency form' });
  assert(cancelledFormE.status === 'CANCELLED', 'Form without active dependencies did not cancel');
  await request(viewToken, 'POST', '/operations/forms/' + formA.id + '/cancel', { reason: run + ' denied form cancel' }, denied);
  await request(requestCreateToken, 'POST', '/operations/forms/' + formA.id + '/cancel', { reason: run + ' denied request creator form cancel' }, denied);

  formA = await request(admin, 'PUT', '/operations/forms/' + formA.id, {
    notes: run + ' operation form A updated',
    services: [{
      supplierId: supplier.id,
      supplierServiceId,
      serviceType: 'MEAL',
      serviceName: 'Lunch A updated',
      confirmationStatus: 'WAITING',
      expectedCost: 515000,
      actualCost: 515000,
    }],
    tasks: [{ title: 'Confirm supplier A updated', dueDate: isoDate(addDays(-2)), status: 'PENDING' }],
    costs: [{ costName: 'Lunch cost A updated', expectedAmount: 515000, actualAmount: 515000, currency: 'VND', notes: run + ' cost A updated' }],
  });
  assert(formA.costs?.[0]?.id, 'Operation form update did not keep a cost');
  assert(formA.costs?.[0]?.serviceId === formA.services?.[0]?.id, 'Operation form update did not relink cost to service');

  await request(admin, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-NO-COST',
    items: [{ supplierId: supplier.id, amount: 1000 }],
  }, [400]);
  const requestCreatePermission = await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-REQ-PERMISSION',
    requestedBy: 'ops-request-create',
    items: [{ supplierId: supplier.id, costId: formPermission.costs[0].id, amount: 130000, notes: run + ' request create permission' }],
  });
  assert(requestCreatePermission.status === 'DRAFT', 'Request create permission user did not create DRAFT request');
  const submittedByCreateOnly = await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests/' + requestCreatePermission.id + '/submit', { actor: 'ops-request-create' });
  assert(submittedByCreateOnly.status === 'REQUESTED', 'Request create permission user did not submit request');
  await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests/' + requestCreatePermission.id + '/approve', { actor: 'ops-request-create' }, denied);
  await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests/' + requestCreatePermission.id + '/reject', { actor: 'ops-request-create' }, denied);
  await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests/' + requestCreatePermission.id + '/create-finance-payment', { actor: 'ops-request-create' }, denied);

  const rejectRequest = await request(admin, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-REQ-B',
    requestedBy: 'ops-smoke',
    items: [{ supplierId: supplier.id, costId: formB.costs[0].id, amount: 320000, notes: run + ' reject flow' }],
  });
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + rejectRequest.id + '/submit', { actor: 'ops-smoke' });
  const rejected = await request(admin, 'POST', '/operations/supplier-payment-requests/' + rejectRequest.id + '/reject', { actor: 'ops-smoke', note: run + ' reject' });
  assert(rejected.status === 'REJECTED', 'Rejected request did not become REJECTED');
  const cancelledFormB = await request(admin, 'POST', '/operations/forms/' + formB.id + '/cancel', { reason: run + ' cancel rejected request form' });
  assert(cancelledFormB.status === 'CANCELLED', 'Form with only rejected payment request did not cancel');
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + rejectRequest.id + '/submit', { actor: 'ops-smoke' }, [400]);

  const paymentRequest = await request(admin, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-REQ-A',
    requestedBy: 'ops-smoke',
    items: [{ supplierId: supplier.id, costId: formA.costs[0].id, amount: 515000, notes: run + ' supplier payment' }],
  });
  await request(viewToken, 'GET', '/operations/supplier-payment-requests?search=' + encodeURIComponent(run));
  await request(viewToken, 'GET', '/operations/supplier-payment-requests/' + paymentRequest.id);
  await request(viewToken, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-REQ-VIEW-DENY',
    requestedBy: 'ops-smoke-view',
    items: [{ supplierId: supplier.id, costId: formA.costs[0].id, amount: 1000 }],
  }, denied);
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/approve', { actor: 'ops-smoke' }, [400]);
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/submit', { actor: 'ops-smoke' });
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/submit', { actor: 'ops-smoke' }, [400]);
  await request(viewToken, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/submit', { actor: 'ops-view' }, denied);
  await request(viewToken, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/approve', { actor: 'ops-view' }, denied);
  await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/approve', { actor: 'ops-request-create' }, denied);
  const approved = await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/approve', { actor: 'ops-smoke' });
  assert(approved.status === 'APPROVED', 'Approved request did not become APPROVED');
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/reject', { actor: 'ops-smoke' }, [400]);
  await request(viewToken, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/reject', { actor: 'ops-view' }, denied);
  await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/reject', { actor: 'ops-request-create' }, denied);
  await request(viewToken, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/create-finance-payment', { actor: 'ops-view' }, denied);
  await request(requestCreateToken, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/create-finance-payment', { actor: 'ops-request-create' }, denied);

  const linked = await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/create-finance-payment', {
    actor: 'ops-smoke',
    branch: 'OPS-BR-A',
    department: 'OPS-DEP-A',
    reason: run + ' create finance payment',
  });
  assert(linked.financePaymentId, 'Finance payment was not linked');
  assert(linked.financePayment?.approvalStatus === 'PENDING', 'Finance payment should start as PENDING');
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/create-finance-payment', { actor: 'ops-smoke' }, [400]);
  await request(viewToken, 'POST', '/finance/payments/' + linked.financePaymentId + '/approve', { actor: 'ops-view' }, denied);
  await request(requestCreateToken, 'POST', '/finance/payments/' + linked.financePaymentId + '/approve', { actor: 'ops-request-create' }, denied);

  await request(admin, 'POST', '/finance/payments/' + linked.financePaymentId + '/approve', { actor: 'ops-smoke-finance' });
  await request(admin, 'POST', '/finance/payments/' + linked.financePaymentId + '/reject', { actor: 'ops-smoke-finance' }, [400]);
  let paidRequest = await request(admin, 'GET', '/operations/supplier-payment-requests/' + paymentRequest.id);
  assert(paidRequest.status === 'PAID', 'Finance approval did not mark supplier payment request as PAID');
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/reject', { actor: 'ops-smoke' }, [400]);

  await request(admin, 'POST', '/finance/payments/' + linked.financePaymentId + '/cancel', { actor: 'ops-smoke-finance', reason: run + ' cancel finance payment' });
  paidRequest = await request(admin, 'GET', '/operations/supplier-payment-requests/' + paymentRequest.id);
  assert(paidRequest.status === 'APPROVED', 'Finance cancellation did not reopen supplier payment request');
  assert(!paidRequest.financePaymentId, 'Finance cancellation did not unlink supplier payment request');
  await request(admin, 'POST', '/operations/forms/' + formA.id + '/cancel', { reason: run + ' should block active request' }, [400]);

  const formC = await request(admin, 'POST', '/operations/forms', formPayload(branchC.booking.id, supplier, supplierServiceId, 'C', 210000));
  const requestRejectFinance = await request(admin, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-REQ-C',
    requestedBy: 'ops-smoke',
    items: [{ supplierId: supplier.id, costId: formC.costs[0].id, amount: 210000, notes: run + ' finance reject flow' }],
  });
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + requestRejectFinance.id + '/submit', { actor: 'ops-smoke' });
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + requestRejectFinance.id + '/approve', { actor: 'ops-smoke' });
  const linkedRejectFinance = await request(admin, 'POST', '/operations/supplier-payment-requests/' + requestRejectFinance.id + '/create-finance-payment', {
    actor: 'ops-smoke',
    branch: branchBName,
    department: departmentBName,
    reason: run + ' reject finance payment',
  });
  await request(admin, 'POST', '/finance/payments/' + linkedRejectFinance.financePaymentId + '/reject', { actor: 'ops-smoke-finance', note: run + ' reject pending payment' });
  const reopenedRejectFinance = await request(admin, 'GET', '/operations/supplier-payment-requests/' + requestRejectFinance.id);
  assert(reopenedRejectFinance.status === 'APPROVED', 'Rejected finance payment did not restore supplier payment request to APPROVED');
  assert(!reopenedRejectFinance.financePaymentId, 'Rejected finance payment did not unlink supplier payment request');

  const formD = await request(admin, 'POST', '/operations/forms', formPayload(branchD.booking.id, supplier, supplierServiceId, 'D', 260000));
  const requestDeleteFinance = await request(admin, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-REQ-D',
    requestedBy: 'ops-smoke',
    items: [{ supplierId: supplier.id, costId: formD.costs[0].id, amount: 260000, notes: run + ' finance delete flow' }],
  });
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + requestDeleteFinance.id + '/submit', { actor: 'ops-smoke' });
  await request(admin, 'POST', '/operations/supplier-payment-requests/' + requestDeleteFinance.id + '/approve', { actor: 'ops-smoke' });
  const linkedDeleteFinance = await request(admin, 'POST', '/operations/supplier-payment-requests/' + requestDeleteFinance.id + '/create-finance-payment', {
    actor: 'ops-smoke',
    branch: branchBName,
    department: departmentBName,
    reason: run + ' delete finance payment',
  });
  await request(admin, 'DELETE', '/finance/payments/' + linkedDeleteFinance.financePaymentId);
  const reopenedDeleteFinance = await request(admin, 'GET', '/operations/supplier-payment-requests/' + requestDeleteFinance.id);
  assert(reopenedDeleteFinance.status === 'APPROVED', 'Deleted finance payment did not restore supplier payment request to APPROVED');
  assert(!reopenedDeleteFinance.financePaymentId, 'Deleted finance payment did not unlink supplier payment request');

  const scopedEmail = ('operation-' + run + '@smarttour.local').toLowerCase();
  await request(admin, 'POST', '/auth/users', { email: scopedEmail, name: 'Operations Branch Scope', password: rolePassword, branch: branchAName, department: departmentAName, roleCodes: ['operation'] });
  const scoped = await login(scopedEmail, rolePassword);

  const scopedForms = await request(scoped, 'GET', '/operations/forms?search=' + encodeURIComponent(run));
  const scopedFormsText = JSON.stringify(scopedForms);
  assert(scopedFormsText.includes(formA.id), 'Branch scoped operation user cannot see in-branch form');
  assert(!scopedFormsText.includes(formB.id), 'Branch scoped operation user can see out-of-branch form');
  const scopedRequests = await request(scoped, 'GET', '/operations/supplier-payment-requests?search=' + encodeURIComponent(run));
  const scopedRequestsText = JSON.stringify(scopedRequests);
  assert(scopedRequestsText.includes(run + '-REQ-A'), 'Branch scoped operation user cannot see in-branch request');
  assert(!scopedRequestsText.includes(run + '-REQ-B'), 'Branch scoped operation user can see out-of-branch request');
  const dashboard = await request(scoped, 'GET', '/operations/dashboard');
  assert(dashboard.upcomingDepartures === 1, 'Dashboard upcomingDepartures expected 1, got ' + dashboard.upcomingDepartures);
  assert(dashboard.operatingTours === 1, 'Dashboard operatingTours expected 1, got ' + dashboard.operatingTours);
  assert(dashboard.overdueTasks === 1, 'Dashboard overdueTasks expected 1, got ' + dashboard.overdueTasks);
  assert(dashboard.waitingSupplierConfirmations === 1, 'Dashboard waitingSupplierConfirmations expected 1, got ' + dashboard.waitingSupplierConfirmations);
  assert(dashboard.pendingSupplierPayments === 1, 'Dashboard pendingSupplierPayments expected 1, got ' + dashboard.pendingSupplierPayments);
  assert(dashboard.lowMarginTours === 1, 'Dashboard lowMarginTours expected 1, got ' + dashboard.lowMarginTours);

  await request(noBranchToken, 'POST', '/operations/forms', formPayload(branchA.booking.id, supplier, supplierServiceId, 'NO-BRANCH', 100000), [400]);

  await request(admin, 'GET', '/operations/forms?search=' + encodeURIComponent(run));
  await request(admin, 'GET', '/operations/supplier-payment-requests?search=' + encodeURIComponent(run));
  console.log('SMOKE_OPERATIONS_BACKEND_OK');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
NODE
