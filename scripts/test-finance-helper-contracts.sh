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
for (const [method, summaryHelper] of [
  ['listReceipts', 'receiptSummaryFromDb'],
  ['listPayments', 'paymentSummaryFromDb'],
  ['listInvoices', 'invoiceSummaryFromDb'],
]) {
  const start = service.indexOf('async ' + method + '(');
  const next = service.indexOf('\n  async ', start + 1);
  const block = start === -1 ? '' : service.slice(start, next === -1 ? service.length : next);
  if (!block.includes(summaryHelper + '(')) failures.push(method + ' must use aggregate/count summary helper: ' + summaryHelper);
  if (block.includes('summaryRows') || block.includes('findMany({ where })')) failures.push(method + ' must not load all matching finance rows for summary');
}
for (const helper of ['receiptSummaryFromDb', 'paymentSummaryFromDb', 'invoiceSummaryFromDb']) {
  const start = service.indexOf('private async ' + helper + '(');
  const block = start === -1 ? '' : service.slice(start, start + 1200);
  if (!block.includes('.count({') || !block.includes('.aggregate({')) failures.push(helper + ' must use database count and aggregate');
}
for (const [method, summaryHelper, oldSummary] of [
  ['customerDebt', 'customerLedgerSummaryFromDb', 'ledgerSummary(summaryEntries)'],
  ['supplierDebt', 'supplierLedgerSummaryFromDb', 'supplierLedgerSummary(summaryEntries)'],
]) {
  const start = service.indexOf('async ' + method + '(');
  const next = service.indexOf('\n  async ', start + 1);
  const block = start === -1 ? '' : service.slice(start, next === -1 ? service.length : next);
  if (!block.includes(summaryHelper + '(where)')) failures.push(method + ' must use aggregate/count ledger summary helper: ' + summaryHelper);
  if (block.includes(oldSummary)) failures.push(method + ' must not summarize debt from full ledger rows');
}
for (const helper of ['customerLedgerSummaryFromDb', 'supplierLedgerSummaryFromDb']) {
  const start = service.indexOf('private async ' + helper + '(');
  const block = start === -1 ? '' : service.slice(start, start + 1200);
  if (!block.includes('.aggregate({') || !block.includes('_count: { _all: true }')) failures.push(helper + ' must use database aggregate and count');
}
{
  const start = service.indexOf('async cashflow(');
  const next = service.indexOf('\n  async ', start + 1);
  const block = start === -1 ? '' : service.slice(start, next === -1 ? service.length : next);
  if (!block.includes('cashflowSummaryFromDb(where)')) failures.push('cashflow must use aggregate/groupBy summary helper');
  if (block.includes('summaryRows') || block.includes('findMany({ where })') || block.includes('.reduce(')) failures.push('cashflow must not load all matching cashflow rows for summary');
}
{
  const start = service.indexOf('private async cashflowSummaryFromDb(');
  const block = start === -1 ? '' : service.slice(start, start + 1600);
  if (!block.includes('.groupBy({') || !block.includes('_sum: { amount: true }')) failures.push('cashflowSummaryFromDb must use database groupBy amount sums');
}
if (failures.length) {
  console.error('FAIL_FINANCE_HELPER_CONTRACTS');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_FINANCE_HELPER_CONTRACTS_OK');
NODE
