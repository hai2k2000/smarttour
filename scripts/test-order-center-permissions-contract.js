const fs = require('fs');

const page = fs.readFileSync('apps/web/app/order-center/page.tsx', 'utf8');
const client = fs.readFileSync('apps/web/app/order-center/OrderCenterClient.tsx', 'utf8');

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
includes(page, '<ServerPermissionNotice allowed={canViewOrders}', 'Order Center page should show permission notice when order.view is missing.');
includes(page, '{canViewOrders ? (', 'Order Center content should be hidden without order.view.');
includes(page, 'canExportOrders={canExportOrders}', 'Order Center page should pass export permission into client.');

includes(client, 'canExportOrders,', 'Order Center client should accept export permission prop.');
includes(client, 'canExportOrders: boolean;', 'Order Center client prop type should include export permission.');
includes(client, 'if (!canExportOrders) {', 'Order Center export should fail closed without order.export.');
includes(client, '{canExportOrders ? (', 'Order Center export button should be hidden without order.export.');

console.log('TEST_ORDER_CENTER_PERMISSIONS_CONTRACT_OK');
