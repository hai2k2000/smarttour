#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function collectRolePermissions() {
  const migrationRoot = path.join(root, 'prisma', 'migrations');
  const roles = new Map([
    ['super_admin', new Set()],
    ['sales', new Set()],
    ['operation', new Set()],
    ['accounting', new Set()],
  ]);
  const propagatedPermissions = [];

  for (const entry of fs.readdirSync(migrationRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const migrationPath = path.join(migrationRoot, entry.name, 'migration.sql');
    if (!fs.existsSync(migrationPath)) continue;
    const source = fs.readFileSync(migrationPath, 'utf8');
    for (const match of source.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
      roles.get(match[1])?.add(match[2]);
    }
    for (const match of source.matchAll(/existing\."roleId"\s*,\s*'([^']+)'\s*,\s*now\(\)[\s\S]*?WHERE existing\.permission\s*=\s*'([^']+)'/g)) {
      propagatedPermissions.push({ permission: match[1], sourcePermission: match[2] });
    }
  }

  for (const { permission, sourcePermission } of propagatedPermissions) {
    for (const permissions of roles.values()) {
      if (permissions.has(sourcePermission)) permissions.add(permission);
    }
  }

  return roles;
}

function collectBackendRoutePermissions() {
  const moduleRoot = path.join(root, 'apps', 'api', 'src', 'modules');
  const permissions = new Set();
  const controllers = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.name.endsWith('.controller.ts')) {
        controllers.push(fullPath);
      }
    }
  }

  visit(moduleRoot);
  for (const controllerPath of controllers) {
    const source = fs.readFileSync(controllerPath, 'utf8');
    for (const match of source.matchAll(/@RequirePermissions\s*\(([^)]*)\)/g)) {
      for (const permissionMatch of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
        permissions.add(permissionMatch[1]);
      }
    }
  }
  return permissions;
}

function collectFrontendPermissionKeys() {
  const files = [
    'apps/web/app/i18n.ts',
    'apps/web/app/security/SecurityClient.tsx',
  ];
  const permissionPattern = /['"`]([a-z][a-z0-9_-]*(?:\.[a-z0-9_*_-]+)+|\*)['"`]/g;
  const allowedPrefixes = /^(auth|data|booking|tour|order|quote|quotation|customer|commission|report|guide|supplier|operation|finance|file)\./;
  const permissions = new Set();
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(permissionPattern)) {
      const permission = match[1];
      if (permission === '*' || allowedPrefixes.test(permission)) permissions.add(permission);
    }
  }
  return permissions;
}

function collectFrontendPermissionLabels() {
  const source = read('apps/web/app/i18n.ts');
  const permissions = new Set();
  const objectMatch = source.match(/const permissionLabels:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/);
  if (!objectMatch) {
    failures.push('Không tìm thấy permissionLabels trong i18n.ts');
    return permissions;
  }
  for (const match of objectMatch[1].matchAll(/['"]([^'"]+)['"]\s*:/g)) {
    permissions.add(match[1]);
  }
  return permissions;
}

function requirePermissions(roles, role, permissions) {
  const actual = roles.get(role);
  for (const permission of permissions) {
    assert(actual?.has(permission), `${role} thiếu quyền bắt buộc ${permission}`);
  }
}

function forbidPermissions(roles, role, permissions) {
  const actual = roles.get(role);
  for (const permission of permissions) {
    assert(!actual?.has(permission), `${role} không được có quyền ${permission}`);
  }
}

function forbidPrefix(roles, role, prefix) {
  const matches = [...(roles.get(role) || [])].filter((permission) => permission.startsWith(prefix));
  assert(matches.length === 0, `${role} không được có nhóm quyền ${prefix}: ${matches.join(', ')}`);
}

const operationManageMigration = read('prisma/migrations/20260625120000_operation_payment_request_manage_permission/migration.sql');
assert(
  operationManageMigration.includes('JOIN "Role" r ON r.code = rp.code') && operationManageMigration.includes(`SELECT md5(r.id || ':' || rp.permission), r.id, rp.permission, now()`),
  'operation payment request manage permission migration must resolve RolePermission.roleId from Role.id by role code',
);

const roles = collectRolePermissions();
const backendRoutePermissions = collectBackendRoutePermissions();
const backendKnownPermissions = new Set(['*', ...backendRoutePermissions]);
for (const rolePermissions of roles.values()) {
  for (const permission of rolePermissions) backendKnownPermissions.add(permission);
}
const frontendPermissionKeys = collectFrontendPermissionKeys();
const frontendPermissionLabels = collectFrontendPermissionLabels();

for (const permission of frontendPermissionKeys) {
  assert(backendKnownPermissions.has(permission), `frontend dùng permission key chưa có ở backend/migration: ${permission}`);
}

for (const permission of backendRoutePermissions) {
  assert(frontendPermissionLabels.has(permission), `frontend i18n thiếu label cho backend permission ${permission}`);
}

for (const requiredSecurityPermission of ['auth.user.manage', 'auth.role.manage', 'data.scope.all', 'data.scope.branch', 'data.scope.department']) {
  assert(frontendPermissionKeys.has(requiredSecurityPermission), `frontend security thiếu permission key ${requiredSecurityPermission}`);
  assert(backendKnownPermissions.has(requiredSecurityPermission), `backend thiếu permission key ${requiredSecurityPermission}`);
}

