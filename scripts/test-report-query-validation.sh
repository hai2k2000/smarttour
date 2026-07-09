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
    assert(block.includes('orderOverviewByTypeFromDb(query, user)'), 'overview byType must use database grouped helper');
    assert(block.includes('orderOverviewByMonthFromDb(query, user)'), 'overview byMonth must use database grouped helper');
    assert(!block.includes('this.orders(query, user)'), 'overview must not load capped order rows for summary or charts');
    assert(!block.includes('totalOrders: orders.length'), 'overview totalOrders must not depend on bounded order rows');
    assert(!block.includes('totalCustomers: this.uniqueCount(orders.map('), 'overview totalCustomers must not depend on bounded order rows');
    assert(!block.includes('supplierDebtCount: supplierDebt.rows.length'), 'overview supplierDebtCount must not depend on capped supplier debt rows');
    assert(!block.includes("byType: this.groupOrders(orders, 'by-type').rows"), 'overview byType must not depend on capped order rows');
    assert(!block.includes("byMonth: this.groupOrders(orders, 'by-created-date', 'month').rows"), 'overview byMonth must not depend on capped order rows');
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
  {
    const start = reportsServiceSource.indexOf('async businessSummary(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes("orderGroupedRowsFromDb(query, 'by-type', user)"), 'businessSummary revenueByType must use database grouped rows');
    assert(block.includes("orderGroupedRowsFromDb(query, 'by-branch', user)"), 'businessSummary revenueByBranch must use database grouped rows');
    assert(block.includes("orderGroupedRowsFromDb(query, 'by-employee', user)"), 'businessSummary profitByEmployee must use database grouped rows');
    assert(!block.includes("this.groupOrders(orders, 'by-type').rows"), 'businessSummary revenueByType must not depend on capped order rows');
    assert(!block.includes("this.groupOrders(orders, 'by-branch').rows"), 'businessSummary revenueByBranch must not depend on capped order rows');
    assert(!block.includes("this.groupOrders(orders, 'by-employee').rows"), 'businessSummary profitByEmployee must not depend on capped order rows');
  }
  {
    const start = reportsServiceSource.indexOf('async employeePerformance(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes("orderGroupedRowsFromDb(query, 'by-employee', user)"), 'employeePerformance rows must use database grouped rows');
    assert(!block.includes("this.groupOrders(orders, 'by-employee').rows"), 'employeePerformance rows must not depend on capped order rows');
  }
  for (const method of ['revenue', 'profit']) {
    const start = reportsServiceSource.indexOf('async ' + method + '(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes('orderSummaryFromDb(scopedQuery, user)'), `${method} summary must use database aggregate helper`);
    assert(block.includes('orderGroupedRowsFromDb(scopedQuery, group'), `${method} rows must use database grouped row helper`);
    assert(!block.includes('this.orders(scopedQuery, user)'), `${method} rows must not load capped orders before grouping`);
    assert(!block.includes('this.groupOrders(orders, group'), `${method} rows must not depend on capped order rows`);
    assert(!block.includes('return this.groupOrders(orders, group)'), `${method} must not return capped-row summary from groupOrders`);
    assert(!block.includes('summary: result.summary'), `${method} must not keep capped-row summary from groupOrders`);
  }
  for (const [method, reportHelper, summaryHelper, rowHelper, oldSummary, oldRows] of [
    ['customerDebt', 'customerDebtReport', 'customerDebtSummaryFromDb(where)', 'customerDebtRowsFromDb(where, take)', 'customerDebtSummary(rows)', 'this.customerDebtRows(entries)'],
    ['supplierDebt', 'supplierDebtReport', 'supplierDebtSummaryFromDb(where)', 'supplierDebtRowsFromDb(where, take)', 'supplierDebtSummary(rows)', 'this.supplierDebtRows(entries)'],
  ]) {
    const publicStart = reportsServiceSource.indexOf('async ' + method + '(');
    const publicNext = reportsServiceSource.indexOf('\n  async ', publicStart + 1);
    const publicBlock = publicStart === -1 ? '' : reportsServiceSource.slice(publicStart, publicNext === -1 ? reportsServiceSource.length : publicNext);
    const helperStart = reportsServiceSource.indexOf('private async ' + reportHelper + '(');
    const helperNext = reportsServiceSource.indexOf('\n  private async ', helperStart + 1);
    const helperBlock = helperStart === -1 ? '' : reportsServiceSource.slice(helperStart, helperNext === -1 ? reportsServiceSource.length : helperNext);
    assert(publicBlock.includes(`return this.${reportHelper}(query, user, 1000)`), `${method} public endpoint must keep the standalone 1000-row report limit`);
    assert(helperBlock.includes(summaryHelper), `${method} summary must use database grouped summary helper`);
    assert(helperBlock.includes(rowHelper), `${method} rows must use database grouped row helper`);
    assert(!helperBlock.includes(oldSummary), `${method} summary must not depend on capped debt rows`);
    assert(!helperBlock.includes(oldRows), `${method} rows must not be grouped from capped ledger entries`);
    assert(!helperBlock.includes('findMany({\n      where,\n      include:'), `${method} must not load capped ledger entries before grouping report rows`);
  }
  {
    const start = reportsServiceSource.indexOf('async finance(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes('financeSummaryFromDb(query, user)'), 'finance report summary must use database summary helper');
    assert(block.includes('orderSummaryFromDb(this.financeOrderQuery(query), user)'), 'finance report order financial summary must use database order aggregate helper');
    assert(block.includes('orderCountFromDb(this.financeOrderQuery(query), user)'), 'finance report orderCount must use database order count helper');
    assert(block.includes('financeCashflowByMonthFromDb(query, user)'), 'finance report cashflowByMonth must use database grouped helper');
    assert(!block.includes('cashflowSummary(cashflowRows)'), 'finance report cashflow totals must not depend on capped cashflow rows');
    assert(!block.includes('cashflowByMonth(cashflowRows)'), 'finance report cashflowByMonth must not depend on capped cashflow rows');
    assert(!block.includes('receiptCount: receiptRows.length'), 'finance report receiptCount must not depend on capped receipt rows');
    assert(!block.includes('paymentCount: paymentRows.length'), 'finance report paymentCount must not depend on capped payment rows');
    assert(!block.includes('...grouped.summary'), 'finance report order financial summary must not depend on capped grouped order rows');
    assert(!block.includes('orderCount: orderRows.length'), 'finance report orderCount must not depend on capped order rows');
    assert(block.includes('paidAmount: financeSummary.totalReceipt'), 'finance report paidAmount must use approved receipt/cashflow evidence');
    assert(block.includes('paidCost: financeSummary.totalPayment'), 'finance report paidCost must use approved payment/cashflow evidence');
    assert(block.includes('remainingRevenue: Math.max(orderSummary.totalRevenue - financeSummary.totalReceipt, 0)'), 'finance report remainingRevenue must not use imported order paid snapshots');
    assert(block.includes('remainingCost: Math.max(orderSummary.totalCost - financeSummary.totalPayment, 0)'), 'finance report remainingCost must not use imported order paid snapshots');
  }
  {
    const start = reportsServiceSource.indexOf('private async orderSummaryFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1400);
    assert(block.includes('aggregate({'), 'orderSummaryFromDb must aggregate order totals in the database');
    assert(block.includes('_sum:'), 'orderSummaryFromDb must sum financial fields in the database');
  }
  {
    const start = reportsServiceSource.indexOf('private async orderCountFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1000);
    assert(block.includes('order.count({'), 'orderCountFromDb must count matching orders in the database');
    assert(block.includes('branchDepartmentScopeWhere(this.orderWhere(query), user)'), 'orderCountFromDb must apply the same scoped order filters');
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
  for (const [helper, byField] of [
    ['orderOverviewByTypeFromDb', "by: ['type']"],
    ['orderOverviewByMonthFromDb', "by: ['createdAt']"],
  ]) {
    const start = reportsServiceSource.indexOf('private async ' + helper + '(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 2200);
    assert(block.includes('order.groupBy({'), `${helper} must group orders in the database`);
    assert(block.includes(byField), `${helper} must group by the expected overview field`);
    assert(block.includes('_sum:'), `${helper} must sum financial fields in the database`);
    assert(block.includes('_count: { _all: true }'), `${helper} must count grouped orders in the database`);
  }
  {
    const start = reportsServiceSource.indexOf('private async orderGroupedRowsFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 7600);
    assert(block.includes('order.groupBy({'), 'orderGroupedRowsFromDb must group orders in the database');
    assert(block.includes('_sum: this.orderMetricSums()'), 'orderGroupedRowsFromDb must sum financial fields in the database');
    assert(block.includes('_count: { _all: true }'), 'orderGroupedRowsFromDb must count grouped orders in the database');
    assert(block.includes("if (groupBy === 'by-employee')"), 'orderGroupedRowsFromDb must support employee grouping');
    assert(block.includes("if (groupBy === 'by-branch')"), 'orderGroupedRowsFromDb must support branch grouping');
    assert(block.includes("if (groupBy === 'by-type')"), 'orderGroupedRowsFromDb must support type grouping');
    for (const group of ['by-created-date', 'by-checkin-date', 'by-checkout-date', 'by-approved-date', 'by-agency', 'by-department', 'by-market']) {
      assert(block.includes(`groupBy === '${group}'`), `orderGroupedRowsFromDb must support ${group}`);
    }
  }
  for (const helper of ['customerDebtSummaryFromDb', 'supplierDebtSummaryFromDb']) {
    const start = reportsServiceSource.indexOf('private async ' + helper + '(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1800);
    assert(block.includes('.groupBy({'), `${helper} must group ledger balances in the database`);
    assert(block.includes('_sum:'), `${helper} must sum ledger fields in the database`);
  }
  for (const [helper, model] of [
    ['customerDebtRowsFromDb', 'customerLedgerEntry'],
    ['supplierDebtRowsFromDb', 'supplierLedgerEntry'],
  ]) {
    const start = reportsServiceSource.indexOf('private async ' + helper + '(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 3600);
    assert(block.includes(model + '.groupBy({'), `${helper} must group ledger rows in the database`);
    assert(block.includes('_sum: { debitAmount: true, creditAmount: true }'), `${helper} must sum ledger debit/credit in the database`);
    assert(block.includes('.slice(0, take)'), `${helper} must keep grouped report rows bounded after sorting`);
  }
  {
    const start = reportsServiceSource.indexOf('private async financeSummaryFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 2200);
    assert(block.includes('financeReceipt.count({'), 'financeSummaryFromDb must count receipts in the database');
    assert(block.includes('financePayment.count({'), 'financeSummaryFromDb must count payments in the database');
    assert(block.includes('financeCashflowEntry.groupBy({'), 'financeSummaryFromDb must group cashflow totals in the database');
    assert(block.includes('_sum: { amount: true }'), 'financeSummaryFromDb must sum cashflow amounts in the database');
  }
  for (const [helper, relationSnippet] of [
    ['financeReceiptWhere', 'orders: { some: { order: { is: orderFilter } } }'],
    ['financePaymentWhere', 'order: { is: orderFilter }'],
    ['financeCashflowWhere', 'order: { is: orderFilter }'],
  ]) {
    const start = reportsServiceSource.indexOf('private ' + helper + '(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 2400);
    assert(block.includes('this.financeOrderRelationFilter(query)'), `${helper} must derive document scope from order filters`);
    assert(block.includes(relationSnippet), `${helper} must apply order filters through the finance document order relation`);
    assert(!block.includes('orderIds.length ?'), `${helper} must not scope finance documents through capped orderIds`);
  }
  {
    const start = reportsServiceSource.indexOf('private async financeCashflowByMonthFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 2200);
    assert(block.includes('financeCashflowEntry.groupBy({'), 'financeCashflowByMonthFromDb must group cashflow rows in the database');
    assert(block.includes("by: ['paymentDate', 'entryType']"), 'financeCashflowByMonthFromDb must group by payment date and entry type');
    assert(block.includes('_sum: { amount: true }'), 'financeCashflowByMonthFromDb must sum cashflow amounts in the database');
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
    order: {
      findMany: async () => { orderCalls += 1; return []; },
      aggregate: async () => ({ _sum: {} }),
      count: async () => 0,
      groupBy: async () => [],
    },
    tour: { findMany: async () => { tourCalls += 1; return []; } },
    customerLedgerEntry: {
      findMany: async () => { debtCalls += 1; return []; },
      groupBy: async () => { debtCalls += 1; return []; },
    },
    customer: { findMany: async () => [] },
    supplierLedgerEntry: {
      findMany: async () => { supplierDebtCalls += 1; return []; },
      groupBy: async () => { supplierDebtCalls += 1; return []; },
    },
    supplier: { findMany: async () => [] },
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
  await assertBadRequest(() => service.revenue('by-created-date', { dateFrom: '2026-02-31', dateTo: '2026-02-31' }), 'service must reject impossible calendar report dates before querying Prisma');
  await service.finance({ type: 'HOTEL_BOOKING', dateField: 'documentDate', costStatus: 'PENDING' });
  await service.exportCsv('finance', { type: 'HOTEL_BOOKING', dateField: 'documentDate' });
  await assertBadRequest(() => service.customerDebt({ dateField: 'paymentDate' }), 'debt report must reject misleading Order dateField');
  await assertBadRequest(() => service.exportCsv('customer-debt', { dateField: 'paymentDate' }), 'dynamic debt export must reject misleading Order dateField');
  await assertBadRequest(() => service.supplierHistory('supplier-1', { type: 'FIT' }), 'supplier history must reject ignored report filters');
  await assertBadRequest(() => service.supplierHistory('supplier-1', { dateField: 'closedAt' }), 'supplier history must reject ignored dateField');

  let scopedSupplierHistoryWhere;
  const scopedSupplierHistoryUser = {
    id: 'reports-supplier-history-branch-user',
    username: 'reports-supplier-history-branch-user',
    branch: 'OV-BR',
    roles: [{ role: { permissions: [{ permission: 'data.scope.branch' }] } }],
  };
  const scopedSupplierHistoryService = new ReportsService({
    operationVoucher: {
      findMany: async (args) => { scopedSupplierHistoryWhere = args.where; return []; },
    },
  });
  await scopedSupplierHistoryService.supplierHistory('supplier-1', { dateFrom: '2026-01-01', dateTo: '2026-01-31' }, scopedSupplierHistoryUser);
  const scopedSupplierHistoryWhereJson = JSON.stringify(scopedSupplierHistoryWhere);
  assert(scopedSupplierHistoryWhereJson.includes('"supplierId":"supplier-1"'), 'supplier history must keep the requested supplier filter');
  assert(scopedSupplierHistoryWhereJson.includes('"serviceDate"'), 'supplier history must keep the serviceDate filter');
  assert(scopedSupplierHistoryWhereJson.includes('"order":{"branch":"OV-BR"}'), 'supplier history must scope operation vouchers through linked order branch');
  assert(scopedSupplierHistoryWhereJson.includes('"tour":{"branch":"OV-BR"}'), 'supplier history must scope operation vouchers through linked tour branch');
  assert(scopedSupplierHistoryWhereJson.includes('"booking":{"customer":{"branch":"OV-BR"}}'), 'supplier history must scope operation vouchers through linked booking customer branch');

  assert.equal(orderCalls, 2, 'valid hybrid finance report and export must query orders exactly twice');
  assert.equal(tourCalls, 0, 'invalid Tour filters must be rejected before querying Prisma');
  assert(debtCalls >= 4, 'valid hybrid finance report and export must query customer debt grouped rows and summaries');
  assert(supplierDebtCalls >= 4, 'valid hybrid finance report and export must query supplier debt grouped rows and summaries');
  assert.equal(historyCalls, 0, 'invalid supplier history filters must be rejected before querying Prisma');
  assert.equal(financeDocumentCalls, 6, 'valid hybrid finance report and export must query receipt, payment, and cashflow rows twice');

  const capturedFinanceWhere = {};
  const captureService = new ReportsService({
    order: {
      findMany: async () => [],
      aggregate: async () => ({ _sum: {} }),
      count: async () => 0,
      groupBy: async () => [],
    },
    customerLedgerEntry: {
      findMany: async () => [],
      groupBy: async () => [],
    },
    customer: { findMany: async () => [] },
    supplierLedgerEntry: {
      findMany: async () => [],
      groupBy: async () => [],
    },
    supplier: { findMany: async () => [] },
    financeReceipt: {
      findMany: async (args) => { capturedFinanceWhere.receiptRows = args.where; return []; },
      count: async (args) => { capturedFinanceWhere.receiptCount = args.where; return 0; },
    },
    financePayment: {
      findMany: async (args) => { capturedFinanceWhere.paymentRows = args.where; return []; },
      count: async (args) => { capturedFinanceWhere.paymentCount = args.where; return 0; },
    },
    financeCashflowEntry: {
      findMany: async (args) => { capturedFinanceWhere.cashflowRows = args.where; return []; },
      groupBy: async (args) => { capturedFinanceWhere.cashflowGroup = args.where; return []; },
    },
  });
  await captureService.finance({ type: 'HOTEL_BOOKING', status: 'SETTLED', paymentStatus: 'UNPAID', costStatus: 'PENDING' });
  const receiptWhereJson = JSON.stringify(capturedFinanceWhere.receiptCount);
  const paymentWhereJson = JSON.stringify(capturedFinanceWhere.paymentCount);
  const cashflowWhereJson = JSON.stringify(capturedFinanceWhere.cashflowGroup);
  assert(receiptWhereJson.includes('"orders":{"some":{"order":{"is":'), 'finance receipt summary must require matching linked order when order filters are present');
  assert(paymentWhereJson.includes('"order":{"is":'), 'finance payment summary must require matching linked order when order filters are present');
  assert(cashflowWhereJson.includes('"order":{"is":'), 'finance cashflow summary must require matching linked order when order filters are present');
  for (const whereJson of [receiptWhereJson, paymentWhereJson, cashflowWhereJson]) {
    assert(whereJson.includes('"type":"HOTEL_BOOKING"'), 'finance document filters must preserve order type');
    assert(whereJson.includes('"status":"SETTLED"'), 'finance document filters must preserve order status');
    assert(whereJson.includes('"paymentStatus":"UNPAID"'), 'finance document filters must preserve order payment status');
    assert(whereJson.includes('"costStatus":"PENDING"'), 'finance document filters must preserve order cost status');
  }

  console.log('TEST_REPORT_QUERY_VALIDATION_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
