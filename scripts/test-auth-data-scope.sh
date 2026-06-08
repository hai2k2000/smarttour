#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_data_scope_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_AUTH_DATA_SCOPE missing POSTGRES_PASSWORD"
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
const { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, userPermissions } = require('./apps/api/dist/modules/auth/data-scope');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');

function role(...permissions) {
  return { role: { permissions: permissions.map((permission) => ({ permission })) } };
}

function user(branch, department, ...permissions) {
  return { branch, department, roles: [role(...permissions)] };
}

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
  const branchUser = user('BR-A', 'DEP-A', 'data.scope.branch');
  const departmentUser = user('BR-A', 'DEP-A', 'data.scope.department');
  const mixedUser = user('BR-A', 'DEP-A', 'data.scope.branch', 'data.scope.department');
  const allUser = user(null, null, 'data.scope.all');
  const noScopeUser = user(null, null, 'customer.manage');
  const missingBranchUser = user(null, 'DEP-A', 'data.scope.branch');
  const missingDepartmentUser = user('BR-A', null, 'data.scope.department');
  const missingMixedUser = user('BR-A', null, 'data.scope.branch', 'data.scope.department');

  assert(userPermissions(mixedUser).has('data.scope.branch'), 'permissions should flatten user roles');
  assert(hasUnrestrictedDataScope(allUser), 'data.scope.all should be unrestricted');

  const branchWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, branchUser);
  assert(branchWhere.AND?.[1]?.branch === 'BR-A', 'branch scope should add branch filter');

  const departmentWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, departmentUser);
  assert(departmentWhere.AND?.[1]?.department === 'DEP-A', 'department scope should add department filter');

  const mixedWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, mixedUser);
  assert(mixedWhere.AND?.[1]?.branch === 'BR-A' && mixedWhere.AND?.[2]?.department === 'DEP-A', 'mixed scope should require branch and department match');

  const deniedWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, noScopeUser);
  assert(deniedWhere.AND?.[1]?.id === '__no_data_scope__', 'missing scope should deny reads');

  const missingBranchWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, missingBranchUser);
  assert(missingBranchWhere.AND?.[1]?.id === '__no_data_scope__', 'missing branch value should deny branch-scoped reads');

  const missingDepartmentWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, missingDepartmentUser);
  assert(missingDepartmentWhere.AND?.[1]?.id === '__no_data_scope__', 'missing department value should deny department-scoped reads');

  const missingMixedWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, missingMixedUser);
  assert(missingMixedWhere.AND?.[1]?.id === '__no_data_scope__', 'missing one mixed scope value should deny mixed scoped reads');

  const branchWrite = applyWriteDataScope({ name: 'A' }, branchUser);
  assert(branchWrite.branch === 'BR-A', 'branch scoped write should inject branch');

  const departmentWrite = applyWriteDataScope({ name: 'A' }, departmentUser);
  assert(departmentWrite.department === 'DEP-A', 'department scoped write should inject department');

  await rejects(() => applyWriteDataScope({ branch: 'BR-B' }, branchUser), 'branch scoped write should reject other branch');
  await rejects(() => applyWriteDataScope({ name: 'A' }, noScopeUser), 'scoped write should reject users without data scope permission');
  await rejects(() => applyWriteDataScope({ name: 'A' }, missingBranchUser), 'branch scoped write should reject users without branch');
  await rejects(() => applyWriteDataScope({ name: 'A' }, missingDepartmentUser), 'department scoped write should reject users without department');
  await rejects(() => applyWriteDataScope({ name: 'A' }, missingMixedUser), 'mixed scoped write should reject users missing one scoped value');

  const unrestricted = applyWriteDataScope({ branch: 'BR-X' }, allUser);
  assert(unrestricted.branch === 'BR-X', 'unrestricted user should keep submitted branch');

  const prisma = new PrismaService();
  await prisma.$connect();
  await prisma.customer.createMany({
    data: [
      { code: 'SCOPE-BR-A', fullName: 'Branch A', phone: '0900000001', branch: 'BR-A', department: 'DEP-X' },
      { code: 'SCOPE-BOTH', fullName: 'Branch Department A', phone: '0900000004', branch: 'BR-A', department: 'DEP-A' },
      { code: 'SCOPE-DEP-A', fullName: 'Department A', phone: '0900000002', branch: 'BR-X', department: 'DEP-A' },
      { code: 'SCOPE-OUT', fullName: 'Out Of Scope', phone: '0900000003', branch: 'BR-X', department: 'DEP-X' },
    ],
  });

  const branchRows = await prisma.customer.findMany({ where: branchDepartmentScopeWhere({}, branchUser), orderBy: { code: 'asc' } });
  assert(branchRows.map((row) => row.code).join(',') === 'SCOPE-BOTH,SCOPE-BR-A', 'branch scoped read should only see branch rows');

  const departmentRows = await prisma.customer.findMany({ where: branchDepartmentScopeWhere({}, departmentUser), orderBy: { code: 'asc' } });
  assert(departmentRows.map((row) => row.code).join(',') === 'SCOPE-BOTH,SCOPE-DEP-A', 'department scoped read should only see department rows');

  const mixedRows = await prisma.customer.findMany({ where: branchDepartmentScopeWhere({}, mixedUser), orderBy: { code: 'asc' } });
  assert(mixedRows.map((row) => row.code).join(',') === 'SCOPE-BOTH', 'mixed scoped read should require both branch and department rows');

  const deniedRows = await prisma.customer.findMany({ where: branchDepartmentScopeWhere({}, noScopeUser) });
  assert(deniedRows.length === 0, 'missing scope should not see sensitive rows');

  await prisma.$disconnect();
  console.log('TEST_AUTH_DATA_SCOPE_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