requirePermissions(roles, 'super_admin', ['*']);
requirePermissions(roles, 'sales', [
  'customer.view',
  'customer.manage',
  'quote.view',
  'quote.manage',
  'quotation.view',
  'quotation.manage',
  'booking.view',
  'booking.manage',
  'order.view',
  'order.manage',
  'tour.view',
  'tour.manage',
  'data.scope.department',
]);
requirePermissions(roles, 'operation', [
  'operation.form.view',
  'operation.form.manage',
  'operation.payment-request.view',
  'operation.payment-request.create',
  'operation.payment-request.manage',
  'supplier.view',
  'supplier.manage',
  'guide.view',
  'guide.manage',
  'data.scope.branch',
]);
requirePermissions(roles, 'accounting', [
  'finance.receipt.view',
  'finance.receipt.create',
  'finance.receipt.update',
  'finance.receipt.delete',
  'finance.receipt.approve',
  'finance.receipt.import',
  'finance.receipt.export',
  'finance.payment.view',
  'finance.payment.create',
  'finance.payment.update',
  'finance.payment.delete',
  'finance.payment.approve',
  'finance.payment.import',
  'finance.payment.export',
  'finance.invoice.view',
  'finance.invoice.create',
  'finance.invoice.update',
  'finance.invoice.delete',
  'finance.invoice.approve',
  'finance.invoice.export',
  'finance.cashflow.view',
  'finance.cashflow.export',
  'finance.debt.view',
  'finance.debt.adjust',
  'commission.view',
  'commission.manage',
  'commission.approve',
  'commission.export',
  'report.view',
  'report.export',
  'operation.payment-request.view',
  'operation.payment-request.approve',
  'data.scope.all',
]);

forbidPrefix(roles, 'sales', 'finance.');
forbidPermissions(roles, 'sales', [
  'operation.form.manage',
  'operation.payment-request.create',
  'operation.payment-request.manage',
  'operation.payment-request.approve',
  'supplier.manage',
  'guide.manage',
]);
forbidPrefix(roles, 'operation', 'finance.');
forbidPermissions(roles, 'operation', [
  'customer.manage',
  'quote.manage',
  'quotation.manage',
  'commission.manage',
  'operation.payment-request.approve',
]);
forbidPermissions(roles, 'accounting', [
  'customer.manage',
  'quote.manage',
  'quotation.manage',
  'booking.manage',
  'order.manage',
  'tour.manage',
  'operation.form.manage',
  'operation.payment-request.create',
  'operation.payment-request.manage',
  'supplier.manage',
  'guide.manage',
]);

const authService = read('apps/api/src/modules/auth/auth.service.ts');
const authGuard = read('apps/api/src/modules/auth/auth.guard.ts');
assert(
  authService.includes("permissions.has('*') || required.every"),
  'AuthService phải cho wildcard * vượt qua mọi permission check',
);
assert(
  authGuard.includes("throw new ForbiddenException('Thiếu quyền truy cập')"),
  'Người dùng đã đăng nhập nhưng thiếu quyền phải nhận HTTP 403',
);

const controllerContracts = [
  ['apps/api/src/modules/customers/customers.controller.ts', "'customer.manage'"],
  ['apps/api/src/modules/quotes/quotes.controller.ts', "'quote.manage'"],
  ['apps/api/src/modules/quotations/quotations.controller.ts', "'quotation.manage'"],
  ['apps/api/src/modules/bookings/bookings.controller.ts', "'booking.manage'"],
  ['apps/api/src/modules/orders/orders.controller.ts', "'order.manage'"],
  ['apps/api/src/modules/operations/operations.controller.ts', "'operation.form.manage'"],
  ['apps/api/src/modules/operation-vouchers/operation-vouchers.controller.ts', "'operation.form.manage'"],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', "'supplier.manage'"],
  ['apps/api/src/modules/tour-guides/tour-guides.controller.ts', "'guide.manage'"],
  ['apps/api/src/modules/finance/finance.controller.ts', "'finance.receipt.approve'"],
  ['apps/api/src/modules/commission-reports/commission-reports.controller.ts', "'commission.manage'"],
  ['apps/api/src/modules/reports/reports.controller.ts', "'report.export'"],
];
for (const [file, permission] of controllerContracts) {
  assert(read(file).includes(permission), `${file} thiếu guard ${permission}`);
}

const operationsSmoke = read('scripts/smoke-operations-backend.sh');
assert(
  operationsSmoke.includes("'${REQUEST_CREATE_ROLE_ID}_rp_request_manage'") && operationsSmoke.includes("'operation.payment-request.manage'"),
  'operations smoke request-create session must include operation.payment-request.manage before submitting payment requests',
);

const smoke = read('scripts/smoke-rbac-workflows.sh');
assert(!smoke.includes('ADMIN_PASSWORD'), 'RBAC smoke không được phụ thuộc mật khẩu admin production');
assert(!smoke.includes('[401]'), 'Thiếu quyền của session hợp lệ phải được kiểm tra là 403, không phải 401');
assert(smoke.includes('expectForbidden'), 'RBAC smoke phải có helper kiểm tra chính xác HTTP 403');
for (const role of ['super_admin', 'sales', 'operation', 'accounting']) {
  assert(smoke.includes(`'${role}'`), `RBAC smoke chưa tạo session cho role ${role}`);
}
for (const pathName of [
  '/customers',
  '/quotes/tours',
  '/quotations',
  '/bookings',
  '/orders/fit-tours',
  '/operations/forms',
  '/operation-vouchers',
  '/suppliers/restaurants',
  '/tour-guides',
  '/finance/receipts',
  '/commission-reports',
  '/reports/overview',
]) {
  assert(smoke.includes(pathName), `RBAC smoke chưa phủ ${pathName}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL_ROLE_PERMISSION_CONTRACT ${failure}`).join('\n'));
  process.exit(1);
}

console.log('TEST_ROLE_PERMISSION_CONTRACT_OK');
