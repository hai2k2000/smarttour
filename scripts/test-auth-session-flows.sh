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
  assert(boot.token && boot.user.email === email, 'bootstrap without key should create first admin and issue token');
  await auth.validateToken(boot.token);

  await rejects(() => auth.bootstrap({ email: 'other@example.com', name: 'Other', password }), 'bootstrap should lock without key once users exist');

  process.env.SMARTTOUR_BOOTSTRAP_KEY = 'test-bootstrap-key';
  await rejects(() => auth.bootstrap({ email, username, name: 'Session Admin', password, bootstrapKey: 'wrong' }), 'bootstrap should reject wrong bootstrap key');

  const bootWithKey = await auth.bootstrap({ email, username, name: 'Session Admin', password, bootstrapKey: 'test-bootstrap-key' }, request);
  assert(bootWithKey.token, 'bootstrap with key should issue token when users exist');

  await rejects(() => auth.login({ username, password: 'WrongPass123' }, request), 'login should fail with wrong password');
  const loginOne = await auth.login({ username, password }, request);
  assert(loginOne.token, 'login should pass with correct password');

  const logoutSession = await auth.login({ email, password }, request);
  await auth.validateToken(logoutSession.token);
  await auth.logout(logoutSession.token, logoutSession.user.id);
  await rejects(() => auth.validateToken(logoutSession.token), 'logout should revoke token');

  const primary = await auth.login({ username, password }, request);
  const secondary = await auth.login({ username, password }, request);
  await auth.changePassword(primary.user.id, { currentPassword: password, newPassword: nextPassword }, primary.token);
  await auth.validateToken(primary.token);
  await rejects(() => auth.validateToken(secondary.token), 'change password should revoke other sessions');
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
