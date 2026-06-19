'use client';

import { CheckCircle2, Download, Eye, RefreshCcw, Search, WalletCards, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

import { viStatus } from '../i18n';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Summary = {
  totalCommission: number;
  approvedCommission: number;
  pendingCommission: number;
  paidCommission: number;
  unpaidCommission: number;
  revenue: number;
  profit: number;
  bookingCount: number;
  conversionRate: number;
};

type Row = {
  id: string;
  orderCode: string;
  tourCode?: string;
  order?: { name?: string | null; systemCode?: string | null; tourCode?: string | null };
  customerName?: string;
  salesOwner?: string;
  team?: string;
  department?: string;
  branch?: string;
  marketGroup?: string;
  milestoneDate?: string;
  revenue: string;
  profit: string;
  ratePercent: string;
  commissionAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: string;
  paymentStatus: string;
  formula?: string;
  logs?: { id: string; action: string; actor?: string; createdAt: string; note?: string }[];
};

const emptySummary: Summary = { totalCommission: 0, approvedCommission: 0, pendingCommission: 0, paidCommission: 0, unpaidCommission: 0, revenue: 0, profit: 0, bookingCount: 0, conversionRate: 0 };

export default function CommissionReportsClient() {
  const { can, canAny } = usePermissions();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [grouping, setGrouping] = useState<{ key: string; revenue: number; profit: number; commission: number; bookingCount: number }[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [filter, setFilter] = useState({ search: '', status: '', paymentStatus: '', productType: '', employee: '', department: '', branch: '', market: '', groupBy: 'salesOwner' });
  const [message, setMessage] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  }, [filter]);

  useEffect(() => {
    void load();
  }, [query]);

  async function load() {
    const response = await fetch(`${API_URL}/api/commission-reports?${query}`, { cache: 'no-store', headers: authHeaders() });
    const data = await response.json();
    setRows(data.rows || []);
    setSummary(data.summary || emptySummary);
    setGrouping(data.grouping || []);
  }

  async function action(path: string, id: string) {
    setMessage('');
    const payload: Record<string, unknown> = { id, actor: 'accounting' };
    if (path === 'pay') payload.voucherNo = `PC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const response = await fetch(`${API_URL}/api/commission-reports/${path}`, { method: 'POST', headers: authJsonHeaders(), body: JSON.stringify(payload) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.message || 'Không thực hiện được');
      return;
    }
    setMessage('Đã cập nhật hoa hồng');
    await load();
  }

  async function sync() {
    await fetch(`${API_URL}/api/commission-reports/sync`, { method: 'POST', headers: authJsonHeaders(), body: '{}' });
    await load();
  }

  return (
    <section className="workspace commissionPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Tài chính</p>
          <h1>Báo cáo hoa hồng theo cột mốc</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral">{message}</span> : null}
          <button className="secondaryButton iconTextButton" disabled={!can('commission.manage')} onClick={sync}><RefreshCcw size={16} /> Đồng bộ đơn hàng</button>
          <button className="secondaryButton iconTextButton" onClick={() => { window.location.href = `${API_URL}/api/commission-reports/export?${query}`; }}><Download size={16} /> CSV</button>
        </div>
      </header>

      <section className="metrics commissionMetrics">
        <Metric label="Tổng hoa hồng" value={money(summary.totalCommission)} />
        <Metric label="Đã duyệt" value={money(summary.approvedCommission)} />
        <Metric label="Chờ duyệt" value={money(summary.pendingCommission)} />
        <Metric label="Đã chi" value={money(summary.paidCommission)} />
        <Metric label="Chưa chi" value={money(summary.unpaidCommission)} />
        <Metric label="Booking" value={summary.bookingCount} />
      </section>
      <PermissionNotice allowed={canAny(['commission.view', 'commission.manage'])} label="xem báo cáo hoa hồng" />

      <section className="panel commissionFilters">
        <label><Search size={15} /> Tìm kiếm<input value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} placeholder="Mã đơn, tour, khách, sales" /></label>
        <label>Trạng thái<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Tất cả</option><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option><option value="REVOKED">Thu hồi</option></select></label>
        <label>Thanh toán<select value={filter.paymentStatus} onChange={(event) => setFilter({ ...filter, paymentStatus: event.target.value })}><option value="">Tất cả</option><option value="UNPAID">Chưa chi</option><option value="PARTIAL">Chi một phần</option><option value="PAID">Đã chi</option></select></label>
        <label>Sản phẩm<select value={filter.productType} onChange={(event) => setFilter({ ...filter, productType: event.target.value })}><option value="">Tất cả</option><option value="FIT_TOUR">Tour FIT</option><option value="GIT_COMBO">Tour GIT / Combo</option><option value="LANDTOUR">LandTour / Combo</option><option value="HOTEL_BOOKING">Booking phòng khách sạn</option><option value="FLIGHT_ORDER">Đơn vé máy bay</option><option value="SINGLE_SERVICE">Dịch vụ lẻ</option></select></label>
        <label>Sales<input value={filter.employee} onChange={(event) => setFilter({ ...filter, employee: event.target.value })} /></label>
        <label>Phòng ban<input value={filter.department} onChange={(event) => setFilter({ ...filter, department: event.target.value })} /></label>
        <label>Chi nhánh<input value={filter.branch} onChange={(event) => setFilter({ ...filter, branch: event.target.value })} /></label>
        <label>Nhóm tổng hợp<select value={filter.groupBy} onChange={(event) => setFilter({ ...filter, groupBy: event.target.value })}><option value="salesOwner">Nhân viên</option><option value="team">Nhóm kinh doanh</option><option value="department">Phòng ban</option><option value="branch">Chi nhánh</option><option value="market">Thị trường</option></select></label>
      </section>

      <section className="contentGrid commissionGrid">
        <section className="panel">
          <div className="sectionHeader"><h2>Danh sách hoa hồng</h2><span>{rows.length} dòng</span></div>
          <div className="fitTableWrap compactListTableWrap">
            <table className="commissionTable compactListTable">
              <thead><tr><th>Đơn hàng</th><th>Khách</th><th>Sales</th><th>Cột mốc</th><th>Doanh thu</th><th>Lợi nhuận</th><th>%</th><th>Hoa hồng</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{commissionOrderTitle(row)}</strong><span>{commissionOrderSubtitle(row)}</span></td>
                    <td>{row.customerName || '-'}</td>
                    <td>{row.salesOwner || '-'}<span>{row.department || row.branch || ''}</span></td>
                    <td>{date(row.milestoneDate)}</td>
                    <td>{money(Number(row.revenue))}</td>
                    <td>{money(Number(row.profit))}</td>
                    <td>{Number(row.ratePercent).toFixed(2)}</td>
                    <td><strong>{money(Number(row.commissionAmount))}</strong><span>Còn {money(Number(row.remainingAmount))}</span></td>
                    <td><span className="statusPill">{viStatus(row.status)}</span><span>{viStatus(row.paymentStatus)}</span></td>
                    <td className="commissionActions">
                      <button className="secondaryButton iconButton" onClick={() => setSelected(row)}><Eye size={16} /></button>
                      <button className="secondaryButton iconButton" disabled={!can('commission.manage')} onClick={() => action('approve', row.id)}><CheckCircle2 size={16} /></button>
                      <button className="secondaryButton iconButton" disabled={!can('commission.manage')} onClick={() => action('reject', row.id)}><XCircle size={16} /></button>
                      <button className="secondaryButton iconButton" disabled={!can('commission.manage')} onClick={() => action('pay', row.id)}><WalletCards size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel commissionSide">
          <h2>Tổng hợp</h2>
          <div className="summaryRows">
            {grouping.slice(0, 8).map((row) => (
              <div key={row.key}><span>{row.key}</span><strong>{money(row.commission)}</strong></div>
            ))}
          </div>
          {selected && (
            <>
              <h2>Chi tiết</h2>
              <div className="summaryRows">
                <div><span>Công thức</span><strong>{selected.formula || '-'}</strong></div>
                <div><span>Hoa hồng</span><strong>{money(Number(selected.commissionAmount))}</strong></div>
                <div><span>Đã chi</span><strong>{money(Number(selected.paidAmount))}</strong></div>
              </div>
              <div className="timelineList">
                {(selected.logs || []).map((log) => <p key={log.id}><b>{log.action}</b> {log.actor || ''} {date(log.createdAt)}</p>)}
              </div>
            </>
          )}
        </aside>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function commissionOrderTitle(row: Row) {
  return row.order?.name || row.customerName || row.tourCode || row.orderCode || '-';
}

function commissionOrderSubtitle(row: Row) {
  const codes = [row.orderCode, row.tourCode].filter(Boolean);
  return codes.length ? `Mã: ${codes.join(' - ')}` : '';
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function date(value?: string) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-';
}
