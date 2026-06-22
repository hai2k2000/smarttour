const fs = require('fs');

const source = fs.readFileSync('apps/web/app/commission-reports/CommissionReportsClient.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}
function excludes(token, message) {
  assert(!source.includes(token), message || `Unexpected source remains: ${token}`);
}

includes("const canApproveCommission = can('commission.approve');", 'Commission approve action must use commission.approve.');
includes('!canApproveCommission', 'Commission approve button must be disabled without commission.approve.');
excludes("disabled={!can('commission.manage')} onClick={() => action('approve', row.id)}", 'Commission approve must not rely on broad commission.manage.');

includes('function confirmCommissionAction', 'Commission UI should define confirmation helper for approve/reject/pay actions.');
includes('confirmCommissionAction(path)', 'Commission actions should confirm before POST.');
console.log('TEST_COMMISSION_REPORTS_CLIENT_CONTRACT_OK');
