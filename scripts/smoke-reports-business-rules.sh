#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
RUN_ID="${RUN_ID:-SMOKE-RPT-$(date +%s)}"

if [[ ! "$RUN_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "RUN_ID may only contain letters, numbers, dot, underscore, and dash" >&2
  exit 1
fi

RUN_ID_LOWER="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
RUN_ID_SAFE="$(printf '%s' "$RUN_ID_LOWER" | tr -c 'a-z0-9_' '_')"
TOKEN="${TOKEN:-${RUN_ID}.reports-token}"
TOKEN_HASH="$(printf '%s' "$TOKEN" | sha256sum | awk '{print $1}')"

ROLE_ID="role_reports_${RUN_ID_SAFE}"
USER_ID="user_reports_${RUN_ID_SAFE}"
SESSION_ID="session_reports_${RUN_ID_SAFE}"
CUSTOMER_A_ID="rpt_customer_a_${RUN_ID_SAFE}"
CUSTOMER_B_ID="rpt_customer_b_${RUN_ID_SAFE}"
SUPPLIER_CATEGORY_ID="rpt_supplier_category_${RUN_ID_SAFE}"
SUPPLIER_A_ID="rpt_supplier_a_${RUN_ID_SAFE}"
ORDER_A_ID="rpt_order_a_${RUN_ID_SAFE}"
ORDER_B_ID="rpt_order_b_${RUN_ID_SAFE}"

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U smarttour -d smarttour "$@"
}

cleanup() {
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    echo "skip DB cleanup ($POSTGRES_CONTAINER not available)"
    return
  fi
  psql_exec >/dev/null <<SQL || true
DELETE FROM "FinanceCashflowEntry" WHERE "sourceId" LIKE '${RUN_ID}%';
DELETE FROM "CustomerLedgerEntry" WHERE "sourceId" LIKE '${RUN_ID}%' OR "documentCode" LIKE '${RUN_ID}%';
DELETE FROM "SupplierLedgerEntry" WHERE "sourceId" LIKE '${RUN_ID}%' OR "documentCode" LIKE '${RUN_ID}%';
DELETE FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%';
DELETE FROM "Supplier" WHERE id = '${SUPPLIER_A_ID}' OR "supplierCode" LIKE '${RUN_ID}%';
DELETE FROM "SupplierCategory" WHERE id = '${SUPPLIER_CATEGORY_ID}' OR name = '${RUN_ID} Supplier Category';
DELETE FROM "Customer" WHERE id IN ('${CUSTOMER_A_ID}', '${CUSTOMER_B_ID}') OR code LIKE '${RUN_ID}%';
DELETE FROM "UserSession" WHERE id = '${SESSION_ID}' OR "userId" = '${USER_ID}';
DELETE FROM "UserRole" WHERE "userId" = '${USER_ID}' OR "roleId" = '${ROLE_ID}';
DELETE FROM "User" WHERE id = '${USER_ID}' OR email = 'reports-${RUN_ID_LOWER}@smarttour.local';
DELETE FROM "RolePermission" WHERE "roleId" = '${ROLE_ID}';
DELETE FROM "Role" WHERE id = '${ROLE_ID}' OR code = 'reports-${RUN_ID_LOWER}';
SQL
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "$POSTGRES_CONTAINER is not running" >&2
  exit 1
fi

cleanup

psql_exec >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES ('${ROLE_ID}', 'reports-${RUN_ID_LOWER}', 'Reports smoke role', false, 'ACTIVE', now(), now());

INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES
  ('${ROLE_ID}_rp_report_view', '${ROLE_ID}', 'report.view', now()),
  ('${ROLE_ID}_rp_report_export', '${ROLE_ID}', 'report.export', now()),
  ('${ROLE_ID}_rp_finance_cashflow_view', '${ROLE_ID}', 'finance.cashflow.view', now()),
  ('${ROLE_ID}_rp_finance_debt_view', '${ROLE_ID}', 'finance.debt.view', now()),
  ('${ROLE_ID}_rp_scope_all', '${ROLE_ID}', 'data.scope.all', now());

INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES (
  '${USER_ID}',
  'reports-${RUN_ID_LOWER}',
  'reports-${RUN_ID_LOWER}@smarttour.local',
  'Reports Smoke User',
  'not-used-by-token-smoke',
  'ACTIVE',
  'RPT-BR-A',
  'RPT-DEP-A',
  now(),
  now()
);

INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES ('ur_reports_${RUN_ID_SAFE}', '${USER_ID}', '${ROLE_ID}', now());

INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES ('${SESSION_ID}', '${USER_ID}', '${TOKEN_HASH}', 'reports-smoke', '127.0.0.1', now() + interval '1 hour', now(), now());

INSERT INTO "Customer" (id, code, "fullName", phone, email, branch, department, market, "createdAt", "updatedAt")
VALUES
  ('${CUSTOMER_A_ID}', '${RUN_ID}-CUS-A', 'Reports Customer A', '098${RUN_ID_SAFE:0:7}1', 'customer-a-${RUN_ID_LOWER}@smarttour.local', 'RPT-BR-A', 'RPT-DEP-A', 'RPT Market A', now(), now()),
  ('${CUSTOMER_B_ID}', '${RUN_ID}-CUS-B', 'Reports Customer B', '098${RUN_ID_SAFE:0:7}2', 'customer-b-${RUN_ID_LOWER}@smarttour.local', 'RPT-BR-B', 'RPT-DEP-B', 'RPT Market B', now(), now());

INSERT INTO "SupplierCategory" (id, name, "createdAt", "updatedAt")
VALUES ('${SUPPLIER_CATEGORY_ID}', '${RUN_ID} Supplier Category', now(), now());

INSERT INTO "Supplier" (id, "categoryId", "supplierCode", name, phone, email, status, "createdAt", "updatedAt")
VALUES ('${SUPPLIER_A_ID}', '${SUPPLIER_CATEGORY_ID}', '${RUN_ID}-SUP-A', 'Reports Supplier A', '097${RUN_ID_SAFE:0:7}1', 'supplier-a-${RUN_ID_LOWER}@smarttour.local', 'ACTIVE', now(), now());

INSERT INTO "Order" (
  id, type, "systemCode", "customerId", "tourCode", name, route, "marketGroup", "bookingDate", "paymentDate", "startDate", "endDate",
  status, "paymentStatus", "costStatus", "createdBy", branch, department, "customerName", "customerType", "customerPhone",
  "customerEmail", "agencyName", "operatorOwner", "adultQty", "childQty", "infantQty", quantity,
  "totalRevenue", "paidAmount", "remainingRevenue", "totalCost", "paidCost", "remainingCost", profit, commission,
  "settledAt", "createdAt", "updatedAt"
) VALUES
  (
    '${ORDER_A_ID}', 'FIT_TOUR', '${RUN_ID}-ORD-A', '${CUSTOMER_A_ID}', '${RUN_ID}-TOUR-A', 'Reports Order A', 'Ha Noi - Ha Long', 'RPT Market A',
    '2026-08-20T00:00:00Z', '2026-09-05T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z',
    'SETTLED', 'PARTIAL', 'PARTIAL', 'rpt-created-a', 'RPT-BR-A', 'RPT-DEP-A', 'Reports Customer A', 'VIP', '098${RUN_ID_SAFE:0:7}1',
    'customer-a-${RUN_ID_LOWER}@smarttour.local', 'RPT Agency A', 'rpt-employee-a', 2, 1, 0, 3,
    1000, 400, 600, 500, 200, 300, 500, 50,
    '2026-09-10T00:00:00Z', '2026-09-01T10:00:00Z', '2026-09-15T00:00:00Z'
  ),
  (
    '${ORDER_B_ID}', 'HOTEL_BOOKING', '${RUN_ID}-ORD-B', '${CUSTOMER_B_ID}', '${RUN_ID}-HOTEL-B', 'Reports Order B', 'Da Nang', 'RPT Market B',
    '2026-08-21T00:00:00Z', '2026-09-06T00:00:00Z', '2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z',
    'SETTLED', 'PAID', 'PAID', 'rpt-created-b', 'RPT-BR-B', 'RPT-DEP-B', 'Reports Customer B', 'STANDARD', '098${RUN_ID_SAFE:0:7}2',
    'customer-b-${RUN_ID_LOWER}@smarttour.local', 'RPT Agency B', 'rpt-employee-b', 2, 0, 0, 2,
    2000, 2000, 0, 1200, 1200, 0, 800, 80,
    '2026-09-11T00:00:00Z', '2026-09-02T10:00:00Z', '2026-09-16T00:00:00Z'
  );

INSERT INTO "CustomerLedgerEntry" (
  id, "customerId", "orderId", "sourceType", "sourceId", "entryType", "debitAmount", "creditAmount",
  "documentCode", "documentDate", "dueDate", branch, department, staff, description, "createdBy", "createdAt"
) VALUES
  ('rpt_cus_ledger_debit_${RUN_ID_SAFE}', '${CUSTOMER_A_ID}', '${ORDER_A_ID}', 'ORDER', '${RUN_ID}-CUS-DEBIT-A', 'DEBIT', 1000, 0, '${RUN_ID}-CUS-DEBIT-A', '2026-09-03T00:00:00Z', '2026-09-20T00:00:00Z', 'RPT-BR-A', 'RPT-DEP-A', 'rpt-employee-a', '${RUN_ID} customer debit', 'reports-smoke', now()),
  ('rpt_cus_ledger_credit_${RUN_ID_SAFE}', '${CUSTOMER_A_ID}', '${ORDER_A_ID}', 'FINANCE_RECEIPT', '${RUN_ID}-CUS-CREDIT-A', 'CREDIT', 0, 400, '${RUN_ID}-CUS-CREDIT-A', '2026-09-04T00:00:00Z', null, 'RPT-BR-A', 'RPT-DEP-A', 'rpt-employee-a', '${RUN_ID} customer credit', 'reports-smoke', now());

INSERT INTO "SupplierLedgerEntry" (
  id, "supplierId", "orderId", "sourceType", "sourceId", "entryType", "debitAmount", "creditAmount",
  "documentCode", "documentDate", "dueDate", branch, department, staff, description, "createdBy", "createdAt"
) VALUES
  ('rpt_sup_ledger_credit_${RUN_ID_SAFE}', '${SUPPLIER_A_ID}', '${ORDER_A_ID}', 'OPERATION_VOUCHER', '${RUN_ID}-SUP-CREDIT-A', 'CREDIT', 0, 500, '${RUN_ID}-SUP-CREDIT-A', '2026-09-03T00:00:00Z', '2026-09-22T00:00:00Z', 'RPT-BR-A', 'RPT-DEP-A', 'rpt-employee-a', '${RUN_ID} supplier payable', 'reports-smoke', now()),
  ('rpt_sup_ledger_debit_${RUN_ID_SAFE}', '${SUPPLIER_A_ID}', '${ORDER_A_ID}', 'FINANCE_PAYMENT', '${RUN_ID}-SUP-DEBIT-A', 'DEBIT', 200, 0, '${RUN_ID}-SUP-DEBIT-A', '2026-09-04T00:00:00Z', null, 'RPT-BR-A', 'RPT-DEP-A', 'rpt-employee-a', '${RUN_ID} supplier paid', 'reports-smoke', now());

INSERT INTO "FinanceCashflowEntry" (
  id, "sourceType", "sourceId", "entryType", amount, "paymentMethod", "paymentDate", branch, department, staff, "orderId", "customerId", "supplierId", note
) VALUES
  ('rpt_cash_receipt_a_${RUN_ID_SAFE}', 'REPORT_SMOKE_RECEIPT', '${RUN_ID}-CF-RA', 'RECEIPT', 400, 'BANK_TRANSFER', '2026-09-05T00:00:00Z', 'RPT-BR-A', 'RPT-DEP-A', '${RUN_ID}', '${ORDER_A_ID}', '${CUSTOMER_A_ID}', null, '${RUN_ID} order A receipt'),
  ('rpt_cash_payment_a_${RUN_ID_SAFE}', 'REPORT_SMOKE_PAYMENT', '${RUN_ID}-CF-PA', 'PAYMENT', 200, 'BANK_TRANSFER', '2026-09-05T00:00:00Z', 'RPT-BR-A', 'RPT-DEP-A', '${RUN_ID}', '${ORDER_A_ID}', null, '${SUPPLIER_A_ID}', '${RUN_ID} order A payment'),
  ('rpt_cash_receipt_b_${RUN_ID_SAFE}', 'REPORT_SMOKE_RECEIPT', '${RUN_ID}-CF-RB', 'RECEIPT', 2000, 'BANK_TRANSFER', '2026-09-06T00:00:00Z', 'RPT-BR-B', 'RPT-DEP-B', '${RUN_ID}', '${ORDER_B_ID}', '${CUSTOMER_B_ID}', null, '${RUN_ID} order B receipt'),
  ('rpt_cash_payment_b_${RUN_ID_SAFE}', 'REPORT_SMOKE_PAYMENT', '${RUN_ID}-CF-PB', 'PAYMENT', 1200, 'BANK_TRANSFER', '2026-09-06T00:00:00Z', 'RPT-BR-B', 'RPT-DEP-B', '${RUN_ID}', '${ORDER_B_ID}', null, '${SUPPLIER_A_ID}', '${RUN_ID} order B payment');
SQL

export API_URL RUN_ID RUN_ID_SAFE TOKEN CUSTOMER_A_ID CUSTOMER_B_ID SUPPLIER_A_ID

run_node() {
  if command -v node >/dev/null 2>&1; then
    node
    return
  fi
  docker run --rm --network host -i \
    -e API_URL \
    -e RUN_ID \
    -e RUN_ID_SAFE \
    -e TOKEN \
    -e CUSTOMER_A_ID \
    -e CUSTOMER_B_ID \
    -e SUPPLIER_A_ID \
    node:22-alpine node
}

run_node <<'NODE'
const api = process.env.API_URL || 'http://127.0.0.1:4000/api';
const run = process.env.RUN_ID;
const token = process.env.TOKEN;
const customerAId = process.env.CUSTOMER_A_ID;
const supplierAId = process.env.SUPPLIER_A_ID;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function almost(actual, expected, label, epsilon = 0.01) {
  const value = Number(actual);
  if (!Number.isFinite(value) || Math.abs(value - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertNumber(value, label) {
  if (!Number.isFinite(Number(value))) throw new Error(`${label}: expected a numeric value, got ${value}`);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}: expected array`);
}

function qs(params) {
  const query = new URLSearchParams(params);
  return query.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, ok = [200]) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(api + path, { headers: { Authorization: `Bearer ${token}` } });
      const text = await response.text();
      let data = text;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (ok.includes(response.status)) {
        console.log(`${response.status} GET ${path}`);
        return data;
      }
      if (![502, 503, 504].includes(response.status) || attempt === 30) {
        throw new Error(`GET ${path} -> ${response.status} ${String(text).slice(0, 400)}`);
      }
      lastError = new Error(`GET ${path} -> ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 30) break;
    }
    await sleep(1000);
  }
  throw lastError;
}

async function csv(path, expectedRows) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(api + path, { headers: { Authorization: `Bearer ${token}` } });
      const text = await response.text();
      if (response.status === 200) {
        const lines = text.trim() ? text.replace(/\r/g, '').split('\n').filter(Boolean) : [];
        const rows = lines.length ? lines.length - 1 : 0;
        if (rows !== expectedRows) throw new Error(`CSV ${path}: expected ${expectedRows} data rows, got ${rows}`);
        console.log(`200 CSV ${path} (${rows} rows)`);
        return text;
      }
      if (![502, 503, 504].includes(response.status) || attempt === 30) {
        throw new Error(`CSV ${path} -> ${response.status} ${text.slice(0, 400)}`);
      }
      lastError = new Error(`CSV ${path} -> ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 30) break;
    }
    await sleep(1000);
  }
  throw lastError;
}

function byKey(rows, key) {
  return rows.find((row) => row.key === key || row.label === key);
}

function reportSummary(data, label, expected) {
  almost(data.summary.totalRevenue, expected.totalRevenue, `${label}.totalRevenue`);
  almost(data.summary.paidAmount, expected.paidAmount, `${label}.paidAmount`);
  almost(data.summary.remainingRevenue, expected.remainingRevenue, `${label}.remainingRevenue`);
  almost(data.summary.totalCost, expected.totalCost, `${label}.totalCost`);
  almost(data.summary.paidCost, expected.paidCost, `${label}.paidCost`);
  almost(data.summary.remainingCost, expected.remainingCost, `${label}.remainingCost`);
  almost(data.summary.profit, expected.profit, `${label}.profit`);
  almost(data.summary.commission, expected.commission, `${label}.commission`);
}

function summaryShape(summary, label) {
  assert(summary && typeof summary === 'object', `${label}.summary missing`);
  for (const key of ['totalRevenue', 'paidAmount', 'remainingRevenue', 'totalCost', 'paidCost', 'remainingCost', 'profit', 'commission', 'marginRate']) {
    assertNumber(summary[key], `${label}.summary.${key}`);
  }
}

function metricRowsShape(rows, label) {
  assertArray(rows, `${label}.rows`);
  for (const [index, row] of rows.entries()) {
    assert(typeof row.key === 'string', `${label}.rows[${index}].key missing`);
    assert(typeof row.label === 'string', `${label}.rows[${index}].label missing`);
    for (const key of ['orderCount', 'customerCount', 'revenue', 'paidAmount', 'remainingRevenue', 'cost', 'paidCost', 'remainingCost', 'profit', 'commission', 'marginRate']) {
      assertNumber(row[key], `${label}.rows[${index}].${key}`);
    }
  }
}

function overviewShape(data) {
  for (const key of ['totalRevenue', 'paidAmount', 'remainingRevenue', 'totalCost', 'paidCost', 'remainingCost', 'profit', 'commission', 'marginRate', 'totalOrders', 'totalCustomers', 'supplierDebtCount', 'unpaidOrders', 'unpaidCostOrders', 'settledOrders']) {
    assertNumber(data[key], `overview.${key}`);
  }
  metricRowsShape(data.byType, 'overview.byType');
  metricRowsShape(data.byMonth, 'overview.byMonth');
}

function groupedReportShape(data, label) {
  summaryShape(data.summary, label);
  metricRowsShape(data.rows, label);
}

function financeShape(data) {
  groupedReportShape(data, 'finance');
  metricRowsShape(data.byType, 'finance.byType');
  assertArray(data.cashflowByMonth, 'finance.cashflowByMonth');
  for (const [index, row] of data.cashflowByMonth.entries()) {
    assert(typeof row.period === 'string', `finance.cashflowByMonth[${index}].period missing`);
    for (const key of ['received', 'paid', 'netCashflow']) assertNumber(row[key], `finance.cashflowByMonth[${index}].${key}`);
  }
  assertArray(data.orders, 'finance.orders');
}

function customerDebtShape(data, label = 'customerDebt') {
  summaryShape(data.summary, label);
  for (const key of ['debit', 'credit', 'balance', 'count', 'orderCount', 'customerCount']) assertNumber(data.summary[key], `${label}.summary.${key}`);
  assertArray(data.rows, `${label}.rows`);
  for (const [index, row] of data.rows.entries()) {
    for (const key of ['customerId', 'customerCode', 'customerName', 'label']) assert(typeof row[key] === 'string', `${label}.rows[${index}].${key} missing`);
    for (const key of ['revenue', 'paidAmount', 'remainingRevenue', 'debitTotal', 'creditTotal', 'balance', 'orderCount', 'entryCount']) assertNumber(row[key], `${label}.rows[${index}].${key}`);
    assertArray(row.orderCodes, `${label}.rows[${index}].orderCodes`);
    assertArray(row.orderIds, `${label}.rows[${index}].orderIds`);
  }
}

function supplierDebtShape(data, label = 'supplierDebt') {
  summaryShape(data.summary, label);
  for (const key of ['supplierCount', 'totalPurchase', 'paidAmount', 'remainingAmount', 'debit', 'credit', 'balance', 'count', 'orderCount', 'voucherCount']) assertNumber(data.summary[key], `${label}.summary.${key}`);
  assertArray(data.rows, `${label}.rows`);
  for (const [index, row] of data.rows.entries()) {
    for (const key of ['supplierId', 'supplierCode', 'supplierName', 'label']) assert(typeof row[key] === 'string', `${label}.rows[${index}].${key} missing`);
    for (const key of ['totalPurchase', 'paidAmount', 'remainingAmount', 'debitTotal', 'creditTotal', 'balance', 'orderCount', 'voucherCount', 'entryCount']) assertNumber(row[key], `${label}.rows[${index}].${key}`);
    assertArray(row.voucherCodes, `${label}.rows[${index}].voucherCodes`);
    assertArray(row.voucherIds, `${label}.rows[${index}].voucherIds`);
    assertArray(row.orderIds, `${label}.rows[${index}].orderIds`);
  }
}

function employeeShape(data) {
  groupedReportShape(data, 'employees');
  for (const [index, row] of data.rows.entries()) {
    for (const key of ['averageOrderValue', 'profitAfterCommission', 'paidRatio']) assertNumber(row[key], `employees.rows[${index}].${key}`);
  }
}

function errorShape(data, label, statusCode) {
  assert(data && typeof data === 'object', `${label}: expected JSON error body`);
  assert(Number(data.statusCode) === statusCode, `${label}.statusCode expected ${statusCode}, got ${data.statusCode}`);
  assert(typeof data.message === 'string' && data.message.length > 0, `${label}.message missing`);
  assert(typeof data.error === 'string' && data.error.length > 0, `${label}.error missing`);
}

function metricRow(row, label, expected) {
  assert(row, `${label}: missing row`);
  almost(row.revenue, expected.totalRevenue, `${label}.revenue`);
  almost(row.paidAmount, expected.paidAmount, `${label}.paidAmount`);
  almost(row.remainingRevenue, expected.remainingRevenue, `${label}.remainingRevenue`);
  almost(row.cost, expected.totalCost, `${label}.cost`);
  almost(row.paidCost, expected.paidCost, `${label}.paidCost`);
  almost(row.remainingCost, expected.remainingCost, `${label}.remainingCost`);
  almost(row.profit, expected.profit, `${label}.profit`);
  almost(row.commission, expected.commission, `${label}.commission`);
}

function zeroSummary(data, label) {
  reportSummary(data, label, { totalRevenue: 0, paidAmount: 0, remainingRevenue: 0, totalCost: 0, paidCost: 0, remainingCost: 0, profit: 0, commission: 0 });
}

(async () => {
  const expectedAll = { totalRevenue: 3000, paidAmount: 2400, remainingRevenue: 600, totalCost: 1700, paidCost: 1400, remainingCost: 300, profit: 1300, commission: 130 };
  const expectedA = { totalRevenue: 1000, paidAmount: 400, remainingRevenue: 600, totalCost: 500, paidCost: 200, remainingCost: 300, profit: 500, commission: 50 };
  const expectedB = { totalRevenue: 2000, paidAmount: 2000, remainingRevenue: 0, totalCost: 1200, paidCost: 1200, remainingCost: 0, profit: 800, commission: 80 };

  const overview = await request(`/reports/overview?${qs({ search: run })}`);
  overviewShape(overview);
  almost(overview.totalRevenue, expectedAll.totalRevenue, 'overview.totalRevenue');
  almost(overview.paidAmount, expectedAll.paidAmount, 'overview.paidAmount');
  almost(overview.remainingRevenue, expectedAll.remainingRevenue, 'overview.remainingRevenue');
  almost(overview.totalCost, expectedAll.totalCost, 'overview.totalCost');
  almost(overview.paidCost, expectedAll.paidCost, 'overview.paidCost');
  almost(overview.remainingCost, expectedAll.remainingCost, 'overview.remainingCost');
  almost(overview.profit, expectedAll.profit, 'overview.profit');
  almost(overview.commission, expectedAll.commission, 'overview.commission');
  assert(overview.totalOrders === 2, `overview.totalOrders expected 2, got ${overview.totalOrders}`);
  assert(overview.supplierDebtCount === 1, `overview.supplierDebtCount expected 1, got ${overview.supplierDebtCount}`);

  const revenue = await request(`/reports/revenue/by-type?${qs({ search: run })}`);
  groupedReportShape(revenue, 'revenue');
  reportSummary(revenue, 'revenue', expectedAll);
  metricRow(byKey(revenue.rows, 'FIT_TOUR'), 'revenue.FIT_TOUR', expectedA);
  metricRow(byKey(revenue.rows, 'HOTEL_BOOKING'), 'revenue.HOTEL_BOOKING', expectedB);

  const profit = await request(`/reports/profit?${qs({ search: run, groupBy: 'by-employee' })}`);
  groupedReportShape(profit, 'profit');
  reportSummary(profit, 'profit', expectedAll);
  almost(byKey(profit.rows, 'rpt-employee-a').profitAfterCommission, 450, 'profit.employeeA.afterCommission');
  almost(byKey(profit.rows, 'rpt-employee-b').profitAfterCommission, 720, 'profit.employeeB.afterCommission');

  const financeReport = await request(`/reports/finance?${qs({ search: run })}`);
  financeShape(financeReport);
  reportSummary(financeReport, 'financeReport', expectedAll);
  const cashflowMonth = financeReport.cashflowByMonth.find((row) => row.period === '2026-09');
  assert(cashflowMonth, 'financeReport.cashflowByMonth missing 2026-09');
  almost(cashflowMonth.received, 2400, 'financeReport.cashflowByMonth.received');
  almost(cashflowMonth.paid, 1400, 'financeReport.cashflowByMonth.paid');
  almost(cashflowMonth.netCashflow, 1000, 'financeReport.cashflowByMonth.netCashflow');

  const financeCashflow = await request(`/finance/cashflow?${qs({ staff: run })}`);
  almost(financeCashflow.summary.totalReceipt, financeReport.summary.paidAmount, 'finance cashflow totalReceipt vs report paidAmount');
  almost(financeCashflow.summary.totalPayment, financeReport.summary.paidCost, 'finance cashflow totalPayment vs report paidCost');
  almost(financeCashflow.summary.netCashflow, financeReport.summary.paidAmount - financeReport.summary.paidCost, 'finance cashflow net');

  const financeCustomerDebt = await request(`/finance/debt/customers?${qs({ customerId: customerAId })}`);
  const reportCustomerDebt = await request(`/reports/debt/customers?${qs({ customerId: customerAId })}`);
  customerDebtShape(reportCustomerDebt);
  almost(reportCustomerDebt.summary.debit, financeCustomerDebt.summary.debit, 'customer debt debit');
  almost(reportCustomerDebt.summary.credit, financeCustomerDebt.summary.credit, 'customer debt credit');
  almost(reportCustomerDebt.summary.balance, financeCustomerDebt.summary.balance, 'customer debt balance');
  almost(reportCustomerDebt.rows[0].debitTotal, financeCustomerDebt.rows[0].debitTotal, 'customer debt row debitTotal');
  almost(reportCustomerDebt.rows[0].creditTotal, financeCustomerDebt.rows[0].creditTotal, 'customer debt row creditTotal');
  almost(reportCustomerDebt.rows[0].balance, financeCustomerDebt.rows[0].balance, 'customer debt row balance');

  const financeSupplierDebt = await request(`/finance/debt/suppliers?${qs({ supplierId: supplierAId })}`);
  const reportSupplierDebt = await request(`/reports/debt/suppliers?${qs({ supplierId: supplierAId })}`);
  supplierDebtShape(reportSupplierDebt);
  almost(reportSupplierDebt.summary.debit, financeSupplierDebt.summary.debit, 'supplier debt debit');
  almost(reportSupplierDebt.summary.credit, financeSupplierDebt.summary.credit, 'supplier debt credit');
  almost(reportSupplierDebt.summary.balance, financeSupplierDebt.summary.balance, 'supplier debt balance');
  almost(reportSupplierDebt.rows[0].debitTotal, financeSupplierDebt.rows[0].debitTotal, 'supplier debt row debitTotal');
  almost(reportSupplierDebt.rows[0].creditTotal, financeSupplierDebt.rows[0].creditTotal, 'supplier debt row creditTotal');
  almost(reportSupplierDebt.rows[0].balance, financeSupplierDebt.rows[0].balance, 'supplier debt row balance');

  const groups = {
    'by-created-date': ['2026-09-01', '2026-09-02'],
    'by-checkin-date': ['2026-10-01', '2026-10-10'],
    'by-checkout-date': ['2026-10-05', '2026-10-12'],
    'by-approved-date': ['2026-09-10', '2026-09-11'],
    'by-employee': ['rpt-employee-a', 'rpt-employee-b'],
    'by-agency': ['RPT Agency A', 'RPT Agency B'],
    'by-branch': ['RPT-BR-A', 'RPT-BR-B'],
    'by-department': ['RPT-DEP-A', 'RPT-DEP-B'],
    'by-market': ['RPT Market A', 'RPT Market B'],
    'by-type': ['FIT_TOUR', 'HOTEL_BOOKING'],
  };
  for (const [group, keys] of Object.entries(groups)) {
    const data = await request(`/reports/revenue/${group}?${qs({ search: run })}`);
    groupedReportShape(data, `group.${group}`);
    reportSummary(data, `group.${group}`, expectedAll);
    for (const key of keys) assert(byKey(data.rows, key), `group ${group} missing key ${key}`);
  }

  const overviewBranchA = await request(`/reports/overview?${qs({ search: run, branch: 'RPT-BR-A' })}`);
  overviewShape(overviewBranchA);
  almost(overviewBranchA.totalRevenue, expectedA.totalRevenue, 'overview.filter.branch.totalRevenue');
  assert(overviewBranchA.totalOrders === 1, `overview.filter.branch.totalOrders expected 1, got ${overviewBranchA.totalOrders}`);
  reportSummary(await request(`/reports/revenue/by-type?${qs({ search: run, dateFrom: '2026-09-01', dateTo: '2026-09-01' })}`), 'filter.date', expectedA);
  reportSummary(await request(`/reports/revenue/by-type?${qs({ search: run, branch: 'RPT-BR-A' })}`), 'filter.branch', expectedA);
  reportSummary(await request(`/reports/revenue/by-type?${qs({ search: run, department: 'RPT-DEP-B' })}`), 'filter.department', expectedB);
  reportSummary(await request(`/reports/revenue/by-type?${qs({ search: run, type: 'HOTEL_BOOKING' })}`), 'filter.type', expectedB);
  reportSummary(await request(`/reports/revenue/by-type?${qs({ search: run, paymentStatus: 'PAID' })}`), 'filter.paymentStatus', expectedB);
  reportSummary(await request(`/reports/profit?${qs({ search: run, groupBy: 'by-type', type: 'FIT_TOUR' })}`), 'profit.filter.type', expectedA);
  reportSummary(await request(`/reports/finance?${qs({ search: run, department: 'RPT-DEP-B' })}`), 'finance.filter.department', expectedB);
  employeeShape(await request(`/reports/employees/performance?${qs({ search: run, paymentStatus: 'PAID' })}`));
  zeroSummary(await request(`/reports/revenue/by-type?${qs({ search: run, branch: 'NO-SUCH-BRANCH' })}`), 'filter.emptyBranch');

  almost((await request(`/reports/debt/customers?${qs({ customerId: customerAId, branch: 'RPT-BR-A' })}`)).summary.balance, 600, 'customer debt branch include');
  almost((await request(`/reports/debt/customers?${qs({ customerId: customerAId, branch: 'RPT-BR-B' })}`)).summary.balance, 0, 'customer debt branch exclude');
  almost((await request(`/reports/debt/customers?${qs({ customerId: customerAId, type: 'FIT_TOUR' })}`)).summary.balance, 600, 'customer debt type include');
  almost((await request(`/reports/debt/customers?${qs({ customerId: customerAId, paymentStatus: 'PAID' })}`)).summary.balance, 0, 'customer debt paymentStatus exclude');
  almost((await request(`/reports/debt/customers?${qs({ customerId: customerAId, dateFrom: '2026-09-03', dateTo: '2026-09-04' })}`)).summary.balance, 600, 'customer debt date range');

  almost((await request(`/reports/debt/suppliers?${qs({ supplierId: supplierAId, branch: 'RPT-BR-A' })}`)).summary.balance, 300, 'supplier debt branch include');
  almost((await request(`/reports/debt/suppliers?${qs({ supplierId: supplierAId, department: 'RPT-DEP-B' })}`)).summary.balance, 0, 'supplier debt department exclude');
  almost((await request(`/reports/debt/suppliers?${qs({ supplierId: supplierAId, type: 'FIT_TOUR' })}`)).summary.balance, 300, 'supplier debt type include');
  almost((await request(`/reports/debt/suppliers?${qs({ supplierId: supplierAId, paymentStatus: 'PAID' })}`)).summary.balance, 0, 'supplier debt paymentStatus exclude');
  almost((await request(`/reports/debt/suppliers?${qs({ supplierId: supplierAId, dateFrom: '2026-09-03', dateTo: '2026-09-04' })}`)).summary.balance, 300, 'supplier debt date range');

  const emptyOverview = await request(`/reports/overview?${qs({ search: `${run}-NO-DATA` })}`);
  overviewShape(emptyOverview);
  almost(emptyOverview.totalRevenue, 0, 'empty.overview.totalRevenue');
  assert(emptyOverview.totalOrders === 0, `empty.overview.totalOrders expected 0, got ${emptyOverview.totalOrders}`);
  const emptyRevenue = await request(`/reports/revenue/by-type?${qs({ search: `${run}-NO-DATA` })}`);
  groupedReportShape(emptyRevenue, 'empty.revenue');
  zeroSummary(emptyRevenue, 'empty.revenue');
  assert(emptyRevenue.rows.length === 0, `empty.revenue.rows expected 0, got ${emptyRevenue.rows.length}`);
  const emptyProfit = await request(`/reports/profit?${qs({ search: `${run}-NO-DATA` })}`);
  groupedReportShape(emptyProfit, 'empty.profit');
  zeroSummary(emptyProfit, 'empty.profit');
  assert(emptyProfit.rows.length === 0, `empty.profit.rows expected 0, got ${emptyProfit.rows.length}`);
  const emptyFinance = await request(`/reports/finance?${qs({ search: `${run}-NO-DATA` })}`);
  financeShape(emptyFinance);
  zeroSummary(emptyFinance, 'empty.finance');
  assert(emptyFinance.rows.length === 0, `empty.finance.rows expected 0, got ${emptyFinance.rows.length}`);
  const emptyCustomerDebt = await request(`/reports/debt/customers?${qs({ customerId: 'NO-SUCH-CUSTOMER' })}`);
  customerDebtShape(emptyCustomerDebt, 'empty.customerDebt');
  almost(emptyCustomerDebt.summary.balance, 0, 'empty.customerDebt.balance');
  assert(emptyCustomerDebt.rows.length === 0, `empty.customerDebt.rows expected 0, got ${emptyCustomerDebt.rows.length}`);
  const emptySupplierDebt = await request(`/reports/debt/suppliers?${qs({ supplierId: 'NO-SUCH-SUPPLIER' })}`);
  supplierDebtShape(emptySupplierDebt, 'empty.supplierDebt');
  almost(emptySupplierDebt.summary.balance, 0, 'empty.supplierDebt.balance');
  assert(emptySupplierDebt.rows.length === 0, `empty.supplierDebt.rows expected 0, got ${emptySupplierDebt.rows.length}`);
  const emptyEmployees = await request(`/reports/employees/performance?${qs({ search: `${run}-NO-DATA` })}`);
  employeeShape(emptyEmployees);
  zeroSummary(emptyEmployees, 'empty.employees');
  assert(emptyEmployees.rows.length === 0, `empty.employees.rows expected 0, got ${emptyEmployees.rows.length}`);

  errorShape(await request('/reports/revenue/unsupported-group', [400]), 'unsupported group', 400);
  errorShape(await request('/reports/export/unsupported-report', [400]), 'unsupported export', 400);

  await csv(`/reports/export/revenue?${qs({ search: run, groupBy: 'by-type' })}`, revenue.rows.length);
  await csv(`/reports/export/profit?${qs({ search: run, groupBy: 'by-employee' })}`, profit.rows.length);
  await csv(`/reports/export/finance?${qs({ search: run })}`, financeReport.rows.length);
  await csv(`/reports/export/customer-debt?${qs({ customerId: customerAId })}`, reportCustomerDebt.rows.length);
  await csv(`/reports/export/supplier-debt?${qs({ supplierId: supplierAId })}`, reportSupplierDebt.rows.length);
  const employees = await request(`/reports/employees/performance?${qs({ search: run })}`);
  employeeShape(employees);
  reportSummary(employees, 'employees', expectedAll);
  metricRow(byKey(employees.rows, 'rpt-employee-a'), 'employees.rpt-employee-a', expectedA);
  almost(byKey(employees.rows, 'rpt-employee-a').averageOrderValue, 1000, 'employees.employeeA.averageOrderValue');
  almost(byKey(employees.rows, 'rpt-employee-a').profitAfterCommission, 450, 'employees.employeeA.profitAfterCommission');
  await csv(`/reports/export/employees?${qs({ search: run })}`, employees.rows.length);

  console.log('SMOKE_REPORTS_BUSINESS_RULES_OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
