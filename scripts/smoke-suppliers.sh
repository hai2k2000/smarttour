#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
RUN_ID="${RUN_ID:-SMOKE-SUP-$(date +%s)}"

if [[ ! "$RUN_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "RUN_ID may only contain letters, numbers, dot, underscore, and dash" >&2
  exit 1
fi

RUN_ID_LOWER="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
RUN_ID_SAFE="$(printf '%s' "$RUN_ID_LOWER" | tr -c 'a-z0-9_' '_')"
MANAGE_TOKEN="${MANAGE_TOKEN:-${RUN_ID}.supplier-manage-token}"
VIEW_TOKEN="${VIEW_TOKEN:-${RUN_ID}.supplier-view-token}"
MANAGE_TOKEN_HASH="$(printf '%s' "$MANAGE_TOKEN" | sha256sum | awk '{print $1}')"
VIEW_TOKEN_HASH="$(printf '%s' "$VIEW_TOKEN" | sha256sum | awk '{print $1}')"

MANAGE_ROLE_ID="role_sup_manage_${RUN_ID_SAFE}"
VIEW_ROLE_ID="role_sup_view_${RUN_ID_SAFE}"
MANAGE_USER_ID="user_sup_manage_${RUN_ID_SAFE}"
VIEW_USER_ID="user_sup_view_${RUN_ID_SAFE}"
MANAGE_SESSION_ID="session_sup_manage_${RUN_ID_SAFE}"
VIEW_SESSION_ID="session_sup_view_${RUN_ID_SAFE}"
USED_CATEGORY_ID="sup_used_category_${RUN_ID_SAFE}"
USED_SUPPLIER_ID="$(cat /proc/sys/kernel/random/uuid)"
LEGACY_TYPED_SUPPLIER_ID="$(cat /proc/sys/kernel/random/uuid)"
USED_ORDER_ID="$(cat /proc/sys/kernel/random/uuid)"
USED_OPERATION_ITEM_ID="sup_used_op_item_${RUN_ID_SAFE}"
USED_FINANCE_PAYMENT_ID="sup_used_fin_payment_${RUN_ID_SAFE}"
USED_PAYMENT_REQUEST_ID="sup_used_pay_request_${RUN_ID_SAFE}"
USED_PAYMENT_ITEM_ID="sup_used_pay_item_${RUN_ID_SAFE}"
USED_TOUR_PROGRAM_ID="sup_used_program_${RUN_ID_SAFE}"
USED_BOOKING_ID="$(cat /proc/sys/kernel/random/uuid)"
USED_OPERATION_FORM_ID="sup_used_form_${RUN_ID_SAFE}"
USED_OPERATION_SERVICE_ID="sup_used_service_${RUN_ID_SAFE}"

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U smarttour -d smarttour "$@"
}

cleanup() {
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    echo "skip DB cleanup ($POSTGRES_CONTAINER not available)"
    return
  fi
  psql_exec >/dev/null <<SQL || true
DELETE FROM "SupplierPaymentItem" WHERE id = '${USED_PAYMENT_ITEM_ID}' OR "requestId" = '${USED_PAYMENT_REQUEST_ID}';
DELETE FROM "SupplierPaymentRequest" WHERE id = '${USED_PAYMENT_REQUEST_ID}' OR code LIKE '${RUN_ID}%';
DELETE FROM "OperationService" WHERE id = '${USED_OPERATION_SERVICE_ID}';
DELETE FROM "OperationForm" WHERE id = '${USED_OPERATION_FORM_ID}';
DELETE FROM "Booking" WHERE id = '${USED_BOOKING_ID}' OR code LIKE '${RUN_ID}-SUP-BOOKING%';
DELETE FROM "TourProgram" WHERE id = '${USED_TOUR_PROGRAM_ID}' OR code LIKE '${RUN_ID}-SUP-PROGRAM%';
DELETE FROM "FinancePayment" WHERE id = '${USED_FINANCE_PAYMENT_ID}' OR "voucherCode" LIKE '${RUN_ID}%';
DELETE FROM "OrderOperationItem" WHERE id = '${USED_OPERATION_ITEM_ID}' OR "orderId" = '${USED_ORDER_ID}';
DELETE FROM "Order" WHERE id = '${USED_ORDER_ID}' OR "systemCode" LIKE '${RUN_ID}%';
DELETE FROM "Supplier" WHERE id IN ('${USED_SUPPLIER_ID}', '${LEGACY_TYPED_SUPPLIER_ID}') OR "supplierCode" LIKE '${RUN_ID}%' OR name LIKE '${RUN_ID}%' OR email LIKE '%${RUN_ID_LOWER}%';
DELETE FROM "SupplierCategory" WHERE id IN ('${USED_CATEGORY_ID}', 'legacy_flight_${RUN_ID_SAFE}') OR name LIKE '${RUN_ID}%';
DELETE FROM "UserSession" WHERE id IN ('${MANAGE_SESSION_ID}', '${VIEW_SESSION_ID}') OR "userId" IN ('${MANAGE_USER_ID}', '${VIEW_USER_ID}');
DELETE FROM "UserRole" WHERE "userId" IN ('${MANAGE_USER_ID}', '${VIEW_USER_ID}') OR "roleId" IN ('${MANAGE_ROLE_ID}', '${VIEW_ROLE_ID}');
DELETE FROM "User" WHERE id IN ('${MANAGE_USER_ID}', '${VIEW_USER_ID}') OR email IN ('sup-manage-${RUN_ID_LOWER}@smarttour.local', 'sup-view-${RUN_ID_LOWER}@smarttour.local');
DELETE FROM "RolePermission" WHERE "roleId" IN ('${MANAGE_ROLE_ID}', '${VIEW_ROLE_ID}');
DELETE FROM "Role" WHERE id IN ('${MANAGE_ROLE_ID}', '${VIEW_ROLE_ID}') OR code IN ('sup-manage-${RUN_ID_LOWER}', 'sup-view-${RUN_ID_LOWER}');
SQL
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "$POSTGRES_CONTAINER is not running" >&2
  exit 1
fi

cleanup

psql_exec >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES
  ('${MANAGE_ROLE_ID}', 'sup-manage-${RUN_ID_LOWER}', 'Supplier smoke manage role', false, 'ACTIVE', now(), now()),
  ('${VIEW_ROLE_ID}', 'sup-view-${RUN_ID_LOWER}', 'Supplier smoke view role', false, 'ACTIVE', now(), now());

INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES
  ('${MANAGE_ROLE_ID}_rp_supplier_view', '${MANAGE_ROLE_ID}', 'supplier.view', now()),
  ('${MANAGE_ROLE_ID}_rp_supplier_manage', '${MANAGE_ROLE_ID}', 'supplier.manage', now()),
  ('${MANAGE_ROLE_ID}_rp_file_view', '${MANAGE_ROLE_ID}', 'file.view', now()),
  ('${MANAGE_ROLE_ID}_rp_scope_all', '${MANAGE_ROLE_ID}', 'data.scope.all', now()),
  ('${VIEW_ROLE_ID}_rp_supplier_view', '${VIEW_ROLE_ID}', 'supplier.view', now());

INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES
  ('${MANAGE_USER_ID}', 'sup-manage-${RUN_ID_LOWER}', 'sup-manage-${RUN_ID_LOWER}@smarttour.local', 'Supplier Smoke Manage', 'not-used-by-token-smoke', 'ACTIVE', 'SUP-BR', 'SUP-DEP', now(), now()),
  ('${VIEW_USER_ID}', 'sup-view-${RUN_ID_LOWER}', 'sup-view-${RUN_ID_LOWER}@smarttour.local', 'Supplier Smoke View', 'not-used-by-token-smoke', 'ACTIVE', 'OUTSIDE-BR', 'OUTSIDE-DEP', now(), now());

INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES
  ('ur_sup_manage_${RUN_ID_SAFE}', '${MANAGE_USER_ID}', '${MANAGE_ROLE_ID}', now()),
  ('ur_sup_view_${RUN_ID_SAFE}', '${VIEW_USER_ID}', '${VIEW_ROLE_ID}', now());

INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES
  ('${MANAGE_SESSION_ID}', '${MANAGE_USER_ID}', '${MANAGE_TOKEN_HASH}', 'suppliers-smoke', '127.0.0.1', now() + interval '1 hour', now(), now()),
  ('${VIEW_SESSION_ID}', '${VIEW_USER_ID}', '${VIEW_TOKEN_HASH}', 'suppliers-smoke', '127.0.0.1', now() + interval '1 hour', now(), now());

INSERT INTO "SupplierCategory" (id, name, "createdAt", "updatedAt")
VALUES ('${USED_CATEGORY_ID}', '${RUN_ID} Used Category', now(), now());

INSERT INTO "Supplier" (id, "categoryId", "supplierCode", name, phone, email, province, market, status, "createdAt", "updatedAt")
VALUES (
  '${USED_SUPPLIER_ID}',
  '${USED_CATEGORY_ID}',
  '${RUN_ID}-USED-SUP',
  '${RUN_ID} Used Supplier',
  '0900000000',
  'used-${RUN_ID_LOWER}@smarttour.local',
  'Hà Nội',
  'Nội địa',
  'ACTIVE',
  now(),
  now()
);

INSERT INTO "TourProgram" (id, code, name, "durationDays", "createdAt", "updatedAt")
VALUES ('${USED_TOUR_PROGRAM_ID}', '${RUN_ID}-SUP-PROGRAM', '${RUN_ID} supplier guard program', 1, now(), now());

INSERT INTO "Booking" (id, code, "tourProgramId", "customerName", "paxCount", "startDate", "endDate", "createdAt", "updatedAt")
VALUES ('${USED_BOOKING_ID}', '${RUN_ID}-SUP-BOOKING', '${USED_TOUR_PROGRAM_ID}', '${RUN_ID} supplier guard customer', 1, now(), now(), now(), now());

INSERT INTO "OperationForm" (id, "bookingId", notes, "createdAt", "updatedAt")
VALUES ('${USED_OPERATION_FORM_ID}', '${USED_BOOKING_ID}', '${RUN_ID} supplier guard form', now(), now());

INSERT INTO "OperationService" (id, "operationFormId", "supplierId", "serviceType", "serviceName")
VALUES ('${USED_OPERATION_SERVICE_ID}', '${USED_OPERATION_FORM_ID}', '${USED_SUPPLIER_ID}', 'HOTEL', '${RUN_ID} supplier guard operation service');

INSERT INTO "SupplierCategory" (id, name, "createdAt", "updatedAt")
VALUES ('legacy_flight_${RUN_ID_SAFE}', 'Flight Ticket', now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO "Supplier" (id, "categoryId", "supplierCode", name, phone, status, "createdAt", "updatedAt")
SELECT
  '${LEGACY_TYPED_SUPPLIER_ID}',
  id,
  '${RUN_ID}-LEGACY-FLIGHT',
  '${RUN_ID} Legacy Flight Supplier',
  '0900000001',
  'ACTIVE',
  now(),
  now()
FROM "SupplierCategory"
WHERE name = 'Flight Ticket';

INSERT INTO "Order" (id, type, "systemCode", name, status, "paymentStatus", "costStatus", branch, department, "createdAt", "updatedAt")
VALUES ('${USED_ORDER_ID}', 'FIT_TOUR', '${RUN_ID}-ORD-USED', '${RUN_ID} supplier usage order', 'DRAFT', 'UNPAID', 'PENDING', 'SUP-BR', 'SUP-DEP', now(), now());

INSERT INTO "OrderOperationItem" (id, "orderId", "supplierId", "serviceType")
VALUES ('${USED_OPERATION_ITEM_ID}', '${USED_ORDER_ID}', '${USED_SUPPLIER_ID}', 'HOTEL');

INSERT INTO "FinancePayment" (id, "voucherCode", "supplierId", "voucherName", "totalAmount", "paymentAmount", "remainingAmount", "createdAt", "updatedAt")
VALUES ('${USED_FINANCE_PAYMENT_ID}', '${RUN_ID}-FIN-USED', '${USED_SUPPLIER_ID}', '${RUN_ID} finance payment', 100000, 0, 100000, now(), now());

INSERT INTO "SupplierPaymentRequest" (id, code, status, "financePaymentId", "requestedBy", "requestedAt")
VALUES ('${USED_PAYMENT_REQUEST_ID}', '${RUN_ID}-PAY-REQ-USED', 'APPROVED', '${USED_FINANCE_PAYMENT_ID}', '${MANAGE_USER_ID}', now());

INSERT INTO "SupplierPaymentItem" (id, "requestId", "supplierId", amount, notes)
VALUES ('${USED_PAYMENT_ITEM_ID}', '${USED_PAYMENT_REQUEST_ID}', '${USED_SUPPLIER_ID}', 100000, '${RUN_ID} supplier payment item');
SQL

export API_URL RUN_ID RUN_ID_LOWER MANAGE_TOKEN VIEW_TOKEN MANAGE_USER_ID USED_SUPPLIER_ID USED_CATEGORY_ID LEGACY_TYPED_SUPPLIER_ID USED_ORDER_ID USED_BOOKING_ID

run_node() {
  if command -v node >/dev/null 2>&1; then
    node
    return
  fi
  docker run --rm --network host -i \
    -e API_URL \
    -e RUN_ID \
    -e RUN_ID_LOWER \
    -e MANAGE_TOKEN \
    -e VIEW_TOKEN \
    -e MANAGE_USER_ID \
    -e USED_SUPPLIER_ID \
    -e USED_CATEGORY_ID \
    -e LEGACY_TYPED_SUPPLIER_ID \
    -e USED_ORDER_ID \
    -e USED_BOOKING_ID \
    node:22-alpine node
}

run_node <<'NODE'
const api = process.env.API_URL || 'http://127.0.0.1:4000/api';
const run = process.env.RUN_ID;
const lowerRun = process.env.RUN_ID_LOWER;
const manageToken = process.env.MANAGE_TOKEN;
const viewToken = process.env.VIEW_TOKEN;
const usedSupplierId = process.env.USED_SUPPLIER_ID;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function messageOf(data) {
  const message = data?.message;
  return Array.isArray(message) ? message.join(', ') : String(message || data?.error || data || '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(token, method, path, body, ok = [200, 201]) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(api + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let data = text;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (ok.includes(response.status)) {
        console.log(`${response.status} ${method} ${path}`);
        return data;
      }
      if (![502, 503, 504].includes(response.status) || attempt === 30) {
        throw new Error(`${method} ${path} -> ${response.status} ${String(text).slice(0, 500)}`);
      }
      lastError = new Error(`${method} ${path} -> ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 30) break;
    }
    await sleep(1000);
  }
  throw lastError;
}

async function uploadRequest(token, path, fileName, mimeType, content, ok = [200, 201]) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: mimeType }), fileName);
  const response = await fetch(api + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!ok.includes(response.status)) {
    throw new Error(`POST ${path} -> ${response.status} ${String(text).slice(0, 500)}`);
  }
  console.log(`${response.status} POST ${path} (${fileName})`);
  return data;
}

(async () => {
  const initialCategories = await request(manageToken, 'GET', '/supplier-categories');
  assert(Array.isArray(initialCategories), 'supplier categories response must be an array');
  assert(initialCategories.some((category) => category.id === process.env.USED_CATEGORY_ID), 'seeded used category must be visible');

  const initialSuppliers = await request(manageToken, 'GET', '/suppliers');
  assert(Array.isArray(initialSuppliers), 'suppliers response must be an array');
  const seeded = initialSuppliers.find((supplier) => supplier.id === usedSupplierId);
  assert(seeded, 'seeded used supplier must be visible');
  assert(seeded.category?.id, 'supplier list must include category shape');

  const categorySearch = await request(manageToken, 'GET', `/supplier-categories?search=${encodeURIComponent(`${run} Used`)}`);
  assert(categorySearch.length === 1 && categorySearch[0].id === process.env.USED_CATEGORY_ID, 'category search should filter by name');
  const nonEmptyCategories = await request(manageToken, 'GET', '/supplier-categories?includeEmpty=false');
  assert(nonEmptyCategories.some((category) => category.id === process.env.USED_CATEGORY_ID), 'non-empty category filter should keep categories with active suppliers');
  await request(manageToken, 'GET', '/supplier-categories?includeEmpty=maybe', undefined, [400]);

  const activeSuppliers = await request(manageToken, 'GET', '/suppliers?status=ACTIVE');
  assert(activeSuppliers.some((item) => item.id === usedSupplierId), 'status filter should include matching suppliers');
  const provinceSuppliers = await request(manageToken, 'GET', `/suppliers?province=${encodeURIComponent('Hà Nội')}`);
  assert(provinceSuppliers.some((item) => item.id === usedSupplierId), 'province filter should include matching suppliers');
  const marketSuppliers = await request(manageToken, 'GET', `/suppliers?market=${encodeURIComponent('Nội địa')}`);
  assert(marketSuppliers.some((item) => item.id === usedSupplierId), 'market filter should include matching suppliers');
  await request(manageToken, 'GET', '/suppliers?categoryId=not-a-uuid', undefined, [400]);
  await request(manageToken, 'GET', '/suppliers?status=UNKNOWN', undefined, [400]);

  const scopedViewSuppliers = await request(viewToken, 'GET', '/suppliers');
  assert(scopedViewSuppliers.some((item) => item.id === usedSupplierId), 'supplier catalog should remain global for a viewer without data.scope.all');
  const supplierDetail = await request(viewToken, 'GET', `/suppliers/${usedSupplierId}`);
  assert(supplierDetail.id === usedSupplierId && supplierDetail.category?.id, 'single-segment supplier detail route should not be mistaken for a typed route');
  const unsupportedSingleSegment = await request(viewToken, 'GET', '/suppliers/not-a-supplier-type', undefined, [404]);
  assert(messageOf(unsupportedSingleSegment).includes('Loại nhà cung cấp không được hỗ trợ'), 'unknown single-segment route should not be treated as a supplier id');
  const missingSupplierDetail = await request(viewToken, 'GET', '/suppliers/00000000-0000-4000-8000-000000000099', undefined, [404]);
  assert(messageOf(missingSupplierDetail).includes('Không tìm thấy nhà cung cấp'), 'valid UUID single-segment route should resolve as supplier detail');

  const typedRoutes = [
    'restaurants',
    'flights',
    'attraction-tickets',
    'landtour-suppliers',
    'water',
    'transport',
    'bus',
    'other',
    'villas',
    'passport',
    'guides',
    'series-tickets',
  ];
  for (const type of typedRoutes) {
    const typedList = await request(viewToken, 'GET', `/suppliers/${type}`);
    assert(Array.isArray(typedList), `typed route ${type} must return an array`);
  }
  const legacyFlightList = await request(viewToken, 'GET', '/suppliers/flights');
  assert(legacyFlightList.some((item) => item.id === process.env.LEGACY_TYPED_SUPPLIER_ID), 'typed list should include suppliers from legacy category aliases');
  const legacyFlightDetail = await request(viewToken, 'GET', `/suppliers/flights/${process.env.LEGACY_TYPED_SUPPLIER_ID}`);
  assert(legacyFlightDetail.id === process.env.LEGACY_TYPED_SUPPLIER_ID, 'typed detail should accept legacy category aliases');
  const unsupportedTypeError = await request(viewToken, 'GET', `/suppliers/not-a-supplier-type/${usedSupplierId}`, undefined, [404]);
  assert(messageOf(unsupportedTypeError).includes('Loại nhà cung cấp không được hỗ trợ'), 'unsupported supplier type should return a clear Vietnamese message');

  const dashboard = await request(viewToken, 'GET', '/suppliers/hotel-allotments/dashboard');
  assert(typeof dashboard.allotmentQty === 'number', 'allotment dashboard static route should not be matched as supplier detail');
  const inventory = await request(viewToken, 'GET', '/suppliers/hotel-allotments/inventory');
  assert(Array.isArray(inventory), 'allotment inventory static route should return an array');
  await request(viewToken, 'GET', '/suppliers/hotels?status=UNKNOWN', undefined, [400]);
  await request(viewToken, 'GET', '/suppliers/hotel-allotments/inventory?supplierId=not-a-uuid', undefined, [400]);
  await request(viewToken, 'GET', '/suppliers/hotel-allotments/inventory?startDate=not-a-date', undefined, [400]);
  const reversedDateError = await request(viewToken, 'GET', '/suppliers/hotel-allotments/inventory?startDate=2026-06-12&endDate=2026-06-11', undefined, [400]);
  assert(messageOf(reversedDateError).includes('Ngày bắt đầu không được sau ngày kết thúc'), 'inventory should reject a reversed date range');
  await request(viewToken, 'PATCH', '/suppliers/hotel-allotments/00000000-0000-4000-8000-000000000001/override', {}, [403]);
  await request(viewToken, 'POST', '/suppliers/hotel-allotments/00000000-0000-4000-8000-000000000001/lock', {}, [403]);
  await request(viewToken, 'POST', '/suppliers/hotel-allotment-allocations/00000000-0000-4000-8000-000000000001/confirm', {}, [403]);
  await request(viewToken, 'POST', '/suppliers/hotel-allotment-allocations/00000000-0000-4000-8000-000000000001/release', {}, [403]);
  const missingAllotmentError = await request(manageToken, 'PATCH', '/suppliers/hotel-allotments/00000000-0000-4000-8000-000000000001/override', { allotmentQty: 1, note: 'Missing allotment smoke' }, [404]);
  assert(messageOf(missingAllotmentError).includes('Không tìm thấy quỹ phòng'), 'missing allotment should return a Vietnamese message');
  const missingLockAllotmentError = await request(manageToken, 'POST', '/suppliers/hotel-allotments/00000000-0000-4000-8000-000000000001/lock', {}, [404]);
  assert(messageOf(missingLockAllotmentError).includes('Không tìm thấy quỹ phòng'), 'locking a missing allotment should return a Vietnamese message');
  const missingAllocationError = await request(manageToken, 'POST', '/suppliers/hotel-allotment-allocations/00000000-0000-4000-8000-000000000001/confirm', {}, [404]);
  assert(messageOf(missingAllocationError).includes('Không tìm thấy phân bổ quỹ phòng'), 'missing allotment allocation should return a Vietnamese message');
  await request(manageToken, 'POST', '/suppliers/hotel-allotment-allocations/00000000-0000-4000-8000-000000000001/release', {}, [404]);

  await request(viewToken, 'POST', '/supplier-categories', { name: `${run} forbidden category` }, [403]);
  await request(viewToken, 'PATCH', `/supplier-categories/${process.env.USED_CATEGORY_ID}`, { name: `${run} forbidden update` }, [403]);
  await request(viewToken, 'DELETE', `/supplier-categories/${process.env.USED_CATEGORY_ID}`, undefined, [403]);
  await request(viewToken, 'POST', '/suppliers', { categoryId: process.env.USED_CATEGORY_ID, name: `${run} forbidden supplier create` }, [403]);
  await request(viewToken, 'PATCH', `/suppliers/${usedSupplierId}`, { name: `${run} forbidden supplier update` }, [403]);
  await request(viewToken, 'PATCH', `/suppliers/${usedSupplierId}/status`, { status: 'INACTIVE' }, [403]);
  await request(viewToken, 'DELETE', `/suppliers/${usedSupplierId}`, undefined, [403]);
  await request(viewToken, 'POST', '/suppliers/hotels', {}, [403]);
  await request(viewToken, 'PUT', `/suppliers/hotels/${usedSupplierId}`, {}, [403]);
  await request(viewToken, 'POST', '/suppliers/restaurants', {}, [403]);
  await request(viewToken, 'PUT', `/suppliers/restaurants/${usedSupplierId}`, {}, [403]);
  await request(viewToken, 'PATCH', `/suppliers/restaurants/${usedSupplierId}/status`, { status: 'INACTIVE' }, [403]);
  await request(viewToken, 'DELETE', `/suppliers/restaurants/${usedSupplierId}`, undefined, [403]);

  const categoryName = `${run} API Category`;
  const category = await request(manageToken, 'POST', '/supplier-categories', { name: `  ${run}   API Category  ` });
  assert(category.id && category.name === categoryName, 'created category should normalize surrounding and repeated whitespace');
  assert(Number(category._count?.suppliers || 0) === 0, 'created category should expose zero active suppliers');

  const updatedCategoryName = `${run} API Category Updated`;
  const updatedCategory = await request(manageToken, 'PATCH', `/supplier-categories/${category.id}`, { name: `  ${updatedCategoryName}  ` });
  assert(updatedCategory.name === updatedCategoryName, 'updated category should be trimmed and returned');
  const duplicateCategoryError = await request(manageToken, 'POST', '/supplier-categories', { name: updatedCategoryName.toLowerCase() }, [409]);
  assert(messageOf(duplicateCategoryError).includes('Loại nhà cung cấp đã tồn tại'), 'duplicate category should return a Vietnamese message');

  const disposableCategory = await request(manageToken, 'POST', '/supplier-categories', { name: `${run} Disposable Category` });
  const categoriesWithoutEmpty = await request(manageToken, 'GET', '/supplier-categories?includeEmpty=false');
  assert(!categoriesWithoutEmpty.some((item) => item.id === disposableCategory.id), 'includeEmpty=false should omit unused categories');
  const normalizedCategory = await request(manageToken, 'POST', '/supplier-categories', { name: `${run} Đối Tác` });
  const normalizedDuplicateError = await request(manageToken, 'POST', '/supplier-categories', { name: `${run} Doi Tac` }, [409]);
  assert(messageOf(normalizedDuplicateError).includes('Loại nhà cung cấp đã tồn tại'), 'category names should be unique regardless of accents and case');
  await request(manageToken, 'DELETE', `/supplier-categories/${normalizedCategory.id}`);
  const renamedDisposableCategory = await request(manageToken, 'PATCH', `/supplier-categories/${disposableCategory.id}`, { name: `${run} Disposable Category Updated` });
  assert(renamedDisposableCategory.name.endsWith('Updated'), 'category update should persist name');
  await request(manageToken, 'DELETE', `/supplier-categories/${disposableCategory.id}`);

  const hotelSystemCategory = initialCategories.find((item) => item.name === 'Hotel');
  if (hotelSystemCategory) {
    await request(manageToken, 'PATCH', `/supplier-categories/${hotelSystemCategory.id}`, { name: `${run} Renamed Hotel` }, [400]);
    await request(manageToken, 'DELETE', `/supplier-categories/${hotelSystemCategory.id}`, undefined, [400]);
  }

  const supplier = await request(manageToken, 'POST', '/suppliers', {
    supplierCode: `  ${lowerRun}-common  `,
    categoryId: category.id,
    name: `  ${run} API Supplier  `,
    contactPerson: '  Supplier Contact  ',
    phone: ' 0901111222 ',
    email: `supplier-${lowerRun}@smarttour.local`,
    taxCode: `  TAX-${run}  `,
    country: '  Việt Nam  ',
    province: `  ${run}   Province  `,
    address: ' Hanoi ',
    website: ` https://supplier-${lowerRun}.example.com `,
    link: ` https://supplier-${lowerRun}.example.com/ref `,
    rating: 4,
    market: `  ${run}   Market  `,
    bankAccountName: '  Supplier Bank Account  ',
    bankAccountNumber: '  123456789  ',
    bankName: '  Smart Bank  ',
    pricePolicy: 'Net price, seasonal surcharge',
    debtNote: 'Payable after reconciliation',
    notes: 'Smoke note',
    status: 'ACTIVE',
  });
  assert(supplier.id, 'created supplier must have id');
  assert(supplier.supplierCode === `${run}-COMMON`, 'common supplier code should be trimmed and uppercased');
  assert(supplier.name === `${run} API Supplier`, 'created supplier should be trimmed');
  assert(supplier.taxCode === `TAX-${run}`, 'created supplier should persist normalized tax code');
  assert(supplier.country === 'Việt Nam', 'created supplier should persist normalized country');
  assert(supplier.province === `${run} Province`, 'created supplier should persist normalized province');
  assert(supplier.website === `https://supplier-${lowerRun}.example.com`, 'created supplier should persist normalized website');
  assert(supplier.link === `https://supplier-${lowerRun}.example.com/ref`, 'created supplier should persist normalized link');
  assert(supplier.rating === 4, 'created supplier should persist rating');
  assert(supplier.market === `${run} Market`, 'created supplier should persist normalized market');
  assert(supplier.bankAccountName === 'Supplier Bank Account', 'created supplier should persist normalized bank account name');
  assert(supplier.bankAccountNumber === '123456789', 'created supplier should persist normalized bank account number');
  assert(supplier.bankName === 'Smart Bank', 'created supplier should persist normalized bank name');
  assert(supplier.status === 'ACTIVE', 'created supplier should persist validated status');
  assert(supplier.category?.id === category.id, 'created supplier must include category');
  assert(Array.isArray(supplier.supplierServices), 'created supplier must include supplierServices');
  const duplicateCodeError = await request(manageToken, 'POST', '/suppliers', {
    supplierCode: `${lowerRun}-COMMON`,
    categoryId: category.id,
    name: `${run} Duplicate Code Supplier`,
  }, [409]);
  assert(messageOf(duplicateCodeError).includes('Mã nhà cung cấp đã tồn tại'), 'supplier code should be unique regardless of case');

  const partialUpdate = await request(manageToken, 'PATCH', `/suppliers/${supplier.id}`, { name: `${run} API Supplier Partial` });
  assert(partialUpdate.name.endsWith('Partial'), 'partial supplier update should update the requested field');
  const partialDetail = await request(manageToken, 'GET', `/suppliers/${supplier.id}`);
  assert(partialDetail.address === 'Hanoi', 'partial supplier update must preserve address');
  assert(partialDetail.taxCode === `TAX-${run}`, 'partial supplier update must preserve tax code');
  assert(partialDetail.province === `${run} Province`, 'partial supplier update must preserve province');
  assert(partialDetail.market === `${run} Market`, 'partial supplier update must preserve market');
  assert(partialDetail.bankAccountName === 'Supplier Bank Account', 'partial supplier update must preserve bank account name');
  assert(partialDetail.bankAccountNumber === '123456789', 'partial supplier update must preserve bank account number');
  assert(partialDetail.bankName === 'Smart Bank', 'partial supplier update must preserve bank name');
  assert(partialDetail.debtNote === 'Payable after reconciliation', 'partial supplier update must preserve debt note');
  assert(partialDetail.categoryId === category.id, 'partial supplier update must preserve category linkage');

  await uploadRequest(viewToken, `/suppliers/${supplier.id}/files`, 'forbidden.txt', 'text/plain', 'forbidden', [403]);
  const blockedUpload = await uploadRequest(manageToken, `/suppliers/${supplier.id}/files`, 'blocked.svg', 'image/svg+xml', '<svg />', [400]);
  assert(messageOf(blockedUpload).includes('Loại file không được phép'), 'dangerous supplier file type should be rejected');
  const blockedExtensionUpload = await uploadRequest(manageToken, `/suppliers/${supplier.id}/files`, 'blocked.js', 'text/plain', 'console.log(1)', [400]);
  assert(messageOf(blockedExtensionUpload).includes('Loại file không được phép'), 'dangerous supplier file extension should be rejected even with a safe mime type');
  const emptyUpload = await uploadRequest(manageToken, `/suppliers/${supplier.id}/files`, 'empty.txt', 'text/plain', '', [400]);
  assert(messageOf(emptyUpload).includes('File t\u1ea3i l\u00ean kh\u00f4ng \u0111\u01b0\u1ee3c \u0111\u1ec3 tr\u1ed1ng'), 'empty supplier file should be rejected');
  const oversizedUpload = await uploadRequest(manageToken, `/suppliers/${supplier.id}/files`, 'oversized.txt', 'text/plain', 'x'.repeat(10 * 1024 * 1024 + 1), [413]);
  assert(messageOf(oversizedUpload).includes('File vượt quá giới hạn 10 MB'), 'supplier upload must enforce the 10 MB business limit');
  const uploadedFile = await uploadRequest(manageToken, `/suppliers/${supplier.id}/files`, 'supplier-note.txt', 'text/plain', 'supplier file smoke');
  assert(uploadedFile.id && uploadedFile.uploadedBy === process.env.MANAGE_USER_ID, 'supplier upload should record the authenticated user id');
  assert(uploadedFile.fileName === 'supplier-note.txt' && uploadedFile.fileType === 'text/plain', 'supplier upload should persist normalized file metadata');
  assert(uploadedFile.createdAt && uploadedFile.fileUrl.includes('/api/files/download?key='), 'supplier upload should expose createdAt and a download URL with an object key');
  let uploadedDownload = await fetch(new URL(uploadedFile.fileUrl, api), { headers: { Authorization: `Bearer ${manageToken}` } });
  assert(uploadedDownload.status === 200 && await uploadedDownload.text() === 'supplier file smoke', 'uploaded supplier object must be downloadable');
  const wrongSupplierFileError = await request(manageToken, 'DELETE', `/suppliers/${usedSupplierId}/files/${uploadedFile.id}`, undefined, [404]);
  assert(messageOf(wrongSupplierFileError).includes('Kh\u00f4ng t\u00ecm th\u1ea5y file nh\u00e0 cung c\u1ea5p'), 'supplier file delete must enforce file ownership');
  uploadedDownload = await fetch(new URL(uploadedFile.fileUrl, api), { headers: { Authorization: `Bearer ${manageToken}` } });
  assert(uploadedDownload.status === 200, 'wrong-supplier delete must not remove the storage object');
  const fileUsageDeleteError = await request(manageToken, 'DELETE', `/suppliers/${supplier.id}`, undefined, [409]);
  assert(messageOf(fileUsageDeleteError).includes('file nhà cung cấp'), 'supplier delete should be blocked while files remain');
  await request(viewToken, 'DELETE', `/suppliers/${supplier.id}/files/${uploadedFile.id}`, undefined, [403]);
  await request(manageToken, 'DELETE', `/suppliers/${supplier.id}/files/${uploadedFile.id}`);
  const deletedDownload = await fetch(new URL(uploadedFile.fileUrl, api), { headers: { Authorization: `Bearer ${manageToken}` } });
  assert(deletedDownload.status === 404, 'supplier file delete must remove the storage object');
  const missingFileError = await request(manageToken, 'DELETE', `/suppliers/${supplier.id}/files/${uploadedFile.id}`, undefined, [404]);
  assert(messageOf(missingFileError).includes('Không tìm thấy file nhà cung cấp'), 'missing supplier file should return a Vietnamese message');

  const categoriesAfterCreate = await request(manageToken, 'GET', '/supplier-categories');
  const counted = categoriesAfterCreate.find((item) => item.id === category.id);
  assert(Number(counted?._count?.suppliers || 0) === 1, 'category count should include one active supplier');

  const filteredByCategory = await request(manageToken, 'GET', `/suppliers?categoryId=${encodeURIComponent(category.id)}`);
  assert(filteredByCategory.length === 1 && filteredByCategory[0].id === supplier.id, 'category filter should return matching supplier');
  const filteredByProvince = await request(manageToken, 'GET', `/suppliers?province=${encodeURIComponent(`${run} Province`)}`);
  assert(filteredByProvince.some((item) => item.id === supplier.id), 'common supplier province filter should return matching supplier');
  const filteredByMarket = await request(manageToken, 'GET', `/suppliers?market=${encodeURIComponent(`${run} Market`)}`);
  assert(filteredByMarket.some((item) => item.id === supplier.id), 'common supplier market filter should return matching supplier');
  const searchedByTaxCode = await request(manageToken, 'GET', `/suppliers?search=${encodeURIComponent(`TAX-${run}`)}`);
  assert(searchedByTaxCode.some((item) => item.id === supplier.id), 'common supplier search should include tax code');

  const updated = await request(manageToken, 'PATCH', `/suppliers/${supplier.id}`, {
    categoryId: category.id,
    name: `${run} API Supplier Updated`,
    contactPerson: 'Updated Contact',
    phone: '0903333444',
    email: `supplier-updated-${lowerRun}@smarttour.local`,
    taxCode: `  TAX-${run}-UPDATED  `,
    country: '  Thái Lan  ',
    province: `  ${run}   Province Updated  `,
    address: 'Da Nang',
    website: ` https://supplier-updated-${lowerRun}.example.com `,
    link: ` https://supplier-updated-${lowerRun}.example.com/ref `,
    rating: 5,
    market: `  ${run}   Market Updated  `,
    bankAccountName: '  Updated Bank Account  ',
    bankAccountNumber: '  987654321  ',
    bankName: '  Updated Smart Bank  ',
    pricePolicy: 'Updated policy',
    debtNote: 'Updated debt note',
    notes: 'Updated internal note',
    status: 'ACTIVE',
  });
  assert(updated.name.endsWith('Updated'), 'supplier update should return updated name');
  assert(updated.taxCode === `TAX-${run}-UPDATED`, 'supplier update should persist normalized tax code');
  assert(updated.country === 'Thái Lan', 'supplier update should persist normalized country');
  assert(updated.province === `${run} Province Updated`, 'supplier update should persist normalized province');
  assert(updated.website === `https://supplier-updated-${lowerRun}.example.com`, 'supplier update should persist normalized website');
  assert(updated.link === `https://supplier-updated-${lowerRun}.example.com/ref`, 'supplier update should persist normalized link');
  assert(updated.rating === 5, 'supplier update should persist rating');
  assert(updated.market === `${run} Market Updated`, 'supplier update should persist normalized market');
  assert(updated.bankAccountName === 'Updated Bank Account', 'supplier update should persist normalized bank account name');
  assert(updated.bankAccountNumber === '987654321', 'supplier update should persist normalized bank account number');
  assert(updated.bankName === 'Updated Smart Bank', 'supplier update should persist normalized bank name');
  assert(updated.debtNote === 'Updated debt note', 'supplier update should persist debtNote');
  assert(updated.pricePolicy === 'Updated policy', 'supplier update should persist pricePolicy');
  assert(updated.category?.id === category.id && Array.isArray(updated.supplierServices), 'supplier update response shape should match list response');
  const inactiveSupplier = await request(manageToken, 'PATCH', `/suppliers/${supplier.id}/status`, { status: 'INACTIVE' });
  assert(inactiveSupplier.status === 'INACTIVE', 'supplier manage permission should allow status update');
  await request(manageToken, 'PATCH', `/suppliers/${supplier.id}/status`, { status: 'ACTIVE' });

  const suppliersAfterUpdate = await request(manageToken, 'GET', `/suppliers?search=${encodeURIComponent(run)}`);
  assert(suppliersAfterUpdate.some((item) => item.id === supplier.id), 'search should include updated supplier');

  await request(manageToken, 'DELETE', `/suppliers/${supplier.id}`);
  const suppliersAfterDelete = await request(manageToken, 'GET', `/suppliers?search=${encodeURIComponent(`${run} API Supplier Updated`)}`);
  assert(!suppliersAfterDelete.some((item) => item.id === supplier.id), 'deleted supplier should not be listed');
  const categoriesAfterDelete = await request(manageToken, 'GET', '/supplier-categories');
  const countedAfterDelete = categoriesAfterDelete.find((item) => item.id === category.id);
  assert(Number(countedAfterDelete?._count?.suppliers || 0) === 0, 'category count should ignore soft-deleted suppliers');
  await request(manageToken, 'DELETE', `/supplier-categories/${category.id}`, undefined, [409]);

  const usedDeleteResult = await request(manageToken, 'DELETE', `/suppliers/${usedSupplierId}`, undefined, [409]);
  const usedDeleteMessage = messageOf(usedDeleteResult);
  assert(usedDeleteMessage.includes('đang được sử dụng'), 'used supplier delete should explain active usage');
  assert(usedDeleteMessage.includes('dịch vụ điều hành trong đơn'), 'delete guard should report order/operation usage');
  assert(usedDeleteMessage.includes('yêu cầu thanh toán'), 'delete guard should report supplier payment request usage');
  assert(usedDeleteMessage.includes('phiếu chi'), 'delete guard should report finance payment usage');
  assert(/(?:\(|, )1 dịch vụ điều hành(?:,|\))/.test(usedDeleteMessage), 'delete guard should report operation service usage');

  const missingCategoryError = await request(manageToken, 'POST', '/suppliers', { name: `${run} Missing Category` }, [400]);
  assert(messageOf(missingCategoryError).includes('Mã loại nhà cung cấp'), 'missing category error should be clear and Vietnamese');
  const missingNameError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id }, [400]);
  assert(messageOf(missingNameError).includes('Tên nhà cung cấp'), 'missing supplier name error should be clear and Vietnamese');
  const invalidContactError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id, name: `${run} Invalid Contact`, phone: 'abcxyz', email: 'bad-email' }, [400]);
  assert(messageOf(invalidContactError).includes('Số điện thoại nhà cung cấp không hợp lệ'), 'invalid phone should return Vietnamese validation message');
  assert(messageOf(invalidContactError).includes('Email nhà cung cấp không hợp lệ'), 'invalid email should return Vietnamese validation message');
  const invalidSupplierStatusError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id, name: `${run} Invalid Supplier Status`, status: 'UNKNOWN' }, [400]);
  assert(messageOf(invalidSupplierStatusError).includes('Trạng thái nhà cung cấp không hợp lệ'), 'invalid supplier status should return Vietnamese validation message');
  const invalidSupplierRatingError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id, name: `${run} Invalid Supplier Rating`, rating: 6 }, [400]);
  assert(messageOf(invalidSupplierRatingError).includes('Xếp hạng nhà cung cấp không được lớn hơn 5'), 'invalid supplier rating should return Vietnamese validation message');
  const longPolicyError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id, name: `${run} Long Policy`, pricePolicy: 'x'.repeat(2001) }, [400]);
  assert(messageOf(longPolicyError).includes('Chính sách giá không được vượt quá 2.000 ký tự'), 'long price policy should be rejected');

  const unsupportedTypedCreate = await request(manageToken, 'POST', '/suppliers/not-a-supplier-type', {
    supplierCode: `${run}-UNKNOWN-TYPE`, name: `${run} Unknown Type`, phone: '0907777888',
  }, [404]);
  assert(messageOf(unsupportedTypedCreate).includes('Loại nhà cung cấp không được hỗ trợ'), 'unknown typed mutation should return a Vietnamese contract error');

  const invalidTypedField = await request(manageToken, 'POST', '/suppliers/flights', {
    supplierCode: `${run}-FLIGHT-UNKNOWN-FIELD`, name: `${run} Flight Unknown Field`, phone: '0907777888',
    services: [{ serviceName: 'Vé máy bay', metadata: { unknownField: 'x' } }],
  }, [400]);
  assert(messageOf(invalidTypedField).includes('không hợp lệ với loại nhà cung cấp đã chọn'), 'typed metadata should reject unsupported fields');
  const invalidTypedNumber = await request(manageToken, 'POST', '/suppliers/flights', {
    supplierCode: `${run}-FLIGHT-BAD-NUMBER`, name: `${run} Flight Bad Number`, phone: '0907777888',
    services: [{ serviceName: 'Vé máy bay', metadata: { taxPrice: 'abc' } }],
  }, [400]);
  assert(messageOf(invalidTypedNumber).includes('taxPrice phải là số không âm'), 'typed metadata should validate numeric fields');
  const invalidTypedDate = await request(manageToken, 'POST', '/suppliers/flights', {
    supplierCode: `${run}-FLIGHT-BAD-DATE`, name: `${run} Flight Bad Date`, phone: '0907777888',
    services: [{ serviceName: 'Vé máy bay', metadata: { departureDate: '2026-02-30' } }],
  }, [400]);
  assert(messageOf(invalidTypedDate).includes('departureDate phải là ngày hợp lệ'), 'typed metadata should validate real calendar dates');
  const duplicateTypedServiceSkuError = await request(manageToken, 'POST', '/suppliers/flights', {
    supplierCode: `${run}-FLIGHT-DUP-SERVICE-SKU`, name: `${run} Flight Duplicate Service SKU`, phone: '0907777888',
    services: [
      { sku: 'flight-basic', serviceName: 'Vé máy bay cơ bản' },
      { sku: 'FLIGHT-BASIC', serviceName: 'Vé máy bay nâng hạng' },
    ],
  }, [400]);
  assert(messageOf(duplicateTypedServiceSkuError).includes('Mã dịch vụ không được trùng'), 'typed service sku must be unique inside one supplier payload');
  const invalidTypedServiceMoneyError = await request(manageToken, 'POST', '/suppliers/flights', {
    supplierCode: `${run}-FLIGHT-BAD-SERVICE-MONEY`, name: `${run} Flight Bad Service Money`, phone: '0907777888',
    services: [{ serviceName: 'Vé máy bay', accountingPrice: 1000000000000 }],
  }, [400]);
  assert(messageOf(invalidTypedServiceMoneyError).includes('Giá kế toán dòng dịch vụ 1 không được vượt quá'), 'typed service price must use the supplier money upper bound');
  const longTypedServiceNoteError = await request(manageToken, 'POST', '/suppliers/flights', {
    supplierCode: `${run}-FLIGHT-LONG-SERVICE-NOTE`, name: `${run} Flight Long Service Note`, phone: '0907777888',
    services: [{ serviceName: 'Vé máy bay', note: 'x'.repeat(2001) }],
  }, [400]);
  assert(messageOf(longTypedServiceNoteError).includes('Ghi chú dịch vụ không được vượt quá 2.000 ký tự'), 'typed service note must be length-limited');

  const flightSupplier = await request(manageToken, 'POST', '/suppliers/flights', {
    supplierCode: `${run}-FLIGHT-METADATA`,
    name: `${run} Flight Metadata Supplier`,
    taxCode: `TAX-${run}`,
    phone: '0907777888',
    province: `  ${run}   Flight Province  `,
    market: `  ${run}   Flight Market  `,
    contacts: [{
      fullName: `  ${run} Flight Contact  `,
      position: '  Flight Booker  ',
      phone: '0907777000',
      email: `flight-contact-${lowerRun}@smarttour.local`,
    }],
    services: [{
      sku: `${run}-FLIGHT-OLD-SKU`,
      serviceName: 'Vé máy bay khứ hồi',
      netPrice: 1000000,
      sellingPrice: 1200000,
      description: `${run} Flight Description`,
      note: `${run} Flight Note`,
      metadata: { departureDate: '2026-06-12', departureTime: '08:30', taxPrice: '100000', route: 'HAN-SGN' },
    }],
  });
  assert(flightSupplier.category?.name === 'Vé máy bay', 'new typed supplier should use the Vietnamese canonical category');
  assert(flightSupplier.province === `${run} Flight Province`, 'typed supplier create should normalize province');
  assert(flightSupplier.market === `${run} Flight Market`, 'typed supplier create should normalize market');
  assert(flightSupplier.contacts?.[0]?.fullName === `${run} Flight Contact`, 'typed supplier detail should include editable contacts');
  assert(flightSupplier.supplierServices?.[0]?.metadata?.taxPrice === 100000, 'typed numeric metadata should be normalized before persistence');
  const typedUploadedFile = await uploadRequest(manageToken, `/suppliers/${flightSupplier.id}/files`, 'typed-supplier-note.txt', 'text/plain', 'typed supplier file smoke');
  const flightDetailWithFile = await request(manageToken, 'GET', `/suppliers/flights/${flightSupplier.id}`);
  assert(flightDetailWithFile.files?.some((file) => file.id === typedUploadedFile.id), 'typed detail must include uploaded files for edit forms');
  for (const [filter, value] of [
    ['province', `${run} Flight Province`],
    ['market', `${run} Flight Market`],
    ['status', 'ACTIVE'],
  ]) {
    const filteredTypedSuppliers = await request(manageToken, 'GET', `/suppliers/flights?${filter}=${encodeURIComponent(value)}`);
    assert(filteredTypedSuppliers.some((item) => item.id === flightSupplier.id), `typed supplier ${filter} filter should include matching supplier`);
  }
  for (const keyword of [
    `TAX-${run}`,
    `${run} Flight Province`,
    `${run} Flight Market`,
    `${run} Flight Contact`,
    'Flight Booker',
    `${run}-FLIGHT-OLD-SKU`,
    `${run} Flight Description`,
    `${run} Flight Note`,
  ]) {
    const searchedTypedSuppliers = await request(manageToken, 'GET', `/suppliers/flights?search=${encodeURIComponent(keyword)}`);
    assert(searchedTypedSuppliers.some((item) => item.id === flightSupplier.id), `typed supplier search should include keyword ${keyword}`);
  }
  const flightPartialUpdate = await request(manageToken, 'PUT', `/suppliers/flights/${flightSupplier.id}`, { name: `${run} Flight Metadata Updated` });
  assert(flightPartialUpdate.supplierServices?.length === 1, 'typed partial update must preserve services when services are omitted');
  assert(flightPartialUpdate.contacts?.[0]?.fullName === `${run} Flight Contact`, 'typed partial update must preserve contacts when contacts are omitted');
  assert(flightPartialUpdate.files?.some((file) => file.id === typedUploadedFile.id), 'typed partial update must preserve files when files are omitted');
  assert(flightPartialUpdate.category?.name === 'Vé máy bay', 'typed partial update must preserve the Vietnamese category mapping');
  const oldFlightServiceId = flightPartialUpdate.supplierServices[0].id;
  const flightServiceReplaced = await request(manageToken, 'PUT', `/suppliers/flights/${flightSupplier.id}`, {
    services: [{
      sku: `${run}-FLIGHT-NEW-SKU`,
      serviceName: 'Vé máy bay nội địa',
      netPrice: 900000,
      sellingPrice: 1100000,
      description: `${run} Flight Description Updated`,
      metadata: { departureDate: '2026-06-13', departureTime: '09:30', taxPrice: '90000', route: 'HAN-DAD' },
    }],
  });
  assert(flightServiceReplaced.supplierServices?.length === 1, 'typed service replacement should return one active service');
  assert(flightServiceReplaced.supplierServices[0].id !== oldFlightServiceId, 'typed service replacement should create a fresh active service');
  assert(flightServiceReplaced.supplierServices[0].metadata?.taxPrice === 90000, 'typed replacement metadata should be normalized');
  assert(flightServiceReplaced.contacts?.[0]?.fullName === `${run} Flight Contact`, 'typed service replacement must preserve contacts when contacts are omitted');
  assert(flightServiceReplaced.files?.some((file) => file.id === typedUploadedFile.id), 'typed service replacement must preserve files when files are omitted');
  await request(manageToken, 'DELETE', `/suppliers/${flightSupplier.id}/files/${typedUploadedFile.id}`);
  const flightAfterFileDelete = await request(manageToken, 'GET', `/suppliers/flights/${flightSupplier.id}`);
  assert(!flightAfterFileDelete.files?.some((file) => file.id === typedUploadedFile.id), 'typed file delete must remove only the file metadata');
  assert(flightAfterFileDelete.contacts?.[0]?.fullName === `${run} Flight Contact` && flightAfterFileDelete.supplierServices?.length === 1, 'typed file delete must not affect contacts or services');
  const oldServiceSearch = await request(manageToken, 'GET', `/suppliers/flights?search=${encodeURIComponent(`${run}-FLIGHT-OLD-SKU`)}`);
  assert(!oldServiceSearch.some((item) => item.id === flightSupplier.id), 'typed service replacement should hide soft-deleted old services from list search');
  const newServiceSearch = await request(manageToken, 'GET', `/suppliers/flights?search=${encodeURIComponent(`${run}-FLIGHT-NEW-SKU`)}`);
  assert(newServiceSearch.some((item) => item.id === flightSupplier.id), 'typed service replacement should expose the new active service in list search');
  const typedServiceDeleteError = await request(manageToken, 'DELETE', `/suppliers/flights/${flightSupplier.id}`, undefined, [409]);
  assert(messageOf(typedServiceDeleteError).includes('dịch vụ nhà cung cấp'), 'typed delete should use the shared relation safety guard');

  const typedSupplier = await request(manageToken, 'POST', '/suppliers/restaurants', {
    supplierCode: `${run}-RESTAURANT`,
    name: `${run} Restaurant Supplier`,
    phone: '0907777888',
  });
  assert(typedSupplier.category?.name === 'Nhà hàng', 'restaurant supplier should use the Vietnamese category mapping');
  const wrongTypedSupplierError = await request(manageToken, 'DELETE', `/suppliers/flights/${typedSupplier.id}`, undefined, [404]);
  assert(messageOf(wrongTypedSupplierError).includes('Không tìm thấy nhà cung cấp thuộc loại đã chọn'), 'typed supplier mismatch should return a clear Vietnamese message');
  const wrongTypedStatusError = await request(manageToken, 'PATCH', `/suppliers/flights/${typedSupplier.id}/status`, { status: 'INACTIVE' }, [404]);
  assert(messageOf(wrongTypedStatusError).includes('Không tìm thấy nhà cung cấp thuộc loại đã chọn'), 'typed supplier status mismatch should return a clear Vietnamese message');
  const typedSupplierAfterWrongDelete = await request(manageToken, 'GET', `/suppliers/restaurants/${typedSupplier.id}`);
  assert(typedSupplierAfterWrongDelete.id === typedSupplier.id, 'wrong typed delete must not remove supplier from another type');
  const typedUpdated = await request(manageToken, 'PUT', `/suppliers/restaurants/${typedSupplier.id}`, { name: `${run} Restaurant Supplier Updated` });
  assert(typedUpdated.name.endsWith('Updated'), 'typed supplier manage permission should allow update');
  const typedInactive = await request(manageToken, 'PATCH', `/suppliers/restaurants/${typedSupplier.id}/status`, { status: 'INACTIVE' });
  assert(typedInactive.status === 'INACTIVE', 'typed supplier manage permission should allow status update');
  const typedInactiveDetail = await request(manageToken, 'GET', `/suppliers/restaurants/${typedSupplier.id}`);
  assert(typedInactiveDetail.status === 'INACTIVE', 'typed supplier detail must reflect the latest status');
  const typedInactiveList = await request(manageToken, 'GET', `/suppliers/restaurants?status=INACTIVE&search=${encodeURIComponent(`${run} Restaurant Supplier Updated`)}`);
  assert(typedInactiveList.some((item) => item.id === typedSupplier.id && item.status === 'INACTIVE'), 'typed supplier inactive status must be visible in the filtered list used by the frontend');
  const typedActiveList = await request(manageToken, 'GET', `/suppliers/restaurants?status=ACTIVE&search=${encodeURIComponent(`${run} Restaurant Supplier Updated`)}`);
  assert(!typedActiveList.some((item) => item.id === typedSupplier.id), 'typed supplier inactive status must remove the row from the active filtered list');
  await request(manageToken, 'DELETE', `/suppliers/restaurants/${typedSupplier.id}`);
  await request(manageToken, 'GET', `/suppliers/restaurants/${typedSupplier.id}`, undefined, [404]);
  await request(manageToken, 'GET', `/suppliers/${typedSupplier.id}`, undefined, [404]);
  const typedDeletedList = await request(manageToken, 'GET', `/suppliers/restaurants?search=${encodeURIComponent(`${run} Restaurant Supplier Updated`)}`);
  assert(!typedDeletedList.some((item) => item.id === typedSupplier.id), 'soft-deleted typed supplier must not appear in typed lists');

  const ownedDataHotel = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-OWNED-DATA`,
    name: `${run} Hotel Owned Data`,
    phone: '0905555666',
    province: `  ${run}   Province  `,
    address: `${run} Hotel Address`,
    website: `https://hotel-${lowerRun}.example.com`,
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Owned Data Project`,
    market: `  ${run}   Market  `,
    bankAccountName: `${run} Hotel Bank Account`,
    bankAccountNumber: `${run} Hotel Bank Number`,
    bankName: `${run} Hotel Bank`,
    link: `https://hotel-${lowerRun}.example.com/ref`,
    rating: 4,
    builtYear: 2020,
    contacts: [{
      fullName: `${run} Hotel Contact`,
      position: 'Hotel Sales',
      phone: '0905555000',
      email: `hotel-contact-${lowerRun}@smarttour.local`,
    }],
    services: [{
      sku: `${run}-HOTEL-SERVICE-SKU`,
      serviceName: 'Phong tieu chuan',
      description: `${run} Hotel Service Description`,
      note: 'Service note',
    }],
    allotments: [{
      sku: `${run}-HOTEL-ALLOTMENT-SKU`,
      serviceName: 'Quy phong tieu chuan',
      startDate: '2026-06-01',
      endDate: '2030-12-31',
      allotmentQty: 2,
      cutoffDays: 0,
      sellingPricePerDay: 500000,
      description: `${run} Hotel Allotment Description`,
      note: 'Initial allotment',
    }],
  });
  assert(ownedDataHotel.supplierCode === `${run}-HOTEL-OWNED-DATA`, 'hotel supplier code should be normalized');
  assert(ownedDataHotel.province === `${run} Province`, 'province display label should normalize whitespace without changing case');
  assert(ownedDataHotel.hotelProfile?.market === `${run} Market`, 'hotel-specific market must be persisted');
  assert(ownedDataHotel.supplierServices?.length === 1 && ownedDataHotel.allotments?.length === 1, 'hotel detail must include editable child collections');
  assert(ownedDataHotel.contacts?.[0]?.fullName === `${run} Hotel Contact`, 'hotel detail must include editable contacts');
  assert(Number(ownedDataHotel.allotments[0].lockedQty || 0) === Number(ownedDataHotel.allotments[0].quantityLock || 0), 'created hotel allotment must sync lockedQty and quantityLock');
  const ownedAllotmentId = ownedDataHotel.allotments[0].id;
  assert(ownedAllotmentId, 'created hotel allotment must expose its id');
  const hotelUploadedFile = await uploadRequest(manageToken, `/suppliers/${ownedDataHotel.id}/files`, 'hotel-supplier-note.txt', 'text/plain', 'hotel supplier file smoke');
  const hotelDetailWithFile = await request(manageToken, 'GET', `/suppliers/hotels/${ownedDataHotel.id}`);
  assert(hotelDetailWithFile.files?.some((file) => file.id === hotelUploadedFile.id), 'hotel detail must include uploaded files for edit forms');

  for (const [filter, value] of [
    ['province', `${run} Province`],
    ['hotelProject', `${run} Hotel Owned Data Project`],
    ['classHotel', '4 sao'],
    ['market', `${run} Market`],
    ['status', 'ACTIVE'],
  ]) {
    const filteredHotels = await request(manageToken, 'GET', `/suppliers/hotels?${filter}=${encodeURIComponent(value)}`);
    assert(filteredHotels.some((item) => item.id === ownedDataHotel.id), `hotel ${filter} filter should include the matching supplier`);
  }
  for (const keyword of [
    `${run} Province`,
    `${run} Hotel Owned Data Project`,
    '4 sao',
    `${run} Market`,
    `${run} Hotel Address`,
    `${run} Hotel Contact`,
    'Hotel Sales',
    `${run}-HOTEL-SERVICE-SKU`,
    `${run} Hotel Service Description`,
    `${run}-HOTEL-ALLOTMENT-SKU`,
    `${run} Hotel Allotment Description`,
    `${run} Hotel Bank`,
  ]) {
    const searchedHotels = await request(manageToken, 'GET', `/suppliers/hotels?search=${encodeURIComponent(keyword)}`);
    assert(searchedHotels.some((item) => item.id === ownedDataHotel.id), `hotel search should include nested keyword ${keyword}`);
  }

  const partiallyUpdatedHotel = await request(manageToken, 'PUT', `/suppliers/hotels/${ownedDataHotel.id}`, {
    market: `  ${run}   Market Updated  `,
  });
  assert(partiallyUpdatedHotel.hotelProfile?.market === `${run} Market Updated`, 'hotel partial update must update the requested profile field');
  assert(partiallyUpdatedHotel.hotelProfile?.hotelProject === `${run} Hotel Owned Data Project`, 'hotel partial update must preserve project');
  assert(partiallyUpdatedHotel.contacts?.[0]?.fullName === `${run} Hotel Contact`, 'hotel partial update must preserve contacts when omitted');
  assert(partiallyUpdatedHotel.supplierServices?.[0]?.id === ownedDataHotel.supplierServices[0].id, 'hotel partial update must preserve services when omitted');
  assert(partiallyUpdatedHotel.allotments?.[0]?.id === ownedAllotmentId, 'hotel partial update must preserve allotments when omitted');
  assert(partiallyUpdatedHotel.files?.some((file) => file.id === hotelUploadedFile.id), 'hotel partial update must preserve uploaded files when omitted');
  await request(manageToken, 'DELETE', `/suppliers/${ownedDataHotel.id}/files/${hotelUploadedFile.id}`);
  const hotelAfterFileDelete = await request(manageToken, 'GET', `/suppliers/hotels/${ownedDataHotel.id}`);
  assert(!hotelAfterFileDelete.files?.some((file) => file.id === hotelUploadedFile.id), 'hotel file delete must remove only the file metadata');
  assert(hotelAfterFileDelete.contacts?.[0]?.fullName === `${run} Hotel Contact` && hotelAfterFileDelete.supplierServices?.length === 1 && hotelAfterFileDelete.allotments?.length === 1, 'hotel file delete must not affect contacts, services, or allotments');

  const profileValidationError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-PROFILE`,
    name: `${run} Hotel Bad Profile`,
    phone: 'abc',
    classHotel: 'x',
    hotelProject: 'y',
    website: 'hotel.example.com',
    link: 'ftp://hotel.example.com/ref',
    rating: 6,
    builtYear: new Date().getFullYear() + 1,
  }, [400]);
  const profileValidationMessage = messageOf(profileValidationError);
  assert(profileValidationMessage.includes('S\u1ed1 \u0111i\u1ec7n tho\u1ea1i'), 'hotel phone validation must be Vietnamese');
  assert(profileValidationMessage.includes('H\u1ea1ng kh\u00e1ch s\u1ea1n'), 'hotel class validation must be Vietnamese');
  assert(profileValidationMessage.includes('D\u1ef1 \u00e1n kh\u00e1ch s\u1ea1n'), 'hotel project validation must be Vietnamese');
  assert(profileValidationMessage.includes('Website nh\u00e0 cung c\u1ea5p'), 'hotel website validation must be Vietnamese');
  assert(profileValidationMessage.includes('Li\u00ean k\u1ebft tham kh\u1ea3o'), 'hotel link validation must be Vietnamese');
  assert(profileValidationMessage.includes('X\u1ebfp h\u1ea1ng kh\u00e1ch s\u1ea1n'), 'hotel rating validation must be Vietnamese');
  assert(profileValidationMessage.includes('N\u0103m x\u00e2y d\u1ef1ng'), 'hotel built year validation must be Vietnamese');

  const contactValidationError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-CONTACT`,
    name: `${run} Hotel Bad Contact`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Bad Contact Project`,
    contacts: [{ fullName: 'A', birthday: 'khong-phai-ngay', phone: 'abc', email: 'bad-email' }],
  }, [400]);
  const contactValidationMessage = messageOf(contactValidationError);
  assert(contactValidationMessage.includes('T\u00ean ng\u01b0\u1eddi li\u00ean h\u1ec7'), 'contact fullName validation must be Vietnamese');
  assert(contactValidationMessage.includes('Ng\u00e0y sinh ng\u01b0\u1eddi li\u00ean h\u1ec7'), 'contact birthday validation must be Vietnamese');
  assert(contactValidationMessage.includes('S\u1ed1 \u0111i\u1ec7n tho\u1ea1i ng\u01b0\u1eddi li\u00ean h\u1ec7'), 'contact phone validation must be Vietnamese');
  assert(contactValidationMessage.includes('Email ng\u01b0\u1eddi li\u00ean h\u1ec7'), 'contact email validation must be Vietnamese');

  const filteredInventory = await request(manageToken, 'GET', `/suppliers/hotel-allotments/inventory?supplierId=${ownedDataHotel.id}&startDate=2027-01-01&endDate=2027-01-31`);
  const initialInventory = filteredInventory.find((item) => item.id === ownedAllotmentId);
  assert(initialInventory?.allotmentQty === 2 && initialInventory.remainingQty === 2, 'inventory date and supplier filters must return correct quantities');
  assert(initialInventory.allocationSummary?.locked === 0 && initialInventory.activeAllocationCount === 0, 'inventory must expose an empty allocation summary');
  const invalidCalendarDate = await request(manageToken, 'GET', '/suppliers/hotel-allotments/inventory?startDate=2026-02-30', undefined, [400]);
  assert(messageOf(invalidCalendarDate).includes('Ng\u00e0y b\u1eaft \u0111\u1ea7u kh\u00f4ng h\u1ee3p l\u1ec7'), 'inventory must reject impossible calendar dates');

  const missingOverrideReason = await request(manageToken, 'PATCH', `/suppliers/hotel-allotments/${ownedAllotmentId}/override`, { allotmentQty: 3 }, [400]);
  assert(messageOf(missingOverrideReason).includes('L\u00fd do \u0111i\u1ec1u ch\u1ec9nh qu\u1ef9 ph\u00f2ng'), 'allotment override must require a Vietnamese reason');
  const emptyOverride = await request(manageToken, 'PATCH', `/suppliers/hotel-allotments/${ownedAllotmentId}/override`, { note: 'No change smoke' }, [400]);
  assert(messageOf(emptyOverride).includes('\u00edt nh\u1ea5t m\u1ed9t gi\u00e1 tr\u1ecb'), 'allotment override must change at least one value');
  const noEffectiveOverride = await request(manageToken, 'PATCH', `/suppliers/hotel-allotments/${ownedAllotmentId}/override`, { allotmentQty: 2, status: 'ACTIVE', note: 'No effective change smoke' }, [400]);
  assert(messageOf(noEffectiveOverride).includes('Không có giá trị quỹ phòng nào thay đổi'), 'allotment override must reject no-op changes');
  await request(manageToken, 'PATCH', `/suppliers/hotel-allotments/${ownedAllotmentId}/override`, { status: 'UNKNOWN', note: 'Invalid status smoke' }, [400]);

  const overridden = await request(manageToken, 'PATCH', `/suppliers/hotel-allotments/${ownedAllotmentId}/override`, {
    allotmentQty: 3,
    note: 'Increase inventory smoke',
    actor: 'spoofed-actor',
  });
  assert(overridden.allotmentQty === 3 && overridden.remainingQty === 3, 'allotment override must update total and remaining quantities');
  assert(overridden.logs?.[0]?.action === 'OVERRIDE', 'override response must include the newly created audit log');
  assert(overridden.logs?.[0]?.actor === process.env.MANAGE_USER_ID, 'override audit must use the authenticated actor');
  assert(overridden.logs?.[0]?.note === 'Increase inventory smoke', 'override audit must preserve the reason');
  assert(overridden.logs?.[0]?.newValue?.changes?.some((change) => change.field === 'allotmentQty' && change.value === 3), 'override audit must expose changed fields');

  const invalidLockQuantity = await request(manageToken, 'POST', `/suppliers/hotel-allotments/${ownedAllotmentId}/lock`, {
    quantity: 0,
    note: 'Invalid quantity smoke',
  }, [400]);
  assert(messageOf(invalidLockQuantity).includes('Số phòng giữ chỗ phải lớn hơn 0'), 'lock must validate quantity in the service layer');
  const wrongServiceLock = await request(manageToken, 'POST', `/suppliers/hotel-allotments/${ownedAllotmentId}/lock`, {
    quantity: 1,
    serviceId: flightServiceReplaced.supplierServices[0].id,
    note: 'Wrong service smoke',
  }, [400]);
  assert(messageOf(wrongServiceLock).includes('không thuộc nhà cung cấp khách sạn'), 'lock must reject service ids from another supplier');

  const locked = await request(manageToken, 'POST', `/suppliers/hotel-allotments/${ownedAllotmentId}/lock`, {
    quantity: 1,
    note: 'Lock inventory smoke',
    orderId: process.env.USED_ORDER_ID,
    bookingId: process.env.USED_BOOKING_ID,
    actor: 'spoofed-actor',
  });
  assert(locked.allocation?.status === 'LOCKED' && locked.allocation.quantity === 1, 'locking inventory must create a locked allocation');
  assert(locked.allocation.createdBy === process.env.MANAGE_USER_ID, 'allocation must record the authenticated actor');
  assert(locked.allocation.orderId === process.env.USED_ORDER_ID && locked.allocation.bookingId === process.env.USED_BOOKING_ID, 'locked allocation must keep order and booking linkage');
  assert(locked.inventory.lockedQty === 1 && locked.inventory.remainingQty === 2, 'locking inventory must atomically update quantities');
  assert(locked.inventory.quantityLock === locked.inventory.lockedQty, 'locking inventory must keep quantityLock synced with lockedQty');
  assert(locked.inventory.activeAllocationCount === 1 && locked.inventory.allocationSummary?.locked === 1, 'lock response must expose active allocation summary');
  assert(locked.inventory.logs?.[0]?.action === 'LOCK' && locked.inventory.logs[0].actor === process.env.MANAGE_USER_ID, 'lock audit must record action and actor');
  const allocationId = locked.allocation.id;

  const overCapacityLock = await request(manageToken, 'POST', `/suppliers/hotel-allotments/${ownedAllotmentId}/lock`, { quantity: 3 }, [409]);
  assert(messageOf(overCapacityLock).includes('kh\u00f4ng \u0111\u1ee7'), 'locking beyond remaining inventory must fail');
  const activeOverrideError = await request(manageToken, 'PATCH', `/suppliers/hotel-allotments/${ownedAllotmentId}/override`, { bookedQty: 1, note: 'Unsafe direct update' }, [409]);
  assert(messageOf(activeOverrideError).includes('ph\u00e2n b\u1ed5 qu\u1ef9 ph\u00f2ng ho\u1ea1t \u0111\u1ed9ng'), 'direct booked or locked override must be blocked while allocations are active');
  const activeReplacementError = await request(manageToken, 'PUT', `/suppliers/hotels/${ownedDataHotel.id}`, {
    allotments: [{ serviceName: 'Replacement inventory', allotmentQty: 3 }],
  }, [409]);
  assert(messageOf(activeReplacementError).includes('ph\u00e2n b\u1ed5 \u0111ang kh\u00f3a ho\u1eb7c \u0111\u00e3 x\u00e1c nh\u1eadn'), 'hotel update must not replace allotments with active allocations');

  const confirmed = await request(manageToken, 'POST', `/suppliers/hotel-allotment-allocations/${allocationId}/confirm`, { note: 'Confirm inventory smoke' });
  assert(confirmed.allocation.status === 'CONFIRMED' && confirmed.idempotent === false, 'confirm must transition a locked allocation');
  assert(confirmed.inventory.lockedQty === 0 && confirmed.inventory.bookedQty === 1, 'confirm must move quantity from locked to booked');
  assert(confirmed.inventory.quantityLock === confirmed.inventory.lockedQty, 'confirm must keep quantityLock synced with lockedQty');
  assert(confirmed.inventory.logs?.[0]?.action === 'CONFIRMED', 'confirm must write an audit log');
  const confirmedAgain = await request(manageToken, 'POST', `/suppliers/hotel-allotment-allocations/${allocationId}/confirm`, { note: 'Repeat confirm smoke' });
  assert(confirmedAgain.idempotent === true && confirmedAgain.inventory.bookedQty === 1, 'repeat confirm must be idempotent');

  const releaseWithoutReason = await request(manageToken, 'POST', `/suppliers/hotel-allotment-allocations/${allocationId}/release`, {}, [400]);
  assert(messageOf(releaseWithoutReason).includes('l\u00fd do gi\u1ea3i ph\u00f3ng'), 'release must require a Vietnamese reason');
  const released = await request(manageToken, 'POST', `/suppliers/hotel-allotment-allocations/${allocationId}/release`, { note: 'Release inventory smoke' });
  assert(released.allocation.status === 'RELEASED' && released.idempotent === false, 'release must transition a confirmed allocation');
  assert(released.inventory.bookedQty === 0 && released.inventory.lockedQty === 0 && released.inventory.remainingQty === 3, 'release must return inventory quantity');
  assert(released.inventory.quantityLock === released.inventory.lockedQty, 'release must keep quantityLock synced with lockedQty');
  assert(released.inventory.logs?.[0]?.action === 'RELEASED' && released.inventory.logs[0].actor === process.env.MANAGE_USER_ID, 'release must write actor audit data');
  const releasedAgain = await request(manageToken, 'POST', `/suppliers/hotel-allotment-allocations/${allocationId}/release`, { note: 'Repeat release smoke' });
  assert(releasedAgain.idempotent === true && releasedAgain.inventory.remainingQty === 3, 'repeat release must be idempotent');
  await request(manageToken, 'POST', `/suppliers/hotel-allotment-allocations/${allocationId}/confirm`, { note: 'Invalid confirm after release' }, [409]);

  const inventoryAfterRelease = await request(manageToken, 'GET', `/suppliers/hotel-allotments/inventory?supplierId=${ownedDataHotel.id}`);
  const releasedInventory = inventoryAfterRelease.find((item) => item.id === ownedAllotmentId);
  assert(releasedInventory?.allocationSummary?.released === 1 && releasedInventory.activeAllocationCount === 0, 'inventory must summarize released allocations without treating them as active');
  const auditActions = new Set((releasedInventory.logs || []).map((log) => log.action));
  for (const action of ['OVERRIDE', 'LOCK', 'CONFIRMED', 'RELEASED']) {
    assert(auditActions.has(action), `allotment audit log must include ${action}`);
  }

  const dashboardBeforeStopSell = await request(viewToken, 'GET', '/suppliers/hotel-allotments/dashboard');
  const stopped = await request(manageToken, 'PATCH', `/suppliers/hotel-allotments/${ownedAllotmentId}/override`, { status: 'STOP_SELL', note: 'Stop sell smoke' });
  assert(stopped.computedStatus === 'STOP_SELL', 'stop-sell override must be reflected in inventory status');
  const dashboardAfterStopSell = await request(viewToken, 'GET', '/suppliers/hotel-allotments/dashboard');
  assert(dashboardAfterStopSell.activeAllotments === dashboardBeforeStopSell.activeAllotments - 1, 'dashboard active count must decrease on stop-sell');
  assert(dashboardAfterStopSell.stopSellAllotments === dashboardBeforeStopSell.stopSellAllotments + 1, 'dashboard stop-sell count must increase exactly once');
  assert(dashboardAfterStopSell.allotmentCount >= 1 && typeof dashboardAfterStopSell.sellThroughRate === 'number', 'dashboard must expose complete numeric metrics');

  const ownedDataDeleteError = await request(manageToken, 'DELETE', `/suppliers/${ownedDataHotel.id}`, undefined, [409]);
  const ownedDataDeleteMessage = messageOf(ownedDataDeleteError);
  assert(ownedDataDeleteMessage.includes('d\u1ecbch v\u1ee5 nh\u00e0 cung c\u1ea5p'), 'supplier delete should report linked supplier services');
  assert(ownedDataDeleteMessage.includes('qu\u1ef9 ph\u00f2ng'), 'supplier delete should report linked allotments');

  const duplicateHotelServiceSkuError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-DUP-SERVICE-SKU`,
    name: `${run} Hotel Duplicate Service SKU`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Duplicate Service Project`,
    services: [
      { sku: 'room-std', serviceName: 'Phòng tiêu chuẩn A' },
      { sku: 'ROOM-STD', serviceName: 'Phòng tiêu chuẩn B' },
    ],
  }, [400]);
  assert(messageOf(duplicateHotelServiceSkuError).includes('Mã dịch vụ không được trùng'), 'hotel service sku must be unique inside one supplier payload');
  const missingHotelServiceNameError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-MISSING-SERVICE-NAME`,
    name: `${run} Hotel Missing Service Name`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Missing Service Project`,
    services: [{ sku: 'ROOM-MISSING-NAME' }],
  }, [400]);
  assert(messageOf(missingHotelServiceNameError).includes('Cần nhập tên dịch vụ'), 'hotel service name should be required with a Vietnamese message');
  const invalidHotelServiceMoneyError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-SERVICE-MONEY`,
    name: `${run} Hotel Bad Service Money`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Bad Service Money Project`,
    services: [{ serviceName: 'Phòng tiêu chuẩn', accountingPrice: 1000000000000 }],
  }, [400]);
  assert(messageOf(invalidHotelServiceMoneyError).includes('Giá kế toán dịch vụ không được vượt quá'), 'hotel service price must use the supplier money upper bound');
  const longHotelServiceDescriptionError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-LONG-SERVICE-DESC`,
    name: `${run} Hotel Long Service Description`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Long Service Description Project`,
    services: [{ serviceName: 'Phòng tiêu chuẩn', description: 'x'.repeat(2001) }],
  }, [400]);
  assert(messageOf(longHotelServiceDescriptionError).includes('Mô tả dịch vụ không được vượt quá 2.000 ký tự'), 'hotel service description must be length-limited');
  const invalidHotelDateError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-DATE`,
    name: `${run} Hotel Invalid Date`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Invalid Date Project`,
    services: [{ serviceName: 'Phòng tiêu chuẩn', startDate: 'khong-phai-ngay' }],
  }, [400]);
  const invalidHotelDateMessage = messageOf(invalidHotelDateError);
  assert(invalidHotelDateMessage.includes('Ngày bắt đầu dịch vụ') && (invalidHotelDateMessage.includes('không hợp lệ') || invalidHotelDateMessage.includes('định dạng YYYY-MM-DD')), 'invalid service date should return a Vietnamese message');

  const reversedHotelServiceDateError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-REVERSED-SERVICE-DATE`,
    name: `${run} Hotel Reversed Service Date`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Reversed Service Date Project`,
    services: [{ serviceName: 'Phòng tiêu chuẩn', startDate: '2026-06-12', endDate: '2026-06-11' }],
  }, [400]);
  assert(messageOf(reversedHotelServiceDateError).includes('Ngày bắt đầu dịch vụ không được sau ngày kết thúc dịch vụ'), 'reversed service dates should return a Vietnamese message');


  const invalidHotelCalendarDateError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-CALENDAR-DATE`,
    name: `${run} Hotel Invalid Calendar Date`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Invalid Calendar Date Project`,
    allotments: [{ serviceName: 'Quy phong calendar', startDate: '2026-02-30' }],
  }, [400]);
  assert(messageOf(invalidHotelCalendarDateError).includes('Ng\u00e0y b\u1eaft \u0111\u1ea7u qu\u1ef9 ph\u00f2ng kh\u00f4ng h\u1ee3p l\u1ec7'), 'impossible hotel calendar date should be rejected');

  const reversedHotelDateError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-REVERSED-DATE`,
    name: `${run} Hotel Reversed Date`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Reversed Date Project`,
    allotments: [{ serviceName: 'Quỹ phòng tiêu chuẩn', startDate: '2026-06-12', endDate: '2026-06-11' }],
  }, [400]);
  assert(messageOf(reversedHotelDateError).includes('Ngày bắt đầu quỹ phòng không được sau ngày kết thúc quỹ phòng'), 'reversed allotment dates should return a Vietnamese message');

  const invalidAllotmentStatusError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-STATUS`,
    name: `${run} Hotel Invalid Status`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Invalid Status Project`,
    allotments: [{ serviceName: 'Quỹ phòng tiêu chuẩn', status: 'UNKNOWN' }],
  }, [400]);
  assert(messageOf(invalidAllotmentStatusError).includes('Trạng thái quỹ phòng không hợp lệ'), 'invalid allotment status should return a Vietnamese message');

  const missingAllotmentNameError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-MISSING-ALLOTMENT-NAME`,
    name: `${run} Hotel Missing Allotment Name`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Missing Allotment Project`,
    allotments: [{ sku: 'ROOM-MISSING-ALLOTMENT-NAME', allotmentQty: 1 }],
  }, [400]);
  assert(messageOf(missingAllotmentNameError).includes('Cần nhập tên quỹ phòng'), 'hotel allotment name should be required with a Vietnamese message');

  const longAllotmentNameError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-LONG-ALLOTMENT-NAME`,
    name: `${run} Hotel Long Allotment Name`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Long Allotment Project`,
    allotments: [{ serviceName: 'x'.repeat(181), allotmentQty: 1 }],
  }, [400]);
  assert(messageOf(longAllotmentNameError).includes('Tên quỹ phòng không được vượt quá 180 ký tự'), 'hotel allotment name must be length-limited');

  const invalidAllotmentDateFormatError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-ALLOTMENT-DATE-FORMAT`,
    name: `${run} Hotel Bad Allotment Date Format`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Bad Allotment Date Format Project`,
    allotments: [{ serviceName: 'Quỹ phòng sai định dạng ngày', startDate: '12/06/2026' }],
  }, [400]);
  assert(messageOf(invalidAllotmentDateFormatError).includes('Ngày bắt đầu quỹ phòng') && messageOf(invalidAllotmentDateFormatError).includes('YYYY-MM-DD'), 'hotel allotment dates must require YYYY-MM-DD format');

  const invalidAllotmentCutoffError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-ALLOTMENT-CUTOFF`,
    name: `${run} Hotel Bad Allotment Cutoff`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Bad Allotment Cutoff Project`,
    allotments: [{ serviceName: 'Quỹ phòng cutoff sai', allotmentQty: 1, cutoffDays: 366 }],
  }, [400]);
  assert(messageOf(invalidAllotmentCutoffError).includes('Số ngày chốt quỹ phòng không được vượt quá'), 'hotel allotment cutoff days must be bounded');

  const invalidAllotmentMoneyError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-ALLOTMENT-MONEY`,
    name: `${run} Hotel Bad Allotment Money`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Bad Allotment Money Project`,
    allotments: [{ serviceName: 'Quỹ phòng tiền sai', allotmentQty: 1, netCostPerDay: 1000000000000 }],
  }, [400]);
  assert(messageOf(invalidAllotmentMoneyError).includes('Giá thuần mỗi ngày không được vượt quá'), 'hotel allotment money must use the supplier money upper bound');

  const mismatchedLockAliasError = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL-BAD-LOCK-ALIAS`,
    name: `${run} Hotel Bad Lock Alias`,
    phone: '0905555666',
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Bad Lock Alias Project`,
    allotments: [{ serviceName: 'Quỹ phòng lệch số giữ', allotmentQty: 4, lockedQty: 1, quantityLock: 2 }],
  }, [400]);
  assert(messageOf(mismatchedLockAliasError).includes('Số phòng đang giữ và số lượng khóa phòng phải trùng nhau'), 'hotel allotment lockedQty and quantityLock must not conflict');

  const hotel = await request(manageToken, 'POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL`,
    name: `${run} Hotel Supplier`,
    phone: '0905555666',
    email: `hotel-${lowerRun}@smarttour.local`,
    classHotel: '4 sao',
    hotelProject: `${run} Hotel Project`,
  });
  assert(hotel.hotelProfile?.hotelProject === `${run} Hotel Project`, 'hotel supplier should include hotel profile');
  assert(hotel.category?.name === 'Hotel', 'hotel supplier should use the shared Hotel category');
  const hotelList = await request(manageToken, 'GET', `/suppliers/hotels?search=${encodeURIComponent(run)}`);
  const listedHotel = hotelList.find((item) => item.id === hotel.id);
  assert(listedHotel?.category?.name === 'Hotel' && listedHotel.hotelProfile, 'hotel list response should include category and hotel profile');
  const hotelDetail = await request(manageToken, 'GET', `/suppliers/hotels/${hotel.id}`);
  assert(hotelDetail.id === hotel.id && hotelDetail.category?.name === 'Hotel', 'hotel detail response should preserve shared supplier linkage');
  const updatedHotel = await request(manageToken, 'PUT', `/suppliers/hotels/${hotel.id}`, { hotelProject: `${run} Hotel Project Updated` });
  assert(updatedHotel.hotelProfile?.hotelProject.endsWith('Updated'), 'hotel supplier manage permission should allow update');
  const hotelCategoryChangeError = await request(manageToken, 'PATCH', `/suppliers/${hotel.id}`, { categoryId: category.id }, [400]);
  assert(messageOf(hotelCategoryChangeError).includes('nhà cung cấp chuyên biệt'), 'general endpoint should not move hotel supplier to another category');
  await request(manageToken, 'DELETE', `/suppliers/${hotel.id}`);
  await request(manageToken, 'GET', `/suppliers/hotels/${hotel.id}`, undefined, [404]);
  await request(manageToken, 'GET', `/suppliers/${hotel.id}`, undefined, [404]);
  const deletedHotelList = await request(manageToken, 'GET', `/suppliers/hotels?search=${encodeURIComponent(`${run} Hotel Supplier`)}`);
  assert(!deletedHotelList.some((item) => item.id === hotel.id), 'soft-deleted hotel supplier must not appear in hotel lists');

  console.log('SMOKE_SUPPLIERS_OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE

soft_deleted_typed_service_count="$(psql_exec -tA <<SQL
SELECT COUNT(*)
FROM "SupplierService"
WHERE sku = '${RUN_ID}-FLIGHT-OLD-SKU'
  AND status = 'INACTIVE'
  AND "deletedAt" IS NOT NULL;
SQL
)"
if [[ "$soft_deleted_typed_service_count" != "1" ]]; then
  echo "Expected replaced typed supplier service to be soft-deleted, got ${soft_deleted_typed_service_count}" >&2
  exit 1
fi
echo "SMOKE_SUPPLIERS_SOFT_DELETE_OK"
