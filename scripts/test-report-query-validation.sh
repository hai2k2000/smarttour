#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"
docker compose build api >/dev/null

docker compose run --rm --no-deps \
  -v "$PWD:/workspace:ro" \
  --entrypoint sh api -lc "cd /app && node" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const dto = require('./apps/api/dist/modules/reports/dto/report-query.dto');
const { ReportsService } = require('./apps/api/dist/modules/reports/reports.service');

function validationErrors(Dto, query) {
  return validateSync(plainToInstance(Dto, query), { whitelist: true });
}

function assertValid(Dto, query, label) {
  assert.equal(validationErrors(Dto, query).length, 0, label);
}

function assertInvalid(Dto, query, label) {
  assert.notEqual(validationErrors(Dto, query).length, 0, label);
}

async function assertBadRequest(action, label) {
  await assert.rejects(action, (error) => error?.status === 400, label);
}

async function main() {
  const reportsClient = fs.readFileSync('/workspace/apps/web/app/reports/ReportsClient.tsx', 'utf8');
  const reportsServiceSource = fs.readFileSync('/workspace/apps/api/src/modules/reports/reports.service.ts', 'utf8');
  {
    const start = reportsServiceSource.indexOf('async overview(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes('orderOverviewCountsFromDb(query, user)'), 'overview counts must use database count helper');
    assert(block.includes('orderCustomerCountFromDb(query, user)'), 'overview totalCustomers must use database customer count helper');
    assert(block.includes('supplierDebtCountFromDb(query, user)'), 'overview supplierDebtCount must use database supplier debt count helper');
    assert(!block.includes('totalOrders: orders.length'), 'overview totalOrders must not depend on bounded order rows');
    assert(!block.includes('totalCustomers: this.uniqueCount(orders.map('), 'overview totalCustomers must not depend on bounded order rows');
    assert(!block.includes('supplierDebtCount: supplierDebt.rows.length'), 'overview supplierDebtCount must not depend on capped supplier debt rows');
    assert(!block.includes('orders.filter((order) => Number(order.remainingRevenue) > 0).length'), 'overview unpaidOrders must not depend on bounded order rows');
    assert(!block.includes('orders.filter((order) => Number(order.remainingCost) > 0).length'), 'overview unpaidCostOrders must not depend on bounded order rows');
    assert(!block.includes('orders.filter((order) => order.settledAt).length'), 'overview settledOrders must not depend on bounded order rows');
  }
  for (const method of ['businessSummary', 'employeePerformance']) {
    const start = reportsServiceSource.indexOf('async ' + method + '(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes('orderSummaryFromDb(query, user)'), `${method} summary must use database aggregate helper`);
    assert(!block.includes('summary(orders)'), `${method} summary must not depend on bounded order rows`);
  }
  for (const method of ['revenue', 'profit']) {
    const start = reportsServiceSource.indexOf('async ' + method + '(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes('orderSummaryFromDb(scopedQuery, user)'), `${method} summary must use database aggregate helper`);
    assert(!block.includes('return this.groupOrders(orders, group)'), `${method} must not return capped-row summary from groupOrders`);
    assert(!block.includes('summary: result.summary'), `${method} must not keep capped-row summary from groupOrders`);
  }
  for (const [method, helper, oldSummary] of [
    ['customerDebt', 'customerDebtSummaryFromDb(where)', 'customerDebtSummary(rows)'],
    ['supplierDebt', 'supplierDebtSummaryFromDb(where)', 'supplierDebtSummary(rows)'],
  ]) {
    const start = reportsServiceSource.indexOf('async ' + method + '(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes(helper), `${method} summary must use database grouped summary helper`);
    assert(!block.includes(oldSummary), `${method} summary must not depend on capped debt rows`);
  }
  {
    const start = reportsServiceSource.indexOf('async finance(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes('financeSummaryFromDb(query, orderIds, user)'), 'finance report summary must use database summary helper');
    assert(!block.includes('cashflowSummary(cashflowRows)'), 'finance report cashflow totals must not depend on capped cashflow rows');
    assert(!block.includes('receiptCount: receiptRows.length'), 'finance report receiptCount must not depend on capped receipt rows');
    assert(!block.includes('paymentCount: paymentRows.length'), 'finance report paymentCount must not depend on capped payment rows');
  }
  {
    const start = reportsServiceSource.indexOf('private async orderSummaryFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1400);
    assert(block.includes('aggregate({'), 'orderSummaryFromDb must aggregate order totals in the database');
    assert(block.includes('_sum:'), 'orderSummaryFromDb must sum financial fields in the database');
  }
  {
    const start = reportsServiceSource.indexOf('private async orderOverviewCountsFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1400);
    assert(block.includes('count({'), 'orderOverviewCountsFromDb must count overview metrics in the database');
    assert(block.includes('remainingRevenue: { gt: 0 }'), 'orderOverviewCountsFromDb must count unpaid revenue in the database');
    assert(block.includes('remainingCost: { gt: 0 }'), 'orderOverviewCountsFromDb must count unpaid costs in the database');
    assert(block.includes('settledAt: { not: null }'), 'orderOverviewCountsFromDb must count settled orders in the database');
  }
  {
    const start = reportsServiceSource.indexOf('private async orderCustomerCountFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 2600);
    assert(block.includes('order.groupBy({'), 'orderCustomerCountFromDb must count customer identifiers in the database');
    assert(block.includes('customerPhone: { not: null }'), 'orderCustomerCountFromDb must count phone identities in the database');
    assert(block.includes('customerEmail: { not: null }'), 'orderCustomerCountFromDb must count email identities in the database');
    assert(block.includes('customerName: { not: null }'), 'orderCustomerCountFromDb must count name identities in the database');
  }
  {
    const start = reportsServiceSource.indexOf('private async supplierDebtCountFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1600);
    assert(block.includes('supplierLedgerEntry.groupBy({'), 'supplierDebtCountFromDb must group suppliers in the database');
    assert(block.includes('_sum:'), 'supplierDebtCountFromDb must sum supplier ledger balances in the database');
  }
  for (const helper of ['customerDebtSummaryFromDb', 'supplierDebtSummaryFromDb']) {
    const start = reportsServiceSource.indexOf('private async ' + helper + '(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1800);
    assert(block.includes('.groupBy({'), `${helper} must group ledger balances in the database`);
    assert(block.includes('_sum:'), `${helper} must sum ledger fields in the database`);
  }
  {
    const start = reportsServiceSource.indexOf('private async financeSummaryFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 2200);
    assert(block.includes('financeReceipt.count({'), 'financeSummaryFromDb must count receipts in the database');
    assert(block.includes('financePayment.count({'), 'financeSummaryFromDb must count payments in the database');
    assert(block.includes('financeCashflowEntry.groupBy({'), 'financeSummaryFromDb must group cashflow totals in the database');
    assert(block.includes('_sum: { amount: true }'), 'financeSummaryFromDb must sum cashflow amounts in the database');
  }
  assert(reportsClient.includes('financeFilterKeys'), 'reports browser must filter hybrid finance query keys');
  assert(reportsClient.includes('financeDateFields'), 'reports browser must expose finance date fields');
  assert(reportsClient.includes('customerDebtFilterKeys'), 'reports browser must filter customer debt query keys');
  assert(reportsClient.includes("query.dateField = 'documentDate'"), 'reports browser must use documentDate for debt queries');

  assert(dto.OrderReportQueryDto, 'OrderReportQueryDto must exist');
  assert(dto.FinanceReportQueryDto, 'FinanceReportQueryDto must exist');
  assert(dto.DebtReportQueryDto, 'DebtReportQueryDto must exist');

  assertInvalid(dto.OrderReportQueryDto, { type: 'FIT' }, 'order report must reject Tour-only type');
  assertInvalid(dto.OrderReportQueryDto, { dateField: 'closedAt' }, 'order report must reject Tour-only dateField');
  assertInvalid(dto.OrderReportQueryDto, { status: 'ARCHIVED' }, 'order report must reject invalid status');
  assertValid(dto.OrderReportQueryDto, { type: 'HOTEL_BOOKING', dateField: 'settledAt', status: 'SETTLED' }, 'order report must accept Order filters');

  assertInvalid(dto.FinanceReportQueryDto, { type: 'FIT' }, 'Finance report must reject Tour-only type');
  assertInvalid(dto.FinanceReportQueryDto, { dateField: 'closedAt' }, 'Finance report must reject Tour-only dateField');
  assertInvalid(dto.FinanceReportQueryDto, { status: 'ARCHIVED' }, 'Finance report must reject invalid status');
  assertValid(dto.FinanceReportQueryDto, { type: 'HOTEL_BOOKING', dateField: 'documentDate', costStatus: 'PENDING' }, 'Finance report must accept Order and document filters');

  assertInvalid(dto.DebtReportQueryDto, { dateField: 'paymentDate' }, 'debt report must reject misleading Order dateField');
  assertInvalid(dto.DebtReportQueryDto, { dateField: 'closedAt' }, 'debt report must reject Tour-only dateField');
  assertValid(dto.DebtReportQueryDto, { type: 'HOTEL_BOOKING', dateField: 'documentDate' }, 'debt report must accept documentDate');

  let orderCalls = 0;
  let tourCalls = 0;
  let debtCalls = 0;
  let supplierDebtCalls = 0;
  let financeDocumentCalls = 0;
  let historyCalls = 0;
  const service = new ReportsService({
    order: { findMany: async () => { orderCalls += 1; return []; } },
    tour: { findMany: async () => { tourCalls += 1; return []; } },
    customerLedgerEntry: {
      findMany: async () => { debtCalls += 1; return []; },
      groupBy: async () => [],
    },
    supplierLedgerEntry: {
      findMany: async () => { supplierDebtCalls += 1; return []; },
      groupBy: async () => [],
    },
    financeReceipt: {
      findMany: async () => { financeDocumentCalls += 1; return []; },
      count: async () => 0,
    },
    financePayment: {
      findMany: async () => { financeDocumentCalls += 1; return []; },
      count: async () => 0,
    },
    financeCashflowEntry: {
      findMany: async () => { financeDocumentCalls += 1; return []; },
      groupBy: async () => [],
    },
    operationVoucher: { findMany: async () => { historyCalls += 1; return []; } },
  });

  await assertBadRequest(() => service.revenue('by-created-date', { type: 'FIT' }), 'service must reject Tour-only type on Order report');
  await assertBadRequest(() => service.revenue('by-created-date', { dateField: 'closedAt' }), 'service must reject Tour-only dateField on Order report');
  await assertBadRequest(() => service.finance({ type: 'FIT' }), 'service must reject Tour-only type on hybrid Finance report');
  await assertBadRequest(() => service.finance({ dateField: 'closedAt' }), 'service must reject Tour-only dateField on hybrid Finance report');
  await service.finance({ type: 'HOTEL_BOOKING', dateField: 'documentDate', costStatus: 'PENDING' });
  await service.exportCsv('finance', { type: 'HOTEL_BOOKING', dateField: 'documentDate' });
  await assertBadRequest(() => service.customerDebt({ dateField: 'paymentDate' }), 'debt report must reject misleading Order dateField');
  await assertBadRequest(() => service.exportCsv('customer-debt', { dateField: 'paymentDate' }), 'dynamic debt export must reject misleading Order dateField');
  await assertBadRequest(() => service.supplierHistory('supplier-1', { type: 'FIT' }), 'supplier history must reject ignored report filters');
  await assertBadRequest(() => service.supplierHistory('supplier-1', { dateField: 'closedAt' }), 'supplier history must reject ignored dateField');
  assert.equal(orderCalls, 2, 'valid hybrid finance report and export must query orders exactly twice');
  assert.equal(tourCalls, 0, 'invalid Tour filters must be rejected before querying Prisma');
  assert.equal(debtCalls, 2, 'valid hybrid finance report and export must query customer debt exactly twice');
  assert.equal(supplierDebtCalls, 2, 'valid hybrid finance report and export must query supplier debt exactly twice');
  assert.equal(historyCalls, 0, 'invalid supplier history filters must be rejected before querying Prisma');
  assert.equal(financeDocumentCalls, 6, 'valid hybrid finance report and export must query receipt, payment, and cashflow rows twice');

  console.log('TEST_REPORT_QUERY_VALIDATION_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
