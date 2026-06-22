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


includes('const [loading, setLoading] = useState(false);', 'Commission list should expose a loading state.');
includes('const [loadError, setLoadError] = useState', 'Commission list should expose a visible load error state.');
includes("params.set('take', '100');", 'Commission list query should request an explicit backend take limit.');
includes('setLoading(true);', 'Commission list load should set loading before fetching.');
includes('if (!response.ok)', 'Commission list load should check failed API responses.');
includes('catch (error)', 'Commission list load should catch network/API parse errors.');
includes('setLoadError(', 'Commission list load should render a user-facing error.');
includes('rows.length === 0', 'Commission table should render an empty state when no rows are returned.');
includes('if (!response.ok)', 'Commission sync should check failed API responses.');
console.log('TEST_COMMISSION_REPORTS_CLIENT_CONTRACT_OK');
