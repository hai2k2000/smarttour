const fs = require('fs');

const controllerPath = 'apps/api/src/modules/orders/orders.controller.ts';
const servicePath = 'apps/api/src/modules/orders/orders.service.ts';
const helperPath = 'apps/api/src/modules/orders/order-document.ts';

function read(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

const controller = read(controllerPath);
const service = read(servicePath);
const helper = read(helperPath);
const failures = [];

function includes(source, value, label) {
  if (!source.includes(value)) failures.push(label);
}

includes(controller, "@Get(':type/:id/document')", 'Orders controller must expose GET :type/:id/document.');
includes(controller, "@RequirePermissions('order.view', 'order.export')", 'Order document route must require order.view and order.export.');
const documentRoute = controller.indexOf("@Get(':type/:id/document')");
const detailRoute = controller.indexOf("@Get(':type/:id')");
if (documentRoute < 0 || detailRoute < 0 || documentRoute > detailRoute) failures.push('Order document route must be declared before the dynamic detail route.');

includes(service, "import { getHotelBookingOrderDocument } from './order-document';", 'Orders service must import the Hotel Booking document helper.');
includes(service, 'return getHotelBookingOrderDocument(this.prisma, type, id, user);', 'Orders service must delegate to the Hotel Booking document helper.');

if (!helper) failures.push('Missing apps/api/src/modules/orders/order-document.ts.');
includes(helper, 'type !== OrderType.HOTEL_BOOKING', 'Order document helper must reject non-Hotel order types.');
includes(helper, 'branchDepartmentScopeWhere', 'Order document lookup must preserve branch/department data scope.');
includes(helper, 'deletedAt: null', 'Order document lookup must exclude soft-deleted Orders.');
includes(helper, 'supplier: { select:', 'Order document rows must use a minimal nested supplier select.');
includes(helper, 'service: { select:', 'Order document rows must use a minimal nested service select.');
includes(helper, "documentTitle: 'PHIẾU BOOKING PHÒNG KHÁCH SẠN'", 'Order document must expose the exact Hotel Booking documentTitle.');
includes(helper, 'generatedAt: new Date().toISOString()', 'Order document must expose an ISO generation timestamp.');
includes(helper, 'summary: {', 'Order document must expose its financial values under summary.');
includes(helper, 'totalRevenue: number(order.totalRevenue)', 'Order document totals must normalize totalRevenue.');
includes(helper, 'serviceDate: iso(row.serviceDate)', 'Order document operation rows must normalize serviceDate.');
includes(helper, 'birthday: iso(row.birthday)', 'Order document members must normalize birthday.');
includes(helper, 'signatures: [', 'Order document must provide signature placeholders.');
includes(helper, 'customerName: order.customerName', 'Order document customer snapshot must preserve customerName.');
includes(helper, 'customerType: order.customerType', 'Order document customer snapshot must preserve customerType.');
includes(helper, 'customerPhone: order.customerPhone', 'Order document customer snapshot must preserve customerPhone.');
includes(helper, 'customerEmail: order.customerEmail', 'Order document customer snapshot must preserve customerEmail.');
includes(helper, 'customerAddress: order.customerAddress', 'Order document customer snapshot must preserve customerAddress.');
includes(helper, 'agencyName: order.agencyName', 'Order document customer snapshot must preserve agencyName.');
includes(helper, 'collaborator: order.collaborator', 'Order document customer snapshot must preserve collaborator.');
includes(helper, "{ role: 'Khách hàng', name: order.customerName }", 'Customer signature must use the role/name contract.');
includes(helper, "{ role: 'Nhân viên phụ trách', name: order.createdBy }", 'Owner signature must use the role/name contract.');
includes(helper, "{ role: 'Điều hành', name: order.operatorOwner }", 'Operator signature must use the role/name contract.');

for (const value of ["title: 'PHIẾU BOOKING PHÒNG KHÁCH SẠN'", 'totals: {', "{ label: '", 'customerId', 'commissionStatus']) {
  if (helper.includes(value)) failures.push(`Order document helper must not retain out-of-contract model value: ${value}.`);
}

for (const field of ['taxCode', 'bankAccountName', 'bankAccountNumber', 'debtNote', 'pricePolicy', 'contacts', 'files']) {
  if (helper.includes(field)) failures.push(`Order document helper must not expose Supplier sensitive field: ${field}.`);
}

if (failures.length) {
  console.error('FAIL_ORDERS_HOTEL_BOOKING_DOCUMENTS_BACKEND_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_ORDERS_HOTEL_BOOKING_DOCUMENTS_BACKEND_CONTRACT_OK');
