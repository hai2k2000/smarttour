#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');

const file = 'apps/api/src/modules/bookings/bookings.controller.ts';
const sourceText = fs.readFileSync(file, 'utf8');
const source = sourceText.split(/\r?\n/);
const classIndex = source.findIndex((line) => /\bclass\s+BookingsController\b/.test(line));
const classDecorators = source.slice(0, classIndex).filter((line) => line.trim().startsWith('@')).map((line) => line.trim());
const classPermissions = readPermissions(classDecorators);

const expected = {
  list: { http: 'GET', path: '', permissions: ['booking.view'] },
  deleteGuard: { http: 'GET', path: ':id/delete-guard', permissions: ['booking.manage'] },
  detail: { http: 'GET', path: ':id', permissions: ['booking.view'] },
  create: { http: 'POST', path: '', permissions: ['booking.manage'] },
  update: { http: 'PATCH', path: ':id', permissions: ['booking.manage'] },
  updateStatus: { http: 'PATCH', path: ':id/status', permissions: ['booking.manage'] },
  remove: { http: 'DELETE', path: ':id', permissions: ['booking.manage'] },
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
  const httpDecorator = decorators.find((decorator) => /^@(Get|Post|Put|Patch|Delete)\b/.test(decorator));
  if (!httpDecorator) {
    decorators = [];
    continue;
  }
  const match = httpDecorator.match(/^@(Get|Post|Put|Patch|Delete)(?:\((?:'([^']*)'|"([^"]*)")?\))?/);
  const methodPermissions = readPermissions(decorators);
  routes[method] = {
    http: match?.[1]?.toUpperCase(),
    path: match?.[2] || match?.[3] || '',
    permissions: methodPermissions.length ? methodPermissions : classPermissions,
  };
  decorators = [];
}

const failures = [];
for (const [method, contract] of Object.entries(expected)) {
  const route = routes[method];
  if (!route) {
    failures.push(`missing booking endpoint method: ${method}`);
    continue;
  }
  if (route.http !== contract.http) failures.push(`${method} expected ${contract.http}, got ${route.http}`);
  if (route.path !== contract.path) failures.push(`${method} expected path "${contract.path}", got "${route.path}"`);
  if (route.permissions.join(',') !== contract.permissions.join(',')) {
    failures.push(`${method} expected permissions ${contract.permissions.join(',')}, got ${route.permissions.join(',') || '<none>'}`);
  }
}
for (const method of Object.keys(routes)) {
  if (!expected[method]) failures.push(`unexpected booking endpoint without reviewed contract: ${method}`);
}
if (/@Put\b/.test(sourceText)) failures.push('Booking partial update must remain PATCH, not PUT');
if (!sourceText.includes('@Query() query: ListBookingsQueryDto')) failures.push('Booking list must use ListBookingsQueryDto');
if (sourceText.indexOf("@Get(':id/delete-guard')") > sourceText.indexOf("@Get(':id')")) {
  failures.push('delete-guard route must be declared before the generic :id route');
}

if (failures.length) {
  console.error('FAIL_BOOKINGS_CONTROLLER_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_BOOKINGS_CONTROLLER_CONTRACT_OK');

function readPermissions(decorators) {
  return decorators
    .filter((decorator) => /^@RequirePermissions\b/.test(decorator))
    .flatMap((decorator) => [...decorator.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] || match[2]));
}
NODE
