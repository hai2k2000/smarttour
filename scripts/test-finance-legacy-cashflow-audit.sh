#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_finance_legacy_cashflow_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
test -n "$POSTGRES_PASSWORD"

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

cleanup() {
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose run --rm \
  -v "$PWD:/workspace" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && NODE_PATH=/app/node_modules node" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const scriptPath = '/workspace/scripts/finance-legacy-cashflow-audit.js';
assert(fs.existsSync(scriptPath), 'finance legacy cashflow audit script must exist');
const tool = require(scriptPath);
assert.equal(typeof tool.auditFinanceLegacyCashflow, 'function');
assert.equal(typeof tool.backfillFinanceLegacyCashflow, 'function');

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: '/workspace', encoding: 'utf8', env: { ...process.env, NODE_PATH: '/app/node_modules' } });
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const run = `FIN-CF-${Date.now()}`;
  const customer = await prisma.customer.create({ data: { code: `${run}-CUS`, fullName: 'Cashflow Customer', phone: '0922222222' } });
  const category = await prisma.supplierCategory.create({ data: { name: `${run}-CAT` } });
  const supplier = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: `${run}-SUP`, name: 'Cashflow Supplier', status: 'ACTIVE' } });

  const receiptBoth = await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT-BOTH`, receiptName: 'Receipt both', paymentMethod: 'CASH', customerId: customer.id, totalAmount: 100, receiptAmount: 100, remainingAmount: 0, approvalStatus: 'APPROVED' } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'FINANCE_RECEIPT', sourceId: receiptBoth.id, entryType: 'RECEIPT', amount: 100, paymentMethod: 'CASH', receiptId: receiptBoth.id, customerId: customer.id } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'RECEIPT', sourceId: receiptBoth.id, entryType: 'RECEIPT', amount: 100, paymentMethod: 'CASH', receiptId: receiptBoth.id, customerId: customer.id } });
  const receiptLegacyOnly = await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT-LEGACY`, receiptName: 'Receipt legacy only', paymentMethod: 'CASH', customerId: customer.id, totalAmount: 50, receiptAmount: 50, remainingAmount: 0, approvalStatus: 'APPROVED' } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'FINANCE_RECEIPT', sourceId: receiptLegacyOnly.id, entryType: 'RECEIPT', amount: 50, paymentMethod: 'CASH', receiptId: receiptLegacyOnly.id, customerId: customer.id } });

  const paymentBoth = await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY-BOTH`, voucherName: 'Payment both', paymentMethod: 'BANK_TRANSFER', supplierId: supplier.id, totalAmount: 80, paymentAmount: 80, remainingAmount: 0, approvalStatus: 'APPROVED' } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'FINANCE_PAYMENT', sourceId: paymentBoth.id, entryType: 'PAYMENT', amount: 80, paymentMethod: 'BANK_TRANSFER', paymentId: paymentBoth.id, supplierId: supplier.id } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'PAYMENT', sourceId: paymentBoth.id, entryType: 'PAYMENT', amount: 80, paymentMethod: 'BANK_TRANSFER', paymentId: paymentBoth.id, supplierId: supplier.id } });
  const paymentLegacyOnly = await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY-LEGACY`, voucherName: 'Payment legacy only', paymentMethod: 'BANK_TRANSFER', supplierId: supplier.id, totalAmount: 40, paymentAmount: 40, remainingAmount: 0, approvalStatus: 'APPROVED' } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'FINANCE_PAYMENT', sourceId: paymentLegacyOnly.id, entryType: 'PAYMENT', amount: 40, paymentMethod: 'BANK_TRANSFER', paymentId: paymentLegacyOnly.id, supplierId: supplier.id } });

  const auditBefore = await tool.auditFinanceLegacyCashflow(prisma);
  assert.equal(auditBefore.duplicateLegacyReceiptCashflow.length, 1, 'should find receipt legacy duplicate only when official exists');
  assert.equal(auditBefore.duplicateLegacyPaymentCashflow.length, 1, 'should find payment legacy duplicate only when official exists');
  assert.equal(auditBefore.legacyOnlyReceiptCashflow.length, 1, 'should report but not delete receipt legacy-only rows');
  assert.equal(auditBefore.legacyOnlyPaymentCashflow.length, 1, 'should report but not delete payment legacy-only rows');

  const guardBefore = cli(['--mode=guard']);
  assert.notEqual(guardBefore.status, 0, 'guard should fail when duplicate legacy cashflow exists');
  assert.match(`${guardBefore.stdout}\n${guardBefore.stderr}`, /FINANCE_LEGACY_CASHFLOW_GUARD_FAILED/);

  const dryRun = await tool.backfillFinanceLegacyCashflow(prisma, { dryRun: true });
  assert.deepEqual(dryRun.deleted, { receiptCashflow: 1, paymentCashflow: 1 }, 'dry-run should count duplicate legacy cashflow');
  assert.equal(await prisma.financeCashflowEntry.count(), 6, 'dry-run must not delete rows');

  const applied = await tool.backfillFinanceLegacyCashflow(prisma, { dryRun: false });
  assert.deepEqual(applied.deleted, { receiptCashflow: 1, paymentCashflow: 1 }, 'apply should delete duplicate legacy cashflow only');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receiptBoth.id } }), 0, 'duplicate receipt legacy row should be removed');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'RECEIPT', sourceId: receiptBoth.id } }), 1, 'official receipt row should remain');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receiptLegacyOnly.id } }), 1, 'legacy-only receipt row should remain');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: paymentBoth.id } }), 0, 'duplicate payment legacy row should be removed');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'PAYMENT', sourceId: paymentBoth.id } }), 1, 'official payment row should remain');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: paymentLegacyOnly.id } }), 1, 'legacy-only payment row should remain');

  const second = await tool.backfillFinanceLegacyCashflow(prisma, { dryRun: false });
  assert.deepEqual(second.deleted, { receiptCashflow: 0, paymentCashflow: 0 }, 'apply should be idempotent');
  const guardAfter = cli(['--mode=guard']);
  assert.equal(guardAfter.status, 0, guardAfter.stderr || guardAfter.stdout);

  await prisma.$disconnect();
  console.log('TEST_FINANCE_LEGACY_CASHFLOW_AUDIT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
