'use client';

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Download, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { authHeaders } from '../authFetch';

type Dashboard = { total: number; upcoming: number; running: number; completed: number; cancelled: number; unpaid: number; unpaidCost: number; revenue: number; cost: number; profit: number };
type OrderRow = {
  id: string;
  systemCode: string;
  type: string;
  tourCode: string | null;
  name: string;
  customerName: string | null;
  customerPhone: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  paymentStatus: string;
  costStatus: string;
  totalRevenue: string;
  remainingRevenue: string;
  totalCost: string;
  remainingCost: string;
  profit: string;
  branch: string | null;
  operatorOwner: string | null;
};

type Filters = Record<string, string>;
const typeOptions = ['', 'FIT_TOUR', 'GIT_COMBO', 'LANDTOUR', 'HOTEL_BOOKING', 'SINGLE_SERVICE', 'FLIGHT_ORDER'];
const statusOptions = ['', 'DRAFT', 'UPCOMING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'SETTLED'];
const paymentOptions = ['', 'UNPAID', 'PARTIAL', 'PAID', 'REFUND'];
const costOptions = ['', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE'];

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}
function money(value: unknown) { return Number(value || 0).toLocaleString('vi-VN'); }
function dateOnly(value?: string | null) { return value ? value.slice(0, 10) : '-'; }
function qs(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

export default function OrderCenterClient({ initialDashboard, initialOrders }: { initialDashboard: Dashboard; initialOrders: OrderRow[] }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [orders, setOrders] = useState(initialOrders);
  const [filters, setFilters] = useState<Filters>({});
  const [message, setMessage] = useState('');
  const table = useReactTable({
    data: orders,
    columns: useMemo(() => {
      const helper = createColumnHelper<OrderRow>();
      return [
        helper.display({ id: 'code', header: 'Ma don', cell: ({ row }) => <div><strong>{row.original.systemCode}</strong><br /><span className="mutedText">{row.original.type}</span></div> }),
        helper.display({ id: 'tour', header: 'Tour / Dich vu', cell: ({ row }) => <span>{row.original.tourCode || '-'}<br />{row.original.name}</span> }),
        helper.display({ id: 'customer', header: 'Khach hang', cell: ({ row }) => <span>{row.original.customerName || '-'}<br />{row.original.customerPhone || '-'}</span> }),
        helper.display({ id: 'dates', header: 'Lich', cell: ({ row }) => <span>{dateOnly(row.original.startDate)}<br />{dateOnly(row.original.endDate)}</span> }),
        helper.display({ id: 'revenue', header: 'Thu', cell: ({ row }) => <span>{money(row.original.totalRevenue)}<br />Con: {money(row.original.remainingRevenue)}</span> }),
        helper.display({ id: 'cost', header: 'Chi', cell: ({ row }) => <span>{money(row.original.totalCost)}<br />Con: {money(row.original.remainingCost)}</span> }),
        helper.accessor('profit', { header: 'Loi nhuan', cell: (info) => money(info.getValue()) }),
        helper.display({ id: 'status', header: 'Trang thai', cell: ({ row }) => <span className={`statusPill status-${row.original.status.toLowerCase()}`}>{row.original.status}</span> }),
        helper.display({ id: 'owner', header: 'Chi nhanh / NVDH', cell: ({ row }) => <span>{row.original.branch || '-'}<br />{row.original.operatorOwner || '-'}</span> }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function load(nextFilters = filters) {
    const query = qs(nextFilters);
    const [dashboardResponse, ordersResponse] = await Promise.all([
      fetch(`${browserApiBase()}/api/order-center/dashboard${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() }),
      fetch(`${browserApiBase()}/api/order-center${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() }),
    ]);
    if (dashboardResponse.ok) setDashboard(await dashboardResponse.json());
    if (ordersResponse.ok) setOrders(await ordersResponse.json());
    setMessage('Da cap nhat du lieu theo bo loc.');
  }

  function setFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function exportCsv() {
    const query = qs(filters);
    window.location.href = `${browserApiBase()}/api/order-center/export${query ? `?${query}` : ''}`;
  }

  return (
    <div className="orderPage">
      <section className="metrics orderMetrics">
        <article className="metric metricTone-blue"><span>Tong don</span><strong>{dashboard.total}</strong></article>
        <article className="metric metricTone-amber"><span>Sap chay</span><strong>{dashboard.upcoming}</strong></article>
        <article className="metric metricTone-indigo"><span>Dang chay</span><strong>{dashboard.running}</strong></article>
        <article className="metric metricTone-green"><span>Hoan thanh</span><strong>{dashboard.completed}</strong></article>
        <article className="metric metricTone-red"><span>Da huy</span><strong>{dashboard.cancelled}</strong></article>
        <article className="metric"><span>Chua thu het</span><strong>{dashboard.unpaid}</strong></article>
        <article className="metric"><span>Chua chi het</span><strong>{dashboard.unpaidCost}</strong></article>
        <article className="metric metricTone-green"><span>Loi nhuan</span><strong>{money(dashboard.profit)}</strong></article>
      </section>

      <section className="panel orderFilterPanel">
        <div className="sectionHeader"><h2>Bo loc nang cao</h2><span>{message || 'Loc tap trung toan bo don hang tren he thong'}</span></div>
        <div className="quoteFormGrid orderFilterGrid">
          <label>Tim nhanh<input value={filters.search || ''} onChange={(event) => setFilter('search', event.target.value)} /></label>
          <label>Ma don<input value={filters.systemCode || ''} onChange={(event) => setFilter('systemCode', event.target.value)} /></label>
          <label>Ma tour<input value={filters.tourCode || ''} onChange={(event) => setFilter('tourCode', event.target.value)} /></label>
          <label>Ten tour/dich vu<input value={filters.name || ''} onChange={(event) => setFilter('name', event.target.value)} /></label>
          <label>Khach hang<input value={filters.customerName || ''} onChange={(event) => setFilter('customerName', event.target.value)} /></label>
          <label>Dien thoai<input value={filters.customerPhone || ''} onChange={(event) => setFilter('customerPhone', event.target.value)} /></label>
          <label>Loai don<select value={filters.type || ''} onChange={(event) => setFilter('type', event.target.value)}>{typeOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tat ca'}</option>)}</select></label>
          <label>Trang thai<select value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)}>{statusOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tat ca'}</option>)}</select></label>
          <label>Thanh toan<select value={filters.paymentStatus || ''} onChange={(event) => setFilter('paymentStatus', event.target.value)}>{paymentOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tat ca'}</option>)}</select></label>
          <label>Chi phi<select value={filters.costStatus || ''} onChange={(event) => setFilter('costStatus', event.target.value)}>{costOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tat ca'}</option>)}</select></label>
          <label>Khoi hanh tu<input type="date" value={filters.startFrom || ''} onChange={(event) => setFilter('startFrom', event.target.value)} /></label>
          <label>Khoi hanh den<input type="date" value={filters.startTo || ''} onChange={(event) => setFilter('startTo', event.target.value)} /></label>
          <label>Ngay ve tu<input type="date" value={filters.endFrom || ''} onChange={(event) => setFilter('endFrom', event.target.value)} /></label>
          <label>Ngay ve den<input type="date" value={filters.endTo || ''} onChange={(event) => setFilter('endTo', event.target.value)} /></label>
          <label>Thi truong<input value={filters.marketGroup || ''} onChange={(event) => setFilter('marketGroup', event.target.value)} /></label>
          <label>Chi nhanh<input value={filters.branch || ''} onChange={(event) => setFilter('branch', event.target.value)} /></label>
          <label>Phong ban<input value={filters.department || ''} onChange={(event) => setFilter('department', event.target.value)} /></label>
          <label>Sales<input value={filters.sales || ''} onChange={(event) => setFilter('sales', event.target.value)} /></label>
          <label>Dieu hanh<input value={filters.operatorOwner || ''} onChange={(event) => setFilter('operatorOwner', event.target.value)} /></label>
          <label>Nha cung cap<input value={filters.supplier || ''} onChange={(event) => setFilter('supplier', event.target.value)} /></label>
          <label>Hoa hong<input value={filters.commissionStatus || ''} onChange={(event) => setFilter('commissionStatus', event.target.value)} /></label>
          <label>Nhom khach<input value={filters.customerType || ''} onChange={(event) => setFilter('customerType', event.target.value)} /></label>
        </div>
        <div className="hotelFormActions orderActions">
          <button type="button" onClick={() => load()}><Search size={17}/> Loc du lieu</button>
          <button type="button" className="secondaryButton" onClick={exportCsv}><Download size={17}/> Export CSV</button>
        </div>
      </section>

      <section className="panel listPanel">
        <div className="sectionHeader"><h2>Danh sach don hang tap trung</h2><span>{orders.length} dong</span></div>
        {orders.length ? (
          <div className="fitTableWrap">
            <table className="fitTable orderListTable">
              <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
              <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : <div className="tableEmptyState">Khong co don hang phu hop bo loc.</div>}
      </section>
    </div>
  );
}
