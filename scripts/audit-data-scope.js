const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checks = [
  { file: 'apps/api/src/modules/customers/customers.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/tours/tours.service.ts', must: ['tourCore.scopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/orders/orders.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/order-center/order-center.service.ts', must: ['branchDepartmentScopeWhere'] },
  { file: 'apps/api/src/modules/quotations/quotations.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/bookings/bookings.service.ts', must: ['RequestUser', 'scopeWhere', 'branchDepartmentScopeWhere'] },
  { file: 'apps/api/src/modules/finance/finance.service.ts', must: ['branchDepartmentScopeWhere', 'applyWriteDataScope', 'invoiceScopeWhere', 'assertInvoiceWriteScope'] },
  { file: 'apps/api/src/modules/fit-tours/fit-tours.service.ts', must: ['RequestUser', 'fitTourScopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/git-tours/git-tours.service.ts', must: ['tourCore.scopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/landtours/landtours.service.ts', must: ['tourCore.scopeWhere', 'applyWriteDataScope'] },
  { file: 'apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts', must: ['RequestUser', 'scopeWhere', 'applyWriteDataScope', 'branchDepartmentScopeWhere'] },
  { file: 'apps/api/src/modules/operations/operations.service.ts', must: ['RequestUser', 'formScopeWhere', 'paymentRequestScopeWhere', 'bookingScopeWhere', 'orderScopeWhere', 'tourScopeWhere', 'applyScopedWriteMeta'] },
  { file: 'apps/api/src/modules/reports/reports.service.ts', must: ['branchDepartmentScopeWhere'] },
  { file: 'apps/api/src/modules/commission-reports/commission-reports.service.ts', must: ['branchDepartmentScopeWhere'] },
];

const controllerChecks = [
  'apps/api/src/modules/bookings/bookings.controller.ts',
  'apps/api/src/modules/customers/customers.controller.ts',
  'apps/api/src/modules/finance/finance.controller.ts',
  'apps/api/src/modules/fit-tours/fit-tours.controller.ts',
  'apps/api/src/modules/git-tours/git-tours.controller.ts',
  'apps/api/src/modules/landtours/landtours.controller.ts',
  'apps/api/src/modules/operation-vouchers/operation-vouchers.controller.ts',
  'apps/api/src/modules/operations/operations.controller.ts',
  'apps/api/src/modules/orders/orders.controller.ts',
  'apps/api/src/modules/reports/reports.controller.ts',
  'apps/api/src/modules/suppliers/suppliers.controller.ts',
  'apps/api/src/modules/tour-guides/tour-guides.controller.ts',
];

const schemaScopeGaps = [
  {
    file: 'apps/api/src/modules/suppliers/suppliers.service.ts',
    reason: 'Supplier, SupplierService, and SupplierAllotment are global catalog models without branch/department fields; allotment allocation writes are scoped through linked order/booking/tour records',
    must: ['listSuppliers', 'listTypedSuppliers', 'listHotelSuppliers', 'lockAllotment', 'RequestUser', 'branchDepartmentScopeWhere', 'bookingScopeWhere', 'allotmentAllocationScopeWhere'],
  },
  {
    file: 'apps/api/src/modules/tour-guides/tour-guides.service.ts',
    reason: 'GuideProfile is a global guide catalog model without branch/department fields; guide schedule writes are scoped through linked Tour/Order records',
    must: ['list(search', 'validateScheduleLinks', 'RequestUser', 'branchDepartmentScopeWhere', 'applyWriteDataScope'],
  },
  {
    file: 'apps/api/src/modules/tour-programs/tour-programs.service.ts',
    reason: 'TourProgram and TourItineraryDay are reusable program templates without branch/department fields',
    must: ['list(search', 'createItineraryDay'],
  },
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
