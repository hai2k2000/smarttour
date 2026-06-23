const fs = require('fs');

const page = fs.readFileSync('apps/web/app/order-center/page.tsx', 'utf8');
const client = fs.readFileSync('apps/web/app/order-center/OrderCenterClient.tsx', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/order-center/order-center.service.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(source, token, message) {
  assert(source.includes(token), message || 'Missing expected source: ' + token);
}

includes(page, "import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", 'Order Center page should use server permission helpers.');
includes(page, 'apiGet<PermissionUser | null>(', 'Order Center page should read current session permissions.');
includes(page, "'/auth/me'", 'Order Center page should call auth session endpoint.');
includes(page, "const canViewOrders = hasPermission(currentUser, 'order.view');", 'Order Center page should calculate order.view permission.');
includes(page, "const canExportOrders = hasPermission(currentUser, 'order.export');", 'Order Center page should calculate order.export permission.');
includes(page, 'canViewOrders ? await Promise.all', 'Order Center page should not load order data without order.view.');
includes(page, "apiGet('/order-center?compact=true&take=100'", 'Order Center page should bound and compact the SSR order list payload.');
includes(page, '<ServerPermissionNotice allowed={canViewOrders}', 'Order Center page should show permission notice when order.view is missing.');
includes(page, '{canViewOrders ? (', 'Order Center content should be hidden without order.view.');
includes(page, 'canExportOrders={canExportOrders}', 'Order Center page should pass export permission into client.');

includes(client, 'canExportOrders,', 'Order Center client should accept export permission prop.');
includes(client, 'canExportOrders: boolean;', 'Order Center client prop type should include export permission.');
includes(client, 'if (!canExportOrders) {', 'Order Center export should fail closed without order.export.');
includes(client, '{canExportOrders ? (', 'Order Center export button should be hidden without order.export.');
includes(client, "params.set('compact', 'true');", 'Order Center client reload should request compact list rows.');
includes(client, "params.set('take', '100');", 'Order Center client reload should request a bounded order list.');

const dashboardStart = service.indexOf('async dashboard(');
const listStart = service.indexOf('async list(', dashboardStart);
const dashboardBlock = dashboardStart === -1 || listStart === -1 ? '' : service.slice(dashboardStart, listStart);
includes(dashboardBlock, 'this.prisma.order.count', 'Order Center dashboard should count in the database instead of loading every order.');
includes(dashboardBlock, 'this.prisma.order.aggregate', 'Order Center dashboard should sum revenue/cost/profit in the database.');
assert(!dashboardBlock.includes('findMany'), 'Order Center dashboard must not load all matching orders with findMany.');
assert(!dashboardBlock.includes('.reduce('), 'Order Center dashboard must not reduce all matching orders in Node.');

console.log('TEST_ORDER_CENTER_PERMISSIONS_CONTRACT_OK');
