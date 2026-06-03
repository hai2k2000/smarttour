const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checks = [
  { file: 'apps/api/src/modules/customers/customers.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/tours/tours.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/orders/orders.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/order-center/order-center.service.ts', must: ['branchDepartmentScopeWhere'] },
  { file: 'apps/api/src/modules/quotations/quotations.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/bookings/bookings.service.ts', must: ['RequestUser', 'scopeWhere'] },
  { file: 'apps/api/src/modules/finance/finance.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope', 'invoiceScopeWhere', 'assertInvoiceWriteScope'] },
  { file: 'apps/api/src/modules/fit-tours/fit-tours.service.ts', must: ['RequestUser', 'fitTourScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/git-tours/git-tours.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/landtours/landtours.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts', must: ['RequestUser', 'scopeWhere'] },
  { file: 'apps/api/src/modules/operations/operations.service.ts', must: ['RequestUser', 'formScopeWhere', 'paymentRequestScopeWhere'] },
  { file: 'apps/api/src/modules/reports/reports.service.ts', must: ['branchDepartmentScopeWhere'] },
  { file: 'apps/api/src/modules/commission-reports/commission-reports.service.ts', must: ['branchDepartmentScopeWhere'] },
];

const controllerChecks = [
  'apps/api/src/modules/finance/finance.controller.ts',
  'apps/api/src/modules/fit-tours/fit-tours.controller.ts',
  'apps/api/src/modules/git-tours/git-tours.controller.ts',
  'apps/api/src/modules/landtours/landtours.controller.ts',
];

const schemaScopeGaps = [
  {
    file: 'apps/api/src/modules/quotes/quotes.service.ts',
    reason: 'TourQuote has customerId but no branch/department field; QuoteCombo has no customer/branch link',
    must: ['listTourQuotes', 'listComboQuotes', 'getTourQuote', 'getComboQuote'],
  },
];

const failures = [];

for (const check of checks) {
  const fullPath = path.join(root, check.file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${check.file}: missing`);
    continue;
  }
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const token of check.must) {
    if (!source.includes(token)) failures.push(`${check.file}: missing ${token}`);
  }
}

for (const file of controllerChecks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes('@Req()')) failures.push(`${file}: missing @Req() user propagation`);
  if (!source.includes('RequestUser')) failures.push(`${file}: missing RequestUser typing`);
}

for (const gap of schemaScopeGaps) {
  const source = fs.readFileSync(path.join(root, gap.file), 'utf8');
  for (const token of gap.must) {
    if (!source.includes(token)) failures.push(`${gap.file}: missing tracked no-scope token ${token}`);
  }
  if (!gap.reason) failures.push(`${gap.file}: schema scope gap must document reason`);
}

if (failures.length) {
  console.error(['DATA_SCOPE_AUDIT_FAILED', ...failures].join('\n'));
  process.exit(1);
}

console.log('DATA_SCOPE_AUDIT_OK');
