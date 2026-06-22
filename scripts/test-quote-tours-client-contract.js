const fs = require('fs');

const sourcePath = 'apps/web/app/quotes/tours/QuoteToursClient.tsx';
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

for (const label of ['Mã báo giá', 'Hành trình', 'Người đặt', 'Giá/khách', 'Trạng thái']) {
  includes(label, `Missing normalized table label: ${label}`);
}

for (const text of ['Ma bao gia', 'Hanh trinh', 'Nguoi dat', 'Gia/khach', 'Trang thai']) {
  excludes(text, `Unaccented quote tour label remains: ${text}`);
}

excludes('Cost items /', 'Cost item title must be Vietnamese-only.');
excludes('Itinerary /', 'Itinerary title must be Vietnamese-only.');
includes('Chi phí tour', 'Cost item section title must be localized.');
includes('Lịch trình tour', 'Itinerary section title must be localized.');
includes('Tạo báo giá', 'Create action label must be explicit.');
includes('Tìm mã báo giá, mã tour, người đặt, hành trình...', 'Search placeholder must describe searchable fields.');

excludes('    ...data,', 'Quote tour save payload must not spread full form data because lifecycle status must not be sent through PUT.');
includes('quoteCode: text(data.quoteCode),', 'Quote tour payload must explicitly map quoteCode.');
includes('costItems,\n    itineraries,', 'Quote tour payload must explicitly include child rows after scalar fields.');

includes('API không trả về danh sách chi phí của báo giá tour hợp lệ.', 'loadQuote must reject missing costItems instead of silently falling back.');
includes('API không trả về lịch trình của báo giá tour hợp lệ.', 'loadQuote must reject missing itineraries instead of silently falling back.');
includes('Đang tải chi tiết báo giá tour', 'Detail loading state must be visible.');
includes('Đang tải lại danh sách báo giá tour', 'List reload loading state must be visible.');

includes('const currentId = editingId;', 'Action handler must capture the current editing id before async reload/load.');
includes('formBusy = isSubmitting || listLoading || Boolean(actionLoading || loadingQuoteId)', 'Form actions must be disabled while list/detail actions are loading.');
includes("const canApproveQuote = can('quote.approve');", 'Quote tour approve button must use quote.approve permission.');
includes('!canApproveQuote', 'Quote tour approve button must be disabled without quote.approve.');
includes('function confirmQuoteAction', 'Quote tour UI should define confirmation helper for approve/convert actions.');
includes('confirmQuoteAction(path)', 'Quote tour approve/convert action should confirm before POST.');
includes('apiBase.includes(\'smarttour-api-1\')) return \'\';', 'Browser API base must use same-origin API for internal Docker host values.');

const dateHelper = source.match(/function dateInputValue\(value: unknown\) \{[\s\S]*?\n\}/)?.[0] || '';
assert(dateHelper, 'dateInputValue helper is missing.');
assert(!dateHelper.includes('toISOString().slice(0, 10)'), 'dateInputValue must not use toISOString because it can shift dates across timezones.');
includes('formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate())', 'dateInputValue must format dates with local date parts.');

includes('className="cellClamp"', 'Quote list cells must clamp long text to one visible row.');
includes('title={quoteTitle}', 'Quote code cell must expose full content on hover.');
includes('title={tourTitle}', 'Tour cell must expose full content on hover.');
includes('title={routeTitle}', 'Route cell must expose full content on hover.');
includes('title={customerTitle}', 'Customer cell must expose full content on hover.');


const page = fs.readFileSync('apps/web/app/quotes/tours/page.tsx', 'utf8');
function pageIncludes(text, message) {
  assert(page.includes(text), message || `Missing expected page source: ${text}`);
}
pageIncludes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';", 'Quote tours page should use server permission helpers.');
pageIncludes("apiGet<PermissionUser | null>(", 'Quote tours page should read current session permissions before loading data.');
pageIncludes("'/auth/me'", 'Quote tours page should call auth session endpoint.');
pageIncludes("const canViewQuotes = hasPermission(currentUser, 'quote.view') || hasPermission(currentUser, 'quote.manage');", 'Quote tours page should calculate quote view/manage access.');
pageIncludes('canViewQuotes ? await apiGet', 'Quote tours page should not preload quote tour data without quote access.');
pageIncludes('<ServerPermissionNotice allowed={canViewQuotes}', 'Quote tours page should show a server permission notice when access is missing.');
pageIncludes('{canViewQuotes ? (', 'Quote tours page should hide quote tour client content without access.');

includes('const { can, canAny, permissionsReady } = usePermissions();', 'Quote tours client should wait for permission readiness.');
includes("const canViewQuotes = canAny(['quote.view', 'quote.manage']);", 'Quote tours client should derive view/manage access once.');
includes("const canManageQuotes = can('quote.manage');", 'Quote tours client should derive manage access once.');
includes('if (!permissionsReady || !canViewQuotes) {', 'Quote tours reload/detail handlers should fail closed before API calls without view access.');
includes('setQuotes([]);', 'Quote tours client should clear server-provided rows when view access is missing.');
includes('if (!canManageQuotes) {', 'Quote tours save and convert actions should fail closed without quote.manage.');
includes("if (path === 'approve' && !canApproveQuote) {", 'Quote tours approve action should fail closed without quote.approve.');
includes('PermissionNotice allowed={!permissionsReady || canViewQuotes}', 'Quote tours client should avoid permission flash while permissions are loading.');
includes('{canViewQuotes ? (', 'Quote tours client should hide list/form content without view access.');
includes('disabled={!canViewQuotes || loadingQuoteId === row.original.id}', 'Quote tour edit buttons should be disabled without view access.');
includes('disabled={!canViewQuotes || listLoading}', 'Quote tours reload button should be disabled without view access.');

console.log('TEST_QUOTE_TOURS_CLIENT_CONTRACT_OK');
