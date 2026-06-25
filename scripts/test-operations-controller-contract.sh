#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"
docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');
const controller = fs.readFileSync('apps/api/src/modules/operations/operations.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/operations/operations.service.ts', 'utf8');
const dto = fs.readFileSync('apps/api/src/modules/operations/dto/list-operations-query.dto.ts', 'utf8');
const client = fs.readFileSync('apps/web/app/operations/OperationsClient.tsx', 'utf8');
const authFetch = fs.readFileSync('apps/web/app/authFetch.ts', 'utf8');
const usePermissions = fs.readFileSync('apps/web/app/usePermissions.tsx', 'utf8');
const appShell = fs.readFileSync('apps/web/app/AppShell.tsx', 'utf8');
const suppliersService = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.service.ts', 'utf8');
const failures = [];
const requiredPermissions = [
  ["dashboard", "operation.form.view"],
  ["modules", "operation.form.view"],
  ["forms", "operation.form.view"],
  ["createForm", "operation.form.manage"],
  ["form", "operation.form.view"],
  ["updateForm", "operation.form.manage"],
  ["updateFormStatus", "operation.form.manage"],
  ["cancelFormLegacy", "operation.form.manage"],
  ["paymentRequests", "operation.payment-request.view"],
  ["createPaymentRequest", "operation.payment-request.create"],
  ["paymentRequest", "operation.payment-request.view"],
  ["updatePaymentRequest", "operation.payment-request.manage"],
  ["deletePaymentRequest", "operation.payment-request.manage"],
  ["submitPaymentRequest", "operation.payment-request.manage"],
  ["approvePaymentRequest", "operation.payment-request.approve"],
  ["rejectPaymentRequest", "operation.payment-request.approve"],
];
for (const [method, permission] of requiredPermissions) {
  const methodIndex = controller.indexOf(`${method}(`);
  const permissionIndex = controller.lastIndexOf(`@RequirePermissions('${permission}')`, methodIndex);
  if (methodIndex === -1 || permissionIndex === -1 || methodIndex - permissionIndex > 240) failures.push(`missing permission ${permission} for ${method}`);
}
if (!controller.includes("@RequirePermissions('operation.payment-request.approve', 'finance.payment.create')")) failures.push('create-finance-payment must require operation approval plus finance payment create');
if (!controller.includes('forms(@Query() query: ListOperationFormsQueryDto') || !controller.includes('paymentRequests(@Query() query: ListSupplierPaymentRequestsQueryDto')) failures.push('operations list endpoints must use focused query DTOs');
if (!dto.includes('IsEnum(OperationStatus') || !dto.includes('IsEnum(SupplierPaymentStatus') || !dto.includes('OPERATIONS_LIST_MAX_TAKE = 500')) failures.push('operations query DTO must validate status and take');
if (!dto.includes('replace(/\\s+/g') || !dto.includes('toUpperCase()')) failures.push('operations query DTO must trim search and normalize enum values');
if (!controller.includes("@Post('forms/:id/cancel')") || !controller.includes('route ch\\u00ednh th\\u1ee9c') && !controller.includes('route ch?nh th?c') || !controller.includes('cancelForm(@Param')) failures.push('POST cancel route must be documented as official');
if (!controller.includes("@Delete('forms/:id')") || !controller.includes('deprecated: true') || !controller.includes('cancelFormLegacy')) failures.push('DELETE cancel route must be a deprecated legacy alias');
if (controller.lastIndexOf("@RequirePermissions('operation.form.manage')", controller.indexOf('cancelForm(@Param')) === -1) failures.push('POST cancel route must require operation.form.manage');
if (!controller.includes("@Post('forms/:id/status')") || !controller.includes('updateFormStatus(@Param')) failures.push('operation form status changes must use a dedicated action route');
if (!service.includes('async changeFormStatus(') || !service.includes('Operation form status must be changed through') && !service.includes('action endpoint')) failures.push('operation form status changes must be blocked in normal update and routed through action service');
if (!client.includes("/api/operations/forms/${id}/cancel") || !client.includes("/api/operations/supplier-payment-requests/${id}/${action}")) failures.push('OperationsClient endpoint contract changed unexpectedly');
for (const english of [
  'At least one supplier payment item is required',
  'Cannot create finance payment',
  'Cannot submit payment request',
  'Only draft or rejected requests can be edited',
  'Only draft or rejected requests can be deleted',
  'Payment amount must be greater than zero',
  'Use supplier payment request action endpoints',
  'Invalid operation status',
  'Invalid supplier payment status',
  'Tour not found',
  'Yeu cau thanh toan',
  'Nhieu nha cung cap',
  'serviceType is required',
  'task title is required',
  'supplierId is required',
  'costId is required for scoped supplier payment requests',
  'User data scope',
  'scoped writes',
  'Cần có branch',
  'Cần có department',
  'Cần nhập tiêu đề task',
  'Hạn task',
  'Cần ít nhất một service',
  'endpoint hành động',
  'does not belong to',
]) {
  if (service.includes(english)) failures.push(`English service error remains: ${english}`);
}
if (!service.includes('OPERATIONS_LIST_MAX_TAKE') || !service.includes('private take(value?: unknown)')) failures.push('OperationsService must honor DTO take cap');
if (!service.includes('OPERATIONS_LIST_CHILD_TAKE = 20')) failures.push('OperationsService list endpoints must cap nested child summaries');
if (!service.includes('type OperationDashboard') || !service.includes('type OperationModuleCard')) failures.push('Operations dashboard/modules must have explicit response contracts');
if (!service.includes('startOfDay(now)') || !service.includes('endOfDay(this.addDays(today, 14))')) failures.push('Dashboard departure window must use full-day bounds');
if (!service.includes('BookingStatus.CONFIRMED') || !service.includes('BookingStatus.OPERATING') || !service.includes('upcomingStandaloneBookings')) failures.push('Dashboard must include standalone confirmed/operating bookings in upcoming departures');
if (!service.includes('OrderStatus.RUNNING, tours: { none: {} }') || !service.includes('runningLegacyOrders')) failures.push('Dashboard must include running legacy orders without common tours');
if (!service.includes('activeOperationFormScope(user)') || !service.includes("confirmationStatus: { in: ['WAITING', 'REQUESTED'] }")) failures.push('Dashboard must scope active operation forms for task and supplier confirmation counts');
const modulesStart = service.indexOf('getModules(): OperationModuleCard[]');
const modulesEnd = service.indexOf('async listForms', modulesStart);
const modulesBlock = modulesStart === -1 || modulesEnd === -1 ? '' : service.slice(modulesStart, modulesEnd);
for (const key of ['suppliers', 'tour-programs', 'bookings', 'operation-forms', 'supplier-payment-requests', 'operation-vouchers', 'profit-loss-reports']) {
  if (!modulesBlock.includes("key: '" + key + "'")) failures.push('Operations modules missing key: ' + key);
}
for (const childOnly of ['operation-services', 'operation-costs']) {
  if (modulesBlock.includes("key: '" + childOnly + "'")) failures.push('Child operation data should not be exposed as standalone module: ' + childOnly);
}
if (!modulesBlock.includes('permission:') || !modulesBlock.includes('metrics:') || !modulesBlock.includes('route:')) failures.push('Operations modules must expose route, permission, and metric metadata');
const listFormsStart = service.indexOf('async listForms');
const listFormsEnd = service.indexOf('async formDetail', listFormsStart);
const listFormsBlock = listFormsStart === -1 || listFormsEnd === -1 ? '' : service.slice(listFormsStart, listFormsEnd);
const paymentRequestsStart = service.indexOf('async listPaymentRequests');
const paymentRequestsEnd = service.indexOf('async paymentRequestDetail', paymentRequestsStart);
const paymentRequestsBlock = paymentRequestsStart === -1 || paymentRequestsEnd === -1 ? '' : service.slice(paymentRequestsStart, paymentRequestsEnd);
const formListSelectStart = service.indexOf('private formListSelect()');
const formListSelectEnd = service.indexOf('private formDetailInclude()', formListSelectStart);
const formListSelectBlock = formListSelectStart === -1 || formListSelectEnd === -1 ? '' : service.slice(formListSelectStart, formListSelectEnd);
const paymentListSelectStart = service.indexOf('private paymentRequestListSelect()');
const paymentListSelectEnd = service.indexOf('private paymentRequestDetailInclude()', paymentListSelectStart);
const paymentListSelectBlock = paymentListSelectStart === -1 || paymentListSelectEnd === -1 ? '' : service.slice(paymentListSelectStart, paymentListSelectEnd);
for (const token of ['customerPhone', 'booking: {', 'order: {', 'tour: {', '{ notes: contains }']) {
  if (!listFormsBlock.includes(token)) failures.push('listForms search/scope missing token: ' + token);
}
for (const token of ['financePayment: { voucherCode: contains }', 'supplier: { supplierCode: contains }', 'supplier: { name: contains }', 'costName: contains', 'operationForm: { booking: { code: contains }', 'operationForm: { order: { systemCode: contains }', 'operationForm: { tour: { tourCode: contains }']) {
  if (!paymentRequestsBlock.includes(token)) failures.push('payment request search missing token: ' + token);
}
for (const token of ['_count: { select: { services: true, tasks: true, costs: true } }', 'take: OPERATIONS_LIST_CHILD_TAKE', 'select:', 'orderBy:']) {
  if (!formListSelectBlock.includes(token)) failures.push('form list select must stay summary-oriented with bounded children: ' + token);
}
if (formListSelectBlock.includes('include:')) failures.push('form list select must not use full include payloads');
for (const token of ['_count: { select: { items: true } }', 'take: OPERATIONS_LIST_CHILD_TAKE', 'select:', 'orderBy:']) {
  if (!paymentListSelectBlock.includes(token)) failures.push('payment request list select must stay summary-oriented with bounded children: ' + token);
}
if (paymentListSelectBlock.includes('include:')) failures.push('payment request list select must not use full include payloads');
if (service.includes('Phi?u')) failures.push('OperationsService contains mojibake Vietnamese text');
if (!service.includes('request.status === SupplierPaymentStatus.PAID')) failures.push('approvePaymentRequest must block already paid requests explicitly');
if (!service.includes('if (request.financePaymentId) return tx.supplierPaymentRequest.findUniqueOrThrow')) failures.push('createFinancePaymentForRequest must return existing linked payment request detail');
if (!service.includes('nextAvailablePaymentRequestCode') || !service.includes('Kh\\u00f4ng th\\u1ec3 sinh m\\u00e3 y\\u00eau c\\u1ea7u thanh to\\u00e1n duy nh\\u1ea5t')) failures.push('payment request code generator must skip existing request codes');
if (!service.includes('operationConfirmationStatus(value: unknown)') || !service.includes('OPERATION_CONFIRMATION_STATUSES.has(text)')) failures.push('form service confirmation status must be normalized and validated');
if (!service.includes('financePaymentMethod(value: unknown)') || !service.includes('FinancePaymentMethod.BANK_TRANSFER')) failures.push('finance payment method must be normalized and validated');
if (!service.includes('Number.isNaN(date.getTime())')) failures.push('date helper must reject invalid provided dates');
if (!service.includes("await this.audit(tx, 'CANCEL', 'OperationForm', id, { actor, reason, payload: this.auditPayload(dto) }, user)")) failures.push('cancelForm audit must include request user actor and reason');
if (service.includes("await this.audit(tx, status, 'SupplierPaymentRequest'")) failures.push('payment request status changes must use verb audit actions');
if (!service.includes("status === SupplierPaymentStatus.REQUESTED ? 'SUBMIT' : 'REJECT'")) failures.push('payment request submit/reject audit actions must be SUBMIT/REJECT');
if (!service.includes('private auditMetadata(metadata: unknown)') || !service.includes('private toAuditJson(value: unknown)')) failures.push('operations audit metadata must be normalized before storing JSON');
if (!suppliersService.includes('private supplierListInclude()') || !suppliersService.includes('supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY }')) failures.push('generic supplier list must include supplierServices for OperationsClient');
if (!suppliersService.includes('const SUPPLIER_SERVICE_ORDER_BY = [') || !suppliersService.includes("{ createdAt: 'asc' }") || !suppliersService.includes("{ sku: 'asc' }") || !suppliersService.includes("{ id: 'asc' }")) failures.push('generic supplier services must keep deterministic createdAt/sku/id ordering');
if (!client.includes("fetchJson<unknown>('/api/suppliers?take=100', 'danh sách nhà cung cấp')") || client.includes("fetchJson<unknown>('/api/suppliers', 'danh sách nhà cung cấp')") || client.includes('/api/suppliers/hotels')) failures.push('OperationsClient must load the generic supplier source with an explicit bounded take, not hotel-only suppliers');
for (const copy of ['Vận hành tour và thanh toán nhà cung cấp', 'Công việc quá hạn', 'Nhà cung cấp chờ xác nhận', 'Yêu cầu thanh toán nhà cung cấp', 'Tour lỗ hoặc âm lợi nhuận']) {
  if (!client.includes(copy)) failures.push('OperationsClient missing normalized Vietnamese copy: ' + copy);
}
if (client.includes('NCC')) failures.push('OperationsClient should not expose NCC abbreviation in visible copy');
if (!client.includes("window.prompt('Nhập lý do hủy phiếu điều hành:'") || !client.includes("Cần nhập lý do hủy phiếu điều hành.")) failures.push('cancelForm must ask for a visible cancellation reason');
if (!client.includes('actionActor(action)') || !client.includes("operation-payment-approver")) failures.push('payment request actions must send explicit UI actors');
if (!client.includes('function numberValue(value: unknown)') || !client.includes('money(value: unknown)') || client.includes('Number(request.financePayment.paymentAmount)')) failures.push('OperationsClient money helpers must parse numbers safely');
if (!client.includes('Cần chọn phiếu điều hành trước khi tạo yêu cầu thanh toán.') || !client.includes('Cần chọn chi phí điều hành cần thanh toán.')) failures.push('payment request modal must validate selected form and cost clearly');
if (!client.includes('operation-payment-validation') || !client.includes('paymentRequestDraftErrors') || !client.includes('Phiếu điều hành đã chọn không hợp lệ hoặc chưa được tải.') || !client.includes('Số tiền thanh toán phải là số lớn hơn 0.') || !client.includes('Cần xác định người tạo yêu cầu thanh toán.') || !client.includes('Nhà cung cấp không khớp với dịch vụ của khoản chi đã chọn.')) failures.push('payment request modal must block ambiguous supplier payments with detailed Vietnamese validation');
if (!client.includes('requestedByDefault={paymentRequestActor}') || !client.includes('function userActorLabel') || !client.includes('Người tạo yêu cầu')) failures.push('payment request modal must default requestedBy from the current user context');
if (!client.includes("const canCreateFinancePayment = can('finance.payment.create')") || !client.includes('canCreateFinanceForRequest') || !client.includes("request.status === 'REQUESTED'") || !client.includes('reconciliation-reject')) failures.push('payment request actions must disable by workflow status and finance create permission');
if (!client.includes('Phiếu chi tài chính') || !client.includes('Trạng thái yêu cầu') || client.includes('Không gắn chi phi')) failures.push('payment request table and reconciliation copy must use clear Vietnamese labels');
if (!client.includes('operation-reconciliation-close') || !client.includes('operation-reconciliation-loading') || !client.includes('operation-reconciliation-missing') || !client.includes('openReconciliation(request.id)')) failures.push('reconciliation detail must open, close, and avoid stale missing/loading states');
if (!client.includes('Bước 1: Yêu cầu thanh toán') || !client.includes('Bước 2: Phiếu chi tài chính') || !client.includes('Bước 3: Hoàn tất đối soát')) failures.push('reconciliation timeline must use natural Vietnamese three-step labels');
if (!client.includes('reconciliationItemTable') || !client.includes('Chưa gắn nhà cung cấp') || !client.includes('Chưa gắn khoản chi') || !client.includes('Không có ghi chú')) failures.push('reconciliation detail table must explain missing supplier, cost, and notes clearly');
if (!client.includes('operationsFilterConfig') || !client.includes('Mã booking, mã đơn hàng, mã tour, tên khách hoặc ghi chú') || !client.includes('Mã yêu cầu thanh toán, nhà cung cấp, chi phí hoặc booking liên quan') || !client.includes('Trạng thái phiếu điều hành') || !client.includes('Trạng thái yêu cầu thanh toán')) failures.push('OperationsClient filters must use tab-specific Vietnamese search and status copy');
if (!client.includes('operation-form-validation') || !client.includes('operationFormDraftErrors') || !client.includes('Dự kiến chi phải là số lớn hơn 0.') || !client.includes('Hạn task không được trước ngày hôm nay.')) failures.push('operation form modal must expose detailed validation before submit');
if (!client.includes('operation-form-open-reconciliation') || !client.includes('linkedPaymentRequestForForm') || !client.includes('Mở đối soát thanh toán')) failures.push('operation form rows must expose reconciliation action');
if (!client.includes('window.confirm') || !client.includes('Xác nhận hủy phiếu điều hành')) failures.push('operation form cancellation must confirm before posting cancel');
if (!client.includes("params.set('take', '100')")) failures.push('OperationsClient list queries must request explicit take=100');
if (!client.includes('function confirmPaymentRequestAction') || !client.includes('confirmPaymentRequestAction(action, label)')) failures.push('payment request workflow actions must confirm before posting');
if (!client.includes('function confirmFinancePaymentApproval') || !client.includes('confirmFinancePaymentApproval()')) failures.push('finance payment approval from operations must confirm before posting');
if (!client.includes('formOrderTourSummary') || !client.includes('formServiceSummary') || !client.includes('formTaskSummary') || !client.includes('statusPillClass')) failures.push('operation form list rows must render clear summaries and status tones');
if (!client.includes('operationFormStatusValues') || !client.includes('supplierPaymentStatusValues')) failures.push('OperationsClient status filters must be split by forms and payment requests');
if (!client.includes('supplierIdForCost') || !client.includes('supplierIdFromService') || !client.includes('serviceId?: string | null')) failures.push('OperationsClient must derive supplier from the selected operation cost service link');
if (!formListSelectBlock.includes('serviceId: true')) failures.push('form list cost summaries must expose serviceId for supplier/payment mapping');
if (!client.includes('operations-dashboard-state') || !client.includes('Đang tải số liệu dashboard') || !client.includes('Không tải được dashboard vận hành') || !client.includes('Chưa có số liệu vận hành trong phạm vi hiện tại.')) failures.push('OperationsClient dashboard metrics must expose loading, error, and empty states');
if (!client.includes('dashboardMetricDefinitions') || !client.includes('Order sắp khởi hành trong 14 ngày tới') || !client.includes('Yêu cầu thanh toán đang chờ duyệt hoặc đã duyệt')) failures.push('OperationsClient dashboard metrics must document backend counting logic');
if (!client.includes('response.status') || !client.includes('authJsonHeaders') || !authFetch.includes("Accept: 'application/json'")) failures.push('OperationsClient fetch helpers must expose detailed errors and shared JSON accept headers');
if (!client.includes('staticLoadInFlight') || !client.includes('listLoadInFlight') || !client.includes('staticLoadSeq') || !client.includes('listLoadSeq') || !client.includes('normalizeLoadOptions')) failures.push('OperationsClient data loading must guard duplicate and stale requests');
if (!client.includes('load({ ...reloadAfter, emitNotice: false })') || !client.includes('requests: false') || !client.includes('forms: false')) failures.push('OperationsClient mutations must reload only affected operation data scopes');
if (!client.includes('setBookings([])') || !client.includes('setSuppliers([])') || !client.includes('setRequests([])') || !client.includes("setCreateFormSupplierId('')")) failures.push('OperationsClient must reset static/list state when APIs return empty, fail, or selected supplier becomes invalid');
if (!client.includes('function openCreateModal()') || !client.includes('onClick={openCreateModal}') || !client.includes("setCreateFormSupplierId('')")) failures.push('OperationsClient create modal must reset supplier state before opening or switching tabs');
if (!client.includes('const { can, user, permissionsReady } = usePermissions()')) failures.push('OperationsClient must wait for permission readiness before calculating access.');
if (!client.includes('const canViewOperations = canViewForms || canViewPayments')) failures.push('OperationsClient must centralize operation view access.');
if (!client.includes('if (!permissionsReady) return;\n    void loadStatic();')) failures.push('OperationsClient static load effect must wait for permission readiness.');
if (!client.includes('if (!permissionsReady) return;\n    void load();')) failures.push('OperationsClient list load effect must wait for permission readiness.');
if (!client.includes('if (!permissionsReady || (!canCreateForm && !canCreatePaymentRequest))')) failures.push('OperationsClient static loader must fail closed until permissions are ready.');
if (!client.includes('if (!permissionsReady || !canViewOperations)')) failures.push('OperationsClient list/reload path must fail closed without view access.');
if (!client.includes('PermissionNotice allowed={!permissionsReady || canViewOperations}')) failures.push('OperationsClient must avoid permission-denied flash while permissions load.');
if (!client.includes('{canViewOperations ? (')) failures.push('OperationsClient must hide protected filters/lists/modals without operation view access.');
if (!client.includes('disabled={!permissionsReady || !canViewActiveTab || !canCreateActiveTab}')) failures.push('OperationsClient create action must stay disabled until permissions are ready.');
if (!client.includes('permissionDeniedTitle') || !client.includes('missingOperationsViewPermissions') || !client.includes('missingPermissions={missingOperationsViewPermissions}') || !client.includes('canCreate={canCreateForm}')) failures.push('OperationsClient permissions must use explicit permission labels and shared manage/create booleans');
if (!client.includes('permissionDeniedTitle(operationTabs.forms.createPermission)')) failures.push('OperationsClient form manage buttons must explain missing operation.form.manage');
if (!client.includes('permissionDeniedTitle(operationTabs.payments.createPermission)') || !client.includes("permissionDeniedTitle('operation.payment-request.manage')")) failures.push('OperationsClient payment update/delete/submit buttons must explain missing operation.payment-request.manage');
if (!client.includes("permissionDeniedTitle('operation.payment-request.approve')")) failures.push('OperationsClient approve/reject/create-finance buttons must explain missing operation.payment-request.approve');
if (!client.includes("permissionDeniedTitle('finance.payment.approve')")) failures.push('OperationsClient finance approve buttons must explain missing finance.payment.approve');
if (!client.includes('authJsonHeaders') || !client.includes('return authJsonHeaders()')) failures.push('OperationsClient must use shared auth JSON headers instead of reading token directly');
if (!usePermissions.includes('missingPermissions') || !usePermissions.includes('viPermission(permission)') || !usePermissions.includes('Quyền cần bổ sung')) failures.push('PermissionNotice must show exact missing permissions in Vietnamese');
if (!authFetch.includes('export function authFetch') || !authFetch.includes("credentials: 'include'") || !authFetch.includes("Accept: 'application/json'") || authFetch.includes('authCookieToken') || authFetch.includes('window.localStorage.getItem')) failures.push('authFetch must use cookie credentials and must not read browser session tokens');
if (!appShell.includes('clearAuthSession()') || !appShell.includes('/api/auth/logout') || !appShell.includes("credentials: 'include'") || appShell.includes('Authorization:')) failures.push('AppShell logout must clear local UI cache and revoke cookie session without Bearer headers');
if (failures.length) {
  console.error('FAIL_OPERATIONS_CONTROLLER_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_OPERATIONS_CONTROLLER_CONTRACT_OK');
NODE
