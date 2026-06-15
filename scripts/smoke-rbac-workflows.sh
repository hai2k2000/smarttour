#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
API_URL="${API_URL:-http://127.0.0.1:4000/api}"
SITE_URL="${SITE_URL:-https://aitour.io.vn}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
POSTGRES_DB="${POSTGRES_DB:-smarttour}"
RUN_ID="rbac_$(date +%s)_$$"
DATA_CODE="RBAC-ROLE-$(date +%s)-$$"

cd "$REPO_DIR"

psql_cmd() {
  docker compose exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

cleanup() {
  psql_cmd >/dev/null <<SQL || true
DELETE FROM "QuotationApprovalLog" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${DATA_CODE}%');
DELETE FROM "QuotationItem" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${DATA_CODE}%');
DELETE FROM "Quotation" WHERE "quoteCode" LIKE '${DATA_CODE}%';
DELETE FROM "CustomerTimeline" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE code LIKE '${DATA_CODE}%');
DELETE FROM "Customer" WHERE code LIKE '${DATA_CODE}%';
DELETE FROM "User" WHERE email LIKE '${RUN_ID}_%@smarttour.local';
SQL
}
trap cleanup EXIT

node scripts/test-role-permission-contract.js

missing_permissions="$(psql_cmd -At <<'SQL'
WITH required(role_code, permission) AS (
  VALUES
    ('super_admin', '*'),
    ('sales', 'customer.manage'),
    ('sales', 'quote.manage'),
    ('sales', 'quotation.manage'),
    ('sales', 'booking.manage'),
    ('sales', 'order.manage'),
    ('sales', 'data.scope.department'),
    ('operation', 'operation.form.manage'),
    ('operation', 'operation.payment-request.create'),
    ('operation', 'supplier.manage'),
    ('operation', 'guide.manage'),
    ('operation', 'data.scope.branch'),
    ('accounting', 'finance.receipt.approve'),
    ('accounting', 'finance.payment.approve'),
    ('accounting', 'finance.invoice.approve'),
    ('accounting', 'finance.cashflow.view'),
    ('accounting', 'finance.debt.view'),
    ('accounting', 'commission.manage'),
    ('accounting', 'commission.export'),
    ('accounting', 'report.view'),
    ('accounting', 'report.export'),
    ('accounting', 'operation.payment-request.approve'),
    ('accounting', 'data.scope.all')
)
SELECT required.role_code || ':' || required.permission
FROM required
LEFT JOIN "Role" role ON role.code = required.role_code AND role.status = 'ACTIVE'
LEFT JOIN "RolePermission" role_permission
  ON role_permission."roleId" = role.id
 AND role_permission.permission = required.permission
WHERE role_permission.id IS NULL
ORDER BY required.role_code, required.permission;
SQL
)"
if [[ -n "$missing_permissions" ]]; then
  echo "FAIL_RBAC_MISSING_PERMISSIONS"
  echo "$missing_permissions"
  exit 1
fi

forbidden_permissions="$(psql_cmd -At <<'SQL'
SELECT role.code || ':' || role_permission.permission
FROM "Role" role
JOIN "RolePermission" role_permission ON role_permission."roleId" = role.id
WHERE
  (role.code = 'sales' AND (
    role_permission.permission LIKE 'finance.%'
    OR role_permission.permission IN (
      'operation.form.manage',
      'operation.payment-request.create',
      'operation.payment-request.approve',
      'supplier.manage',
      'guide.manage'
    )
  ))
  OR
  (role.code = 'operation' AND (
    role_permission.permission LIKE 'finance.%'
    OR role_permission.permission IN (
      'customer.manage',
      'quote.manage',
      'quotation.manage',
      'commission.manage',
      'operation.payment-request.approve'
    )
  ))
  OR
  (role.code = 'accounting' AND role_permission.permission IN (
    'customer.manage',
    'quote.manage',
    'quotation.manage',
    'booking.manage',
    'order.manage',
    'tour.manage',
    'operation.form.manage',
    'operation.payment-request.create',
    'supplier.manage',
    'guide.manage'
  ))
ORDER BY role.code, role_permission.permission;
SQL
)"
if [[ -n "$forbidden_permissions" ]]; then
  echo "FAIL_RBAC_FORBIDDEN_PERMISSIONS"
  echo "$forbidden_permissions"
  exit 1
fi

for role in super_admin sales operation accounting; do
  token="${RUN_ID}_${role}_token"
  token_hash="$(printf '%s' "$token" | sha256sum | awk '{print $1}')"
  user_id="${RUN_ID}_${role}_user"
  session_id="${RUN_ID}_${role}_session"
  user_role_id="${RUN_ID}_${role}_assignment"

  psql_cmd >/dev/null <<SQL
