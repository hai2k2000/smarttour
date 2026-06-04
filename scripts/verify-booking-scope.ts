import assert from 'node:assert/strict';
import { bookingScopeWhere, NO_BOOKING_DATA_SCOPE_ID } from '../apps/api/src/modules/bookings/booking-scope';
import { RequestUser } from '../apps/api/src/modules/auth/data-scope';

const baseWhere = { code: { contains: 'BK' } };

function mockUser(input: { permissions: string[]; branch?: string | null; department?: string | null }): RequestUser {
  return {
    id: 'user-1',
    email: 'scope@test.local',
    name: 'Scope Tester',
    username: 'scope-tester',
    passwordHash: 'hidden',
    status: 'ACTIVE',
    branch: input.branch ?? null,
    department: input.department ?? null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    roles: [
      {
        id: 'user-role-1',
        userId: 'user-1',
        roleId: 'role-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        role: {
          id: 'role-1',
          code: 'scope_role',
          name: 'Scope role',
          description: null,
          status: 'ACTIVE',
          scope: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          permissions: input.permissions.map((permission, index) => ({
            id: `permission-${index}`,
            roleId: 'role-1',
            permission,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          })),
        },
      },
    ],
  } as RequestUser;
}

function scopedOr(where: unknown) {
  const scopedWhere = where as { AND?: Array<Record<string, unknown>> };
  assert.deepEqual(scopedWhere.AND?.[0], baseWhere);
  return scopedWhere.AND?.[1]?.OR;
}

function assertNoDataScope(where: unknown) {
  assert.deepEqual(where, { AND: [baseWhere, { id: NO_BOOKING_DATA_SCOPE_ID }] });
}

assert.deepEqual(bookingScopeWhere(baseWhere), baseWhere);
assert.deepEqual(bookingScopeWhere(baseWhere, mockUser({ permissions: ['data.scope.all'] })), baseWhere);

assert.deepEqual(scopedOr(bookingScopeWhere(baseWhere, mockUser({ permissions: ['data.scope.branch'], branch: 'HN' }))), [
  { customer: { branch: 'HN' } },
  { order: { branch: 'HN' } },
  { tour: { branch: 'HN' } },
]);

assert.deepEqual(scopedOr(bookingScopeWhere(baseWhere, mockUser({ permissions: ['data.scope.department'], department: 'OPS' }))), [
  { customer: { department: 'OPS' } },
  { order: { department: 'OPS' } },
  { tour: { department: 'OPS' } },
]);

assert.deepEqual(
  scopedOr(bookingScopeWhere(baseWhere, mockUser({ permissions: ['data.scope.branch', 'data.scope.department'], branch: 'HN', department: 'OPS' }))),
  [
    { customer: { branch: 'HN' } },
    { order: { branch: 'HN' } },
    { tour: { branch: 'HN' } },
    { customer: { department: 'OPS' } },
    { order: { department: 'OPS' } },
    { tour: { department: 'OPS' } },
  ],
);

assertNoDataScope(bookingScopeWhere(baseWhere, mockUser({ permissions: ['data.scope.branch'] })));
assertNoDataScope(bookingScopeWhere(baseWhere, mockUser({ permissions: ['data.scope.department'] })));
assertNoDataScope(bookingScopeWhere(baseWhere, mockUser({ permissions: [] })));

console.log('BOOKING_SCOPE_OK');
