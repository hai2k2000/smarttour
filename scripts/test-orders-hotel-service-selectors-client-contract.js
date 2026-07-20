const fs = require('fs');

const page = fs.readFileSync('apps/web/app/orders/[type]/page.tsx', 'utf8');
const client = fs.readFileSync('apps/web/app/orders/[type]/OrdersClient.tsx', 'utf8');
const css = fs.readFileSync('apps/web/app/globals.css', 'utf8');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

function forbidText(source, token, label) {
  if (source.includes(token)) failures.push(label);
}

function requireTypeText(source, typeToken, fieldToken, label) {
  const typeStart = source.indexOf(typeToken);
  const typeEnd = typeStart < 0 ? -1 : source.indexOf('\n};', typeStart);
  if (typeEnd < 0 || !source.slice(typeStart, typeEnd).includes(fieldToken)) failures.push(label);
}

function requireSectionText(source, startToken, endToken, fieldTokens, label) {
  const sectionStart = source.indexOf(startToken);
  const sectionEnd = sectionStart < 0 ? -1 : source.indexOf(endToken, sectionStart + startToken.length);
  const section = sectionEnd < 0 ? '' : source.slice(sectionStart, sectionEnd);
  if (!section || fieldTokens.some((token) => !section.includes(token))) failures.push(label);
}

requireText(page, "'/orders/hotel-service-options'", 'Orders page must load the hotel service options endpoint');
requireText(page, "type === 'hotel-bookings'", 'Orders page must limit the options load to Hotel Booking');
requireText(page, 'initialHotelSuppliers={hotelSuppliers}', 'Orders page must pass hotel suppliers to the client');
requireText(client, 'type HotelSupplierOption =', 'Orders client must define the serialized hotel supplier contract');
requireText(client, 'function mergePersistedHotelOptions', 'Orders client must preserve historical hotel selections');
requireText(client, 'function hotelAllotmentRemaining', 'Orders client must calculate date-compatible hotel allotment');
requireText(client, "const isHotelBooking = type === 'hotel-bookings';", 'Orders client must scope hotel option preparation to Hotel Booking');
requireTypeText(client, 'export type HotelSupplierOption = {', 'supplierCode: string | null;', 'Hotel supplier codes must match the nullable API field');
requireTypeText(client, 'export type HotelSupplierOption = {', 'selectable?: boolean;', 'Hotel suppliers must expose historical availability metadata');
requireTypeText(client, 'type HotelSupplierServiceOption = {', 'sku: string | null;', 'Hotel service SKUs must match the nullable API field');
requireSectionText(client, 'supplier = {', 'merged.push(supplier);', [
  'selectable: false,',
], 'Persisted-only hotel suppliers must be marked unavailable');
requireText(client, 'const showBookingInfo = isHotelBooking ? activeStep === 0 : activeStep === 1;', 'Hotel Booking must show booking information on step 0');
requireText(client, 'const showHotelPricing = isHotelBooking && activeStep === 1;', 'Hotel Booking must show room pricing on step 1');
requireText(client, 'const showMembers = isHotelBooking ? activeStep === 2 : activeStep === 1;', 'Hotel Booking must show members on step 2');
requireText(client, 'const showTerms = isHotelBooking ? activeStep === 3 : activeStep === 5;', 'Hotel Booking must show terms on step 3');
requireText(client, 'const showSurvey = isHotelBooking ? activeStep === 4 : activeStep === 5;', 'Hotel Booking must show survey fields on step 4');
requireText(client, "type === 'supplier'", 'Hotel pricing rows must render supplier selectors');
requireText(client, "type === 'hotelService'", 'Hotel pricing rows must render hotel service selectors');
requireSectionText(client, "if (type === 'supplier') {", "if (type === 'hotelService') {", [
  'const selectedSupplierId = text(row?.supplierId);',
  'disabled={supplier.selectable === false && supplier.id !== selectedSupplierId}',
  'Khách sạn không còn hoạt động',
], 'Historical hotel suppliers must only remain enabled for their current row');
requireSectionText(client, 'if (!event.target.value) {', 'const service = hotelServices.find', [
  'setValue(`${name}.${index}.description` as any, \'\'',
  'setValue(`${name}.${index}.unitPrice` as any, 0',
  'setValue(`${name}.${index}.netPrice` as any, 0',
  'return;',
], 'Clearing a hotel service must remove stale sales and operation values');
requireText(client, 'setValue(`${name}.${index}.supplierId`', 'Hotel selectors must update the linked supplier ID');
requireText(client, 'if (!selectedService || selectedService.supplierId === supplierId) return;', 'Clearing a hotel supplier must clear its selected service and derived values');
forbidText(client, 'if (!supplierId || !selectedService', 'Hotel supplier clearing must not return before stale service values are removed');
requireText(client, "setValue(`${name}.${index}.serviceType` as any, 'HOTEL'", 'Hotel service selection must mark rows as HOTEL');
requireText(client, 'setValue(`${name}.${index}.unitPrice`', 'Hotel sales selection must copy the selling price');
requireText(client, 'setValue(`${name}.${index}.netPrice`', 'Hotel operation selection must copy the NET price');
requireText(client, 'Dịch vụ không còn hoạt động', 'Historical hotel services must remain identifiable');
requireText(client, '`Còn ${remaining} phòng`', 'Hotel service availability must remain advisory');
requireText(client, 'Tồn quỹ chỉ mang tính tham khảo; hệ thống kiểm tra lại khi lưu.', 'Hotel availability must be visibly identified as advisory');
requireText(css, '.orderHotelServiceHint', 'Hotel service availability hint must have dense styling');

if (failures.length) {
  console.error('FAIL_ORDERS_HOTEL_SERVICE_SELECTORS_CLIENT_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log('TEST_ORDERS_HOTEL_SERVICE_SELECTORS_CLIENT_CONTRACT_OK');
