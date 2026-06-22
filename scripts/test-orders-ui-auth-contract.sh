#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'TESTNODE'
const fs = require('fs');

const file = 'apps/web/app/orders/[type]/OrdersClient.tsx';
const source = fs.readFileSync(file, 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

assert(source.includes("import { authHeaders, authJsonHeaders } from '../../authFetch';"), 'Orders UI should import auth fetch helpers');

assert(source.includes("import { usePermissions } from '../../usePermissions';"), 'Orders UI should read permissions for sensitive action rendering.');
assert(source.includes('const { can } = usePermissions();'), 'Orders UI should use permission helper.');
assert(source.includes("const canChangeStatus = can('order.status.update');"), 'Orders UI status changes should require order.status.update.');
assert(source.includes("can('order.settle')"), 'Orders UI settlement action should require order.settle.');
assert(source.includes("can('order.unlock')"), 'Orders UI unlock action should require order.unlock.');
assert(source.includes('disabled={Boolean(editingId) && !canChangeStatus}'), 'Orders UI should disable status select for users without status action permission while editing.');

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

console.log('TEST_ORDERS_UI_AUTH_CONTRACT_OK');
TESTNODE
