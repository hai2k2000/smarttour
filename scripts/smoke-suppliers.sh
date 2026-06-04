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

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U smarttour -d smarttour "$@"
}

cleanup() {
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    echo "skip DB cleanup ($POSTGRES_CONTAINER not available)"
    return
  fi
  psql_exec >/dev/null <<SQL || true
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
SQL

export API_URL RUN_ID RUN_ID_LOWER MANAGE_TOKEN VIEW_TOKEN USED_SUPPLIER_ID USED_CATEGORY_ID

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
  await request(viewToken, 'POST', '/supplier-categories', { name: `${run} forbidden category` }, [403]);

  const categoryName = `${run} API Category`;
  const category = await request(manageToken, 'POST', '/supplier-categories', { name: `  ${categoryName}  ` });
  assert(category.id && category.name === categoryName, 'created category should be trimmed and returned');
  await request(manageToken, 'POST', '/supplier-categories', { name: categoryName.toLowerCase() }, [409]);

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

  const categoriesAfterCreate = await request(manageToken, 'GET', '/supplier-categories');
  const counted = categoriesAfterCreate.find((item) => item.id === category.id);
  assert(Number(counted?._count?.suppliers || 0) >= 1, 'category count should include created supplier');

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

  const suppliersAfterUpdate = await request(manageToken, 'GET', `/suppliers?search=${encodeURIComponent(run)}`);
  assert(suppliersAfterUpdate.some((item) => item.id === supplier.id), 'search should include updated supplier');

  await request(manageToken, 'DELETE', `/suppliers/${supplier.id}`);
  const suppliersAfterDelete = await request(manageToken, 'GET', `/suppliers?search=${encodeURIComponent(`${run} API Supplier Updated`)}`);
  assert(!suppliersAfterDelete.some((item) => item.id === supplier.id), 'deleted supplier should not be listed');

  const usedDeleteResult = await request(manageToken, 'DELETE', `/suppliers/${usedSupplierId}`, undefined, [409]);
  assert(messageOf(usedDeleteResult).includes('đang được sử dụng'), 'used supplier delete should explain active usage');

  await request(manageToken, 'POST', '/suppliers', { name: `${run} Missing Category` }, [400]);
  await request(manageToken, 'POST', '/suppliers', { categoryId: category.id }, [400]);
  await request(manageToken, 'POST', '/suppliers', { categoryId: category.id, name: 'A', email: 'bad-email' }, [400]);

  console.log('SMOKE_SUPPLIERS_OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
