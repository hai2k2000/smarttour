#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
SITE_URL="${SITE_URL:-https://quanly.dunientravel.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
RUN_ID="SMOKE-FIN-$(date +%s)"

cleanup() {
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "AuditLog" WHERE "entityId" IN (
  SELECT id FROM "CustomerLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%'
  UNION SELECT id FROM "SupplierLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%'
  UNION SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%'
  UNION SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%'
  UNION SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%'
);
DELETE FROM "FinanceCashflowEntry" WHERE "receiptId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%') OR "paymentId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "CustomerLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%';
DELETE FROM "SupplierLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%';
DELETE FROM "FinanceInvoiceItem" WHERE "invoiceId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%';
DELETE FROM "FinanceReceiptOrder" WHERE "receiptId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%';
DELETE FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%';
DELETE FROM "CustomerTimeline" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "Customer" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "SupplierContact" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "SupplierService" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%';
SQL
}
trap cleanup EXIT

node <<NODE
const api = '$API_URL';
const site = '$SITE_URL';
const run = '$RUN_ID';
const adminEmail = '$ADMIN_EMAIL';
const adminPassword = '$ADMIN_PASSWORD';

async function login() {
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
  const data = await response.json().catch(() => ({}));
  const token = data.token || data.accessToken;
  if (!response.ok || !token) throw new Error('Admin login failed: ' + response.status + ' ' + JSON.stringify(data));
  return token;
}

async function request(token, method, path, body, ok = [200, 201]) {
  const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!ok.includes(response.status)) throw new Error(method + ' ' + path + ' -> ' + response.status + ' ' + text.slice(0, 300));
  console.log(response.status + ' ' + method + ' ' + path);
  return data;
}

async function csv(token, path, expected) {
  const response = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token } });
  const text = await response.text();
  if (response.status !== 200 || (expected && !text.includes(expected))) throw new Error('CSV ' + path + ' -> ' + response.status + ' missing ' + expected + ': ' + text.slice(0, 200));
  console.log('200 CSV ' + path);
  return text;
}

async function route(token, path) {
  const response = await fetch(site + path, { headers: { Cookie: 'smarttour.auth.token=' + token } });
  if (response.status !== 200) throw new Error('Route ' + path + ' -> ' + response.status);
  console.log('200 ROUTE ' + path);
}

function contains(data, needle) {
  return JSON.stringify(data).includes(needle);
}

