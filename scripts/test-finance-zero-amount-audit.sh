#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_finance_zero_amount_test}"
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

const scriptPath = '/workspace/scripts/finance-zero-amount-audit.js';
assert(fs.existsSync(scriptPath), 'finance zero amount audit script must exist');
const tool = require(scriptPath);
assert.equal(typeof tool.auditFinanceZeroAmounts, 'function');
assert.equal(typeof tool.backfillFinanceZeroAmounts, 'function');

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: '/workspace', encoding: 'utf8', env: { ...process.env, NODE_PATH: '/app/node_modules' } });
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const run = `FIN-ZERO-${Date.now()}`;
  const customer = await prisma.customer.create({ data: { code: `${run}-CUS`, fullName: 'Zero Customer', phone: '0944444444' } });
  const category = await prisma.supplierCategory.create({ data: { name: `${run}-CAT` } });
  const supplier = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: `${run}-SUP`, name: 'Zero Supplier', status: 'ACTIVE' } });
  const order = await prisma.order.create({ data: { type: 'SINGLE_SERVICE', systemCode: `${run}-ORD`, name: 'Zero Order', customerId: customer.id, totalRevenue: 100, paidAmount: 100, remainingRevenue: 0, totalCost: 200, paidCost: 200, remainingCost: 0 } });

  const zeroPayment = await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY-ZERO`, voucherName: 'Zero payment import artifact', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'BANK_TRANSFER', supplierId: supplier.id, orderId: order.id, totalAmount: 0, paymentAmount: 0, remainingAmount: 0, approvalStatus: 'APPROVED', approvedBy: 'import', approvedAt: new Date('2026-12-10'), createdBy: 'import' } });
  const protectedZeroPayment = await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY-PROTECTED`, voucherName: 'Zero payment with side effect', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'BANK_TRANSFER', supplierId: supplier.id, orderId: order.id, totalAmount: 0, paymentAmount: 0, remainingAmount: 0, approvalStatus: 'APPROVED', approvedBy: 'import', approvedAt: new Date('2026-12-10'), createdBy: 'import' } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'PAYMENT', sourceId: protectedZeroPayment.id, entryType: 'PAYMENT', amount: 0, paymentMethod: 'BANK_TRANSFER', paymentId: protectedZeroPayment.id, supplierId: supplier.id } });
  const zeroReceipt = await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT-ZERO`, receiptName: 'Zero receipt import artifact', receiptType: 'TOUR_PAYMENT', paymentMethod: 'CASH', customerId: customer.id, totalAmount: 0, receiptAmount: 0, remainingAmount: 0, approvalStatus: 'APPROVED', approvedBy: 'import', approvedAt: new Date('2026-12-10'), createdBy: 'import' } });

  const auditBefore = await tool.auditFinanceZeroAmounts(prisma);
  assert.equal(auditBefore.actionablePayments.length, 1, 'only zero payment without side effects should be actionable');
  assert.equal(auditBefore.actionablePayments[0].id, zeroPayment.id);
  assert.equal(auditBefore.blockedPayments.length, 1, 'zero payment with side effects should be blocked');
  assert.equal(auditBefore.actionableReceipts.length, 1, 'zero receipt without side effects should be actionable');
  assert.equal(auditBefore.actionableReceipts[0].id, zeroReceipt.id);

  const guardBefore = cli(['--mode=guard']);
  assert.notEqual(guardBefore.status, 0, 'guard should fail when actionable or blocked zero docs exist');
  assert.match(`${guardBefore.stdout}\n${guardBefore.stderr}`, /FINANCE_ZERO_AMOUNT_GUARD_FAILED/);

  const dryRun = await tool.backfillFinanceZeroAmounts(prisma, { dryRun: true });
  assert.deepEqual(dryRun.deleted, { receipts: 1, payments: 1 }, 'dry-run should count actionable zero docs');
  assert.equal((await prisma.financePayment.findUniqueOrThrow({ where: { id: zeroPayment.id } })).deletedAt, null, 'dry-run must not soft-delete payment');

  const applied = await tool.backfillFinanceZeroAmounts(prisma, { dryRun: false });
  assert.deepEqual(applied.deleted, { receipts: 1, payments: 1 }, 'apply should soft-delete actionable zero docs');
  assert.notEqual((await prisma.financePayment.findUniqueOrThrow({ where: { id: zeroPayment.id } })).deletedAt, null, 'zero payment should be soft-deleted');
  assert.equal((await prisma.financePayment.findUniqueOrThrow({ where: { id: protectedZeroPayment.id } })).deletedAt, null, 'protected zero payment should remain active');
  assert.notEqual((await prisma.financeReceipt.findUniqueOrThrow({ where: { id: zeroReceipt.id } })).deletedAt, null, 'zero receipt should be soft-deleted');
  const second = await tool.backfillFinanceZeroAmounts(prisma, { dryRun: false });
  assert.deepEqual(second.deleted, { receipts: 0, payments: 0 }, 'apply should be idempotent');
  const auditAfter = await tool.auditFinanceZeroAmounts(prisma);
  assert.equal(auditAfter.actionablePayments.length, 0, 'actionable zero payment should be gone');
  assert.equal(auditAfter.actionableReceipts.length, 0, 'actionable zero receipt should be gone');
  assert.equal(auditAfter.blockedPayments.length, 1, 'blocked zero payment should still be reported');

  await prisma.$disconnect();
  console.log('TEST_FINANCE_ZERO_AMOUNT_AUDIT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
