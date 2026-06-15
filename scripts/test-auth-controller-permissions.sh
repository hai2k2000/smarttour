#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');
const path = require('path');

const controller = fs.readFileSync('apps/api/src/modules/auth/auth.controller.ts', 'utf8').split(/\r?\n/);
const moduleSource = fs.readFileSync('apps/api/src/modules/auth/auth.module.ts', 'utf8');
const expected = {
  bootstrap: { http: 'POST', public: true, permissions: [] },
  login: { http: 'POST', public: true, permissions: [] },
  logout: { http: 'POST', public: true, permissions: [] },
  me: { http: 'GET', public: false, permissions: [] },
  changePassword: { http: 'POST', public: false, permissions: [] },
  users: { http: 'GET', public: false, permissions: ['auth.user.manage'] },
  createUser: { http: 'POST', public: false, permissions: ['auth.user.manage'] },
  updateUser: { http: 'PUT', public: false, permissions: ['auth.user.manage'] },
  roles: { http: 'GET', public: false, permissions: ['auth.role.manage'] },
  createRole: { http: 'POST', public: false, permissions: ['auth.role.manage'] },
  updateRole: { http: 'PUT', public: false, permissions: ['auth.role.manage'] },
};

const expectedPublicRoutes = new Set([
  'apps/api/src/modules/auth/auth.controller.ts#bootstrap',
  'apps/api/src/modules/auth/auth.controller.ts#login',
  'apps/api/src/modules/auth/auth.controller.ts#logout',
  'apps/api/src/modules/quotations/quotations.controller.ts#publicDetail',
]);

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

function publicRoutes() {
  const routes = [];
  const moduleRoot = path.join('apps', 'api', 'src', 'modules');

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.name.endsWith('.controller.ts')) {
        inspectController(fullPath);
      }
    }
  }

  function inspectController(filePath) {
    const relative = filePath.replace(/\\/g, '/');
    let decorators = [];
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@')) {
        decorators.push(trimmed);
        continue;
      }
      const className = trimmed.match(/^export\s+class\s+([A-Za-z0-9_]+)/)?.[1];
      if (className) {
        if (decorators.some((decorator) => /^@Public\b/.test(decorator))) failures.push(`class-level @Public is not allowed: ${relative}#${className}`);
        decorators = [];
        continue;
      }
      const method = trimmed.match(/^(?:async\s+)?([A-Za-z0-9_]+)\s*\(/)?.[1];
      if (!method) {
        if (trimmed && !trimmed.startsWith('//')) decorators = [];
        continue;
      }
      if (decorators.some((decorator) => /^@Public\b/.test(decorator))) routes.push(`${relative}#${method}`);
      decorators = [];
    }
  }

  visit(moduleRoot);
  return routes;
}
if (!moduleSource.includes('{ provide: APP_GUARD, useClass: AuthGuard }')) failures.push('AuthGuard is not registered as APP_GUARD');
if (controller.some((line) => line.includes('@UseGuards(AuthGuard)'))) failures.push('AuthController should not register duplicate AuthGuard');
const controllerSource = controller.join('\n');
if (!/private\s+sessionToken\s*\(\s*request:\s*AuthRequest\s*\)/.test(controllerSource)) {
  failures.push('AuthController should centralize request token extraction in a private sessionToken(request) helper');
}
const sessionTokenUses = [...controllerSource.matchAll(/this\.sessionToken\(request\)/g)].length;
if (sessionTokenUses !== 3) failures.push(`logout, me and changePassword should all use sessionToken(request); saw ${sessionTokenUses} uses`);
if (/service\.(logout|me|changePassword)\([^)]*tokenFromHeaders\(request\.headers\)/.test(controllerSource)) {
  failures.push('AuthController session endpoints should not call tokenFromHeaders inline');
}
const actualPublicRoutes = publicRoutes();
for (const route of actualPublicRoutes) {
  if (!expectedPublicRoutes.has(route)) failures.push(`unexpected @Public route: ${route}`);
}
for (const route of expectedPublicRoutes) {
  if (!actualPublicRoutes.includes(route)) failures.push(`expected @Public route missing: ${route}`);
}

if (failures.length) {
  console.error('FAIL_AUTH_CONTROLLER_PERMISSIONS');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_AUTH_CONTROLLER_PERMISSIONS_OK');
NODE
