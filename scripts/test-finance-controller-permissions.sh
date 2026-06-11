#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/modules/finance/finance.controller.ts';
const rawSource = fs.readFileSync(file, 'utf8');
const source = rawSource.split(/\r?\n/);

const domainServices = [
  'FinanceReceiptService',
  'FinancePaymentService',
  'FinanceInvoiceService',
  'FinanceLedgerService',
  'FinanceCashflowService',
];

const expected = {
  receipts: ['GET', 'finance.receipt.view'],
  createReceipt: ['POST', 'finance.receipt.create'],
  exportReceipts: ['GET', 'finance.receipt.export'],
  importReceipts: ['POST', 'finance.receipt.import'],
  receipt: ['GET', 'finance.receipt.view'],
  uploadReceiptFile: ['POST', 'finance.receipt.update'],
  deleteReceiptFile: ['DELETE', 'finance.receipt.update'],
  updateReceipt: ['PUT', 'finance.receipt.update'],
  deleteReceipt: ['DELETE', 'finance.receipt.delete'],
  approveReceipt: ['POST', 'finance.receipt.approve'],
  rejectReceipt: ['POST', 'finance.receipt.approve'],
  cancelReceipt: ['POST', 'finance.receipt.approve'],
  payments: ['GET', 'finance.payment.view'],
  createPayment: ['POST', 'finance.payment.create'],
  exportPayments: ['GET', 'finance.payment.export'],
  importPayments: ['POST', 'finance.payment.import'],
  payment: ['GET', 'finance.payment.view'],
  uploadPaymentFile: ['POST', 'finance.payment.update'],
  deletePaymentFile: ['DELETE', 'finance.payment.update'],
  updatePayment: ['PUT', 'finance.payment.update'],
  deletePayment: ['DELETE', 'finance.payment.delete'],
  approvePayment: ['POST', 'finance.payment.approve'],
  rejectPayment: ['POST', 'finance.payment.approve'],
  cancelPayment: ['POST', 'finance.payment.approve'],
  invoices: ['GET', 'finance.invoice.view'],
  createInvoice: ['POST', 'finance.invoice.create'],
  exportInvoices: ['GET', 'finance.invoice.export'],
  invoice: ['GET', 'finance.invoice.view'],
  uploadInvoiceFile: ['POST', 'finance.invoice.update'],
  deleteInvoiceFile: ['DELETE', 'finance.invoice.update'],
  updateInvoice: ['PUT', 'finance.invoice.update'],
  deleteInvoice: ['DELETE', 'finance.invoice.delete'],
  approveInvoice: ['POST', 'finance.invoice.approve'],
  rejectInvoice: ['POST', 'finance.invoice.approve'],
  cancelInvoice: ['POST', 'finance.invoice.approve'],
  customerDebt: ['GET', 'finance.cashflow.view'],
  createCustomerDebtAdjustment: ['POST', 'finance.debt.adjust'],
  supplierDebt: ['GET', 'finance.cashflow.view'],
  createSupplierDebtAdjustment: ['POST', 'finance.debt.adjust'],
  cashflow: ['GET', 'finance.cashflow.view'],
  exportCashflow: ['GET', 'finance.cashflow.export'],
};

const routes = {};
let decorators = [];
for (const line of source) {
  const trimmed = line.trim();
  if (trimmed.startsWith('@')) {
    decorators.push(trimmed);
    continue;
  }
  const method = trimmed.match(/^(?:async\s+)?([A-Za-z0-9_]+)\s*\(/)?.[1];
  if (!method) {
    if (trimmed && !trimmed.startsWith('//')) decorators = [];
    continue;
  }
  const http = decorators.find((decorator) => /^@(Get|Post|Put|Delete|Patch)\b/.test(decorator))?.match(/^@(Get|Post|Put|Delete|Patch)\b/)?.[1]?.toUpperCase();
  const permissions = decorators
    .filter((decorator) => /^@RequirePermissions\b/.test(decorator))
    .flatMap((decorator) => [...decorator.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] || match[2]));
  if (http) routes[method] = { http, permissions };
  decorators = [];
}

const failures = [];
if (rawSource.includes("import { FinanceService } from './finance.service';")) {
  failures.push('FinanceController must route through finance domain services instead of injecting FinanceService directly');
}
for (const service of domainServices) {
  if (!rawSource.includes(service)) failures.push(`FinanceController missing domain service injection: ${service}`);
}
for (const [method, [http, permission]] of Object.entries(expected)) {
  const route = routes[method];
  if (!route) {
    failures.push(`missing finance endpoint method: ${method}`);
    continue;
  }
  if (route.http !== http) failures.push(`${method} expected ${http}, got ${route.http}`);
  if (route.permissions.length !== 1 || route.permissions[0] !== permission) {
    failures.push(`${method} expected ${permission}, got ${route.permissions.join(',') || '<none>'}`);
  }
}
for (const method of Object.keys(routes)) {
  if (!expected[method] && method !== 'constructor') failures.push(`unexpected finance endpoint without expected permission mapping: ${method}`);
}

if (failures.length) {
  console.error('FAIL_FINANCE_CONTROLLER_PERMISSIONS');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_FINANCE_CONTROLLER_PERMISSIONS_OK');
NODE
