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
const reports = read('apps/api/src/modules/reports/reports.service.ts');

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

includes(
  reports,
  'const FINANCE_REPORT_DETAIL_LIMIT = 200',
  'Finance report API should cap detail rows for screen payload performance.',
);
for (const needle of [
  'orderRows: orderRows.slice(0, FINANCE_REPORT_DETAIL_LIMIT)',
  'receiptRows: receiptRows.slice(0, FINANCE_REPORT_DETAIL_LIMIT).map',
  'paymentRows: paymentRows.slice(0, FINANCE_REPORT_DETAIL_LIMIT).map',
  'customerDebtRows: customerDebtReport.rows.slice(0, FINANCE_REPORT_DETAIL_LIMIT)',
  'supplierDebtRows: supplierDebtReport.rows.slice(0, FINANCE_REPORT_DETAIL_LIMIT)',
  'reconciliationRows: reconciliationRows.slice(0, FINANCE_REPORT_DETAIL_LIMIT)',
]) {
  includes(reports, needle, 'Finance report API must cap detail arrays returned to the interactive report screen.');
}
excludes(
  reports,
  'orders: orders.slice(0, FINANCE_REPORT_DETAIL_LIMIT)',
  'Finance report API should not return raw Order records when normalized orderRows are already returned.',
);

for (const needle of [
  'select: this.financeOrderSelect()',
  'select: this.financeReceiptSelect()',
  'select: this.financePaymentSelect()',
  'select: this.financeCashflowSelect()',
]) {
  includes(
    reports,
    needle,
    'Finance report detail queries should use lightweight select projections instead of full entity includes.',
  );
}
for (const needle of [
  'include: { customer: true, orders: true }',
  'include: { supplier: true, order: true, tour: true, operationVoucher: true }',
  'include: { order: true, tour: true, customer: true, supplier: true }',
]) {
  excludes(
    reports,
    needle,
    'Finance report detail queries should not hydrate full related entities for the interactive report screen.',
  );
}


for (const needle of [
  "this.customerDebtReport({ ...query, dateField: 'documentDate' }, user, FINANCE_REPORT_DETAIL_LIMIT)",
  "this.supplierDebtReport({ ...query, dateField: 'documentDate' }, user, FINANCE_REPORT_DETAIL_LIMIT)",
  'return this.customerDebtReport(query, user, 1000)',
  'return this.supplierDebtReport(query, user, 1000)',
]) {
  includes(
    reports,
    needle,
    'Finance report should cap expensive debt detail rows without changing standalone debt report limits.',
  );
}

console.log('TEST_PERFORMANCE_GUARD_CONTRACT_OK');
