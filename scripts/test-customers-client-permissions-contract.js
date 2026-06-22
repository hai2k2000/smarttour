const fs = require('fs');

const source = fs.readFileSync('apps/web/app/customers/CustomersClient.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || 'Missing expected source: ' + token);
}

includes('const { can, canAny, permissionsReady } = usePermissions();', 'Customers client should wait for permission readiness.');
includes('if (!permissionsReady) return;', 'Customers list load should wait until permissions are ready.');
includes('if (!canView) {', 'Customers handlers should fail closed without customer.view.');
includes('setRows([]);', 'Customers client should clear rows when view is not allowed or load fails.');
includes('setDashboard(emptyDashboard);', 'Customers client should clear dashboard when view is not allowed or load fails.');
includes('}, [query, permissionsReady, canView]);', 'Customers list load effect should depend on permissions.');
includes("text: 'B\\u1ea1n ch\\u01b0a c\\u00f3 quy\\u1ec1n customer.manage \\u0111\\u1ec3 t\\u1ea1o kh\\u00e1ch h\\u00e0ng.'", 'Create modal should fail closed without customer.manage.');
includes("text: 'B\\u1ea1n ch\\u01b0a c\\u00f3 quy\\u1ec1n customer.view \\u0111\\u1ec3 xem chi ti\\u1ebft kh\\u00e1ch h\\u00e0ng.'", 'Detail handler should fail closed without customer.view.');
includes("if (!canManage) throw new Error('B\\u1ea1n ch\\u01b0a c\\u00f3 quy\\u1ec1n customer.manage \\u0111\\u1ec3 upload t\\u00e0i li\\u1ec7u kh\\u00e1ch h\\u00e0ng.');", 'Upload helper should fail closed without customer.manage.');
includes("text: 'B\\u1ea1n ch\\u01b0a c\\u00f3 quy\\u1ec1n customer.manage \\u0111\\u1ec3 x\\u00f3a t\\u00e0i li\\u1ec7u kh\\u00e1ch h\\u00e0ng.'", 'Remove file handler should fail closed without customer.manage.');
includes('<PermissionNotice allowed={!permissionsReady || canView}', 'Permission notice should not flash before permissions are ready.');
includes('{canView ? (', 'Customer data content should be hidden without customer.view.');
includes('disabled={!canView || loading}', 'Reload should be disabled without customer.view.');

console.log('TEST_CUSTOMERS_CLIENT_PERMISSIONS_CONTRACT_OK');
