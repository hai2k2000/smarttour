'use client';

import { CheckCircle2, ClipboardCheck, FileCheck2, HandCoins, Plus, RefreshCcw, Search, Send, WalletCards, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PermissionNotice, usePermissions } from '../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Dashboard = {
  upcomingDepartures: number;
  operatingTours: number;
  overdueTasks: number;
  waitingSupplierConfirmations: number;
  pendingSupplierPayments: number;
  lowMarginTours: number;
};
type Booking = { id: string; code: string; customerName?: string; orderId?: string; tourId?: string };
type Supplier = { id: string; name: string; supplierCode?: string; supplierServices?: SupplierService[] };
type SupplierService = { id: string; serviceName: string; sku?: string; netPrice?: string; sellingPrice?: string };
type OperationForm = {
  id: string;
  bookingId: string;
  orderId?: string;
  tourId?: string;
  status: string;
  notes?: string;
  booking?: Booking;
  order?: { systemCode: string; name: string };
  tour?: { tourCode: string; name?: string };
  services: { id: string; serviceType: string; serviceName: string; confirmationStatus: string; expectedCost: string; actualCost: string; supplier?: Supplier; supplierService?: SupplierService }[];
  tasks: { id: string; title: string; assignee?: string; dueDate?: string; status: string }[];
  costs: { id: string; costName: string; expectedAmount: string; actualAmount: string; currency: string; notes?: string }[];
};
type PaymentRequest = {
  id: string;
  code: string;
  status: string;
  requestedBy?: string;
  approvedBy?: string;
  requestedAt: string;
  financePaymentId?: string;
  financePayment?: { voucherCode: string; approvalStatus: string; paymentAmount: string };
  items: { id: string; supplierId: string; amount: string; notes?: string; supplier?: Supplier; cost?: { costName: string; operationForm?: OperationForm } }[];
};

const emptyDashboard: Dashboard = { upcomingDepartures: 0, operatingTours: 0, overdueTasks: 0, waitingSupplierConfirmations: 0, pendingSupplierPayments: 0, lowMarginTours: 0 };

