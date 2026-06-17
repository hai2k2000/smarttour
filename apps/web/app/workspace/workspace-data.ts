import { serverAuthHeaders } from '../serverAuth';

const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

export type WorkspaceUser = {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  phone?: string;
  branch?: string | null;
  department?: string | null;
  dataScope?: string;
  roles?: Array<{ code?: string; name?: string }>;
};

export type WorkspaceSummary = {
  totalRevenue?: number;
  paidAmount?: number;
  remainingRevenue?: number;
  totalCost?: number;
  paidCost?: number;
  remainingCost?: number;
  profit?: number;
  commission?: number;
  totalOrders?: number;
  totalCustomers?: number;
  supplierDebtCount?: number;
  totalReceipt?: number;
  totalPayment?: number;
  netCashflow?: number;
  receiptCount?: number;
  paymentCount?: number;
  customerDebtBalance?: number;
  supplierDebtBalance?: number;
  issueCount?: number;
  orderCount?: number;
  byType?: MetricRow[];
  byMonth?: MetricRow[];
};

export type MetricRow = {
  key?: string;
  label?: string;
  orderCount?: number;
  customerCount?: number;
  revenue?: number;
  paidAmount?: number;
  remainingRevenue?: number;
  cost?: number;
  paidCost?: number;
  remainingCost?: number;
  profit?: number;
  commission?: number;
};

export type WorkspaceOrder = {
  id?: string;
  systemCode?: string;
  type?: string;
  tourCode?: string | null;
  name?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
  paymentStatus?: string;
  costStatus?: string;
  totalRevenue?: string | number;
  remainingRevenue?: string | number;
  totalCost?: string | number;
  remainingCost?: string | number;
  profit?: string | number;
  branch?: string | null;
  operatorOwner?: string | null;
  createdBy?: string | null;
};

export type WorkspaceReceipt = {
  id?: string;
  receiptCode?: string;
  code?: string;
  receiptName?: string;
  payerName?: string;
  customerName?: string;
  paymentDate?: string | null;
  receiptAmount?: string | number;
  amount?: string | number;
  totalAmount?: string | number;
  approvalStatus?: string;
  assignedStaff?: string;
};

export type WorkspacePayment = {
  id?: string;
  voucherCode?: string;
  code?: string;
  voucherName?: string;
  receiverName?: string;
  supplierName?: string;
  paymentDate?: string | null;
  paymentAmount?: string | number;
  amount?: string | number;
  totalAmount?: string | number;
  approvalStatus?: string;
  assignedStaff?: string;
};

export type WorkspaceDebtRow = {
  id?: string;
  name?: string;
  phone?: string;
  balance?: number;
  debitTotal?: number;
  creditTotal?: number;
};

export type WorkspaceFinance = {
  summary?: WorkspaceSummary;
  rows?: MetricRow[];
  byType?: MetricRow[];
  cashflowByMonth?: Array<{ key?: string; label?: string; receipt?: number; payment?: number; net?: number }>;
  orderRows?: WorkspaceOrder[];
  receiptRows?: WorkspaceReceipt[];
  paymentRows?: WorkspacePayment[];
  customerDebtRows?: WorkspaceDebtRow[];
  supplierDebtRows?: WorkspaceDebtRow[];
  reconciliationRows?: Array<Record<string, unknown>>;
};

export type WorkspaceOrderDashboard = {
  total?: number;
  upcoming?: number;
  running?: number;
  completed?: number;
  cancelled?: number;
  unpaid?: number;
  unpaidCost?: number;
  revenue?: number;
  cost?: number;
  profit?: number;
};

export type WorkspaceOperationDashboard = {
  upcomingDepartures?: number;
  operatingTours?: number;
  overdueTasks?: number;
  waitingSupplierConfirmations?: number;
  pendingSupplierPayments?: number;
  lowMarginTours?: number;
};

export type WorkspaceQuotationDashboard = {
  total?: number;
  totalValue?: number;
  pending?: number;
  approved?: number;
  converted?: number;
  expired?: number;
};

export type WorkspaceData = {
  user: WorkspaceUser | null;
  overview: WorkspaceSummary;
  finance: WorkspaceFinance;
  orderDashboard: WorkspaceOrderDashboard;
  orders: WorkspaceOrder[];
  operations: WorkspaceOperationDashboard;
  quotations: WorkspaceQuotationDashboard;
  receipts: WorkspaceReceipt[];
  payments: WorkspacePayment[];
  errors: string[];
};

const emptyOverview: WorkspaceSummary = {};
const emptyFinance: WorkspaceFinance = { summary: {}, orderRows: [], receiptRows: [], paymentRows: [], customerDebtRows: [], supplierDebtRows: [], reconciliationRows: [], cashflowByMonth: [] };
const emptyOrderDashboard: WorkspaceOrderDashboard = {};
const emptyOperations: WorkspaceOperationDashboard = {};
const emptyQuotations: WorkspaceQuotationDashboard = {};

async function responseMessage(response: Response) {
  try {
    const body = await response.clone().json();
    const message = body?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  } catch {
    const text = await response.text().catch(() => '');
    if (text.trim()) return text;
  }
  return response.statusText || `HTTP ${response.status}`;
}

async function apiGet<T>(path: string, fallback: T, label: string, errors: string[], headers: HeadersInit): Promise<T> {
  try {
    const response = await fetch(`${apiBase}${path}`, { cache: 'no-store', headers });
    if (!response.ok) {
      errors.push(`${label}: ${await responseMessage(response)}`);
      return fallback;
    }
    return await response.json();
  } catch (error) {
    errors.push(`${label}: ${error instanceof Error ? error.message : 'Không rõ lỗi'}`);
    return fallback;
  }
}

export async function getWorkspaceData(): Promise<WorkspaceData> {
  const errors: string[] = [];
  const headers = await serverAuthHeaders();
  const [user, overview, finance, orderDashboard, orders, operations, quotations, receiptsData, paymentsData] = await Promise.all([
    apiGet<WorkspaceUser | null>('/api/auth/me', null, 'Thông tin người dùng', errors, headers),
    apiGet<WorkspaceSummary>('/api/reports/overview?dateField=createdAt', emptyOverview, 'Tổng quan vận hành', errors, headers),
    apiGet<WorkspaceFinance>('/api/reports/finance?dateField=documentDate', emptyFinance, 'Báo cáo tài chính', errors, headers),
    apiGet<WorkspaceOrderDashboard>('/api/order-center/dashboard', emptyOrderDashboard, 'Tổng hợp đơn hàng', errors, headers),
    apiGet<WorkspaceOrder[]>('/api/order-center', [], 'Danh sách đơn hàng', errors, headers),
    apiGet<WorkspaceOperationDashboard>('/api/operations/dashboard', emptyOperations, 'Điều hành tour', errors, headers),
    apiGet<WorkspaceQuotationDashboard>('/api/quotations/dashboard', emptyQuotations, 'Báo giá', errors, headers),
    apiGet<{ rows?: WorkspaceReceipt[] }>('/api/finance/receipts', { rows: [] }, 'Phiếu thu', errors, headers),
    apiGet<{ rows?: WorkspacePayment[] }>('/api/finance/payments', { rows: [] }, 'Phiếu chi', errors, headers),
  ]);

  return {
    user,
    overview,
    finance,
    orderDashboard,
    orders,
    operations,
    quotations,
    receipts: receiptsData.rows || [],
    payments: paymentsData.rows || [],
    errors,
  };
}
