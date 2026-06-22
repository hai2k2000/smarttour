const fs = require('fs');

const source = fs.readFileSync('apps/web/app/suppliers/page.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", 'Suppliers page should use server permission helpers.');
includes("apiGet<PermissionUser | null>('/auth/me'", 'Suppliers page should read current session permissions.');
includes("const canViewSuppliers = hasPermission(currentUser, 'supplier.view');", 'Suppliers page should calculate supplier.view permission.');
includes("const canManageSuppliers = hasPermission(currentUser, 'supplier.manage');", 'Suppliers page should calculate supplier.manage permission.');
includes('const [categoriesResult, allCategoriesResult, suppliersResult] = canViewSuppliers ? await Promise.all', 'Suppliers page should not load supplier data without supplier.view.');
includes('<ServerPermissionNotice allowed={canViewSuppliers}', 'Suppliers page should show permission notice when supplier.view is missing.');
includes('{canViewSuppliers ? (', 'Suppliers content should be hidden without supplier.view.');
includes('{canManageSuppliers ? (', 'Supplier modals/actions should be hidden without supplier.manage.');
includes('{canManageSuppliers ? <a className="iconTextButton secondaryButton" href={`#${createCategoryModalId}`}', 'Create category action should be hidden without supplier.manage.');
includes('{canManageSuppliers ? <a className="iconTextButton" href={`#${createSupplierModalId}`}', 'Create supplier action should be hidden without supplier.manage.');
includes('{canManageSuppliers ? (\n                          <>', 'Supplier row mutation actions should be hidden without supplier.manage.');

console.log('TEST_SUPPLIERS_SERVER_PAGE_PERMISSIONS_CONTRACT_OK');
