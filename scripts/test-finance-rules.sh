#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null

docker compose run --rm --entrypoint node api <<'NODE'
const { Prisma } = require('@prisma/client');
const { hasMoneyChange, invoiceSummary, paymentSummary, receiptSummary } = require('./apps/api/dist/modules/finance/finance-rules');

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

const receipts = receiptSummary([
  { receiptAmount: new Prisma.Decimal(100), approvalStatus: 'DRAFT', receiptType: 'DEPOSIT' },
  { receiptAmount: new Prisma.Decimal(200), approvalStatus: 'APPROVED', receiptType: 'TOUR_PAYMENT' },
]);
assertEqual(receipts.count, 2, 'receipt count');
assertEqual(receipts.totalAmount, 300, 'receipt total');
assertEqual(receipts.draft, 1, 'receipt draft');
assertEqual(receipts.deposit, 1, 'receipt deposit');
assertEqual(receipts.approved, 1, 'receipt approved');

const payments = paymentSummary([
  { paymentAmount: new Prisma.Decimal(50), approvalStatus: 'DRAFT' },
  { paymentAmount: new Prisma.Decimal(70), approvalStatus: 'REJECTED' },
  { paymentAmount: new Prisma.Decimal(80), approvalStatus: 'APPROVED' },
]);
assertEqual(payments.totalAmount, 200, 'payment total');
assertEqual(payments.draft, 1, 'payment draft');
assertEqual(payments.rejected, 1, 'payment rejected');
assertEqual(payments.approved, 1, 'payment approved');

const invoices = invoiceSummary([
  { totalAfterTax: new Prisma.Decimal(1000), approvalStatus: 'PENDING' },
  { totalAfterTax: new Prisma.Decimal(2000), approvalStatus: 'APPROVED' },
]);
assertEqual(invoices.totalAmount, 3000, 'invoice total');
assertEqual(invoices.pending, 1, 'invoice pending');
assertEqual(invoices.approved, 1, 'invoice approved');

assertEqual(hasMoneyChange({ note: 'unchanged' }), false, 'non-money change');
assertEqual(hasMoneyChange({ paymentAmount: 100 }), true, 'payment money change');
assertEqual(hasMoneyChange({ items: [] }), true, 'invoice item money change');

console.log('TEST_FINANCE_RULES_OK');
NODE
