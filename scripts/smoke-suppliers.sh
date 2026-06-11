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
USED_SUPPLIER_ID="sup_used_supplier_${RUN_ID_SAFE}"
USED_ORDER_ID="sup_used_order_${RUN_ID_SAFE}"
USED_OPERATION_ITEM_ID="sup_used_op_item_${RUN_ID_SAFE}"
USED_FINANCE_PAYMENT_ID="sup_used_fin_payment_${RUN_ID_SAFE}"
USED_PAYMENT_REQUEST_ID="sup_used_pay_request_${RUN_ID_SAFE}"
USED_PAYMENT_ITEM_ID="sup_used_pay_item_${RUN_ID_SAFE}"

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
DELETE FROM "FinancePayment" WHERE id = '${USED_FINANCE_PAYMENT_ID}' OR "voucherCode" LIKE '${RUN_ID}%';
DELETE FROM "OrderOperationItem" WHERE id = '${USED_OPERATION_ITEM_ID}' OR "orderId" = '${USED_ORDER_ID}';
DELETE FROM "Order" WHERE id = '${USED_ORDER_ID}' OR "systemCode" LIKE '${RUN_ID}%';
DELETE FROM "Supplier" WHERE id = '${USED_SUPPLIER_ID}' OR "supplierCode" LIKE '${RUN_ID}%' OR name LIKE '${RUN_ID}%' OR email LIKE '%${RUN_ID_LOWER}%';
DELETE FROM "SupplierCategory" WHERE id = '${USED_CATEGORY_ID}' OR name LIKE '${RUN_ID}%';
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
  ('${MANAGE_ROLE_ID}_rp_scope_all', '${MANAGE_ROLE_ID}', 'data.scope.all', now()),
  ('${VIEW_ROLE_ID}_rp_supplier_view', '${VIEW_ROLE_ID}', 'supplier.view', now()),
  ('${VIEW_ROLE_ID}_rp_scope_all', '${VIEW_ROLE_ID}', 'data.scope.all', now());

INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES
  ('${MANAGE_USER_ID}', 'sup-manage-${RUN_ID_LOWER}', 'sup-manage-${RUN_ID_LOWER}@smarttour.local', 'Supplier Smoke Manage', 'not-used-by-token-smoke', 'ACTIVE', 'SUP-BR', 'SUP-DEP', now(), now()),
  ('${VIEW_USER_ID}', 'sup-view-${RUN_ID_LOWER}', 'sup-view-${RUN_ID_LOWER}@smarttour.local', 'Supplier Smoke View', 'not-used-by-token-smoke', 'ACTIVE', 'SUP-BR', 'SUP-DEP', now(), now());

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

INSERT INTO "Supplier" (id, "categoryId", "supplierCode", name, phone, email, status, "createdAt", "updatedAt")
VALUES (
  '${USED_SUPPLIER_ID}',
  '${USED_CATEGORY_ID}',
  '${RUN_ID}-USED-SUP',
  '${RUN_ID} Used Supplier',
  '0900000000',
  'used-${RUN_ID_LOWER}@smarttour.local',
  'ACTIVE',
  now(),
  now()
);

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

