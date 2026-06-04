#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_auth_management_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_AUTH_MANAGEMENT_DATA missing POSTGRES_PASSWORD"
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

async function main() {
  process.env.SMARTTOUR_ENV = 'development';
  delete process.env.SMARTTOUR_BOOTSTRAP_KEY;
  const prisma = new PrismaService();
  await prisma.$connect();
  const auth = new AuthService(prisma, new AuthSessionService(prisma));

  const boot = await auth.bootstrap({
    email: 'security-admin@example.com',
    username: 'security-admin',
    name: 'Security Admin',
    password: 'StartPass123',
  });
  await auth.createRole({
    code: 'branch_manager',
    name: 'Branch Manager',
    description: 'Scoped management role',
    permissions: ['auth.user.manage', 'data.scope.branch'],
  }, boot.user.id);
  await auth.createUser({
    email: 'branch-user@example.com',
    username: 'branch-user',
    name: 'Branch User',
    password: 'BranchPass123',
    branch: 'Hanoi',
    roleCodes: ['branch_manager'],
  }, boot.user.id);

  const users = await auth.listUsers(boot.user.id);
  const branchUser = users.find((user) => user.email === 'branch-user@example.com');
  assert(branchUser, 'created user should appear in listUsers');
  assert(!('passwordHash' in branchUser), 'listUsers must not expose passwordHash');
  assert(!('sessions' in branchUser), 'listUsers must not expose sessions');
  assert(!('tokenHash' in branchUser), 'listUsers must not expose tokenHash');
  assert(branchUser.dataScope === 'branch' && branchUser.branch === 'Hanoi', 'listUsers should expose clear data scope metadata');
  assert(Array.isArray(branchUser.roles) && branchUser.roles.every((role) => Object.keys(role).sort().join(',') === 'code,name'), 'listUsers role projection should only contain code and name');
  assert(Array.isArray(branchUser.permissions) && branchUser.permissions.includes('auth.user.manage'), 'listUsers should expose flattened permissions');

  const roles = await auth.listRoles(boot.user.id);
  const branchRole = roles.find((role) => role.code === 'branch_manager');
  assert(branchRole, 'created role should appear in listRoles');
  assert(!('users' in branchRole), 'listRoles must not expose user records');
  assert(branchRole._count?.users === 1, 'listRoles should expose only user count');
  assert(Array.isArray(branchRole.permissions) && branchRole.permissions.some((entry) => entry.permission === 'data.scope.branch'), 'listRoles should expose permission metadata');

  const serialized = JSON.stringify({ users, roles });
  for (const sensitive of ['passwordHash', 'tokenHash', 'userAgent', 'ipAddress', 'revokedAt']) {
    assert(!serialized.includes(sensitive), `management responses must not expose ${sensitive}`);
  }

  await prisma.$disconnect();
  console.log('TEST_AUTH_MANAGEMENT_DATA_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
