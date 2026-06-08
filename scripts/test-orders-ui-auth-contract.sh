#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');

const file = 'apps/web/app/orders/[type]/OrdersClient.tsx';
const source = fs.readFileSync(file, 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

assert(source.includes("import { authHeaders, authJsonHeaders } from '../../authFetch';"), 'Orders UI should import auth fetch helpers');

const expectations = [
  {
    label: 'reload list fetch should send auth headers',
    pattern: /fetch\(`\$\{browserApiBase\(\)\}\/api\/orders\/\$\{type\}\$\{suffix\}`,\s*\{\s*cache:\s*'no-store',\s*headers:\s*authHeaders\(\)\s*\}\)/,
  },
  {
    label: 'detail fetch should send auth headers',
    pattern: /fetch\(`\$\{browserApiBase\(\)\}\/api\/orders\/\$\{type\}\/\$\{id\}`,\s*\{\s*cache:\s*'no-store',\s*headers:\s*authHeaders\(\)\s*\}\)/,
  },
  {
    label: 'create/update mutation should send auth json headers',
    pattern: /fetch\(`\$\{browserApiBase\(\)\}\/api\/orders\/\$\{type\}\$\{editingId \? `\/\$\{editingId\}` : ''\}`,\s*\{\s*method:\s*editingId \? 'PUT' : 'POST',\s*headers:\s*authJsonHeaders\(\),\s*body:\s*JSON\.stringify\(payload\)\s*\}\)/,
  },
  {
    label: 'copy/settle mutation should send auth headers',
    pattern: /fetch\(`\$\{browserApiBase\(\)\}\/api\/orders\/\$\{type\}\/\$\{editingId\}\/\$\{path\}`,\s*\{\s*method:\s*'POST',\s*headers:\s*authHeaders\(\)\s*\}\)/,
  },
  {
    label: 'unlock mutation should send auth json headers',
    pattern: /fetch\(`\$\{browserApiBase\(\)\}\/api\/orders\/\$\{type\}\/\$\{editingId\}\/unlock`,\s*\{\s*method:\s*'POST',\s*headers:\s*authJsonHeaders\(\),\s*body:\s*JSON\.stringify\(\{ actor: 'Operator', reason: 'Mở khóa từ màn hình đơn hàng' \}\)\s*\}\)/,
  },
];

for (const expectation of expectations) {
  assert(expectation.pattern.test(source), expectation.label);
}

console.log('TEST_ORDERS_UI_AUTH_CONTRACT_OK');
NODE
