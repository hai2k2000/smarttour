#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_auth_session_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_AUTH_SESSION_TEST missing POSTGRES_PASSWORD"
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
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { AuthService } = require('./apps/api/dist/modules/auth/auth.service');
const { AuthSessionService } = require('./apps/api/dist/modules/auth/auth-session.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function rejects(action, label) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

async function main() {
  process.env.SMARTTOUR_ENV = 'development';
  delete process.env.SMARTTOUR_BOOTSTRAP_KEY;
  process.env.SMARTTOUR_SESSION_DAYS = '1';

  const prisma = new PrismaService();
  await prisma.$connect();
  const sessions = new AuthSessionService(prisma);
  const auth = new AuthService(prisma, sessions);

  const password = 'StartPass123';
  const nextPassword = 'NextPass123';
  const email = 'session-admin@example.com';
  const username = 'session-admin';
  const request = { headers: { 'user-agent': 'auth-session-test' }, ip: '127.0.0.1' };

  const boot = await auth.bootstrap({ email, username, name: 'Session Admin', password }, request);
  assert(boot.token && boot.tokenType === 'Bearer' && boot.expiresAt && boot.user.email === email, 'bootstrap without key should create first development admin and issue consistent session');
  await auth.validateToken(boot.token);
  const bootstrapAudit = await prisma.auditLog.findFirst({ where: { actorId: boot.user.id, action: 'BOOTSTRAP', entity: 'User', entityId: boot.user.id } });
  assert(bootstrapAudit?.metadata?.after?.email === email, 'bootstrap should write traceable audit metadata');
  assert(bootstrapAudit.metadata.roleChanges.added.includes('super_admin'), 'bootstrap audit should trace super admin role assignment');

  await rejects(() => auth.bootstrap({ email: 'other@example.com', name: 'Other', password }), 'bootstrap should lock without key once users exist');

  process.env.SMARTTOUR_BOOTSTRAP_KEY = 'test-bootstrap-key';
  await rejects(() => auth.bootstrap({ email, username, name: 'Session Admin', password, bootstrapKey: 'wrong' }), 'bootstrap should reject wrong bootstrap key');
  await rejects(() => auth.bootstrap({ email, username, name: 'Session Admin', password, bootstrapKey: 'test-bootstrap-key' }, request), 'bootstrap should remain one-time even with correct key');

  await rejects(() => auth.login({ username, password: 'WrongPass123' }, request), 'login should fail with wrong password');
  const loginOne = await auth.login({ username, password }, request);
  assert(loginOne.token && loginOne.tokenType === 'Bearer' && loginOne.expiresAt, 'login should pass with consistent session response');
  const loginAudit = await prisma.auditLog.findFirst({ where: { actorId: loginOne.user.id, action: 'LOGIN' }, orderBy: { createdAt: 'desc' } });
  assert(loginAudit?.metadata?.sessionIssued === true && loginAudit.metadata.identifier === username, 'login should write session audit metadata');

  const logoutSession = await auth.login({ email, password }, request);
  await auth.validateToken(logoutSession.token);
  await auth.logout(logoutSession.token);
  await rejects(() => auth.validateToken(logoutSession.token), 'logout should revoke token');
  assert(await prisma.auditLog.count({ where: { actorId: logoutSession.user.id, action: 'LOGOUT' } }) === 1, 'logout should write audit log in the revoke transaction');
  const logoutAudit = await prisma.auditLog.findFirst({ where: { actorId: logoutSession.user.id, action: 'LOGOUT' } });
  assert(logoutAudit?.metadata?.tokenRevoked === true, 'logout audit should trace token revoke side effect');

  const primary = await auth.login({ username, password }, request);
  const secondary = await auth.login({ username, password }, request);
  const changed = await auth.changePassword(primary.user.id, { currentPassword: password, newPassword: nextPassword }, primary.token, request);
  assert(changed.token && changed.token !== primary.token && changed.tokenType === 'Bearer', 'change password should issue a fresh consistent session');
  const changePasswordAudit = await prisma.auditLog.findFirst({ where: { actorId: primary.user.id, action: 'CHANGE_PASSWORD' }, orderBy: { createdAt: 'desc' } });
  assert(changePasswordAudit?.metadata?.passwordChanged === true && changePasswordAudit.metadata.sessionsRevoked === 'all', 'change password audit should trace password and session side effects');
  await rejects(() => auth.validateToken(primary.token), 'change password should revoke previous current session');
  await rejects(() => auth.validateToken(secondary.token), 'change password should revoke other sessions');
  await auth.validateToken(changed.token);
  await rejects(() => auth.login({ username, password }, request), 'old password should fail after change password');
  const afterChange = await auth.login({ username, password: nextPassword }, request);
  assert(afterChange.token, 'new password should login after change password');

  await prisma.$disconnect();
  console.log('TEST_AUTH_SESSION_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
