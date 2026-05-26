'use client';

import { CheckCircle2, Download, Eye, RefreshCcw, Search, WalletCards, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

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
      setMessage(data.message || 'Khong thuc hien duoc');
      return;
    }
    setMessage('Da cap nhat hoa hong');
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
          <p className="eyebrow">Finance</p>
          <h1>Bao cao hoa hong theo cot moc</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral">{message}</span> : null}
          <button className="secondaryButton iconTextButton" disabled={!can('commission.manage')} onClick={sync}><RefreshCcw size={16} /> Sync Order</button>
          <button className="secondaryButton iconTextButton" onClick={() => { window.location.href = `${API_URL}/api/commission-reports/export?${query}`; }}><Download size={16} /> CSV</button>
        </div>
      </header>

      <section className="metrics commissionMetrics">
        <Metric label="Tong hoa hong" value={money(summary.totalCommission)} />
        <Metric label="Da duyet" value={money(summary.approvedCommission)} />
        <Metric label="Cho duyet" value={money(summary.pendingCommission)} />
        <Metric label="Da chi" value={money(summary.paidCommission)} />
        <Metric label="Chua chi" value={money(summary.unpaidCommission)} />
        <Metric label="Booking" value={summary.bookingCount} />
      </section>
      <PermissionNotice allowed={canAny(['commission.view', 'commission.manage'])} label="xem bao cao hoa hong" />

      <section className="panel commissionFilters">
        <label><Search size={15} /> Tim kiem<input value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} placeholder="Ma don, tour, khach, sales" /></label>
        <label>Trang thai<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Tat ca</option><option value="PENDING">Cho duyet</option><option value="APPROVED">Da duyet</option><option value="REJECTED">Tu choi</option><option value="REVOKED">Thu hoi</option></select></label>
        <label>Thanh toan<select value={filter.paymentStatus} onChange={(event) => setFilter({ ...filter, paymentStatus: event.target.value })}><option value="">Tat ca</option><option value="UNPAID">Chua chi</option><option value="PARTIAL">Chi mot phan</option><option value="PAID">Da chi</option></select></label>
        <label>San pham<select value={filter.productType} onChange={(event) => setFilter({ ...filter, productType: event.target.value })}><option value="">Tat ca</option><option value="FIT_TOUR">FIT</option><option value="GIT_COMBO">GIT/Combo</option><option value="LANDTOUR">LandTour</option><option value="HOTEL_BOOKING">Booking phong</option><option value="FLIGHT_ORDER">Ve may bay</option><option value="SINGLE_SERVICE">Dich vu le</option></select></label>
        <label>Sales<input value={filter.employee} onChange={(event) => setFilter({ ...filter, employee: event.target.value })} /></label>
        <label>Phong ban<input value={filter.department} onChange={(event) => setFilter({ ...filter, department: event.target.value })} /></label>
        <label>Chi nhanh<input value={filter.branch} onChange={(event) => setFilter({ ...filter, branch: event.target.value })} /></label>
        <label>Group<select value={filter.groupBy} onChange={(event) => setFilter({ ...filter, groupBy: event.target.value })}><option value="salesOwner">Nhan vien</option><option value="team">Nhom</option><option value="department">Phong ban</option><option value="branch">Chi nhanh</option><option value="market">Thi truong</option></select></label>
      </section>

      <section className="contentGrid commissionGrid">
        <section className="panel">
          <div className="sectionHeader"><h2>Danh sach hoa hong</h2><span>{rows.length} dong</span></div>
          <div className="fitTableWrap">
            <table className="commissionTable">
              <thead><tr><th>Don hang</th><th>Khach</th><th>Sales</th><th>Cot moc</th><th>Doanh thu</th><th>Loi nhuan</th><th>%</th><th>Hoa hong</th><th>Trang thai</th><th></th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.orderCode}</strong><span>{row.tourCode || ''}</span></td>
                    <td>{row.customerName || '-'}</td>
                    <td>{row.salesOwner || '-'}<span>{row.department || row.branch || ''}</span></td>
                    <td>{date(row.milestoneDate)}</td>
                    <td>{money(Number(row.revenue))}</td>
                    <td>{money(Number(row.profit))}</td>
                    <td>{Number(row.ratePercent).toFixed(2)}</td>
                    <td><strong>{money(Number(row.commissionAmount))}</strong><span>Con {money(Number(row.remainingAmount))}</span></td>
                    <td><span className="statusPill">{row.status}</span><span>{row.paymentStatus}</span></td>
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
          <h2>Tong hop</h2>
          <div className="summaryRows">
            {grouping.slice(0, 8).map((row) => (
              <div key={row.key}><span>{row.key}</span><strong>{money(row.commission)}</strong></div>
            ))}
          </div>
          {selected && (
            <>
              <h2>Chi tiet</h2>
              <div className="summaryRows">
                <div><span>Cong thuc</span><strong>{selected.formula || '-'}</strong></div>
                <div><span>Hoa hong</span><strong>{money(Number(selected.commissionAmount))}</strong></div>
                <div><span>Da chi</span><strong>{money(Number(selected.paidAmount))}</strong></div>
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

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function date(value?: string) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-';
}
