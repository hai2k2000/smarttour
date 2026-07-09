#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Thiếu file ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function requireText(source, value, label) {
  if (!source.includes(value)) failures.push(`${label}: thiếu ${value}`);
}

function requireBlockText(source, start, end, value, label) {
  const startIndex = source.indexOf(start);
  const endIndex = end ? source.indexOf(end, startIndex === -1 ? 0 : startIndex) : source.length;
  const block = startIndex === -1 || endIndex === -1 ? '' : source.slice(startIndex, endIndex);
  requireText(block, value, label);
}

const apiSuite = read('scripts/test-data-scope-api-flows.sh');
for (const scope of ['data.scope.branch', 'data.scope.department', 'data.scope.all']) {
  requireText(apiSuite, scope, 'API data-scope suite');
}

for (const endpoint of [
  '/customers?search=',
  '/customers/dashboard?search=',
  '/customers/export?search=',
  '/customers/',
  '/orders/fit-tours?search=',
  '/orders/fit-tours/',
  '/operations/forms?search=',
  '/operations/dashboard',
  '/operations/forms/',
  '/reports/overview?search=',
  '/reports/business-summary?search=',
  '/reports/export/revenue?search=',
]) {
  requireText(apiSuite, endpoint, 'API data-scope suite');
}

for (const marker of [
  'branch user should',
  'department user should',
  'unrestricted user should',
  'status: 404',
  'TEST_DATA_SCOPE_API_FLOWS_OK',
]) {
  requireText(apiSuite, marker, 'API data-scope suite');
}

const verification = read('scripts/verify-data-scope.sh');
requireText(verification, 'scripts/test-data-scope-api-flows.sh', 'Data-scope verification');

const audit = read('scripts/audit-data-scope.js');
for (const controller of [
  'apps/api/src/modules/customers/customers.controller.ts',
  'apps/api/src/modules/orders/orders.controller.ts',
  'apps/api/src/modules/operations/operations.controller.ts',
  'apps/api/src/modules/reports/reports.controller.ts',
]) {
  requireText(audit, controller, 'Data-scope controller audit');
}

const packageJson = read('package.json');
requireText(packageJson, '"test:data-scope"', 'Package scripts');

const customersService = read('apps/api/src/modules/customers/customers.service.ts');
requireText(customersService, "import { bookingScopeWhere } from '../bookings/booking-scope';", 'Customer service data-scope linking');
for (const [value, label] of [
  ['tx.order.updateMany({ where: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ customerId: sourceId }, user)', 'merge order scope'],
  ['tx.booking.updateMany({ where: bookingScopeWhere({ customerId: sourceId }, user)', 'merge booking scope'],
  ['tx.tourQuote.updateMany({ where: this.tourQuoteScopeWhere({ customerId: sourceId }, user)', 'merge tour quote scope'],
  ['tx.tourCustomer.updateMany({ where: this.tourCustomerScopeWhere({ crmCustomerId: sourceId }, user)', 'merge tour customer scope'],
  ['tx.fitTour.updateMany({ where: this.fitTourScopeWhere({ customerId: sourceId }, user)', 'merge FIT tour scope'],
  ['tx.financeReceipt.updateMany({ where: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ customerId: sourceId }, user)', 'merge finance receipt scope'],
  ['tx.financeInvoice.updateMany({ where: this.financeInvoiceScopeWhere({ customerId: sourceId }, user)', 'merge finance invoice scope'],
]) requireBlockText(customersService, 'async merge(', 'async transferOwner(', value, `Customer service ${label}`);
for (const [value, label] of [
  ['tx.tourQuote.updateMany({ where: this.tourQuoteScopeWhere({ customerId: null, OR: customerOr }, user)', 'link tour quote scope'],
  ['tx.booking.updateMany({ where: bookingScopeWhere({ customerId: null, OR: customerOr }, user)', 'link booking scope'],
  ['tx.tourCustomer.updateMany({ where: this.tourCustomerScopeWhere({ crmCustomerId: null, OR: tourCustomerOr }, user)', 'link tour customer scope'],
  ['tx.fitTour.updateMany({ where: this.fitTourScopeWhere({ customerId: null, OR: fitTourOr }, user)', 'link FIT tour scope'],
  ['tx.financeInvoice.updateMany({ where: this.financeInvoiceScopeWhere({ customerId: null, OR: customerOr }, user)', 'link finance invoice scope'],
]) requireBlockText(customersService, 'private async linkExistingData(', 'private canViewDebt(', value, `Customer service ${label}`);

if (failures.length) {
  console.error(['FAIL_DATA_SCOPE_CONTRACT', ...failures].join('\n'));
  process.exit(1);
}

console.log('TEST_DATA_SCOPE_CONTRACT_OK');
