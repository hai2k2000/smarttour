#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null

docker compose run --rm --entrypoint node api <<'NODE'
const { applyWriteDataScope, branchDepartmentScopeWhere, hasUnrestrictedDataScope, userPermissions } = require('./apps/api/dist/modules/auth/data-scope');

function role(...permissions) {
  return { role: { permissions: permissions.map((permission) => ({ permission })) } };
}

function user(branch, department, ...permissions) {
  return { branch, department, roles: [role(...permissions)] };
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

const branchUser = user('BR-A', 'DEP-A', 'data.scope.branch');
const departmentUser = user('BR-A', 'DEP-A', 'data.scope.department');
const mixedUser = user('BR-A', 'DEP-A', 'data.scope.branch', 'data.scope.department');
const allUser = user(null, null, 'data.scope.all');
const noScopeUser = user(null, null, 'customer.manage');

assert(userPermissions(mixedUser).has('data.scope.branch'), 'permissions should flatten user roles');
assert(hasUnrestrictedDataScope(allUser), 'data.scope.all should be unrestricted');

const branchWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, branchUser);
assert(branchWhere.AND?.[1]?.OR?.[0]?.branch === 'BR-A', 'branch scope should add branch filter');

const departmentWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, departmentUser);
assert(departmentWhere.AND?.[1]?.OR?.[0]?.department === 'DEP-A', 'department scope should add department filter');

const mixedWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, mixedUser);
assert(mixedWhere.AND?.[1]?.OR?.length === 2, 'mixed scope should allow branch or department match');

const deniedWhere = branchDepartmentScopeWhere({ status: 'ACTIVE' }, noScopeUser);
assert(deniedWhere.AND?.[1]?.id === '__no_data_scope__', 'missing scope should deny reads');

const branchWrite = applyWriteDataScope({ name: 'A' }, branchUser);
assert(branchWrite.branch === 'BR-A', 'branch scoped write should inject branch');

const departmentWrite = applyWriteDataScope({ name: 'A' }, departmentUser);
assert(departmentWrite.department === 'DEP-A', 'department scoped write should inject department');

let rejected = false;
try {
  applyWriteDataScope({ branch: 'BR-B' }, branchUser);
} catch {
  rejected = true;
}
assert(rejected, 'branch scoped write should reject other branch');

const unrestricted = applyWriteDataScope({ branch: 'BR-X' }, allUser);
assert(unrestricted.branch === 'BR-X', 'unrestricted user should keep submitted branch');

console.log('TEST_AUTH_DATA_SCOPE_OK');
NODE
