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
const suppliersService = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.service.ts', 'utf8');
const failures = [];
const requiredPermissions = [
  ["dashboard", "operation.form.view"],
  ["modules", "operation.form.view"],
  ["forms", "operation.form.view"],
  ["createForm", "operation.form.manage"],
  ["form", "operation.form.view"],
  ["updateForm", "operation.form.manage"],
  ["cancelFormLegacy", "operation.form.manage"],
  ["paymentRequests", "operation.payment-request.view"],
  ["createPaymentRequest", "operation.payment-request.create"],
  ["paymentRequest", "operation.payment-request.view"],
  ["updatePaymentRequest", "operation.payment-request.create"],
  ["deletePaymentRequest", "operation.payment-request.create"],
  ["submitPaymentRequest", "operation.payment-request.create"],
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
if (!client.includes("/api/operations/forms/${id}/cancel") || !client.includes("/api/operations/supplier-payment-requests/${id}/${action}")) failures.push('OperationsClient endpoint contract changed unexpectedly');
for (const english of ['Cannot create finance payment', 'Cannot submit payment request', 'Use supplier payment request action endpoints', 'Invalid operation status', 'Invalid supplier payment status', 'does not belong to']) {
  if (service.includes(english)) failures.push(`English service error remains: ${english}`);
}
if (!service.includes('OPERATIONS_LIST_MAX_TAKE') || !service.includes('private take(value?: unknown)')) failures.push('OperationsService must honor DTO take cap');
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
for (const token of ['customerPhone', 'booking: {', 'order: {', 'tour: {', '{ notes: contains }']) {
  if (!listFormsBlock.includes(token)) failures.push('listForms search/scope missing token: ' + token);
}
if (service.includes('Phi?u')) failures.push('OperationsService contains mojibake Vietnamese text');
if (!service.includes('request.status === SupplierPaymentStatus.PAID')) failures.push('approvePaymentRequest must block already paid requests explicitly');
if (!service.includes('if (request.financePaymentId) return tx.supplierPaymentRequest.findUniqueOrThrow')) failures.push('createFinancePaymentForRequest must return existing linked payment request detail');
if (!service.includes('operationConfirmationStatus(value: unknown)') || !service.includes('OPERATION_CONFIRMATION_STATUSES.has(text)')) failures.push('form service confirmation status must be normalized and validated');
if (!service.includes('financePaymentMethod(value: unknown)') || !service.includes('FinancePaymentMethod.BANK_TRANSFER')) failures.push('finance payment method must be normalized and validated');
if (!service.includes('Number.isNaN(date.getTime())')) failures.push('date helper must reject invalid provided dates');
if (!service.includes("await this.audit(tx, 'CANCEL', 'OperationForm', id, { actor, reason, payload: dto })")) failures.push('cancelForm audit must include actor and reason');
if (!suppliersService.includes("include: { category: true, supplierServices")) failures.push('generic supplier list must include supplierServices for OperationsClient');
if (!client.includes("fetchJson<unknown>('/api/suppliers', 'danh sách nhà cung cấp')") || client.includes('/api/suppliers/hotels')) failures.push('OperationsClient must load the generic supplier source, not hotel-only suppliers');
for (const copy of ['Vận hành tour và thanh toán nhà cung cấp', 'Công việc quá hạn', 'Nhà cung cấp chờ xác nhận', 'Yêu cầu thanh toán nhà cung cấp', 'Tour lỗ hoặc âm lợi nhuận']) {
  if (!client.includes(copy)) failures.push('OperationsClient missing normalized Vietnamese copy: ' + copy);
}
if (client.includes('NCC')) failures.push('OperationsClient should not expose NCC abbreviation in visible copy');
if (!client.includes("window.prompt('Nhập lý do hủy phiếu điều hành:'") || !client.includes("Cần nhập lý do hủy phiếu điều hành.")) failures.push('cancelForm must ask for a visible cancellation reason');
if (!client.includes('actionActor(action)') || !client.includes("operation-payment-approver")) failures.push('payment request actions must send explicit UI actors');
if (!client.includes('function numberValue(value: unknown)') || !client.includes('money(value: unknown)') || client.includes('Number(request.financePayment.paymentAmount)')) failures.push('OperationsClient money helpers must parse numbers safely');
if (!client.includes('Cần chọn phiếu điều hành trước khi tạo yêu cầu thanh toán.') || !client.includes('Cần chọn chi phí điều hành cần thanh toán.')) failures.push('payment request modal must validate selected form and cost clearly');
if (!client.includes('response.status') || !client.includes('Accept:')) failures.push('OperationsClient fetch helpers must expose detailed errors and JSON accept headers');
if (failures.length) {
  console.error('FAIL_OPERATIONS_CONTROLLER_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_OPERATIONS_CONTROLLER_CONTRACT_OK');
NODE
