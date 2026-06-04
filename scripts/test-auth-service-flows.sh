#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_auth_service_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_AUTH_SERVICE_TEST missing POSTGRES_PASSWORD"
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
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } = require('@nestjs/common');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { AuthService } = require('./apps/api/dist/modules/auth/auth.service');
const { AuthSessionService } = require('./apps/api/dist/modules/auth/auth-session.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function errorFrom(action) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('expected action to reject');
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const auth = new AuthService(prisma, new AuthSessionService(prisma));
  const request = { headers: { 'user-agent': 'auth-service-test' }, ip: '127.0.0.1' };
  const password = 'StartPass123';

  process.env.SMARTTOUR_ENV = 'production';
  delete process.env.SMARTTOUR_BOOTSTRAP_KEY;
  assert(await errorFrom(() => auth.bootstrap({ email: 'admin@example.com', name: 'Admin', password }, request)) instanceof UnauthorizedException, 'production bootstrap should require configured key');

  process.env.SMARTTOUR_BOOTSTRAP_KEY = 'production-bootstrap-key';
  assert(await errorFrom(() => auth.bootstrap({ email: 'admin@example.com', name: 'Admin', password, bootstrapKey: 'wrong' }, request)) instanceof UnauthorizedException, 'production bootstrap should reject wrong key');

  const boot = await auth.bootstrap({ email: 'admin@example.com', name: 'Admin', password, bootstrapKey: 'production-bootstrap-key' }, request);
  assert(boot.token && boot.tokenType === 'Bearer', 'production bootstrap with correct key should issue session');
  const superAdmin = await prisma.role.findUnique({ where: { code: 'super_admin' }, include: { permissions: true } });
  assert(superAdmin.permissions.length === 1 && superAdmin.permissions[0].permission === '*', 'super_admin defaults should contain only wildcard permission');
  assert(await errorFrom(() => auth.bootstrap({ email: 'other@example.com', name: 'Other', password, bootstrapKey: 'production-bootstrap-key' }, request)) instanceof UnauthorizedException, 'bootstrap must be one-time');

  assert(await errorFrom(() => auth.login({ username: 'missing-user', password }, request)) instanceof NotFoundException, 'login should report missing user');
  assert(await errorFrom(() => auth.login({ username: 'admin', password: 'WrongPass123' }, request)) instanceof UnauthorizedException, 'login should report wrong password');
  await prisma.user.update({ where: { id: boot.user.id }, data: { status: 'LOCKED' } });
  assert(await errorFrom(() => auth.login({ username: 'admin', password }, request)) instanceof ForbiddenException, 'login should report locked user');
  await prisma.user.update({ where: { id: boot.user.id }, data: { status: 'INACTIVE' } });
  assert(await errorFrom(() => auth.login({ username: 'admin', password }, request)) instanceof ForbiddenException, 'login should report inactive user');
  await prisma.user.update({ where: { id: boot.user.id }, data: { status: 'ACTIVE' } });

  const branchRole = await auth.createRole({
    code: 'branch_manager',
    name: 'Branch Manager',
    permissions: ['order.view', 'data.scope.branch', 'order.view'],
  }, boot.user.id);
  assert(branchRole.permissions.length === 2, 'createRole should deduplicate permissions');
  assert(await errorFrom(() => auth.createRole({ code: 'empty_role', name: 'Empty', permissions: [] }, boot.user.id)) instanceof BadRequestException, 'createRole should reject empty permissions');
  assert(await errorFrom(() => auth.createUser({ email: 'no-role@example.com', name: 'No Role', password, roleCodes: [] }, boot.user.id)) instanceof BadRequestException, 'createUser should reject empty roles');
  assert(await errorFrom(() => auth.createUser({ email: 'no-branch@example.com', name: 'No Branch', password, roleCodes: ['branch_manager'] }, boot.user.id)) instanceof BadRequestException, 'createUser should require branch for branch scope');

  const first = await auth.createUser({
    email: 'operator@one.example.com',
    name: 'Operator One',
    password,
    branch: 'Hanoi',
    roleCodes: ['branch_manager'],
  }, boot.user.id);
  const second = await auth.createUser({
    email: 'operator@two.example.com',
    name: 'Operator Two',
    password,
    branch: 'Hanoi',
    roleCodes: ['branch_manager'],
  }, boot.user.id);
  assert(first.username === 'operator' && second.username === 'operator-2', 'generated usernames should avoid collisions');

  assert(await errorFrom(() => auth.updateUser(first.id, { username: 'Tên lỗi' }, boot.user.id)) instanceof BadRequestException, 'updateUser should reject invalid username');
  assert(await errorFrom(() => auth.updateUser(first.id, { status: 'UNKNOWN' }, boot.user.id)) instanceof BadRequestException, 'updateUser should reject invalid status');
  assert(await errorFrom(() => auth.updateUser(first.id, { roleCodes: [] }, boot.user.id)) instanceof BadRequestException, 'updateUser should reject empty roles');
  const unchanged = await prisma.user.findUnique({ where: { id: first.id }, include: { roles: { include: { role: true } } } });
  assert(unchanged.roles.length === 1 && unchanged.roles[0].role.code === 'branch_manager', 'failed update should not delete current roles');

  const login = await auth.login({ username: first.username, password }, request);
  await auth.updateUser(first.id, { status: 'LOCKED' }, boot.user.id);
  assert(await prisma.userSession.count({ where: { userId: first.id, revokedAt: null } }) === 0, 'locking user should revoke active sessions');
  await auth.updateUser(first.id, { status: 'ACTIVE' }, boot.user.id);

  await auth.updateRole(branchRole.id, { permissions: ['order.view', 'order.manage', 'order.manage'] }, boot.user.id);
  const updatedRole = await prisma.role.findUnique({ where: { id: branchRole.id }, include: { permissions: true } });
  assert(updatedRole.permissions.length === 2, 'updateRole should deduplicate permissions');
  assert(await errorFrom(() => auth.updateRole(branchRole.id, { permissions: [] }, boot.user.id)) instanceof BadRequestException, 'updateRole should reject empty permissions');
  assert(await errorFrom(() => auth.updateRole(superAdmin.id, { permissions: ['auth.user.manage'] }, boot.user.id)) instanceof BadRequestException, 'super_admin should retain wildcard');

  assert(auth.hasPermissions({ roles: [{ role: { status: 'ACTIVE', permissions: [{ permission: '*' }] } }] }, ['anything.manage']), 'wildcard permission should allow all requirements');
  assert(auth.hasPermissions({ roles: [{ role: { status: 'ACTIVE', permissions: [{ permission: 'data.scope.branch' }] } }] }, ['data.scope.branch']), 'exact data scope permission should match');
  assert(!auth.hasPermissions({ roles: [{ role: { status: 'INACTIVE', permissions: [{ permission: '*' }] } }] }, ['order.view']), 'inactive role must not grant permissions');
  assert(!auth.hasPermissions({ roles: [{ role: { status: 'ACTIVE', permissions: [{ permission: 'data.scope.branch' }] } }] }, ['data.scope.all']), 'branch scope must not imply all scope');

  const audits = await prisma.auditLog.findMany({ where: { actorId: boot.user.id } });
  for (const action of ['CREATE', 'UPDATE']) assert(audits.some((audit) => audit.action === action), `audit log should include ${action}`);
  assert(audits.some((audit) => audit.entity === 'Role'), 'role changes should be audited');
  assert(audits.some((audit) => audit.entity === 'User'), 'user changes should be audited');

  const userCreateAudit = audits.find((audit) => audit.action === 'CREATE' && audit.entity === 'User' && audit.entityId === first.id);
  assert(userCreateAudit?.metadata?.after?.email === first.email, 'create user audit should include after snapshot');
  assert(userCreateAudit.metadata.after.roleCodes.includes('branch_manager'), 'create user audit should trace assigned role codes');
  assert(userCreateAudit.metadata.roleChanges.added.includes('branch_manager'), 'create user audit should trace role additions');

  const lockAudit = audits.find((audit) => audit.action === 'UPDATE' && audit.entity === 'User' && audit.entityId === first.id && audit.metadata?.after?.status === 'LOCKED');
  assert(lockAudit?.metadata?.before?.status === 'ACTIVE', 'update user audit should include previous status');
  assert(lockAudit.metadata.changes.status.from === 'ACTIVE' && lockAudit.metadata.changes.status.to === 'LOCKED', 'update user audit should trace status diff');
  assert(lockAudit.metadata.sessionsRevoked === true, 'update user audit should trace session revoke side effect');

  const roleCreateAudit = audits.find((audit) => audit.action === 'CREATE' && audit.entity === 'Role' && audit.entityId === branchRole.id);
  assert(roleCreateAudit?.metadata?.after?.code === 'branch_manager', 'create role audit should include role snapshot');
  assert(roleCreateAudit.metadata.permissionChanges.added.includes('data.scope.branch'), 'create role audit should trace permission additions');

  const roleUpdateAudit = audits.find((audit) => audit.action === 'UPDATE' && audit.entity === 'Role' && audit.entityId === branchRole.id);
  assert(roleUpdateAudit?.metadata?.before?.permissions.includes('data.scope.branch'), 'update role audit should include previous permissions');
  assert(roleUpdateAudit.metadata.permissionChanges.added.includes('order.manage'), 'update role audit should trace added permissions');
  assert(roleUpdateAudit.metadata.permissionChanges.removed.includes('data.scope.branch'), 'update role audit should trace removed permissions');

  await prisma.$disconnect();
  console.log('TEST_AUTH_SERVICE_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
