#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');
const service = fs.readFileSync('apps/api/src/modules/finance/finance.service.ts', 'utf8');
const orderLinks = fs.readFileSync('apps/api/src/modules/finance/finance-order-links.ts', 'utf8');
const finalState = fs.readFileSync('apps/api/src/modules/finance/finance-final-state.ts', 'utf8');
const reconciliation = fs.readFileSync('apps/api/src/modules/finance/finance-payment-reconciliation.ts', 'utf8');
const financeImport = fs.readFileSync('apps/api/src/modules/finance/finance-import.ts', 'utf8');

const failures = [];
const requiredServiceHelpers = [
  'upsertReceiptCashflow',
  'createReceiptReversalCashflow',
  'upsertPaymentCashflow',
  'createPaymentReversalCashflow',
  'upsertReceiptCustomerLedger',
  'createReceiptReversalCustomerLedger',
  'upsertPaymentSupplierLedger',
  'createPaymentReversalSupplierLedger',
  'upsertInvoiceCustomerLedger',
  'createInvoiceReversalCustomerLedger',
  'applyOrderReceipt',
  'applyOrderPayment',
  'reconcileApprovedPayment',
  'reconcileCancelledPayment',
  'financeImportRows',
  'validateReceiptImportRow',
  'validatePaymentImportRow',
];
for (const helper of requiredServiceHelpers) {
  if (!service.includes(helper + '(')) failures.push('FinanceService does not use helper: ' + helper);
}
const forbiddenPrivateHelpers = [
  'applyOrderReceipt', 'applyOrderPayment', 'resolveTourId', 'resolveReceiptCustomer',
  'resolvePaymentSupplier', 'reconcileApprovedPayment', 'reconcileCancelledPayment',
  'financeImportRows', 'parseCsv', 'validateReceiptImportRow', 'validatePaymentImportRow',
];
for (const helper of forbiddenPrivateHelpers) {
  if (service.includes('private ' + helper + '(') || service.includes('private async ' + helper + '(')) {
    failures.push('FinanceService still duplicates helper: ' + helper);
  }
}
if (!orderLinks.includes('RequestUser') || !orderLinks.includes('branchDepartmentScopeWhere')) {
  failures.push('finance-order-links must enforce RequestUser branch/department scope');
}
for (const lock of ['lockFinanceReceipt', 'lockFinancePayment', 'lockFinanceInvoice']) {
  if (!finalState.includes(lock) || !finalState.includes('FOR UPDATE')) failures.push('missing transaction row lock: ' + lock);
  if (!service.includes('await ' + lock + '(tx, id)')) failures.push('FinanceService does not use row lock: ' + lock);
}
if (!reconciliation.includes('throw new BadRequestException')) {
  failures.push('payment reconciliation must fail the transaction when linked data is missing');
}
if (!financeImport.includes('MAX_FINANCE_IMPORT_BYTES') || !financeImport.includes('5 * 1024 * 1024')) {
  failures.push('finance import must enforce the 5 MB payload limit');
}
if (!service.includes("assertImportCodesAvailable('receipts', rows, 'receiptCode', tx)") ||
    !service.includes("assertImportCodesAvailable('payments', rows, 'voucherCode', tx)")) {
  failures.push('finance imports must check duplicate codes inside the transaction');
}
if (failures.length) {
  console.error('FAIL_FINANCE_HELPER_CONTRACTS');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_FINANCE_HELPER_CONTRACTS_OK');
NODE
