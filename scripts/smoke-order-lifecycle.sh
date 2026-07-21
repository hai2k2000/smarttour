#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://aitour.io.vn/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
RUN_ID="SMOKE-ORDER-$(date +%s)"

cleanup() {
  local primary_status=$?
  local cleanup_status=0

  trap - EXIT
  set +e
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour -v ON_ERROR_STOP=1 >/dev/null <<SQL
DELETE FROM "OrderLog" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderGuide" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderSalesItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderOperationItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderMember" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderItinerary" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderHandoverItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderSurveyQuestion" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderTerm" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%';
DELETE FROM "CustomerTimeline" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "Customer" WHERE code LIKE '${RUN_ID}%';
DO \$smoke_cleanup\$
BEGIN
  IF EXISTS (SELECT 1 FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%') THEN
    RAISE EXCEPTION 'Order cleanup residuals remain';
  END IF;
  IF EXISTS (SELECT 1 FROM "Customer" WHERE code LIKE '${RUN_ID}%') THEN
    RAISE EXCEPTION 'Customer cleanup residuals remain';
  END IF;
END
\$smoke_cleanup\$;
SQL
  cleanup_status=$?

  if (( cleanup_status != 0 )); then
    printf 'FAIL_SMOKE_ORDER_CLEANUP cleanup_status=%s\n' "$cleanup_status" >&2
    if (( primary_status == 0 )); then
      exit "$cleanup_status"
    fi
  fi
  exit "$primary_status"
}
trap cleanup EXIT

node <<NODE
const api = '$API_URL';
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
  const response = await fetch(api + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Admin login failed: ' + response.status + ' ' + JSON.stringify(data));
  if (data.token !== undefined || data.accessToken !== undefined) throw new Error('Admin login response should not expose token JSON');
  return sessionCookie(response, 'admin login');
}

async function request(token, method, path, body, ok = [200, 201]) {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: 'smarttour.auth.token=' + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!ok.includes(response.status)) throw new Error(method + ' ' + path + ' -> ' + response.status + ' ' + text.slice(0, 300));
  console.log(response.status + ' ' + method + ' ' + path);
  return data;
}

(async () => {
  const token = await login();
  const customer = await request(token, 'POST', '/customers', {
    code: run + '-CUS',
    fullName: 'Order Lifecycle Customer',
    phone: '088' + String(Date.now()).slice(-7),
    email: 'order-' + run.toLowerCase() + '@smarttour.local',
    address: 'Ha Noi',
    branch: 'SMOKE-BR',
    department: 'SMOKE-DEP',
  });

  const hotelBooking = await request(token, 'POST', '/orders/hotel-bookings', {
    systemCode: run + '-HOTEL-DOC',
    tourCode: run + '-HOTEL-CODE',
    name: 'Hotel Document Smoke',
    customerId: customer.id,
    startDate: '2026-09-05',
    endDate: '2026-09-07',
    roomClass: 'Deluxe',
    salesItems: [{ serviceType: 'HOTEL', description: 'Deluxe Room', quantity: 1, serviceCount: 2, unitPrice: 900000, vat: 0 }],
    operationItems: [{ serviceType: 'HOTEL', bookingCode: run + '-SUP', quantity: 1, netPrice: 600000, vat: 0, status: 'WAITING' }],
    members: [{ fullName: 'Hotel Document Guest', identityNumber: run + '-ID' }],
    terms: [{ language: 'VI', terms: 'Dieu khoan khach san smoke' }],
  });
  const hotelDocument = await request(token, 'GET', '/orders/hotel-bookings/' + hotelBooking.id + '/document');
  if (hotelDocument.order?.systemCode !== run + '-HOTEL-DOC') throw new Error('Hotel document system code is incorrect');
  if (hotelDocument.documentTitle !== 'PHI\u1ebeU BOOKING PH\u00d2NG KH\u00c1CH S\u1ea0N') throw new Error('Hotel document title is incorrect');
  if (
    !Array.isArray(hotelDocument.members)
    || hotelDocument.members.length !== 1
    || hotelDocument.members[0].fullName !== 'Hotel Document Guest'
    || hotelDocument.members[0].identityNumber !== run + '-ID'
  ) throw new Error('Hotel document members are incorrect');
  if (typeof hotelDocument.summary?.totalRevenue !== 'number' || hotelDocument.summary?.totalRevenue !== 1800000) throw new Error('Hotel document total revenue is incorrect');
  await request(token, 'GET', '/orders/single-services/' + hotelBooking.id + '/document', undefined, [400]);
  await request(token, 'DELETE', '/orders/hotel-bookings/' + hotelBooking.id);
  await request(token, 'GET', '/orders/hotel-bookings/' + hotelBooking.id + '/document', undefined, [404]);

  const order = await request(token, 'POST', '/orders/single-services', {
    systemCode: run + '-ORD',
    name: 'Order Lifecycle Smoke',
    customerId: customer.id,
    startDate: '2026-09-01',
    endDate: '2026-09-02',
    salesItems: [{ description: 'Tour revenue', quantity: 2, serviceCount: 1, unitPrice: 1000000, vat: 10 }],
    operationItems: [{ serviceType: 'OTHER', quantity: 2, netPrice: 350000, vat: 0, status: 'WAITING' }],
    members: [{ fullName: 'Nguyen Van A', phone: '0900000001' }],
    itineraries: [{ dayNo: 1, title: 'Ha Noi', content: 'Start tour' }],
    handoverItems: [{ itemName: 'Voucher', quantity: 1 }],
    surveyQuestions: [{ question: 'Chat luong dich vu?' }],
    terms: [{ language: 'VI', terms: 'Dieu khoan smoke' }],
  });
  if (order.customerName !== customer.fullName || order.customerPhone !== customer.phone) throw new Error('Customer snapshot was not applied');
  if (Number(order.totalRevenue) !== 2200000 || Number(order.totalCost) !== 700000 || Number(order.profit) !== 1500000) throw new Error('Order totals are incorrect');
  if (order.members.length !== 1 || order.salesItems.length !== 1 || order.operationItems.length !== 1) throw new Error('Order children were not created');

  const updated = await request(token, 'PUT', '/orders/single-services/' + order.id, {
    name: 'Order Lifecycle Smoke Updated',
    salesItems: [{ description: 'Updated revenue', quantity: 1, serviceCount: 1, unitPrice: 3000000, vat: 0 }],
    operationItems: [{ serviceType: 'OTHER', quantity: 1, netPrice: 1200000, vat: 0, status: 'WAITING' }],
    members: [{ fullName: 'Nguyen Van B', phone: '0900000002' }, { fullName: 'Nguyen Van C', phone: '0900000003' }],
  });
  if (updated.members.length !== 2 || Number(updated.totalRevenue) !== 3000000 || Number(updated.totalCost) !== 1200000) throw new Error('Order update did not replace children/totals');

  const settled = await request(token, 'POST', '/orders/single-services/' + order.id + '/settle');
  if (settled.status !== 'SETTLED' || !settled.settledAt) throw new Error('Order was not settled');
  await request(token, 'PUT', '/orders/single-services/' + order.id, { name: 'Should fail' }, [400]);
  const unlocked = await request(token, 'POST', '/orders/single-services/' + order.id + '/unlock', { actor: 'order-smoke', reason: run + ' unlock' });
  if (unlocked.status !== 'COMPLETED' || unlocked.settledAt) throw new Error('Order was not unlocked');
  await request(token, 'DELETE', '/orders/single-services/' + order.id);

  console.log('SMOKE_ORDER_LIFECYCLE_OK');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
NODE
