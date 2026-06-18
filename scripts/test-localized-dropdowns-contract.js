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
const finance = read('apps/web/app/finance/FinanceClient.tsx');
const i18n = read('apps/web/app/i18n.ts');
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


for (const [enumValue, label] of [
  ['DEPOSIT', 'Đặt cọc'],
  ['TOUR_PAYMENT', 'Thu tiền tour'],
  ['CUSTOMER_DEBT', 'Thu công nợ khách hàng'],
  ['COLLECT_ON_BEHALF', 'Thu hộ'],
  ['SUPPLIER_FUND_REFUND', 'Nhà cung cấp hoàn quỹ'],
  ['SUPPLIER_PAYMENT', 'Thanh toán nhà cung cấp'],
  ['CUSTOMER_REFUND', 'Hoàn tiền khách hàng'],
  ['COMMISSION', 'Hoa hồng'],
  ['INTERNAL_EXPENSE', 'Chi phí nội bộ'],
  ['SUPPLIER_DEPOSIT', 'Đặt cọc nhà cung cấp'],
  ['ADVANCE', 'Tạm ứng'],
]) {
  assertContains(i18n, `${enumValue}: '${label}'`, `finance enum label ${enumValue}`);
}
assertContains(finance, 'paymentTypes.map((type) => <option key={type} value={type}>{viStatus(type)}</option>)', 'finance payment type dropdown localized through viStatus');
assertContains(finance, 'receiptTypes.map((type) => <option key={type} value={type}>{viStatus(type)}</option>)', 'finance receipt type dropdown localized through viStatus');

for (const [enumValue, label] of [
  ['UPCOMING', 'Sắp khởi hành'],
  ['RUNNING', 'Đang chạy'],
  ['OVERDUE', 'Quá hạn'],
  ['PENDING_APPROVAL', 'Chờ duyệt'],
  ['FIT_TOUR', 'Tour FIT'],
  ['GIT_COMBO', 'Tour GIT / Combo'],
  ['HOTEL_BOOKING', 'Booking phòng khách sạn'],
  ['SINGLE_SERVICE', 'Dịch vụ lẻ'],
  ['FLIGHT_ORDER', 'Đơn vé máy bay'],
  ['HOTEL', 'Khách sạn'],
  ['TRANSPORT', 'Xe'],
  ['GUIDE', 'Hướng dẫn viên'],
]) {
  assertContains(i18n, `${enumValue}: '${label}'`, `shared enum label ${enumValue}`);
}

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
