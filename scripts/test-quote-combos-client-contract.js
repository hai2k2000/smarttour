const fs = require('fs');

const sourcePath = 'apps/web/app/quotes/combos/QuoteCombosClient.tsx';
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

for (const label of ['Mã combo', 'Loại combo', 'NET/khách', 'Giá người lớn', 'Dịch vụ', 'Trạng thái']) {
  includes(label, `Missing normalized combo table label: ${label}`);
}

for (const text of ['Ma combo', 'Loai combo', 'NET/khach', 'Gia nguoi lon', 'Dich vu', 'Trang thai', 'Combo khac']) {
  excludes(text, `Unaccented combo label/value remains: ${text}`);
}

includes('Tạo báo giá combo', 'Create combo label must be explicit.');
includes('Cập nhật báo giá combo', 'Edit combo title must be explicit.');
includes('Tải lại danh sách', 'Reload button must describe the action.');
includes('Tìm mã combo, loại combo, trạng thái...', 'Search placeholder must describe searchable fields.');

includes('API không trả về danh sách dịch vụ của combo hợp lệ.', 'loadCombo must reject missing items instead of silently falling back.');
includes('Đang tải chi tiết combo', 'Detail loading state must be visible.');
includes('Đang tải lại danh sách combo', 'List reload loading state must be visible.');

includes('const currentId = editingId;', 'Action handler must capture the current editing id before async reload/load.');
includes('formBusy = isSubmitting || listLoading || Boolean(actionLoading || loadingComboId)', 'Form actions must be disabled while list/detail actions are loading.');
includes('apiBase.includes(\'smarttour-api-1\')) return \'\';', 'Browser API base must use same-origin API for internal Docker host values.');

const dateHelper = source.match(/function dateInputValue\(value: unknown\) \{[\s\S]*?\n\}/)?.[0] || '';
assert(dateHelper, 'dateInputValue helper is missing.');
assert(!dateHelper.includes('toISOString().slice(0, 10)'), 'dateInputValue must not use toISOString because it can shift dates across timezones.');
includes('formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate())', 'dateInputValue must format dates with local date parts.');

includes('className="cellClamp"', 'Combo list cells must clamp long text to one visible row.');
includes('title={comboTitle}', 'Combo code cell must expose full content on hover.');
includes('title={comboTypeTitle}', 'Combo type cell must expose full content on hover.');
includes('title={serviceCountTitle}', 'Service count cell must expose full content on hover.');

includes('setValue(`items.${row.index}.serviceName`, \'\')', 'Changing supplier away from selected service must clear stale service name.');
includes('setValue(`items.${row.index}.netPricePerService`, 0)', 'Changing supplier away from selected service must clear stale NET price.');
includes('key={`${item.supplierId}:${item.id}`}', 'Service options need stable keys scoped by supplier.');


const page = fs.readFileSync('apps/web/app/quotes/combos/page.tsx', 'utf8');
function pageIncludes(text, message) {
  assert(page.includes(text), message || `Missing expected page source: ${text}`);
}
pageIncludes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';", 'Quote combos page should use server permission helpers.');
pageIncludes("apiGet<PermissionUser | null>(", 'Quote combos page should read current session permissions before loading data.');
pageIncludes("'/auth/me'", 'Quote combos page should call auth session endpoint.');
pageIncludes("const canViewQuotes = hasPermission(currentUser, 'quote.view') || hasPermission(currentUser, 'quote.manage');", 'Quote combos page should calculate quote view/manage access.');
pageIncludes("const canManageQuotes = hasPermission(currentUser, 'quote.manage');", 'Quote combos page should calculate quote.manage access.');
pageIncludes('canViewQuotes ? await apiGet', 'Quote combos page should not preload combo list without quote access.');
pageIncludes('canManageQuotes ? await Promise.all', 'Quote combos page should not preload supplier catalogs without quote.manage.');
pageIncludes('<ServerPermissionNotice allowed={canViewQuotes}', 'Quote combos page should show a server permission notice when access is missing.');
pageIncludes('{canViewQuotes ? (', 'Quote combos page should hide quote combo client content without access.');

includes('const { can, canAny, permissionsReady } = usePermissions();', 'Quote combos client should wait for permission readiness.');
includes("const canViewQuotes = canAny(['quote.view', 'quote.manage']);", 'Quote combos client should derive view/manage access once.');
includes("const canManageQuotes = can('quote.manage');", 'Quote combos client should derive manage access once.');
includes('if (!permissionsReady || !canViewQuotes) {', 'Quote combos reload/detail handlers should fail closed before API calls without view access.');
includes('setCombos([]);', 'Quote combos client should clear server-provided rows when view access is missing.');
includes('if (!canManageQuotes) {', 'Quote combos save/order actions should fail closed without quote.manage.');
includes('PermissionNotice allowed={!permissionsReady || canViewQuotes}', 'Quote combos client should avoid permission flash while permissions are loading.');
includes('{canViewQuotes ? (', 'Quote combos client should hide list/form content without view access.');
includes('disabled={!canViewQuotes || loadingComboId === row.original.id}', 'Quote combo edit buttons should be disabled without view access.');
includes('disabled={!canViewQuotes || listLoading}', 'Quote combos reload button should be disabled without view access.');

console.log('TEST_QUOTE_COMBOS_CLIENT_CONTRACT_OK');
