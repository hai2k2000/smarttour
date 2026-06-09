'use client';

import { CheckCircle2, ClipboardCheck, FileCheck2, HandCoins, Plus, RefreshCcw, Search, Send, WalletCards, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { viStatus } from '../i18n';
import { PermissionNotice, usePermissions } from '../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type OperationsTab = 'forms' | 'payments';
type Notice = { type: 'success' | 'error' | 'info'; text: string };
type FilterState = { search: string; status: string };
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
type SupplierServiceOption = SupplierService & { supplierId: string; supplierName: string; supplierCode?: string };
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
  services: {
    id: string;
    supplierId?: string;
    supplierServiceId?: string;
    serviceType: string;
    serviceName: string;
    confirmationStatus: string;
    expectedCost: string;
    actualCost: string;
    supplier?: Supplier;
    supplierService?: SupplierService;
  }[];
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
const defaultFilters: Record<OperationsTab, FilterState> = {
  forms: { search: '', status: '' },
  payments: { search: '', status: '' },
};
const formStatuses = ['PENDING', 'IN_PROGRESS', 'DONE', 'PROBLEM', 'CANCELLED'];
const paymentStatuses = ['DRAFT', 'REQUESTED', 'APPROVED', 'PAID', 'REJECTED'];
const confirmationStatuses = ['WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'DONE'];
const statusLabels: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  IN_PROGRESS: 'Đang xử lý',
  DONE: 'Hoàn tất',
  PROBLEM: 'Có vấn đề',
  CANCELLED: 'Đã hủy',
  DRAFT: 'Nháp',
  REQUESTED: 'Đã gửi yêu cầu',
  APPROVED: 'Đã duyệt',
  PAID: 'Đã thanh toán',
  REJECTED: 'Từ chối',
  WAITING: 'Đang chờ',
  CONFIRMED: 'Đã xác nhận',
  OPERATING: 'Đang vận hành',
  BANK_TRANSFER: 'Chuyển khoản',
};

export default function OperationsClient() {
  const { can, canAny } = usePermissions();
  const [tab, setTab] = useState<OperationsTab>('forms');
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [forms, setForms] = useState<OperationForm[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedFormId, setSelectedFormId] = useState('');
  const [detailRequestId, setDetailRequestId] = useState('');
  const [createFormSupplierId, setCreateFormSupplierId] = useState('');
  const [modal, setModal] = useState<'form' | 'payment' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoadingStatic, setIsLoadingStatic] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const activeFilter = filters[tab];
  const formQuery = useMemo(() => queryFrom(filters.forms), [filters.forms]);
  const paymentQuery = useMemo(() => queryFrom(filters.payments), [filters.payments]);
  const supplierServiceOptions = useMemo(
    () =>
      suppliers.flatMap((supplier) =>
        (supplier.supplierServices || []).map((service) => ({
          ...service,
          supplierId: supplier.id,
          supplierName: supplier.name,
          supplierCode: supplier.supplierCode,
        })),
      ),
    [suppliers],
  );
  const createFormServiceOptions = useMemo(
    () => supplierServiceOptions.filter((service) => !createFormSupplierId || service.supplierId === createFormSupplierId),
    [createFormSupplierId, supplierServiceOptions],
  );
  const selectedForm = forms.find((form) => form.id === selectedFormId);
  const detailRequest = requests.find((request) => request.id === detailRequestId);
  const statusOptions = tab === 'forms' ? formStatuses : paymentStatuses;

  useEffect(() => {
    void loadStatic();
  }, []);

  useEffect(() => {
    void load();
  }, [formQuery, paymentQuery]);

  useEffect(() => {
    if (selectedFormId && !forms.some((form) => form.id === selectedFormId)) setSelectedFormId('');
  }, [forms, selectedFormId]);

  useEffect(() => {
    if (detailRequestId && !requests.some((request) => request.id === detailRequestId)) setDetailRequestId('');
  }, [detailRequestId, requests]);

  async function loadStatic(emitNotice = true) {
    setIsLoadingStatic(true);
    const errors: string[] = [];
    const [bookingResult, supplierResult] = await Promise.allSettled([
      fetchJson<unknown>('/api/bookings?take=80', 'danh sách booking'),
      fetchJson<unknown>('/api/suppliers/hotels', 'danh sách NCC khách sạn'),
    ]);

    if (bookingResult.status === 'fulfilled') {
      setBookings(asRows<Booking>(bookingResult.value));
    } else {
      errors.push(`Booking: ${bookingResult.reason.message || 'không tải được dữ liệu'}`);
    }

    if (supplierResult.status === 'fulfilled') {
      setSuppliers(asRows<Supplier>(supplierResult.value).slice(0, 80));
    } else {
      errors.push(`NCC: ${supplierResult.reason.message || 'không tải được dữ liệu'}`);
    }

    setIsLoadingStatic(false);
    if (emitNotice && errors.length) showError(errors.join(' | '));
    return errors;
  }

  async function load(emitNotice = true) {
    setIsLoadingList(true);
    const errors: string[] = [];
    const [dashboardResult, formsResult, requestsResult] = await Promise.allSettled([
      fetchJson<Dashboard>('/api/operations/dashboard', 'dashboard vận hành'),
      fetchJson<unknown>(`/api/operations/forms?${formQuery}`, 'danh sách phiếu điều hành'),
      fetchJson<unknown>(`/api/operations/supplier-payment-requests?${paymentQuery}`, 'danh sách yêu cầu thanh toán'),
    ]);

    if (dashboardResult.status === 'fulfilled') {
      setDashboard({ ...emptyDashboard, ...dashboardResult.value });
    } else {
      errors.push(`Dashboard: ${dashboardResult.reason.message || 'không tải được dữ liệu'}`);
    }

    if (formsResult.status === 'fulfilled') {
      setForms(asRows<OperationForm>(formsResult.value));
    } else {
      errors.push(`Phiếu điều hành: ${formsResult.reason.message || 'không tải được dữ liệu'}`);
    }

    if (requestsResult.status === 'fulfilled') {
      setRequests(asRows<PaymentRequest>(requestsResult.value));
    } else {
      errors.push(`Yêu cầu thanh toán: ${requestsResult.reason.message || 'không tải được dữ liệu'}`);
    }

    setIsLoadingList(false);
    if (emitNotice && errors.length) showError(errors.join(' | '));
    return errors;
  }

  async function reloadAll() {
    setNotice(null);
    const [staticErrors, loadErrors] = await Promise.all([loadStatic(false), load(false)]);
    const errors = [...staticErrors, ...loadErrors];
    if (errors.length) showError(errors.join(' | '));
    else showSuccess('Đã tải lại dữ liệu vận hành.');
  }

  async function createForm(formData: FormData) {
    const bookingId = text(formData.get('bookingId'));
    const supplierId = text(formData.get('supplierId'));
    const supplierServiceId = text(formData.get('supplierServiceId'));
    const serviceType = text(formData.get('serviceType')) || 'HOTEL';
    const serviceName = text(formData.get('serviceName')) || 'Dịch vụ điều hành';
    const expectedCost = readAmount(formData.get('expectedCost'));
    const actualCost = readAmount(formData.get('actualCost'));
    const costName = text(formData.get('costName')) || 'Chi phí NCC';
    const taskTitle = text(formData.get('taskTitle'));
    const supplier = suppliers.find((item) => item.id === supplierId);
    const supplierService = supplierServiceOptions.find((item) => item.id === supplierServiceId);

    const validation = [
      !bookingId ? 'Cần chọn booking để tạo phiếu điều hành.' : '',
      !supplierId ? 'Cần chọn NCC.' : '',
      !supplier ? 'NCC không hợp lệ hoặc chưa được tải.' : '',
      !supplierServiceId ? 'Cần chọn dịch vụ NCC.' : '',
      supplierService && supplierService.supplierId !== supplierId ? 'Dịch vụ NCC không thuộc nhà cung cấp đã chọn.' : '',
      !Number.isFinite(expectedCost) || expectedCost <= 0 ? 'Dự kiến chi phải là số lớn hơn 0.' : '',
      !Number.isFinite(actualCost) || actualCost < 0 ? 'Thực chi phải là số không âm.' : '',
      !taskTitle ? 'Cần nhập task vận hành.' : '',
    ].filter(Boolean);
    if (validation.length) return showError(validation.join(' '));

    const created = await post<OperationForm>('/api/operations/forms', {
      bookingId,
      status: text(formData.get('status')) || 'PENDING',
      notes: text(formData.get('notes')),
      services: [{
        supplierId,
        supplierServiceId,
        serviceType,
        serviceName,
        confirmationStatus: text(formData.get('confirmationStatus')) || 'WAITING',
        expectedCost,
        actualCost,
      }],
      tasks: [{ title: taskTitle, assignee: text(formData.get('assignee')), dueDate: text(formData.get('dueDate')), status: 'PENDING' }],
      costs: [{ costName, expectedAmount: expectedCost, actualAmount: actualCost, currency: 'VND' }],
    }, 'Tạo phiếu điều hành');

    if (created?.id) setSelectedFormId(created.id);
  }

  async function createPaymentRequest(formData: FormData) {
    const supplierId = text(formData.get('supplierId'));
    const costId = text(formData.get('costId'));
    const amount = readAmount(formData.get('amount'));
    const supplier = suppliers.find((item) => item.id === supplierId);
    const selectedCost = selectedForm?.costs.find((cost) => cost.id === costId);
    const validation = [
      !supplierId ? 'Cần chọn NCC trước khi tạo yêu cầu thanh toán.' : '',
      !supplier ? 'NCC không hợp lệ hoặc chưa được tải.' : '',
      !Number.isFinite(amount) || amount <= 0 ? 'Số tiền thanh toán phải là số lớn hơn 0.' : '',
      selectedForm && costId && !selectedCost ? 'Chi phí được chọn không thuộc phiếu điều hành hiện tại.' : '',
    ].filter(Boolean);
    if (validation.length) return showError(validation.join(' '));

    const created = await post<PaymentRequest>('/api/operations/supplier-payment-requests', {
      requestedBy: text(formData.get('requestedBy')) || 'operation',
      items: [{ supplierId, costId: costId || undefined, amount, notes: text(formData.get('notes')) }],
    }, 'Tạo yêu cầu thanh toán NCC');

    if (created?.id) setDetailRequestId(created.id);
  }

  async function requestAction(id: string, action: 'submit' | 'approve' | 'reject' | 'create-finance-payment') {
    const label = actionLabels[action];
    const updated = await post<PaymentRequest>(`/api/operations/supplier-payment-requests/${id}/${action}`, { actor: action === 'approve' ? 'chief-accountant' : 'operation' }, label);
    if (updated?.id) setDetailRequestId(updated.id);
  }

  async function approveFinancePayment(id?: string) {
    if (!id) return showError('Yêu cầu này chưa có phiếu chi tài chính, không thể duyệt thanh toán.');
    await post(`/api/finance/payments/${id}/approve`, { actor: 'accounting' }, 'Duyệt phiếu chi tài chính');
  }

  async function cancelForm(id: string) {
    const confirmed = typeof window === 'undefined' || window.confirm('Bạn chắc chắn muốn hủy phiếu điều hành này? Thao tác này sẽ đổi trạng thái phiếu sang Đã hủy.');
    if (!confirmed) return;
    await post(`/api/operations/forms/${id}/cancel`, { actor: 'operation', reason: 'Hủy từ màn hình vận hành' }, 'Hủy phiếu điều hành');
  }

  async function post<T = unknown>(path: string, payload: unknown, actionLabel: string) {
    setNotice(null);
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    const data = await parseResponse(response);
    if (!response.ok) {
      showError(`${actionLabel} thất bại: ${messageOf(data) || 'Không thực hiện được.'}`);
      return null;
    }

    const [staticErrors, loadErrors] = await Promise.all([loadStatic(false), load(false)]);
    const errors = [...staticErrors, ...loadErrors];
    if (errors.length) showError(`${actionLabel} thành công, nhưng tải lại dữ liệu lỗi: ${errors.join(' | ')}`);
    else showSuccess(`${actionLabel} thành công.`);
    setModal(null);
    return data as T;
  }

  function switchTab(nextTab: OperationsTab) {
    setTab(nextTab);
    setNotice(null);
    setModal(null);
    if (nextTab === 'forms') setDetailRequestId('');
    if (nextTab === 'payments' && selectedFormId && !forms.some((form) => form.id === selectedFormId)) setSelectedFormId('');
  }

  function setActiveFilter(key: keyof FilterState, value: string) {
    setFilters((current) => ({ ...current, [tab]: { ...current[tab], [key]: value } }));
    if (tab === 'payments') setDetailRequestId('');
    if (tab === 'forms') setSelectedFormId('');
  }

  function showSuccess(textValue: string) {
    setNotice({ type: 'success', text: textValue });
  }

  function showError(textValue: string) {
    setNotice({ type: 'error', text: textValue });
  }

  return (
    <section className="workspace operationsPage" data-testid="operations-page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Sản phẩm & vận hành</p>
          <h1>Vận hành tour và thanh toán NCC</h1>
        </div>
        <div className="pageHeaderActions">
          {notice ? <span className={`statusPill ${noticeClass(notice.type)}`}>{notice.text}</span> : null}
          <button data-testid="operations-create-button" className="iconTextButton" disabled={tab === 'forms' ? !can('operation.form.manage') : !can('operation.payment-request.create')} onClick={() => setModal(tab === 'forms' ? 'form' : 'payment')}>
            <Plus size={16} /> Tạo mới
          </button>
          <button className="secondaryButton iconTextButton" disabled={isLoadingStatic || isLoadingList} onClick={() => { void reloadAll(); }}>
            <RefreshCcw size={16} /> {isLoadingStatic || isLoadingList ? 'Đang tải...' : 'Tải lại'}
          </button>
        </div>
      </header>

      <section className="metrics operationsMetrics" data-testid="operations-dashboard">
        <Metric label="Sắp khởi hành" value={dashboard.upcomingDepartures} />
        <Metric label="Đang vận hành" value={dashboard.operatingTours} />
        <Metric label="Task quá hạn" value={dashboard.overdueTasks} />
        <Metric label="NCC chờ xác nhận" value={dashboard.waitingSupplierConfirmations} />
        <Metric label="Yêu cầu thanh toán" value={dashboard.pendingSupplierPayments} />
        <Metric label="Tour âm lợi nhuận" value={dashboard.lowMarginTours} />
      </section>
      <PermissionNotice allowed={canAny(['operation.form.view', 'operation.form.manage', 'operation.payment-request.view', 'operation.payment-request.create'])} label="xem vận hành tour" />

      <section className="panel operationsFilters">
        <label>
          <Search size={15} /> Tìm kiếm
          <input data-testid="operations-search" value={activeFilter.search} onChange={(event) => setActiveFilter('search', event.target.value)} placeholder={tab === 'forms' ? 'Booking, order, tour, ghi chú...' : 'Mã yêu cầu thanh toán...'} />
        </label>
        <label>
          Trạng thái
          <select data-testid="operations-status-filter" value={activeFilter.status} onChange={(event) => setActiveFilter('status', event.target.value)}>
            <option value="">Tất cả</option>
            {statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
      </section>

      <div className="moduleTabs operationsTabs">
        <button data-testid="operations-tab-forms" className={tab === 'forms' ? 'active' : ''} onClick={() => switchTab('forms')}><ClipboardCheck size={16} /> Phiếu điều hành</button>
        <button data-testid="operations-tab-payments" className={tab === 'payments' ? 'active' : ''} onClick={() => switchTab('payments')}><HandCoins size={16} /> Thanh toán NCC</button>
      </div>

      {modal === 'form' ? (
        <OperationFormModal
          bookings={bookings}
          suppliers={suppliers}
          createFormServiceOptions={createFormServiceOptions}
          createFormSupplierId={createFormSupplierId}
          canCreate={can('operation.form.manage')}
          onSupplierChange={setCreateFormSupplierId}
          onClose={() => setModal(null)}
          onSubmit={createForm}
        />
      ) : null}

      {modal === 'payment' ? (
        <PaymentRequestModal
          forms={forms}
          suppliers={suppliers}
          selectedForm={selectedForm}
          selectedFormId={selectedFormId}
          canCreate={can('operation.payment-request.create')}
          onSelectedFormChange={setSelectedFormId}
          onClose={() => setModal(null)}
          onSubmit={createPaymentRequest}
        />
      ) : null}

      {tab === 'forms' ? (
        <>
          <OperationsTable title="Danh sách phiếu điều hành" count={forms.length}>
            <thead><tr><th>Booking</th><th>Order/Tour</th><th>Dịch vụ</th><th>Task</th><th>Chi phí</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {forms.length === 0 ? <tr><td colSpan={7}>Chưa có phiếu điều hành phù hợp bộ lọc.</td></tr> : null}
              {forms.map((form) => {
                const summary = costSummary(form);
                const firstService = form.services[0];
                const firstTask = form.tasks[0];
                return (
                  <tr key={form.id} data-testid="operation-form-row">
                    <td><strong>{form.booking?.code || form.bookingId}</strong><span>{form.booking?.customerName || '-'}</span></td>
                    <td>{form.order?.systemCode || '-'}<span>{form.tour?.tourCode || form.tour?.name || ''}</span></td>
                    <td>{firstService?.serviceName || '-'}<span>{firstService?.supplier?.name || statusLabel(firstService?.confirmationStatus)}</span></td>
                    <td>{firstTask?.title || '-'}<span>{date(firstTask?.dueDate)} | {statusLabel(firstTask?.status)}</span></td>
                    <td>{money(summary.display)}<span>Dự kiến {money(summary.expected)} | Thực chi {money(summary.actual)}</span></td>
                    <td><span className="statusPill">{statusLabel(form.status)}</span></td>
                    <td className="operationsActions">
                      <button data-testid="operation-form-create-payment" className="secondaryButton iconButton" title="Tạo yêu cầu thanh toán" onClick={() => { setSelectedFormId(form.id); switchTab('payments'); setModal('payment'); }}><WalletCards size={16} /></button>
                      <button data-testid="operation-form-cancel" className="dangerButton iconButton" title="Hủy phiếu điều hành" disabled={!can('operation.form.manage') || form.status === 'CANCELLED'} onClick={() => { void cancelForm(form.id); }}><XCircle size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </OperationsTable>
        </>
      ) : (
        <section className="contentGrid operationsGrid">
          <div className="operationsPaymentStack">
            <ReconciliationPanel
              request={detailRequest}
              canApproveFinance={can('finance.payment.approve')}
              canApproveRequest={can('operation.payment-request.approve')}
              canCreateRequest={can('operation.payment-request.create')}
              onAction={requestAction}
              onApproveFinance={approveFinancePayment}
            />
          </div>
          <OperationsTable title="Danh sách yêu cầu thanh toán" count={requests.length}>
            <thead><tr><th>Mã yêu cầu</th><th>NCC</th><th>Chi phí</th><th>Số tiền</th><th>Phiếu chi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {requests.length === 0 ? <tr><td colSpan={7}>Chưa có yêu cầu thanh toán phù hợp bộ lọc.</td></tr> : null}
              {requests.map((request) => (
                <tr key={request.id} data-testid="operation-payment-row" className={detailRequestId === request.id ? 'operationsSelectedRow' : undefined}>
                  <td><strong>{request.code}</strong><span>{date(request.requestedAt)}</span></td>
                  <td>{request.items[0]?.supplier?.name || '-'}</td>
                  <td>{request.items[0]?.cost?.costName || '-'}<span>{request.items[0]?.notes || request.items[0]?.cost?.operationForm?.booking?.code || ''}</span></td>
                  <td>{money(totalRequest(request))}</td>
                  <td>{request.financePayment?.voucherCode || '-'}<span>{request.financePayment ? `${statusLabel(request.financePayment.approvalStatus)} - ${money(Number(request.financePayment.paymentAmount))}` : 'Chưa tạo phiếu chi'}</span></td>
                  <td><span className="statusPill">{statusLabel(request.status)}</span></td>
                  <td className="operationsActions">
                    <button data-testid="operation-payment-view-reconciliation" className="secondaryButton iconButton" title="Xem đối soát" onClick={() => setDetailRequestId(request.id)}><Search size={16} /></button>
                    <button data-testid="operation-payment-submit" className="secondaryButton iconButton" title="Gửi duyệt" disabled={!can('operation.payment-request.create') || !['DRAFT', 'REJECTED'].includes(request.status)} onClick={() => { void requestAction(request.id, 'submit'); }}><Send size={16} /></button>
                    <button data-testid="operation-payment-approve" className="secondaryButton iconButton" title="Duyệt yêu cầu" disabled={!can('operation.payment-request.approve') || request.status !== 'REQUESTED'} onClick={() => { void requestAction(request.id, 'approve'); }}><CheckCircle2 size={16} /></button>
                    <button data-testid="operation-payment-create-finance" className="secondaryButton iconButton" title="Tạo phiếu chi" disabled={!can('operation.payment-request.approve') || request.status !== 'APPROVED' || Boolean(request.financePaymentId)} onClick={() => { void requestAction(request.id, 'create-finance-payment'); }}><FileCheck2 size={16} /></button>
                    <button data-testid="operation-payment-approve-finance" className="secondaryButton iconButton" title="Duyệt phiếu chi tài chính" disabled={!can('finance.payment.approve') || !request.financePaymentId || request.status === 'PAID' || request.financePayment?.approvalStatus === 'APPROVED'} onClick={() => { void approveFinancePayment(request.financePaymentId); }}><HandCoins size={16} /></button>
                    <button data-testid="operation-payment-reject" className="dangerButton iconButton" title="Từ chối yêu cầu" disabled={!can('operation.payment-request.approve') || ['PAID', 'REJECTED'].includes(request.status)} onClick={() => { void requestAction(request.id, 'reject'); }}><XCircle size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </OperationsTable>
        </section>
      )}
    </section>
  );
}

function OperationFormModal({
  bookings,
  suppliers,
  createFormServiceOptions,
  createFormSupplierId,
  canCreate,
  onSupplierChange,
  onClose,
  onSubmit,
}: {
  bookings: Booking[];
  suppliers: Supplier[];
  createFormServiceOptions: SupplierServiceOption[];
  createFormSupplierId: string;
  canCreate: boolean;
  onSupplierChange: (supplierId: string) => void;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="modalOverlay" role="presentation">
      <div data-testid="operation-form-modal" className="modalPanel modalPanelWide operationsFormPanel" role="dialog" aria-modal="true" aria-labelledby="operation-form-title">
        <header>
          <h2 id="operation-form-title"><Plus size={18} /> Tạo phiếu điều hành</h2>
          <button type="button" data-testid="operation-form-modal-close" className="secondaryButton iconTextButton" onClick={onClose}>Đóng</button>
        </header>
        <form action={onSubmit} className="formGrid operationsFormGrid">
          <fieldset>
            <legend>Thông tin booking</legend>
            <label>Booking<select name="bookingId" required><option value="">Chọn booking</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.code} - {booking.customerName || 'Khách'}</option>)}</select></label>
            <label>Trạng thái<select name="status" defaultValue="PENDING">{formStatuses.filter((status) => status !== 'CANCELLED').map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          </fieldset>
          <fieldset>
            <legend>Dịch vụ nhà cung cấp</legend>
            <label>NCC<select name="supplierId" value={createFormSupplierId} onChange={(event) => onSupplierChange(event.target.value)}><option value="">Chọn NCC</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplierLabel(supplier)}</option>)}</select></label>
            <label>Dịch vụ NCC<select key={createFormSupplierId || 'all-services'} name="supplierServiceId"><option value="">Chọn dịch vụ</option>{createFormServiceOptions.map((service) => <option key={service.id} value={service.id}>{serviceLabel(service)}</option>)}</select></label>
            <label>Loại dịch vụ<input name="serviceType" defaultValue="HOTEL" /></label>
            <label>Tên dịch vụ<input name="serviceName" defaultValue="Dịch vụ điều hành" /></label>
            <label>Xác nhận NCC<select name="confirmationStatus" defaultValue="WAITING">{confirmationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          </fieldset>
          <fieldset>
            <legend>Chi phí & task</legend>
            <label>Dự kiến chi<input name="expectedCost" type="number" min={0} step={1000} defaultValue={0} /></label>
            <label>Thực chi<input name="actualCost" type="number" min={0} step={1000} defaultValue={0} /></label>
            <label>Tên chi phí<input name="costName" defaultValue="Chi phí NCC" /></label>
            <label>Task vận hành<input name="taskTitle" defaultValue="Xác nhận NCC" /></label>
            <label>Người phụ trách<input name="assignee" /></label>
            <label>Hạn task<input name="dueDate" type="date" /></label>
          </fieldset>
          <fieldset className="span2">
            <legend>Ghi chú</legend>
            <label>Ghi chú nội bộ<textarea name="notes" rows={3} /></label>
          </fieldset>
          <div className="modalActions">
            <button type="button" className="secondaryButton" onClick={onClose}>Hủy</button>
            <button type="submit" disabled={!canCreate}>Tạo phiếu điều hành</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentRequestModal({
  forms,
  suppliers,
  selectedForm,
  selectedFormId,
  canCreate,
  onSelectedFormChange,
  onClose,
  onSubmit,
}: {
  forms: OperationForm[];
  suppliers: Supplier[];
  selectedForm?: OperationForm;
  selectedFormId: string;
  canCreate: boolean;
  onSelectedFormChange: (formId: string) => void;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="modalOverlay" role="presentation">
      <div data-testid="operation-payment-modal" className="modalPanel operationsFormPanel" role="dialog" aria-modal="true" aria-labelledby="operation-payment-title">
        <header>
          <h2 id="operation-payment-title"><Plus size={18} /> Tạo yêu cầu thanh toán NCC</h2>
          <button type="button" data-testid="operation-payment-modal-close" className="secondaryButton iconTextButton" onClick={onClose}>Đóng</button>
        </header>
        <form key={selectedFormId || 'manual-request'} action={onSubmit} className="formGrid operationsFormGrid">
          <fieldset>
            <legend>Nguồn yêu cầu</legend>
            <label>Phiếu điều hành<select value={selectedFormId} onChange={(event) => onSelectedFormChange(event.target.value)}><option value="">Không gắn phiếu</option>{forms.map((form) => <option key={form.id} value={form.id}>{form.booking?.code || form.id} - {form.services[0]?.serviceName || 'Dịch vụ'}</option>)}</select></label>
            <label>Chi phí<select name="costId" defaultValue={selectedForm?.costs?.[0]?.id || ''}><option value="">Không gắn chi phí</option>{selectedForm?.costs.map((cost) => <option key={cost.id} value={cost.id}>{cost.costName} - {money(costDisplayAmount(cost))}</option>)}</select></label>
          </fieldset>
          <fieldset>
            <legend>Thanh toán</legend>
            <label>NCC<select name="supplierId" defaultValue={defaultSupplierId(selectedForm)}><option value="">Chọn NCC</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplierLabel(supplier)}</option>)}</select></label>
            <label>Số tiền<input name="amount" type="number" min={0} step={1000} defaultValue={defaultPaymentAmount(selectedForm)} /></label>
            <label>Người tạo<input name="requestedBy" defaultValue="operation" /></label>
            <label>Ghi chú<textarea name="notes" rows={3} /></label>
          </fieldset>
          <div className="modalActions">
            <button type="button" className="secondaryButton" onClick={onClose}>Hủy</button>
            <button type="submit" disabled={!canCreate}>Tạo yêu cầu thanh toán</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReconciliationPanel({
  request,
  canApproveFinance,
  canApproveRequest,
  canCreateRequest,
  onAction,
  onApproveFinance,
}: {
  request?: PaymentRequest;
  canApproveFinance: boolean;
  canApproveRequest: boolean;
  canCreateRequest: boolean;
  onAction: (id: string, action: 'submit' | 'approve' | 'reject' | 'create-finance-payment') => Promise<void>;
  onApproveFinance: (id?: string) => Promise<void>;
}) {
  if (!request) {
    return (
      <aside className="panel reconciliationCard" data-testid="operation-reconciliation-empty">
        <h3>Đối soát yêu cầu thanh toán</h3>
        <p>Chọn một yêu cầu trong bảng để xem liên kết giữa đề nghị vận hành, phiếu chi tài chính và trạng thái đã thanh toán.</p>
      </aside>
    );
  }

  const paid = request.status === 'PAID';
  return (
    <aside className="panel reconciliationCard" data-testid="operation-reconciliation-panel">
      <h3>Đối soát yêu cầu {request.code}</h3>
      <div className="reconciliationTimeline">
        <div><strong>Yêu cầu vận hành</strong><span>{statusLabel(request.status)} | {money(totalRequest(request))}</span></div>
        <div><strong>Phiếu chi tài chính</strong><span>{request.financePayment ? `${request.financePayment.voucherCode} | ${statusLabel(request.financePayment.approvalStatus)} | ${money(Number(request.financePayment.paymentAmount))}` : 'Chưa tạo phiếu chi'}</span></div>
        <div><strong>Thanh toán NCC</strong><span>{paid ? 'Đã ghi nhận thanh toán' : 'Chưa hoàn tất thanh toán'}</span></div>
      </div>
      <div className="reconciliationDetails">
        <p><strong>NCC:</strong> {request.items.map((item) => item.supplier?.name || item.supplierId).join(', ') || '-'}</p>
        <p><strong>Chi phí:</strong> {request.items.map((item) => item.cost?.costName || 'Không gắn chi phí').join(', ')}</p>
      </div>
      <div className="reconciliationActions">
        <button data-testid="reconciliation-submit" className="secondaryButton" disabled={!canCreateRequest || !['DRAFT', 'REJECTED'].includes(request.status)} onClick={() => { void onAction(request.id, 'submit'); }}>Gửi duyệt</button>
        <button data-testid="reconciliation-approve" className="secondaryButton" disabled={!canApproveRequest || request.status !== 'REQUESTED'} onClick={() => { void onAction(request.id, 'approve'); }}>Duyệt yêu cầu</button>
        <button data-testid="reconciliation-create-finance" className="secondaryButton" disabled={!canApproveRequest || request.status !== 'APPROVED' || Boolean(request.financePaymentId)} onClick={() => { void onAction(request.id, 'create-finance-payment'); }}>Tạo phiếu chi</button>
        <button data-testid="reconciliation-approve-finance" className="secondaryButton" disabled={!canApproveFinance || !request.financePaymentId || paid || request.financePayment?.approvalStatus === 'APPROVED'} onClick={() => { void onApproveFinance(request.financePaymentId); }}>Duyệt phiếu chi</button>
      </div>
    </aside>
  );
}

function authHeaders() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('smarttour.auth.token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function OperationsTable({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="panel operationsList"><div className="sectionHeader"><h2>{title}</h2><span>{count} dòng</span></div><div className="fitTableWrap"><table className="operationsTable">{children}</table></div></section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

async function fetchJson<T>(path: string, label: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', headers: authHeaders() });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(`${label}: ${messageOf(data) || response.statusText || 'không tải được dữ liệu'}`);
  return data as T;
}

async function parseResponse(response: Response) {
  const textValue = await response.text();
  if (!textValue) return null;
  try {
    return JSON.parse(textValue);
  } catch {
    return textValue;
  }
}

function asRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)) return (value as { rows: T[] }).rows;
  return [];
}

function queryFrom(filter: FilterState) {
  const params = new URLSearchParams();
  if (filter.search.trim()) params.set('search', filter.search.trim());
  if (filter.status) params.set('status', filter.status);
  return params.toString();
}

function costSummary(form: OperationForm) {
  const expected = form.costs.reduce((sum, cost) => sum + Number(cost.expectedAmount || 0), 0);
  const actual = form.costs.reduce((sum, cost) => sum + Number(cost.actualAmount || 0), 0);
  return { expected, actual, display: actual > 0 ? actual : expected };
}

function costDisplayAmount(cost: { expectedAmount?: string; actualAmount?: string }) {
  const actual = Number(cost.actualAmount || 0);
  return actual > 0 ? actual : Number(cost.expectedAmount || 0);
}

function defaultPaymentAmount(form?: OperationForm) {
  return form?.costs?.[0] ? costDisplayAmount(form.costs[0]) : 0;
}

function defaultSupplierId(form?: OperationForm) {
  const service = form?.services?.find((item) => item.supplier?.id || item.supplierId);
  return service?.supplier?.id || service?.supplierId || '';
}

function totalRequest(request: PaymentRequest) {
  return request.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function date(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('vi-VN');
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function readAmount(value: FormDataEntryValue | null) {
  const amount = Number(text(value) || 0);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function statusLabel(value?: string) {
  const key = String(value || '').trim();
  if (!key) return '-';
  return statusLabels[key] || viStatus(key);
}

function supplierLabel(supplier: Supplier) {
  return supplier.supplierCode ? `${supplier.supplierCode} - ${supplier.name}` : supplier.name;
}

function serviceLabel(service: SupplierServiceOption) {
  const code = service.sku || service.serviceName;
  return `${code} - ${service.serviceName} (${service.supplierCode || service.supplierName})`;
}

function noticeClass(type: Notice['type']) {
  if (type === 'success') return 'statusPillSuccess';
  if (type === 'error') return 'statusPillError';
  return 'statusPillNeutral';
}

function messageOf(data: unknown) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'object') {
    const message = (data as { message?: unknown; error?: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string') return error;
  }
  return '';
}

const actionLabels: Record<'submit' | 'approve' | 'reject' | 'create-finance-payment', string> = {
  submit: 'Gửi duyệt yêu cầu thanh toán',
  approve: 'Duyệt yêu cầu thanh toán',
  reject: 'Từ chối yêu cầu thanh toán',
  'create-finance-payment': 'Tạo phiếu chi tài chính',
};
