#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');

const source = fs.readFileSync('apps/web/app/security/SecurityClient.tsx', 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

for (const component of ['PasswordModal', 'UserModal', 'RoleModal', 'SecurityModal']) {
  assert(new RegExp(`function\\s+${component}\\b`).test(source), `Security UI should define ${component}`);
}
for (const state of ['password', 'createUser', 'updateUser', 'createRole', 'updateRole']) {
  assert(source.includes(`activeModal === '${state}'`), `Security UI should render ${state} modal`);
}
for (const [path, action] of [
  ['/api/auth/users', 'createUser'],
  ['/api/auth/roles', 'createRole'],
  ['/api/auth/change-password', 'changePassword'],
]) {
  assert(source.includes(`'${path}'`) && source.includes(`'${action}'`), `Security UI should wire ${action} to ${path}`);
}
for (const field of ['username', 'email', 'name', 'password', 'status', 'branch', 'department', 'roleCodes', 'permissions', 'currentPassword', 'newPassword']) {
  assert(new RegExp(`name="${field}"`).test(source), `Security UI modal should contain field ${field}`);
}
for (const helper of ['validateRoleCodes', 'validateDataScope', 'updateAuthSession', 'loadError', 'actionError']) {
  assert(new RegExp(`function\\s+${helper}\\b`).test(source), `Security UI should keep ${helper} helper`);
}
for (const permission of ['auth.user.manage', 'auth.role.manage', 'data.scope.all', 'data.scope.branch', 'data.scope.department']) {
  assert(source.includes(permission), `Security UI permission catalog should include ${permission}`);
}
assert(source.includes('onSelectUser={setSelectedUserId}') && source.includes('onSelectRole={setSelectedRoleId}'), 'Update modals should keep selected user/role state wiring');
assert(source.includes('aria-modal="true"') && source.includes('role="dialog"'), 'Security modals should remain accessible dialogs');

console.log('TEST_SECURITY_UI_CONTRACT_OK');
NODE
