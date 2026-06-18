const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`TEST_REQUIRED_FIELDS_UI_FAIL ${message}`);
    process.exit(1);
  }
}

function assertContains(source, expected, label) {
  assert(source.includes(expected), `${label} missing: ${expected}`);
}

const css = read('apps/web/app/globals.css');
const hotelSupplier = read('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx');
const genericSupplier = read('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx');
const finance = read('apps/web/app/finance/FinanceClient.tsx');
const security = read('apps/web/app/security/SecurityClient.tsx');

assertContains(css, 'label:has(:is(input, select, textarea)[required]', 'global required label selector');
assertContains(css, 'label:has(:is(input, select, textarea)[aria-required="true"]', 'global aria-required label selector');
assertContains(css, 'content: "Bắt buộc"', 'global required badge');
assertContains(css, 'input[required], select[required], textarea[required]', 'global required control accent');

for (const snippet of [
  "<label>Mã nhà cung cấp<input required",
  "<label>Tên nhà cung cấp<input required",
  '<label>Số điện thoại<input type="tel" required',
  "<label>Trạng thái<select required",
]) {
  assertContains(genericSupplier, snippet, 'generic supplier required field');
}

for (const snippet of [
  '<label>Tên phiếu thu<input name="receiptName" required',
  '<label>Số tiền thu<input name="receiptAmount" type="number" min={1} required',
  '<label>Tên phiếu chi<input name="voucherName" required',
  '<label>Số tiền chi<input name="paymentAmount" type="number" min={1} required',
  '<label>Tên khách hàng<input name="customerName" required',
  '<label>Dịch vụ<input name="itemName" required',
  '<label>Đơn giá<input name="unitPrice" type="number" min={1} required',
]) {
  assertContains(finance, snippet, 'finance required field');
}

for (const snippet of [
  '<label>Tên đăng nhập<input name="username" required',
  '<label>Email<input name="email" type="email" required',
  '<label>Họ và tên<input name="name" required',
  '<select name="roleCodes" multiple required',
]) {
  assertContains(security, snippet, 'security required field');
}

assert(!hotelSupplier.includes('*<input required'), 'hotel supplier must use shared required indicator instead of manual stars');

console.log('TEST_REQUIRED_FIELDS_UI_OK');
