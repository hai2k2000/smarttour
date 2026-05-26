'use client';

import { Download, Eye, Plus, RefreshCcw, Save, Search, Tags, UserRoundCheck } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Option = { id: string; name: string; code?: string; color?: string; isActive?: boolean };
type Customer = {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  email?: string;
  kind: string;
  source?: string;
  market?: string;
  owner?: string;
  branch?: string;
  department?: string;
  latestComment?: string;
  type?: Option;
  campaign?: Option;
  tags: { tag: Option }[];
  contacts: { id: string; fullName: string; position?: string; phone?: string; email?: string }[];
  careTasks: { id: string; channel: string; status: string; result?: string; scheduledAt?: string }[];
  opportunities: { id: string; title: string; stage: string; value: string; probability: string; expectedRevenue: string }[];
  related?: { orders: unknown[]; quotes: unknown[]; debts: { receivableDebt: number }; timeline: { createdAt: string; title: string; eventType: string }[] };
};

type Dashboard = {
  totalCustomers: number;
  newToday: number;
  newThisMonth: number;
  oneTimeCustomers: number;
  repeatCustomers: number;
  totalRevenue: number;
  totalDebt: number;
};

const emptyDashboard: Dashboard = { totalCustomers: 0, newToday: 0, newThisMonth: 0, oneTimeCustomers: 0, repeatCustomers: 0, totalRevenue: 0, totalDebt: 0 };
const blank = {
  kind: 'INDIVIDUAL',
  fullName: '',
  phone: '',
  email: '',
  typeId: '',
  source: '',
  market: '',
  groupName: '',
  campaignId: '',
  owner: '',
  branch: '',
  department: '',
  province: '',
  gender: '',
  companyName: '',
  taxCode: '',
  website: '',
  address: '',
  latestComment: '',
  tagIds: [] as string[],
  contacts: [{ fullName: '', position: '', phone: '', email: '', note: '', isPrimary: true }],
  careTasks: [{ channel: 'PHONE', status: 'PENDING', result: '', scheduledAt: '', owner: '', note: '' }],
  opportunities: [{ title: '', stage: 'NEW', value: 0, probability: 20, owner: '', note: '' }],
};

