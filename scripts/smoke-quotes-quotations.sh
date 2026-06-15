#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
SITE_URL="${SITE_URL:-https://quanly.dunientravel.com}"
RUN_ID="${RUN_ID:-SMOKE-QUOTE-$(date +%s)}"
RUN_ID_LOWER="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
RUN_ID_SAFE="$(printf '%s' "$RUN_ID_LOWER" | tr -c 'a-z0-9_' '_')"
ROLE_PASSWORD="${ROLE_PASSWORD:-QuoteSmoke123!26}"
SMOKE_PASSWORD_HASH='pbkdf2$310000$quote-smoke-static-salt$G5CN_Uw7-j2sDiW523s9JUt9zNmVNF89gCiHFgsZQcc'

cleanup() {
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx smarttour-postgres-1; then
    echo "skip DB cleanup (smarttour-postgres-1 not available)"
    return
  fi
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "Order" WHERE "systemCode" LIKE 'ORD-${RUN_ID}%';
DELETE FROM "QuotationApprovalLog" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "QuotationItem" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%';
DELETE FROM "QuoteComboItem" WHERE "comboId" IN (SELECT id FROM "QuoteCombo" WHERE "comboCode" LIKE '${RUN_ID}%');
DELETE FROM "QuoteCombo" WHERE "comboCode" LIKE '${RUN_ID}%';
DELETE FROM "QuoteCostItem" WHERE "quoteId" IN (SELECT id FROM "TourQuote" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "QuoteItinerary" WHERE "quoteId" IN (SELECT id FROM "TourQuote" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "TourQuote" WHERE "quoteCode" LIKE '${RUN_ID}%';
DELETE FROM "UserSession" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '%${RUN_ID_LOWER}%');
DELETE FROM "UserRole" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '%${RUN_ID_LOWER}%');
DELETE FROM "User" WHERE email LIKE '%${RUN_ID_LOWER}%';
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT id FROM "Role" WHERE code LIKE '%${RUN_ID_LOWER}%');
DELETE FROM "Role" WHERE code LIKE '%${RUN_ID_LOWER}%';
SQL
}
trap cleanup EXIT
cleanup

seed_admin_if_needed() {
  if [[ -n "${ADMIN_PASSWORD:-}" || -n "${SMARTTOUR_BOOTSTRAP_KEY:-}" || -n "${BOOTSTRAP_KEY:-}" ]]; then
    return
  fi
  if [[ "$ROLE_PASSWORD" != "QuoteSmoke123!26" ]]; then
    echo "ROLE_PASSWORD override requires ADMIN_PASSWORD or SMARTTOUR_BOOTSTRAP_KEY for admin login" >&2
    return 1
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx smarttour-postgres-1; then
    echo "Cannot seed smoke admin without docker smarttour-postgres-1" >&2
    return 1
  fi
  local role_id="role_quote_admin_${RUN_ID_SAFE}"
  local user_id="user_quote_admin_${RUN_ID_SAFE}"
  local role_code="quote-admin-${RUN_ID_LOWER}"
  local username="quote-admin-${RUN_ID_LOWER}"
  local email="quote-admin-${RUN_ID_LOWER}@smarttour.local"
  docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES ('${role_id}', '${role_code}', 'Quote smoke admin', false, 'ACTIVE', now(), now())
ON CONFLICT (code) DO UPDATE SET status = 'ACTIVE', "updatedAt" = now();
INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES ('rp_quote_admin_all_${RUN_ID_SAFE}', '${role_id}', '*', now())
ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES ('rp_quote_admin_scope_${RUN_ID_SAFE}', '${role_id}', 'data.scope.all', now())
ON CONFLICT ("roleId", permission) DO NOTHING;
INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES ('${user_id}', '${username}', '${email}', 'Quote Smoke Admin', '${SMOKE_PASSWORD_HASH}', 'ACTIVE', 'SMOKE-BR', 'SMOKE-DEP', now(), now())
ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username, "passwordHash" = EXCLUDED."passwordHash", status = 'ACTIVE', "updatedAt" = now();
INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES ('ur_quote_admin_${RUN_ID_SAFE}', '${user_id}', '${role_id}', now())
ON CONFLICT ("userId", "roleId") DO NOTHING;
SQL
  export ADMIN_USERNAME="$username"
  export ADMIN_PASSWORD="$ROLE_PASSWORD"
}

seed_admin_if_needed

export API_URL SITE_URL RUN_ID ROLE_PASSWORD