INSERT INTO "User" (
  id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt"
)
VALUES (
  '${user_id}',
  '${RUN_ID}_${role}',
  '${RUN_ID}_${role}@smarttour.local',
  'RBAC ${role}',
  'RBAC_SMOKE_SESSION_ONLY',
  'ACTIVE',
  'RBAC-BRANCH',
  'RBAC-DEPARTMENT',
  now(),
  now()
);

INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
SELECT '${user_role_id}', '${user_id}', id, now()
FROM "Role"
WHERE code = '${role}' AND status = 'ACTIVE';

INSERT INTO "UserSession" (
  id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt"
)
VALUES (
  '${session_id}',
  '${user_id}',
  '${token_hash}',
  'smarttour-rbac-smoke',
  '127.0.0.1',
  now() + interval '1 hour',
  now(),
  now()
);
SQL
done

node <<NODE
const api = '${API_URL}';
const site = '${SITE_URL}';
const run = '${RUN_ID}';
const dataCode = '${DATA_CODE}';
const roles = ['super_admin', 'sales', 'operation', 'accounting'];
const tokens = Object.fromEntries(roles.map((role) => [role, run + '_' + role + '_token']));

function responseDetail(data) {
  return typeof data === 'string' ? data : JSON.stringify(data);
}

async function request(role, method, path, body) {
  const response = await fetch(api + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + tokens[role],
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data };
}

async function expectOk(role, method, path, body) {
  const { response, data } = await request(role, method, path, body);
  if (!response.ok) {
    throw new Error(role + ' ' + method + ' ' + path + ' expected success, got ' + response.status + ': ' + responseDetail(data).slice(0, 240));
  }
  console.log(response.status + ' ALLOW ' + role + ' ' + method + ' ' + path);
  return data;
}

async function expectGuardAllows(role, method, path, body) {
  const { response, data } = await request(role, method, path, body);
  if (response.status === 401 || response.status === 403 || response.status >= 500) {
    throw new Error(role + ' ' + method + ' ' + path + ' should pass RBAC guard, got ' + response.status + ': ' + responseDetail(data).slice(0, 240));
  }
  console.log(response.status + ' GUARD_ALLOW ' + role + ' ' + method + ' ' + path);
}

async function expectForbidden(role, method, path, body) {
  const { response, data } = await request(role, method, path, body);
  if (response.status !== 403) {
    throw new Error(role + ' ' + method + ' ' + path + ' expected 403, got ' + response.status + ': ' + responseDetail(data).slice(0, 240));
  }
  console.log('403 DENY ' + role + ' ' + method + ' ' + path);
}

async function route(role, path) {
  const response = await fetch(site + path, {
    headers: { Cookie: 'smarttour.auth.token=' + tokens[role] },
  });
  if (response.status !== 200) {
    throw new Error(role + ' route ' + path + ' expected 200, got ' + response.status);
  }
  console.log('200 ROUTE ' + role + ' ' + path);
}

