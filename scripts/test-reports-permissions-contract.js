const fs = require('fs');

const page = fs.readFileSync('apps/web/app/reports/page.tsx', 'utf8');
const client = fs.readFileSync('apps/web/app/reports/ReportsClient.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(source, token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

includes(page, "import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../serverPermissions';", 'Reports page should use server permission helpers.');
includes(page, "apiGet<PermissionUser | null>(", 'Reports page should read current session permissions.');
includes(page, "'/auth/me'", 'Reports page should call auth session endpoint.');
includes(page, "const canViewReports = hasPermission(currentUser, 'report.view');", 'Reports page should calculate report.view permission.');
includes(page, "const canViewFinanceReports = hasPermission(currentUser, 'finance.cashflow.view');", 'Reports page should calculate finance.cashflow.view permission.');
includes(page, "const canViewDebtReports = hasPermission(currentUser, 'finance.debt.view');", 'Reports page should calculate finance.debt.view permission.');
includes(page, "const canExportReports = hasPermission(currentUser, 'report.export');", 'Reports page should calculate report.export permission.');
includes(page, 'canViewReports ? await Promise.all', 'Reports page should not load report data without report.view.');
includes(page, '<ServerPermissionNotice allowed={canViewReports}', 'Reports page should show permission notice when report.view is missing.');
includes(page, '{canViewReports ? (', 'Reports page should hide report content without report.view.');
includes(page, 'canViewFinanceReports={canViewFinanceReports}', 'Reports page should pass finance report permission into client.');
includes(page, 'canViewDebtReports={canViewDebtReports}', 'Reports page should pass debt report permission into client.');
includes(page, 'canExportReports={canExportReports}', 'Reports page should pass export permission into client.');

includes(client, 'canViewFinanceReports,', 'Reports client should accept finance permission prop.');
includes(client, 'canViewDebtReports,', 'Reports client should accept debt permission prop.');
includes(client, 'canExportReports,', 'Reports client should accept export permission prop.');
includes(client, 'const visibleReportTabs = useMemo', 'Reports client should derive visible tabs from permissions.');
includes(client, "if (tab === 'finance' && !canViewFinanceReports) return;", 'Finance tab should be blocked without finance.cashflow.view.');
includes(client, "if ((tab === 'customer-debt' || tab === 'supplier-debt') && !canViewDebtReports) return;", 'Debt tabs should be blocked without finance.debt.view.');
includes(client, 'if (!canExportReports) {', 'Export should fail closed without report.export.');
includes(client, '{canExportReports ? (', 'Export button should be hidden without report.export.');
includes(client, 'visibleReportTabs.map((tab)', 'Reports tabs should render only permitted tabs.');
includes(client, 'const visibleFinanceViews = useMemo', 'Finance subviews should be permission-filtered.');
includes(client, 'visibleFinanceViews.map((view)', 'Finance subviews should render only permitted views.');

console.log('TEST_REPORTS_PERMISSIONS_CONTRACT_OK');
