import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type RequestUser = Prisma.UserGetPayload<{
  include: { roles: { include: { role: { include: { permissions: true } } } } };
}>;

type ScopeFields = { branch?: string | null; department?: string | null };
type DataScopeRequirement = 'branch' | 'department';

export function userPermissions(user?: RequestUser | null) {
  return new Set(user?.roles.flatMap((row) => row.role.permissions.map((permission) => permission.permission)) || []);
}

export function hasUnrestrictedDataScope(user?: RequestUser | null) {
  const permissions = userPermissions(user);
  return permissions.has('*') || permissions.has('data.scope.all');
}

export function branchDepartmentScopeWhere<T extends object>(where: T, user?: RequestUser | null): T {
  if (!user || hasUnrestrictedDataScope(user)) return where;
  const permissions = userPermissions(user);
  const requirements = scopedRequirements(permissions);
  if (!requirements.length || hasMissingScopeValue(user, requirements)) return noDataScopeWhere(where);
  const AND: Array<T | ScopeFields> = [where];
  if (permissions.has('data.scope.branch') && user.branch) AND.push({ branch: user.branch });
  if (permissions.has('data.scope.department') && user.department) AND.push({ department: user.department });
  if (AND.length === 1) return noDataScopeWhere(where);
  return { AND } as T;
}

export function applyWriteDataScope<T extends ScopeFields>(dto: T, user?: RequestUser | null): T {
  if (!user || hasUnrestrictedDataScope(user)) return dto;
  const permissions = userPermissions(user);
  const requirements = scopedRequirements(permissions);
  if (!requirements.length) throw new BadRequestException('User data scope is required for scoped writes');
  const scoped = { ...dto };
  if (permissions.has('data.scope.branch')) {
    if (!user.branch) throw new BadRequestException('User branch is required for branch scoped writes');
    if (scoped.branch && scoped.branch !== user.branch) throw new BadRequestException('Cannot write data outside your branch');
    scoped.branch = user.branch;
  }
  if (permissions.has('data.scope.department')) {
    if (!user.department) throw new BadRequestException('User department is required for department scoped writes');
    if (scoped.department && scoped.department !== user.department) throw new BadRequestException('Cannot write data outside your department');
    scoped.department = user.department;
  }
  return scoped;
}

function scopedRequirements(permissions: Set<string>): DataScopeRequirement[] {
  const requirements: DataScopeRequirement[] = [];
  if (permissions.has('data.scope.branch')) requirements.push('branch');
  if (permissions.has('data.scope.department')) requirements.push('department');
  return requirements;
}

function hasMissingScopeValue(user: RequestUser, requirements: DataScopeRequirement[]) {
  return requirements.some((requirement) => !user[requirement]);
}

function noDataScopeWhere<T extends object>(where: T): T {
  return { AND: [where, { id: '__no_data_scope__' }] } as T;
}
