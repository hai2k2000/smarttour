#!/usr/bin/env node
const fs = require('fs');
const files = {
  common: fs.readFileSync('apps/web/app/suppliers/page.tsx', 'utf8'),
  generic: fs.readFileSync('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx', 'utf8'),
  hotel: fs.readFileSync('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx', 'utf8'),
};
const failures = [];

function includes(name, token) {
  if (!files[name].includes(token)) failures.push(`${name} supplier UI missing ${token}`);
}

includes('common', "const canViewSupplierFinancialFields = hasPermission(currentUser, 'finance.payment.view')");
includes('common', 'canViewSupplierFinancialFields ? (');
includes('common', 'missingPermissions={[\'finance.payment.view\']}');
includes('common', 'name="pricePolicy"');
includes('common', 'name="debtNote"');

for (const name of ['generic', 'hotel']) {
  includes(name, "const canViewSupplierFinancialFields = can('finance.payment.view')");
  includes(name, 'canViewSupplierFinancialFields ? (');
  includes(name, 'missingPermissions={[\'finance.payment.view\']}');
}

if (failures.length) {
  console.error('FAIL_SUPPLIER_UI_PERMISSION_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_SUPPLIER_UI_PERMISSION_CONTRACT_OK');
