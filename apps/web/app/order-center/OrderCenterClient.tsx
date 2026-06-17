'use client';

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { authHeaders } from '../authFetch';
import { usePermissions } from '../usePermissions';

import { viStatus } from '../i18n';
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
  const { can } = usePermissions();
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [orders, setOrders] = useState(initialOrders);
  const [filters, setFilters] = useState<Filters>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const table = useReactTable({
    data: orders,
    columns: useMemo(() => {
      const helper = createColumnHelper<OrderRow>();
      return [
        helper.display({ id: 'code', header: 'Mã đơn', cell: ({ row }) => <span><strong>{row.original.systemCode}</strong><span className="mutedText"> · {row.original.type}</span></span> }),
        helper.display({ id: 'tour', header: 'Tour / Dịch vụ', cell: ({ row }) => <span>{row.original.tourCode || '-'} · {row.original.name}</span> }),
        helper.display({ id: 'customer', header: 'Khách hàng', cell: ({ row }) => <span>{row.original.customerName || '-'} · {row.original.customerPhone || '-'}</span> }),
        helper.display({ id: 'dates', header: 'Lịch', cell: ({ row }) => <span>{dateOnly(row.original.startDate)} - {dateOnly(row.original.endDate)}</span> }),
        helper.display({ id: 'revenue', header: 'Thu', cell: ({ row }) => <span>{money(row.original.totalRevenue)} · Còn: {money(row.original.remainingRevenue)}</span> }),
        helper.display({ id: 'cost', header: 'Chi', cell: ({ row }) => <span>{money(row.original.totalCost)} · Còn: {money(row.original.remainingCost)}</span> }),
        helper.accessor('profit', { header: 'Lợi nhuận', cell: (info) => money(info.getValue()) }),
        helper.display({ id: 'status', header: 'Trạng thái', cell: ({ row }) => <span className={`statusPill status-${row.original.status.toLowerCase()}`}>{viStatus(row.original.status)}</span> }),
        helper.display({ id: 'owner', header: 'Chi nhánh / NVDH', cell: ({ row }) => <span>{row.original.branch || '-'} · {row.original.operatorOwner || '-'}</span> }),
      ];
    }, []),
    getCoreRowModel: getCoreRowModel(),
  });

  async function load(nextFilters = filters) {
    setLoading(true);
    setMessage('Đang tải dữ liệu trung tâm đơn hàng...');
    const query = qs(nextFilters);
    try {
      const [dashboardResponse, ordersResponse] = await Promise.all([
        fetch(`${browserApiBase()}/api/order-center/dashboard${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() }),
        fetch(`${browserApiBase()}/api/order-center${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() }),
      ]);
      if (!dashboardResponse.ok || !ordersResponse.ok) {
        throw new Error(await responseMessage(!ordersResponse.ok ? ordersResponse : dashboardResponse, 'Không tải được dữ liệu trung tâm đơn hàng'));
      }
      setDashboard(await dashboardResponse.json());
      setOrders(await ordersResponse.json());
      setMessage('Đã cập nhật dữ liệu theo bộ lọc.');
    } catch (error) {
      setOrders([]);
      setMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu trung tâm đơn hàng.');
    } finally {
      setLoading(false);
    }
  }

  function setFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    const nextFilters = {};
    setFilters(nextFilters);
    setMessage('Đã xóa bộ lọc. Đang tải lại dữ liệu...');
    void load(nextFilters);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const query = qs(filters);
      const response = await fetch(`${browserApiBase()}/api/order-center/export${query ? `?${query}` : ''}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không xuất được CSV trung tâm đơn hàng'));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'smarttour-order-center.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('Đã xuất CSV trung tâm đơn hàng.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không xuất được CSV trung tâm đơn hàng.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="orderPage">
      <section className="metrics orderMetrics">
        <article className="metric metricTone-blue"><span>Tổng đơn</span><strong>{dashboard.total}</strong></article>
        <article className="metric metricTone-amber"><span>Sắp chạy</span><strong>{dashboard.upcoming}</strong></article>
        <article className="metric metricTone-indigo"><span>Đang chạy</span><strong>{dashboard.running}</strong></article>
        <article className="metric metricTone-green"><span>Hoàn thành</span><strong>{dashboard.completed}</strong></article>
        <article className="metric metricTone-red"><span>Đã hủy</span><strong>{dashboard.cancelled}</strong></article>
        <article className="metric"><span>Chưa thu hết</span><strong>{dashboard.unpaid}</strong></article>
        <article className="metric"><span>Chưa chi hết</span><strong>{dashboard.unpaidCost}</strong></article>
        <article className="metric metricTone-green"><span>Lợi nhuận</span><strong>{money(dashboard.profit)}</strong></article>
      </section>

      <section className="panel orderFilterPanel">
        <div className="sectionHeader"><h2>Bộ lọc nâng cao</h2><span>{message || 'Lọc tập trung toàn bộ đơn hàng trên hệ thống'}</span></div>
        <div className="quoteFormGrid orderFilterGrid">
          <label>Tìm nhanh<input value={filters.search || ''} onChange={(event) => setFilter('search', event.target.value)} /></label>
          <label>Mã đơn<input value={filters.systemCode || ''} onChange={(event) => setFilter('systemCode', event.target.value)} /></label>
          <label>Mã tour<input value={filters.tourCode || ''} onChange={(event) => setFilter('tourCode', event.target.value)} /></label>
          <label>Tên tour/dịch vụ<input value={filters.name || ''} onChange={(event) => setFilter('name', event.target.value)} /></label>
          <label>Khách hàng<input value={filters.customerName || ''} onChange={(event) => setFilter('customerName', event.target.value)} /></label>
          <label>Điện thoại<input value={filters.customerPhone || ''} onChange={(event) => setFilter('customerPhone', event.target.value)} /></label>
          <label>Loại đơn<select value={filters.type || ''} onChange={(event) => setFilter('type', event.target.value)}>{typeOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tất cả'}</option>)}</select></label>
          <label>Trạng thái<select value={filters.status || ''} onChange={(event) => setFilter('status', event.target.value)}>{statusOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tất cả'}</option>)}</select></label>
          <label>Thanh toán<select value={filters.paymentStatus || ''} onChange={(event) => setFilter('paymentStatus', event.target.value)}>{paymentOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tất cả'}</option>)}</select></label>
          <label>Chi phí<select value={filters.costStatus || ''} onChange={(event) => setFilter('costStatus', event.target.value)}>{costOptions.map((item) => <option key={item || 'all'} value={item}>{item || 'Tất cả'}</option>)}</select></label>
          <label>Khởi hành từ<input type="date" value={filters.startFrom || ''} onChange={(event) => setFilter('startFrom', event.target.value)} /></label>
          <label>Khởi hành đến<input type="date" value={filters.startTo || ''} onChange={(event) => setFilter('startTo', event.target.value)} /></label>
          <label>Ngày về từ<input type="date" value={filters.endFrom || ''} onChange={(event) => setFilter('endFrom', event.target.value)} /></label>
          <label>Ngày về đến<input type="date" value={filters.endTo || ''} onChange={(event) => setFilter('endTo', event.target.value)} /></label>
          <label>Thị trường<input value={filters.marketGroup || ''} onChange={(event) => setFilter('marketGroup', event.target.value)} /></label>
          <label>Chi nhánh<input value={filters.branch || ''} onChange={(event) => setFilter('branch', event.target.value)} /></label>
          <label>Phòng ban<input value={filters.department || ''} onChange={(event) => setFilter('department', event.target.value)} /></label>
          <label>Sales<input value={filters.sales || ''} onChange={(event) => setFilter('sales', event.target.value)} /></label>
          <label>Điều hành<input value={filters.operatorOwner || ''} onChange={(event) => setFilter('operatorOwner', event.target.value)} /></label>
          <label>Nhà cung cấp<input value={filters.supplier || ''} onChange={(event) => setFilter('supplier', event.target.value)} /></label>
          <label>Hoa hồng<input value={filters.commissionStatus || ''} onChange={(event) => setFilter('commissionStatus', event.target.value)} /></label>
          <label>Nhóm khách<input value={filters.customerType || ''} onChange={(event) => setFilter('customerType', event.target.value)} /></label>
        </div>
        <div className="hotelFormActions orderActions">
          <button type="button" disabled={loading} onClick={() => void load()}>{loading ? <Loader2 size={17} /> : <Search size={17}/>} {loading ? 'Đang tải dữ liệu' : 'Lọc dữ liệu'}</button>
          <button type="button" disabled={loading} className="secondaryButton" onClick={resetFilters}><RefreshCw size={17}/> Xóa lọc</button>
          <button type="button" disabled={exporting || !can('order.export')} className="secondaryButton" onClick={() => void exportCsv()}><Download size={17}/> {exporting ? 'Đang xuất...' : 'Xuất CSV'}</button>
        </div>
      </section>

      <section className="panel listPanel">
        <div className="sectionHeader"><h2>Danh sách đơn hàng tập trung</h2><span>{loading ? 'Đang tải dữ liệu...' : `${orders.length} dòng`}</span></div>
        <div className="fitTableWrap compactListTableWrap">
          <table className="fitTable orderListTable compactListTable">
            <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
            <tbody>
              {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
              {orders.length === 0 ? <tr><td colSpan={9} className="tableEmptyState">{loading ? 'Đang tải dữ liệu trung tâm đơn hàng...' : 'Không có đơn hàng phù hợp bộ lọc.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    const message = data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    return fallback;
  }
  return fallback;
}
