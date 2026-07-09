'use client';

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { authFetch, authHeaders } from '../authFetch';

type ReportTabKey = 'revenue' | 'profit' | 'finance' | 'customer-debt' | 'supplier-debt' | 'employees';
type GroupKey =
  | 'by-created-date'
  | 'by-checkin-date'
  | 'by-checkout-date'
  | 'by-approved-date'
  | 'by-employee'
  | 'by-agency'
  | 'by-branch'
  | 'by-department'
  | 'by-market'
  | 'by-type';
type DateFieldKey = 'createdAt' | 'bookingDate' | 'startDate' | 'endDate' | 'paymentDate' | 'settledAt' | 'closedAt';
type FinanceDateFieldKey = DateFieldKey | 'documentDate';
type FinanceViewKey = 'overview' | 'orders' | 'receipts' | 'payments' | 'customer-debt' | 'supplier-debt' | 'reconciliation';
type MessageTone = 'idle' | 'success' | 'info' | 'error';
type LoadReason = 'filter' | 'tab' | 'reset' | 'finance-view';

type Summary = {
  totalRevenue?: number;
  paidAmount?: number;
  remainingRevenue?: number;
  totalCost?: number;
  paidCost?: number;
  remainingCost?: number;
  totalPurchase?: number;
  remainingAmount?: number;
  profit?: number;
  commission?: number;
  marginRate?: number;
  supplierCount?: number;
  totalReceipt?: number;
  totalPayment?: number;
  netCashflow?: number;
  receiptCount?: number;
  paymentCount?: number;
  customerDebtBalance?: number;
  supplierDebtBalance?: number;
  issueCount?: number;
  orderCount?: number;
};
type MetricRow = Summary & {
  key: string;
  label: string;
  orderCount: number;
  customerCount: number;
  revenue?: number;
  cost?: number;
  averageOrderValue?: number;
  profitAfterCommission?: number;
  paidRatio?: number;
};
type ReportData = {
  summary?: Summary;
  rows?: any[];
  orders?: any[];
  byType?: any[];
  cashflowByMonth?: any[];
  orderRows?: any[];
  receiptRows?: any[];
  paymentRows?: any[];
  customerDebtRows?: any[];
  supplierDebtRows?: any[];
  reconciliationRows?: any[];
};
type Overview = Summary & {
  totalOrders?: number;
  totalCustomers?: number;
  supplierDebtCount?: number;
  unpaidOrders?: number;
  unpaidCostOrders?: number;
  settledOrders?: number;
  byType?: MetricRow[];
  byMonth?: MetricRow[];
};
type Filters = Record<string, string>;
type ReportMessage = { tone: MessageTone; text: string };

const reportTabs: Array<{ key: ReportTabKey; label: string }> = [
  { key: 'revenue', label: 'Doanh thu' },
  { key: 'profit', label: 'Lợi nhuận' },
  { key: 'finance', label: 'Tài chính' },
  { key: 'customer-debt', label: 'Công nợ khách hàng' },
  { key: 'supplier-debt', label: 'Công nợ NCC' },
  { key: 'employees', label: 'Nhân viên' },
];
const financeViews: Array<{ key: FinanceViewKey; label: string }> = [
  { key: 'overview', label: 'Tổng quan tài chính' },
  { key: 'orders', label: 'Theo đơn / tour' },
  { key: 'receipts', label: 'Phiếu thu' },
  { key: 'payments', label: 'Phiếu chi' },
  { key: 'customer-debt', label: 'Công nợ khách hàng' },
  { key: 'supplier-debt', label: 'Công nợ nhà cung cấp' },
  { key: 'reconciliation', label: 'Đối soát' },
];
const tabLabels = Object.fromEntries(reportTabs.map((tab) => [tab.key, tab.label])) as Record<ReportTabKey, string>;
const groupedTabs = new Set<ReportTabKey>(['revenue', 'profit']);
const groupOptions: Array<[GroupKey, string]> = [
  ['by-created-date', 'Ngày tạo'],
  ['by-checkin-date', 'Ngày check-in'],
  ['by-checkout-date', 'Ngày check-out'],
  ['by-approved-date', 'Ngày chốt'],
  ['by-employee', 'Nhân viên'],
  ['by-agency', 'Đại lý'],
  ['by-branch', 'Chi nhánh'],
  ['by-department', 'Phòng ban'],
  ['by-market', 'Thị trường'],
  ['by-type', 'Loại dịch vụ'],
];
const typeOptions = [
  ['', 'Tất cả'],
  ['FIT_TOUR', 'FIT Tour'],
  ['GIT_COMBO', 'GIT / Combo'],
  ['LANDTOUR', 'Landtour'],
  ['HOTEL_BOOKING', 'Đặt phòng khách sạn'],
  ['SINGLE_SERVICE', 'Dịch vụ lẻ'],
  ['FLIGHT_ORDER', 'Vé máy bay'],
];
const orderTypeValues = new Set(typeOptions.map(([value]) => value).filter(Boolean));
const paymentOptions = [
  ['', 'Tất cả'],
  ['UNPAID', 'Chưa thu'],
  ['PARTIAL', 'Thu một phần'],
  ['PAID', 'Đã thu'],
  ['REFUND', 'Hoàn tiền'],
];
const costOptions = [
  ['', 'Tất cả'],
  ['PENDING', 'Chưa chi'],
  ['PARTIAL', 'Chi một phần'],
  ['PAID', 'Đã chi'],
  ['OVERDUE', 'Quá hạn'],
];
const statusOptions = [
  ['', 'Tất cả'],
  ['DRAFT', 'Nháp'],
  ['UPCOMING', 'Sắp khởi hành'],
  ['RUNNING', 'Đang chạy'],
  ['COMPLETED', 'Hoàn tất'],
  ['CANCELLED', 'Đã hủy'],
  ['SETTLED', 'Đã chốt'],
];
const dateFields: Array<[DateFieldKey, string]> = [
  ['createdAt', 'Ngày tạo'],
  ['bookingDate', 'Ngày đặt'],
  ['startDate', 'Ngày bắt đầu'],
  ['endDate', 'Ngày kết thúc'],
  ['paymentDate', 'Ngày thanh toán'],
  ['settledAt', 'Ngày chốt'],
];
const financeDateFields: Array<[FinanceDateFieldKey, string]> = [
  ['createdAt', 'Ngày tạo đơn'],
  ['bookingDate', 'Ngày đặt'],
  ['startDate', 'Ngày bắt đầu'],
  ['endDate', 'Ngày kết thúc'],
  ['paymentDate', 'Ngày thanh toán đơn'],
  ['settledAt', 'Ngày chốt đơn'],
  ['documentDate', 'Ngày chứng từ'],
];
const orderDateFieldValues = new Set(dateFields.map(([value]) => value));
const financeDateFieldValues = new Set(financeDateFields.map(([value]) => value));
const orderFilterKeys = new Set([
  'search',
  'dateFrom',
  'dateTo',
  'dateField',
  'type',
  'paymentStatus',
  'costStatus',
  'status',
  'branch',
  'department',
  'employee',
  'agency',
  'customerType',
  'marketGroup',
  'settled',
]);
const financeFilterKeys = new Set([...orderFilterKeys, 'supplier']);
const supplierDebtFilterKeys = new Set(['search', 'supplier', 'dateFrom', 'dateTo']);
const customerDebtFilterKeys = new Set([...orderFilterKeys].filter((key) => key !== 'dateField'));
const emptyReport: ReportData = { summary: {}, rows: [] };
const defaultFilters: Filters = { dateField: 'createdAt' };

