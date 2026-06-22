const fs = require('fs');

const hotelPage = fs.readFileSync('apps/web/app/suppliers/hotels/page.tsx', 'utf8');
const typedPage = fs.readFileSync('apps/web/app/suppliers/[type]/page.tsx', 'utf8');
const hotelClient = fs.readFileSync('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx', 'utf8');
const genericClient = fs.readFileSync('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(source, token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

for (const [name, source, importPath] of [
  ['hotel supplier page', hotelPage, '../../serverPermissions'],
  ['typed supplier page', typedPage, '../../serverPermissions'],
]) {
  includes(source, `import { ServerPermissionNotice, hasPermission, type PermissionUser } from '${importPath}';`, `${name} should use server permission helpers.`);
  includes(source, "apiGet<PermissionUser | null>('/auth/me'", `${name} should read current session permissions before loading supplier data.`);
  includes(source, "const canViewSuppliers = hasPermission(currentUser, 'supplier.view');", `${name} should calculate supplier.view access.`);
  includes(source, "const canManageSuppliers = hasPermission(currentUser, 'supplier.manage');", `${name} should calculate supplier.manage access.`);
  includes(source, 'canViewSuppliers ? await apiGet', `${name} should not preload supplier rows without supplier.view.`);
  includes(source, '<ServerPermissionNotice allowed={canViewSuppliers}', `${name} should show a server permission notice when access is missing.`);
  includes(source, '{canViewSuppliers ? (', `${name} should hide protected client content without supplier.view.`);
}

includes(hotelPage, "apiGet('/suppliers/hotels?take=100'", 'Hotel supplier page should bound the SSR hotel list payload.');
includes(typedPage, 'apiGet(`/suppliers/${type}?take=100`', 'Typed supplier page should bound the SSR typed supplier list payload.');

for (const [name, source, rowSetter, busyName] of [
  ['hotel supplier client', hotelClient, 'setHotels([]);', 'isLoading'],
  ['typed supplier client', genericClient, 'setSuppliers([]);', 'isLoading'],
]) {
  includes(source, 'const { can, permissionsReady } = usePermissions();', `${name} should wait for permission readiness.`);
  includes(source, "const canViewSuppliers = can('supplier.view');", `${name} should calculate supplier.view access.`);
  includes(source, "const canManageSuppliers = can('supplier.manage');", `${name} should calculate supplier.manage access.`);
  includes(source, 'if (!permissionsReady || !canViewSuppliers) {', `${name} should clear server-provided rows and fail closed without supplier.view.`);
  includes(source, rowSetter, `${name} should clear server-provided rows when supplier.view is missing.`);
  includes(source, 'PermissionNotice allowed={!permissionsReady || canViewSuppliers}', `${name} should avoid a permission flash while permissions load.`);
  includes(source, `disabled={!canViewSuppliers || ${busyName}}`, `${name} reload/search controls should be disabled without supplier.view.`);
}

console.log('TEST_SUPPLIERS_TYPED_PAGE_PERMISSIONS_CONTRACT_OK');
