#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
RUN_ID="SMOKE-CANCEL-$(date +%s)"

cleanup() {
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "AuditLog" WHERE metadata::text LIKE '%${RUN_ID}%' OR "entityId" IN (
  SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%'
  UNION SELECT id FROM "FinanceReceipt" WHERE "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%')
  UNION SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%'
  UNION SELECT id FROM "FinancePayment" WHERE "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%')
  UNION SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%'
  UNION SELECT id FROM "FinanceInvoice" WHERE "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%')
  UNION SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%'
);
DELETE FROM "FinanceCashflowEntry" WHERE "receiptId" IN (
  SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%')
) OR "paymentId" IN (
  SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%')
);
DELETE FROM "CustomerLedgerEntry" WHERE "receiptId" IN (
  SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%')
) OR "invoiceId" IN (
  SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%')
);
DELETE FROM "SupplierLedgerEntry" WHERE "paymentId" IN (
  SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%')
);
DELETE FROM "FinanceInvoiceItem" WHERE "invoiceId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceInvoice" WHERE "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%';
DELETE FROM "FinanceReceiptOrder" WHERE "receiptId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceReceipt" WHERE "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%';
DELETE FROM "FinancePayment" WHERE "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%';
DELETE FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%';
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

(async () => {
  const token = await login();
  const customer = await request(token, 'POST', '/customers', { code: run + '-CUS', fullName: 'Cancel Smoke Customer', phone: '094' + String(Date.now()).slice(-7) });
  const supplier = await request(token, 'POST', '/suppliers/restaurants', { supplierCode: run + '-SUP', name: 'Cancel Smoke Supplier', phone: '0950000000' });
  const order = await request(token, 'POST', '/orders/single-services', {
    systemCode: run + '-ORD',
    name: 'Cancel Smoke Order',
    customerId: customer.id,
    salesItems: [{ description: 'Cancel smoke revenue', quantity: 1, serviceCount: 1, unitPrice: 1000000 }],
    operationItems: [{ serviceType: 'OTHER', quantity: 1, netPrice: 400000 }],
  });
  const receipt = await request(token, 'POST', '/finance/receipts', {
    receiptCode: run + '-RCPT',
    receiptName: 'Cancel Smoke Receipt',
    receiptType: 'TOUR_PAYMENT',
    customerId: customer.id,
    totalAmount: 1000000,
    receiptAmount: 1000000,
    orders: [{ orderId: order.id, orderCode: order.systemCode, amount: 1000000 }],
  });
  await request(token, 'POST', '/finance/receipts/' + receipt.id + '/approve', { actor: 'cancel-smoke' });
  const payment = await request(token, 'POST', '/finance/payments', {
    voucherCode: run + '-PAY',
    voucherName: 'Cancel Smoke Payment',
    voucherType: 'SUPPLIER_PAYMENT',
    supplierId: supplier.id,
    orderId: order.id,
    totalAmount: 400000,
    paymentAmount: 400000,
  });
  await request(token, 'POST', '/finance/payments/' + payment.id + '/approve', { actor: 'cancel-smoke' });
  const paidOrder = await request(token, 'GET', '/orders/single-services/' + order.id);
  if (Number(paidOrder.paidAmount) !== 1000000 || paidOrder.paymentStatus !== 'PAID' || Number(paidOrder.paidCost) !== 400000 || paidOrder.costStatus !== 'PAID') throw new Error('Order totals were not updated after finance approval');

  const cancelledReceipt = await request(token, 'POST', '/finance/receipts/' + receipt.id + '/cancel', { actor: 'cancel-smoke', reason: run + ' cancel receipt' });
  const cancelledReceiptAgain = await request(token, 'POST', '/finance/receipts/' + receipt.id + '/cancel', { actor: 'cancel-smoke', reason: run + ' cancel receipt again' });
  if (cancelledReceipt.reversals?.length !== 1 || cancelledReceiptAgain.reversals?.length !== 1) throw new Error('Receipt cancellation is not idempotent');
  const cancelledPayment = await request(token, 'POST', '/finance/payments/' + payment.id + '/cancel', { actor: 'cancel-smoke', reason: run + ' cancel payment' });
  const cancelledPaymentAgain = await request(token, 'POST', '/finance/payments/' + payment.id + '/cancel', { actor: 'cancel-smoke', reason: run + ' cancel payment again' });
  if (cancelledPayment.reversals?.length !== 1 || cancelledPaymentAgain.reversals?.length !== 1) throw new Error('Payment cancellation is not idempotent');
  const reopenedOrder = await request(token, 'GET', '/orders/single-services/' + order.id);
  if (Number(reopenedOrder.paidAmount) !== 0 || reopenedOrder.paymentStatus !== 'UNPAID' || Number(reopenedOrder.paidCost) !== 0 || reopenedOrder.costStatus !== 'PENDING') throw new Error('Order totals were not reversed after finance cancellation');

  const invoice = await request(token, 'POST', '/finance/invoices', {
    invoiceCode: run + '-INV',
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceType: 'VAT',
    items: [{ itemName: 'Cancel smoke invoice', quantity: 1, unitPrice: 1000000, taxRate: 8 }],
  });
  await request(token, 'POST', '/finance/invoices/' + invoice.id + '/approve', { actor: 'cancel-smoke' });
  const cancelledInvoice = await request(token, 'POST', '/finance/invoices/' + invoice.id + '/cancel', { actor: 'cancel-smoke', reason: run + ' cancel invoice' });
  const cancelledInvoiceAgain = await request(token, 'POST', '/finance/invoices/' + invoice.id + '/cancel', { actor: 'cancel-smoke', reason: run + ' cancel invoice again' });
  if (cancelledInvoice.reversals?.length !== 1 || cancelledInvoiceAgain.reversals?.length !== 1) throw new Error('Invoice cancellation is not idempotent');
  console.log('SMOKE_FINANCE_CANCELLATIONS_OK');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
NODE
