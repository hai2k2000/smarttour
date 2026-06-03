#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.join(process.cwd(), 'apps/api/src');
const httpDecorator = /^@(Get|Post|Put|Patch|Delete)\b/;
const methodLine = /^\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/;
const allowedPrivateRoutes = new Set([
  'apps/api/src/modules/auth/auth.controller.ts:logout',
  'apps/api/src/modules/auth/auth.controller.ts:me',
  'apps/api/src/modules/auth/auth.controller.ts:changePassword',
]);

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
    if (!isPublic && !hasPermission && !allowedPrivateRoutes.has(routeKey)) {
      failures.push(routeKey);
    }
    if (!isPublic && hasPermission && isMutation(httpMethod) && onlyViewPermissions(effectivePermissions)) {
      weakPermissions.push(`${routeKey} (${httpMethod}) -> ${effectivePermissions.join(', ')}`);
    }
    decorators = [];
  }
}

if (failures.length || weakPermissions.length) {
  console.error('FAIL_ROUTE_PERMISSION_AUDIT');
  for (const failure of failures) console.error(`missing RequirePermissions: ${failure}`);
  for (const failure of weakPermissions) console.error(`mutation route uses only view permission: ${failure}`);
  process.exit(1);
}

console.log('ROUTE_PERMISSION_AUDIT_OK');
