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
if (failures.length) {
  console.error('FAIL_OPERATIONS_CONTROLLER_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_OPERATIONS_CONTROLLER_CONTRACT_OK');
NODE
