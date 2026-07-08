const fs = require('fs');

const page = fs.readFileSync('apps/web/app/reports/page.tsx', 'utf8');
const client = fs.readFileSync('apps/web/app/reports/ReportsClient.tsx', 'utf8');
const controller = fs.readFileSync('apps/api/src/modules/reports/reports.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/reports/reports.service.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(source, token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}
function matches(source, pattern, message) {
  assert(pattern.test(source), message || `Missing expected pattern: ${pattern}`);
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

includes(controller, 'this.assertFinanceViewPermission(query.financeView, request?.user);', 'Finance report endpoint should apply query-specific permissions before serving a sub-view.');
includes(controller, 'private assertFinanceViewPermission(financeView: string | undefined, user?: RequestUser)', 'Reports controller should define a financeView permission guard.');
includes(controller, "const view = financeView || 'all';", 'Finance view guard should treat omitted financeView as the legacy full payload.');
includes(controller, "if (!['all', 'customer-debt', 'supplier-debt'].includes(view)) return;", 'Only debt-bearing finance views should require the debt permission.');
includes(controller, "permissions.has('finance.debt.view')", 'Debt-bearing finance report views must require finance.debt.view.');
includes(controller, 'Thieu quyen xem bao cao cong no', 'Debt-bearing finance report views should fail with a debt-specific permission error.');

includes(service, "import { branchDepartmentScopeWhere, RequestUser, userPermissions } from '../auth/data-scope';", 'Reports service should be able to check finance.debt.view before computing debt balances.');
includes(service, 'private canViewDebtReports(user?: RequestUser)', 'Reports service should define a debt report permission helper.');
includes(service, 'const canViewDebtReports = this.canViewDebtReports(user);', 'Finance base summary should calculate whether debt balances can be shown.');
matches(service, /canViewDebtReports\s*\?\s*this\.customerDebtSummaryReport\(\{ \.\.\.query, dateField: 'documentDate' \}, user\)\s*:\s*Promise\.resolve\(null\)/, 'Finance base summary should not compute customer debt balances without finance.debt.view.');
matches(service, /canViewDebtReports\s*\?\s*this\.supplierDebtSummaryReport\(\{ \.\.\.query, dateField: 'documentDate' \}, user\)\s*:\s*Promise\.resolve\(null\)/, 'Finance base summary should not compute supplier debt balances without finance.debt.view.');

console.log('TEST_REPORTS_PERMISSIONS_CONTRACT_OK');