run_node() {
  if command -v node >/dev/null 2>&1; then
    node
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    local env_args=()
    if [[ -f .env ]]; then
      env_args+=(--env-file .env)
    fi
    docker run --rm --network host -i \
      "${env_args[@]}" \
      -v "$PWD:/workspace:ro" \
      -w /workspace \
      -e API_URL \
      -e SITE_URL \
      -e RUN_ID \
      -e ROLE_PASSWORD \
      -e ADMIN_USERNAME \
      -e ADMIN_PASSWORD \
      node:22-alpine node
    return
  fi
  echo "node is not installed and docker is not available" >&2
  return 127
}

run_node <<'NODE'
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const file = process.env.ENV_FILE || path.join(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadDotEnv();

const api = process.env.API_URL || 'http://127.0.0.1:4000/api';
const site = process.env.SITE_URL || 'https://quanly.dunientravel.com';
const run = process.env.RUN_ID || `SMOKE-QUOTE-${Date.now()}`;
const lowerRun = run.toLowerCase();
const rolePassword = process.env.ROLE_PASSWORD || 'QuoteSmoke123!26';

function almost(actual, expected, label, epsilon = 0.01) {
  const value = Number(actual);
  if (!Number.isFinite(value) || Math.abs(value - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includesJson(data, text) {
  return JSON.stringify(data).includes(text);
}

async function request(token, method, path, body, ok = [200, 201]) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(api + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!ok.includes(response.status)) {
    throw new Error(`${method} ${path} -> ${response.status} ${String(text).slice(0, 400)}`);
  }
  console.log(`${response.status} ${method} ${path}`);
  return data;
}

async function page(token, route, ok = [200, 307]) {
  const response = await fetch(site + route, { headers: token ? { Cookie: `smarttour.auth.token=${token}` } : {} });
  if (!ok.includes(response.status)) throw new Error(`PAGE ${route} -> ${response.status}`);
  console.log(`${response.status} PAGE ${route}`);
}

async function login(identifier, password) {
  const response = await fetch(api + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: identifier, email: identifier, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) throw new Error(`Login failed for ${identifier}: ${response.status} ${JSON.stringify(data)}`);
  return data.token;
}

async function adminToken() {
  const bootstrapKey = process.env.SMARTTOUR_BOOTSTRAP_KEY || process.env.BOOTSTRAP_KEY;
  if (bootstrapKey) {
    const email = `quote-admin-${lowerRun}@smarttour.local`;
    const username = `quote-admin-${lowerRun}`.replace(/[^a-z0-9._-]/g, '-');
    const response = await fetch(api + '/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bootstrapKey, email, username, password: rolePassword, name: 'Quote Smoke Admin' }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.token) return data.token;
    if (!process.env.ADMIN_PASSWORD) throw new Error(`Bootstrap admin failed: ${response.status} ${JSON.stringify(data)}`);
  }
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('Set ADMIN_PASSWORD or SMARTTOUR_BOOTSTRAP_KEY to run quote smoke tests');
  return login(username, password);
}

function tourPayload(code = `${run}-TOUR`) {
  return {
    quoteCode: code,
    tourCode: `${run}-T01`,
    tourName: 'Quote Tour Smoke',
    route: 'Ha Noi - Ha Long',
    marketGroup: 'SMOKE',
    currency: 'VND',
    exchangeRate: 1,
    bookingDate: '2026-07-01',
    paymentDate: '2026-07-05',
    departureDate: '2026-07-10',
    returnDate: '2026-07-12',
    customerName: 'Quote Tour Customer',
    customerPhone: '0900000001',
    customerEmail: 'tour-smoke@example.com',
    adultQty: 2,
    childQty: 1,
    infantQty: 1,
    profit: 100,
    commission: 50,
    discount: 20,
    childPricePercent: 50,
    infantPricePercent: 10,
    costItems: [
      { costType: 'COMMON', serviceType: 'GUIDE', description: 'Guide', quantity: 2, serviceCount: 3, unitPrice: 100, exchangeRate: 2, vat: 10 },
      { costType: 'HOTEL', serviceType: 'HOTEL', description: 'Hotel', quantity: 1, serviceCount: 2, unitPrice: 500, exchangeRate: 1, vat: 50 },
      { costType: 'PRIVATE', serviceType: 'CAR', description: 'Private car', quantity: 1, serviceCount: 1, unitPrice: 200, exchangeRate: 1, vat: 0 },
    ],
    itineraries: [
      { dayNo: 1, title: 'Arrival', content: 'Airport pickup' },
      { dayNo: 2, title: 'Cruise', content: 'Ha Long bay' },
    ],
  };
}

function comboPayload(code = `${run}-COMBO`) {
  return {
    comboCode: code,
    comboType: '3N2D',
    note: 'Combo smoke',
    profitPerPax: 200,
    childPricePercent: 50,
    items: [
      { serviceName: 'Hotel combo', checkIn: '2026-08-01', netPricePerService: 1000, nightCount: 2, paxCount: 2 },
      { serviceName: 'Ticket combo', checkIn: '2026-08-02', netPricePerService: 300, nightCount: 1, paxCount: 3 },
    ],
  };
}

function quotationPayload(code = `${run}-QTE`) {
  return {
    quoteCode: code,
    productType: 'FIT',
    customerName: 'Quotation Smoke Customer',
    customerPhone: '0900000002',
    customerEmail: 'quotation-smoke@example.com',
    salesOwner: 'Quote Smoke Sales',
    operatorOwner: 'Quote Smoke Operator',
    branch: 'SMOKE-BR',
    department: 'SMOKE-DEP',
    marketGroup: 'SMOKE',
    productCategory: 'Tour',
    route: 'Ha Noi - Ninh Binh',
    paxAdult: 2,
    paxChild: 1,
    paxInfant: 1,
    currency: 'USD',
    exchangeRate: 2,
    createdDate: '2026-07-01',
    expiredDate: '2026-07-20',
    expectedPaymentDate: '2026-07-08',
    departureDate: '2026-08-01',
    returnDate: '2026-08-04',
    approvalLevel: 1,
    childPricePercent: 50,
    infantPricePercent: 10,
    language: 'VI',
    terms: 'Smoke terms',
    note: 'Smoke note',
    items: [
      { serviceType: 'HOTEL', supplierName: 'Hotel Supplier', serviceName: 'Room package', unit: 'room', quantity: 2, paxCount: 2, nightCount: 3, netPrice: 100, vat: 10, markupAmount: 50, markupPercent: 20, note: 'room note' },
      { serviceType: 'GUIDE', supplierName: 'Guide Supplier', serviceName: 'Guide package', unit: 'day', quantity: 1, paxCount: 4, nightCount: 1, netPrice: 200, vat: 0, markupAmount: 0, markupPercent: 10, note: 'guide note' },
    ],
  };
}

function assertTourTotals(row, expected = { common: 1210, privateTotal: 1250, net: 1552.5, selling: 1682.5 }) {
  almost(row.totalPax, 4, 'tour totalPax');
  almost(row.commonCostTotal, expected.common, 'tour commonCostTotal');
  almost(row.privateCostTotal, expected.privateTotal, 'tour privateCostTotal');
  almost(row.netPrice, expected.net, 'tour netPrice');
  almost(row.sellingPrice, expected.selling, 'tour sellingPrice');
  almost(row.childSellingPrice, expected.selling * 0.5, 'tour childSellingPrice');
  almost(row.infantSellingPrice, expected.selling * 0.1, 'tour infantSellingPrice');
}

function assertComboTotals(row, expected = { totalNet: 1100, adult: 1300, child: 650 }) {
  almost(row.totalNetPricePerPax, expected.totalNet, 'combo totalNetPricePerPax');
  almost(row.adultComboPrice, expected.adult, 'combo adultComboPrice');
  almost(row.childComboPrice, expected.child, 'combo childComboPrice');
}

function expectedQuotation(rate) {
  const cost1 = 2 * 3 * 100 * rate * 1.1;
  const markup1 = 50 + cost1 * 0.2;
  const cost2 = 1 * 1 * 200 * rate;
  const markup2 = cost2 * 0.1;
  const totalCost = cost1 + cost2;
  const totalMarkup = markup1 + markup2;
  const totalSelling = totalCost + totalMarkup;
  return { cost1, markup1, sell1: cost1 + markup1, cost2, markup2, sell2: cost2 + markup2, totalCost, totalMarkup, totalSelling };
}

function assertQuotationTotals(row, rate) {
  const expected = expectedQuotation(rate);
  almost(row.totalCost, expected.totalCost, 'quotation totalCost');
  almost(row.totalMarkup, expected.totalMarkup, 'quotation totalMarkup');
  almost(row.totalSelling, expected.totalSelling, 'quotation totalSelling');
  almost(row.paxTotal, 4, 'quotation paxTotal');
  almost(row.costPerPax, expected.totalCost / 4, 'quotation costPerPax');
  almost(row.sellingPerPax, expected.totalSelling / 4, 'quotation sellingPerPax');
  almost(row.adultPrice, expected.totalSelling / 4, 'quotation adultPrice');
  almost(row.childPrice, expected.totalSelling / 8, 'quotation childPrice');
  almost(row.infantPrice, expected.totalSelling / 40, 'quotation infantPrice');
  if (row.items?.length) {
    almost(row.items[0].amount, expected.sell1, 'quotation first item amount');
    almost(row.items[1].amount, expected.sell2, 'quotation second item amount');
  }
  return expected;
}

function assertLoadableTour(row) {
  assert(row && row.id && Array.isArray(row.costItems) && Array.isArray(row.itineraries), 'tour detail is not loadable');
  assert(row.costItems.every((item) => Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.unitPrice))), 'tour cost item number shape invalid');
  assert(row.itineraries.every((item) => Number.isFinite(Number(item.dayNo))), 'tour itinerary date/day shape invalid');
}

function assertLoadableCombo(row) {
  assert(row && row.id && Array.isArray(row.items), 'combo detail is not loadable');
  assert(row.items.every((item) => item.serviceName && Number.isFinite(Number(item.netPricePerService))), 'combo item shape invalid');
}

function assertLoadableQuotation(row) {
  assert(row && row.id && Array.isArray(row.items) && Array.isArray(row.logs), 'quotation detail is not loadable');
  assert(row.smartLinkToken && typeof row.smartLinkEnabled === 'boolean', 'quotation smart link shape invalid');
  assert(row.items.every((item) => item.serviceName && Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.netPrice))), 'quotation item shape invalid');
}