(async () => {
  for (const role of roles) {
    const me = await expectOk(role, 'GET', '/auth/me');
    const roleCodes = (me.roles || []).map((item) => item.code);
    if (!roleCodes.includes(role)) throw new Error(role + ' session does not expose expected role');
  }
  await expectOk('super_admin', 'GET', '/auth/users');

  const customerA = await expectOk('super_admin', 'POST', '/customers', {
    code: dataCode + '-CA',
    fullName: dataCode + ' Customer A',
    phone: '081' + String(Date.now()).slice(-7),
    branch: 'RBAC-BRANCH',
    department: 'RBAC-DEPARTMENT',
  });
  await expectOk('super_admin', 'POST', '/customers', {
    code: dataCode + '-CB',
    fullName: dataCode + ' Customer B',
    phone: '082' + String(Date.now()).slice(-7),
    branch: 'OTHER-BRANCH',
    department: 'OTHER-DEPARTMENT',
  });
  await expectOk('super_admin', 'POST', '/quotations', {
    quoteCode: dataCode + '-QA',
    productType: 'FIT',
    customerId: customerA.id,
    customerName: customerA.fullName,
    branch: 'RBAC-BRANCH',
    department: 'RBAC-DEPARTMENT',
    items: [{ serviceType: 'HOTEL', serviceName: 'Role scope room A', netPrice: 100 }],
  });
  await expectOk('super_admin', 'POST', '/quotations', {
    quoteCode: dataCode + '-QB',
    productType: 'FIT',
    customerName: dataCode + ' Quote B',
    branch: 'OTHER-BRANCH',
    department: 'OTHER-DEPARTMENT',
    items: [{ serviceType: 'HOTEL', serviceName: 'Role scope room B', netPrice: 100 }],
  });

  const scopedCustomers = await expectOk('sales', 'GET', '/customers?search=' + encodeURIComponent(dataCode));
  const scopedCustomerText = JSON.stringify(scopedCustomers);
  if (!scopedCustomerText.includes(dataCode + '-CA') || scopedCustomerText.includes(dataCode + '-CB')) {
    throw new Error('sales customer department scope is not enforced');
  }
  const scopedQuotations = await expectOk('sales', 'GET', '/quotations?search=' + encodeURIComponent(dataCode));
  const scopedQuotationText = JSON.stringify(scopedQuotations);
  if (!scopedQuotationText.includes(dataCode + '-QA') || scopedQuotationText.includes(dataCode + '-QB')) {
    throw new Error('sales quotation department scope is not enforced');
  }

  const representativeViews = [
    '/customers',
    '/quotes/tours',
    '/quotations',
    '/bookings',
    '/orders/fit-tours',
    '/operations/forms',
    '/operation-vouchers',
    '/suppliers/restaurants',
    '/tour-guides',
    '/finance/receipts',
    '/commission-reports',
    '/reports/overview',
  ];
  for (const path of representativeViews) await expectOk('super_admin', 'GET', path);
  for (const path of [
    '/customers',
    '/quotes/tours',
    '/quotations',
    '/bookings',
    '/orders/fit-tours',
  ]) await expectOk('sales', 'GET', path);
  for (const path of [
    '/operations/forms',
    '/operation-vouchers',
    '/suppliers/restaurants',
    '/tour-guides',
  ]) await expectOk('operation', 'GET', path);
  for (const path of [
    '/finance/receipts',
    '/finance/payments',
    '/finance/invoices',
    '/commission-reports',
    '/reports/overview',
    '/reports/finance',
    '/reports/debt/customers',
    '/reports/debt/suppliers',
  ]) await expectOk('accounting', 'GET', path);
  await expectOk('accounting', 'GET', '/commission-reports/export?take=1');
  await expectOk('accounting', 'GET', '/reports/export/employees');

  for (const path of [
    '/customers',
    '/quotes/tours',
    '/quotations',
    '/bookings',
    '/orders/fit-tours',
  ]) await expectGuardAllows('sales', 'POST', path, {});
  for (const path of [
    '/operations/forms',
    '/operation-vouchers',
    '/suppliers/restaurants',
    '/tour-guides',
  ]) await expectGuardAllows('operation', 'POST', path, {});
  await expectGuardAllows('operation', 'POST', '/operations/supplier-payment-requests', {});
  await expectGuardAllows('accounting', 'POST', '/finance/receipts', {});
  await expectGuardAllows('accounting', 'POST', '/finance/receipts/__rbac_missing__/approve', {});
  await expectGuardAllows('accounting', 'POST', '/commission-reports/approve', {});
  await expectGuardAllows('accounting', 'POST', '/operations/supplier-payment-requests/__rbac_missing__/approve', {});

  for (const path of [
    '/finance/receipts',
    '/finance/payments',
    '/finance/invoices',
  ]) await expectForbidden('sales', 'POST', path, {});
  await expectForbidden('sales', 'POST', '/finance/receipts/__rbac_missing__/approve', {});
  await expectForbidden('sales', 'POST', '/operations/forms', {});
  await expectForbidden('sales', 'POST', '/suppliers/restaurants', {});
  await expectForbidden('sales', 'POST', '/tour-guides', {});

  await expectForbidden('operation', 'POST', '/finance/receipts', {});
  await expectForbidden('operation', 'POST', '/finance/receipts/__rbac_missing__/approve', {});
  await expectForbidden('operation', 'POST', '/commission-reports/sync');
  await expectForbidden('operation', 'POST', '/operations/supplier-payment-requests/__rbac_missing__/approve', {});
  await expectForbidden('operation', 'POST', '/customers', {});
  await expectForbidden('operation', 'POST', '/quotes/tours', {});
  await expectForbidden('operation', 'POST', '/quotations', {});

  for (const path of [
    '/customers',
    '/quotes/tours',
    '/quotations',
    '/bookings',
    '/orders/fit-tours',
    '/operations/forms',
    '/operation-vouchers',
    '/suppliers/restaurants',
    '/tour-guides',
  ]) await expectForbidden('accounting', 'POST', path, {});
  await expectForbidden('accounting', 'POST', '/operations/supplier-payment-requests', {});

  await route('super_admin', '/security');
  for (const path of ['/customers', '/quotes/tours', '/quotations', '/bookings', '/orders/fit-tours']) await route('sales', path);
  for (const path of ['/operations', '/operation-vouchers', '/suppliers/restaurants', '/tour-guides']) await route('operation', path);
  for (const path of ['/finance', '/commission-reports', '/reports']) await route('accounting', path);

  console.log('SMOKE_RBAC_ROLE_CHECKS_OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
