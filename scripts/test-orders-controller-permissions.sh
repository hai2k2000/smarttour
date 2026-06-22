#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/modules/orders/orders.controller.ts';
const source = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const expected = {
  list: ['GET', 'order.view'],
  detail: ['GET', 'order.view'],
  create: ['POST', 'order.manage'],
  update: ['PUT', 'order.manage'],
  remove: ['DELETE', 'order.manage'],
  updateStatus: ['PATCH', 'order.status.update'],
  copy: ['POST', 'order.manage'],
  settle: ['POST', 'order.settle'],
  unlock: ['POST', 'order.unlock'],
};

const routes = {};
let decorators = [];
for (const line of source) {
  const trimmed = line.trim();
  if (trimmed.startsWith('@')) {
    decorators.push(trimmed);
    continue;
  }
  const method = trimmed.match(/^(?:async\s+)?([A-Za-z0-9_]+)\s*\(/)?.[1];
  if (!method) {
    if (trimmed && !trimmed.startsWith('//')) decorators = [];
    continue;
  }
  const http = decorators.find((decorator) => /^@(Get|Post|Put|Delete|Patch)\b/.test(decorator))?.match(/^@(Get|Post|Put|Delete|Patch)\b/)?.[1]?.toUpperCase();
  const permissions = decorators
    .filter((decorator) => /^@RequirePermissions\b/.test(decorator))
    .flatMap((decorator) => [...decorator.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] || match[2]));
  if (http) routes[method] = { http, permissions };
  decorators = [];
}

const failures = [];
for (const [method, [http, permission]] of Object.entries(expected)) {
  const route = routes[method];
  if (!route) {
    failures.push(`missing orders endpoint method: ${method}`);
    continue;
  }
  if (route.http !== http) failures.push(`${method} expected ${http}, got ${route.http}`);
  if (route.permissions.length !== 1 || route.permissions[0] !== permission) {
    failures.push(`${method} expected ${permission}, got ${route.permissions.join(',') || '<none>'}`);
  }
}
for (const method of Object.keys(routes)) {
  if (!expected[method] && method !== 'constructor') failures.push(`unexpected orders endpoint without expected permission mapping: ${method}`);
}

if (failures.length) {
  console.error('FAIL_ORDERS_CONTROLLER_PERMISSIONS');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_ORDERS_CONTROLLER_PERMISSIONS_OK');
NODE
