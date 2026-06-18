#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_finance_side_effect_test}"
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

const scriptPath = '/workspace/scripts/finance-side-effect-audit.js';
assert(fs.existsSync(scriptPath), 'finance side-effect audit script must exist');
const tool = require(scriptPath);
assert.equal(typeof tool.auditFinanceSideEffects, 'function', 'script must export auditFinanceSideEffects');
assert.equal(typeof tool.backfillFinanceSideEffects, 'function', 'script must export backfillFinanceSideEffects');

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: '/workspace',
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: '/app/node_modules' },
  });
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const run = `FIN-SE-${Date.now()}`;
  const customer = await prisma.customer.create({ data: { code: `${run}-CUS`, fullName: 'Side Effect Customer', phone: '0900000000', branch: 'SE-BR', department: 'SE-DEP' } });
  const category = await prisma.supplierCategory.create({ data: { name: `${run}-CAT` } });
  const supplier = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: `${run}-SUP`, name: 'Side Effect Supplier', status: 'ACTIVE' } });
  const order = await prisma.order.create({ data: { type: 'SINGLE_SERVICE', systemCode: `${run}-ORD`, name: 'Side Effect Order', customerId: customer.id, totalRevenue: 1000, remainingRevenue: 1000, totalCost: 700, remainingCost: 700, branch: 'SE-BR', department: 'SE-DEP' } });
  const tour = await prisma.tour.create({ data: { type: 'FIT', systemCode: `${run}-TOUR`, tourCode: `${run}-TOUR`, name: 'Side Effect Tour', orderId: order.id, branch: 'SE-BR', department: 'SE-DEP' } });
  const voucher = await prisma.operationVoucher.create({ data: { voucherCode: `${run}-OV`, supplierId: supplier.id, supplierName: supplier.name, serviceType: 'HOTEL', serviceName: 'Hotel', serviceDate: new Date('2026-12-01'), totalAmount: 500, paidAmount: 0, remainAmount: 500, status: 'PENDING', orderId: order.id, tourId: tour.id } });

  const receipt = await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT`, receiptName: 'Approved imported receipt', receiptType: 'TOUR_PAYMENT', paymentMethod: 'CASH', paymentDate: new Date('2026-12-02'), customerId: customer.id, tourId: tour.id, totalAmount: 300, receiptAmount: 300, remainingAmount: 0, branch: 'SE-BR', department: 'SE-DEP', assignedStaff: 'tester', approvalStatus: 'APPROVED', approvedBy: 'import', approvedAt: new Date('2026-12-02') } });
  await prisma.financeReceiptOrder.create({ data: { receiptId: receipt.id, orderId: order.id, orderCode: order.systemCode, tourCode: tour.tourCode, tourName: tour.name, amount: 300 } });
  const payment = await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY`, voucherName: 'Approved imported payment', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentDate: new Date('2026-12-03'), supplierId: supplier.id, operationVoucherId: voucher.id, orderId: order.id, tourId: tour.id, totalAmount: 200, paymentAmount: 200, remainingAmount: 0, branch: 'SE-BR', department: 'SE-DEP', assignedStaff: 'tester', approvalStatus: 'APPROVED', approvedBy: 'import', approvedAt: new Date('2026-12-03') } });
  const companyPayment = await prisma.financePayment.create({ data: { voucherCode: `${run}-OTHER`, voucherName: 'Company expense', voucherType: 'OTHER', paymentMethod: 'CASH', paymentDate: new Date('2026-12-04'), totalAmount: 50, paymentAmount: 50, remainingAmount: 0, branch: 'SE-BR', department: 'SE-DEP', approvalStatus: 'APPROVED', approvedBy: 'import', approvedAt: new Date('2026-12-04') } });

  const auditBefore = await tool.auditFinanceSideEffects(prisma);
  assert.equal(auditBefore.missingPaymentCashflow.length, 2, 'audit should find supplier and company payments missing cashflow');
  assert.equal(auditBefore.missingReceiptCashflow.length, 1, 'audit should find receipt missing cashflow');
  assert.equal(auditBefore.missingSupplierLedger.length, 1, 'audit should find supplier payment missing ledger');
  assert.equal(auditBefore.missingCustomerLedger.length, 1, 'audit should find customer receipt missing ledger');

  const guardBefore = cli(['--mode=guard']);
  assert.notEqual(guardBefore.status, 0, 'guard should fail when side effects are missing');
  assert.match(`${guardBefore.stdout}\n${guardBefore.stderr}`, /FINANCE_SIDE_EFFECT_GUARD_FAILED/);

  const dryRun = await tool.backfillFinanceSideEffects(prisma, { dryRun: true });
  assert.equal(dryRun.created.paymentCashflow, 2, 'dry-run should count payment cashflows without writing');
  assert.equal(await prisma.financeCashflowEntry.count(), 0, 'dry-run must not write cashflow');

  const backfill = await tool.backfillFinanceSideEffects(prisma, { dryRun: false });
  assert.deepEqual(backfill.created, { receiptCashflow: 1, paymentCashflow: 2, customerLedger: 1, supplierLedger: 1 }, 'backfill should create all missing side effects exactly once');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'RECEIPT', sourceId: receipt.id, entryType: 'RECEIPT' } }), 1, 'receipt cashflow should be created');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'PAYMENT', sourceId: payment.id, entryType: 'PAYMENT' } }), 1, 'supplier payment cashflow should be created');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { sourceType: 'PAYMENT', sourceId: companyPayment.id, entryType: 'PAYMENT', supplierId: null, tourId: null } }), 1, 'company payment cashflow should be created without supplier/tour');
  assert.equal(await prisma.customerLedgerEntry.count({ where: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } }), 1, 'customer ledger should be created');
  assert.equal(await prisma.supplierLedgerEntry.count({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: payment.id, entryType: 'DEBIT' } }), 1, 'supplier ledger should be created');
  assert.equal(await prisma.supplierLedgerEntry.count({ where: { sourceType: 'FINANCE_PAYMENT', sourceId: companyPayment.id } }), 0, 'company payment without supplier must not create supplier ledger');

  const second = await tool.backfillFinanceSideEffects(prisma, { dryRun: false });
  assert.deepEqual(second.created, { receiptCashflow: 0, paymentCashflow: 0, customerLedger: 0, supplierLedger: 0 }, 'backfill should be idempotent');
  const guardAfter = cli(['--mode=guard']);
  assert.equal(guardAfter.status, 0, guardAfter.stderr || guardAfter.stdout);

  await prisma.$disconnect();
  console.log('TEST_FINANCE_SIDE_EFFECT_AUDIT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