(async () => {
  const admin = await adminToken();
  const viewRoleCode = `quote-view-${lowerRun}`;
  const noQuoteRoleCode = `quote-no-access-${lowerRun}`;
  const viewEmail = `quote-view-${lowerRun}@smarttour.local`;
  const noPermEmail = `quote-noperm-${lowerRun}@smarttour.local`;

  await request(admin, 'POST', '/auth/roles', { code: viewRoleCode, name: 'Quote smoke view role', permissions: ['quote.view', 'quotation.view', 'data.scope.all'] });
  await request(admin, 'POST', '/auth/roles', { code: noQuoteRoleCode, name: 'Quote smoke no quote role', permissions: ['customer.view', 'data.scope.all'] });
  await request(admin, 'POST', '/auth/users', { email: viewEmail, name: 'Quote Smoke View', password: rolePassword, branch: 'SMOKE-BR', department: 'SMOKE-DEP', roleCodes: [viewRoleCode] });
  await request(admin, 'POST', '/auth/users', { email: noPermEmail, name: 'Quote Smoke No Permission', password: rolePassword, branch: 'SMOKE-BR', department: 'SMOKE-DEP', roleCodes: [noQuoteRoleCode] });
  const view = await login(viewEmail, rolePassword);
  const noPerm = await login(noPermEmail, rolePassword);

  await request(null, 'GET', '/quotes/tours', undefined, [401]);
  await request(noPerm, 'GET', '/quotes/tours', undefined, [403]);
  await request(view, 'POST', '/quotes/tours', tourPayload(`${run}-TOUR-DENY`), [403]);
  await request(admin, 'POST', '/quotes/tours', { ...tourPayload(`${run}-TOUR-BAD-MISSING`), quoteCode: '' }, [400]);
  await request(admin, 'POST', '/quotes/tours', { ...tourPayload(`${run}-TOUR-BAD-NUM`), costItems: [{ ...tourPayload().costItems[0], quantity: 'abc' }] }, [400]);

  const tour = await request(admin, 'POST', '/quotes/tours', tourPayload());
  assertTourTotals(tour);
  const updatedTour = await request(admin, 'PUT', `/quotes/tours/${tour.id}`, { profit: 150, itineraries: [{ dayNo: 1, title: 'Updated day', content: 'Updated content' }] });
  assertTourTotals(updatedTour, { common: 1210, privateTotal: 1250, net: 1552.5, selling: 1732.5 });
  const tourDetail = await request(view, 'GET', `/quotes/tours/${tour.id}`);
  assertLoadableTour(tourDetail);
  const tourList = await request(admin, 'GET', `/quotes/tours?search=${encodeURIComponent(run)}`);
  assert(includesJson(tourList, `${run}-TOUR`), 'tour search did not return created quote');
  await request(admin, 'POST', `/quotes/tours/${tour.id}/convert`, {}, [400]);
  const approvedTour = await request(admin, 'POST', `/quotes/tours/${tour.id}/approve`, { approvedBy: 'quote-smoke' });
  assert(approvedTour.status === 'APPROVED', 'tour approve did not set APPROVED');
  const convertedTour = await request(admin, 'POST', `/quotes/tours/${tour.id}/convert`, {});
  assert(convertedTour.status === 'CONVERTED', 'tour convert did not set CONVERTED');
  await request(admin, 'PUT', `/quotes/tours/${tour.id}`, { customerNote: 'blocked after convert' }, [400]);

  await request(null, 'GET', '/quotes/combos', undefined, [401]);
  await request(noPerm, 'GET', '/quotes/combos', undefined, [403]);
  await request(admin, 'POST', '/quotes/combos', { ...comboPayload(`${run}-COMBO-BAD-MISSING`), comboCode: '' }, [400]);
  await request(admin, 'POST', '/quotes/combos', { ...comboPayload(`${run}-COMBO-BAD-NUM`), items: [{ serviceName: 'Bad combo', netPricePerService: 'abc' }] }, [400]);
  await request(admin, 'POST', '/quotes/combos', { ...comboPayload(`${run}-COMBO-BAD-ITEMS`), items: [] }, [400]);

  const combo = await request(admin, 'POST', '/quotes/combos', comboPayload());
  assertComboTotals(combo);
  await request(admin, 'POST', `/quotes/combos/${combo.id}/create-order`, {}, [400]);
  const updatedCombo = await request(admin, 'PUT', `/quotes/combos/${combo.id}`, {
    profitPerPax: 250,
    items: comboPayload().items,
  });
  assertComboTotals(updatedCombo, { totalNet: 1100, adult: 1350, child: 675 });
  const comboDetail = await request(view, 'GET', `/quotes/combos/${combo.id}`);
  assertLoadableCombo(comboDetail);
  const comboList = await request(admin, 'GET', `/quotes/combos?search=${encodeURIComponent(run)}`);
  assert(includesJson(comboList, `${run}-COMBO`), 'combo search did not return created combo');
  await request(view, 'POST', `/quotes/combos/${combo.id}/create-quote`, {}, [403]);
  const quotedCombo = await request(admin, 'POST', `/quotes/combos/${combo.id}/create-quote`, {});
  assert(quotedCombo.status === 'QUOTED', 'combo create-quote did not set QUOTED');
  const orderedCombo = await request(admin, 'POST', `/quotes/combos/${combo.id}/create-order`, {});
  assert(orderedCombo.status === 'ORDER_CREATED', 'combo create-order did not set ORDER_CREATED');
  await request(admin, 'PUT', `/quotes/combos/${combo.id}`, { note: 'blocked after order' }, [400]);

  await request(null, 'GET', '/quotations', undefined, [401]);
  await request(noPerm, 'GET', '/quotations', undefined, [403]);
  await request(view, 'POST', '/quotations', quotationPayload(`${run}-QTE-DENY`), [403]);
  await request(admin, 'POST', '/quotations', { ...quotationPayload(`${run}-QTE-BAD-MISSING`), quoteCode: '' }, [400]);
  await request(admin, 'POST', '/quotations', { ...quotationPayload(`${run}-QTE-BAD-NUM`), items: [{ ...quotationPayload().items[0], netPrice: 'abc' }] }, [400]);
  await request(admin, 'POST', '/quotations', { ...quotationPayload(`${run}-QTE-BAD-ITEMS`), items: [] }, [400]);

  const stateQuote = await request(admin, 'POST', '/quotations', quotationPayload(`${run}-QTE-STATE`));
  await request(admin, 'POST', `/quotations/${stateQuote.id}/approve`, { actor: 'quote-smoke' }, [400]);
  await request(admin, 'POST', `/quotations/${stateQuote.id}/convert`, { actor: 'quote-smoke' }, [400]);

  const quotation = await request(admin, 'POST', '/quotations', quotationPayload());
  assertQuotationTotals(quotation, 2);
  await request(view, 'PUT', `/quotations/${quotation.id}`, { route: 'Denied update' }, [403]);
  const updatedQuotation = await request(admin, 'PUT', `/quotations/${quotation.id}`, { exchangeRate: 3, route: 'Ha Noi - Ninh Binh Updated' });
  const expectedRate3 = assertQuotationTotals(updatedQuotation, 3);
  const quotationDetail = await request(view, 'GET', `/quotations/${quotation.id}`);
  assertLoadableQuotation(quotationDetail);
  const quotationList = await request(admin, 'GET', `/quotations?search=${encodeURIComponent(run)}`);
  assert(includesJson(quotationList, `${run}-QTE`), 'quotation search did not return created quotation');

  const smartOn = await request(admin, 'PATCH', `/quotations/${quotation.id}/smartlink`, { enabled: true });
  assert(smartOn.smartLinkEnabled === true, 'smartlink did not enable');
  assert(/^[A-Za-z0-9_-]{43}$/.test(smartOn.smartLinkToken), 'smartlink token is not cryptographically random');
  const publicDetail = await request(null, 'GET', `/quotations/public/${smartOn.smartLinkToken}`);
  assert(publicDetail.quoteCode === quotation.quoteCode, 'public smartlink did not load quotation');
  for (const field of ['id', 'customerCode', 'customerPhone', 'customerEmail', 'salesOwner', 'operatorOwner', 'branch', 'department', 'totalCost', 'totalMarkup', 'costPerPax', 'profitPerPax', 'marginRate', 'smartLinkToken', 'note', 'logs']) {
    assert(!(field in publicDetail), `public smartlink leaked ${field}`);
  }
  assert(publicDetail.items.every((item) => !('netPrice' in item) && !('supplierName' in item) && !('markupAmount' in item)), 'public smartlink leaked internal item pricing');
  const smartOff = await request(admin, 'PATCH', `/quotations/${quotation.id}/smartlink`, { enabled: false });
  assert(smartOff.smartLinkEnabled === false, 'smartlink did not disable');
  const smartBackOn = await request(admin, 'PATCH', `/quotations/${quotation.id}/smartlink`, { enabled: true });
  assert(smartBackOn.smartLinkEnabled === true, 'smartlink did not re-enable');
  assert(smartBackOn.smartLinkToken !== smartOn.smartLinkToken, 'smartlink token should rotate when enabled');

  const submitted = await request(admin, 'POST', `/quotations/${quotation.id}/submit`, { actor: 'quote-smoke' });
  assert(submitted.status === 'PENDING_APPROVAL', 'quotation submit did not set PENDING_APPROVAL');
  const approved = await request(admin, 'POST', `/quotations/${quotation.id}/approve`, { actor: 'quote-smoke' });
  assert(approved.status === 'APPROVED', 'quotation approve did not set APPROVED');
  const converted = await request(admin, 'POST', `/quotations/${quotation.id}/convert`, { actor: 'quote-smoke' });
  assert(converted.status === 'CONVERTED' && converted.convertedOrderId, 'quotation convert did not create order link');
  assertQuotationTotals(converted, 3);
  await request(admin, 'PATCH', `/quotations/${quotation.id}/smartlink`, { enabled: false }, [400]);
  await request(admin, 'POST', `/quotations/${quotation.id}/submit`, { actor: 'quote-smoke' }, [400]);

  const order = await request(admin, 'GET', `/orders/fit-tours/${converted.convertedOrderId}`);
  almost(order.totalRevenue, expectedRate3.totalSelling, 'converted order totalRevenue');
  almost(order.totalCost, expectedRate3.totalCost, 'converted order totalCost');
  almost(order.profit, expectedRate3.totalSelling - expectedRate3.totalCost, 'converted order profit');
  assert(order.customerName === quotationPayload().customerName, 'converted order lost customerName');
  assert(order.route === 'Ha Noi - Ninh Binh Updated', 'converted order lost updated route');
  assert(Array.isArray(order.salesItems) && order.salesItems.length === 2, 'converted order salesItems missing');
  assert(Array.isArray(order.operationItems) && order.operationItems.length === 2, 'converted order operationItems missing');
  almost(order.salesItems[0].amount, expectedRate3.sell1, 'converted order first sales amount');
  almost(order.operationItems[0].amount, expectedRate3.cost1, 'converted order first operation amount');

  const convertedList = await request(admin, 'GET', `/quotations?search=${encodeURIComponent(run)}&status=CONVERTED`);
  assert(includesJson(convertedList, `${run}-QTE`), 'quotation status filter did not return converted quotation');
  await page(view, '/quotes/tours');
  await page(view, '/quotes/combos');
  await page(view, '/quotations');

  console.log('SMOKE_QUOTES_QUOTATIONS_OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
