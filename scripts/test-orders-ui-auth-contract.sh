#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'TESTNODE'
const fs = require('fs');

const file = 'apps/web/app/orders/[type]/OrdersClient.tsx';
const source = fs.readFileSync(file, 'utf8');
const controller = fs.readFileSync('apps/api/src/modules/orders/orders.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/orders/orders.service.ts', 'utf8');
const dto = fs.readFileSync('apps/api/src/modules/orders/dto/order.dto.ts', 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

assert(source.includes("import { authFetch, authHeaders, authJsonHeaders } from '../../authFetch';"), 'Orders UI should import auth fetch helpers');

assert(source.includes("import { PermissionNotice, usePermissions } from '../../usePermissions';"), 'Orders UI should read permissions for sensitive action rendering.');
assert(source.includes('const { can, permissionsReady } = usePermissions();'), 'Orders UI should use permission helper and wait for readiness.');
assert(source.includes("const canChangeStatus = can('order.status.update');"), 'Orders UI status changes should require order.status.update.');
assert(source.includes("can('order.settle')"), 'Orders UI settlement action should require order.settle.');
assert(source.includes("can('order.unlock')"), 'Orders UI unlock action should require order.unlock.');
assert(source.includes('disabled={Boolean(editingId) && !canChangeStatus}'), 'Orders UI should disable status select for users without status action permission while editing.');

assert(source.includes('function confirmSensitiveOrderAction'), 'Orders UI should define confirmation helper for irreversible order actions.');
assert(source.includes("confirmSensitiveOrderAction(path)"), 'Orders settle action should confirm before POST.');
assert(source.includes("confirmSensitiveOrderAction('unlock')"), 'Orders unlock action should confirm before POST.');
for (const [token, label] of [
  ["headers: authHeaders()", 'read/copy/settle requests should send auth headers'],
  ["headers: authJsonHeaders()", 'json mutations should send auth json headers'],
  ["method: editingId ? 'PUT' : 'POST'", 'create/update mutation should keep correct HTTP methods'],
  ["body: JSON.stringify(editingId ? stripLifecycleStatusForUpdate(payload) : payload)", 'normal update should strip lifecycle status from PUT payload'],
  ["function stripLifecycleStatusForUpdate(payload: Record<string, unknown>)", 'Orders UI must define update payload sanitizer'],
  ["delete copy.status;", 'Orders UI update sanitizer must delete root status before PUT'],
  ["const requestedStatus = String(data.status || '');", 'Orders UI submit should capture requested lifecycle status separately'],
  ["await updateOrderStatus(requestedStatus);", 'Orders UI must call lifecycle status action when status changes'],
  ["/status`", 'Orders UI must call the dedicated order status endpoint'],
  ["method: 'PATCH'", 'Orders UI status action should use PATCH'],
  ["body: JSON.stringify({ status })", 'Orders UI status action should submit status body'],  ["actor: 'Operator'", 'unlock mutation should keep actor body'],
  ["reason:", 'unlock mutation should keep reason body'],
]) {
  assert(source.includes(token), label);
}

assert(!source.includes('body: JSON.stringify(payload) }),'), 'Orders UI must not send raw payload in normal create/update mutation.');

for (const [token, label] of [
  ["quantity: z.coerce.number().min(0", 'sales quantity should reject negative values before API submission'],
  ["serviceCount: z.coerce.number().min(0", 'sales service count should reject negative values before API submission'],
  ["unitPrice: z.coerce.number().min(0", 'sales unit price should reject negative values before API submission'],
  ["netPrice: z.coerce.number().min(0", 'operation net price should reject negative values before API submission'],
  ["dayNo: z.coerce.number().min(1", 'itinerary day number should match backend minimum'],
  ["adultQty: z.coerce.number().min(0", 'adult quantity should reject negative values before API submission'],
  ["paidAmount: z.coerce.number().min(0", 'paid amount should reject negative values before API submission'],
  ["paidCost: z.coerce.number().min(0", 'paid cost should reject negative values before API submission'],
  ["function numberInputProps(name: ArrayName, fieldKey: string)", 'dynamic numeric inputs should centralize backend min constraints'],
  ["if (fieldKey === 'dayNo') return { min: 1, step: 1 };", 'day number input should expose min 1'],
  ["if (type === 'number') return <input type=\"number\" {...numberInputProps(name, fieldKey)}", 'dynamic numeric inputs should expose min values'],
  ["<input type=\"number\" min={0} {...register('adultQty')}", 'root numeric passenger inputs should expose non-negative minimums'],
  ["<input type=\"number\" min={0} {...register('paidAmount')}", 'root paid amount input should expose non-negative minimum'],
]) {
  assert(source.includes(token), label);
}


const page = fs.readFileSync('apps/web/app/orders/[type]/page.tsx', 'utf8');
function pageIncludes(token, label) {
  assert(page.includes(token), label);
}

pageIncludes("import { ServerPermissionNotice, hasPermission, type PermissionUser } from '../../serverPermissions';", 'Orders page should use server permission helpers.');
pageIncludes("apiGet<PermissionUser | null>(", 'Orders page should read current session permissions before loading order data.');
pageIncludes("'/auth/me'", 'Orders page should call auth session endpoint.');
pageIncludes("const canViewOrders = hasPermission(currentUser, 'order.view') || hasPermission(currentUser, 'order.manage');", 'Orders page should calculate order view/manage access.');
pageIncludes('canViewOrders ? await apiGet', 'Orders page should not preload orders without order access.');
pageIncludes('`/orders/${type}?take=100`', 'Orders page should bound the SSR order list payload.');
pageIncludes('<ServerPermissionNotice allowed={canViewOrders}', 'Orders page should show server permission notice when access is missing.');
pageIncludes('{canViewOrders ? (', 'Orders page should hide orders client content without access.');

assert(source.includes("import { PermissionNotice, usePermissions } from '../../usePermissions';"), 'Orders UI should import PermissionNotice and permissions hook.');
assert(source.includes('const { can, permissionsReady } = usePermissions();'), 'Orders UI should wait for permission readiness.');
assert(source.includes("const canViewOrders = can('order.view') || can('order.manage');"), 'Orders UI should derive order view/manage access.');
assert(source.includes("const canManageOrders = can('order.manage');"), 'Orders UI should derive order.manage access.');
assert(source.includes('if (!permissionsReady || !canViewOrders) {'), 'Orders UI reload/load handlers should fail closed before API calls without view access.');
assert(source.includes('setOrders([]);'), 'Orders UI should clear server-provided rows when view access is missing.');
assert(source.includes('if (!canManageOrders) {'), 'Orders UI create/save/copy handlers should fail closed without order.manage.');
assert(source.includes('PermissionNotice allowed={!permissionsReady || canViewOrders}'), 'Orders UI should avoid permission flash while permissions load.');
assert(source.includes('{canViewOrders ? ('), 'Orders UI should hide list/form content without view access.');
assert(source.includes('disabled={!canViewOrders}'), 'Orders UI edit buttons should be disabled without view access.');
assert(source.includes('disabled={!canManageOrders} onClick={openCreate}'), 'Orders UI create button should be disabled without order.manage.');
assert(source.includes('disabled={!canUseOrderAction || !canManageOrders} onClick={() => action(\'copy\')}'), 'Orders UI copy action should be disabled without order.manage.');
assert(source.includes("params.set('take', '100');"), 'Orders UI reload should request a bounded order list.');

assert(dto.includes('class ListOrdersQueryDto'), 'Orders list query DTO must exist.');
assert(dto.includes('take?: number'), 'Orders list query DTO must accept bounded take.');
assert(dto.includes('MAX_ORDERS_TAKE'), 'Orders list query DTO must cap take.');
assert(controller.includes('list(@Param(\'type\') type: string, @Query() query: ListOrdersQueryDto'), 'Orders list route must use the validated list query DTO.');
assert(service.includes('take: this.listTake(query.take)'), 'Orders list service must apply bounded take.');

console.log('TEST_ORDERS_UI_AUTH_CONTRACT_OK');
TESTNODE
