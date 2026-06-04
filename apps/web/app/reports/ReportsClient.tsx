'use client';

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { authHeaders } from '../authFetch';

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
type DateFieldKey = 'createdAt' | 'bookingDate' | 'startDate' | 'endDate' | 'paymentDate' | 'settledAt';
type MessageTone = 'idle' | 'success' | 'info' | 'error';
type LoadReason = 'filter' | 'tab' | 'reset';

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
type ReportData = { summary?: Summary; rows?: any[]; orders?: any[]; byType?: any[]; cashflowByMonth?: any[] };
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
const supplierDebtFilterKeys = new Set(['search', 'supplier', 'dateFrom', 'dateTo']);
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

function queryFor(tab: ReportTabKey, currentFilters: Filters, selectedGroup: GroupKey, includeGroup = true) {
  const allowedKeys = tab === 'supplier-debt' ? supplierDebtFilterKeys : orderFilterKeys;
  const query: Filters = {};
  allowedKeys.forEach((key) => {
    if (currentFilters[key]) query[key] = currentFilters[key];
  });
  if (includeGroup && groupedTabs.has(tab)) query.groupBy = selectedGroup;
  return query;
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
    return [
      { label: 'Thực thu', value: summary.paidAmount, formatter: money },
      { label: 'Thực chi', value: summary.paidCost, formatter: money },
      { label: 'Dòng tiền ròng', value: numberValue(summary.paidAmount) - numberValue(summary.paidCost), formatter: money },
      { label: 'Tỷ suất', value: summary.marginRate, formatter: percent },
    ];
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

export default function ReportsClient({ initialOverview, initialRevenue, initialMessage }: { initialOverview: Overview; initialRevenue: ReportData; initialMessage?: string }) {
  const [overview, setOverview] = useState<Overview>(initialOverview || {});
  const [active, setActive] = useState<ReportTabKey>('revenue');
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

  async function load(nextActive = active, nextGroupBy = groupBy, nextFilters = filters, reason: LoadReason = 'filter') {
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setLoading(true);
    setMessage({ tone: 'info', text: `Đang tải báo cáo ${tabLabels[nextActive]}...` });

    const overviewQuery = qs(queryFor(nextActive, nextFilters, nextGroupBy, false));
    const reportQuery = qs(queryFor(nextActive, nextFilters, nextGroupBy, true));
    const endpoint = endpointFor(nextActive, nextGroupBy);
    const apiBase = browserApiBase();

    try {
      const [overviewResult, reportResult] = await Promise.allSettled([
        fetch(`${apiBase}/api/reports/overview${overviewQuery ? `?${overviewQuery}` : ''}`, { cache: 'no-store', headers: authHeaders() }).then(async (response) => {
          if (!response.ok) throw new Error(await responseError(response, 'Không tải được Tổng quan'));
          return response.json() as Promise<Overview>;
        }),
        fetch(`${apiBase}/api${endpoint}${reportQuery ? `?${reportQuery}` : ''}`, { cache: 'no-store', headers: authHeaders() }).then(async (response) => {
          if (!response.ok) throw new Error(await responseError(response, `Không tải được báo cáo ${tabLabels[nextActive]}`));
          return response.json() as Promise<ReportData>;
        }),
      ]);

      if (requestId !== requestSeq.current) return;

      const failures: string[] = [];
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
      else failures.push(overviewResult.reason instanceof Error ? overviewResult.reason.message : 'Không tải được Tổng quan.');
      if (reportResult.status === 'fulfilled') setReport(reportResult.value);
      else failures.push(reportResult.reason instanceof Error ? reportResult.reason.message : `Không tải được báo cáo ${tabLabels[nextActive]}.`);

      if (failures.length) {
        setMessage({ tone: 'error', text: failures.join(' ') });
        return;
      }

      const successText =
        reason === 'tab'
          ? `Đã tải báo cáo ${tabLabels[nextActive]}.`
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
    if (tab === active) return;
    setActive(tab);
    void load(tab, groupBy, filters, 'tab');
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
    setExporting(true);
    setMessage({ tone: 'info', text: `Đang xuất CSV báo cáo ${tabLabels[active]}...` });
    try {
      const query = qs(queryFor(active, filters, groupBy, true));
      const response = await fetch(`${browserApiBase()}/api/reports/export/${active}${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() });
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

  const isSupplierDebt = active === 'supplier-debt';
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
        <article className="metric"><span>NCC còn nợ</span><strong>{integer(overview.supplierDebtCount)}</strong></article>
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
              <label>Lọc theo ngày<select value={filters.dateField || 'createdAt'} onChange={(event) => setFilter('dateField', event.target.value)}>{dateFields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Loại dịch vụ<select value={filters.type || ''} onChange={(event) => setFilter('type', event.target.value)}>{typeOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Thanh toán<select value={filters.paymentStatus || ''} onChange={(event) => setFilter('paymentStatus', event.target.value)}>{paymentOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Chi phí<select value={filters.costStatus || ''} onChange={(event) => setFilter('costStatus', event.target.value)}>{costOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Trạng thái đơn<select value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)}>{statusOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Chi nhánh<input value={filters.branch || ''} onChange={(event) => setFilter('branch', event.target.value)} /></label>
              <label>Phòng ban<input value={filters.department || ''} onChange={(event) => setFilter('department', event.target.value)} /></label>
              <label>Nhân viên<input value={filters.employee || ''} onChange={(event) => setFilter('employee', event.target.value)} /></label>
              <label>Đại lý<input value={filters.agency || ''} onChange={(event) => setFilter('agency', event.target.value)} /></label>
              <label>Loại khách<input value={filters.customerType || ''} onChange={(event) => setFilter('customerType', event.target.value)} /></label>
              <label>Thị trường<input value={filters.marketGroup || ''} onChange={(event) => setFilter('marketGroup', event.target.value)} /></label>
              <label>Trạng thái chốt<select value={filters.settled || ''} onChange={(event) => setFilter('settled', event.target.value)}><option value="">Tất cả</option><option value="true">Đã chốt</option><option value="false">Chưa chốt</option></select></label>
            </>
          )}
        </div>
        <div className="hotelFormActions reportActions">
          <button type="button" disabled={loading} onClick={applyFilters}>{loading ? <Loader2 size={17} /> : <Search size={17} />} {loading ? 'Đang lọc...' : 'Lọc dữ liệu'}</button>
          <button type="button" disabled={loading} className="secondaryButton" onClick={resetFilters}><RefreshCw size={17} /> Xóa lọc</button>
          <button type="button" disabled={loading || exporting} className="secondaryButton" onClick={exportCsv}><Download size={17} /> {exporting ? 'Đang export...' : 'Export CSV'}</button>
        </div>
      </section>

      <section className="panel">
        <div className="reportTabs">
          {reportTabs.map((tab) => <button type="button" key={tab.key} className={active === tab.key ? 'active' : ''} onClick={() => setTab(tab.key)}>{tab.label}</button>)}
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
        {rows.length ? (
          <div className="fitTableWrap">
            <table className="fitTable orderListTable reportTable">
              <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
              <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : <div className="tableEmptyState">{loading ? 'Đang tải dữ liệu báo cáo...' : 'Không có dữ liệu báo cáo phù hợp bộ lọc.'}</div>}
      </section>
    </div>
  );
}
