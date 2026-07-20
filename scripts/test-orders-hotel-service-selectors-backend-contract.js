const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/orders/orders.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/orders/orders.service.ts', 'utf8');
const options = fs.existsSync('apps/api/src/modules/orders/order-hotel-service-options.ts')
  ? fs.readFileSync('apps/api/src/modules/orders/order-hotel-service-options.ts', 'utf8')
  : '';
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(controller, "@Get('hotel-service-options')", 'Orders must expose a static hotel options route');
requireText(controller, "@RequirePermissions('order.view')", 'hotel options must use Order view permission');
if (controller.indexOf("@Get('hotel-service-options')") > controller.indexOf("@Get(':type')")) failures.push('static hotel options route must precede dynamic Order routes');
requireText(service, 'return listHotelServiceOptions(this.prisma);', 'OrdersService must delegate the hotel options projection');
requireText(options, 'hotelProfile: { isNot: null }', 'options must contain hotel suppliers only');
requireText(options, "status: 'ACTIVE'", 'options must contain active records only');
requireText(options, 'supplierServices:', 'options must include room services');
requireText(options, 'allotments:', 'options must include allotment summaries');
for (const forbidden of ['taxCode', 'bankAccountName', 'bankAccountNumber', 'debtNote', 'contacts', 'files']) {
  if (options.includes(forbidden)) failures.push(`hotel options must not expose ${forbidden}`);
}
if (failures.length) {
  console.error('FAIL_ORDERS_HOTEL_SERVICE_SELECTORS_BACKEND_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log('TEST_ORDERS_HOTEL_SERVICE_SELECTORS_BACKEND_CONTRACT_OK');
