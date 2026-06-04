import { Prisma } from '@prisma/client';
import { hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';

export const NO_BOOKING_DATA_SCOPE_ID = '__no_data_scope__';

export function bookingScopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser | null): Prisma.BookingWhereInput {
  if (!user || hasUnrestrictedDataScope(user)) return where;
  const OR = bookingScopeRelationConditions(user);
  if (!OR.length) return noBookingDataScopeWhere(where);
  return { AND: [where, { OR }] };
}

export function bookingScopeRelationConditions(user: RequestUser): Prisma.BookingWhereInput[] {
  const permissions = userPermissions(user);
  const requiresBranch = permissions.has('data.scope.branch');
  const requiresDepartment = permissions.has('data.scope.department');
  if ((requiresBranch && !user.branch) || (requiresDepartment && !user.department)) return [];

  const conditions: Prisma.BookingWhereInput[] = [];
  if (requiresBranch && user.branch) {
    conditions.push({ customer: { branch: user.branch } }, { order: { branch: user.branch } }, { tour: { branch: user.branch } });
  }
  if (requiresDepartment && user.department) {
    conditions.push(
      { customer: { department: user.department } },
      { order: { department: user.department } },
      { tour: { department: user.department } },
    );
  }
  return conditions;
}

export function noBookingDataScopeWhere(where: Prisma.BookingWhereInput): Prisma.BookingWhereInput {
  return { AND: [where, { id: NO_BOOKING_DATA_SCOPE_ID }] };
}
