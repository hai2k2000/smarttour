#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/auth/auth.controller.ts', 'utf8').split(/\r?\n/);
const moduleSource = fs.readFileSync('apps/api/src/modules/auth/auth.module.ts', 'utf8');
const expected = {
  bootstrap: { http: 'POST', public: true, permissions: [] },
  login: { http: 'POST', public: true, permissions: [] },
  logout: { http: 'POST', public: false, permissions: [] },
  me: { http: 'GET', public: false, permissions: [] },
  changePassword: { http: 'POST', public: false, permissions: [] },
  users: { http: 'GET', public: false, permissions: ['auth.user.manage'] },
  createUser: { http: 'POST', public: false, permissions: ['auth.user.manage'] },
  updateUser: { http: 'PUT', public: false, permissions: ['auth.user.manage'] },
  roles: { http: 'GET', public: false, permissions: ['auth.role.manage'] },
  createRole: { http: 'POST', public: false, permissions: ['auth.role.manage'] },
  updateRole: { http: 'PUT', public: false, permissions: ['auth.role.manage'] },
};

const routes = {};
let decorators = [];
for (const line of controller) {
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
  if (http) routes[method] = { http, public: decorators.some((decorator) => /^@Public\b/.test(decorator)), permissions };
  decorators = [];
}

const failures = [];
for (const [method, contract] of Object.entries(expected)) {
  const route = routes[method];
  if (!route) {
    failures.push(`missing auth endpoint method: ${method}`);
    continue;
  }
  if (route.http !== contract.http) failures.push(`${method} expected ${contract.http}, got ${route.http}`);
  if (route.public !== contract.public) failures.push(`${method} expected public=${contract.public}, got ${route.public}`);
  if (route.permissions.join(',') !== contract.permissions.join(',')) {
    failures.push(`${method} expected permissions=${contract.permissions.join(',') || '<authenticated>'}, got ${route.permissions.join(',') || '<authenticated>'}`);
  }
}
for (const method of Object.keys(routes)) {
  if (!expected[method]) failures.push(`unexpected auth endpoint without reviewed permission mapping: ${method}`);
}
if (!moduleSource.includes('{ provide: APP_GUARD, useClass: AuthGuard }')) failures.push('AuthGuard is not registered as APP_GUARD');
if (controller.some((line) => line.includes('@UseGuards(AuthGuard)'))) failures.push('AuthController should not register duplicate AuthGuard');

if (failures.length) {
  console.error('FAIL_AUTH_CONTROLLER_PERMISSIONS');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_AUTH_CONTROLLER_PERMISSIONS_OK');
NODE
