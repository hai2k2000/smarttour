'use client';

import { Download, Eye, FileUp, Plus, RefreshCcw, Save, Search, Tags, Trash2, UserRoundCheck } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { authHeaders, authJsonHeaders } from '../authFetch';
import { PermissionNotice, usePermissions } from '../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Option = { id: string; name: string; code?: string; color?: string; isActive?: boolean };
type CustomerFile = { id: string; fileName: string; fileUrl: string; fileType?: string | null };
type MessageState = { type: 'success' | 'warning' | 'error' | 'info'; text: string } | null;
type CustomerFormErrors = Partial<Record<'fullName' | 'phone' | 'email' | 'opportunityValue' | 'opportunityProbability', string>>;
type Customer = {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  email?: string | null;
  kind: string;
  status?: string;
  source?: string | null;
  market?: string | null;
  owner?: string | null;
  branch?: string | null;
  department?: string | null;
  latestComment?: string | null;
  type?: Option | null;
  campaign?: Option | null;
  tags: { tag: Option }[];
  contacts: { id: string; fullName: string; position?: string | null; phone?: string | null; email?: string | null }[];
  careTasks: { id: string; channel: string; status: string; result?: string | null; scheduledAt?: string | null }[];
  opportunities: { id: string; title: string; stage: string; value: string; probability: string; expectedRevenue: string }[];
  files: CustomerFile[];
  related?: {
    orders: unknown[];
    quotes: unknown[];
    debts: { receivableDebt: number };
    timeline: { createdAt: string; title: string; eventType: string }[];
  };
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

const emptyDashboard: Dashboard = {
  totalCustomers: 0,
  newToday: 0,
  newThisMonth: 0,
  oneTimeCustomers: 0,
  repeatCustomers: 0,
  totalRevenue: 0,
  totalDebt: 0,
};

function createBlank() {
  return {
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
}

const messageClass = {
  success: 'statusPillSuccess',
  warning: 'statusPillWarning',
  error: 'statusPillError',
  info: 'statusPillNeutral',
} as const;

export default function CustomersClient() {
  const { can, canAny, permissionsReady } = usePermissions();
  const canView = canAny(['customer.view', 'customer.manage']);
  const canManage = can('customer.manage');
  const canViewDebt = can('finance.debt.view');
  const [rows, setRows] = useState<Customer[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [types, setTypes] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [campaigns, setCampaigns] = useState<Option[]>([]);
  const [form, setForm] = useState(createBlank);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({
    owner: '',
    market: '',
    branch: '',
    department: '',
    source: '',
    typeId: '',
    campaignId: '',
    tagId: '',
    status: '',
    createdFrom: '',
    createdTo: '',
  });
  const [message, setMessage] = useState<MessageState>(null);
  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [detailFileInputKey, setDetailFileInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<CustomerFormErrors>({});
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    Object.entries(filter).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filter, search]);

  useEffect(() => {
    if (!permissionsReady) return;
    if (!canView) {
      setRows([]);
      setDashboard(emptyDashboard);
      setTypes([]);
      setTags([]);
      setCampaigns([]);
      setLoading(false);
      return;
    }
    void load();
  }, [query, permissionsReady, canView]);

  async function load() {
    if (!permissionsReady) return;
    if (!canView) {
      setRows([]);
      setDashboard(emptyDashboard);
      setTypes([]);
      setTags([]);
      setCampaigns([]);
      setLoading(false);
      return;
    }
    const requestId = listRequestRef.current + 1;
    listRequestRef.current = requestId;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/customers${query ? `?${query}` : ''}`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không tải được danh sách khách hàng'));
      const data = await response.json();
      if (listRequestRef.current !== requestId) return;
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setDashboard(data.dashboard || emptyDashboard);
      setTypes(Array.isArray(data.types) ? data.types : []);
      setTags(Array.isArray(data.tags) ? data.tags : []);
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch (error) {
      if (listRequestRef.current !== requestId) return;
      setRows([]);
      setDashboard(emptyDashboard);
      setMessage({ type: 'error', text: errorText(error, 'Không tải được dữ liệu khách hàng. Kiểm tra kết nối mạng hoặc đăng nhập lại.') });
    } finally {
      if (listRequestRef.current === requestId) setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      setMessage({ type: 'error', text: 'Bạn chưa có quyền customer.manage để tạo khách hàng.' });
      return;
    }
    const validationErrors = validateCustomerForm(form);
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      setMessage({ type: 'error', text: 'Vui lòng kiểm tra các trường chưa hợp lệ trước khi lưu khách hàng.' });
      return;
    }
    setSaving(true);
    setFormErrors({});
    setMessage(null);
    const payload = {
      ...form,
      contacts: form.contacts.filter((row) => row.fullName.trim()),
      careTasks: form.careTasks.filter((row) => row.channel && row.scheduledAt),
      opportunities: form.opportunities.filter((row) => row.title.trim()),
    };

    let saved: Customer;
    try {
      const response = await fetch(`${API_URL}/api/customers`, {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không lưu được khách hàng'));
      saved = await response.json();
    } catch (error) {
      setMessage({ type: 'error', text: `Không lưu được khách hàng: ${errorText(error, 'lỗi không xác định')}` });
      setSaving(false);
      return;
    }

    try {
      await uploadFiles(saved.id, createFiles);
      setForm(createBlank());
      setCreateFiles([]);
      setModal(null);
      setMessage({ type: 'success', text: 'Đã lưu khách hàng' });
      await load();
    } catch (error) {
      setModal(null);
      setMessage({
        type: 'warning',
        text: `Đã lưu hồ sơ khách hàng, nhưng upload tài liệu thất bại: ${errorText(error, 'lỗi không xác định')}. Hồ sơ được giữ lại; mở chi tiết để tải lại tài liệu.`,
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    if (!canView) {
      setMessage({ type: 'error', text: 'B\u1ea1n ch\u01b0a c\u00f3 quy\u1ec1n customer.view \u0111\u1ec3 xem chi ti\u1ebft kh\u00e1ch h\u00e0ng.' });
      return;
    }
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailLoading(true);
    setSelected(null);
    setModal('detail');
    try {
      const response = await fetch(`${API_URL}/api/customers/${id}`, { cache: 'no-store', headers: authHeaders() });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không tải được chi tiết khách hàng'));
      const data = await response.json();
      if (detailRequestRef.current !== requestId) return;
      setSelected(data);
      setDetailFileInputKey((value) => value + 1);
    } catch (error) {
      if (detailRequestRef.current !== requestId) return;
      setMessage({ type: 'error', text: errorText(error, 'Không tải được chi tiết khách hàng') });
      setModal(null);
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }

  async function uploadFiles(customerId: string, files: File[]) {
    if (!canManage) throw new Error('B\u1ea1n ch\u01b0a c\u00f3 quy\u1ec1n customer.manage \u0111\u1ec3 upload t\u00e0i li\u1ec7u kh\u00e1ch h\u00e0ng.');
    for (const file of files) {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_URL}/api/customers/${customerId}/files`, { method: 'POST', headers: authHeaders(), body });
      if (!response.ok) throw new Error(`${file.name}: ${await responseMessage(response, 'upload file thất bại')}`);
    }
  }

  async function uploadDetailFiles(files: FileList | null) {
    if (!selected || !files?.length) return;
    const customerId = selected.id;
    try {
      await uploadFiles(customerId, Array.from(files));
      if (selected?.id === customerId) await openDetail(customerId);
      setMessage({ type: 'success', text: 'Đã upload tài liệu khách hàng' });
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error, 'Upload file thất bại') });
      setDetailFileInputKey((value) => value + 1);
    }
  }

  async function removeFile(customerId: string, fileId: string) {
    if (!canManage) {
      setMessage({ type: 'error', text: 'B\u1ea1n ch\u01b0a c\u00f3 quy\u1ec1n customer.manage \u0111\u1ec3 x\u00f3a t\u00e0i li\u1ec7u kh\u00e1ch h\u00e0ng.' });
      return;
    }
    const response = await fetch(`${API_URL}/api/customers/${customerId}/files/${fileId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      setMessage({ type: 'error', text: await responseMessage(response, 'Không xóa được tài liệu khách hàng') });
      return;
    }
    if (selected?.id === customerId) await openDetail(customerId);
    setMessage({ type: 'success', text: 'Đã xóa tài liệu khách hàng' });
  }

  function openCreate() {
    if (!canManage) {
      setMessage({ type: 'error', text: 'B\u1ea1n ch\u01b0a c\u00f3 quy\u1ec1n customer.manage \u0111\u1ec3 t\u1ea1o kh\u00e1ch h\u00e0ng.' });
      return;
    }
    setForm(createBlank());
    setFormErrors({});
    setCreateFiles([]);
    setModal('create');
  }

  function closeModal() {
    detailRequestRef.current += 1;
    setCreateFiles([]);
    setFormErrors({});
    setSelected(null);
    setDetailLoading(false);
    setModal(null);
  }

  function change(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key in formErrors) setFormErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updatePrimaryContact(key: string, value: string) {
    setForm((current) => {
      const contact = current.contacts[0] || createBlank().contacts[0];
      return { ...current, contacts: [{ ...contact, [key]: value }] };
    });
  }

  function updateCareTask(key: string, value: string) {
    setForm((current) => {
      const task = current.careTasks[0] || createBlank().careTasks[0];
      return { ...current, careTasks: [{ ...task, [key]: value }] };
    });
  }

  function updateOpportunity(key: string, value: string | number) {
    setForm((current) => {
      const opportunity = current.opportunities[0] || createBlank().opportunities[0];
      return { ...current, opportunities: [{ ...opportunity, [key]: value }] };
    });
    if (key === 'value') setFormErrors((current) => ({ ...current, opportunityValue: undefined }));
    if (key === 'probability') setFormErrors((current) => ({ ...current, opportunityProbability: undefined }));
  }

  function toggleTag(id: string) {
    setForm((current) => ({ ...current, tagIds: current.tagIds.includes(id) ? current.tagIds.filter((tagId) => tagId !== id) : [...current.tagIds, id] }));
  }

  async function exportCsv() {
    if (!canView) {
      setMessage({ type: 'error', text: 'Bạn chưa có quyền xem CRM khách hàng để export CSV.' });
      return;
    }
    setExporting(true);
    try {
      const response = await fetch(`${API_URL}/api/customers/export${query ? `?${query}` : ''}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await responseMessage(response, 'Không export được CSV'));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'smarttour-customers.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Đã export CSV khách hàng' });
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error, 'Không export được CSV') });
    } finally {
      setExporting(false);
    }
  }

  function clearCustomerFilters() {
    setSearch('');
    setFilter({
      owner: '',
      market: '',
      branch: '',
      department: '',
      source: '',
      typeId: '',
      campaignId: '',
      tagId: '',
      status: '',
      createdFrom: '',
      createdTo: '',
    });
    setMessage({ type: 'info', text: 'Đã xóa bộ lọc khách hàng.' });
  }

  const primaryContact = form.contacts[0];
  const firstCareTask = form.careTasks[0];
  const firstOpportunity = form.opportunities[0];
  const disabledManageTitle = canManage ? undefined : 'Bạn chưa có quyền customer.manage';

  return (
    <section className="workspace customerPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Khách hàng</p>
          <h1>Dữ liệu khách hàng</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className={`statusPill ${messageClass[message.type]}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</span> : null}
          {!canManage ? <span className="permissionHint">Action quản lý đang bị vô hiệu vì thiếu quyền customer.manage.</span> : null}
          <button className="iconTextButton" disabled={!canManage || saving} title={disabledManageTitle} onClick={openCreate}><Plus size={16} /> Tạo khách hàng</button>
          <button className="secondaryButton iconTextButton" disabled={!canView || loading} onClick={load}><RefreshCcw size={16} /> {loading ? 'Đang tải...' : 'Tải lại'}</button>
        </div>
      </header>

      <PermissionNotice allowed={!permissionsReady || canView} label="xem v\u00e0 qu\u1ea3n l\u00fd kh\u00e1ch h\u00e0ng" />
      {canView ? (
        <>
      <section className="metrics customerMetrics">
        <Metric label="Tổng khách" value={dashboard.totalCustomers} />
        <Metric label="Mới hôm nay" value={dashboard.newToday} />
        <Metric label="Mới tháng này" value={dashboard.newThisMonth} />
        <Metric label="Mua 1 lần" value={dashboard.oneTimeCustomers} />
        <Metric label="Mua lại" value={dashboard.repeatCustomers} />
        <Metric label="Doanh thu" value={money(dashboard.totalRevenue)} />
        {canViewDebt ? <Metric label="Công nợ" value={money(dashboard.totalDebt)} /> : null}
      </section>

      <section className="panel customerFilters">
        <label className="customerSearchFilter"><Search size={15} /> Tìm kiếm<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, SĐT, email, mã khách" /></label>
        <label>NV phụ trách<input value={filter.owner} onChange={(event) => setFilter({ ...filter, owner: event.target.value })} /></label>
        <label>Thị trường<input value={filter.market} onChange={(event) => setFilter({ ...filter, market: event.target.value })} /></label>
        <label>Chi nhánh<input value={filter.branch} onChange={(event) => setFilter({ ...filter, branch: event.target.value })} /></label>
        <label>Phòng ban<input value={filter.department} onChange={(event) => setFilter({ ...filter, department: event.target.value })} /></label>
        <label>Nguồn<input value={filter.source} onChange={(event) => setFilter({ ...filter, source: event.target.value })} /></label>
        <label>Loại khách<select value={filter.typeId} onChange={(event) => setFilter({ ...filter, typeId: event.target.value })}><option value="">Tất cả</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <label>Chiến dịch<select value={filter.campaignId} onChange={(event) => setFilter({ ...filter, campaignId: event.target.value })}><option value="">Tất cả</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <label>Tag<select value={filter.tagId} onChange={(event) => setFilter({ ...filter, tagId: event.target.value })}><option value="">Tất cả</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        <label>Trạng thái<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Chưa gộp</option><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option><option value="MERGED">Đã gộp</option><option value="ALL">Tất cả</option></select></label>
        <label>Tạo từ<input type="date" value={filter.createdFrom} onChange={(event) => setFilter({ ...filter, createdFrom: event.target.value })} /></label>
        <label>Tạo đến<input type="date" value={filter.createdTo} onChange={(event) => setFilter({ ...filter, createdTo: event.target.value })} /></label>
        <button type="button" className="secondaryButton iconTextButton" disabled={loading} onClick={clearCustomerFilters}>Xóa lọc</button>
        <button className="secondaryButton iconTextButton" disabled={exporting || !canView} onClick={exportCsv}><Download size={16} /> {exporting ? 'Đang export...' : 'CSV'}</button>
      </section>

      {modal === 'create' ? (
        <div className="modalOverlay" role="presentation">
          <form className="modalPanel modalPanelWide customerForm" role="dialog" aria-modal="true" aria-labelledby="customer-create-title" onSubmit={submit} noValidate>
            <header>
              <h2 id="customer-create-title"><UserRoundCheck size={18} /> Hồ sơ khách hàng</h2>
              <button type="button" className="secondaryButton iconTextButton" onClick={closeModal}>Đóng</button>
            </header>

            <section className="customerFormSection">
              <h3>Thông tin cơ bản</h3>
              <div className="customerFormGrid">
                <label>Loại hồ sơ<select value={form.kind} onChange={(event) => change('kind', event.target.value)}><option value="INDIVIDUAL">Cá nhân / CTV</option><option value="BUSINESS">Doanh nghiệp / đối tác</option></select></label>
                <label>Loại khách<select value={form.typeId} onChange={(event) => change('typeId', event.target.value)}><option value="">Chưa chọn</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
                <label>Họ tên / Tên giao dịch<input required aria-invalid={Boolean(formErrors.fullName)} value={form.fullName} onChange={(event) => change('fullName', event.target.value)} />{formErrors.fullName ? <span className="formErrors" role="alert">{formErrors.fullName}</span> : null}</label>
                <label>SĐT<input required type="tel" inputMode="tel" aria-invalid={Boolean(formErrors.phone)} value={form.phone} onChange={(event) => change('phone', event.target.value)} />{formErrors.phone ? <span className="formErrors" role="alert">{formErrors.phone}</span> : null}</label>
                <label>Email<input type="email" aria-invalid={Boolean(formErrors.email)} value={form.email} onChange={(event) => change('email', event.target.value)} />{formErrors.email ? <span className="formErrors" role="alert">{formErrors.email}</span> : null}</label>
                <label>Giới tính<input value={form.gender} onChange={(event) => change('gender', event.target.value)} /></label>
                <label>Tỉnh thành<input value={form.province} onChange={(event) => change('province', event.target.value)} /></label>
                <label>Nhóm khách<input value={form.groupName} onChange={(event) => change('groupName', event.target.value)} /></label>
              </div>
            </section>

            <section className="customerFormSection">
              <h3>Doanh nghiệp</h3>
              <div className="customerFormGrid">
                <label>Công ty<input value={form.companyName} onChange={(event) => change('companyName', event.target.value)} /></label>
                <label>Mã số thuế<input value={form.taxCode} onChange={(event) => change('taxCode', event.target.value)} /></label>
                <label>Website<input value={form.website} onChange={(event) => change('website', event.target.value)} /></label>
                <label className="span2">Địa chỉ<textarea value={form.address} onChange={(event) => change('address', event.target.value)} /></label>
              </div>
            </section>

            <section className="customerFormSection">
              <h3>Liên hệ</h3>
              <div className="customerMiniGrid">
                <label>Người liên hệ<input value={primaryContact.fullName} onChange={(event) => updatePrimaryContact('fullName', event.target.value)} /></label>
                <label>Chức vụ<input value={primaryContact.position} onChange={(event) => updatePrimaryContact('position', event.target.value)} /></label>
                <label>SĐT liên hệ<input type="tel" inputMode="tel" value={primaryContact.phone} onChange={(event) => updatePrimaryContact('phone', event.target.value)} /></label>
                <label>Email liên hệ<input type="email" value={primaryContact.email} onChange={(event) => updatePrimaryContact('email', event.target.value)} /></label>
                <label>Lịch CSKH<input type="datetime-local" value={firstCareTask.scheduledAt} onChange={(event) => updateCareTask('scheduledAt', event.target.value)} /></label>
                <label>Kênh CSKH<input value={firstCareTask.channel} onChange={(event) => updateCareTask('channel', event.target.value)} /></label>
                <label>Owner CSKH<input value={firstCareTask.owner} onChange={(event) => updateCareTask('owner', event.target.value)} /></label>
                <label>Cơ hội<input value={firstOpportunity.title} onChange={(event) => updateOpportunity('title', event.target.value)} /></label>
                <label>Giá trị cơ hội<input type="number" min="0" aria-invalid={Boolean(formErrors.opportunityValue)} value={firstOpportunity.value} onChange={(event) => updateOpportunity('value', Number(event.target.value))} />{formErrors.opportunityValue ? <span className="formErrors" role="alert">{formErrors.opportunityValue}</span> : null}</label>
                <label>Xác suất (%)<input type="number" min="0" max="100" aria-invalid={Boolean(formErrors.opportunityProbability)} value={firstOpportunity.probability} onChange={(event) => updateOpportunity('probability', Number(event.target.value))} />{formErrors.opportunityProbability ? <span className="formErrors" role="alert">{formErrors.opportunityProbability}</span> : null}</label>
              </div>
            </section>

            <section className="customerFormSection">
              <h3>Tags / campaign / owner</h3>
              <div className="customerFormGrid">
                <label>Chiến dịch<select value={form.campaignId} onChange={(event) => change('campaignId', event.target.value)}><option value="">Không gắn</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
                <label>NV phụ trách<input value={form.owner} onChange={(event) => change('owner', event.target.value)} /></label>
                <label>Chi nhánh<input value={form.branch} onChange={(event) => change('branch', event.target.value)} /></label>
                <label>Phòng ban<input value={form.department} onChange={(event) => change('department', event.target.value)} /></label>
                <label>Nguồn<input value={form.source} onChange={(event) => change('source', event.target.value)} /></label>
                <label>Thị trường<input value={form.market} onChange={(event) => change('market', event.target.value)} /></label>
              </div>
              <div className="tagPicker">
                <strong><Tags size={16} /> Tag</strong>
                {tags.length ? tags.map((tag) => <button type="button" key={tag.id} className={form.tagIds.includes(tag.id) ? 'active' : ''} onClick={() => toggleTag(tag.id)}>{tag.name}</button>) : <span className="mutedText">Chưa có tag đang hoạt động.</span>}
              </div>
            </section>

            <section className="customerFormSection">
              <h3>Ghi chú</h3>
              <label>Bình luận mới nhất<textarea value={form.latestComment} onChange={(event) => change('latestComment', event.target.value)} /></label>
              <label className="fileDrop"><FileUp size={16} /> {createFiles.length ? `Đã chọn ${createFiles.length} file` : 'Chọn tài liệu khách hàng'}<input type="file" multiple onChange={(event) => setCreateFiles(Array.from(event.target.files || []))} /></label>
            </section>

            <div className="modalActions">
              {!canManage ? <span className="permissionHint">Bạn chưa có quyền customer.manage nên không thể lưu hồ sơ.</span> : null}
              <button type="button" className="secondaryButton" onClick={closeModal}>Hủy</button>
              <button className="iconTextButton" disabled={!canManage || saving} title={disabledManageTitle}><Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu khách hàng'}</button>
            </div>
          </form>
        </div>
      ) : null}

      <section className="panel customerList">
        <div className="sectionHeader"><h2>Danh sách</h2><div className="sectionActions"><span>{rows.length} khách</span><button className="iconTextButton" disabled={!canManage} title={disabledManageTitle} onClick={openCreate}><Plus size={16} /> Tạo mới</button></div></div>
        <div className="fitTableWrap compactListTableWrap">
          <table className="customerTable compactListTable">
            <thead><tr><th>Khách hàng</th><th>Phân loại</th><th>Phụ trách</th><th>Tag</th><th>Thao tác</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="customerNameCell"><strong>{row.fullName}</strong><span>{row.phone}{row.email ? ` - ${row.email}` : ''}</span></td>
                  <td>{row.type?.name || row.kind}<span>{row.source || row.market || row.status || ''}</span></td>
                  <td>{row.owner || '-'}<span>{row.branch || row.department || ''}</span></td>
                  <td><div className="miniTags">{row.tags.map((tag) => <span key={tag.tag.id}>{tag.tag.name}</span>)}</div></td>
                  <td><button className="secondaryButton iconButton" onClick={() => void openDetail(row.id)} aria-label={`Xem ${row.fullName}`}><Eye size={16} /></button></td>
                </tr>
              ))}
              {!rows.length ? <tr><td className="customerEmptyCell" colSpan={5}>{loading ? 'Đang tải dữ liệu khách hàng...' : 'Chưa có khách hàng phù hợp với bộ lọc.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {modal === 'detail' ? (
        <div className="modalOverlay" role="presentation">
          <aside className="modalPanel customerDetail" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title">
            <header><h2 id="customer-detail-title">{selected?.fullName || 'Chi tiết khách hàng'}</h2><button type="button" className="secondaryButton iconTextButton" onClick={closeModal}>Đóng</button></header>
            {detailLoading && !selected ? <p className="mutedText">Đang tải chi tiết khách hàng...</p> : null}
            {selected ? (
              <>
                <div className="summaryRows">
                  <div><span>SĐT</span><strong>{selected.phone}</strong></div>
                  <div><span>Báo giá</span><strong>{selected.related?.quotes.length || 0}</strong></div>
                  <div><span>Đơn hàng</span><strong>{selected.related?.orders.length || 0}</strong></div>
                  {canViewDebt ? <div><span>Công nợ</span><strong>{money(selected.related?.debts.receivableDebt || 0)}</strong></div> : null}
                </div>
                <h2>Tài liệu</h2>
                <label className="fileDrop"><FileUp size={16} /> Upload tài liệu<input key={detailFileInputKey} type="file" multiple disabled={!canManage} onChange={(event) => void uploadDetailFiles(event.target.files)} /></label>
                {!canManage ? <span className="permissionHint">Thiếu quyền customer.manage nên không thể upload hoặc xóa tài liệu.</span> : null}
                {selected.files?.length ? (
                  <div className="supplierFiles">
                    {selected.files.map((file) => (
                      <span key={file.id}>
                        <a href={`${API_URL}${file.fileUrl}`} target="_blank" rel="noreferrer">{file.fileName}</a>
                        <button type="button" className="iconButton dangerButton" disabled={!canManage} title={disabledManageTitle} onClick={() => void removeFile(selected.id, file.id)} aria-label={`Xóa ${file.fileName}`}><Trash2 size={14} /></button>
                      </span>
                    ))}
                  </div>
                ) : <p className="mutedText">Chưa có tài liệu.</p>}
                <h2>Dòng thời gian</h2>
                <div className="timelineList">{(selected.related?.timeline || []).map((item) => <p key={`${item.createdAt}-${item.title}`}><b>{item.eventType}</b> {item.title}</p>)}</div>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0));
}

function validateCustomerForm(form: ReturnType<typeof createBlank>): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (!form.fullName.trim()) errors.fullName = 'Nhập họ tên hoặc tên giao dịch.';
  const phoneDigits = form.phone.replace(/\D/g, '');
  if (!form.phone.trim()) errors.phone = 'Nhập số điện thoại.';
  else if (phoneDigits.length < 8 || phoneDigits.length > 15) errors.phone = 'Số điện thoại phải có từ 8 đến 15 chữ số.';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Email không đúng định dạng.';
  if (!Number.isFinite(form.opportunities[0]?.value) || Number(form.opportunities[0]?.value) < 0) errors.opportunityValue = 'Giá trị cơ hội không được âm.';
  const probability = Number(form.opportunities[0]?.probability);
  if (!Number.isFinite(probability) || probability < 0 || probability > 100) errors.opportunityProbability = 'Xác suất phải từ 0 đến 100%.';
  return errors;
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

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
