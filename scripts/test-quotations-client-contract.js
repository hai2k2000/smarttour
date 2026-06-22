const fs = require('fs');

const sourcePath = 'apps/web/app/quotations/QuotationsClient.tsx';
const source = fs.readFileSync(sourcePath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(text, message) {
  assert(source.includes(text), message || `Missing expected source: ${text}`);
}

function excludes(text, message) {
  assert(!source.includes(text), message || `Unexpected source remains: ${text}`);
}

for (const label of ['Mã báo giá', 'Khách hàng', 'Sản phẩm / hành trình', 'Tổng giá trị', 'Giá/khách', 'Trạng thái']) {
  includes(label, `Missing normalized quotation list label: ${label}`);
}

for (const text of ['Mã BG', 'Loại DV', '<th>NCC</th>', '<th>ĐVT</th>', '<th>SL</th>', '<th>Pax</th>', 'Cost/pax', 'Selling/pax', 'Lãi/pax', '<span>Markup</span>', '<th>Markup</th>', '<th>Markup %</th>']) {
  excludes(text, `Abbreviated quotation label remains: ${text}`);
}

for (const section of ['Thông tin báo giá', 'Phân bổ phụ trách', 'Số khách', 'Dòng dịch vụ báo giá', 'Điều khoản và ghi chú']) {
  includes(section, `Missing normalized form section: ${section}`);
}

includes('API không trả về danh sách dịch vụ của báo giá hợp lệ.', 'loadQuotation must reject missing items instead of silently falling back.');
includes('Đang tải chi tiết báo giá...', 'Detail loading state must be visible.');
includes('Đang tải lại dashboard và danh sách báo giá...', 'Reload loading state must be visible.');
includes('Không tải đủ dữ liệu báo giá.', 'reload must report dashboard/list partial failures clearly.');

includes('const currentId = editingId;\n    if (!currentId)', 'Action handler must capture and validate the current editing id before the fetch.');
includes('savingDisabled = isSubmitting || reloading || Boolean(actionLoading || loadingQuotationId)', 'Save button must be disabled while reload/detail/action is loading.');
includes("const canApproveQuotation = can('quotation.approve');", 'Quotation approve button must use quotation.approve permission.');
includes('!canApproveQuotation', 'Quotation approve button must be disabled without quotation.approve.');
includes('function confirmQuotationAction', 'Quotation UI should define confirmation helper for approve/convert actions.');
includes('confirmQuotationAction(actionKey)', 'Quotation approve/convert action should confirm before POST.');
includes('apiBase.includes(\'smarttour-api-1\')) return \'\';', 'Browser API base must use same-origin API for internal Docker host values.');


const page = fs.readFileSync('apps/web/app/quotations/page.tsx', 'utf8');
function pageIncludes(text, message) {
  assert(page.includes(text), message || `Missing expected page source: ${text}`);
}

pageIncludes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", 'Quotations page should use server permission helpers.');
pageIncludes("apiGet<PermissionUser | null>(", 'Quotations page should read current session permissions before loading data.');
pageIncludes("'/auth/me'", 'Quotations page should call auth session endpoint.');
pageIncludes("const canViewQuotations = hasPermission(currentUser, 'quotation.view') || hasPermission(currentUser, 'quotation.manage');", 'Quotations page should calculate quotation view/manage access.');
pageIncludes('canViewQuotations ? await Promise.all', 'Quotations page should not preload dashboard/list without quotation access.');
pageIncludes('<ServerPermissionNotice allowed={canViewQuotations}', 'Quotations page should show a server permission notice when access is missing.');
pageIncludes('{canViewQuotations ? (', 'Quotations page should hide quotation client content without access.');

includes('const { can, canAny, permissionsReady } = usePermissions();', 'Quotations client should wait for permission readiness.');
includes("const canViewQuotations = canAny(['quotation.view', 'quotation.manage']);", 'Quotations client should derive view/manage access once.');
includes("const canManageQuotations = can('quotation.manage');", 'Quotations client should derive manage access once.');
includes('if (!permissionsReady || !canViewQuotations) {', 'Quotations reload/detail handlers should fail closed before API calls without view access.');
includes('setDashboard(emptyDashboard);', 'Quotations client should clear server-provided dashboard when view access is missing.');
includes('setQuotations([]);', 'Quotations client should clear server-provided rows when view access is missing.');
includes('if (!canManageQuotations) {', 'Quotations save and manage actions should fail closed without quotation.manage.');
includes("if (actionKey === 'approve' && !canApproveQuotation) {", 'Quotation approve action should fail closed without quotation.approve.');
includes('PermissionNotice allowed={!permissionsReady || canViewQuotations}', 'Quotations client should avoid permission flash while permissions are loading.');
includes('{canViewQuotations ? (', 'Quotations client should hide dashboard/form/list content without view access.');
includes('disabled={!canViewQuotations || loadingQuotationId === row.original.id}', 'Quotation edit buttons should be disabled without view access.');
includes('disabled={!canViewQuotations || reloading}', 'Quotation reload button should be disabled without view access.');

const dateHelper = source.match(/function dateInputValue\(value: unknown\) \{[\s\S]*?\n\}/)?.[0] || '';
assert(dateHelper, 'dateInputValue helper is missing.');
assert(!dateHelper.includes('toISOString().slice(0, 10)'), 'dateInputValue must not use toISOString because it can shift dates across timezones.');
includes('formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate())', 'dateInputValue must format dates with local date parts.');

includes('className="cellClamp"', 'Quotation list cells must clamp long text to one visible row.');
includes('title={codeTitle}', 'Quotation code cell must expose full content on hover.');
includes('title={customerTitle}', 'Customer cell must expose full content on hover.');
includes('title={routeTitle}', 'Route cell must expose full content on hover.');

includes('return quantity * nightCount * netPrice * positiveRate(exchangeRateValue) * (1 + vat / 100);', 'itemCost formula must match backend quantity * nightCount * netPrice * exchangeRate * VAT.');
includes('return safeNumber(item.markupAmount) + cost * (safeNumber(item.markupPercent) / 100);', 'itemMarkup formula must match backend fixed markup plus percent of cost.');

console.log('TEST_QUOTATIONS_CLIENT_CONTRACT_OK');
