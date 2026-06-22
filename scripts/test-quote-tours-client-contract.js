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

console.log('TEST_QUOTE_TOURS_CLIENT_CONTRACT_OK');
