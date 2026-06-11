'use client';

import { CheckCircle2, ClipboardCheck, FileCheck2, HandCoins, Plus, RefreshCcw, Search, Send, WalletCards, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { authJsonHeaders } from '../authFetch';
import { viPermission, viStatus } from '../i18n';
import { PermissionNotice, usePermissions } from '../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type OperationsTab = 'forms' | 'payments';
type Notice = { type: 'success' | 'error' | 'info'; text: string };
type FilterState = { search: string; status: string };
type LoadOptions = { emitNotice?: boolean; force?: boolean; dashboard?: boolean; forms?: boolean; requests?: boolean };
type OperationFormDraft = {
  bookingId: string;
  supplierId: string;
  supplierServiceId: string;
  serviceType: string;
  serviceName: string;
  confirmationStatus: string;
  expectedCost: string;
  actualCost: string;
  costName: string;
  taskTitle: string;
  assignee: string;
  dueDate: string;
};
type PaymentRequestDraft = {
  formId: string;
  costId: string;
  supplierId: string;
  amount: string;
  requestedBy: string;
  notes: string;
};
type Dashboard = {
  upcomingDepartures: number;
  operatingTours: number;
  overdueTasks: number;
  waitingSupplierConfirmations: number;
  pendingSupplierPayments: number;
  lowMarginTours: number;
};
type DashboardMetricDefinition = { key: keyof Dashboard; label: string; title: string };
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
  order?: { systemCode?: string; tourCode?: string; name?: string };
  tour?: { systemCode?: string; tourCode?: string; name?: string };
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
  costs: { id: string; serviceId?: string | null; costName: string; expectedAmount: string; actualAmount: string; currency: string; notes?: string }[];
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
const dashboardMetricDefinitions: DashboardMetricDefinition[] = [
  { key: 'upcomingDepartures', label: 'Sắp khởi hành', title: 'Order sắp khởi hành trong 14 ngày tới và booking độc lập đã xác nhận hoặc đang vận hành.' },
  { key: 'operatingTours', label: 'Đang vận hành', title: 'Tour đang chạy và order cũ đang chạy nhưng chưa gắn tour chung.' },
  { key: 'overdueTasks', label: 'Công việc quá hạn', title: 'Task vận hành quá hạn, chưa hoàn tất và chưa hủy.' },
  { key: 'waitingSupplierConfirmations', label: 'Nhà cung cấp chờ xác nhận', title: 'Dịch vụ nhà cung cấp đang chờ xác nhận hoặc đã gửi yêu cầu xác nhận.' },
  { key: 'pendingSupplierPayments', label: 'Yêu cầu thanh toán nhà cung cấp', title: 'Yêu cầu thanh toán đang chờ duyệt hoặc đã duyệt, chưa ghi nhận đã thanh toán.' },
  { key: 'lowMarginTours', label: 'Tour lỗ hoặc âm lợi nhuận', title: 'Order sắp chạy, đang chạy hoặc hoàn tất có doanh thu và lợi nhuận âm.' },
];
const defaultFilters: Record<OperationsTab, FilterState> = {
  forms: { search: '', status: '' },
  payments: { search: '', status: '' },
};
const operationFormStatusValues = ['PENDING', 'IN_PROGRESS', 'DONE', 'PROBLEM', 'CANCELLED'];
const supplierPaymentStatusValues = ['DRAFT', 'REQUESTED', 'APPROVED', 'PAID', 'REJECTED'];
const confirmationStatuses = ['WAITING', 'REQUESTED', 'CONFIRMED', 'OPERATING', 'DONE'];
const operationServiceTypeSuggestions = ['HOTEL', 'TRANSPORT', 'GUIDE', 'MEAL', 'TICKET', 'VISA', 'OTHER'];
const defaultOperationFormDraft: OperationFormDraft = {
  bookingId: '',
  supplierId: '',
  supplierServiceId: '',
  serviceType: 'HOTEL',
  serviceName: 'Dịch vụ điều hành',
  confirmationStatus: 'WAITING',
  expectedCost: '',
  actualCost: '0',
  costName: 'Chi phí nhà cung cấp',
  taskTitle: 'Xác nhận nhà cung cấp',
  assignee: '',
  dueDate: '',
};
const operationTabs: Record<OperationsTab, { label: string; createLabel: string; viewPermission: string; createPermission: string }> = {
  forms: {
    label: 'Phiếu điều hành',
    createLabel: 'Tạo phiếu điều hành',
    viewPermission: 'operation.form.view',
    createPermission: 'operation.form.manage',
  },
  payments: {
    label: 'Thanh toán nhà cung cấp',
    createLabel: 'Tạo yêu cầu thanh toán',
    viewPermission: 'operation.payment-request.view',
    createPermission: 'operation.payment-request.create',
  },
};
const operationsFilterConfig: Record<OperationsTab, { searchPlaceholder: string; statusLabel: string; allStatusesLabel: string; statuses: string[] }> = {
  forms: {
    searchPlaceholder: 'Mã booking, mã đơn hàng, mã tour, tên khách hoặc ghi chú...',
    statusLabel: 'Trạng thái phiếu điều hành',
    allStatusesLabel: 'Tất cả phiếu điều hành',
    statuses: operationFormStatusValues,
  },
  payments: {
    searchPlaceholder: 'Mã yêu cầu thanh toán, nhà cung cấp, chi phí hoặc booking liên quan...',
    statusLabel: 'Trạng thái yêu cầu thanh toán',
    allStatusesLabel: 'Tất cả yêu cầu thanh toán',
    statuses: supplierPaymentStatusValues,
  },
};

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
  const { can, user } = usePermissions();
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
  const [dashboardError, setDashboardError] = useState('');
  const [hasLoadedDashboard, setHasLoadedDashboard] = useState(false);
  const [isLoadingStatic, setIsLoadingStatic] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const reloadInFlight = useRef(false);
  const staticLoadInFlight = useRef('');
  const listLoadInFlight = useRef('');
  const staticLoadSeq = useRef(0);
  const listLoadSeq = useRef(0);

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
  const activeFilterConfig = operationsFilterConfig[tab];
  const statusOptions = activeFilterConfig.statuses;
  const activeTab = operationTabs[tab];
  const canViewForms = can(operationTabs.forms.viewPermission);
  const canViewPayments = can(operationTabs.payments.viewPermission);
  const canCreateForm = can(operationTabs.forms.createPermission);
  const canCreatePaymentRequest = can(operationTabs.payments.createPermission);
  const canApprovePaymentRequest = can('operation.payment-request.approve');
  const canCreateFinancePayment = can('finance.payment.create');
  const canApproveFinancePayment = can('finance.payment.approve');
  const missingOperationsViewPermissions = [
    !canViewForms ? operationTabs.forms.viewPermission : '',
    !canViewPayments ? operationTabs.payments.viewPermission : '',
  ].filter(Boolean);
  const canViewActiveTab = can(activeTab.viewPermission);
  const canCreateActiveTab = can(activeTab.createPermission);
  const isBusy = isLoadingStatic || isLoadingList || isReloading;
  const dashboardHasData = dashboardMetricDefinitions.some((metric) => numberValue(dashboard[metric.key]) > 0);
  const dashboardLoading = canViewForms && isLoadingList;
  const dashboardState = dashboardStatus(canViewForms, hasLoadedDashboard, dashboardHasData, dashboardLoading, dashboardError);
  const paymentRequestActor = userActorLabel(user);
  const staticLoadKey = `${canCreateForm}:${canCreatePaymentRequest}`;
  const listLoadKey = `${canViewForms}:${canViewPayments}:${formQuery}:${paymentQuery}`;

  useEffect(() => {
    void loadStatic();
  }, [staticLoadKey]);

  useEffect(() => {
    void load();
  }, [listLoadKey]);

  useEffect(() => {
    if (tab === 'forms' && !canViewForms && canViewPayments) {
      setTab('payments');
      setNotice(null);
      setModal(null);
      setDetailRequestId('');
    }
    if (tab === 'payments' && !canViewPayments && canViewForms) {
      setTab('forms');
      setNotice(null);
      setModal(null);
      setDetailRequestId('');
    }
  }, [canViewForms, canViewPayments, tab]);

  useEffect(() => {
    if (selectedFormId && !forms.some((form) => form.id === selectedFormId)) {
      setSelectedFormId('');
      setCreateFormSupplierId('');
    }
  }, [forms, selectedFormId]);

  async function loadStatic(emitNotice = true, force = false) {
    const key = staticLoadKey;
    if (!force && staticLoadInFlight.current === key) return [];
    staticLoadInFlight.current = key;
    const sequence = ++staticLoadSeq.current;
    setIsLoadingStatic(true);
    const errors: string[] = [];
    try {
      if (!canCreateForm && !canCreatePaymentRequest) {
        if (sequence === staticLoadSeq.current) {
          setBookings([]);
          setSuppliers([]);
          setCreateFormSupplierId('');
        }
        return errors;
      }
      const [bookingResult, supplierResult] = await Promise.allSettled([
        fetchJson<unknown>('/api/bookings?take=80', 'danh sách booking'),
        fetchJson<unknown>('/api/suppliers', 'danh sách nhà cung cấp'),
      ]);
      if (sequence !== staticLoadSeq.current) return errors;

      if (bookingResult.status === 'fulfilled') {
        setBookings(asRows<Booking>(bookingResult.value));
      } else {
        setBookings([]);
        errors.push(`Booking: ${errorText(bookingResult.reason, 'không tải được dữ liệu')}`);
      }

      if (supplierResult.status === 'fulfilled') {
        const rows = asRows<Supplier>(supplierResult.value).slice(0, 120);
        setSuppliers(rows);
        if (createFormSupplierId && !rows.some((supplier) => supplier.id === createFormSupplierId)) setCreateFormSupplierId('');
      } else {
        setSuppliers([]);
        setCreateFormSupplierId('');
        errors.push(`Nhà cung cấp: ${errorText(supplierResult.reason, 'không tải được dữ liệu')}`);
      }

      if (emitNotice && errors.length) showError(errors.join(' | '));
      return errors;
    } finally {
      if (sequence === staticLoadSeq.current) setIsLoadingStatic(false);
      if (staticLoadInFlight.current === key) staticLoadInFlight.current = '';
    }
  }

  async function load(options: LoadOptions = {}) {
    const emitNotice = options.emitNotice ?? true;
    const scope = normalizeLoadOptions(options);
    const key = `${listLoadKey}:${scope.dashboard}:${scope.forms}:${scope.requests}`;
    if (!scope.force && listLoadInFlight.current === key) return [];
    listLoadInFlight.current = key;
    const sequence = ++listLoadSeq.current;
    setIsLoadingList(true);
    const errors: string[] = [];
    try {
      const [dashboardResult, formsResult, requestsResult] = await Promise.allSettled([
        scope.dashboard && canViewForms ? fetchJson<Dashboard>('/api/operations/dashboard', 'dashboard vận hành') : Promise.resolve(null),
        scope.forms && canViewForms ? fetchJson<unknown>(`/api/operations/forms?${formQuery}`, 'danh sách phiếu điều hành') : Promise.resolve([]),
        scope.requests && canViewPayments ? fetchJson<unknown>(`/api/operations/supplier-payment-requests?${paymentQuery}`, 'danh sách yêu cầu thanh toán') : Promise.resolve([]),
      ]);
      if (sequence !== listLoadSeq.current) return errors;

      if (scope.dashboard) {
        if (!canViewForms) {
          setDashboard(emptyDashboard);
          setDashboardError('');
          setHasLoadedDashboard(false);
        } else if (dashboardResult.status === 'fulfilled' && dashboardResult.value) {
          setDashboard({ ...emptyDashboard, ...dashboardResult.value });
          setDashboardError('');
          setHasLoadedDashboard(true);
        } else {
          const message = dashboardResult.status === 'rejected' ? errorText(dashboardResult.reason, 'không tải được dữ liệu') : 'không tải được dữ liệu';
          setDashboardError(message);
          errors.push(`Dashboard: ${message}`);
        }
      }

      if (scope.forms) {
        if (!canViewForms) {
          setForms([]);
        } else if (formsResult.status === 'fulfilled') {
          setForms(asRows<OperationForm>(formsResult.value));
        } else {
          setForms([]);
          errors.push(`Phiếu điều hành: ${errorText(formsResult.reason, 'không tải được dữ liệu')}`);
        }
      }

      if (scope.requests) {
        if (!canViewPayments) {
          setRequests([]);
          setDetailRequestId('');
        } else if (requestsResult.status === 'fulfilled') {
          setRequests(asRows<PaymentRequest>(requestsResult.value));
        } else {
          setRequests([]);
          setDetailRequestId('');
          errors.push(`Yêu cầu thanh toán: ${errorText(requestsResult.reason, 'không tải được dữ liệu')}`);
        }
      }

      if (emitNotice && errors.length) showError(errors.join(' | '));
      return errors;
    } finally {
      if (sequence === listLoadSeq.current) setIsLoadingList(false);
      if (listLoadInFlight.current === key) listLoadInFlight.current = '';
    }
  }

  async function reloadAll() {
    if (reloadInFlight.current || isLoadingStatic || isLoadingList) return;
    reloadInFlight.current = true;
    setIsReloading(true);
    setNotice(null);
    try {
      const [staticErrors, loadErrors] = await Promise.all([loadStatic(false, true), load({ emitNotice: false, force: true })]);
      const errors = [...staticErrors, ...loadErrors];
      if (errors.length) showError(errors.join(' | '));
      else showSuccess('Đã tải lại dữ liệu vận hành.');
    } finally {
      reloadInFlight.current = false;
      setIsReloading(false);
    }
  }

  async function createForm(formData: FormData) {
    const draft = operationFormDraftFromFormData(formData);
    const status = text(formData.get('status')) || 'PENDING';
    const expectedCost = readAmount(draft.expectedCost);
    const actualCost = readAmount(draft.actualCost);
    const validation = [
      ...operationFormDraftErrors(draft, bookings, suppliers, supplierServiceOptions),
      !operationFormStatusValues.filter((item) => item !== 'CANCELLED').includes(status) ? 'Trạng thái phiếu điều hành khi tạo không hợp lệ.' : '',
    ].filter(Boolean);
    if (validation.length) return showError(formatValidationErrors('Không thể tạo phiếu điều hành', validation));

    const created = await post<OperationForm>('/api/operations/forms', {
      bookingId: draft.bookingId,
      status,
      notes: text(formData.get('notes')),
      services: [{
        supplierId: draft.supplierId,
        supplierServiceId: draft.supplierServiceId,
        serviceType: draft.serviceType.toUpperCase(),
        serviceName: draft.serviceName,
        confirmationStatus: draft.confirmationStatus,
        expectedCost,
        actualCost,
      }],
      tasks: [{ title: draft.taskTitle, assignee: draft.assignee, dueDate: draft.dueDate, status: 'PENDING' }],
      costs: [{ costName: draft.costName, expectedAmount: expectedCost, actualAmount: actualCost, currency: 'VND' }],
    }, 'Tạo phiếu điều hành', { dashboard: true, forms: true, requests: false });

    if (created?.id) setSelectedFormId(created.id);
  }

  async function createPaymentRequest(formData: FormData) {
    const draft = paymentRequestDraftFromFormData(formData, selectedFormId, paymentRequestActor);
    const validation = paymentRequestDraftErrors(draft, selectedForm, suppliers);
    if (validation.length) return showError(formatValidationErrors('Không thể tạo yêu cầu thanh toán nhà cung cấp', validation));

    const amount = readAmount(draft.amount);
    const created = await post<PaymentRequest>('/api/operations/supplier-payment-requests', {
      requestedBy: draft.requestedBy || paymentRequestActor,
      items: [{ supplierId: draft.supplierId, costId: draft.costId, amount, notes: draft.notes }],
    }, 'Tạo yêu cầu thanh toán nhà cung cấp', { dashboard: true, forms: false, requests: true });

    if (created?.id) setDetailRequestId(created.id);
  }

  async function requestAction(id: string, action: 'submit' | 'approve' | 'reject' | 'create-finance-payment') {
    const label = actionLabels[action];
    const updated = await post<PaymentRequest>(`/api/operations/supplier-payment-requests/${id}/${action}`, { actor: actionActor(action) }, label, { dashboard: true, forms: false, requests: true });
    if (updated?.id) setDetailRequestId(updated.id);
  }

  async function approveFinancePayment(id?: string) {
    if (!id) return showError('Yêu cầu này chưa có phiếu chi tài chính, không thể duyệt thanh toán.');
    await post(`/api/finance/payments/${id}/approve`, { actor: 'finance-payment-approver' }, 'Duyệt phiếu chi tài chính', { dashboard: true, forms: false, requests: true });
  }

  async function cancelForm(id: string) {
    const reason = typeof window === 'undefined' ? 'Hủy từ màn hình vận hành' : window.prompt('Nhập lý do hủy phiếu điều hành:');
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (!cleanReason) return showError('Cần nhập lý do hủy phiếu điều hành.');
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Xác nhận hủy phiếu điều hành với lý do đã nhập? Hành động này sẽ được lưu vào lịch sử xử lý.');
    if (!confirmed) return;
    await post(`/api/operations/forms/${id}/cancel`, { actor: 'operations-ui', reason: cleanReason }, 'Hủy phiếu điều hành', { dashboard: true, forms: true, requests: false });
  }

  async function post<T = unknown>(path: string, payload: unknown, actionLabel: string, reloadAfter: LoadOptions = {}) {
    setNotice(null);
    const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    const data = await parseResponse(response);
    if (!response.ok) {
      showError(apiFailureMessage(actionLabel, response, data));
      return null;
    }

    const errors = await load({ ...reloadAfter, emitNotice: false });
    if (errors.length) showError(`${actionLabel} đã thực hiện xong, nhưng tải lại dữ liệu liên quan bị lỗi: ${errors.join(' | ')}`);
    else showSuccess(`${actionLabel} thành công. Dữ liệu liên quan đã được cập nhật.`);
    setModal(null);
    return data as T;
  }

  function switchTab(nextTab: OperationsTab) {
    setTab(nextTab);
    setNotice(null);
    setModal(null);
    setCreateFormSupplierId('');
    if (nextTab === 'forms') setDetailRequestId('');
    if (nextTab === 'payments' && selectedFormId && !forms.some((form) => form.id === selectedFormId)) setSelectedFormId('');
  }

  function openCreateModal() {
    setNotice(null);
    if (tab === 'forms') setCreateFormSupplierId('');
    setModal(tab === 'forms' ? 'form' : 'payment');
  }

  function openReconciliation(requestId: string) {
    setModal(null);
    setDetailRequestId(requestId);
  }

  function closeReconciliation() {
    setDetailRequestId('');
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
          <h1>Vận hành tour và thanh toán nhà cung cấp</h1>
          <p className="pageSubtitle">Theo dõi phiếu điều hành, yêu cầu thanh toán nhà cung cấp và phiếu chi liên quan.</p>
        </div>
        <div className="pageHeaderActions">
          {notice ? <span className={`statusPill ${noticeClass(notice.type)}`}>{notice.text}</span> : null}
          <button
            data-testid="operations-create-button"
            className="iconTextButton"
            disabled={!canViewActiveTab || !canCreateActiveTab}
            title={!canViewActiveTab ? permissionDeniedTitle(activeTab.viewPermission) : !canCreateActiveTab ? permissionDeniedTitle(activeTab.createPermission) : activeTab.createLabel}
            onClick={openCreateModal}
          >
            <Plus size={16} /> {activeTab.createLabel}
          </button>
          <button className="secondaryButton iconTextButton" disabled={isBusy} onClick={() => { void reloadAll(); }}>
            <RefreshCcw size={16} /> {isBusy ? 'Đang tải...' : 'Tải lại'}
          </button>
        </div>
      </header>

      <section className="metrics operationsMetrics" data-testid="operations-dashboard" aria-busy={dashboardLoading}>
        {dashboardMetricDefinitions.map((metric) => (
          <Metric
            key={metric.key}
            label={metric.label}
            value={dashboardMetricValue(dashboard[metric.key], dashboardLoading, hasLoadedDashboard, dashboardError)}
            title={metric.title}
            muted={Boolean(dashboardError && !hasLoadedDashboard)}
          />
        ))}
      </section>
      {dashboardState ? <div data-testid="operations-dashboard-state" className={`operationsDashboardState ${dashboardStateClass(dashboardState.type)}`}>{dashboardState.text}</div> : null}
      <PermissionNotice allowed={canViewForms || canViewPayments} label="xem vận hành tour" missingPermissions={missingOperationsViewPermissions} />

      <section className="panel operationsFilters">
        <label>
          <Search size={15} /> Tìm kiếm
          <input data-testid="operations-search" value={activeFilter.search} onChange={(event) => setActiveFilter('search', event.target.value)} placeholder={activeFilterConfig.searchPlaceholder} />
        </label>
        <label>
          {activeFilterConfig.statusLabel}
          <select data-testid="operations-status-filter" value={activeFilter.status} onChange={(event) => setActiveFilter('status', event.target.value)}>
            <option value="">{activeFilterConfig.allStatusesLabel}</option>
            {statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
      </section>

      <div className="moduleTabs operationsTabs">
        <button data-testid="operations-tab-forms" className={tab === 'forms' ? 'active' : ''} disabled={!canViewForms} title={canViewForms ? operationTabs.forms.label : permissionDeniedTitle(operationTabs.forms.viewPermission)} onClick={() => switchTab('forms')}><ClipboardCheck size={16} /> {operationTabs.forms.label}</button>
        <button data-testid="operations-tab-payments" className={tab === 'payments' ? 'active' : ''} disabled={!canViewPayments} title={canViewPayments ? operationTabs.payments.label : permissionDeniedTitle(operationTabs.payments.viewPermission)} onClick={() => switchTab('payments')}><HandCoins size={16} /> {operationTabs.payments.label}</button>
      </div>

      {modal === 'form' ? (
        <OperationFormModal
          bookings={bookings}
          suppliers={suppliers}
          createFormServiceOptions={createFormServiceOptions}
          createFormSupplierId={createFormSupplierId}
          canCreate={canCreateForm}
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
          canCreate={canCreatePaymentRequest}
          requestedByDefault={paymentRequestActor}
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
                const orderTour = formOrderTourSummary(form);
                const service = formServiceSummary(form);
                const task = formTaskSummary(form);
                const cost = formCostSummary(form);
                const linkedRequest = linkedPaymentRequestForForm(form, requests);
                return (
                  <tr key={form.id} data-testid="operation-form-row">
                    <td><strong>{form.booking?.code || form.bookingId}</strong><span>{form.booking?.customerName || 'Chưa có tên khách'}</span></td>
                    <td><strong>{orderTour.primary}</strong><span>{orderTour.secondary}</span></td>
                    <td><strong>{service.primary}</strong><span>{service.secondary}</span></td>
                    <td><strong>{task.primary}</strong><span>{task.secondary}</span></td>
                    <td><strong>{cost.primary}</strong><span>{cost.secondary}</span></td>
                    <td><span className={`statusPill ${statusPillClass(form.status)}`}>{statusLabel(form.status)}</span></td>
                    <td className="operationsActions">
                      <button data-testid="operation-form-open-reconciliation" className="secondaryButton iconButton" title={!canViewPayments ? permissionDeniedTitle(operationTabs.payments.viewPermission) : linkedRequest ? 'Mở đối soát thanh toán' : 'Chưa có yêu cầu thanh toán để đối soát.'} disabled={!canViewPayments || !linkedRequest} onClick={() => { if (!linkedRequest) return; switchTab('payments'); setSelectedFormId(form.id); openReconciliation(linkedRequest.id); }}><Search size={16} /></button>
                      <button data-testid="operation-form-create-payment" className="secondaryButton iconButton" title={!canViewPayments ? permissionDeniedTitle(operationTabs.payments.viewPermission) : !canCreatePaymentRequest ? permissionDeniedTitle(operationTabs.payments.createPermission) : form.status === 'CANCELLED' ? 'Phiếu đã hủy, không thể tạo yêu cầu thanh toán.' : form.costs.length === 0 ? 'Phiếu chưa có chi phí để tạo yêu cầu thanh toán.' : 'Tạo yêu cầu thanh toán'} disabled={!canViewPayments || !canCreatePaymentRequest || form.status === 'CANCELLED' || form.costs.length === 0} onClick={() => { setSelectedFormId(form.id); switchTab('payments'); setModal('payment'); }}><WalletCards size={16} /></button>
                      <button data-testid="operation-form-cancel" className="dangerButton iconButton" title={!canCreateForm ? permissionDeniedTitle(operationTabs.forms.createPermission) : form.status === 'CANCELLED' ? 'Phiếu đã hủy.' : 'Hủy phiếu điều hành'} disabled={!canCreateForm || form.status === 'CANCELLED'} onClick={() => { void cancelForm(form.id); }}><XCircle size={16} /></button>
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
              requestId={detailRequestId}
              request={detailRequest}
              isLoading={isLoadingList}
              canApproveFinance={canApproveFinancePayment}
              canApproveRequest={canApprovePaymentRequest}
              canCreateFinance={canCreateFinancePayment}
              canCreateRequest={canCreatePaymentRequest}
              onAction={requestAction}
              onApproveFinance={approveFinancePayment}
              onClose={closeReconciliation}
            />
          </div>
          <OperationsTable title="Danh sách yêu cầu thanh toán" count={requests.length}>
            <thead><tr><th title="Mã yêu cầu thanh toán nhà cung cấp">Mã yêu cầu</th><th>Nhà cung cấp</th><th>Chi phí</th><th>Số tiền</th><th title="Phiếu chi tài chính liên kết">Phiếu chi tài chính</th><th title="Trạng thái xử lý yêu cầu thanh toán">Trạng thái yêu cầu</th><th>Thao tác</th></tr></thead>
            <tbody>
              {requests.length === 0 ? <tr><td colSpan={7}>Chưa có yêu cầu thanh toán phù hợp bộ lọc.</td></tr> : null}
              {requests.map((request) => {
                const canSubmitRequest = canCreatePaymentRequest && ['DRAFT', 'REJECTED'].includes(request.status);
                const canApproveRequest = canApprovePaymentRequest && request.status === 'REQUESTED';
                const canRejectRequest = canApprovePaymentRequest && request.status === 'REQUESTED';
                const canCreateFinanceForRequest = canApprovePaymentRequest && canCreateFinancePayment && request.status === 'APPROVED' && !request.financePaymentId;
                const canApproveFinanceForRequest = canApproveFinancePayment && Boolean(request.financePaymentId) && request.status !== 'PAID' && request.financePayment?.approvalStatus !== 'APPROVED';
                return (
                <tr key={request.id} data-testid="operation-payment-row" className={detailRequestId === request.id ? 'operationsSelectedRow' : undefined}>
                  <td><strong>{request.code}</strong><span>{date(request.requestedAt)}</span></td>
                  <td>{request.items[0]?.supplier?.name || '-'}</td>
                  <td>{request.items[0]?.cost?.costName || '-'}<span>{request.items[0]?.notes || request.items[0]?.cost?.operationForm?.booking?.code || ''}</span></td>
                  <td>{money(totalRequest(request))}</td>
                  <td>{request.financePayment?.voucherCode || '-'}<span>{request.financePayment ? `${statusLabel(request.financePayment.approvalStatus)} - ${money(request.financePayment.paymentAmount)}` : 'Chưa tạo phiếu chi'}</span></td>
                  <td><span className={`statusPill ${statusPillClass(request.status)}`}>{statusLabel(request.status)}</span></td>
                  <td className="operationsActions">
                    <button data-testid="operation-payment-view-reconciliation" className="secondaryButton iconButton" title={detailRequestId === request.id ? 'Đóng đối soát yêu cầu thanh toán' : 'Xem đối soát yêu cầu thanh toán'} onClick={() => { if (detailRequestId === request.id) closeReconciliation(); else openReconciliation(request.id); }}><Search size={16} /></button>
                    <button data-testid="operation-payment-submit" className="secondaryButton iconButton" title={!canCreatePaymentRequest ? permissionDeniedTitle(operationTabs.payments.createPermission) : canSubmitRequest ? 'Gửi yêu cầu thanh toán để duyệt' : 'Chỉ yêu cầu nháp hoặc bị từ chối mới được gửi duyệt.'} disabled={!canSubmitRequest} onClick={() => { void requestAction(request.id, 'submit'); }}><Send size={16} /></button>
                    <button data-testid="operation-payment-approve" className="secondaryButton iconButton" title={!canApprovePaymentRequest ? permissionDeniedTitle('operation.payment-request.approve') : canApproveRequest ? 'Duyệt yêu cầu thanh toán' : 'Chỉ yêu cầu đã gửi mới được duyệt.'} disabled={!canApproveRequest} onClick={() => { void requestAction(request.id, 'approve'); }}><CheckCircle2 size={16} /></button>
                    <button data-testid="operation-payment-create-finance" className="secondaryButton iconButton" title={!canApprovePaymentRequest ? permissionDeniedTitle('operation.payment-request.approve') : !canCreateFinancePayment ? permissionDeniedTitle('finance.payment.create') : canCreateFinanceForRequest ? 'Tạo phiếu chi tài chính từ yêu cầu đã duyệt' : 'Cần yêu cầu đã duyệt và chưa có phiếu chi tài chính.'} disabled={!canCreateFinanceForRequest} onClick={() => { void requestAction(request.id, 'create-finance-payment'); }}><FileCheck2 size={16} /></button>
                    <button data-testid="operation-payment-approve-finance" className="secondaryButton iconButton" title={!canApproveFinancePayment ? permissionDeniedTitle('finance.payment.approve') : canApproveFinanceForRequest ? 'Duyệt phiếu chi tài chính' : 'Cần có phiếu chi tài chính chưa duyệt.'} disabled={!canApproveFinanceForRequest} onClick={() => { void approveFinancePayment(request.financePaymentId); }}><HandCoins size={16} /></button>
                    <button data-testid="operation-payment-reject" className="dangerButton iconButton" title={!canApprovePaymentRequest ? permissionDeniedTitle('operation.payment-request.approve') : canRejectRequest ? 'Từ chối yêu cầu thanh toán' : 'Chỉ yêu cầu đã gửi mới được từ chối.'} disabled={!canRejectRequest} onClick={() => { void requestAction(request.id, 'reject'); }}><XCircle size={16} /></button>
                  </td>
                </tr>
                );
              })}
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
  const [draft, setDraft] = useState<OperationFormDraft>({ ...defaultOperationFormDraft, supplierId: createFormSupplierId });
  const availableServiceIds = createFormServiceOptions.map((service) => service.id).join('|');

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      supplierId: createFormSupplierId,
      supplierServiceId: current.supplierServiceId && availableServiceIds.split('|').includes(current.supplierServiceId) ? current.supplierServiceId : '',
    }));
  }, [availableServiceIds, createFormSupplierId]);

  function setDraftValue(key: keyof OperationFormDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const formErrors = operationFormDraftErrors(draft, bookings, suppliers, createFormServiceOptions);
  const canSubmit = canCreate && formErrors.length === 0;

  return (
    <div className="modalOverlay" role="presentation">
      <div data-testid="operation-form-modal" className="modalPanel modalPanelWide operationsFormPanel" role="dialog" aria-modal="true" aria-labelledby="operation-form-title">
        <header>
          <h2 id="operation-form-title"><Plus size={18} /> Tạo phiếu điều hành</h2>
          <button type="button" data-testid="operation-form-modal-close" className="secondaryButton iconTextButton" onClick={onClose}>Đóng</button>
        </header>
        <form action={onSubmit} onSubmit={(event) => { if (!canSubmit) event.preventDefault(); }} className="formGrid operationsFormGrid">
          {formErrors.length ? (
            <div data-testid="operation-form-validation" className="formValidationSummary" aria-live="polite">
              <strong>Cần hoàn tất thông tin trước khi tạo phiếu:</strong>
              <ul>{formErrors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}
          <fieldset>
            <legend>Thông tin booking</legend>
            <label>Booking<select name="bookingId" value={draft.bookingId} required onChange={(event) => setDraftValue('bookingId', event.target.value)}><option value="">Chọn booking</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.code} - {booking.customerName || 'Khách'}</option>)}</select></label>
            <label>Trạng thái<select name="status" defaultValue="PENDING">{operationFormStatusValues.filter((status) => status !== 'CANCELLED').map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          </fieldset>
          <fieldset>
            <legend>Dịch vụ nhà cung cấp</legend>
            <label>Nhà cung cấp<select name="supplierId" value={draft.supplierId} required onChange={(event) => { setDraft((current) => ({ ...current, supplierId: event.target.value, supplierServiceId: '' })); onSupplierChange(event.target.value); }}><option value="">Chọn nhà cung cấp</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplierLabel(supplier)}</option>)}</select></label>
            <label>Dịch vụ nhà cung cấp<select key={draft.supplierId || 'all-services'} name="supplierServiceId" value={draft.supplierServiceId} required onChange={(event) => setDraftValue('supplierServiceId', event.target.value)}><option value="">Chọn dịch vụ</option>{createFormServiceOptions.map((service) => <option key={service.id} value={service.id}>{serviceLabel(service)}</option>)}</select></label>
            <label>Loại dịch vụ<input name="serviceType" list="operation-service-types" required maxLength={40} value={draft.serviceType} onChange={(event) => setDraftValue('serviceType', event.target.value.toUpperCase())} /></label>
            <datalist id="operation-service-types">{operationServiceTypeSuggestions.map((type) => <option key={type} value={type} />)}</datalist>
            <label>Tên dịch vụ<input name="serviceName" required maxLength={120} value={draft.serviceName} onChange={(event) => setDraftValue('serviceName', event.target.value)} /></label>
            <label>Nhà cung cấp xác nhận<select name="confirmationStatus" value={draft.confirmationStatus} required onChange={(event) => setDraftValue('confirmationStatus', event.target.value)}>{confirmationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          </fieldset>
          <fieldset>
            <legend>Chi phí & task</legend>
            <label>Dự kiến chi<input name="expectedCost" type="number" min={1} step={1000} required value={draft.expectedCost} onChange={(event) => setDraftValue('expectedCost', event.target.value)} /></label>
            <label>Thực chi<input name="actualCost" type="number" min={0} step={1000} required value={draft.actualCost} onChange={(event) => setDraftValue('actualCost', event.target.value)} /></label>
            <label>Tên chi phí<input name="costName" required maxLength={120} value={draft.costName} onChange={(event) => setDraftValue('costName', event.target.value)} /></label>
            <label>Task vận hành<input name="taskTitle" required maxLength={120} value={draft.taskTitle} onChange={(event) => setDraftValue('taskTitle', event.target.value)} /></label>
            <label>Người phụ trách<input name="assignee" maxLength={80} value={draft.assignee} onChange={(event) => setDraftValue('assignee', event.target.value)} /></label>
            <label>Hạn task<input name="dueDate" type="date" min={todayDateInput()} value={draft.dueDate} onChange={(event) => setDraftValue('dueDate', event.target.value)} /></label>
          </fieldset>
          <fieldset className="span2">
            <legend>Ghi chú</legend>
            <label>Ghi chú nội bộ<textarea name="notes" rows={3} /></label>
          </fieldset>
          <div className="modalActions">
            <button type="button" className="secondaryButton" onClick={onClose}>Hủy</button>
            <button type="submit" disabled={!canSubmit}>Tạo phiếu điều hành</button>
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
  requestedByDefault,
  onSelectedFormChange,
  onClose,
  onSubmit,
}: {
  forms: OperationForm[];
  suppliers: Supplier[];
  selectedForm?: OperationForm;
  selectedFormId: string;
  canCreate: boolean;
  requestedByDefault: string;
  onSelectedFormChange: (formId: string) => void;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PaymentRequestDraft>(() => paymentRequestDraftForForm(selectedForm, requestedByDefault, selectedFormId));
  const selectedFormCostIds = selectedForm?.costs.map((cost) => cost.id).join('|') || '';

  useEffect(() => {
    setDraft((current) => {
      const costStillValid = Boolean(selectedForm?.costs.some((cost) => cost.id === current.costId));
      const costId = selectedForm ? (costStillValid ? current.costId : selectedForm.costs[0]?.id || '') : '';
      return {
        ...current,
        formId: selectedFormId,
        costId,
        supplierId: selectedForm ? supplierIdForCost(selectedForm, costId) || current.supplierId : '',
        amount: selectedForm ? paymentAmountForCost(selectedForm, costId) : '',
        requestedBy: current.requestedBy || requestedByDefault,
      };
    });
  }, [requestedByDefault, selectedForm, selectedFormCostIds, selectedFormId]);

  function setDraftValue(key: keyof PaymentRequestDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeSelectedForm(formId: string) {
    onSelectedFormChange(formId);
    setDraft((current) => ({ ...current, formId, costId: '', supplierId: '', amount: '' }));
  }

  function changeCost(costId: string) {
    setDraft((current) => ({
      ...current,
      costId,
      supplierId: supplierIdForCost(selectedForm, costId) || current.supplierId,
      amount: paymentAmountForCost(selectedForm, costId),
    }));
  }

  const formErrors = paymentRequestDraftErrors(draft, selectedForm, suppliers);
  const canSubmit = canCreate && formErrors.length === 0;

  return (
    <div className="modalOverlay" role="presentation">
      <div data-testid="operation-payment-modal" className="modalPanel operationsFormPanel" role="dialog" aria-modal="true" aria-labelledby="operation-payment-title">
        <header>
          <h2 id="operation-payment-title"><Plus size={18} /> Tạo yêu cầu thanh toán nhà cung cấp</h2>
          <button type="button" data-testid="operation-payment-modal-close" className="secondaryButton iconTextButton" onClick={onClose}>Đóng</button>
        </header>
        <form action={onSubmit} onSubmit={(event) => { if (!canSubmit) event.preventDefault(); }} className="formGrid operationsFormGrid">
          {formErrors.length ? (
            <div data-testid="operation-payment-validation" className="formValidationSummary" aria-live="polite">
              <strong>Cần hoàn tất thông tin trước khi tạo yêu cầu thanh toán:</strong>
              <ul>{formErrors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}
          <fieldset>
            <legend>Nguồn yêu cầu</legend>
            <label>Phiếu điều hành<select name="formId" value={draft.formId} required onChange={(event) => changeSelectedForm(event.target.value)}><option value="">Chọn phiếu điều hành</option>{forms.map((form) => <option key={form.id} value={form.id}>{form.booking?.code || form.id} - {form.services[0]?.serviceName || 'Dịch vụ điều hành'}</option>)}</select></label>
            <label>Chi phí điều hành<select name="costId" value={draft.costId} required disabled={!selectedForm} onChange={(event) => changeCost(event.target.value)}><option value="">Chọn chi phí</option>{selectedForm?.costs.map((cost) => <option key={cost.id} value={cost.id}>{cost.costName} - {money(costDisplayAmount(cost))}</option>)}</select></label>
          </fieldset>
          <fieldset>
            <legend>Thanh toán</legend>
            <label>Nhà cung cấp<select name="supplierId" value={draft.supplierId} required disabled={!selectedForm} onChange={(event) => setDraftValue('supplierId', event.target.value)}><option value="">Chọn nhà cung cấp</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplierLabel(supplier)}</option>)}</select></label>
            <label>Số tiền<input name="amount" type="number" min={1} step={1000} required value={draft.amount} onChange={(event) => setDraftValue('amount', event.target.value)} /></label>
            <label>Người tạo yêu cầu<input name="requestedBy" required maxLength={120} value={draft.requestedBy} onChange={(event) => setDraftValue('requestedBy', event.target.value)} /></label>
            <label>Ghi chú<textarea name="notes" rows={3} maxLength={300} value={draft.notes} onChange={(event) => setDraftValue('notes', event.target.value)} /></label>
          </fieldset>
          <div className="modalActions">
            <button type="button" className="secondaryButton" onClick={onClose}>Hủy</button>
            <button type="submit" disabled={!canSubmit}>Tạo yêu cầu thanh toán</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReconciliationPanel({
  requestId,
  request,
  isLoading,
  canApproveFinance,
  canApproveRequest,
  canCreateFinance,
  canCreateRequest,
  onAction,
  onApproveFinance,
  onClose,
}: {
  requestId: string;
  request?: PaymentRequest;
  isLoading: boolean;
  canApproveFinance: boolean;
  canApproveRequest: boolean;
  canCreateFinance: boolean;
  canCreateRequest: boolean;
  onAction: (id: string, action: 'submit' | 'approve' | 'reject' | 'create-finance-payment') => Promise<void>;
  onApproveFinance: (id?: string) => Promise<void>;
  onClose: () => void;
}) {
  if (!requestId) {
    return (
      <aside className="panel reconciliationCard" data-testid="operation-reconciliation-empty">
        <h3>Đối soát yêu cầu thanh toán</h3>
        <p>Chọn một yêu cầu trong bảng để xem luồng yêu cầu thanh toán, phiếu chi tài chính và kết quả đối soát.</p>
      </aside>
    );
  }

  if (!request) {
    return (
      <aside className="panel reconciliationCard" data-testid={isLoading ? 'operation-reconciliation-loading' : 'operation-reconciliation-missing'}>
        <div className="reconciliationHeader">
          <h3>Đối soát yêu cầu thanh toán</h3>
          <button type="button" data-testid="operation-reconciliation-close" className="secondaryButton iconTextButton" onClick={onClose}>Đóng</button>
        </div>
        <p>{isLoading ? 'Đang tải thông tin đối soát mới nhất...' : 'Yêu cầu đang chọn không còn nằm trong danh sách hiện tại. Hãy kiểm tra lại bộ lọc hoặc tải lại dữ liệu.'}</p>
      </aside>
    );
  }

  const paid = request.status === 'PAID';
  const canSubmitRequest = canCreateRequest && ['DRAFT', 'REJECTED'].includes(request.status);
  const canApproveSubmittedRequest = canApproveRequest && request.status === 'REQUESTED';
  const canRejectSubmittedRequest = canApproveRequest && request.status === 'REQUESTED';
  const canCreateFinanceForRequest = canApproveRequest && canCreateFinance && request.status === 'APPROVED' && !request.financePaymentId;
  const canApproveFinanceForRequest = canApproveFinance && Boolean(request.financePaymentId) && !paid && request.financePayment?.approvalStatus !== 'APPROVED';
  return (
    <aside key={request.id} className="panel reconciliationCard" data-testid="operation-reconciliation-panel">
      <div className="reconciliationHeader">
        <h3>Đối soát yêu cầu {request.code}</h3>
        <button type="button" data-testid="operation-reconciliation-close" className="secondaryButton iconTextButton" onClick={onClose}>Đóng</button>
      </div>
      <div className="reconciliationTimeline">
        <div><strong>Bước 1: Yêu cầu thanh toán</strong><span>{statusLabel(request.status)} | {money(totalRequest(request))} | Người tạo: {request.requestedBy || 'Chưa ghi nhận'}</span></div>
        <div><strong>Bước 2: Phiếu chi tài chính</strong><span>{request.financePayment ? `${request.financePayment.voucherCode} | ${statusLabel(request.financePayment.approvalStatus)} | ${money(request.financePayment.paymentAmount)}` : 'Chưa tạo phiếu chi tài chính'}</span></div>
        <div><strong>Bước 3: Hoàn tất đối soát</strong><span>{paid ? 'Đã hoàn tất đối soát và ghi nhận thanh toán.' : 'Chưa hoàn tất đối soát thanh toán.'}</span></div>
      </div>
      <div className="reconciliationDetails">
        <div className="fitTableWrap reconciliationItemsWrap">
          <table className="reconciliationItemTable">
            <thead><tr><th>Nhà cung cấp</th><th>Khoản chi</th><th>Số tiền</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {request.items.length === 0 ? <tr><td colSpan={4}>Yêu cầu chưa có dòng thanh toán.</td></tr> : null}
              {request.items.map((item) => {
                const cost = paymentItemCostSummary(item);
                return (
                  <tr key={item.id}>
                    <td><strong>{paymentItemSupplierLabel(item)}</strong><span>{item.supplierId ? `Mã: ${item.supplierId}` : 'Thiếu mã nhà cung cấp'}</span></td>
                    <td><strong>{cost.primary}</strong><span>{cost.secondary}</span></td>
                    <td>{money(item.amount)}</td>
                    <td>{paymentItemNote(item)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="reconciliationActions">
        <button data-testid="reconciliation-submit" className="secondaryButton" title={!canCreateRequest ? permissionDeniedTitle('operation.payment-request.create') : undefined} disabled={!canSubmitRequest} onClick={() => { void onAction(request.id, 'submit'); }}>Gửi duyệt</button>
        <button data-testid="reconciliation-approve" className="secondaryButton" title={!canApproveRequest ? permissionDeniedTitle('operation.payment-request.approve') : undefined} disabled={!canApproveSubmittedRequest} onClick={() => { void onAction(request.id, 'approve'); }}>Duyệt yêu cầu</button>
        <button data-testid="reconciliation-create-finance" className="secondaryButton" title={!canApproveRequest ? permissionDeniedTitle('operation.payment-request.approve') : !canCreateFinance ? permissionDeniedTitle('finance.payment.create') : undefined} disabled={!canCreateFinanceForRequest} onClick={() => { void onAction(request.id, 'create-finance-payment'); }}>Tạo phiếu chi</button>
        <button data-testid="reconciliation-approve-finance" className="secondaryButton" title={!canApproveFinance ? permissionDeniedTitle('finance.payment.approve') : undefined} disabled={!canApproveFinanceForRequest} onClick={() => { void onApproveFinance(request.financePaymentId); }}>Duyệt phiếu chi</button>
        <button data-testid="reconciliation-reject" className="dangerButton" title={!canApproveRequest ? permissionDeniedTitle('operation.payment-request.approve') : undefined} disabled={!canRejectSubmittedRequest} onClick={() => { void onAction(request.id, 'reject'); }}>Từ chối yêu cầu</button>
      </div>
    </aside>
  );
}

function authHeaders() {
  return authJsonHeaders();
}

function OperationsTable({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="panel operationsList"><div className="sectionHeader"><h2>{title}</h2><span>{new Intl.NumberFormat('vi-VN').format(count)} bản ghi</span></div><div className="fitTableWrap"><table className="operationsTable">{children}</table></div></section>;
}
function operationFormDraftFromFormData(formData: FormData): OperationFormDraft {
  return {
    bookingId: text(formData.get('bookingId')),
    supplierId: text(formData.get('supplierId')),
    supplierServiceId: text(formData.get('supplierServiceId')),
    serviceType: text(formData.get('serviceType')) || defaultOperationFormDraft.serviceType,
    serviceName: text(formData.get('serviceName')) || defaultOperationFormDraft.serviceName,
    confirmationStatus: text(formData.get('confirmationStatus')) || defaultOperationFormDraft.confirmationStatus,
    expectedCost: text(formData.get('expectedCost')),
    actualCost: text(formData.get('actualCost')) || defaultOperationFormDraft.actualCost,
    costName: text(formData.get('costName')) || defaultOperationFormDraft.costName,
    taskTitle: text(formData.get('taskTitle')) || defaultOperationFormDraft.taskTitle,
    assignee: text(formData.get('assignee')),
    dueDate: text(formData.get('dueDate')),
  };
}

function operationFormDraftErrors(draft: OperationFormDraft, bookings: Booking[], suppliers: Supplier[], serviceOptions: SupplierServiceOption[]) {
  const errors: string[] = [];
  const booking = bookings.find((item) => item.id === draft.bookingId);
  const supplier = suppliers.find((item) => item.id === draft.supplierId);
  const supplierService = serviceOptions.find((item) => item.id === draft.supplierServiceId);
  const serviceType = text(draft.serviceType);
  const serviceName = text(draft.serviceName);
  const confirmationStatus = text(draft.confirmationStatus);
  const expectedCost = readAmount(draft.expectedCost);
  const actualCost = readAmount(draft.actualCost);
  const costName = text(draft.costName);
  const taskTitle = text(draft.taskTitle);
  const assignee = text(draft.assignee);
  const dueDate = text(draft.dueDate);

  if (!draft.bookingId) errors.push('Cần chọn booking để tạo phiếu điều hành.');
  else if (!booking) errors.push('Booking đã chọn không hợp lệ hoặc chưa được tải.');
  if (!draft.supplierId) errors.push('Cần chọn nhà cung cấp cho dịch vụ điều hành.');
  else if (!supplier) errors.push('Nhà cung cấp đã chọn không hợp lệ hoặc chưa được tải.');
  if (!draft.supplierServiceId) errors.push('Cần chọn dịch vụ cụ thể của nhà cung cấp.');
  else if (!supplierService) errors.push('Dịch vụ nhà cung cấp đã chọn không hợp lệ hoặc không thuộc bộ lọc hiện tại.');
  else if (supplierService.supplierId !== draft.supplierId) errors.push('Dịch vụ không thuộc nhà cung cấp đã chọn.');
  if (!serviceType) errors.push('Cần nhập loại dịch vụ.');
  else if (serviceType.length > 40) errors.push('Loại dịch vụ không được vượt quá 40 ký tự.');
  if (!serviceName) errors.push('Cần nhập tên dịch vụ điều hành.');
  else if (serviceName.length < 3) errors.push('Tên dịch vụ điều hành cần có ít nhất 3 ký tự.');
  else if (serviceName.length > 120) errors.push('Tên dịch vụ điều hành không được vượt quá 120 ký tự.');
  if (!confirmationStatuses.includes(confirmationStatus)) errors.push('Trạng thái xác nhận nhà cung cấp không hợp lệ.');
  if (!Number.isFinite(expectedCost) || expectedCost <= 0) errors.push('Dự kiến chi phải là số lớn hơn 0.');
  if (!Number.isFinite(actualCost) || actualCost < 0) errors.push('Thực chi phải là số lớn hơn hoặc bằng 0.');
  if (!costName) errors.push('Cần nhập tên chi phí.');
  else if (costName.length > 120) errors.push('Tên chi phí không được vượt quá 120 ký tự.');
  if (!taskTitle) errors.push('Cần nhập task vận hành.');
  else if (taskTitle.length < 3) errors.push('Task vận hành cần có ít nhất 3 ký tự.');
  else if (taskTitle.length > 120) errors.push('Task vận hành không được vượt quá 120 ký tự.');
  if (assignee.length > 80) errors.push('Người phụ trách không được vượt quá 80 ký tự.');
  if (dueDate && !isValidDateInput(dueDate)) errors.push('Hạn task phải là ngày hợp lệ.');
  if (dueDate && isPastDateInput(dueDate)) errors.push('Hạn task không được trước ngày hôm nay.');
  return errors;
}

function formatValidationErrors(title: string, errors: string[]) {
  return `${title}: ${errors.join(' ')}`;
}

function normalizeLoadOptions(options: LoadOptions) {
  return {
    emitNotice: options.emitNotice ?? true,
    force: options.force ?? false,
    dashboard: options.dashboard ?? true,
    forms: options.forms ?? true,
    requests: options.requests ?? true,
  };
}

function apiFailureMessage(actionLabel: string, response: Response, data: unknown) {
  const detail = messageOf(data) || response.statusText || `HTTP ${response.status}`;
  return `${actionLabel} thất bại (${response.status}). Chi tiết: ${detail}`;
}

function paymentRequestDraftFromFormData(formData: FormData, selectedFormId: string, requestedByDefault: string): PaymentRequestDraft {
  return {
    formId: text(formData.get('formId')) || selectedFormId,
    costId: text(formData.get('costId')),
    supplierId: text(formData.get('supplierId')),
    amount: text(formData.get('amount')),
    requestedBy: text(formData.get('requestedBy')) || requestedByDefault,
    notes: text(formData.get('notes')),
  };
}

function paymentRequestDraftForForm(form?: OperationForm, requestedBy = 'operations-ui', formId = ''): PaymentRequestDraft {
  const costId = form?.costs?.[0]?.id || '';
  return {
    formId: form?.id || formId,
    costId,
    supplierId: supplierIdForCost(form, costId),
    amount: paymentAmountForCost(form, costId),
    requestedBy,
    notes: '',
  };
}

function paymentRequestDraftErrors(draft: PaymentRequestDraft, selectedForm: OperationForm | undefined, suppliers: Supplier[]) {
  const errors: string[] = [];
  const amount = readAmount(draft.amount);
  const requestedBy = text(draft.requestedBy);
  const notes = text(draft.notes);
  const supplier = suppliers.find((item) => item.id === draft.supplierId);
  const selectedCost = selectedForm?.costs.find((cost) => cost.id === draft.costId);
  const selectedCostService = selectedCost?.serviceId ? selectedForm?.services.find((service) => service.id === selectedCost.serviceId) : undefined;
  const selectedCostSupplierId = supplierIdFromService(selectedCostService);

  if (!draft.formId) errors.push('Cần chọn phiếu điều hành trước khi tạo yêu cầu thanh toán.');
  else if (!selectedForm || selectedForm.id !== draft.formId) errors.push('Phiếu điều hành đã chọn không hợp lệ hoặc chưa được tải.');
  if (selectedForm && selectedForm.costs.length === 0) errors.push('Phiếu điều hành chưa có chi phí để tạo yêu cầu thanh toán.');
  if (!draft.costId) errors.push('Cần chọn chi phí điều hành cần thanh toán.');
  else if (selectedForm && !selectedCost) errors.push('Chi phí được chọn không thuộc phiếu điều hành hiện tại.');
  if (!draft.supplierId) errors.push('Cần chọn nhà cung cấp nhận thanh toán.');
  else if (!supplier) errors.push('Nhà cung cấp không hợp lệ hoặc chưa được tải.');
  else if (selectedCostSupplierId && draft.supplierId !== selectedCostSupplierId) errors.push('Nhà cung cấp không khớp với dịch vụ của khoản chi đã chọn.');
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Số tiền thanh toán phải là số lớn hơn 0.');
  if (!requestedBy) errors.push('Cần xác định người tạo yêu cầu thanh toán.');
  else if (requestedBy.length > 120) errors.push('Người tạo yêu cầu không được vượt quá 120 ký tự.');
  if (notes.length > 300) errors.push('Ghi chú yêu cầu thanh toán không được vượt quá 300 ký tự.');
  return errors;
}


function dashboardStatus(canView: boolean, loaded: boolean, hasData: boolean, loading: boolean, error: string): Notice | null {
  if (!canView) return { type: 'info', text: 'Bạn chưa có quyền xem dashboard vận hành.' };
  if (loading && !loaded && !error) return { type: 'info', text: 'Đang tải số liệu dashboard...' };
  if (error) return { type: 'error', text: loaded ? `Không cập nhật được dashboard vận hành. Đang giữ số liệu gần nhất: ${error}` : `Không tải được dashboard vận hành: ${error}` };
  if (loading && loaded) return { type: 'info', text: 'Đang cập nhật số liệu dashboard...' };
  if (loaded && !hasData) return { type: 'info', text: 'Chưa có số liệu vận hành trong phạm vi hiện tại.' };
  return null;
}

function dashboardMetricValue(value: number, loading: boolean, loaded: boolean, error: string) {
  if (loading && !loaded && !error) return '...';
  if (error && !loaded) return '-';
  return value;
}

function dashboardStateClass(type: Notice['type']) {
  return type === 'error' ? 'operationsDashboardStateError' : 'operationsDashboardStateInfo';
}

function Metric({ label, value, title, muted }: { label: string; value: string | number; title?: string; muted?: boolean }) {
  const displayValue = typeof value === 'number' ? new Intl.NumberFormat('vi-VN').format(value) : value;
  return <article className={`metric${muted ? ' metricMuted' : ''}`} title={title}><span>{label}</span><strong>{displayValue}</strong></article>;
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
  const expected = form.costs.reduce((sum, cost) => sum + numberValue(cost.expectedAmount), 0);
  const actual = form.costs.reduce((sum, cost) => sum + numberValue(cost.actualAmount), 0);
  return { expected, actual, display: actual > 0 ? actual : expected };
}

function costDisplayAmount(cost: { expectedAmount?: string; actualAmount?: string }) {
  const actual = numberValue(cost.actualAmount);
  return actual > 0 ? actual : numberValue(cost.expectedAmount);
}

function defaultPaymentAmount(form?: OperationForm) {
  return form?.costs?.[0] ? costDisplayAmount(form.costs[0]) : 0;
}

function paymentAmountForCost(form?: OperationForm, costId?: string) {
  const cost = form?.costs.find((item) => item.id === costId) || form?.costs?.[0];
  const amount = cost ? costDisplayAmount(cost) : defaultPaymentAmount(form);
  return amount > 0 ? String(amount) : '';
}

function supplierIdFromService(service?: OperationForm['services'][number]) {
  return service?.supplier?.id || service?.supplierId || '';
}

function defaultSupplierId(form?: OperationForm) {
  const service = form?.services?.find((item) => supplierIdFromService(item));
  return supplierIdFromService(service);
}

function supplierIdForCost(form?: OperationForm, costId?: string) {
  const cost = costId ? form?.costs.find((item) => item.id === costId) : form?.costs?.[0];
  const linkedService = cost?.serviceId ? form?.services.find((item) => item.id === cost.serviceId) : undefined;
  return supplierIdFromService(linkedService) || defaultSupplierId(form);
}

function totalRequest(request: PaymentRequest) {
  return request.items.reduce((sum, item) => sum + numberValue(item.amount), 0);
}
function linkedPaymentRequestForForm(form: OperationForm, requests: PaymentRequest[]) {
  return requests.find((request) => request.items.some((item) => item.cost?.operationForm?.id === form.id));
}

function paymentItemSupplierLabel(item: PaymentRequest['items'][number]) {
  if (item.supplier?.name) return item.supplier.name;
  if (item.supplierId) return 'Nhà cung cấp chưa tải tên';
  return 'Chưa gắn nhà cung cấp';
}

function paymentItemCostSummary(item: PaymentRequest['items'][number]) {
  const bookingCode = item.cost?.operationForm?.booking?.code;
  if (item.cost?.costName) return { primary: item.cost.costName, secondary: bookingCode ? `Booking ${bookingCode}` : 'Đã gắn khoản chi điều hành' };
  return { primary: 'Chưa gắn khoản chi', secondary: item.cost ? 'Thiếu tên khoản chi' : 'Không có liên kết chi phí điều hành' };
}

function paymentItemNote(item: PaymentRequest['items'][number]) {
  return text(item.notes) || item.cost?.operationForm?.booking?.code || 'Không có ghi chú';
}

function formOrderTourSummary(form: OperationForm) {
  const orderLabel = form.order?.systemCode || form.order?.tourCode || form.order?.name || '';
  const tourLabel = form.tour?.tourCode || form.tour?.systemCode || form.tour?.name || '';
  if (orderLabel && tourLabel) return { primary: orderLabel, secondary: `Tour ${tourLabel}` };
  if (orderLabel) return { primary: orderLabel, secondary: 'Chưa gắn tour điều hành' };
  if (tourLabel) return { primary: tourLabel, secondary: 'Chưa gắn đơn hàng' };
  return { primary: 'Chưa gắn đơn hàng/tour', secondary: `Booking ${form.booking?.code || form.bookingId}` };
}

function formServiceSummary(form: OperationForm) {
  const first = form.services[0];
  if (!first) return { primary: 'Chưa có dịch vụ', secondary: 'Cần bổ sung dịch vụ nhà cung cấp' };
  const extra = form.services.length > 1 ? ` +${form.services.length - 1} dịch vụ` : '';
  const supplier = first.supplier?.name || 'Chưa gắn nhà cung cấp';
  return { primary: `${first.serviceName || 'Dịch vụ điều hành'}${extra}`, secondary: `${supplier} | ${statusLabel(first.confirmationStatus)}` };
}

function formTaskSummary(form: OperationForm) {
  const first = form.tasks[0];
  if (!first) return { primary: 'Chưa có task', secondary: 'Cần bổ sung công việc điều hành' };
  const extra = form.tasks.length > 1 ? ` +${form.tasks.length - 1} task` : '';
  const due = first.dueDate ? `Hạn ${date(first.dueDate)}` : 'Chưa đặt hạn';
  const assignee = first.assignee ? `Phụ trách ${first.assignee}` : 'Chưa phân công';
  return { primary: `${first.title}${extra}`, secondary: `${due} | ${assignee} | ${statusLabel(first.status)}` };
}

function formCostSummary(form: OperationForm) {
  if (!form.costs.length) return { primary: 'Chưa có chi phí', secondary: 'Cần bổ sung chi phí điều hành' };
  const summary = costSummary(form);
  return { primary: money(summary.display), secondary: `${form.costs.length} dòng | Dự kiến ${money(summary.expected)} | Thực chi ${money(summary.actual)}` };
}

function statusPillClass(value?: string) {
  const key = String(value || '').trim();
  if (['DONE', 'CONFIRMED', 'APPROVED', 'PAID'].includes(key)) return 'statusPillSuccess';
  if (['PROBLEM', 'CANCELLED', 'REJECTED'].includes(key)) return 'statusPillError';
  if (['PENDING', 'IN_PROGRESS', 'REQUESTED', 'WAITING', 'OPERATING'].includes(key)) return 'statusPillWarning';
  return 'statusPillNeutral';
}


function money(value: unknown) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value));
}

function date(value?: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('vi-VN');
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replace(/\s/g, '').replace(/,/g, '');
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function readAmount(value: unknown) {
  const raw = text(value);
  if (!raw) return Number.NaN;
  const amount = Number(raw.replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function todayDateInput() {
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function isPastDateInput(value: string) {
  return isValidDateInput(value) && value < todayDateInput();
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

function userActorLabel(user: { id?: string; username?: string; email?: string; name?: string; fullName?: string; displayName?: string } | null) {
  return text(user?.displayName) || text(user?.fullName) || text(user?.name) || text(user?.username) || text(user?.email) || text(user?.id) || 'operations-ui';
}

function permissionDeniedTitle(permission: string) {
  return `Bạn chưa có quyền ${viPermission(permission).toLowerCase()} (${permission}).`;
}

function noticeClass(type: Notice['type']) {
  if (type === 'success') return 'statusPillSuccess';
  if (type === 'error') return 'statusPillError';
  return 'statusPillNeutral';
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message.replace(/^dashboard vận hành:\s*/i, '') || fallback;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
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

function actionActor(action: 'submit' | 'approve' | 'reject' | 'create-finance-payment') {
  return {
    submit: 'operation-requester',
    approve: 'operation-payment-approver',
    reject: 'operation-payment-approver',
    'create-finance-payment': 'operation-payment-approver',
  }[action];
}
