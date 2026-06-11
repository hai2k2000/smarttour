#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/modules/finance/finance.controller.ts';
const rawSource = fs.readFileSync(file, 'utf8');
const uploadFilterSource = fs.readFileSync('apps/api/src/modules/files/file-upload-size-exception.filter.ts', 'utf8');
const debtPermissionMigration = fs.readFileSync('prisma/migrations/20260611150000_finance_debt_view_permission/migration.sql', 'utf8');
const permissionLabels = fs.readFileSync('apps/web/app/i18n.ts', 'utf8');
const securityClient = fs.readFileSync('apps/web/app/security/SecurityClient.tsx', 'utf8');
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
  customerDebt: ['GET', 'finance.debt.view'],
  createCustomerDebtAdjustment: ['POST', 'finance.debt.adjust'],
  supplierDebt: ['GET', 'finance.debt.view'],
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
if (!uploadFilterSource.includes('@Catch(PayloadTooLargeException)') || !uploadFilterSource.includes('File v\u01b0\u1ee3t qu\u00e1 gi\u1edbi h\u1ea1n')) {
  failures.push('oversized uploads must return a clear Vietnamese error');
}
if (!debtPermissionMigration.includes("existing.permission = 'finance.cashflow.view'") || !debtPermissionMigration.includes("'finance.debt.view'")) {
  failures.push('debt view permission migration must preserve existing cashflow viewers');
}
if (!permissionLabels.includes("'finance.debt.view'") || !securityClient.includes("'finance.debt.view'")) {
  failures.push('finance.debt.view must be exposed in permission labels and role management');
}
const uploadMethods = ['uploadReceiptFile', 'uploadPaymentFile', 'uploadInvoiceFile'];
if ((rawSource.match(/fileUploadInterceptorOptions\(\)/g) || []).length !== uploadMethods.length) {
  failures.push('finance uploads must use the shared file upload interceptor options');
}
if ((rawSource.match(/@ApiConsumes\('multipart\/form-data'\)/g) || []).length !== uploadMethods.length + 2) {
  failures.push('finance uploads and CSV imports must document multipart/form-data');
}
if ((rawSource.match(/financeImportInterceptorOptions\(\)/g) || []).length !== 2) {
  failures.push('finance CSV imports must use the dedicated import interceptor options');
}
if ((rawSource.match(/@UseFilters\(FinanceImportSizeExceptionFilter\)/g) || []).length !== 2) {
  failures.push('finance CSV imports must translate oversized file errors');
}
if ((rawSource.match(/@UseFilters\(FileUploadSizeExceptionFilter\)/g) || []).length !== uploadMethods.length) {
  failures.push('finance uploads must translate oversized upload errors');
}
if (rawSource.includes('10 * 1024 * 1024')) {
  failures.push('finance uploads must not hardcode the file size limit');
}
if ((rawSource.match(/C\u1ea7n ch\u1ecdn file \u0111\u1ec3 t\u1ea3i l\u00ean/g) || []).length !== uploadMethods.length) {
  failures.push('finance uploads must reject missing files with a Vietnamese message');
}

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
