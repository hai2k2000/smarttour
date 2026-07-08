const fs = require('fs');

const source = fs.readFileSync('apps/web/app/workspace/workspace-data.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(token, message) {
  assert(source.includes(token), message || 'Missing expected source: ' + token);
}

includes("import { hasPermission } from '../serverPermissions';", 'Workspace data should use shared permission helper.');
includes('permissions?: string[] | null;', 'Workspace user should carry permissions from /auth/me.');
includes("const user = await apiGet<WorkspaceUser | null>('/api/auth/me'", 'Workspace data should read the current user before protected dashboard fetches.');
includes("const canViewReports = hasPermission(user, 'report.view');", 'Workspace data should calculate report.view.');
includes("const canViewFinanceReports = canViewReports && hasPermission(user, 'finance.cashflow.view');", 'Workspace data should calculate finance report permission.');
includes("const canViewOrders = hasPermission(user, 'order.view');", 'Workspace data should calculate order.view.');
includes("const canViewOperations = hasPermission(user, 'operation.form.view');", 'Workspace data should calculate operation dashboard permission.');
includes("const canViewQuotations = hasPermission(user, 'quotation.view');", 'Workspace data should calculate quotation dashboard permission.');
includes("const canViewReceipts = hasPermission(user, 'finance.receipt.view');", 'Workspace data should calculate receipt view permission.');
includes("const canViewPayments = hasPermission(user, 'finance.payment.view');", 'Workspace data should calculate payment view permission.');
includes("canViewReports ? apiGet<WorkspaceSummary>('/api/reports/overview'", 'Workspace should not fetch overview reports without report.view.');
includes("canViewFinanceReports ? apiGet<WorkspaceFinance>('/api/reports/finance?dateField=documentDate&financeView=customer-debt'", 'Workspace should not fetch finance report without finance.cashflow.view.');
includes("canViewOrders ? apiGet<WorkspaceOrderDashboard>('/api/order-center/dashboard'", 'Workspace should not fetch order dashboard without order.view.');
includes("canViewOrders ? apiGet<WorkspaceOrder[]>('/api/order-center?compact=true&take=120'", 'Workspace should not fetch orders without order.view.');
includes("canViewOperations ? apiGet<WorkspaceOperationDashboard>('/api/operations/dashboard'", 'Workspace should not fetch operations dashboard without operation.form.view.');
includes("canViewQuotations ? apiGet<WorkspaceQuotationDashboard>('/api/quotations/dashboard'", 'Workspace should not fetch quotations dashboard without quotation.view.');
includes("canViewReceipts ? apiGet<{ rows?: WorkspaceReceipt[] }>('/api/finance/receipts?take=20'", 'Workspace should not fetch receipts without finance.receipt.view.');
includes("canViewPayments ? apiGet<{ rows?: WorkspacePayment[] }>('/api/finance/payments?take=10'", 'Workspace should not fetch payments without finance.payment.view.');
includes("canViewReports ? apiGet<WorkspaceReportData>('/api/reports/revenue/by-type?dateField=createdAt'", 'Workspace overview should not fetch product reports without report.view.');
includes("canViewReports ? apiGet<WorkspaceReportData>('/api/reports/revenue/by-market?dateField=createdAt'", 'Workspace overview should not fetch market reports without report.view.');

console.log('TEST_WORKSPACE_DATA_PERMISSIONS_CONTRACT_OK');
