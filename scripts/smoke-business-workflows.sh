#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
SITE_URL="${SITE_URL:-https://aitour.io.vn}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
RUN_ID="SMOKE-BIZ-$(date +%s)"

cleanup() {
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "OperationVoucherPayment" WHERE "voucherId" IN (SELECT id FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "FinancePayment" WHERE "operationVoucherId" IN (SELECT id FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%');
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
DELETE FROM "Tour" WHERE "systemCode" LIKE '${RUN_ID}%';
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
const site = '$SITE_URL';
const run = '$RUN_ID';
const adminEmail = '$ADMIN_EMAIL';
const adminPassword = '$ADMIN_PASSWORD';

function sessionCookie(response, label = 'auth response') {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookies.find((value) => value.startsWith('smarttour.auth.token='));
  if (!cookie) throw new Error(label + ' did not set smarttour.auth.token cookie');
  return cookie.split(';')[0].slice('smarttour.auth.token='.length);
}

async function login() {
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Admin login failed: ' + response.status + ' ' + JSON.stringify(data));
  if (data.token !== undefined || data.accessToken !== undefined) throw new Error('Admin login response should not expose token JSON');
  return sessionCookie(response, 'admin login');
}

async function request(token, method, path, body, ok = [200, 201]) {
  const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', Cookie: 'smarttour.auth.token=' + token }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  const supplierServiceId = supplier.supplierServices?.[0]?.id;
  if (!supplierServiceId) throw new Error('Supplier service was not created');

  const customer = await request(token, 'POST', '/customers', {
    code: run + '-CUS',
    fullName: 'Business Smoke Customer',
    phone: '091' + String(Date.now()).slice(-7),
    branch: 'SMOKE-BR',
    department: 'SMOKE-DEP',
  });

  const program = await request(token, 'POST', '/tour-programs', { code: run + '-TP', name: 'Business Smoke Program', route: 'HN', durationDays: 1 });
  await request(token, 'POST', '/tour-programs/' + program.id + '/itinerary-days', { dayNumber: 1, title: 'Business smoke day 1', content: 'Business smoke itinerary day' });
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
    services: [{ supplierId: supplier.id, supplierServiceId, serviceType: 'MEAL', serviceName: 'Lunch', confirmationStatus: 'WAITING', expectedCost: 500000, actualCost: 500000 }],
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

  const voucherOrder = await request(token, 'POST', '/orders/single-services', {
    systemCode: run + '-VCH-ORD',
    name: 'Business Smoke Voucher Order',
    customerId: customer.id,
    salesItems: [{ description: 'Business smoke voucher service', quantity: 1, serviceCount: 1, unitPrice: 500000 }],
    operationItems: [{ serviceType: 'MEAL', quantity: 1, netPrice: 500000 }],
  });
  const voucherTour = await request(token, 'POST', '/tours', {
    type: 'FIT',
    systemCode: run + '-VCH-TOUR',
    orderId: voucherOrder.id,
    tourCode: run + '-VCH-T',
    name: 'Business Smoke Voucher Tour',
    branch: 'SMOKE-BR',
    department: 'SMOKE-DEP',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
  });

  const voucher = await request(token, 'POST', '/operation-vouchers', {
    voucherCode: run + '-VCH',
    bookingId: booking.id,
    orderId: voucherOrder.id,
    tourId: voucherTour.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    serviceType: 'MEAL',
    serviceName: 'Lunch voucher',
    serviceDate: '2026-08-01',
    paymentDeadline: '2026-08-05',
    createdBy: 'business-smoke',
    details: [{ serviceName: 'Lunch', quantity: 2, unit: 'pax', netPrice: 250000, vat: 0 }],
  });
  const voucherWithPayment = await request(token, 'POST', '/operation-vouchers/' + voucher.id + '/create-payment-voucher');
  const financePayment = voucherWithPayment.financePayments?.[0];
  if (!financePayment?.id) throw new Error('Operation voucher did not create a finance payment');
  await request(token, 'POST', '/finance/payments/' + financePayment.id + '/approve', { actor: 'business-smoke' });
  const paidVoucher = await request(token, 'GET', '/operation-vouchers/' + voucher.id);
  if (paidVoucher.status !== 'PAID') throw new Error('Approved finance payment did not reconcile the operation voucher');

  await request(token, 'GET', '/operations/forms?search=' + encodeURIComponent(run));
  await request(token, 'GET', '/operations/supplier-payment-requests?search=' + encodeURIComponent(run));
  await request(token, 'GET', '/operation-vouchers?search=' + encodeURIComponent(run));

  for (const path of ['/customers', '/bookings', '/operations', '/operation-vouchers', '/suppliers/restaurants', '/finance']) await route(token, path);
  console.log('SMOKE_BUSINESS_OK');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
NODE
