import { Prisma } from '@prisma/client';
import { hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';

export const NO_BOOKING_DATA_SCOPE_ID = '__no_data_scope__';

export function bookingScopeWhere(where: Prisma.BookingWhereInput, user?: RequestUser | null): Prisma.BookingWhereInput {
  if (!user || hasUnrestrictedDataScope(user)) return where;
  const scopeConditions = bookingScopeRelationConditions(user);
  if (!scopeConditions.length) return noBookingDataScopeWhere(where);
  return { AND: [where, ...scopeConditions] };
}

export function bookingScopeRelationConditions(user: RequestUser): Prisma.BookingWhereInput[] {
  const permissions = userPermissions(user);
  const requiresBranch = permissions.has('data.scope.branch');
  const requiresDepartment = permissions.has('data.scope.department');
  if ((requiresBranch && !user.branch) || (requiresDepartment && !user.department)) return [];

  const relationScope = {
    ...(requiresBranch ? { branch: user.branch as string } : {}),
    ...(requiresDepartment ? { department: user.department as string } : {}),
  };
  if (!Object.keys(relationScope).length) return [];

  return [
    {
      OR: [
        { customer: relationScope },
        { order: relationScope },
        { tour: relationScope },
      ],
    },
  ];
}

export function noBookingDataScopeWhere(where: Prisma.BookingWhereInput): Prisma.BookingWhereInput {
  return { AND: [where, { id: NO_BOOKING_DATA_SCOPE_ID }] };
}
