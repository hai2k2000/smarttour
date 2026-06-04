'use client';

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Download, RefreshCw, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { authHeaders } from '../authFetch';

type Summary = {
  totalRevenue?: number;
  paidAmount?: number;
  remainingRevenue?: number;
  totalCost?: number;
  paidCost?: number;
  remainingCost?: number;
  profit?: number;
  commission?: number;
  marginRate?: number;
};
type ReportSummary = Summary & {
  supplierCount?: number;
  totalPurchase?: number;
  remainingAmount?: number;
};
type NormalizedSummary = Required<Summary>;
type MetricRow = {
  key: string;
  label: string;
  orderCount: number;
  customerCount: number;
  revenue: number;
  paidAmount: number;
  remainingRevenue: number;
  cost: number;
  paidCost: number;
  remainingCost: number;
  profit: number;
  commission: number;
  marginRate: number;
  averageOrderValue: number;
  profitAfterCommission: number;
  paidRatio: number;
};
type ReportData = {
  summary?: ReportSummary;
  rows?: unknown[];
  orders?: unknown[];
  byType?: unknown[];
  cashflowByMonth?: unknown[];
};
type Overview = Summary & {
  totalOrders?: number;
  totalCustomers?: number;
  supplierDebtCount?: number;
  unpaidOrders?: number;
  unpaidCostOrders?: number;
  settledOrders?: number;
  byType?: unknown[];
  byMonth?: unknown[];
};
type Filters = Record<string, string>;
type MessageState = { kind: 'idle' | 'loading' | 'success' | 'error'; text: string };
type LoadReason = 'refresh' | 'filter' | 'tab' | 'group' | 'reset';

const reportTabs = [
  { key: 'revenue', label: 'Doanh thu' },
  { key: 'profit', label: 'Lợi nhuận' },
  { key: 'finance', label: 'Tài chính' },
  { key: 'customer-debt', label: 'Công nợ khách hàng' },
  { key: 'supplier-debt', label: 'Công nợ nhà cung cấp' },
  { key: 'employees', label: 'Nhân viên' },
] as const;
type ReportTab = (typeof reportTabs)[number]['key'];

const groupOptions = [
  ['by-created-date', 'Ngày tạo'],
  ['by-checkin-date', 'Ngày khởi hành'],
  ['by-checkout-date', 'Ngày kết thúc'],
  ['by-approved-date', 'Ngày quyết toán'],
  ['by-employee', 'Nhân viên'],
  ['by-agency', 'Đại lý'],
  ['by-branch', 'Chi nhánh'],
  ['by-department', 'Phòng ban'],
  ['by-market', 'Thị trường'],
  ['by-type', 'Loại dịch vụ'],
] as const;
type GroupBy = (typeof groupOptions)[number][0];

const typeOptions = [
  ['', 'Tất cả'],
  ['FIT_TOUR', 'Đơn FIT'],
  ['GIT_COMBO', 'GIT / Combo'],
  ['LANDTOUR', 'LandTour'],
  ['HOTEL_BOOKING', 'Booking phòng'],
  ['SINGLE_SERVICE', 'Dịch vụ lẻ'],
  ['FLIGHT_ORDER', 'Booking vé bay'],
] as const;
const paymentOptions = [
  ['', 'Tất cả'],
  ['UNPAID', 'Chưa thanh toán'],
  ['PARTIAL', 'Thanh toán một phần'],
  ['PAID', 'Đã thanh toán'],
  ['REFUND', 'Hoàn tiền'],
] as const;
const dateFields = [
  ['createdAt', 'Ngày tạo'],
  ['bookingDate', 'Ngày đặt'],
  ['startDate', 'Ngày khởi hành'],
  ['endDate', 'Ngày kết thúc'],
  ['paymentDate', 'Ngày thanh toán'],
  ['settledAt', 'Ngày quyết toán'],
] as const;
const orderFilterKeys = ['search', 'dateFrom', 'dateTo', 'dateField', 'type', 'paymentStatus', 'branch', 'department', 'employee', 'agency', 'marketGroup', 'settled'] as const;
const supplierDebtFilterKeys = ['search', 'supplier', 'dateFrom', 'dateTo'] as const;
const numericColumnIds = new Set(['orderCount', 'customerCount', 'revenue', 'paidAmount', 'remainingRevenue', 'cost', 'paidCost', 'remainingCost', 'profit', 'marginRate']);
const numericCellStyle = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };

