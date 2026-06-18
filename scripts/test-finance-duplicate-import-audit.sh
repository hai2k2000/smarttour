#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_finance_duplicate_import_test}"
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

const scriptPath = '/workspace/scripts/finance-duplicate-import-audit.js';
assert(fs.existsSync(scriptPath), 'finance duplicate import audit script must exist');
const tool = require(scriptPath);
assert.equal(typeof tool.auditFinanceDuplicateImports, 'function', 'script must export auditFinanceDuplicateImports');
assert.equal(typeof tool.backfillFinanceDuplicateImports, 'function', 'script must export backfillFinanceDuplicateImports');
assert.equal(tool.canonicalDocumentCode(' S1 - 0426 - NB - 38_3050_No.2 '), 'S1-0426-NB-38_3050_NO.2');

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
  const run = `FIN-DUP-${Date.now()}`;
  const customer = await prisma.customer.create({ data: { code: `${run}-CUS`, fullName: 'Duplicate Customer', phone: '0911111111', branch: 'DUP-BR', department: 'DUP-DEP' } });
  const category = await prisma.supplierCategory.create({ data: { name: `${run}-CAT` } });
  const supplier = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: `${run}-SUP`, name: 'Duplicate Supplier', status: 'ACTIVE' } });
  const duplicateSupplier = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: `${run}-SUP-DUP`, name: 'Wrong Duplicate Supplier', status: 'ACTIVE' } });
  const order = await prisma.order.create({ data: { type: 'SINGLE_SERVICE', systemCode: `${run}-ORD`, name: 'Duplicate Order', customerId: customer.id, totalRevenue: 1000, paidAmount: 600, remainingRevenue: 400, totalCost: 700, paidCost: 300, remainingCost: 400, branch: 'DUP-BR', department: 'DUP-DEP' } });

  const receiptKeep = await prisma.financeReceipt.create({ data: { receiptCode: `${run} - RCPT_No.2`, receiptName: 'Original receipt', receiptType: 'TOUR_PAYMENT', paymentMethod: 'CASH', paymentDate: new Date('2026-11-01'), customerId: customer.id, totalAmount: 300, receiptAmount: 300, remainingAmount: 0, branch: 'DUP-BR', department: 'DUP-DEP', approvalStatus: 'APPROVED', createdBy: 'tourkit-import', approvedBy: 'tourkit-import', approvedAt: new Date('2026-11-01'), createdAt: new Date('2026-11-01') } });
  await prisma.financeReceiptOrder.create({ data: { receiptId: receiptKeep.id, orderId: order.id, orderCode: order.systemCode, amount: 300 } });
  const receiptDuplicate = await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT_NO.2`, receiptName: 'Duplicate receipt', receiptType: 'TOUR_PAYMENT', paymentMethod: 'CASH', paymentDate: new Date('2026-11-01'), customerId: customer.id, totalAmount: 300, receiptAmount: 300, remainingAmount: 0, branch: 'DUP-BR', department: 'DUP-DEP', approvalStatus: 'APPROVED', createdBy: 'tourkit-import', approvedBy: 'tourkit-import', approvedAt: new Date('2026-11-02'), createdAt: new Date('2026-11-02') } });
  await prisma.financeReceiptOrder.create({ data: { receiptId: receiptDuplicate.id, orderId: order.id, orderCode: order.systemCode, amount: 300 } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'RECEIPT', sourceId: receiptDuplicate.id, entryType: 'RECEIPT', amount: 300, paymentMethod: 'CASH', paymentDate: new Date('2026-11-01'), customerId: customer.id, receiptId: receiptDuplicate.id } });
  await prisma.customerLedgerEntry.create({ data: { customerId: customer.id, receiptId: receiptDuplicate.id, orderId: order.id, sourceType: 'FINANCE_RECEIPT', sourceId: receiptDuplicate.id, entryType: 'CREDIT', creditAmount: 300, documentCode: receiptDuplicate.receiptCode, documentDate: new Date('2026-11-01') } });
  await prisma.financeReceipt.create({ data: { receiptCode: `${run}-RCPT_NO.1`, receiptName: 'Real first receipt', receiptType: 'TOUR_PAYMENT', paymentMethod: 'CASH', paymentDate: new Date('2026-10-01'), customerId: customer.id, totalAmount: 300, receiptAmount: 300, remainingAmount: 0, branch: 'DUP-BR', department: 'DUP-DEP', approvalStatus: 'APPROVED', createdBy: 'tourkit-import', approvedBy: 'tourkit-import', approvedAt: new Date('2026-10-01') } });

  const paymentKeep = await prisma.financePayment.create({ data: { voucherCode: `${run} - PAY__No.1`, voucherName: 'Original payment', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentDate: new Date('2026-11-03'), supplierId: supplier.id, orderId: order.id, totalAmount: 300, paymentAmount: 300, remainingAmount: 0, branch: 'DUP-BR', department: 'DUP-DEP', approvalStatus: 'APPROVED', createdBy: 'tourkit-import', approvedBy: 'tourkit-import', approvedAt: new Date('2026-11-03'), createdAt: new Date('2026-11-03') } });
  const paymentDuplicate = await prisma.financePayment.create({ data: { voucherCode: `${run}-PAY__NO.1`, voucherName: 'Duplicate payment', voucherType: 'SUPPLIER_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentDate: new Date('2026-10-30'), supplierId: duplicateSupplier.id, orderId: order.id, totalAmount: 300, paymentAmount: 300, remainingAmount: 0, branch: 'DUP-BR', department: 'DUP-DEP', approvalStatus: 'APPROVED', createdBy: 'tourkit-import', approvedBy: 'tourkit-import', approvedAt: new Date('2026-11-04'), createdAt: new Date('2026-11-04') } });
  await prisma.financeCashflowEntry.create({ data: { sourceType: 'PAYMENT', sourceId: paymentDuplicate.id, entryType: 'PAYMENT', amount: 300, paymentMethod: 'BANK_TRANSFER', paymentDate: new Date('2026-11-03'), supplierId: supplier.id, orderId: order.id, paymentId: paymentDuplicate.id } });
  await prisma.supplierLedgerEntry.create({ data: { supplierId: supplier.id, paymentId: paymentDuplicate.id, orderId: order.id, sourceType: 'FINANCE_PAYMENT', sourceId: paymentDuplicate.id, entryType: 'DEBIT', debitAmount: 300, documentCode: paymentDuplicate.voucherCode, documentDate: new Date('2026-11-03') } });

  const auditBefore = await tool.auditFinanceDuplicateImports(prisma);
  assert.equal(auditBefore.duplicateReceipts.length, 1, 'audit should find one duplicate receipt group');
  assert.equal(auditBefore.duplicatePayments.length, 1, 'audit should find one duplicate payment group');
  assert.equal(auditBefore.duplicateReceipts[0].keep.id, receiptKeep.id, 'earliest receipt should be kept');
  assert.equal(auditBefore.duplicateReceipts[0].duplicates[0].id, receiptDuplicate.id, 'later receipt should be duplicate');
  assert.equal(auditBefore.duplicatePayments[0].keep.id, paymentKeep.id, 'earliest payment should be kept');
  assert.equal(auditBefore.duplicatePayments[0].duplicates[0].id, paymentDuplicate.id, 'later payment should be duplicate');

  const guardBefore = cli(['--mode=guard']);
  assert.notEqual(guardBefore.status, 0, 'guard should fail when duplicate imports exist');
  assert.match(`${guardBefore.stdout}\n${guardBefore.stderr}`, /FINANCE_DUPLICATE_IMPORT_GUARD_FAILED/);

  const dryRun = await tool.backfillFinanceDuplicateImports(prisma, { dryRun: true });
  assert.deepEqual(dryRun.deleted, { receipts: 1, payments: 1, cashflow: 2, customerLedger: 1, supplierLedger: 1 }, 'dry-run should count duplicate cleanup');
  assert.equal(await prisma.financeReceipt.count({ where: { id: receiptDuplicate.id, deletedAt: null } }), 1, 'dry-run must not soft-delete receipt');

  const applied = await tool.backfillFinanceDuplicateImports(prisma, { dryRun: false });
  assert.deepEqual(applied.deleted, { receipts: 1, payments: 1, cashflow: 2, customerLedger: 1, supplierLedger: 1 }, 'apply should clean duplicate side effects');
  assert.equal(await prisma.financeReceipt.count({ where: { id: receiptKeep.id, deletedAt: null } }), 1, 'kept receipt should remain active');
  assert.equal(await prisma.financeReceipt.count({ where: { id: receiptDuplicate.id, deletedAt: null } }), 0, 'duplicate receipt should be soft-deleted');
  assert.equal(await prisma.financePayment.count({ where: { id: paymentKeep.id, deletedAt: null } }), 1, 'kept payment should remain active');
  assert.equal(await prisma.financePayment.count({ where: { id: paymentDuplicate.id, deletedAt: null } }), 0, 'duplicate payment should be soft-deleted');
  assert.equal(await prisma.financeCashflowEntry.count({ where: { OR: [{ receiptId: receiptDuplicate.id }, { paymentId: paymentDuplicate.id }] } }), 0, 'duplicate cashflow should be removed');
  assert.equal(await prisma.customerLedgerEntry.count({ where: { receiptId: receiptDuplicate.id } }), 0, 'duplicate customer ledger should be removed');
  assert.equal(await prisma.supplierLedgerEntry.count({ where: { paymentId: paymentDuplicate.id } }), 0, 'duplicate supplier ledger should be removed');
  const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(Number(orderAfter.paidAmount), 600, 'cleanup should not rewrite order paidAmount');
  assert.equal(Number(orderAfter.paidCost), 300, 'cleanup should not rewrite order paidCost');

  const second = await tool.backfillFinanceDuplicateImports(prisma, { dryRun: false });
  assert.deepEqual(second.deleted, { receipts: 0, payments: 0, cashflow: 0, customerLedger: 0, supplierLedger: 0 }, 'apply should be idempotent');
  const guardAfter = cli(['--mode=guard']);
  assert.equal(guardAfter.status, 0, guardAfter.stderr || guardAfter.stdout);

  await prisma.$disconnect();
  console.log('TEST_FINANCE_DUPLICATE_IMPORT_AUDIT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
