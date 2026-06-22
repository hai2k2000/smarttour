const fs = require('fs');

const source = fs.readFileSync('apps/web/app/operation-vouchers/OperationVouchersClient.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes("import { PermissionNotice, usePermissions } from '../usePermissions';", 'Operation vouchers client should use permission helpers.');
includes('const { can, canAny } = usePermissions();', 'Operation vouchers client should read current permissions.');
includes("can('operation.form.manage')", 'Create/update controls should honor operation.form.manage.');
includes("can('operation.payment-request.create')", 'Payment controls should honor operation.payment-request.create.');
includes("canAny(['operation.form.view', 'operation.form.manage'])", 'Page should render a permission notice for operation voucher viewing.');
includes("params.set('take', '100');", 'Operation voucher list reload should request an explicit backend take limit.');
includes('function confirmVoucherPayment', 'Payment action should define a consequence-aware confirmation helper.');
includes('confirmVoucherPayment(amount)', 'Payment action should confirm before posting money movement.');
includes('disabled={!canManageVouchers || formBusy}', 'Save button should be disabled without manage permission.');
includes('disabled={!canManageVouchers || reloading}', 'Create button should be disabled without manage permission.');
includes('disabled={!canCreateVoucherPayment || !editingId || paying || formBusy}', 'Payment button should be disabled without payment permission.');
console.log('TEST_OPERATION_VOUCHERS_CLIENT_CONTRACT_OK');
