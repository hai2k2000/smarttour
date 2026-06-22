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
includes('apiBase.includes(\'smarttour-api-1\')) return \'\';', 'Browser API base must use same-origin API for internal Docker host values.');

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
