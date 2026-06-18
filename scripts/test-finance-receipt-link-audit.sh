#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_finance_receipt_link_test}"
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

const scriptPath = '/workspace/scripts/finance-receipt-link-audit.js';
assert(fs.existsSync(scriptPath), 'finance receipt link audit script must exist');
const tool = require(scriptPath);
assert.equal(typeof tool.auditFinanceReceiptLinks, 'function');
assert.equal(typeof tool.backfillFinanceReceiptLinks, 'function');
assert.equal(tool.canonicalCode(' BK_61 '), 'BK_61');

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: '/workspace', encoding: 'utf8', env: { ...process.env, NODE_PATH: '/app/node_modules' } });
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const run = `FIN-RL-${Date.now()}`;
  const customer = await prisma.customer.create({ data: { code: `${run}-CUS`, fullName: 'Receipt Link Customer', phone: '0933333333', branch: 'RL-BR', department: 'RL-DEP' } });
  const wrongOrder = await prisma.order.create({ data: { type: 'LANDTOUR', systemCode: `${run}_LAND`, name: 'Wrong landtour shell', customerId: customer.id, totalRevenue: 0, paidAmount: 0, remainingRevenue: 0, totalCost: 0, paidCost: 0, remainingCost: 0, branch: 'RL-BR', department: 'RL-DEP' } });
  const targetOrder = await prisma.order.create({ data: { type: 'SINGLE_SERVICE', systemCode: `${run}_BK_61`, name: 'Target booking', customerId: customer.id, totalRevenue: 1000, paidAmount: 1000, remainingRevenue: 0, totalCost: 0, paidCost: 0, remainingCost: 0, branch: 'RL-BR', department: 'RL-DEP' } });
  const wrongTour = await prisma.tour.create({ data: { type: 'FIT', systemCode: `${run}-WRONG-TOUR`, tourCode: targetOrder.systemCode, name: 'Wrong tour shell', orderId: wrongOrder.id, branch: 'RL-BR', department: 'RL-DEP' } });
  const targetTour = await prisma.tour.create({ data: { type: 'FIT', systemCode: `${run}-TARGET-TOUR`, tourCode: targetOrder.systemCode, name: 'Target booking', orderId: targetOrder.id, branch: 'RL-BR', department: 'RL-DEP' } });
  const receipt = await prisma.financeReceipt.create({ data: { receiptCode: `${targetOrder.systemCode}_3080_NO.1`, receiptName: 'Mislinked receipt', receiptType: 'TOUR_PAYMENT', paymentMethod: 'CASH', paymentDate: new Date('2026-12-05'), customerId: customer.id, tourId: wrongTour.id, totalAmount: 1000, receiptAmount: 1000, remainingAmount: 0, branch: 'RL-BR', department: 'RL-DEP', approvalStatus: 'APPROVED', approvedBy: 'import', approvedAt: new Date('2026-12-05') } });
  await prisma.financeReceiptOrder.create({ data: { receiptId: receipt.id, orderId: wrongOrder.id, orderCode: wrongOrder.systemCode, tourCode: targetOrder.systemCode, tourName: 'Target booking', amount: 1000 } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'RECEIPT', sourceId: receipt.id, entryType: 'RECEIPT', amount: 1000, paymentMethod: 'CASH', paymentDate: new Date('2026-12-05'), customerId: customer.id, tourId: wrongTour.id, receiptId: receipt.id } });
  await prisma.customerLedgerEntry.create({ data: { customerId: customer.id, receiptId: receipt.id, orderId: wrongOrder.id, tourId: wrongTour.id, sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT', creditAmount: 1000, documentCode: receipt.receiptCode, documentDate: new Date('2026-12-05') } });

  const auditBefore = await tool.auditFinanceReceiptLinks(prisma);
  assert.equal(auditBefore.mislinkedReceipts.length, 1, 'audit should find one mislinked receipt');
  assert.equal(auditBefore.mislinkedReceipts[0].receipt.id, receipt.id);
  assert.equal(auditBefore.mislinkedReceipts[0].currentOrder.id, wrongOrder.id);
  assert.equal(auditBefore.mislinkedReceipts[0].targetOrder.id, targetOrder.id);

  const guardBefore = cli(['--mode=guard']);
  assert.notEqual(guardBefore.status, 0, 'guard should fail when mislinked receipts exist');
  assert.match(`${guardBefore.stdout}\n${guardBefore.stderr}`, /FINANCE_RECEIPT_LINK_GUARD_FAILED/);

  const dryRun = await tool.backfillFinanceReceiptLinks(prisma, { dryRun: true });
  assert.deepEqual(dryRun.updated, { receipts: 1, receiptOrders: 1, cashflow: 1, customerLedger: 1 }, 'dry-run should count receipt link repair');
  assert.equal((await prisma.financeReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).tourId, wrongTour.id, 'dry-run must not update receipt');

  const applied = await tool.backfillFinanceReceiptLinks(prisma, { dryRun: false });
  assert.deepEqual(applied.updated, { receipts: 1, receiptOrders: 1, cashflow: 1, customerLedger: 1 }, 'apply should repair all linked rows');
  const fixedReceipt = await prisma.financeReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: { orders: true, cashflowEntries: true, customerLedger: true } });
  assert.equal(fixedReceipt.tourId, targetTour.id, 'receipt should point to target tour');
  assert.equal(fixedReceipt.orders[0].orderId, targetOrder.id, 'receipt order should point to target order');
  assert.equal(fixedReceipt.orders[0].orderCode, targetOrder.systemCode, 'receipt orderCode should be target systemCode');
  assert.equal(fixedReceipt.orders[0].tourCode, targetTour.tourCode, 'receipt tourCode should be target tourCode');
  assert.equal(fixedReceipt.cashflowEntries[0].tourId, targetTour.id, 'receipt cashflow should point to target tour');
  assert.equal(fixedReceipt.customerLedger[0].orderId, targetOrder.id, 'customer ledger should point to target order');
  assert.equal(fixedReceipt.customerLedger[0].tourId, targetTour.id, 'customer ledger should point to target tour');
  const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: targetOrder.id } });
  assert.equal(Number(orderAfter.paidAmount), 1000, 'repair should not rewrite order paidAmount');

  const second = await tool.backfillFinanceReceiptLinks(prisma, { dryRun: false });
  assert.deepEqual(second.updated, { receipts: 0, receiptOrders: 0, cashflow: 0, customerLedger: 0 }, 'apply should be idempotent');
  const guardAfter = cli(['--mode=guard']);
  assert.equal(guardAfter.status, 0, guardAfter.stderr || guardAfter.stdout);

  await prisma.$disconnect();
  console.log('TEST_FINANCE_RECEIPT_LINK_AUDIT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
