#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
SITE_URL="${SITE_URL:-https://quanly.dunientravel.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
RUN_ID="SMOKE-BIZ-$(date +%s)"

cleanup() {
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "AuditLog" WHERE "entityId" IN (
  SELECT id FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%'
  UNION SELECT id FROM "FinancePayment" WHERE "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%')
);
DELETE FROM "FinanceCashflowEntry" WHERE "paymentId" IN (
  SELECT id FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%'
  UNION SELECT id FROM "FinancePayment" WHERE "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%')
);
DELETE FROM "SupplierLedgerEntry" WHERE "paymentId" IN (
  SELECT id FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%'
  UNION SELECT id FROM "FinancePayment" WHERE "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%')
);
DELETE FROM "OperationVoucherPayment" WHERE "voucherId" IN (SELECT id FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "FinancePayment" WHERE "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%');
DELETE FROM "FinancePayment" WHERE "voucherName" LIKE '%${RUN_ID}%' OR "operationVoucherId" IN (SELECT id FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%') OR id IN (SELECT "financePaymentId" FROM "SupplierPaymentRequest" WHERE code LIKE '${RUN_ID}%' AND "financePaymentId" IS NOT NULL);
DELETE FROM "OperationVoucherDetail" WHERE "voucherId" IN (SELECT id FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%';
DELETE FROM "SupplierLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%';
DELETE FROM "SupplierPaymentItem" WHERE "requestId" IN (SELECT id FROM "SupplierPaymentRequest" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "SupplierPaymentRequest" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "OperationTask" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationCost" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationService" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%';
DELETE FROM "Booking" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "TourItineraryDay" WHERE "tourProgramId" IN (SELECT id FROM "TourProgram" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "TourProgram" WHERE code LIKE '${RUN_ID}%';
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

async function route(token, path) {
  const response = await fetch(site + path, { headers: { Cookie: 'smarttour.auth.token=' + token } });
  if (response.status !== 200) throw new Error('Route ' + path + ' -> ' + response.status);
  console.log('200 ROUTE ' + path);
}

(async () => {
  const token = await login();

  await request(token, 'POST', '/operations/forms', {}, [400]);
  await request(token, 'POST', '/operations/supplier-payment-requests', {}, [400]);

  const supplier = await request(token, 'POST', '/suppliers/restaurants', {
    supplierCode: run + '-SUP',
    name: 'Business Smoke Supplier',
    phone: '0900000000',
    email: 'supplier-' + run.toLowerCase() + '@smarttour.local',
    province: 'HN',
    services: [{ serviceName: 'Set menu', quantity: 1, netPrice: 500000, sellingPrice: 550000 }],
  });

  const customer = await request(token, 'POST', '/customers', {
    code: run + '-CUS',
    fullName: 'Business Smoke Customer',
    phone: '091' + String(Date.now()).slice(-7),
    branch: 'SMOKE-BR',
    department: 'SMOKE-DEP',
  });

  const program = await request(token, 'POST', '/tour-programs', { code: run + '-TP', name: 'Business Smoke Program', route: 'HN', durationDays: 1 });
  const booking = await request(token, 'POST', '/bookings', {
    code: run + '-BKG',
    tourProgramId: program.id,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    paxCount: 2,
    startDate: '2026-08-01',
    endDate: '2026-08-01',
  });

  const form = await request(token, 'POST', '/operations/forms', {
    bookingId: booking.id,
    notes: run + ' operation form',
    services: [{ supplierId: supplier.id, serviceType: 'MEAL', serviceName: 'Lunch', confirmationStatus: 'WAITING', expectedCost: 500000 }],
    tasks: [{ title: 'Confirm supplier', dueDate: '2026-07-25', status: 'PENDING' }],
    costs: [{ costName: 'Lunch cost', expectedAmount: 500000, actualAmount: 500000, currency: 'VND', notes: run + ' cost' }],
  });
  if (!form.costs?.[0]?.id) throw new Error('Operation form did not create a cost');

  const paymentRequest = await request(token, 'POST', '/operations/supplier-payment-requests', {
    code: run + '-PAY',
    requestedBy: 'business-smoke',
    items: [{ supplierId: supplier.id, costId: form.costs[0].id, amount: 500000, notes: run + ' supplier payment' }],
  });
  await request(token, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/submit', { actor: 'business-smoke' });
  await request(token, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/approve', { actor: 'business-smoke' });
  const requestWithPendingPayment = await request(token, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/create-finance-payment', { actor: 'business-smoke' });
  if (requestWithPendingPayment.status !== 'APPROVED' || requestWithPendingPayment.financePayment?.approvalStatus !== 'PENDING') throw new Error('Supplier payment request was marked paid before finance approval');
  await request(token, 'POST', '/finance/payments/' + requestWithPendingPayment.financePaymentId + '/approve', { actor: 'business-smoke' });
  const paidPaymentRequest = await request(token, 'GET', '/operations/supplier-payment-requests/' + paymentRequest.id);
  if (paidPaymentRequest.status !== 'PAID') throw new Error('Supplier payment request was not reconciled after finance approval');
  await request(token, 'POST', '/finance/payments/' + requestWithPendingPayment.financePaymentId + '/cancel', { actor: 'business-smoke', reason: run + ' cancel supplier request payment' });
  const reopenedPaymentRequest = await request(token, 'GET', '/operations/supplier-payment-requests/' + paymentRequest.id);
  if (reopenedPaymentRequest.status !== 'APPROVED' || reopenedPaymentRequest.financePaymentId) throw new Error('Supplier payment request was not reopened after finance payment cancellation');
  const replacementRequestPayment = await request(token, 'POST', '/operations/supplier-payment-requests/' + paymentRequest.id + '/create-finance-payment', { actor: 'business-smoke' });
  await request(token, 'POST', '/finance/payments/' + replacementRequestPayment.financePaymentId + '/approve', { actor: 'business-smoke' });

  const voucher = await request(token, 'POST', '/operation-vouchers', {
    voucherCode: run + '-VCH',
    bookingId: booking.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    serviceType: 'MEAL',
    serviceName: 'Lunch voucher',
    serviceDate: '2026-08-01',
    paymentDeadline: '2026-08-05',
    createdBy: 'business-smoke',
    details: [{ serviceName: 'Lunch', quantity: 2, unit: 'pax', netPrice: 250000, vat: 0 }],
  });
  await request(token, 'POST', '/operation-vouchers/' + voucher.id + '/payment', { paidAmount: 100000, paymentDate: '2026-07-26', note: run + ' partial payment' });
  const voucherWithPendingPayment = await request(token, 'POST', '/operation-vouchers/' + voucher.id + '/create-payment-voucher');
  const voucherFinancePayment = voucherWithPendingPayment.financePayments?.find((payment) => payment.approvalStatus === 'PENDING');
  if (!voucherFinancePayment || Number(voucherWithPendingPayment.remainAmount) !== 400000) throw new Error('Operation voucher was reconciled before finance approval');
  await request(token, 'POST', '/finance/payments/' + voucherFinancePayment.id + '/approve', { actor: 'business-smoke' });
  const paidVoucher = await request(token, 'GET', '/operation-vouchers/' + voucher.id);
  if (paidVoucher.status !== 'PAID' || Number(paidVoucher.remainAmount) !== 0 || !paidVoucher.payments?.some((payment) => payment.paymentVoucherId === voucherFinancePayment.id)) throw new Error('Operation voucher was not reconciled after finance approval');
  await request(token, 'POST', '/finance/payments/' + voucherFinancePayment.id + '/cancel', { actor: 'business-smoke', reason: run + ' cancel operation voucher payment' });
  const reopenedVoucher = await request(token, 'GET', '/operation-vouchers/' + voucher.id);
  if (reopenedVoucher.status !== 'PARTIAL' || Number(reopenedVoucher.remainAmount) !== 400000 || reopenedVoucher.payments?.some((payment) => payment.paymentVoucherId === voucherFinancePayment.id)) throw new Error('Operation voucher was not reopened after finance payment cancellation');
  const replacementVoucher = await request(token, 'POST', '/operation-vouchers/' + voucher.id + '/create-payment-voucher');
  const replacementVoucherFinancePayment = replacementVoucher.financePayments?.find((payment) => payment.approvalStatus === 'PENDING');
  if (!replacementVoucherFinancePayment) throw new Error('Operation voucher could not create a replacement finance payment after cancellation');
  await request(token, 'POST', '/finance/payments/' + replacementVoucherFinancePayment.id + '/approve', { actor: 'business-smoke' });
  await request(token, 'POST', '/operation-vouchers/' + voucher.id + '/create-payment-voucher', undefined, [400]);

  await request(token, 'GET', '/operations/forms?search=' + encodeURIComponent(run));
  const paymentRequestList = await request(token, 'GET', '/operations/supplier-payment-requests?search=' + encodeURIComponent(run));
  if (!paymentRequestList.some((item) => item.id === paymentRequest.id && item.status === 'PAID' && item.financePayment?.approvalStatus === 'APPROVED')) throw new Error('Supplier payment request list is missing reconciliation state');
  const voucherList = await request(token, 'GET', '/operation-vouchers?search=' + encodeURIComponent(run));
  if (!voucherList.some((item) => item.id === voucher.id && item.status === 'PAID' && item.financePayments?.some((payment) => payment.id === replacementVoucherFinancePayment.id && payment.approvalStatus === 'APPROVED'))) throw new Error('Operation voucher list is missing finance payment reconciliation state');
  const financePaymentList = await request(token, 'GET', '/finance/payments?take=200');
  if (!financePaymentList.rows?.some((item) => item.id === replacementRequestPayment.financePaymentId && item.supplierPaymentRequests?.some((request) => request.code === paymentRequest.code && request.status === 'PAID'))) throw new Error('Finance payment list is missing supplier request reconciliation link');
  if (!financePaymentList.rows?.some((item) => item.id === replacementVoucherFinancePayment.id && item.operationVoucher?.voucherCode === voucher.voucherCode && item.operationVoucher.status === 'PAID')) throw new Error('Finance payment list is missing operation voucher reconciliation link');

  for (const path of ['/customers', '/bookings', '/operations', '/operation-vouchers', '/suppliers/restaurants', '/finance']) await route(token, path);
  console.log('SMOKE_BUSINESS_OK');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
NODE
