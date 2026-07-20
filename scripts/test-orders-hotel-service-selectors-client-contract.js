const fs = require('fs');

const page = fs.readFileSync('apps/web/app/orders/[type]/page.tsx', 'utf8');
const client = fs.readFileSync('apps/web/app/orders/[type]/OrdersClient.tsx', 'utf8');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

function requireTypeText(source, typeToken, fieldToken, label) {
  const typeStart = source.indexOf(typeToken);
  const typeEnd = typeStart < 0 ? -1 : source.indexOf('\n};', typeStart);
  if (typeEnd < 0 || !source.slice(typeStart, typeEnd).includes(fieldToken)) failures.push(label);
}

requireText(page, "'/orders/hotel-service-options'", 'Orders page must load the hotel service options endpoint');
requireText(page, "type === 'hotel-bookings'", 'Orders page must limit the options load to Hotel Booking');
requireText(page, 'initialHotelSuppliers={hotelSuppliers}', 'Orders page must pass hotel suppliers to the client');
requireText(client, 'type HotelSupplierOption =', 'Orders client must define the serialized hotel supplier contract');
requireText(client, 'function mergePersistedHotelOptions', 'Orders client must preserve historical hotel selections');
requireText(client, 'function hotelAllotmentRemaining', 'Orders client must calculate date-compatible hotel allotment');
requireText(client, "const isHotelBooking = type === 'hotel-bookings';", 'Orders client must scope hotel option preparation to Hotel Booking');
requireTypeText(client, 'export type HotelSupplierOption = {', 'supplierCode: string | null;', 'Hotel supplier codes must match the nullable API field');
requireTypeText(client, 'type HotelSupplierServiceOption = {', 'sku: string | null;', 'Hotel service SKUs must match the nullable API field');

if (failures.length) {
  console.error('FAIL_ORDERS_HOTEL_SERVICE_SELECTORS_CLIENT_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log('TEST_ORDERS_HOTEL_SERVICE_SELECTORS_CLIENT_CONTRACT_OK');
