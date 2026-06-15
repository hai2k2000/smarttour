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

console.log('TEST_QUOTE_COMBOS_CLIENT_CONTRACT_OK');