(async () => {
  const token = await login();

  const customer = await request(token, 'POST', '/customers', {
    code: run + '-CUS',
    fullName: 'Finance Smoke Customer',
    phone: '092' + String(Date.now()).slice(-7),
    branch: 'FIN-BR',
    department: 'FIN-DEP',
  });
  const supplier = await request(token, 'POST', '/suppliers/restaurants', {
    supplierCode: run + '-SUP',
    name: 'Finance Smoke Supplier',
    phone: '0930000000',
    email: 'fin-supplier-' + run.toLowerCase() + '@smarttour.local',
  });

  const receipt = await request(token, 'POST', '/finance/receipts', {
    receiptCode: run + '-RCPT',
    receiptName: 'Finance Smoke Receipt',
    receiptType: 'TOUR_PAYMENT',
    paymentDate: '2026-08-10',
    paymentMethod: 'BANK_TRANSFER',
    customerId: customer.id,
    payerName: customer.fullName,
    payerPhone: customer.phone,
    reason: run + ' receipt',
    totalAmount: 1000000,
    paidBefore: 0,
    receiptAmount: 1000000,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
    assignedStaff: 'finance-smoke',
    createdBy: 'finance-smoke',
  });
  await request(token, 'POST', '/finance/receipts/' + receipt.id + '/approve', { actor: 'finance-smoke' });

  const payment = await request(token, 'POST', '/finance/payments', {
    voucherCode: run + '-PAY',
    voucherName: 'Finance Smoke Payment',
    voucherType: 'SUPPLIER_PAYMENT',
    paymentDate: '2026-08-11',
    paymentMethod: 'BANK_TRANSFER',
    supplierId: supplier.id,
    receiverName: supplier.name,
    reason: run + ' payment',
    totalAmount: 400000,
    paymentAmount: 400000,
    branch: 'FIN-BR',
    department: 'FIN-DEP',
    assignedStaff: 'finance-smoke',
    createdBy: 'finance-smoke',
  });
  await request(token, 'POST', '/finance/payments/' + payment.id + '/approve', { actor: 'finance-smoke' });

  const invoice = await request(token, 'POST', '/finance/invoices', {
    invoiceCode: run + '-INV',
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    companyName: 'Finance Smoke Co',
    invoiceType: 'VAT',
    issuedDate: '2026-08-12',
    paymentMethod: 'BANK_TRANSFER',
    note: run + ' invoice',
    createdBy: 'finance-smoke',
    items: [{ itemName: 'Tour service', unit: 'package', quantity: 1, unitPrice: 1000000, taxRate: 8 }],
  });
  await request(token, 'POST', '/finance/invoices/' + invoice.id + '/approve', { actor: 'finance-smoke' });
  const customerAdjustment = await request(token, 'POST', '/finance/debt/customers/' + customer.id + '/adjustments', {
    direction: 'INCREASE',
    amount: 1200000,
    dueDate: '2026-01-01',
    documentCode: run + '-CUS-ADJ',
    description: run + ' customer debt adjustment',
  });
  const supplierAdjustment = await request(token, 'POST', '/finance/debt/suppliers/' + supplier.id + '/adjustments', {
    direction: 'INCREASE',
    amount: 500000,
    dueDate: '2026-01-01',
    documentCode: run + '-SUP-ADJ',
    description: run + ' supplier debt adjustment',
  });

  const receipts = await request(token, 'GET', '/finance/receipts?search=' + encodeURIComponent(run));
  if (!contains(receipts, run + '-RCPT')) throw new Error('Receipt list missing smoke receipt');
  const payments = await request(token, 'GET', '/finance/payments?search=' + encodeURIComponent(run));
  if (!contains(payments, run + '-PAY')) throw new Error('Payment list missing smoke payment');
  const invoices = await request(token, 'GET', '/finance/invoices?search=' + encodeURIComponent(run));
  if (!contains(invoices, run + '-INV')) throw new Error('Invoice list missing smoke invoice');

  const cashflow = await request(token, 'GET', '/finance/cashflow?branch=FIN-BR&department=FIN-DEP');
  if (!contains(cashflow, receipt.id) || !contains(cashflow, payment.id)) throw new Error('Cashflow missing approved receipt/payment');
  const customerDebt = await request(token, 'GET', '/finance/debt/customers?customerId=' + customer.id);
  if (!contains(customerDebt, invoice.id) || !contains(customerDebt, receipt.id) || !contains(customerDebt, customerAdjustment.id)) throw new Error('Customer debt missing ledger entries');
  if (customerDebt.rows?.[0]?.id !== customer.id || !customerDebt.rows?.[0]?.aging || !Array.isArray(customerDebt.entries)) throw new Error('Customer debt grouping contract is invalid');
  if (!(customerDebt.rows[0].aging.overdueTotal > 0)) throw new Error('Customer debt aging did not expose overdue amount');
  const supplierDebt = await request(token, 'GET', '/finance/debt/suppliers?supplierId=' + supplier.id);
  if (!contains(supplierDebt, payment.id) || !contains(supplierDebt, supplierAdjustment.id)) throw new Error('Supplier debt missing ledger entry');
  if (supplierDebt.rows?.[0]?.id !== supplier.id || !supplierDebt.rows?.[0]?.aging || !Array.isArray(supplierDebt.entries)) throw new Error('Supplier debt grouping contract is invalid');
  if (!(supplierDebt.rows[0].aging.overdueTotal > 0)) throw new Error('Supplier debt aging did not expose overdue amount');

  await request(token, 'GET', '/reports/overview?branch=FIN-BR');
  await request(token, 'GET', '/reports/business-summary?branch=FIN-BR');
  await request(token, 'GET', '/reports/finance?branch=FIN-BR');
  await request(token, 'GET', '/reports/debt/customers?branch=FIN-BR');
  await request(token, 'GET', '/reports/debt/suppliers?supplier=' + encodeURIComponent('Finance Smoke Supplier'));
  await request(token, 'GET', '/reports/employees/performance?employee=finance-smoke');

  await csv(token, '/finance/receipts/export?search=' + encodeURIComponent(run), run + '-RCPT');
  await csv(token, '/finance/payments/export?search=' + encodeURIComponent(run), run + '-PAY');
  await csv(token, '/finance/invoices/export?search=' + encodeURIComponent(run), run + '-INV');
  await csv(token, '/finance/cashflow/export?branch=FIN-BR&department=FIN-DEP', run);
  await csv(token, '/reports/export/customer-debt?branch=FIN-BR');
  await csv(token, '/reports/export/supplier-debt?supplier=' + encodeURIComponent('Finance Smoke Supplier'));
  await csv(token, '/reports/export/finance?branch=FIN-BR');

  for (const path of ['/finance', '/reports', '/commission-reports']) await route(token, path);
  console.log('SMOKE_FINANCE_REPORTS_OK');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
NODE
