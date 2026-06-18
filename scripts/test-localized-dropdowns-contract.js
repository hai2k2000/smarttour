const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  console.error(`TEST_LOCALIZED_DROPDOWNS_FAIL ${message}`);
  process.exit(1);
}

function assertContains(source, expected, label) {
  if (!source.includes(expected)) fail(`${label} missing: ${expected}`);
}

function assertNotContains(source, unexpected, label) {
  if (source.includes(unexpected)) fail(`${label} still contains: ${unexpected}`);
}

const orderCenter = read('apps/web/app/order-center/OrderCenterClient.tsx');
const quotations = read('apps/web/app/quotations/QuotationsClient.tsx');
const landtours = read('apps/web/app/landtours/page.tsx');
const commission = read('apps/web/app/commission-reports/CommissionReportsClient.tsx');
const security = read('apps/web/app/security/SecurityClient.tsx');
const suppliers = read('apps/web/app/suppliers/page.tsx');

assertNotContains(orderCenter, '>{item || \'Tất cả\'}</option>', 'order center filter dropdown labels');
assertContains(orderCenter, 'orderTypeLabel(item)', 'order type dropdown label helper');
assertContains(orderCenter, 'paymentStatusLabel(item)', 'payment dropdown label helper');
assertContains(orderCenter, 'costStatusLabel(item)', 'cost dropdown label helper');
assertContains(orderCenter, 'orderTypeLabel(row.original.type)', 'order type table label helper');

assertNotContains(quotations, '<option value="EN">English</option>', 'quotation language dropdown');
assertContains(quotations, '<option value="EN">Tiếng Anh</option>', 'quotation language dropdown');
assertContains(quotations, 'serviceTypeText(service)', 'quotation item service type dropdown');

assertNotContains(landtours, '<option>WAITING</option>', 'landtour operation status dropdown');
assertContains(landtours, 'operationStatuses.map((status) => <option key={status} value={status}>{viStatus(status)}</option>)', 'landtour operation status dropdown');
assertNotContains(landtours, 'placeholder="LAND_CAR"', 'landtour sales service type placeholder');
assertNotContains(landtours, 'placeholder="LAND_HOTEL"', 'landtour operation service type placeholder');

assertNotContains(commission, '<p className="eyebrow">Finance</p>', 'commission page eyebrow');
assertNotContains(commission, '<label>Group<select', 'commission grouping dropdown label');
assertContains(commission, '<label>Nhóm tổng hợp<select', 'commission grouping dropdown label');
assertContains(commission, '<h2>Chi tiết</h2>', 'commission detail heading');

assertNotContains(security, '{viRoleCode(role.code)} · {role.code}</option>', 'security user role dropdown');
assertNotContains(security, '{viRoleCode(item.code)} · {item.code}</option>', 'security role picker dropdown');
assertContains(security, '<option key={role.code} value={role.code}>{roleOptionLabel(role)}</option>', 'security user role dropdown helper');
assertContains(security, '<option key={item.id} value={item.id}>{roleOptionLabel(item)}</option>', 'security role picker dropdown helper');

assertNotContains(suppliers, '<strong>{category.name}</strong>', 'supplier category card label');
assertNotContains(suppliers, '<td>{supplier.category?.name || \'Chưa phân loại\'}</td>', 'supplier category table label');
assertNotContains(suppliers, '<option value={category.id} key={category.id}>{category.name}</option>', 'supplier category dropdown label');
assertContains(suppliers, 'supplierCategoryLabel(category.name)', 'supplier category label helper');

console.log('TEST_LOCALIZED_DROPDOWNS_OK');