export API_URL RUN_ID RUN_ID_LOWER MANAGE_TOKEN VIEW_TOKEN MANAGE_USER_ID USED_SUPPLIER_ID USED_CATEGORY_ID

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

  await request(viewToken, 'GET', '/suppliers');
  const supplierDetail = await request(viewToken, 'GET', `/suppliers/${usedSupplierId}`);
  assert(supplierDetail.id === usedSupplierId && supplierDetail.category?.id, 'single-segment supplier detail route should not be mistaken for a typed route');

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
  await request(viewToken, 'GET', `/suppliers/not-a-supplier-type/${usedSupplierId}`, undefined, [404]);

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
  await request(manageToken, 'PATCH', '/suppliers/hotel-allotments/00000000-0000-4000-8000-000000000001/override', {}, [404]);
  await request(manageToken, 'POST', '/suppliers/hotel-allotments/00000000-0000-4000-8000-000000000001/lock', {}, [404]);
  await request(manageToken, 'POST', '/suppliers/hotel-allotment-allocations/00000000-0000-4000-8000-000000000001/confirm', {}, [404]);
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
  const category = await request(manageToken, 'POST', '/supplier-categories', { name: `  ${categoryName}  ` });
  assert(category.id && category.name === categoryName, 'created category should be trimmed and returned');
  assert(Number(category._count?.suppliers || 0) === 0, 'created category should expose zero active suppliers');

  const updatedCategoryName = `${run} API Category Updated`;
  const updatedCategory = await request(manageToken, 'PATCH', `/supplier-categories/${category.id}`, { name: `  ${updatedCategoryName}  ` });
  assert(updatedCategory.name === updatedCategoryName, 'updated category should be trimmed and returned');
  await request(manageToken, 'POST', '/supplier-categories', { name: updatedCategoryName.toLowerCase() }, [409]);

  const disposableCategory = await request(manageToken, 'POST', '/supplier-categories', { name: `${run} Disposable Category` });
  const renamedDisposableCategory = await request(manageToken, 'PATCH', `/supplier-categories/${disposableCategory.id}`, { name: `${run} Disposable Category Updated` });
  assert(renamedDisposableCategory.name.endsWith('Updated'), 'category update should persist name');
  await request(manageToken, 'DELETE', `/supplier-categories/${disposableCategory.id}`);

  const hotelSystemCategory = initialCategories.find((item) => item.name === 'Hotel');
  if (hotelSystemCategory) {
    await request(manageToken, 'PATCH', `/supplier-categories/${hotelSystemCategory.id}`, { name: `${run} Renamed Hotel` }, [400]);
    await request(manageToken, 'DELETE', `/supplier-categories/${hotelSystemCategory.id}`, undefined, [400]);
  }

  const supplier = await request(manageToken, 'POST', '/suppliers', {
    categoryId: category.id,
    name: `  ${run} API Supplier  `,
    contactPerson: '  Supplier Contact  ',
    phone: ' 0901111222 ',
    email: `supplier-${lowerRun}@smarttour.local`,
    address: ' Hanoi ',
    pricePolicy: 'Net price, seasonal surcharge',
    debtNote: 'Payable after reconciliation',
    notes: 'Smoke note',
  });
  assert(supplier.id, 'created supplier must have id');
  assert(supplier.name === `${run} API Supplier`, 'created supplier should be trimmed');
  assert(supplier.category?.id === category.id, 'created supplier must include category');
  assert(Array.isArray(supplier.supplierServices), 'created supplier must include supplierServices');

  await uploadRequest(viewToken, `/suppliers/${supplier.id}/files`, 'forbidden.txt', 'text/plain', 'forbidden', [403]);
  const blockedUpload = await uploadRequest(manageToken, `/suppliers/${supplier.id}/files`, 'blocked.svg', 'image/svg+xml', '<svg />', [400]);
  assert(messageOf(blockedUpload).includes('Loại file không được phép'), 'dangerous supplier file type should be rejected');
  const uploadedFile = await uploadRequest(manageToken, `/suppliers/${supplier.id}/files`, 'supplier-note.txt', 'text/plain', 'supplier file smoke');
  assert(uploadedFile.id && uploadedFile.uploadedBy === process.env.MANAGE_USER_ID, 'supplier upload should record the authenticated user id');
  await request(viewToken, 'DELETE', `/suppliers/${supplier.id}/files/${uploadedFile.id}`, undefined, [403]);
  await request(manageToken, 'DELETE', `/suppliers/${supplier.id}/files/${uploadedFile.id}`);

  const categoriesAfterCreate = await request(manageToken, 'GET', '/supplier-categories');
  const counted = categoriesAfterCreate.find((item) => item.id === category.id);
  assert(Number(counted?._count?.suppliers || 0) === 1, 'category count should include one active supplier');

  const filteredByCategory = await request(manageToken, 'GET', `/suppliers?categoryId=${encodeURIComponent(category.id)}`);
  assert(filteredByCategory.length === 1 && filteredByCategory[0].id === supplier.id, 'category filter should return matching supplier');

  const updated = await request(manageToken, 'PATCH', `/suppliers/${supplier.id}`, {
    categoryId: category.id,
    name: `${run} API Supplier Updated`,
    contactPerson: 'Updated Contact',
    phone: '0903333444',
    email: `supplier-updated-${lowerRun}@smarttour.local`,
    address: 'Da Nang',
    pricePolicy: 'Updated policy',
    debtNote: 'Updated debt note',
    notes: 'Updated internal note',
  });
  assert(updated.name.endsWith('Updated'), 'supplier update should return updated name');
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

  const missingCategoryError = await request(manageToken, 'POST', '/suppliers', { name: `${run} Missing Category` }, [400]);
  assert(messageOf(missingCategoryError).includes('Mã loại nhà cung cấp'), 'missing category error should be clear and Vietnamese');
  const missingNameError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id }, [400]);
  assert(messageOf(missingNameError).includes('Tên nhà cung cấp'), 'missing supplier name error should be clear and Vietnamese');
  const invalidContactError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id, name: `${run} Invalid Contact`, phone: 'abcxyz', email: 'bad-email' }, [400]);
  assert(messageOf(invalidContactError).includes('Số điện thoại nhà cung cấp không hợp lệ'), 'invalid phone should return Vietnamese validation message');
  assert(messageOf(invalidContactError).includes('Email nhà cung cấp không hợp lệ'), 'invalid email should return Vietnamese validation message');
  const longPolicyError = await request(manageToken, 'POST', '/suppliers', { categoryId: category.id, name: `${run} Long Policy`, pricePolicy: 'x'.repeat(2001) }, [400]);
  assert(messageOf(longPolicyError).includes('Chính sách giá không được vượt quá 2.000 ký tự'), 'long price policy should be rejected');

  const typedSupplier = await request(manageToken, 'POST', '/suppliers/restaurants', {
    supplierCode: `${run}-RESTAURANT`,
    name: `${run} Restaurant Supplier`,
    phone: '0907777888',
  });
  await request(manageToken, 'DELETE', `/suppliers/flights/${typedSupplier.id}`, undefined, [404]);
  const typedSupplierAfterWrongDelete = await request(manageToken, 'GET', `/suppliers/restaurants/${typedSupplier.id}`);
  assert(typedSupplierAfterWrongDelete.id === typedSupplier.id, 'wrong typed delete must not remove supplier from another type');
  const typedUpdated = await request(manageToken, 'PUT', `/suppliers/restaurants/${typedSupplier.id}`, { name: `${run} Restaurant Supplier Updated` });
  assert(typedUpdated.name.endsWith('Updated'), 'typed supplier manage permission should allow update');
  const typedInactive = await request(manageToken, 'PATCH', `/suppliers/restaurants/${typedSupplier.id}/status`, { status: 'INACTIVE' });
  assert(typedInactive.status === 'INACTIVE', 'typed supplier manage permission should allow status update');
  await request(manageToken, 'DELETE', `/suppliers/restaurants/${typedSupplier.id}`);
  await request(manageToken, 'GET', `/suppliers/restaurants/${typedSupplier.id}`, undefined, [404]);

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

  console.log('SMOKE_SUPPLIERS_OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
