const fs = require('fs');

const expectedActions = [
  ['apps/api/src/modules/bookings/bookings.controller.ts', 'updateStatus'],
  ['apps/api/src/modules/commission-reports/commission-reports.controller.ts', 'sync'],
  ['apps/api/src/modules/commission-reports/commission-reports.controller.ts', 'approve'],
  ['apps/api/src/modules/commission-reports/commission-reports.controller.ts', 'reject'],
  ['apps/api/src/modules/commission-reports/commission-reports.controller.ts', 'revoke'],
  ['apps/api/src/modules/commission-reports/commission-reports.controller.ts', 'pay'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'approveReceipt'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'rejectReceipt'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'cancelReceipt'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'approvePayment'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'rejectPayment'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'cancelPayment'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'approveInvoice'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'rejectInvoice'],
  ['apps/api/src/modules/finance/finance.controller.ts', 'cancelInvoice'],
  ['apps/api/src/modules/operations/operations.controller.ts', 'updateFormStatus'],
  ['apps/api/src/modules/operations/operations.controller.ts', 'cancelFormLegacy'],
  ['apps/api/src/modules/operations/operations.controller.ts', 'cancelForm'],
  ['apps/api/src/modules/operations/operations.controller.ts', 'submitPaymentRequest'],
  ['apps/api/src/modules/operations/operations.controller.ts', 'approvePaymentRequest'],
  ['apps/api/src/modules/operations/operations.controller.ts', 'rejectPaymentRequest'],
  ['apps/api/src/modules/operations/operations.controller.ts', 'createFinancePaymentForRequest'],
  ['apps/api/src/modules/orders/orders.controller.ts', 'updateStatus'],
  ['apps/api/src/modules/orders/orders.controller.ts', 'copy'],
  ['apps/api/src/modules/orders/orders.controller.ts', 'settle'],
  ['apps/api/src/modules/orders/orders.controller.ts', 'unlock'],
  ['apps/api/src/modules/quotations/quotations.controller.ts', 'submit'],
  ['apps/api/src/modules/quotations/quotations.controller.ts', 'approve'],
  ['apps/api/src/modules/quotations/quotations.controller.ts', 'reject'],
  ['apps/api/src/modules/quotations/quotations.controller.ts', 'smartLink'],
  ['apps/api/src/modules/quotations/quotations.controller.ts', 'convert'],
  ['apps/api/src/modules/quotes/quotes.controller.ts', 'approveTour'],
  ['apps/api/src/modules/quotes/quotes.controller.ts', 'rejectTour'],
  ['apps/api/src/modules/quotes/quotes.controller.ts', 'convertTour'],
  ['apps/api/src/modules/quotes/quotes.controller.ts', 'createQuoteFromCombo'],
  ['apps/api/src/modules/quotes/quotes.controller.ts', 'createOrderFromCombo'],
  ['apps/api/src/modules/quotes/quotes.controller.ts', 'recalculateCombo'],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', 'overrideAllotment'],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', 'lockAllotment'],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', 'confirmAllotment'],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', 'releaseAllotment'],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', 'updateTypedStatus'],
  ['apps/api/src/modules/suppliers/suppliers.controller.ts', 'updateStatus'],
];

const decoratorPattern = /^\s*@/;
const methodPattern = /^\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/;

function controllerMethods(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const methods = new Map();
  let decorators = [];
  for (const line of lines) {
    if (decoratorPattern.test(line)) {
      decorators.push(line.trim());
      continue;
    }
    const method = line.match(methodPattern)?.[1];
    if (method) {
      methods.set(method, decorators);
      decorators = [];
      continue;
    }
    if (line.trim() && !line.trim().startsWith('//')) decorators = [];
  }
  return methods;
}

const grouped = new Map();
for (const [file, method] of expectedActions) {
  const methods = grouped.get(file) ?? controllerMethods(file);
  grouped.set(file, methods);
  const decorators = methods.get(method);
  if (!decorators) continue;
}

const failures = [];
for (const [file, method] of expectedActions) {
  const decorators = grouped.get(file).get(method);
  if (!decorators) {
    failures.push(`${file}:${method} is missing`);
    continue;
  }
  const hasHttpCode200 = decorators.some((decorator) => decorator === '@HttpCode(200)');
  if (!hasHttpCode200) failures.push(`${file}:${method} must declare @HttpCode(200)`);
}

for (const file of new Set(expectedActions.map(([file]) => file))) {
  const source = fs.readFileSync(file, 'utf8');
  const hasHttpCodeRequirement = expectedActions.some(([actionFile, method]) => actionFile === file && grouped.get(file).get(method));
  if (hasHttpCodeRequirement && !source.includes('HttpCode')) {
    failures.push(`${file} must import HttpCode from @nestjs/common`);
  }
}

if (failures.length) {
  console.error('FAIL_ACTION_ENDPOINT_STATUS_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_ACTION_ENDPOINT_STATUS_CONTRACT_OK');
