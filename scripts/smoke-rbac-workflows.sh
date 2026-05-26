#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
SITE_URL="${SITE_URL:-https://quanly.dunientravel.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
RUN_ID="SMOKE-RBAC-$(date +%s)"
ROLE_PASSWORD="RoleSmoke123!26"

cleanup() {
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "UserSession" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '%${RUN_ID,,}%');
DELETE FROM "UserRole" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '%${RUN_ID,,}%');
DELETE FROM "User" WHERE email LIKE '%${RUN_ID,,}%';
DELETE FROM "QuotationApprovalLog" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "QuotationItem" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%';
DELETE FROM "Booking" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "TourItineraryDay" WHERE "tourProgramId" IN (SELECT id FROM "TourProgram" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "TourProgram" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "CustomerTimeline" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "Customer" WHERE code LIKE '${RUN_ID}%';
SQL
}
trap cleanup EXIT

node <<NODE
const api = '$API_URL';
const site = '$SITE_URL';
const run = '$RUN_ID';
const adminEmail = '$ADMIN_EMAIL';
const adminPassword = '$ADMIN_PASSWORD';
const rolePassword = '$ROLE_PASSWORD';

async function login(email, password) {
  const response = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) throw new Error('Login failed for ' + email + ': ' + response.status);
  return data.token;
}

async function request(token, method, path, body, ok = [200, 201]) {
  const response = await fetch(api + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!ok.includes(response.status)) throw new Error(method + ' ' + path + ' -> ' + response.status + ' ' + text.slice(0, 200));
  console.log(response.status + ' ' + method + ' ' + path);
  return data;
}

async function route(token, path) {
  const response = await fetch(site + path, { headers: { Cookie: 'smarttour.auth.token=' + token } });
  if (response.status !== 200) throw new Error('Route ' + path + ' -> ' + response.status);
  console.log('200 ROUTE ' + path);
}

(async () => {
  const admin = await login(adminEmail, adminPassword);
  const salesEmail = ('sales-' + run + '@smarttour.local').toLowerCase();
  const operationEmail = ('operation-' + run + '@smarttour.local').toLowerCase();
  const accountingEmail = ('accounting-' + run + '@smarttour.local').toLowerCase();
  await request(admin, 'POST', '/auth/users', { email: salesEmail, name: 'Sales Smoke', password: rolePassword, branch: 'BR-A', department: 'DEP-A', roleCodes: ['sales'] });
  await request(admin, 'POST', '/auth/users', { email: operationEmail, name: 'Operation Smoke', password: rolePassword, branch: 'BR-A', department: 'DEP-X', roleCodes: ['operation'] });
  await request(admin, 'POST', '/auth/users', { email: accountingEmail, name: 'Accounting Smoke', password: rolePassword, branch: 'BR-Z', department: 'DEP-Z', roleCodes: ['accounting'] });

  const sales = await login(salesEmail, rolePassword);
  const operation = await login(operationEmail, rolePassword);
  const accounting = await login(accountingEmail, rolePassword);
  const customerA = await request(admin, 'POST', '/customers', { code: run + '-CA', fullName: 'Scope Customer A', phone: '081' + String(Date.now()).slice(-7), branch: 'BR-A', department: 'DEP-A' });
  await request(admin, 'POST', '/customers', { code: run + '-CB', fullName: 'Scope Customer B', phone: '082' + String(Date.now()).slice(-7), branch: 'BR-B', department: 'DEP-B' });
  const program = await request(admin, 'POST', '/tour-programs', { code: run + '-TP', name: 'Role Smoke Program', route: 'HN', durationDays: 1 });
  await request(admin, 'POST', '/bookings', { code: run + '-BKA', tourProgramId: program.id, customerId: customerA.id, customerName: customerA.fullName, customerPhone: customerA.phone, paxCount: 1, startDate: '2026-07-01', endDate: '2026-07-01' });
  await request(admin, 'POST', '/bookings', { code: run + '-BKB', tourProgramId: program.id, customerName: 'Other Customer', paxCount: 1, startDate: '2026-07-01', endDate: '2026-07-01' });
  await request(admin, 'POST', '/quotations', { quoteCode: run + '-QA', productType: 'FIT', customerName: 'Quote A', branch: 'BR-A', department: 'DEP-A', items: [{ serviceType: 'HOTEL', serviceName: 'Room', netPrice: 100 }] });
  await request(admin, 'POST', '/quotations', { quoteCode: run + '-QB', productType: 'FIT', customerName: 'Quote B', branch: 'BR-B', department: 'DEP-B', items: [{ serviceType: 'HOTEL', serviceName: 'Room', netPrice: 100 }] });

  const customers = await request(sales, 'GET', '/customers?search=Scope%20Customer');
  if (!JSON.stringify(customers).includes('Scope Customer A') || JSON.stringify(customers).includes('Scope Customer B')) throw new Error('Sales customer scope failed');
  const quotations = await request(sales, 'GET', '/quotations?search=' + encodeURIComponent(run));
  if (!JSON.stringify(quotations).includes(run + '-QA') || JSON.stringify(quotations).includes(run + '-QB')) throw new Error('Sales quotation scope failed');
  await request(sales, 'GET', '/finance/receipts', undefined, [401]);
  await request(operation, 'GET', '/operations/forms');
  await request(operation, 'GET', '/finance/payments', undefined, [401]);
  await request(accounting, 'GET', '/finance/receipts');
  await request(accounting, 'POST', '/orders/fit-tours', { systemCode: run + '-DENY', name: 'Denied' }, [401]);
  await route(sales, '/customers');
  await route(operation, '/operations');
  await route(accounting, '/finance');
  console.log('SMOKE_RBAC_OK');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
NODE