export default function CustomersClient() {
  const { can, canAny } = usePermissions();
  const [rows, setRows] = useState<Customer[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [types, setTypes] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [campaigns, setCampaigns] = useState<Option[]>([]);
  const [form, setForm] = useState(blank);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ owner: '', market: '', branch: '', tagId: '' });
  const [message, setMessage] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    Object.entries(filter).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  }, [filter, search]);

  useEffect(() => {
    void load();
  }, [query]);

  async function load() {
    const response = await fetch(`${API_URL}/api/customers?${query}`, { cache: 'no-store', headers: authHeaders() });
    const data = await response.json();
    setRows(data.rows || []);
    setDashboard(data.dashboard || emptyDashboard);
    setTypes(data.types || []);
    setTags(data.tags || []);
    setCampaigns(data.campaigns || []);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    const payload = {
      ...form,
      contacts: form.contacts.filter((row) => row.fullName),
      careTasks: form.careTasks.filter((row) => row.channel && row.scheduledAt),
      opportunities: form.opportunities.filter((row) => row.title),
    };
    const response = await fetch(`${API_URL}/api/customers`, {
      method: 'POST',
      headers: authJsonHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.message || 'Khong luu duoc khach hang');
      return;
    }
    setForm(blank);
    setMessage('Da luu khach hang');
    await load();
  }

  async function openDetail(id: string) {
    const response = await fetch(`${API_URL}/api/customers/${id}`, { cache: 'no-store', headers: authHeaders() });
    setSelected(await response.json());
  }

  function change(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleTag(id: string) {
    setForm((current) => ({ ...current, tagIds: current.tagIds.includes(id) ? current.tagIds.filter((tagId) => tagId !== id) : [...current.tagIds, id] }));
  }

  async function exportCsv() {
    window.location.href = `${API_URL}/api/customers/export?${query}`;
  }

  return (
    <section className="workspace customerPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">CRM Core</p>
          <h1>Data khach hang</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral">{message}</span> : null}
          <button className="secondaryButton iconTextButton" onClick={load}><RefreshCcw size={16} /> Tai lai</button>
        </div>
      </header>

      <section className="metrics customerMetrics">
        <Metric label="Tong khach" value={dashboard.totalCustomers} />
        <Metric label="Moi hom nay" value={dashboard.newToday} />
        <Metric label="Moi thang nay" value={dashboard.newThisMonth} />
        <Metric label="Mua 1 lan" value={dashboard.oneTimeCustomers} />
        <Metric label="Mua lai" value={dashboard.repeatCustomers} />
        <Metric label="Doanh thu" value={money(dashboard.totalRevenue)} />
        <Metric label="Cong no" value={money(dashboard.totalDebt)} />
      </section>
      <PermissionNotice allowed={canAny(['customer.view', 'customer.manage'])} label="xem va quan ly CRM khach hang" />

      <section className="panel customerFilters">
        <label><Search size={15} /> Tim kiem<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ten, SDT, email, ma khach" /></label>
        <label>NV phu trach<input value={filter.owner} onChange={(event) => setFilter({ ...filter, owner: event.target.value })} /></label>
        <label>Thi truong<input value={filter.market} onChange={(event) => setFilter({ ...filter, market: event.target.value })} /></label>
        <label>Chi nhanh<input value={filter.branch} onChange={(event) => setFilter({ ...filter, branch: event.target.value })} /></label>
        <label>Tag<select value={filter.tagId} onChange={(event) => setFilter({ ...filter, tagId: event.target.value })}><option value="">Tat ca</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        <button className="secondaryButton iconTextButton" onClick={exportCsv}><Download size={16} /> CSV</button>
      </section>

      <section className="contentGrid customerGrid">
        <form className="panel customerForm" onSubmit={submit}>
          <div className="sectionHeader"><h2><UserRoundCheck size={18} /> Ho so khach hang</h2><span>{message}</span></div>
          <div className="customerFormGrid">
            <label>Loai ho so<select value={form.kind} onChange={(event) => change('kind', event.target.value)}><option value="INDIVIDUAL">Ca nhan / CTV</option><option value="BUSINESS">Doanh nghiep / doi tac</option></select></label>
            <label>Loai khach<select value={form.typeId} onChange={(event) => change('typeId', event.target.value)}><option value="">Chua chon</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
            <label>Ho ten / Ten giao dich<input required value={form.fullName} onChange={(event) => change('fullName', event.target.value)} /></label>
            <label>SDT<input required value={form.phone} onChange={(event) => change('phone', event.target.value)} /></label>
            <label>Email<input value={form.email} onChange={(event) => change('email', event.target.value)} /></label>
            <label>Gioi tinh<input value={form.gender} onChange={(event) => change('gender', event.target.value)} /></label>
            <label>Nguon<input value={form.source} onChange={(event) => change('source', event.target.value)} /></label>
            <label>Thi truong<input value={form.market} onChange={(event) => change('market', event.target.value)} /></label>
            <label>Nhom<input value={form.groupName} onChange={(event) => change('groupName', event.target.value)} /></label>
            <label>Chien dich<select value={form.campaignId} onChange={(event) => change('campaignId', event.target.value)}><option value="">Khong gan</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
            <label>NV phu trach<input value={form.owner} onChange={(event) => change('owner', event.target.value)} /></label>
            <label>Chi nhanh<input value={form.branch} onChange={(event) => change('branch', event.target.value)} /></label>
            <label>Phong ban<input value={form.department} onChange={(event) => change('department', event.target.value)} /></label>
            <label>Tinh thanh<input value={form.province} onChange={(event) => change('province', event.target.value)} /></label>
            <label>Cong ty<input value={form.companyName} onChange={(event) => change('companyName', event.target.value)} /></label>
            <label>Ma so thue<input value={form.taxCode} onChange={(event) => change('taxCode', event.target.value)} /></label>
            <label className="span2">Dia chi<textarea value={form.address} onChange={(event) => change('address', event.target.value)} /></label>
            <label className="span2">Binh luan moi nhat<textarea value={form.latestComment} onChange={(event) => change('latestComment', event.target.value)} /></label>
          </div>
          <div className="tagPicker">
            <strong><Tags size={16} /> Tag</strong>
            {tags.map((tag) => <button type="button" key={tag.id} className={form.tagIds.includes(tag.id) ? 'active' : ''} onClick={() => toggleTag(tag.id)}>{tag.name}</button>)}
          </div>
          <div className="customerMiniGrid">
            <label>Nguoi lien he<input value={form.contacts[0].fullName} onChange={(event) => setForm({ ...form, contacts: [{ ...form.contacts[0], fullName: event.target.value }] })} /></label>
            <label>Chuc vu<input value={form.contacts[0].position} onChange={(event) => setForm({ ...form, contacts: [{ ...form.contacts[0], position: event.target.value }] })} /></label>
            <label>Lich CSKH<input type="datetime-local" value={form.careTasks[0].scheduledAt} onChange={(event) => setForm({ ...form, careTasks: [{ ...form.careTasks[0], scheduledAt: event.target.value }] })} /></label>
            <label>Co hoi<input value={form.opportunities[0].title} onChange={(event) => setForm({ ...form, opportunities: [{ ...form.opportunities[0], title: event.target.value }] })} /></label>
          </div>
          <button className="iconTextButton" disabled={!can('customer.manage')}><Save size={16} /> Luu khach hang</button>
        </form>

        <section className="panel customerList">
          <div className="sectionHeader"><h2>Danh sach</h2><span>{rows.length} khach</span></div>
          <div className="fitTableWrap">
            <table className="customerTable">
              <thead><tr><th>Ma</th><th>Khach hang</th><th>Phan loai</th><th>Owner</th><th>Tag</th><th></th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td><strong>{row.fullName}</strong><span>{row.phone} {row.email ? `- ${row.email}` : ''}</span></td>
                    <td>{row.type?.name || row.kind}<span>{row.source || row.market || ''}</span></td>
                    <td>{row.owner || '-'}<span>{row.branch || row.department || ''}</span></td>
                    <td><div className="miniTags">{row.tags.map((tag) => <span key={tag.tag.id}>{tag.tag.name}</span>)}</div></td>
                    <td><button className="secondaryButton iconButton" onClick={() => openDetail(row.id)}><Eye size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <aside className="customerDetail">
              <div className="sectionHeader"><h2>{selected.fullName}</h2><span>{selected.code}</span></div>
              <div className="summaryRows">
                <div><span>SDT</span><strong>{selected.phone}</strong></div>
                <div><span>Bao gia</span><strong>{selected.related?.quotes.length || 0}</strong></div>
                <div><span>Don hang</span><strong>{selected.related?.orders.length || 0}</strong></div>
                <div><span>Cong no</span><strong>{money(selected.related?.debts.receivableDebt || 0)}</strong></div>
              </div>
              <h2>Timeline</h2>
              <div className="timelineList">{(selected.related?.timeline || []).map((item) => <p key={`${item.createdAt}-${item.title}`}><b>{item.eventType}</b> {item.title}</p>)}</div>
            </aside>
          )}
        </section>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value);
}
