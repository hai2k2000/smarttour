'use client';

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Download, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
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
type ReportData = { summary: Summary; rows: MetricRow[]; orders?: any[]; byType?: MetricRow[]; cashflowByMonth?: any[] };
type Overview = Summary & { totalOrders?: number; totalCustomers?: number; supplierDebtCount?: number; unpaidOrders?: number; unpaidCostOrders?: number; settledOrders?: number; byType?: MetricRow[]; byMonth?: MetricRow[] };
type Filters = Record<string, string>;

const reportTabs = [
  { key: 'revenue', label: 'Doanh thu' },
  { key: 'profit', label: 'Lợi nhuận' },
  { key: 'finance', label: 'Tài chính' },
  { key: 'customer-debt', label: 'Công nợ KH' },
  { key: 'supplier-debt', label: 'Công nợ NCC' },
  { key: 'employees', label: 'Nhân viên' },
];
const groupOptions = [
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
const typeOptions = ['', 'FIT_TOUR', 'GIT_COMBO', 'LANDTOUR', 'HOTEL_BOOKING', 'SINGLE_SERVICE', 'FLIGHT_ORDER'];
const paymentOptions = ['', 'UNPAID', 'PARTIAL', 'PAID', 'REFUND'];
const dateFields = [['createdAt', 'Ngày tạo'], ['bookingDate', 'Ngày đặt'], ['startDate', 'Check-in'], ['endDate', 'Check-out'], ['paymentDate', 'Thanh toán'], ['settledAt', 'Đã chốt']];

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}
function money(value: unknown) { return Number(value || 0).toLocaleString('vi-VN'); }
function percent(value: unknown) { return `${Number(value || 0).toFixed(1)}%`; }
function qs(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

function normalizeRows(active: string, data: ReportData): MetricRow[] {
  if (active === 'finance') return data.byType || [];
  if (active === 'customer-debt') {
    return ((data.rows || []) as any[]).map((row) => ({
      key: row.orderId,
      label: `${row.customerName || 'Chưa co ten'} - ${row.systemCode || ''}`,
      orderCount: 1,
      customerCount: 1,
      revenue: row.totalRevenue || 0,
      paidAmount: row.paidAmount || 0,
      remainingRevenue: row.remainingRevenue || 0,
      cost: 0,
      paidCost: 0,
      profit: 0,
      marginRate: 0,
    }));
  }
  if (active === 'supplier-debt') {
    return ((data.rows || []) as any[]).map((row) => ({
      key: row.supplierId || row.supplierName,
      label: row.supplierName || 'Chưa gan NCC',
      orderCount: row.voucherCount || 0,
      customerCount: 0,
      revenue: 0,
      paidAmount: 0,
      remainingRevenue: 0,
      cost: row.totalPurchase || 0,
      paidCost: row.paidAmount || 0,
      remainingCost: row.remainingAmount || 0,
      profit: -(row.remainingAmount || 0),
      marginRate: 0,
    }));
  }
  return data.rows || [];
}

export default function ReportsClient({ initialOverview, initialRevenue }: { initialOverview: Overview; initialRevenue: ReportData }) {
  const [overview, setOverview] = useState<Overview>(initialOverview || {});
  const [active, setActive] = useState('revenue');
  const [groupBy, setGroupBy] = useState('by-created-date');
  const [filters, setFilters] = useState<Filters>({ dateField: 'createdAt' });
  const [report, setReport] = useState<ReportData>(initialRevenue || { summary: {}, rows: [] });
  const [message, setMessage] = useState('');

  const rows = normalizeRows(active, report);
  const table = useReactTable({
    data: rows,
    columns: useMemo(() => {
      const helper = createColumnHelper<MetricRow>();
      return [
        helper.accessor('label', { header: 'Nhóm bao cao', cell: (info) => <strong>{info.getValue()}</strong> }),
        helper.accessor('orderCount', { header: 'Số đơn' }),
        helper.accessor('customerCount', { header: 'Khách' }),
        helper.accessor('revenue', { header: 'Doanh thu', cell: (info) => money(info.getValue()) }),
        helper.accessor('paidAmount', { header: 'Thuc thu', cell: (info) => money(info.getValue()) }),
        helper.accessor('remainingRevenue', { header: 'Còn thu', cell: (info) => money(info.getValue()) }),
        helper.accessor('cost', { header: 'Tổng chi', cell: (info) => money(info.getValue()) }),
        helper.accessor('paidCost', { header: 'Thực chi', cell: (info) => money(info.getValue()) }),
        helper.accessor('profit', { header: 'Lợi nhuận', cell: (info) => money(info.getValue()) }),
        helper.accessor('marginRate', { header: 'Ty suat', cell: (info) => percent(info.getValue()) }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function load(nextActive = active, nextGroupBy = groupBy, nextFilters = filters) {
    const query = qs({ ...nextFilters, groupBy: nextGroupBy });
    const endpoint = endpointFor(nextActive, nextGroupBy);
    const [overviewResponse, reportResponse] = await Promise.all([
      fetch(`${browserApiBase()}/api/reports/overview${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() }),
      fetch(`${browserApiBase()}/api${endpoint}${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() }),
    ]);
    if (overviewResponse.ok) setOverview(await overviewResponse.json());
    if (reportResponse.ok) setReport(await reportResponse.json());
    setMessage('Đã cập nhật bao cao theo bộ lọc.');
  }

  function endpointFor(tab: string, selectedGroup: string) {
    if (tab === 'profit') return '/reports/profit';
    if (tab === 'finance') return '/reports/finance';
    if (tab === 'customer-debt') return '/reports/debt/customers';
    if (tab === 'supplier-debt') return '/reports/debt/suppliers';
    if (tab === 'employees') return '/reports/employees/performance';
    return `/reports/revenue/${selectedGroup}`;
  }

  function setTab(tab: string) {
    setActive(tab);
    load(tab, groupBy);
  }

  function setFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function exportCsv() {
    const query = qs({ ...filters, groupBy });
    window.location.href = `${browserApiBase()}/api/reports/export/${active}${query ? `?${query}` : ''}`;
  }

  return (
    <div className="orderPage reportsPage">
      <section className="metrics reportMetrics">
        <article className="metric metricTone-blue"><span>Tong doanh thu</span><strong>{money(overview.totalRevenue)}</strong></article>
        <article className="metric metricTone-green"><span>Thuc thu</span><strong>{money(overview.paidAmount)}</strong></article>
        <article className="metric metricTone-amber"><span>Còn phai thu</span><strong>{money(overview.remainingRevenue)}</strong></article>
        <article className="metric"><span>Tổng chi</span><strong>{money(overview.totalCost)}</strong></article>
        <article className="metric metricTone-red"><span>Còn phai chi</span><strong>{money(overview.remainingCost)}</strong></article>
        <article className="metric metricTone-green"><span>Lợi nhuận</span><strong>{money(overview.profit)}</strong></article>
        <article className="metric"><span>Tổng đơn hang</span><strong>{overview.totalOrders || 0}</strong></article>
        <article className="metric"><span>Khách hàng</span><strong>{overview.totalCustomers || 0}</strong></article>
        <article className="metric"><span>NCC con no</span><strong>{overview.supplierDebtCount || 0}</strong></article>
      </section>

      <section className="panel reportFilterPanel">
        <div className="sectionHeader"><h2>Bộ lọc báo cáo</h2><span>{message || 'Lọc chung cho doanh thu, công nợ, tài chính và nhân viên'}</span></div>
        <div className="quoteFormGrid reportFilterGrid">
          <label>Tìm nhanh<input value={filters.search || ''} onChange={(event) => setFilter('search', event.target.value)} /></label>
          <label>Từ ngày<input type="date" value={filters.dateFrom || ''} onChange={(event) => setFilter('dateFrom', event.target.value)} /></label>
          <label>Đến ngày<input type="date" value={filters.dateTo || ''} onChange={(event) => setFilter('dateTo', event.target.value)} /></label>
          <label>Lọc theo ngày<select value={filters.dateField || 'createdAt'} onChange={(event) => setFilter('dateField', event.target.value)}>{dateFields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Loại dịch vụ<select value={filters.type || ''} onChange={(event) => setFilter('type', event.target.value)}>{typeOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tất cả'}</option>)}</select></label>
          <label>Thanh toán<select value={filters.paymentStatus || ''} onChange={(event) => setFilter('paymentStatus', event.target.value)}>{paymentOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tất cả'}</option>)}</select></label>
          <label>Chi nhánh<input value={filters.branch || ''} onChange={(event) => setFilter('branch', event.target.value)} /></label>
          <label>Phòng ban<input value={filters.department || ''} onChange={(event) => setFilter('department', event.target.value)} /></label>
          <label>Nhân viên<input value={filters.employee || ''} onChange={(event) => setFilter('employee', event.target.value)} /></label>
          <label>Đại lý<input value={filters.agency || ''} onChange={(event) => setFilter('agency', event.target.value)} /></label>
          <label>Thị trường<input value={filters.marketGroup || ''} onChange={(event) => setFilter('marketGroup', event.target.value)} /></label>
          <label>Trạng thái chốt<select value={filters.settled || ''} onChange={(event) => setFilter('settled', event.target.value)}><option value="">Tất cả</option><option value="true">Đã chốt</option><option value="false">Chưa chốt</option></select></label>
        </div>
        <div className="hotelFormActions reportActions">
          <button type="button" onClick={() => load()}><Search size={17}/> Lọc dữ liệu</button>
          <button type="button" className="secondaryButton" onClick={() => { setFilters({ dateField: 'createdAt' }); setMessage('Đã xoa bộ lọc.'); }}><RefreshCw size={17}/> Xóa lọc</button>
          <button type="button" className="secondaryButton" onClick={exportCsv}><Download size={17}/> Xuất CSV</button>
        </div>
      </section>

      <section className="panel">
        <div className="reportTabs">
          {reportTabs.map((tab) => <button type="button" key={tab.key} className={active === tab.key ? 'active' : ''} onClick={() => setTab(tab.key)}>{tab.label}</button>)}
        </div>
        <div className="reportControls">
          <label>Nhóm bao cao<select value={groupBy} onChange={(event) => { setGroupBy(event.target.value); load(active, event.target.value); }}>{groupOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="summaryRows reportSummary">
            <div><span>Doanh thu</span><strong>{money(report.summary?.totalRevenue)}</strong></div>
            <div><span>Chi phí</span><strong>{money(report.summary?.totalCost)}</strong></div>
            <div><span>Lợi nhuận</span><strong>{money(report.summary?.profit)}</strong></div>
            <div><span>Ty suat</span><strong>{percent(report.summary?.marginRate)}</strong></div>
          </div>
        </div>
      </section>

      <section className="panel listPanel">
        <div className="sectionHeader"><h2>{reportTabs.find((tab) => tab.key === active)?.label}</h2><span>{rows.length} dòng</span></div>
        {rows.length ? (
          <div className="fitTableWrap">
            <table className="fitTable orderListTable reportTable">
              <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
              <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : <div className="tableEmptyState">Không có dữ liệu báo cáo phù hợp bộ lọc.</div>}
      </section>
    </div>
  );
}
