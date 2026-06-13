#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.join(process.cwd(), 'apps/api/src');
const httpDecorator = /^@(Get|Post|Put|Patch|Delete)\b/;
const methodLine = /^\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/;
const allowedPrivateRoutes = new Set([
  'apps/api/src/modules/auth/auth.controller.ts:me',
  'apps/api/src/modules/auth/auth.controller.ts:changePassword',
]);
const allowedPublicRoutes = new Set([
  'apps/api/src/modules/auth/auth.controller.ts:bootstrap',
  'apps/api/src/modules/auth/auth.controller.ts:logout',
  'apps/api/src/modules/auth/auth.controller.ts:login',
  'apps/api/src/modules/quotations/quotations.controller.ts:publicDetail',
]);
const nonRoutePermissionCatalog = new Set(['*', 'data.scope.all', 'data.scope.branch', 'data.scope.department']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : file.endsWith('.controller.ts') ? [file] : [];
  });
}

function hasDecorator(lines, pattern) {
  return lines.some((line) => pattern.test(line.trim()));
}

function readPermissions(decorators) {
  return decorators
    .filter((line) => /^@RequirePermissions\b/.test(line))
    .flatMap((line) => [...line.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] || match[2]));
}

function readHttpMethod(decorators) {
  const decorator = decorators.find((line) => httpDecorator.test(line));
  return decorator?.match(httpDecorator)?.[1]?.toUpperCase() || null;
}

function isMutation(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

function onlyViewPermissions(permissions) {
  return permissions.length > 0 && permissions.every((permission) => permission === '*' || permission.endsWith('.view'));
}

const failures = [];
const weakPermissions = [];
const backendPermissions = new Set();
const publicRoutes = new Set();

for (const file of walk(root)) {
  const rel = path.relative(process.cwd(), file).replaceAll('\\', '/');
  if (rel.endsWith('/health.controller.ts')) continue;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const classIndex = lines.findIndex((line) => /\bclass\s+\w+Controller\b/.test(line));
  const classDecorators = lines.slice(0, Math.max(classIndex, 0)).filter((line) => line.trim().startsWith('@'));
  const classPublic = hasDecorator(classDecorators, /^@Public\b/);
  const classPermissions = readPermissions(classDecorators);

  let decorators = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@')) {
      decorators.push(trimmed);
      continue;
    }

    const method = trimmed.match(methodLine)?.[1];
    if (!method) {
      if (trimmed && !trimmed.startsWith('//')) decorators = [];
      continue;
    }

    const isRoute = decorators.some((decorator) => httpDecorator.test(decorator));
    if (!isRoute) {
      decorators = [];
      continue;
    }

    const routeKey = `${rel}:${method}`;
    const httpMethod = readHttpMethod(decorators);
    const isPublic = classPublic || hasDecorator(decorators, /^@Public\b/);
    const methodPermissions = readPermissions(decorators);
    const effectivePermissions = methodPermissions.length ? methodPermissions : classPermissions;
    const hasPermission = effectivePermissions.length > 0;
    for (const permission of effectivePermissions) backendPermissions.add(permission);
    if (isPublic) publicRoutes.add(routeKey);
    if (!isPublic && !hasPermission && !allowedPrivateRoutes.has(routeKey)) {
      failures.push(routeKey);
    }
    if (isPublic && !allowedPublicRoutes.has(routeKey)) {
      failures.push(`unexpected public route: ${routeKey}`);
    }
    if (!isPublic && hasPermission && isMutation(httpMethod) && onlyViewPermissions(effectivePermissions)) {
      weakPermissions.push(`${routeKey} (${httpMethod}) -> ${effectivePermissions.join(', ')}`);
    }
    decorators = [];
  }
}

for (const routeKey of allowedPublicRoutes) {
  if (!publicRoutes.has(routeKey)) failures.push(`reviewed public route is missing or no longer public: ${routeKey}`);
}

const frontendCatalog = readFrontendPermissionCatalog();
const frontendLabels = readPermissionLabels();
const expectedFrontendPermissions = new Set([...backendPermissions, ...nonRoutePermissionCatalog]);
for (const permission of expectedFrontendPermissions) {
  if (!frontendCatalog.has(permission)) failures.push(`frontend permission catalog missing: ${permission}`);
  if (!frontendLabels.has(permission)) failures.push(`frontend permission label missing: ${permission}`);
}
for (const permission of frontendCatalog) {
  if (!expectedFrontendPermissions.has(permission)) failures.push(`frontend permission catalog has no backend match: ${permission}`);
}

if (failures.length || weakPermissions.length) {
  console.error('FAIL_ROUTE_PERMISSION_AUDIT');
  for (const failure of failures) console.error(failure);
  for (const failure of weakPermissions) console.error(`mutation route uses only view permission: ${failure}`);
  process.exit(1);
}

console.log('ROUTE_PERMISSION_AUDIT_OK');

function readFrontendPermissionCatalog() {
  const file = path.join(process.cwd(), 'apps/web/app/security/SecurityClient.tsx');
  if (!fs.existsSync(file)) return new Set();
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/const commonPermissionGroups = \[[\s\S]*?\] as const;/)?.[0] || '';
  return readPermissionStrings(block);
}

function readPermissionLabels() {
  const file = path.join(process.cwd(), 'apps/web/app/i18n.ts');
  if (!fs.existsSync(file)) return new Set();
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/const permissionLabels: Record<string, string> = \{[\s\S]*?\};/)?.[0] || '';
  return readPermissionStrings(block);
}

function readPermissionStrings(source) {
  return new Set(
    [...source.matchAll(/['"]([a-z*][a-z0-9_*.-]*(?:\.[a-z0-9_*.-]+)*)['"]/g)]
      .map((match) => match[1])
      .filter((value) => value === '*' || value.includes('.')),
  );
}