function browserApiBase() {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

function numberValue(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function money(value: unknown) {
  return numberValue(value).toLocaleString('vi-VN');
}

function integer(value: unknown) {
  return Math.trunc(numberValue(value)).toLocaleString('vi-VN');
}

function percent(value: unknown) {
  return `${numberValue(value).toFixed(1)}%`;
}

function qs(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function endpointFor(tab: ReportTabKey, selectedGroup: GroupKey) {
  if (tab === 'profit') return '/reports/profit';
  if (tab === 'finance') return '/reports/finance';
  if (tab === 'customer-debt') return '/reports/debt/customers';
  if (tab === 'supplier-debt') return '/reports/debt/suppliers';
  if (tab === 'employees') return '/reports/employees/performance';
  return `/reports/revenue/${selectedGroup}`;
}

function queryFor(tab: ReportTabKey, currentFilters: Filters, selectedGroup: GroupKey, includeGroup = true, nextFinanceView?: FinanceViewKey) {
  const allowedKeys = tab === 'finance'
    ? financeFilterKeys
    : tab === 'customer-debt'
      ? customerDebtFilterKeys
      : tab === 'supplier-debt'
        ? supplierDebtFilterKeys
        : orderFilterKeys;
  const query: Filters = {};
  allowedKeys.forEach((key) => {
    const value = currentFilters[key];
    if (!value) return;
    if (key === 'type' && !orderTypeValues.has(value)) return;
    if (key === 'dateField' && !(tab === 'finance' ? financeDateFieldValues : orderDateFieldValues).has(value as FinanceDateFieldKey)) return;
    query[key] = value;
  });
  if (tab === 'customer-debt' || tab === 'supplier-debt') query.dateField = 'documentDate';
  if (includeGroup && groupedTabs.has(tab)) query.groupBy = selectedGroup;
  if (tab === 'finance' && nextFinanceView) return { ...query, financeView: nextFinanceView };
  return query;
}

function mergeFinanceReport(current: ReportData, next: ReportData): ReportData {
  return {
    ...current,
    ...next,
    summary: { ...(current.summary || {}), ...(next.summary || {}) },
    rows: next.rows || current.rows,
    byType: next.byType || current.byType,
    cashflowByMonth: next.cashflowByMonth || current.cashflowByMonth,
    orderRows: next.orderRows || current.orderRows,
    receiptRows: next.receiptRows || current.receiptRows,
    paymentRows: next.paymentRows || current.paymentRows,
    customerDebtRows: next.customerDebtRows || current.customerDebtRows,
    supplierDebtRows: next.supplierDebtRows || current.supplierDebtRows,
    reconciliationRows: next.reconciliationRows || current.reconciliationRows,
  };
}

async function responseError(response: Response, fallback: string) {
  let detail = '';
  try {
    const body = await response.clone().json();
    const message = body?.message;
    detail = Array.isArray(message) ? message.join(', ') : message || body?.error || '';
  } catch {
    try {
      detail = await response.clone().text();
    } catch {
      detail = '';
    }
  }
  return detail ? `${fallback}: ${detail}` : `${fallback} (HTTP ${response.status})`;
}

function normalizeMetricRow(row: any, fallbackKey: string): MetricRow {
  const revenue = numberValue(row.revenue ?? row.totalRevenue);
  const cost = numberValue(row.cost ?? row.totalCost ?? row.totalPurchase);
  const profit = row.profit === undefined || row.profit === null ? revenue - cost : numberValue(row.profit);
  return {
    key: String(row.key || row.id || row.orderId || row.supplierId || row.supplierName || fallbackKey),
    label: String(row.label || row.name || row.customerName || row.supplierName || 'Chưa có tên'),
    orderCount: numberValue(row.orderCount),
    customerCount: numberValue(row.customerCount),
    revenue,
    paidAmount: numberValue(row.paidAmount),
    remainingRevenue: numberValue(row.remainingRevenue),
    cost,
    paidCost: numberValue(row.paidCost),
    remainingCost: numberValue(row.remainingCost ?? row.remainingAmount),
    profit,
    commission: numberValue(row.commission),
    marginRate: numberValue(row.marginRate),
    averageOrderValue: numberValue(row.averageOrderValue),
    profitAfterCommission: numberValue(row.profitAfterCommission),
    paidRatio: numberValue(row.paidRatio),
  };
}

function normalizeRows(active: ReportTabKey, data: ReportData): MetricRow[] {
  if (active === 'finance') return (data.byType || []).map((row, index) => normalizeMetricRow(row, `finance-${index}`));
  if (active === 'customer-debt') {
    return (data.rows || []).map((row, index) => ({
      key: String(row.orderId || row.systemCode || `customer-debt-${index}`),
      label: `${row.customerName || 'Chưa có khách'} - ${row.systemCode || 'Chưa có mã đơn'}`,
      orderCount: 1,
      customerCount: row.customerName ? 1 : 0,
      revenue: numberValue(row.totalRevenue),
      paidAmount: numberValue(row.paidAmount),
      remainingRevenue: numberValue(row.remainingRevenue),
      cost: 0,
      paidCost: 0,
      remainingCost: 0,
      profit: 0,
      commission: 0,
      marginRate: 0,
    }));
  }
  if (active === 'supplier-debt') {
    return (data.rows || []).map((row, index) => ({
      key: String(row.supplierId || row.supplierName || `supplier-debt-${index}`),
      label: row.supplierName || 'Chưa gắn NCC',
      orderCount: numberValue(row.voucherCount),
      customerCount: 0,
      revenue: 0,
      paidAmount: 0,
      remainingRevenue: 0,
      cost: numberValue(row.totalPurchase),
      paidCost: numberValue(row.paidAmount),
      remainingCost: numberValue(row.remainingAmount),
      profit: -numberValue(row.remainingAmount),
      commission: 0,
      marginRate: 0,
    }));
  }
  return (data.rows || []).map((row, index) => normalizeMetricRow(row, `${active}-${index}`));
}

function numericCell(value: unknown, formatter = money) {
  return <span style={{ display: 'block', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatter(value)}</span>;
}

function reportSummaryCards(tab: ReportTabKey, summary: Summary, rowCount: number) {
  if (tab === 'supplier-debt') {
    return [
      { label: 'Tổng chi', value: summary.totalPurchase, formatter: money },
      { label: 'Thực chi', value: summary.paidAmount, formatter: money },
      { label: 'Còn phải chi', value: summary.remainingAmount, formatter: money },
      { label: 'NCC còn nợ', value: summary.supplierCount ?? rowCount, formatter: integer },
    ];
  }
  if (tab === 'customer-debt') {
    return [
      { label: 'Doanh thu', value: summary.totalRevenue, formatter: money },
      { label: 'Thực thu', value: summary.paidAmount, formatter: money },
      { label: 'Còn phải thu', value: summary.remainingRevenue, formatter: money },
      { label: 'Đơn còn nợ', value: rowCount, formatter: integer },
    ];
  }
  if (tab === 'finance') {
    const cards = [
      { label: 'Tổng doanh thu', value: summary.totalRevenue, formatter: money },
      { label: 'Thực thu', value: summary.paidAmount, formatter: money },
      { label: 'Thực chi', value: summary.paidCost, formatter: money },
      { label: 'Dòng tiền ròng', value: summary.netCashflow ?? numberValue(summary.paidAmount) - numberValue(summary.paidCost), formatter: money },
      { label: 'Còn phải thu', value: summary.remainingRevenue, formatter: money },
      { label: 'Còn phải chi', value: summary.remainingCost, formatter: money },
      { label: 'Lợi nhuận', value: summary.profit, formatter: money },
    ];
    if (summary.issueCount !== undefined) cards.push({ label: 'Cần đối soát', value: summary.issueCount, formatter: integer });
    return cards;
  }
  return [
    { label: 'Doanh thu', value: summary.totalRevenue, formatter: money },
    { label: 'Tổng chi', value: summary.totalCost, formatter: money },
    { label: 'Lợi nhuận', value: summary.profit, formatter: money },
    { label: 'Tỷ suất', value: summary.marginRate, formatter: percent },
  ];
}

function filenameFor(tab: ReportTabKey) {
  const date = new Date().toISOString().slice(0, 10);
  return `smarttour-${tab}-${date}.csv`;
}

function dateText(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleDateString('vi-VN');
}

function clipped(value: unknown, fallback = '—') {
  const textValue = String(value ?? '').trim();
  return textValue || fallback;
}

function financeStatus(value: unknown) {
  const status = String(value || '');
  const labels: Record<string, string> = {
    DRAFT: 'Nháp',
    PENDING: 'Chờ duyệt',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Từ chối',
    CANCELLED: 'Đã hủy',
    PARTIAL: 'Một phần',
    PAID: 'Đã thanh toán',
    UNPAID: 'Chưa thanh toán',
  };
  return labels[status] || status || '—';
}

function financeAmountClass(value: unknown) {
  const amount = numberValue(value);
  if (amount > 0) return 'financeAmountPositive';
  if (amount < 0) return 'financeAmountNegative';
  return '';
}

function financeSourceLabel(row: any) {
  if (row.financeSource === 'tourkit_import_snapshot') return 'Snapshot TourKit';
  return 'Theo ch\u1ee9ng t\u1eeb';
}

function tourkitSnapshotText(row: any) {
  const receiptSnapshot = numberValue(row.snapshotPaidAmount);
  const paymentSnapshot = numberValue(row.snapshotPaidCost);
  if (receiptSnapshot <= 0 && paymentSnapshot <= 0) return '-';
  return 'Thu ' + money(receiptSnapshot) + ' / Chi ' + money(paymentSnapshot);
}


export default function ReportsClient({
  initialOverview,
  initialRevenue,
  initialMessage,
  canViewFinanceReports,
  canViewDebtReports,
  canExportReports,
}: {
  initialOverview: Overview;
  initialRevenue: ReportData;
  initialMessage?: string;
  canViewFinanceReports: boolean;
  canViewDebtReports: boolean;
  canExportReports: boolean;
}) {
  const [overview, setOverview] = useState<Overview>(initialOverview || {});
  const [active, setActive] = useState<ReportTabKey>('revenue');
  const [financeView, setFinanceView] = useState<FinanceViewKey>('overview');
  const [groupBy, setGroupBy] = useState<GroupKey>('by-created-date');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [report, setReport] = useState<ReportData>(initialRevenue || emptyReport);
  const [message, setMessage] = useState<ReportMessage>({
    tone: initialMessage ? 'error' : 'idle',
    text: initialMessage || 'Lọc chung cho doanh thu, công nợ, tài chính và nhân viên.',
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestSeq = useRef(0);
  const visibleReportTabs = useMemo(() => reportTabs.filter((tab) => {
    if (tab.key === 'finance') return canViewFinanceReports;
    if (tab.key === 'customer-debt' || tab.key === 'supplier-debt') return canViewDebtReports;
    return true;
  }), [canViewDebtReports, canViewFinanceReports]);
  const visibleFinanceViews = useMemo(() => financeViews.filter((view) => {
    if (view.key === 'customer-debt' || view.key === 'supplier-debt') return canViewDebtReports;
    return canViewFinanceReports;
  }), [canViewDebtReports, canViewFinanceReports]);

  const rows = useMemo(() => normalizeRows(active, report), [active, report]);
  const summaryCards = useMemo(() => reportSummaryCards(active, report.summary || {}, rows.length), [active, report.summary, rows.length]);
  const table = useReactTable({
    data: rows,
    columns: useMemo(() => {
      const helper = createColumnHelper<MetricRow>();
      const labelColumn = helper.accessor('label', { header: active === 'supplier-debt' ? 'Nhà cung cấp' : 'Nhóm báo cáo', cell: (info) => <strong>{info.getValue()}</strong> });
      const orderColumn = helper.accessor('orderCount', { header: active === 'supplier-debt' ? 'Số phiếu' : 'Số đơn', cell: (info) => numericCell(info.getValue(), integer) });
      const customerColumn = helper.accessor('customerCount', { header: 'Khách', cell: (info) => numericCell(info.getValue(), integer) });
      const revenueColumn = helper.accessor('revenue', { header: 'Doanh thu', cell: (info) => numericCell(info.getValue()) });
      const paidColumn = helper.accessor('paidAmount', { header: 'Thực thu', cell: (info) => numericCell(info.getValue()) });
      const remainingRevenueColumn = helper.accessor('remainingRevenue', { header: 'Còn phải thu', cell: (info) => numericCell(info.getValue()) });
      const costColumn = helper.accessor('cost', { header: 'Tổng chi', cell: (info) => numericCell(info.getValue()) });
      const paidCostColumn = helper.accessor('paidCost', { header: 'Thực chi', cell: (info) => numericCell(info.getValue()) });
      const remainingCostColumn = helper.accessor('remainingCost', { header: 'Còn phải chi', cell: (info) => numericCell(info.getValue()) });
      const profitColumn = helper.accessor('profit', { header: 'Lợi nhuận', cell: (info) => numericCell(info.getValue()) });
      const marginColumn = helper.accessor('marginRate', { header: 'Tỷ suất', cell: (info) => numericCell(info.getValue(), percent) });

      if (active === 'customer-debt') return [labelColumn, orderColumn, revenueColumn, paidColumn, remainingRevenueColumn];
      if (active === 'supplier-debt') return [labelColumn, orderColumn, costColumn, paidCostColumn, remainingCostColumn];
      if (active === 'finance') return [labelColumn, orderColumn, customerColumn, revenueColumn, paidColumn, costColumn, paidCostColumn, profitColumn, marginColumn];
      return [labelColumn, orderColumn, customerColumn, revenueColumn, paidColumn, remainingRevenueColumn, costColumn, paidCostColumn, remainingCostColumn, profitColumn, marginColumn];
    }, [active]),
    getCoreRowModel: getCoreRowModel(),
  });

  async function load(nextActive = active, nextGroupBy = groupBy, nextFilters = filters, reason: LoadReason = 'filter', nextFinanceView = financeView) {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setLoading(true);
    setMessage({ tone: 'info', text: `Đang tải báo cáo ${tabLabels[nextActive]}...` });

    const overviewQuery = qs(queryFor(nextActive, nextFilters, nextGroupBy, false));
    const reportQuery = qs(queryFor(nextActive, nextFilters, nextGroupBy, true, nextFinanceView));
    const endpoint = endpointFor(nextActive, nextGroupBy);
    const apiBase = browserApiBase();
    const shouldLoadOverview = reason !== 'finance-view';

    try {
      const overviewRequest = shouldLoadOverview
        ? authFetch(`${apiBase}/api/reports/overview${overviewQuery ? `?${overviewQuery}` : ''}`, { cache: 'no-store', headers: authHeaders() }).then(async (response) => {
          if (!response.ok) throw new Error(await responseError(response, 'Không tải được Tổng quan'));
          return response.json() as Promise<Overview>;
        })
        : Promise.resolve(null);
      const reportRequest = authFetch(`${apiBase}/api${endpoint}${reportQuery ? `?${reportQuery}` : ''}`, { cache: 'no-store', headers: authHeaders() }).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, `Không tải được báo cáo ${tabLabels[nextActive]}`));
        return response.json() as Promise<ReportData>;
      });
      const [overviewResult, reportResult] = await Promise.allSettled([
        overviewRequest,
        reportRequest,
      ]);

      if (requestId !== requestSeq.current) return;

      const failures: string[] = [];
      if (overviewResult.status === 'fulfilled') {
        if (overviewResult.value) setOverview(overviewResult.value);
      } else if (shouldLoadOverview) failures.push(overviewResult.reason instanceof Error ? overviewResult.reason.message : 'Không tải được Tổng quan.');
      if (reportResult.status === 'fulfilled') {
        if (nextActive === 'finance' && reason === 'finance-view') setReport((current) => mergeFinanceReport(current, reportResult.value));
        else setReport(reportResult.value);
      } else failures.push(reportResult.reason instanceof Error ? reportResult.reason.message : `Không tải được báo cáo ${tabLabels[nextActive]}.`);

      if (failures.length) {
        setMessage({ tone: 'error', text: failures.join(' ') });
        return;
      }

      const successText =
        reason === 'tab'
          ? `Đã tải báo cáo ${tabLabels[nextActive]}.`
          : reason === 'finance-view'
            ? 'Đã tải dữ liệu tài chính.'
            : reason === 'reset'
              ? 'Đã xóa bộ lọc và tải lại dữ liệu.'
              : 'Đã lọc dữ liệu theo điều kiện mới.';
      setMessage({ tone: 'success', text: successText });
    } catch (error) {
      if (requestId === requestSeq.current) setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Không tải được báo cáo.' });
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }

  function setTab(tab: ReportTabKey) {
    if (tab === 'finance' && !canViewFinanceReports) return;
    if ((tab === 'customer-debt' || tab === 'supplier-debt') && !canViewDebtReports) return;
    if (tab === active) return;
    setActive(tab);
    if (tab !== 'finance') setFinanceView('overview');
    void load(tab, groupBy, filters, 'tab');
  }

  function selectFinanceView(nextFinanceView: FinanceViewKey) {
    if (nextFinanceView === financeView) return;
    setFinanceView(nextFinanceView);
    if (active === 'finance') void load('finance', groupBy, filters, 'finance-view', nextFinanceView);
  }

  function setFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    void load(active, groupBy, filters, 'filter');
  }

  function resetFilters() {
    const nextFilters = { ...defaultFilters };
    setFilters(nextFilters);
    void load(active, groupBy, nextFilters, 'reset');
  }

  async function exportCsv() {
    if (!canExportReports) {
      setMessage({ tone: 'error', text: 'T\u00e0i kho\u1ea3n hi\u1ec7n t\u1ea1i ch\u01b0a c\u00f3 quy\u1ec1n xu\u1ea5t b\u00e1o c\u00e1o.' });
      return;
    }
    setExporting(true);
    setMessage({ tone: 'info', text: `Đang xuất CSV báo cáo ${tabLabels[active]}...` });
    try {
      const query = qs(queryFor(active, filters, groupBy, true));
      const response = await authFetch(`${browserApiBase()}/api/reports/export/${active}${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseError(response, `Export CSV ${tabLabels[active]} lỗi`));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFor(active);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ tone: 'success', text: `Đã xuất CSV báo cáo ${tabLabels[active]}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : `Export CSV ${tabLabels[active]} lỗi.` });
    } finally {
      setExporting(false);
    }
  }

  function renderFinanceTable(title: string, rows: any[], columns: Array<{ key: string; header: string; numeric?: boolean; render?: (row: any) => any }>, emptyText: string) {
    return (
      <section className="financeReportBlock">
        <div className="sectionHeader">
          <h3>{title}</h3>
          <span>{rows.length} dòng</span>
        </div>
        <div className="fitTableWrap compactListTableWrap financeReportTableWrap">
          <table className="fitTable reportTable compactListTable financeReportTable">
            <thead>
              <tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key || row.id || `${title}-${index}`}>
                  {columns.map((column) => {
                    const raw = column.render ? column.render(row) : row[column.key];
                    const titleText = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : undefined;
                    return <td key={column.key} title={titleText} className={column.numeric ? financeAmountClass(raw) : undefined}>{raw}</td>;
                  })}
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={columns.length} className="tableEmptyState">{loading ? 'Đang tải dữ liệu tài chính...' : emptyText}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderFinanceHybrid() {
    const summary = report.summary || {};
    const orderRows = report.orderRows || [];
    const receiptRows = report.receiptRows || [];
    const paymentRows = report.paymentRows || [];
    const customerDebtRows = report.customerDebtRows || [];
    const supplierDebtRows = report.supplierDebtRows || [];
    const reconciliationRows = report.reconciliationRows || [];
    const cashflowRows = report.cashflowByMonth || [];
    const overviewMetrics: Array<[string, unknown]> = [
      ['Tổng doanh thu', summary.totalRevenue],
      ['Thực thu theo đơn', summary.paidAmount],
      ['Thực chi theo đơn', summary.paidCost],
      ['Dòng tiền thực', summary.netCashflow],
      ['Công nợ khách hàng', summary.customerDebtBalance],
      ['Công nợ nhà cung cấp', summary.supplierDebtBalance],
      ['Phiếu thu', summary.receiptCount],
      ['Phiếu chi', summary.paymentCount],
    ];
    if (summary.issueCount !== undefined) overviewMetrics.push(['Dòng cần đối soát', summary.issueCount]);


    return (
      <div className="financeReportHybrid">
        <div className="financeReportTabs">
          {visibleFinanceViews.map((view) => (
            <button type="button" key={view.key} className={financeView === view.key ? 'active' : ''} onClick={() => selectFinanceView(view.key)}>
              {view.label}
            </button>
          ))}
        </div>

        {financeView === 'overview' ? (
          <div className="financeReportOverview">
            <div className="summaryRows reportSummary financeReportSummary">
              {overviewMetrics.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{String(label).includes('Phiếu') || String(label).includes('Dòng cần') ? integer(value) : money(value)}</strong>
                </div>
              ))}
            </div>
            {renderFinanceTable('Dòng tiền theo tháng', cashflowRows, [
              { key: 'period', header: 'Tháng' },
              { key: 'received', header: 'Tiền vào', numeric: true, render: (row) => money(row.received) },
              { key: 'paid', header: 'Tiền ra', numeric: true, render: (row) => money(row.paid) },
              { key: 'netCashflow', header: 'Dòng tiền ròng', numeric: true, render: (row) => money(row.netCashflow) },
            ], 'Chưa có dòng tiền theo tháng.')}
          </div>
        ) : null}

        {financeView === 'orders' ? renderFinanceTable('Theo đơn / tour', orderRows, [
          { key: 'systemCode', header: 'Mã đơn', render: (row) => <strong title={row.systemCode}>{row.systemCode}</strong> },
          { key: 'customerName', header: 'Khách hàng', render: (row) => clipped(row.customerName) },
          { key: 'name', header: 'Tour / Dịch vụ', render: (row) => clipped(row.name) },
          { key: 'startDate', header: 'Lịch', render: (row) => `${dateText(row.startDate)} - ${dateText(row.endDate)}` },
          { key: 'revenue', header: 'Tổng thu', numeric: true, render: (row) => money(row.revenue) },
          { key: 'paidAmount', header: 'Thực thu', numeric: true, render: (row) => money(row.paidAmount) },
          { key: 'remainingRevenue', header: 'Còn thu', numeric: true, render: (row) => money(row.remainingRevenue) },
          { key: 'cost', header: 'Tổng chi', numeric: true, render: (row) => money(row.cost) },
          { key: 'paidCost', header: 'Thực chi', numeric: true, render: (row) => money(row.paidCost) },
          { key: 'profit', header: 'Lợi nhuận', numeric: true, render: (row) => money(row.profit) },
          { key: 'issueCount', header: 'Đối soát', render: (row) => row.issueCount ? <span className="financeIssueBadge" title={(row.issues || []).join('\n')}>{integer(row.issueCount)} vấn đề</span> : 'Ổn' },
        ], 'Không có đơn/tour phù hợp bộ lọc.') : null}

        {financeView === 'receipts' ? renderFinanceTable('Phiếu thu', receiptRows, [
          { key: 'receiptCode', header: 'Mã phiếu thu', render: (row) => <strong title={row.receiptCode}>{row.receiptCode}</strong> },
          { key: 'payerName', header: 'Người nộp', render: (row) => clipped(row.payerName) },
          { key: 'paymentDate', header: 'Ngày thu', render: (row) => dateText(row.paymentDate) },
          { key: 'receiptAmount', header: 'Số tiền', numeric: true, render: (row) => money(row.receiptAmount) },
          { key: 'approvalStatus', header: 'Trạng thái', render: (row) => financeStatus(row.approvalStatus) },
          { key: 'orderCode', header: 'Đơn / Tour', render: (row) => clipped(row.orderCode || row.tourCode || row.tourName) },
        ], 'Không có phiếu thu phù hợp bộ lọc.') : null}

        {financeView === 'payments' ? renderFinanceTable('Phiếu chi', paymentRows, [
          { key: 'voucherCode', header: 'Mã phiếu chi', render: (row) => <strong title={row.voucherCode}>{row.voucherCode}</strong> },
          { key: 'receiverName', header: 'NCC / Người nhận', render: (row) => clipped(row.supplierName || row.receiverName) },
          { key: 'paymentDate', header: 'Ngày chi', render: (row) => dateText(row.paymentDate) },
          { key: 'paymentAmount', header: 'Số tiền', numeric: true, render: (row) => money(row.paymentAmount) },
          { key: 'approvalStatus', header: 'Trạng thái', render: (row) => financeStatus(row.approvalStatus) },
          { key: 'orderCode', header: 'Đơn / Tour', render: (row) => clipped(row.orderCode || row.tourCode || row.operationVoucherCode) },
        ], 'Không có phiếu chi phù hợp bộ lọc.') : null}

        {financeView === 'customer-debt' ? renderFinanceTable('Công nợ khách hàng', customerDebtRows, [
          { key: 'customerName', header: 'Khách hàng', render: (row) => clipped(row.customerName || row.label) },
          { key: 'systemCode', header: 'Mã đơn', render: (row) => clipped(row.systemCode || row.orderCodes?.join(', ')) },
          { key: 'debitTotal', header: 'Phải thu', numeric: true, render: (row) => money(row.debitTotal ?? row.revenue) },
          { key: 'creditTotal', header: 'Đã thu', numeric: true, render: (row) => money(row.creditTotal ?? row.paidAmount) },
          { key: 'balance', header: 'Còn nợ', numeric: true, render: (row) => money(row.balance ?? row.remainingRevenue) },
        ], 'Không có công nợ khách hàng phù hợp bộ lọc.') : null}

        {financeView === 'supplier-debt' ? renderFinanceTable('Công nợ nhà cung cấp', supplierDebtRows, [
          { key: 'supplierName', header: 'Nhà cung cấp', render: (row) => clipped(row.supplierName || row.label) },
          { key: 'voucherCodes', header: 'Phiếu dịch vụ', render: (row) => clipped(row.voucherCodes?.join(', ')) },
          { key: 'debitTotal', header: 'Phải chi', numeric: true, render: (row) => money(row.debitTotal ?? row.totalPurchase) },
          { key: 'creditTotal', header: 'Đã chi', numeric: true, render: (row) => money(row.creditTotal ?? row.paidAmount) },
          { key: 'balance', header: 'Còn nợ', numeric: true, render: (row) => money(row.balance ?? row.remainingAmount) },
        ], 'Không có công nợ nhà cung cấp phù hợp bộ lọc.') : null}

        {financeView === 'reconciliation' ? renderFinanceTable('Đối soát', reconciliationRows, [
          { key: 'type', header: 'Loại', render: (row) => row.type === 'ORDER' ? 'Đơn hàng' : row.type === 'ORPHAN_RECEIPT' ? 'Phiếu thu rời' : 'Phiếu chi rời' },
          { key: 'code', header: 'Mã', render: (row) => <strong title={row.code}>{row.code}</strong> },
          { key: 'title', header: 'Nội dung', render: (row) => clipped(row.title || row.customerName || row.supplierName) },
          { key: 'amount', header: 'Số tiền lệch', numeric: true, render: (row) => money(row.amount) },
          { key: 'issues', header: 'Cảnh báo', render: (row) => <span className="financeIssueBadge" title={(row.issues || []).join('\n')}>{(row.issues || []).join('; ') || 'Cần kiểm tra'}</span> },
        ], 'Không có dòng cần đối soát.') : null}
      </div>
    );
  }

  const isSupplierDebt = active === 'supplier-debt';
  const isCustomerDebt = active === 'customer-debt';
  const isFinance = active === 'finance';
  const messageStyle = message.tone === 'error' ? { color: '#b42318' } : message.tone === 'success' ? { color: '#276749' } : undefined;

  return (
    <div className="orderPage reportsPage">
      <section className="metrics reportMetrics">
        <article className="metric metricTone-blue"><span>Tổng doanh thu</span><strong>{money(overview.totalRevenue)}</strong></article>
        <article className="metric metricTone-green"><span>Thực thu</span><strong>{money(overview.paidAmount)}</strong></article>
        <article className="metric metricTone-amber"><span>Còn phải thu</span><strong>{money(overview.remainingRevenue)}</strong></article>
        <article className="metric"><span>Tổng chi</span><strong>{money(overview.totalCost)}</strong></article>
        <article className="metric metricTone-red"><span>Còn phải chi</span><strong>{money(overview.remainingCost)}</strong></article>
        <article className="metric metricTone-green"><span>Lợi nhuận</span><strong>{money(overview.profit)}</strong></article>
        <article className="metric"><span>Tổng đơn hàng</span><strong>{integer(overview.totalOrders)}</strong></article>
        <article className="metric"><span>Khách hàng</span><strong>{integer(overview.totalCustomers)}</strong></article>
        {canViewDebtReports ? <article className="metric"><span>NCC còn nợ</span><strong>{integer(overview.supplierDebtCount)}</strong></article> : null}
      </section>

      <section className="panel reportFilterPanel">
        <div className="sectionHeader"><h2>Bộ lọc báo cáo</h2><span style={messageStyle}>{message.text}</span></div>
        <div className="quoteFormGrid reportFilterGrid">
          <label>Tìm nhanh<input value={filters.search || ''} placeholder={isSupplierDebt ? 'Tên NCC, mã phiếu, dịch vụ...' : 'Mã đơn, khách, tour...'} onChange={(event) => setFilter('search', event.target.value)} /></label>
          <label>Từ ngày<input type="date" value={filters.dateFrom || ''} onChange={(event) => setFilter('dateFrom', event.target.value)} /></label>
          <label>Đến ngày<input type="date" value={filters.dateTo || ''} onChange={(event) => setFilter('dateTo', event.target.value)} /></label>
          {isSupplierDebt ? (
            <label>NCC<input value={filters.supplier || ''} placeholder="Tên nhà cung cấp" onChange={(event) => setFilter('supplier', event.target.value)} /></label>
          ) : (
            <>
              {!isCustomerDebt && <label>Lọc theo ngày<select value={filters.dateField || 'createdAt'} onChange={(event) => setFilter('dateField', event.target.value)}>{(isFinance ? financeDateFields : dateFields).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
              <label>Loại dịch vụ<select value={filters.type || ''} onChange={(event) => setFilter('type', event.target.value)}>{typeOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Thanh toán<select value={filters.paymentStatus || ''} onChange={(event) => setFilter('paymentStatus', event.target.value)}>{paymentOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Chi phí<select value={filters.costStatus || ''} onChange={(event) => setFilter('costStatus', event.target.value)}>{costOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Trạng thái đơn<select value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)}>{statusOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Chi nhánh<input value={filters.branch || ''} onChange={(event) => setFilter('branch', event.target.value)} /></label>
              <label>Phòng ban<input value={filters.department || ''} onChange={(event) => setFilter('department', event.target.value)} /></label>
              <label>Nhân viên<input value={filters.employee || ''} onChange={(event) => setFilter('employee', event.target.value)} /></label>
              {!isFinance && <label>Đại lý<input value={filters.agency || ''} onChange={(event) => setFilter('agency', event.target.value)} /></label>}
              {!isFinance && <label>Loại khách<input value={filters.customerType || ''} onChange={(event) => setFilter('customerType', event.target.value)} /></label>}
              <label>Thị trường<input value={filters.marketGroup || ''} onChange={(event) => setFilter('marketGroup', event.target.value)} /></label>
              {!isFinance && <label>Trạng thái chốt<select value={filters.settled || ''} onChange={(event) => setFilter('settled', event.target.value)}><option value="">Tất cả</option><option value="true">Đã chốt</option><option value="false">Chưa chốt</option></select></label>}
            </>
          )}
        </div>
        <div className="hotelFormActions reportActions">
          <button type="button" disabled={loading} onClick={applyFilters}>{loading ? <Loader2 size={17} /> : <Search size={17} />} {loading ? 'Đang lọc...' : 'Lọc dữ liệu'}</button>
          <button type="button" disabled={loading} className="secondaryButton" onClick={resetFilters}><RefreshCw size={17} /> Xóa lọc</button>
          {canExportReports ? (
            <button type="button" disabled={loading || exporting} className="secondaryButton" onClick={exportCsv}><Download size={17} /> {exporting ? '\u0110ang xu\u1ea5t...' : 'Xu\u1ea5t CSV'}</button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="reportTabs">
          {visibleReportTabs.map((tab) => <button type="button" key={tab.key} className={active === tab.key ? 'active' : ''} onClick={() => setTab(tab.key)}>{tab.label}</button>)}
        </div>
        <div className="reportControls">
          {groupedTabs.has(active) ? (
            <label>Nhóm báo cáo<select value={groupBy} onChange={(event) => { const nextGroup = event.target.value as GroupKey; setGroupBy(nextGroup); void load(active, nextGroup, filters, 'filter'); }}>{groupOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          ) : null}
          <div className="summaryRows reportSummary">
            {summaryCards.map((card) => <div key={card.label}><span>{card.label}</span><strong>{card.formatter(card.value)}</strong></div>)}
          </div>
        </div>
      </section>

      <section className="panel listPanel">
        <div className="sectionHeader"><h2>{tabLabels[active]}</h2><span>{loading ? 'Đang tải dữ liệu...' : `${rows.length} dòng`}</span></div>
        {active === 'finance' ? renderFinanceHybrid() : (
          <div className="fitTableWrap compactListTableWrap">
            <table className="fitTable orderListTable reportTable compactListTable">
              <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
              <tbody>
                {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
                {rows.length === 0 ? <tr><td colSpan={table.getAllLeafColumns().length} className="tableEmptyState">{loading ? 'Đang tải dữ liệu báo cáo...' : 'Không có dữ liệu báo cáo phù hợp bộ lọc.'}</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
