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
  for (const method of ['businessSummary', 'employeePerformance']) {
    const start = reportsServiceSource.indexOf('async ' + method + '(');
    const next = reportsServiceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : reportsServiceSource.slice(start, next === -1 ? reportsServiceSource.length : next);
    assert(block.includes('orderSummaryFromDb(query, user)'), `${method} summary must use database aggregate helper`);
    assert(!block.includes('summary(orders)'), `${method} summary must not depend on bounded order rows`);
  }
  {
    const start = reportsServiceSource.indexOf('private async orderSummaryFromDb(');
    const block = start === -1 ? '' : reportsServiceSource.slice(start, start + 1400);
    assert(block.includes('aggregate({'), 'orderSummaryFromDb must aggregate order totals in the database');
    assert(block.includes('_sum:'), 'orderSummaryFromDb must sum financial fields in the database');
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
    customerLedgerEntry: { findMany: async () => { debtCalls += 1; return []; } },
    supplierLedgerEntry: { findMany: async () => { supplierDebtCalls += 1; return []; } },
    financeReceipt: { findMany: async () => { financeDocumentCalls += 1; return []; } },
    financePayment: { findMany: async () => { financeDocumentCalls += 1; return []; } },
    financeCashflowEntry: { findMany: async () => { financeDocumentCalls += 1; return []; } },
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
