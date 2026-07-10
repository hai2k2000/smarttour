#!/usr/bin/env node
const fs = require('fs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, needle, message) {
  assert(source.includes(needle), `${message}\nMissing: ${needle}`);
}

function excludes(source, needle, message) {
  assert(!source.includes(needle), `${message}\nFound: ${needle}`);
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `${startNeedle} must exist`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `${endNeedle} must exist after ${startNeedle}`);
  return source.slice(start, end);
}

const service = fs.readFileSync('apps/api/src/modules/auth/auth.service.ts', 'utf8');
const updateUser = sliceBetween(service, 'async updateUser', '  async listRoles');
const updateRole = sliceBetween(service, 'async updateRole', '  private assertLoginNotThrottled');
const lockUser = sliceBetween(service, 'private async lockUserForManagementWrite', '  private async lockRoleForManagementWrite');
const lockRole = sliceBetween(service, 'private async lockRoleForManagementWrite', '  private assertLoginNotThrottled');

includes(service, 'private async lockUserForManagementWrite', 'Auth user management writes must lock and re-read the User row before scope and permission checks.');
includes(service, 'private async lockRoleForManagementWrite', 'Auth role management writes must lock and re-read the Role row before permission/system-role checks.');
includes(lockUser, 'FROM "User"', 'User management lock must target the User table.');
includes(lockUser, 'FOR UPDATE', 'User management lock must use SELECT ... FOR UPDATE.');
includes(lockUser, 'select: SAFE_USER_SELECT', 'User management lock must return the same safe management projection used by scope checks.');
includes(lockRole, 'FROM "Role"', 'Role management lock must target the Role table.');
includes(lockRole, 'FOR UPDATE', 'Role management lock must use SELECT ... FOR UPDATE.');
includes(lockRole, 'select: ROLE_MANAGEMENT_SELECT', 'Role management lock must return the same role projection used by permission checks.');

includes(updateUser, 'const current = await this.lockUserForManagementWrite(tx, id)', 'updateUser must lock and re-read current user inside the transaction.');
excludes(updateUser, 'const current = await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });', 'updateUser must not use a pre-transaction current user snapshot.');
includes(updateUser, 'this.assertManageableCurrentUser(actor, current)', 'updateUser must check manageability after acquiring the user row lock.');
includes(updateUser, 'current.roles.map((row) => row.role)', 'updateUser must derive unchanged roles from the locked user snapshot.');

includes(updateRole, 'const current = await this.lockRoleForManagementWrite(tx, id)', 'updateRole must lock and re-read current role inside the transaction.');
excludes(updateRole, 'const current = await this.prisma.role.findUnique({ where: { id }, select: ROLE_MANAGEMENT_SELECT });', 'updateRole must not use a pre-transaction current role snapshot.');
includes(updateRole, "if (current.isSystem && nextStatus === 'INACTIVE')", 'updateRole must enforce system-role status guard after acquiring the role row lock.');
includes(updateRole, "if (current.code === 'super_admin' && permissions && !permissions.includes('*'))", 'updateRole must enforce super_admin wildcard guard after acquiring the role row lock.');
includes(updateRole, 'this.assertCanMutateRole(actor, current.permissions.map((permission) => permission.permission))', 'updateRole must check current permissions after acquiring the role row lock.');

console.log('TEST_AUTH_MANAGEMENT_WRITE_LOCK_CONTRACT_OK');
