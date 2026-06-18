#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_finance_order_snapshot_test}"
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

const scriptPath = '/workspace/scripts/finance-order-snapshot-audit.js';
assert(fs.existsSync(scriptPath), 'finance order snapshot audit script must exist');
const tool = require(scriptPath);
assert.equal(typeof tool.auditFinanceOrderSnapshots, 'function');

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { cwd: '/workspace', encoding: 'utf8', env: { ...process.env, NODE_PATH: '/app/node_modules' } });
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const run = `FIN-SNAPSHOT-${Date.now()}`;
  const customer = await prisma.customer.create({ data: { code: `${run}-CUS`, fullName: 'Snapshot Customer', phone: '0955555555' } });

  const importReceiptOnly = await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: `${run}-IMPORT-R`, name: 'Import receipt snapshot', customerId: customer.id, totalRevenue: 1000, paidAmount: 700, remainingRevenue: 300, totalCost: 0, paidCost: 0, remainingCost: 0, note: 'Nguon: TourKit order export 16/06/2026\nThuc thu TourKit: 700 VND\nImport marker: TOURKIT_ORDER_IMPORT_2026_06_16' } });
  const importPaymentOnly = await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: `${run}-IMPORT-P`, name: 'Import payment snapshot', customerId: customer.id, totalRevenue: 0, paidAmount: 0, remainingRevenue: 0, totalCost: 900, paidCost: 500, remainingCost: 400, note: 'Nguon: TourKit booking export 16/06/2026\nThuc chi TourKit: 500 VND\nImport marker: TOURKIT_BOOKING_IMPORT_2026_06_16' } });
  const actionableReceipt = await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: `${run}-ACTION-R`, name: 'Action receipt mismatch', customerId: customer.id, totalRevenue: 1000, paidAmount: 800, remainingRevenue: 200, totalCost: 0, paidCost: 0, remainingCost: 0 } });
  const actionablePayment = await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: `${run}-ACTION-P`, name: 'Action payment mismatch', customerId: customer.id, totalRevenue: 0, paidAmount: 0, remainingRevenue: 0, totalCost: 1000, paidCost: 800, remainingCost: 200 } });
  const balanced = await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: `${run}-BAL`, name: 'Balanced order', customerId: customer.id, totalRevenue: 1000, paidAmount: 300, remainingRevenue: 700, totalCost: 1000, paidCost: 400, remainingCost: 600 } });

  const receipt = await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT`, receiptName: 'Partial receipt', receiptType: 'TOUR_PAYMENT', customerId: customer.id, totalAmount: 300, receiptAmount: 300, remainingAmount: 0, approvalStatus: 'APPROVED', approvedBy: 'tester', approvedAt: new Date('2026-12-11') } });
  await prisma.financeReceiptOrder.create({ data: { receiptId: receipt.id, orderId: actionableReceipt.id, orderCode: actionableReceipt.systemCode, amount: 300 } });
  const balancedReceipt = await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT-BAL`, receiptName: 'Balanced receipt', receiptType: 'TOUR_PAYMENT', customerId: customer.id, totalAmount: 300, receiptAmount: 300, remainingAmount: 0, approvalStatus: 'APPROVED', approvedBy: 'tester', approvedAt: new Date('2026-12-11') } });
  await prisma.financeReceiptOrder.create({ data: { receiptId: balancedReceipt.id, orderId: balanced.id, orderCode: balanced.systemCode, amount: 300 } });
  await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY`, voucherName: 'Partial payment', voucherType: 'SUPPLIER_PAYMENT', orderId: actionablePayment.id, totalAmount: 400, paymentAmount: 400, remainingAmount: 0, approvalStatus: 'APPROVED', approvedBy: 'tester', approvedAt: new Date('2026-12-11') } });
  await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY-BAL`, voucherName: 'Balanced payment', voucherType: 'SUPPLIER_PAYMENT', orderId: balanced.id, totalAmount: 400, paymentAmount: 400, remainingAmount: 0, approvalStatus: 'APPROVED', approvedBy: 'tester', approvedAt: new Date('2026-12-11') } });

  const report = await tool.auditFinanceOrderSnapshots(prisma, { systemCodePrefix: run });
  assert.equal(report.counts.receiptMismatches, 1, 'active receipt mismatch should be actionable');
  assert.equal(report.counts.paymentMismatches, 1, 'active payment mismatch should be actionable');
  assert.equal(report.counts.receiptImportSnapshots, 1, 'receipt drift without docs but with TourKit marker should be classified as import snapshot');
  assert.equal(report.counts.paymentImportSnapshots, 1, 'payment drift without docs but with TourKit marker should be classified as import snapshot');
  assert.equal(report.receiptImportSnapshots[0].systemCode, importReceiptOnly.systemCode);
  assert.equal(report.paymentImportSnapshots[0].systemCode, importPaymentOnly.systemCode);
  assert.equal(report.receiptMismatches[0].systemCode, actionableReceipt.systemCode);
  assert.equal(report.paymentMismatches[0].systemCode, actionablePayment.systemCode);
  assert(!report.receiptMismatches.some((row) => row.systemCode === balanced.systemCode), 'balanced receipt order must not be reported');
  assert(!report.paymentMismatches.some((row) => row.systemCode === balanced.systemCode), 'balanced payment order must not be reported');

  const guard = cli(['--mode=guard', `--system-code-prefix=${run}`]);
  assert.notEqual(guard.status, 0, 'guard should fail only when actionable mismatches exist');
  assert.match(`${guard.stdout}\n${guard.stderr}`, /FINANCE_ORDER_SNAPSHOT_GUARD_FAILED actionable=2/);

  await prisma.$disconnect();
  console.log('TEST_FINANCE_ORDER_SNAPSHOT_AUDIT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
