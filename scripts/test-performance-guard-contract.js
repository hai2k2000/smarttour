const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, needle, message) {
  assert(source.includes(needle), `${message}\nMissing: ${needle}`);
}

function excludes(source, needle, message) {
  assert(!source.includes(needle), `${message}\nFound: ${needle}`);
}

const usePermissions = read('apps/web/app/usePermissions.tsx');
const orderCenter = read('apps/api/src/modules/order-center/order-center.service.ts');
const quotations = read('apps/api/src/modules/quotations/quotations.service.ts');

includes(
  usePermissions,
  'let permissionSyncPromise',
  'usePermissions should dedupe concurrent /api/auth/me calls across mounted client modules.',
);
includes(
  usePermissions,
  'let cachedPermissionUser',
  'usePermissions should reuse the current authenticated user after a successful sync.',
);
includes(
  usePermissions,
  "window.addEventListener('smarttour:auth-user-updated'",
  'usePermissions should refresh hook state when login/profile updates the stored auth user.',
);

includes(
  orderCenter,
  'type OrderDashboardAggregateRow',
  'Order center dashboard should use one aggregate query instead of eight Prisma calls per request.',
);
includes(
  orderCenter,
  'orderDashboardAggregate',
  'Order center dashboard aggregate should be isolated for reuse and lower query fan-out.',
);
excludes(
  orderCenter,
  'const [total, upcoming, running, completed, cancelled, unpaid, unpaidCost, totals] = await Promise.all',
  'Order center dashboard should not fan out eight concurrent DB queries.',
);

includes(
  quotations,
  'type QuotationDashboardAggregateRow',
  'Quotation dashboard should use one aggregate query instead of six Prisma calls per request.',
);
includes(
  quotations,
  'quotationDashboardAggregate',
  'Quotation dashboard aggregate should be isolated for reuse and lower query fan-out.',
);
excludes(
  quotations,
  'const [total, pending, approved, converted, expired, totals] = await Promise.all',
  'Quotation dashboard should not fan out six concurrent DB queries.',
);

console.log('TEST_PERFORMANCE_GUARD_CONTRACT_OK');
