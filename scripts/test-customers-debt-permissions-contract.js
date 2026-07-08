const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/customers/customers.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/customers/customers.service.ts', 'utf8');
const client = fs.readFileSync('apps/web/app/customers/CustomersClient.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, token, message) {
  assert(source.includes(token), message || `Missing expected source: ${token}`);
}

function matches(source, pattern, message) {
  assert(pattern.test(source), message || `Missing expected pattern: ${pattern}`);
}

includes(controller, "@RequirePermissions('customer.view', 'finance.debt.view')\n  debts(", 'Customer debt endpoint should require finance.debt.view in addition to customer.view.');

includes(service, "userPermissions } from '../auth/data-scope';", 'Customers service should inspect permissions before including debt data.');
includes(service, 'private canViewDebt(user?: RequestUser)', 'Customers service should define a debt permission helper.');
includes(service, "return permissions.has('*') || permissions.has('finance.debt.view');", 'Debt permission helper should allow wildcard and finance.debt.view only.');
includes(service, 'private emptyDebtSummary() {', 'Customers service should provide a zero debt summary for unauthorized detail/dashboard payloads.');
matches(service, /const canViewDebt = this\.canViewDebt\(user\);[\s\S]*totalDebt: canViewDebt \? totalDebt : 0/, 'Customer dashboard should zero totalDebt without finance.debt.view.');
matches(service, /const debts = this\.canViewDebt\(user\)[\s\S]*\? await this\.debts\(id, user\)[\s\S]*: this\.emptyDebtSummary\(\)/, 'Customer detail should not compute or embed debts without finance.debt.view.');

includes(client, "const canViewDebt = can('finance.debt.view');", 'Customers client should derive finance.debt.view.');
matches(client, /\{canViewDebt \? <Metric label="[^"]+" value=\{money\(dashboard\.totalDebt\)\} \/> : null\}/, 'Customers dashboard should hide debt metric without finance.debt.view.');
matches(client, /\{canViewDebt \? <div><span>[^<]+<\/span><strong>\{money\(selected\.related\?\.debts\.receivableDebt \|\| 0\)\}<\/strong><\/div> : null\}/, 'Customer detail should hide debt summary without finance.debt.view.');

console.log('TEST_CUSTOMERS_DEBT_PERMISSIONS_CONTRACT_OK');
