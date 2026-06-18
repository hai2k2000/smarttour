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
const quoteTours = read('apps/web/app/quotes/tours/QuoteToursClient.tsx');
const quoteCombos = read('apps/web/app/quotes/combos/QuoteCombosClient.tsx');
const quotations = read('apps/web/app/quotations/QuotationsClient.tsx');
const ordersClient = read('apps/web/app/orders/[type]/OrdersClient.tsx');
const operationVouchers = read('apps/web/app/operation-vouchers/OperationVouchersClient.tsx');
const tourGuides = read('apps/web/app/tour-guides/TourGuidesClient.tsx');

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

for (const snippet of [
  "<label>Mã báo giá<input required {...register('quoteCode')}",
  "<label>Mã tour<input required {...register('tourCode')}",
  'return <input type="number" required min={isDayNo ? 1 : 0}',
]) {
  assertContains(quoteTours, snippet, 'quote tour required field');
}

for (const snippet of [
  "<label>Mã combo<input required {...register('comboCode')}",
  "<label>Loại combo<select required {...register('comboType')}",
  '<select required',
  'return <input type="number" required min={isPaxOrNight ? 1 : 0}',
]) {
  assertContains(quoteCombos, snippet, 'quote combo required field');
}

for (const snippet of [
  "<label>Mã báo giá<input required {...register('quoteCode')}",
  "<label>Loại sản phẩm<select required {...register('productType')}",
  '<td><select required {...register(`items.${index}.serviceType`)}>',
  '<td><input type="number" required min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.quantity`',
  '<td><input type="number" required min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.netPrice`',
]) {
  assertContains(quotations, snippet, 'quotation required field');
}

for (const snippet of [
  "<input required {...register('systemCode')}",
  "<input required {...register('name')}",
]) {
  assertContains(ordersClient, snippet, 'typed order required field');
}

for (const snippet of [
  "<input required {...register('voucherCode')} disabled={formBusy} />",
  "<input required {...register('serviceType')} disabled={formBusy} />",
  "<input required {...register('serviceName')} disabled={formBusy} />",
  "<input type=\"date\" required {...register('serviceDate')} disabled={formBusy} />",
]) {
  assertContains(operationVouchers, snippet, 'operation voucher required field');
}

for (const snippet of [
  "<input required {...register('guideCode')} disabled={formBusy} />",
  "<input required {...register('fullName')} disabled={formBusy} />",
  "<input required {...register('phone')} disabled={formBusy} />",
]) {
  assertContains(tourGuides, snippet, 'tour guide required field');
}

console.log('TEST_REQUIRED_FIELDS_UI_OK');
