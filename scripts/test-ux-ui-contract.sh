#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

node <<'NODE'
const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(read('package.json'));
const customers = read('apps/web/app/customers/CustomersClient.tsx');
const permissions = read('apps/web/app/usePermissions.tsx');
const orderCenter = read('apps/web/app/order-center/OrderCenterClient.tsx');
const exports = [
  'apps/api/src/modules/customers/customers.service.ts',
  'apps/api/src/modules/reports/report-csv.ts',
  'apps/api/src/modules/finance/finance.service.ts',
  'apps/api/src/modules/commission-reports/commission-reports.service.ts',
  'apps/api/src/modules/order-center/order-center.service.ts',
  'apps/api/src/modules/fit-tours/fit-tours.service.ts',
].map((file) => [file, read(file)]);
const browserSmoke = read('scripts/smoke-ux-ui.js');
const smokeWrapper = read('scripts/smoke-ux-ui.sh');

assert(pkg.scripts?.['test:ux-ui'] === 'scripts/test-ux-ui-contract.sh', 'package.json must expose test:ux-ui');
assert(pkg.scripts?.['smoke:ux-ui'] === 'scripts/smoke-ux-ui.sh', 'package.json must expose smoke:ux-ui');

for (const token of [
  'validateCustomerForm',
  'clearCustomerFilters',
  'type="email"',
  'type="tel"',
  'role="alert"',
  'Xóa lọc',
]) {
  assert(customers.includes(token), `CustomersClient.tsx missing ${token}`);
}

assert(!customers.includes('<p className="eyebrow">CRM</p>'), 'CustomersClient.tsx must not show CRM as page eyebrow');
assert(!customers.includes('<thead><tr><th>Mã</th><th>Khách hàng</th>'), 'CustomersClient.tsx customer table must not start with code column');
assert(customers.includes('<thead><tr><th>Khách hàng</th><th>Phân loại</th><th>Phụ trách</th><th>Tag</th><th>Thao tác</th></tr></thead>'), 'CustomersClient.tsx customer table must start with customer name column');
assert(customers.includes('<td className="customerNameCell"><strong>{row.fullName}</strong>'), 'CustomersClient.tsx customer rows must prioritize full name in first column');
assert(!customers.includes('label="xem và quản lý CRM khách hàng"'), 'CustomersClient.tsx permission notice must use travel-ops wording, not CRM');

for (const token of [
  "fetch(`${apiBase}/api/auth/me`",
  'permissionsReady',
  'credentials: \'include\'',
  'return false',
]) {
  assert(permissions.includes(token), `usePermissions.tsx missing fail-closed permission sync: ${token}`);
}

for (const token of [
  'resetFilters',
  'Đã xóa bộ lọc',
  'Không tải được dữ liệu trung tâm đơn hàng',
  'Đang tải dữ liệu',
  'compactListTableWrap',
]) {
  assert(orderCenter.includes(token), `OrderCenterClient.tsx missing ${token}`);
}

for (const [file, source] of exports) {
  assert(source.includes('\\uFEFF') || source.includes('\\ufeff') || source.includes('﻿'), `${file} must prefix CSV with UTF-8 BOM`);
  assert(source.includes("\\r\\n") || source.includes("'\\r\\n'"), `${file} must use CRLF for Excel`);
}

for (const token of [
  'UX_VALIDATION_NO_API_OK',
  'UX_COMPACT_TABLE_LAPTOP_OK',
  'UX_COMPACT_TABLE_WIDE_OK',
  'UX_FILTER_CLEAR_OK',
  'UX_PERMISSION_OK',
  'UX_EXPORT_EXCEL_OK',
  'UX_STATES_OK',
  'UX_HISTORY_OK',
  'SMOKE_UX_UI_OK',
]) {
  assert(browserSmoke.includes(token), `smoke-ux-ui.js missing checkpoint ${token}`);
}

for (const token of ['UserSession', 'customer.view', 'cleanup', 'smoke-ux-ui.js', 'smoke-exports.sh', 'AUTH_TOKEN']) {
  assert(smokeWrapper.includes(token), `smoke-ux-ui.sh missing ${token}`);
}

console.log('UX_UI_CONTRACT_OK');
NODE
