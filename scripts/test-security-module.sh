#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_security_module_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_SECURITY_MODULE_TEST missing POSTGRES_PASSWORD"
  exit 1
fi

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

cleanup() {
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  -e SMARTTOUR_ENV=development \
  -e SMARTTOUR_AUTH_ENFORCE=true \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./apps/api/dist/app.module');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');

const password = 'StrongPass1';

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const prisma = app.get(PrismaService);
  const run = `security_${Date.now()}`;

  async function request(method, path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (options.status !== undefined) {
      assert(response.status === options.status, `${method} ${path} expected ${options.status}, got ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    } else if (!response.ok) {
      throw new Error(`${method} ${path} failed ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
  }

  async function login(username, pass = password) {
    const data = await request('POST', '/auth/login', { body: { username, password: pass } });
    return data.token;
  }

  try {
    await request('GET', '/auth/users', { status: 401 });
    await request('GET', '/auth/roles', { status: 401 });

    const adminUsername = `${run}_admin`;
    const bootstrap = await request('POST', '/auth/bootstrap', {
      body: { email: `${adminUsername}@smarttour.local`, username: adminUsername, password, name: 'Security Admin' },
      status: 201,
    });
    assert(bootstrap.token && bootstrap.tokenType === 'Bearer' && bootstrap.user.dataScope === 'all', 'bootstrap should issue wildcard admin session with all data scope');
    await request('POST', '/auth/bootstrap', {
      body: { email: `${run}_second@smarttour.local`, username: `${run}_second`, password, name: 'Second Admin' },
      status: 401,
    });

    const adminToken = bootstrap.token;
    const adminMe = await request('GET', '/auth/me', { token: adminToken });
    assert(adminMe.permissions.includes('*') && adminMe.dataScope === 'all', 'wildcard permission should map to all data scope in /auth/me');

    const userOnlyRole = `${run}_user_only`;
    const roleOnlyRole = `${run}_role_only`;
    const branchRole = `${run}_branch_manager`;
    const noSecurityRole = `${run}_no_security`;
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: userOnlyRole, name: 'User Manager Only', permissions: ['auth.user.manage', 'data.scope.all'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: roleOnlyRole, name: 'Role Manager Only', permissions: ['auth.role.manage', 'data.scope.all'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: branchRole, name: 'Branch Security Manager', permissions: ['auth.user.manage', 'auth.role.manage', 'data.scope.branch'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: noSecurityRole, name: 'No Security', permissions: ['customer.view', 'data.scope.all'] },
      status: 201,
    });

    const userOnlyUsername = `${run}_user_only`;
    const roleOnlyUsername = `${run}_role_only`;
    const branchUsername = `${run}_branch`;
    const noSecurityUsername = `${run}_nosec`;
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${userOnlyUsername}@smarttour.local`, username: userOnlyUsername, password, name: 'User Manager Only', roleCodes: [userOnlyRole] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${roleOnlyUsername}@smarttour.local`, username: roleOnlyUsername, password, name: 'Role Manager Only', roleCodes: [roleOnlyRole] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${branchUsername}@smarttour.local`, username: branchUsername, password, name: 'Branch Manager', branch: 'BR-A', department: 'DEP-A', roleCodes: [branchRole] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${noSecurityUsername}@smarttour.local`, username: noSecurityUsername, password, name: 'No Security', roleCodes: [noSecurityRole] },
      status: 201,
    });

    const userOnlyToken = await login(userOnlyUsername);
    const roleOnlyToken = await login(roleOnlyUsername);
    const branchToken = await login(branchUsername);
    const noSecurityToken = await login(noSecurityUsername);

    await request('GET', '/auth/users', { token: userOnlyToken });
    await request('GET', '/auth/roles', { token: userOnlyToken, status: 403 });
    await request('GET', '/auth/users', { token: roleOnlyToken, status: 403 });
    await request('GET', '/auth/roles', { token: roleOnlyToken });
    await request('GET', '/auth/users', { token: noSecurityToken, status: 403 });
    await request('GET', '/auth/roles', { token: noSecurityToken, status: 403 });

    const branchMe = await request('GET', '/auth/me', { token: branchToken });
    assert(branchMe.dataScope === 'branch' && branchMe.branch === 'BR-A', 'branch-scoped user should map to branch data scope in /auth/me');
    const branchUsers = await request('GET', '/auth/users', { token: branchToken });
    assert(branchUsers.length > 0 && branchUsers.every((user) => user.branch === 'BR-A'), 'branch-scoped security manager should load only users in own branch');
    const branchRoles = await request('GET', '/auth/roles', { token: branchToken });
    assert(branchRoles.some((role) => role.code === branchRole) && !branchRoles.some((role) => role.code === 'super_admin'), 'branch-scoped security manager should load only assignable roles');

    const createdUser = await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${run}_created@smarttour.local`, username: `${run}_created`, password, name: 'Created User', branch: 'BR-A', roleCodes: [branchRole] },
      status: 201,
    });
    assert(createdUser.email === `${run}_created@smarttour.local` && createdUser.dataScope === 'branch', 'create user endpoint should return safe user data');

    const updatedUser = await request('PUT', `/auth/users/${createdUser.id}`, {
      token: adminToken,
      body: { name: 'Created User Updated', status: 'LOCKED', branch: 'BR-A', roleCodes: [branchRole] },
    });
    assert(updatedUser.name === 'Created User Updated' && updatedUser.status === 'LOCKED', 'update user endpoint should update user');

    await request('POST', '/auth/users', {
      token: branchToken,
      body: { email: `${run}_branch_created@smarttour.local`, username: `${run}_branch_created`, password, name: 'Branch Created', roleCodes: [branchRole] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: branchToken,
      body: { email: `${run}_branch_outside@smarttour.local`, username: `${run}_branch_outside`, password, name: 'Outside Branch', branch: 'BR-B', roleCodes: [branchRole] },
      status: 403,
    });
    await request('POST', '/auth/users', {
      token: branchToken,
      body: { email: `${run}_grant_super@smarttour.local`, username: `${run}_grant_super`, password, name: 'Grant Super', branch: 'BR-A', roleCodes: ['super_admin'] },
      status: 403,
    });

    const createdRole = await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: `${run}_role`, name: 'Security Test Role', permissions: ['auth.user.manage', 'data.scope.all'] },
      status: 201,
    });
    assert(createdRole.code === `${run}_role` && createdRole.permissions.some((entry) => entry.permission === 'auth.user.manage'), 'create role endpoint should persist permissions');
    const updatedRole = await request('PUT', `/auth/roles/${createdRole.id}`, {
      token: adminToken,
      body: { name: 'Security Test Role Updated', permissions: ['auth.user.manage', 'auth.role.manage', 'data.scope.all'] },
    });
    assert(updatedRole.name === 'Security Test Role Updated' && updatedRole.permissions.some((entry) => entry.permission === 'auth.role.manage'), 'update role endpoint should persist permission changes');
    await request('POST', '/auth/roles', {
      token: branchToken,
      body: { code: `${run}_branch_role`, name: 'Branch Role', permissions: ['auth.user.manage', 'data.scope.branch'] },
      status: 403,
    });

    const passwordUser = await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${run}_password@smarttour.local`, username: `${run}_password`, password, name: 'Password User', roleCodes: [noSecurityRole] },
      status: 201,
    });
    const passwordToken = await login(`${run}_password`);
    const changed = await request('POST', '/auth/change-password', {
      token: passwordToken,
      body: { currentPassword: password, newPassword: 'ChangedPass1' },
    });
    assert(changed.token && changed.token !== passwordToken && changed.user.id === passwordUser.id, 'change password endpoint should issue a fresh token');
    await request('GET', '/auth/me', { token: passwordToken, status: 401 });
    await request('GET', '/auth/me', { token: changed.token });
    await request('POST', '/auth/login', { body: { username: `${run}_password`, password }, status: 401 });
    await login(`${run}_password`, 'ChangedPass1');

    const logoutUser = await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${run}_logout@smarttour.local`, username: `${run}_logout`, password, name: 'Logout User', roleCodes: [noSecurityRole] },
      status: 201,
    });
    const logoutToken = await login(`${run}_logout`);
    await request('GET', '/auth/me', { token: logoutToken });
    await request('POST', '/auth/logout', { token: logoutToken });
    await request('GET', '/auth/me', { token: logoutToken, status: 401 });

    const bootstrapAudit = await prisma.auditLog.findFirst({ where: { action: 'BOOTSTRAP', entity: 'User' } });
    const loginAudit = await prisma.auditLog.findFirst({ where: { action: 'LOGIN', actorId: logoutUser.id } });
    const logoutAudit = await prisma.auditLog.findFirst({ where: { action: 'LOGOUT', actorId: logoutUser.id } });
    const passwordAudit = await prisma.auditLog.findFirst({ where: { action: 'CHANGE_PASSWORD', actorId: passwordUser.id } });
    const userCreateAudit = await prisma.auditLog.findFirst({ where: { action: 'CREATE', entity: 'User', entityId: createdUser.id } });
    const userUpdateAudit = await prisma.auditLog.findFirst({ where: { action: 'UPDATE', entity: 'User', entityId: createdUser.id } });
    const roleCreateAudit = await prisma.auditLog.findFirst({ where: { action: 'CREATE', entity: 'Role', entityId: createdRole.id } });
    const roleUpdateAudit = await prisma.auditLog.findFirst({ where: { action: 'UPDATE', entity: 'Role', entityId: createdRole.id } });
    assert(bootstrapAudit?.metadata?.after?.roleCodes.includes('super_admin'), 'bootstrap audit should trace super admin role');
    assert(loginAudit?.metadata?.sessionIssued === true, 'login audit should trace issued session');
    assert(logoutAudit?.metadata?.tokenRevoked === true, 'logout audit should trace token revoke');
    assert(passwordAudit?.metadata?.passwordChanged === true && passwordAudit.metadata.sessionsRevoked === 'all', 'change password audit should trace session revoke');
    assert(userCreateAudit?.metadata?.actorScope?.dataScopes.includes('all') && userCreateAudit.metadata.after.email === createdUser.email, 'create user audit should trace actor scope and after snapshot');
    assert(userUpdateAudit?.metadata?.before?.status === 'ACTIVE' && userUpdateAudit.metadata.after.status === 'LOCKED', 'update user audit should trace status change');
    assert(roleCreateAudit?.metadata?.permissionChanges?.added.includes('auth.user.manage'), 'create role audit should trace permission additions');
    assert(roleUpdateAudit?.metadata?.permissionChanges?.added.includes('auth.role.manage'), 'update role audit should trace permission additions');

    console.log('TEST_SECURITY_MODULE_API_OK');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE

scripts/test-security-ui-contract.sh