export default function OperationsClient() {
  const { can, canAny } = usePermissions();
  const [tab, setTab] = useState<'forms' | 'payments'>('forms');
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [forms, setForms] = useState<OperationForm[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filter, setFilter] = useState({ search: '', status: '' });
  const [selectedFormId, setSelectedFormId] = useState('');
  const [message, setMessage] = useState('');

  const selectedForm = forms.find((form) => form.id === selectedFormId);
  const selectedSupplier = suppliers[0];
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filter.search) params.set('search', filter.search);
    if (filter.status) params.set('status', filter.status);
    return params.toString();
  }, [filter]);

  useEffect(() => {
    void loadStatic();
  }, []);

  useEffect(() => {
    void load();
  }, [query]);

  async function loadStatic() {
    const [bookingData, supplierData] = await Promise.all([
      getJson('/api/bookings'),
      getJson('/api/suppliers/hotels'),
    ]);
    setBookings(Array.isArray(bookingData) ? bookingData.slice(0, 80) : bookingData.rows?.slice(0, 80) || []);
    setSuppliers(Array.isArray(supplierData) ? supplierData.slice(0, 80) : supplierData.rows?.slice(0, 80) || []);
  }

  async function load() {
    const [dashboardData, formData, requestData] = await Promise.all([
      getJson('/api/operations/dashboard'),
      getJson(`/api/operations/forms?${query}`),
      getJson(`/api/operations/supplier-payment-requests?${query}`),
    ]);
    setDashboard({ ...emptyDashboard, ...dashboardData });
    setForms(Array.isArray(formData) ? formData : []);
    setRequests(Array.isArray(requestData) ? requestData : []);
  }

  async function createForm(formData: FormData) {
    const bookingId = text(formData.get('bookingId'));
    if (!bookingId) return setMessage('Can chon booking de tao phieu dieu hanh');
    await post('/api/operations/forms', {
      bookingId,
      status: text(formData.get('status')) || 'PENDING',
      notes: text(formData.get('notes')),
      services: [{
        supplierId: text(formData.get('supplierId')),
        supplierServiceId: text(formData.get('supplierServiceId')),
        serviceType: text(formData.get('serviceType')) || 'HOTEL',
        serviceName: text(formData.get('serviceName')) || 'Dich vu dieu hanh',
        confirmationStatus: text(formData.get('confirmationStatus')) || 'WAITING',
        expectedCost: number(formData.get('expectedCost')),
        actualCost: number(formData.get('actualCost')),
      }],
      tasks: [{ title: text(formData.get('taskTitle')) || 'Xac nhan NCC', assignee: text(formData.get('assignee')), dueDate: text(formData.get('dueDate')), status: 'PENDING' }],
      costs: [{ costName: text(formData.get('costName')) || 'Chi phi NCC', expectedAmount: number(formData.get('expectedCost')), actualAmount: number(formData.get('actualCost')), currency: 'VND' }],
    });
  }

  async function createPaymentRequest(formData: FormData) {
    const supplierId = text(formData.get('supplierId')) || selectedSupplier?.id || '';
    const costId = text(formData.get('costId')) || selectedForm?.costs?.[0]?.id || '';
    const amount = number(formData.get('amount')) || Number(selectedForm?.costs?.[0]?.actualAmount || selectedForm?.costs?.[0]?.expectedAmount || 0);
    if (!supplierId || amount <= 0) return setMessage('Can co NCC va so tien thanh toan');
    await post('/api/operations/supplier-payment-requests', {
      requestedBy: text(formData.get('requestedBy')) || 'operation',
      items: [{ supplierId, costId, amount, notes: text(formData.get('notes')) }],
    });
  }

  async function requestAction(id: string, action: 'submit' | 'approve' | 'reject' | 'create-finance-payment') {
    await post(`/api/operations/supplier-payment-requests/${id}/${action}`, { actor: action === 'approve' ? 'chief-accountant' : 'operation' });
  }

  async function approveFinancePayment(id?: string) {
    if (!id) return;
    await post(`/api/finance/payments/${id}/approve`, { actor: 'accounting' });
  }

  async function cancelForm(id: string) {
    await post(`/api/operations/forms/${id}/cancel`, { actor: 'operation', reason: 'Huy tu UI van hanh' });
  }

  async function post(path: string, payload: unknown) {
    setMessage('');
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Khong thuc hien duoc');
      return;
    }
    setMessage('Da cap nhat du lieu van hanh');
    await Promise.all([load(), loadStatic()]);
  }

  return (
    <section className="workspace operationsPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">San pham & van hanh</p>
          <h1>Van hanh tour va thanh toan NCC</h1>
        </div>
        <div className="pageHeaderActions">
          {message ? <span className="statusPill statusPillNeutral">{message}</span> : null}
          <button className="secondaryButton iconTextButton" onClick={() => { void load(); void loadStatic(); }}><RefreshCcw size={16} /> Reload</button>
        </div>
      </header>

      <section className="metrics operationsMetrics">
        <Metric label="Sap khoi hanh" value={dashboard.upcomingDepartures} />
        <Metric label="Dang van hanh" value={dashboard.operatingTours} />
        <Metric label="Task qua han" value={dashboard.overdueTasks} />
        <Metric label="NCC cho xac nhan" value={dashboard.waitingSupplierConfirmations} />
        <Metric label="YC thanh toan" value={dashboard.pendingSupplierPayments} />
        <Metric label="Tour am loi" value={dashboard.lowMarginTours} />
      </section>
      <PermissionNotice allowed={canAny(['operation.form.view', 'operation.form.manage', 'operation.payment-request.view', 'operation.payment-request.create'])} label="xem van hanh tour" />

      <section className="panel operationsFilters">
        <label><Search size={15} /> Tim kiem<input value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} placeholder="Booking, order, tour, ma yeu cau" /></label>
        <label>Trang thai<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">Tat ca</option><option>PENDING</option><option>IN_PROGRESS</option><option>DONE</option><option>PROBLEM</option><option>CANCELLED</option><option>DRAFT</option><option>REQUESTED</option><option>APPROVED</option><option>PAID</option><option>REJECTED</option></select></label>
      </section>

      <div className="moduleTabs operationsTabs">
        <button className={tab === 'forms' ? 'active' : ''} onClick={() => setTab('forms')}><ClipboardCheck size={16} /> Phieu dieu hanh</button>
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}><HandCoins size={16} /> Thanh toan NCC</button>
      </div>

      {tab === 'forms' ? (
        <section className="contentGrid operationsGrid">
          <div className="panel operationsFormPanel">
            <h2><Plus size={18} /> Tao phieu dieu hanh</h2>
            <form action={createForm} className="formGrid">
              <label>Booking<select name="bookingId" required><option value="">Chon booking</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.code} - {booking.customerName || 'Khach'}</option>)}</select></label>
              <label>Trang thai<select name="status" defaultValue="PENDING"><option>PENDING</option><option>IN_PROGRESS</option><option>DONE</option><option>PROBLEM</option></select></label>
              <label>NCC<select name="supplierId"><option value="">Chon NCC</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierCode || supplier.name} - {supplier.name}</option>)}</select></label>
              <label>Dich vu NCC<select name="supplierServiceId"><option value="">Chon dich vu</option>{suppliers.flatMap((supplier) => supplier.supplierServices || []).map((service) => <option key={service.id} value={service.id}>{service.sku || service.serviceName} - {service.serviceName}</option>)}</select></label>
              <label>Loai DV<input name="serviceType" defaultValue="HOTEL" /></label>
              <label>Ten dich vu<input name="serviceName" defaultValue="Dich vu dieu hanh" /></label>
              <label>Xac nhan<select name="confirmationStatus" defaultValue="WAITING"><option>WAITING</option><option>REQUESTED</option><option>CONFIRMED</option><option>OPERATING</option><option>DONE</option></select></label>
              <label>Du kien chi<input name="expectedCost" type="number" min={0} defaultValue={0} /></label>
              <label>Thuc chi<input name="actualCost" type="number" min={0} defaultValue={0} /></label>
              <label>Ten chi phi<input name="costName" defaultValue="Chi phi NCC" /></label>
              <label>Task<input name="taskTitle" defaultValue="Xac nhan NCC" /></label>
              <label>Nguoi phu trach<input name="assignee" /></label>
              <label>Han task<input name="dueDate" type="date" /></label>
              <label>Ghi chu<textarea name="notes" rows={3} /></label>
              <button type="submit" disabled={!can('operation.form.manage')}>Tao phieu dieu hanh</button>
            </form>
          </div>
          <OperationsTable title="Danh sach phieu dieu hanh" count={forms.length}>
            <thead><tr><th>Booking</th><th>Order/Tour</th><th>Dich vu</th><th>Task</th><th>Chi phi</th><th>Trang thai</th><th></th></tr></thead>
            <tbody>{forms.map((form) => <tr key={form.id}><td><strong>{form.booking?.code || form.bookingId}</strong><span>{form.booking?.customerName || ''}</span></td><td>{form.order?.systemCode || '-'}<span>{form.tour?.tourCode || ''}</span></td><td>{form.services[0]?.serviceName || '-'}<span>{form.services[0]?.supplier?.name || form.services[0]?.confirmationStatus || ''}</span></td><td>{form.tasks[0]?.title || '-'}<span>{date(form.tasks[0]?.dueDate)}</span></td><td>{money(sumCosts(form))}</td><td><span className="statusPill">{form.status}</span></td><td className="operationsActions"><button className="secondaryButton iconButton" onClick={() => { setSelectedFormId(form.id); setTab('payments'); }}><WalletCards size={16} /></button><button className="dangerButton iconButton" disabled={!can('operation.form.manage')} onClick={() => cancelForm(form.id)}><XCircle size={16} /></button></td></tr>)}</tbody>
          </OperationsTable>
        </section>
      ) : (
        <section className="contentGrid operationsGrid">
          <div className="panel operationsFormPanel">
            <h2><Plus size={18} /> Tao yeu cau thanh toan NCC</h2>
            <form action={createPaymentRequest} className="formGrid">
              <label>Phieu dieu hanh<select value={selectedFormId} onChange={(event) => setSelectedFormId(event.target.value)}><option value="">Chon phieu dieu hanh</option>{forms.map((form) => <option key={form.id} value={form.id}>{form.booking?.code || form.id} - {form.services[0]?.serviceName || 'Dich vu'}</option>)}</select></label>
              <label>NCC<select name="supplierId" defaultValue={selectedForm?.services?.[0]?.supplier?.id || ''}><option value="">Chon NCC</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierCode || supplier.name} - {supplier.name}</option>)}</select></label>
              <label>Chi phi<select name="costId" defaultValue={selectedForm?.costs?.[0]?.id || ''}><option value="">Khong gan chi phi</option>{selectedForm?.costs.map((cost) => <option key={cost.id} value={cost.id}>{cost.costName} - {money(Number(cost.actualAmount || cost.expectedAmount))}</option>)}</select></label>
              <label>So tien<input name="amount" type="number" min={0} defaultValue={Number(selectedForm?.costs?.[0]?.actualAmount || selectedForm?.costs?.[0]?.expectedAmount || 0)} /></label>
              <label>Nguoi tao<input name="requestedBy" defaultValue="operation" /></label>
              <label>Ghi chu<textarea name="notes" rows={3} /></label>
              <button type="submit" disabled={!can('operation.payment-request.create')}>Tao yeu cau thanh toan</button>
            </form>
          </div>
          <OperationsTable title="Danh sach yeu cau thanh toan" count={requests.length}>
            <thead><tr><th>Ma YC</th><th>NCC</th><th>Chi phi</th><th>So tien</th><th>Phieu chi</th><th>Trang thai</th><th></th></tr></thead>
            <tbody>{requests.map((request) => <tr key={request.id}><td><strong>{request.code}</strong><span>{date(request.requestedAt)}</span></td><td>{request.items[0]?.supplier?.name || '-'}</td><td>{request.items[0]?.cost?.costName || '-'}<span>{request.items[0]?.notes || ''}</span></td><td>{money(totalRequest(request))}</td><td>{request.financePayment?.voucherCode || '-'}<span>{request.financePayment ? `${request.financePayment.approvalStatus} - ${money(Number(request.financePayment.paymentAmount))}` : ''}</span></td><td><span className="statusPill">{request.status}</span></td><td className="operationsActions"><button className="secondaryButton iconButton" disabled={!can('operation.payment-request.create')} onClick={() => requestAction(request.id, 'submit')}><Send size={16} /></button><button className="secondaryButton iconButton" disabled={!can('operation.payment-request.approve')} onClick={() => requestAction(request.id, 'approve')}><CheckCircle2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('operation.payment-request.approve')} onClick={() => requestAction(request.id, 'create-finance-payment')}><FileCheck2 size={16} /></button><button className="secondaryButton iconButton" disabled={!can('finance.payment.approve')} onClick={() => approveFinancePayment(request.financePaymentId)}><HandCoins size={16} /></button><button className="dangerButton iconButton" disabled={!can('operation.payment-request.approve')} onClick={() => requestAction(request.id, 'reject')}><XCircle size={16} /></button></td></tr>)}</tbody>
          </OperationsTable>
        </section>
      )}
    </section>
  );
}

function authHeaders() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('smarttour.auth.token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function OperationsTable({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="panel operationsList"><div className="sectionHeader"><h2>{title}</h2><span>{count} dong</span></div><div className="fitTableWrap"><table className="operationsTable">{children}</table></div></section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

async function getJson(path: string) {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: authHeaders() });
  if (!response.ok) return {};
  return response.json();
}

function sumCosts(form: OperationForm) {
  return form.costs.reduce((sum, cost) => sum + Number(cost.actualAmount || cost.expectedAmount || 0), 0);
}

function totalRequest(request: PaymentRequest) {
  return request.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function date(value?: string) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-';
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function number(value: FormDataEntryValue | null) {
  return Number(text(value) || 0);
}
