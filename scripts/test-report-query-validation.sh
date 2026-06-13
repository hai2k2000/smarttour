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
  assert(reportsClient.includes('tourFilterKeys'), 'reports browser must filter Tour finance query keys');
  assert(reportsClient.includes('customerDebtFilterKeys'), 'reports browser must filter customer debt query keys');
  assert(reportsClient.includes("query.dateField = 'documentDate'"), 'reports browser must use documentDate for debt queries');

  assert(dto.OrderReportQueryDto, 'OrderReportQueryDto must exist');
  assert(dto.TourReportQueryDto, 'TourReportQueryDto must exist');
  assert(dto.DebtReportQueryDto, 'DebtReportQueryDto must exist');

  assertInvalid(dto.OrderReportQueryDto, { type: 'FIT' }, 'order report must reject Tour-only type');
  assertInvalid(dto.OrderReportQueryDto, { dateField: 'closedAt' }, 'order report must reject Tour-only dateField');
  assertInvalid(dto.OrderReportQueryDto, { status: 'ARCHIVED' }, 'order report must reject invalid status');
  assertValid(dto.OrderReportQueryDto, { type: 'HOTEL_BOOKING', dateField: 'settledAt', status: 'SETTLED' }, 'order report must accept Order filters');

  assertInvalid(dto.TourReportQueryDto, { type: 'HOTEL_BOOKING' }, 'Tour report must reject Order-only type');
  assertInvalid(dto.TourReportQueryDto, { dateField: 'settledAt' }, 'Tour report must reject Order-only dateField');
  assertInvalid(dto.TourReportQueryDto, { status: 'ARCHIVED' }, 'Tour report must reject invalid status');
  assertInvalid(dto.TourReportQueryDto, { costStatus: 'PENDING' }, 'Tour report must reject ignored Order-only costStatus');
  assertValid(dto.TourReportQueryDto, { type: 'FIT', dateField: 'closedAt', status: 'SETTLED' }, 'Tour report must accept Tour filters');

  assertInvalid(dto.DebtReportQueryDto, { dateField: 'paymentDate' }, 'debt report must reject misleading Order dateField');
  assertInvalid(dto.DebtReportQueryDto, { dateField: 'closedAt' }, 'debt report must reject Tour-only dateField');
  assertValid(dto.DebtReportQueryDto, { type: 'HOTEL_BOOKING', dateField: 'documentDate' }, 'debt report must accept documentDate');

  let orderCalls = 0;
  let tourCalls = 0;
  let debtCalls = 0;
  let historyCalls = 0;
  const service = new ReportsService({
    order: { findMany: async () => { orderCalls += 1; return []; } },
    tour: { findMany: async () => { tourCalls += 1; return []; } },
    customerLedgerEntry: { findMany: async () => { debtCalls += 1; return []; } },
    operationVoucher: { findMany: async () => { historyCalls += 1; return []; } },
  });

  await assertBadRequest(() => service.revenue('by-created-date', { type: 'FIT' }), 'service must reject Tour-only type on Order report');
  await assertBadRequest(() => service.revenue('by-created-date', { dateField: 'closedAt' }), 'service must reject Tour-only dateField on Order report');
  await assertBadRequest(() => service.finance({ type: 'HOTEL_BOOKING' }), 'service must reject Order-only type on Tour report');
  await assertBadRequest(() => service.finance({ dateField: 'settledAt' }), 'service must reject Order-only dateField on Tour report');
  await assertBadRequest(() => service.finance({ costStatus: 'PENDING' }), 'service must reject ignored Order-only costStatus on Tour report');
  await assertBadRequest(() => service.exportCsv('finance', { type: 'HOTEL_BOOKING' }), 'dynamic finance export must reject Order-only type');
  await assertBadRequest(() => service.customerDebt({ dateField: 'paymentDate' }), 'debt report must reject misleading Order dateField');
  await assertBadRequest(() => service.exportCsv('customer-debt', { dateField: 'paymentDate' }), 'dynamic debt export must reject misleading Order dateField');
  await assertBadRequest(() => service.supplierHistory('supplier-1', { type: 'FIT' }), 'supplier history must reject ignored report filters');
  await assertBadRequest(() => service.supplierHistory('supplier-1', { dateField: 'closedAt' }), 'supplier history must reject ignored dateField');
  assert.equal(orderCalls, 0, 'invalid Order filters must be rejected before querying Prisma');
  assert.equal(tourCalls, 0, 'invalid Tour filters must be rejected before querying Prisma');
  assert.equal(debtCalls, 0, 'invalid debt filters must be rejected before querying Prisma');
  assert.equal(historyCalls, 0, 'invalid supplier history filters must be rejected before querying Prisma');

  console.log('TEST_REPORT_QUERY_VALIDATION_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