const reportEndpointByTab: Record<ReportTab, (groupBy: GroupBy) => string> = {
  revenue: (groupBy) => `/reports/revenue/${encodeURIComponent(groupBy)}`,
  profit: () => '/reports/profit',
  finance: () => '/reports/finance',
  'customer-debt': () => '/reports/debt/customers',
  'supplier-debt': () => '/reports/debt/suppliers',
  employees: () => '/reports/employees/performance',
};

function browserApiBase() {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (typeof window === 'undefined') return apiBase;
  if (!apiBase || apiBase.includes('smarttour-api-1')) return '';
  return apiBase;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function numberOr(value: unknown, fallback: number) {
  return value === undefined || value === null || value === '' ? fallback : asNumber(value);
}

function asText(value: unknown) {
  return String(value ?? '').trim();
}

function money(value: unknown) {
  return asNumber(value).toLocaleString('vi-VN');
}

function count(value: unknown) {
  return asNumber(value).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}

function percent(value: unknown) {
  return `${asNumber(value).toFixed(1)}%`;
}

function qs(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function pickFilters(filters: Filters, keys: readonly string[]) {
  return keys.reduce<Filters>((selected, key) => {
    if (filters[key]) selected[key] = filters[key];
    return selected;
  }, {});
}

function supportsGrouping(tab: ReportTab) {
  return tab === 'revenue' || tab === 'profit';
}

function reportFilters(tab: ReportTab, filters: Filters, groupBy: GroupBy) {
  const selected = pickFilters(filters, tab === 'supplier-debt' ? supplierDebtFilterKeys : orderFilterKeys);
  if (supportsGrouping(tab)) selected.groupBy = groupBy;
  return selected;
}

function endpointFor(tab: ReportTab, selectedGroup: GroupBy) {
  return reportEndpointByTab[tab](selectedGroup);
}

function reportTabLabel(tab: ReportTab) {
  return reportTabs.find((item) => item.key === tab)?.label || 'Báo cáo';
}

function emptyMetricRow(key: string, label: string): MetricRow {
  return {
    key,
    label,
    orderCount: 0,
    customerCount: 0,
    revenue: 0,
    paidAmount: 0,
    remainingRevenue: 0,
    cost: 0,
    paidCost: 0,
    remainingCost: 0,
    profit: 0,
    commission: 0,
    marginRate: 0,
    averageOrderValue: 0,
    profitAfterCommission: 0,
    paidRatio: 0,
  };
}

function normalizeMetricRow(value: unknown, index: number): MetricRow {
  const row = asRecord(value);
  return {
    ...emptyMetricRow(asText(row.key) || `row-${index}`, asText(row.label) || 'Chưa phân nhóm'),
    orderCount: asNumber(row.orderCount),
    customerCount: asNumber(row.customerCount),
    revenue: asNumber(row.revenue),
    paidAmount: asNumber(row.paidAmount),
    remainingRevenue: asNumber(row.remainingRevenue),
    cost: asNumber(row.cost),
    paidCost: asNumber(row.paidCost),
    remainingCost: asNumber(row.remainingCost),
    profit: asNumber(row.profit),
    commission: asNumber(row.commission),
    marginRate: asNumber(row.marginRate),
    averageOrderValue: asNumber(row.averageOrderValue),
    profitAfterCommission: asNumber(row.profitAfterCommission),
    paidRatio: asNumber(row.paidRatio),
  };
}

function normalizeRows(active: ReportTab, data: ReportData): MetricRow[] {
  if (active === 'finance') return (Array.isArray(data.byType) ? data.byType : []).map(normalizeMetricRow);
  if (active === 'customer-debt') {
    return (Array.isArray(data.rows) ? data.rows : []).map((value, index) => {
      const row = asRecord(value);
      const totalRevenue = asNumber(row.totalRevenue);
      const paidAmount = asNumber(row.paidAmount);
      const customerName = asText(row.customerName) || 'Chưa có tên khách hàng';
      const systemCode = asText(row.systemCode);
      return {
        ...emptyMetricRow(asText(row.orderId) || asText(row.systemCode) || `customer-debt-${index}`, [customerName, systemCode].filter(Boolean).join(' - ')),
        orderCount: 1,
        customerCount: 1,
        revenue: totalRevenue,
        paidAmount,
        remainingRevenue: numberOr(row.remainingRevenue, totalRevenue - paidAmount),
      };
    });
  }
  if (active === 'supplier-debt') {
    return (Array.isArray(data.rows) ? data.rows : []).map((value, index) => {
      const row = asRecord(value);
      const totalCost = asNumber(row.totalPurchase);
      const paidCost = asNumber(row.paidAmount);
      return {
        ...emptyMetricRow(asText(row.supplierId) || asText(row.supplierName) || `supplier-debt-${index}`, asText(row.supplierName) || 'Chưa gán nhà cung cấp'),
        orderCount: asNumber(row.voucherCount),
        cost: totalCost,
        paidCost,
        remainingCost: numberOr(row.remainingAmount, totalCost - paidCost),
      };
    });
  }
  return (Array.isArray(data.rows) ? data.rows : []).map(normalizeMetricRow);
}

function normalizeSummary(active: ReportTab, value: ReportSummary | undefined): NormalizedSummary {
  const summary = asRecord(value);
  if (active === 'supplier-debt') {
    const totalCost = asNumber(summary.totalPurchase);
    const paidCost = asNumber(summary.paidAmount);
    return {
      totalRevenue: 0,
      paidAmount: 0,
      remainingRevenue: 0,
      totalCost,
      paidCost,
      remainingCost: numberOr(summary.remainingAmount, totalCost - paidCost),
      profit: 0,
      commission: 0,
      marginRate: 0,
    };
  }

  const totalRevenue = asNumber(summary.totalRevenue);
  const paidAmount = asNumber(summary.paidAmount);
  const totalCost = asNumber(summary.totalCost);
  const paidCost = asNumber(summary.paidCost);
  const profit = numberOr(summary.profit, totalRevenue - totalCost);
  return {
    totalRevenue,
    paidAmount,
    remainingRevenue: numberOr(summary.remainingRevenue, totalRevenue - paidAmount),
    totalCost,
    paidCost,
    remainingCost: numberOr(summary.remainingCost, totalCost - paidCost),
    profit,
    commission: asNumber(summary.commission),
    marginRate: numberOr(summary.marginRate, totalRevenue ? (profit / totalRevenue) * 100 : 0),
  };
}

function summaryItems(active: ReportTab, summary: NormalizedSummary) {
  if (active === 'customer-debt') {
    return [
      ['Tổng phải thu', money(summary.totalRevenue)],
      ['Thực thu', money(summary.paidAmount)],
      ['Còn phải thu', money(summary.remainingRevenue)],
    ];
  }
  if (active === 'supplier-debt') {
    return [
      ['Tổng phải chi', money(summary.totalCost)],
      ['Thực chi', money(summary.paidCost)],
      ['Còn phải chi', money(summary.remainingCost)],
    ];
  }
  return [
    ['Tổng doanh thu', money(summary.totalRevenue)],
    ['Thực thu', money(summary.paidAmount)],
    ['Còn phải thu', money(summary.remainingRevenue)],
    ['Tổng chi', money(summary.totalCost)],
    ['Thực chi', money(summary.paidCost)],
    ['Còn phải chi', money(summary.remainingCost)],
    ['Lợi nhuận', money(summary.profit)],
    ['Tỷ suất', percent(summary.marginRate)],
  ];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Không xác định được nguyên nhân';
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', headers: authHeaders() });
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 180);
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}

export default function ReportsClient({ initialOverview, initialRevenue }: { initialOverview: Overview; initialRevenue: ReportData }) {
  const [overview, setOverview] = useState<Overview>(initialOverview || {});
  const [active, setActive] = useState<ReportTab>('revenue');
  const [groupBy, setGroupBy] = useState<GroupBy>('by-created-date');
  const [filters, setFilters] = useState<Filters>({ dateField: 'createdAt' });
  const [report, setReport] = useState<ReportData>(initialRevenue || { summary: {}, rows: [] });
  const [message, setMessage] = useState<MessageState>({ kind: 'idle', text: '' });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestSequence = useRef(0);

  const rows = useMemo(() => normalizeRows(active, report), [active, report]);
  const normalizedReportSummary = normalizeSummary(active, report.summary);
  const currentSummaryItems = summaryItems(active, normalizedReportSummary);
  const columns = useMemo(() => {
    const helper = createColumnHelper<MetricRow>();
    const label = helper.accessor('label', { header: active === 'supplier-debt' ? 'Nhà cung cấp' : active === 'customer-debt' ? 'Khách hàng / Đơn hàng' : 'Nhóm báo cáo', cell: (info) => <strong>{info.getValue()}</strong> });
    if (active === 'customer-debt') {
      return [
        label,
        helper.accessor('revenue', { header: 'Tổng phải thu', cell: (info) => money(info.getValue()) }),
        helper.accessor('paidAmount', { header: 'Thực thu', cell: (info) => money(info.getValue()) }),
        helper.accessor('remainingRevenue', { header: 'Còn phải thu', cell: (info) => money(info.getValue()) }),
      ];
    }
    if (active === 'supplier-debt') {
      return [
        label,
        helper.accessor('orderCount', { header: 'Số chứng từ', cell: (info) => count(info.getValue()) }),
        helper.accessor('cost', { header: 'Tổng phải chi', cell: (info) => money(info.getValue()) }),
        helper.accessor('paidCost', { header: 'Thực chi', cell: (info) => money(info.getValue()) }),
        helper.accessor('remainingCost', { header: 'Còn phải chi', cell: (info) => money(info.getValue()) }),
      ];
    }
    return [
      label,
      helper.accessor('orderCount', { header: 'Số đơn', cell: (info) => count(info.getValue()) }),
      helper.accessor('customerCount', { header: 'Khách hàng', cell: (info) => count(info.getValue()) }),
      helper.accessor('revenue', { header: 'Tổng doanh thu', cell: (info) => money(info.getValue()) }),
      helper.accessor('paidAmount', { header: 'Thực thu', cell: (info) => money(info.getValue()) }),
      helper.accessor('remainingRevenue', { header: 'Còn phải thu', cell: (info) => money(info.getValue()) }),
      helper.accessor('cost', { header: 'Tổng chi', cell: (info) => money(info.getValue()) }),
      helper.accessor('paidCost', { header: 'Thực chi', cell: (info) => money(info.getValue()) }),
      helper.accessor('remainingCost', { header: 'Còn phải chi', cell: (info) => money(info.getValue()) }),
      helper.accessor('profit', { header: 'Lợi nhuận', cell: (info) => money(info.getValue()) }),
      helper.accessor('marginRate', { header: 'Tỷ suất', cell: (info) => percent(info.getValue()) }),
    ];
  }, [active]);
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  async function load(nextActive: ReportTab = active, nextGroupBy: GroupBy = groupBy, nextFilters: Filters = filters, reason: LoadReason = 'refresh') {
    const requestId = ++requestSequence.current;
    const label = reportTabLabel(nextActive);
    const overviewQuery = qs(pickFilters(nextFilters, orderFilterKeys));
    const currentReportQuery = qs(reportFilters(nextActive, nextFilters, nextGroupBy));
    const overviewUrl = `${browserApiBase()}/api/reports/overview${overviewQuery ? `?${overviewQuery}` : ''}`;
    const reportUrl = `${browserApiBase()}/api${endpointFor(nextActive, nextGroupBy)}${currentReportQuery ? `?${currentReportQuery}` : ''}`;

    setLoading(true);
    setMessage({ kind: 'loading', text: `Đang tải báo cáo ${label.toLowerCase()}...` });
    const [overviewResult, reportResult] = await Promise.allSettled([
      fetchJson<Overview>(overviewUrl),
      fetchJson<ReportData>(reportUrl),
    ]);
    if (requestId !== requestSequence.current) return;

    const errors: string[] = [];
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    else errors.push(`tổng quan: ${errorMessage(overviewResult.reason)}`);

    if (reportResult.status === 'fulfilled') setReport(reportResult.value);
    else {
      setReport({ summary: {}, rows: [] });
      errors.push(`${label.toLowerCase()}: ${errorMessage(reportResult.reason)}`);
    }

    if (errors.length) {
      setMessage({ kind: 'error', text: `Lỗi tải ${errors.join('; ')}` });
    } else if (reason === 'filter') {
      setMessage({ kind: 'success', text: `Đã lọc dữ liệu báo cáo ${label.toLowerCase()}.` });
    } else if (reason === 'reset') {
      setMessage({ kind: 'success', text: `Đã xóa bộ lọc và tải lại báo cáo ${label.toLowerCase()}.` });
    } else {
      setMessage({ kind: 'success', text: `Đã tải báo cáo ${label.toLowerCase()}.` });
    }
    setLoading(false);
  }

  function setTab(tab: ReportTab) {
    if (tab === active) return;
    setActive(tab);
    setReport({ summary: {}, rows: [] });
    void load(tab, groupBy, filters, 'tab');
  }

  function setFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function changeGroup(nextGroupBy: GroupBy) {
    setGroupBy(nextGroupBy);
    void load(active, nextGroupBy, filters, 'group');
  }

  function resetFilters() {
    const nextFilters = { dateField: 'createdAt' };
    setFilters(nextFilters);
    void load(active, groupBy, nextFilters, 'reset');
  }

  async function exportCsv() {
    const exportTab = active;
    const query = qs(reportFilters(exportTab, filters, groupBy));
    const url = `${browserApiBase()}/api/reports/export/${exportTab}${query ? `?${query}` : ''}`;
    setExporting(true);
    setMessage({ kind: 'loading', text: `Đang xuất báo cáo ${reportTabLabel(exportTab).toLowerCase()}...` });
    try {
      const response = await fetch(url, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) {
        const detail = (await response.text()).trim().slice(0, 180);
        throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `bao-cao-${exportTab}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      setMessage({ kind: 'success', text: `Đã xuất báo cáo ${reportTabLabel(exportTab).toLowerCase()}.` });
    } catch (error) {
      setMessage({ kind: 'error', text: `Lỗi xuất báo cáo ${reportTabLabel(exportTab).toLowerCase()}: ${errorMessage(error)}` });
    } finally {
      setExporting(false);
    }
  }

  const supplierDebtMode = active === 'supplier-debt';

  return (
    <div className="orderPage reportsPage">
      <section className="metrics reportMetrics">
        <article className="metric metricTone-blue"><span>Tổng doanh thu</span><strong>{money(overview.totalRevenue)}</strong></article>
        <article className="metric metricTone-green"><span>Thực thu</span><strong>{money(overview.paidAmount)}</strong></article>
        <article className="metric metricTone-amber"><span>Còn phải thu</span><strong>{money(overview.remainingRevenue)}</strong></article>
        <article className="metric"><span>Tổng chi</span><strong>{money(overview.totalCost)}</strong></article>
        <article className="metric metricTone-red"><span>Còn phải chi</span><strong>{money(overview.remainingCost)}</strong></article>
        <article className="metric metricTone-green"><span>Lợi nhuận</span><strong>{money(overview.profit)}</strong></article>
        <article className="metric"><span>Tổng đơn hàng</span><strong>{count(overview.totalOrders)}</strong></article>
        <article className="metric"><span>Khách hàng</span><strong>{count(overview.totalCustomers)}</strong></article>
        <article className="metric"><span>NCC còn nợ</span><strong>{count(overview.supplierDebtCount)}</strong></article>
      </section>

      <section className="panel reportFilterPanel">
        <div className="sectionHeader">
          <h2>Bộ lọc báo cáo</h2>
          <span role={message.kind === 'error' ? 'alert' : undefined}>{message.text || 'Lọc dữ liệu theo đúng tiêu chí từng nhóm báo cáo'}</span>
        </div>
        <div className="quoteFormGrid reportFilterGrid">
          <label>Tìm nhanh<input value={filters.search || ''} onChange={(event) => setFilter('search', event.target.value)} /></label>
          <label>Từ ngày<input type="date" value={filters.dateFrom || ''} onChange={(event) => setFilter('dateFrom', event.target.value)} /></label>
          <label>Đến ngày<input type="date" value={filters.dateTo || ''} onChange={(event) => setFilter('dateTo', event.target.value)} /></label>
          {supplierDebtMode ? (
            <label>Nhà cung cấp<input value={filters.supplier || ''} onChange={(event) => setFilter('supplier', event.target.value)} /></label>
          ) : (
            <>
              <label>Lọc theo ngày<select value={filters.dateField || 'createdAt'} onChange={(event) => setFilter('dateField', event.target.value)}>{dateFields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Loại dịch vụ<select value={filters.type || ''} onChange={(event) => setFilter('type', event.target.value)}>{typeOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Thanh toán<select value={filters.paymentStatus || ''} onChange={(event) => setFilter('paymentStatus', event.target.value)}>{paymentOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></label>
              <label>Chi nhánh<input value={filters.branch || ''} onChange={(event) => setFilter('branch', event.target.value)} /></label>
              <label>Phòng ban<input value={filters.department || ''} onChange={(event) => setFilter('department', event.target.value)} /></label>
              <label>Nhân viên<input value={filters.employee || ''} onChange={(event) => setFilter('employee', event.target.value)} /></label>
              <label>Đại lý<input value={filters.agency || ''} onChange={(event) => setFilter('agency', event.target.value)} /></label>
              <label>Thị trường<input value={filters.marketGroup || ''} onChange={(event) => setFilter('marketGroup', event.target.value)} /></label>
              <label>Trạng thái quyết toán<select value={filters.settled || ''} onChange={(event) => setFilter('settled', event.target.value)}><option value="">Tất cả</option><option value="true">Đã quyết toán</option><option value="false">Chưa quyết toán</option></select></label>
            </>
          )}
        </div>
        <div className="hotelFormActions reportActions">
          <button type="button" disabled={loading} onClick={() => void load(active, groupBy, filters, 'filter')}><Search size={17}/> {loading ? 'Đang tải...' : 'Lọc dữ liệu'}</button>
          <button type="button" disabled={loading} className="secondaryButton" onClick={resetFilters}><RefreshCw size={17}/> Xóa lọc</button>
          <button type="button" disabled={exporting} className="secondaryButton" onClick={() => void exportCsv()}><Download size={17}/> {exporting ? 'Đang xuất...' : 'Xuất CSV'}</button>
        </div>
      </section>

      <section className="panel">
        <div className="reportTabs">
          {reportTabs.map((tab) => <button type="button" key={tab.key} className={active === tab.key ? 'active' : ''} onClick={() => setTab(tab.key)}>{tab.label}</button>)}
        </div>
        <div className="reportControls">
          {supportsGrouping(active) ? (
            <label>Nhóm báo cáo<select value={groupBy} onChange={(event) => changeGroup(event.target.value as GroupBy)}>{groupOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          ) : null}
          <div className="summaryRows reportSummary">
            {currentSummaryItems.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </div>
      </section>

      <section className="panel listPanel">
        <div className="sectionHeader"><h2>{reportTabLabel(active)}</h2><span>{count(rows.length)} dòng</span></div>
        {rows.length ? (
          <div className="fitTableWrap">
            <table className="fitTable orderListTable reportTable">
              <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} style={numericColumnIds.has(header.column.id) ? numericCellStyle : undefined}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
              <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id} style={numericColumnIds.has(cell.column.id) ? numericCellStyle : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : <div className="tableEmptyState">Không có dữ liệu báo cáo phù hợp bộ lọc.</div>}
      </section>
    </div>
  );
}
