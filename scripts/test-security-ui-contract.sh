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
for (const text of [
  'Người dùng, vai trò và phân quyền',
  'Trạng thái phiên',
  'Phiên hợp lệ',
  'Phiên hết hạn',
  'Thông tin đăng nhập',
  'Vai trò và phạm vi dữ liệu',
  'Danh sách quyền',
  'Danh mục quyền tham khảo theo nhóm',
  'Phạm vi dữ liệu',
  'Toàn bộ dữ liệu hệ thống',
  'Theo chi nhánh người dùng',
  'Theo phòng ban người dùng',
  'Mỗi quyền một dòng',
]) {
  assert(source.includes(text), `Security UI should display normalized Vietnamese text: ${text}`);
}
assert(!source.includes('commonQuyền'), 'Security UI should not keep mixed Vietnamese/code labels');
assert(!source.includes('Metric label="Token"'), 'Security UI should avoid technical Token wording for end users');
for (const helper of ['validStatus', 'permissionSummary', 'permissionTitle', 'CellText']) {
  assert(new RegExp(`function\\s+${helper}\\b`).test(source), `Security UI should keep ${helper} helper`);
}
assert(source.includes("setUsers([])") && source.includes("setRoles([])"), 'Security load should clear stale users/roles when an API branch fails');
assert(source.includes('actionError(error, action)'), 'Security send() should pass action context into actionError');
assert(source.includes("action === 'changePassword'") && source.includes('Mật khẩu hiện tại không đúng'), 'Password change errors should be specific to the action');
assert(source.includes('USER_STATUS_OPTIONS') && source.includes('ROLE_STATUS_OPTIONS'), 'Security UI should validate status values against explicit option sets');
assert(source.includes('title={tooltip}'), 'Security table cells should expose full truncated text through title');
assert(source.includes('permissionSummary(role)') && source.includes('permissionTitle(role)'), 'Role permission table should summarize long permission lists');
assert(source.includes('onSelectUser={setSelectedUserId}') && source.includes('onSelectRole={setSelectedRoleId}'), 'Update modals should keep selected user/role state wiring');
assert(source.includes('aria-modal="true"') && source.includes('role="dialog"'), 'Security modals should remain accessible dialogs');

console.log('TEST_SECURITY_UI_CONTRACT_OK');
NODE
