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

if (failures.length) {
  console.error(['FAIL_DATA_SCOPE_CONTRACT', ...failures].join('\n'));
  process.exit(1);
}

console.log('TEST_DATA_SCOPE_CONTRACT_OK');
