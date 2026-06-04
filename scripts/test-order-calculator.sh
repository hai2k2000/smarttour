#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null

docker compose run --rm --entrypoint node api <<'NODE'
const {
  calculateCost,
  calculateCostSummary,
  calculateOrderTotals,
  calculatePaymentSummary,
  calculateRevenue,
  operationAmount,
  salesAmount,
} = require('./apps/api/dist/modules/orders/order-calculator');

function assertEqual(actual, expected, label) {
  if (typeof actual === 'number' && typeof expected === 'number' && Math.abs(actual - expected) < 0.000001) {
    return;
  }
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(salesAmount({ quantity: 2, serviceCount: 3, unitPrice: 100000, vat: 10 }), 660000, 'sales amount with VAT');
assertEqual(operationAmount({ quantity: 4, netPrice: 50000, vat: 5 }), 210000, 'operation amount with VAT');
assertEqual(salesAmount({ quantity: 2, serviceCount: 0, unitPrice: 100000, vat: 0 }), 0, 'zero service count must remain zero');
assertEqual(salesAmount({ unitPrice: 100000, vat: 0 }), 100000, 'missing sales counts should default to one');
assertEqual(operationAmount({ netPrice: 50000, vat: 0 }), 50000, 'missing operation quantity should default to one');
assertEqual(calculateRevenue({ salesItems: [{ quantity: 2, serviceCount: 1, unitPrice: 100000, vat: 10 }] }), 220000, 'calculateRevenue should only sum sales rows');
assertEqual(calculateCost({ operationItems: [{ quantity: 2, netPrice: 70000, vat: 0 }] }), 140000, 'calculateCost should only sum operation rows');
assertEqual(calculatePaymentSummary(220000, 100000).paymentStatus, 'PARTIAL', 'calculatePaymentSummary should derive payment status');
assertEqual(calculateCostSummary(140000, 140000).costStatus, 'PAID', 'calculateCostSummary should derive cost status');

const partial = calculateOrderTotals({
  salesItems: [{ quantity: 2, serviceCount: 1, unitPrice: 100000, vat: 10 }],
  operationItems: [{ quantity: 1, netPrice: 70000, vat: 0 }],
  paidAmount: 100000,
  paidCost: 0,
});
assertEqual(partial.totalRevenue, 220000, 'partial total revenue');
assertEqual(partial.remainingRevenue, 120000, 'partial remaining revenue');
assertEqual(partial.paymentStatus, 'PARTIAL', 'partial payment status');
assertEqual(partial.totalCost, 70000, 'partial total cost');
assertEqual(partial.costStatus, 'PENDING', 'pending cost status');
assertEqual(partial.profit, 150000, 'partial profit');

const paid = calculateOrderTotals({
  salesItems: [{ quantity: 1, serviceCount: 1, unitPrice: 100000, vat: 0 }],
  operationItems: [{ quantity: 1, netPrice: 30000, vat: 0 }],
  paidAmount: 100000,
  paidCost: 30000,
});
assertEqual(paid.paymentStatus, 'PAID', 'paid payment status');
assertEqual(paid.costStatus, 'PAID', 'paid cost status');

const missingLines = calculateOrderTotals({});
assertEqual(missingLines.totalRevenue, 0, 'missing sales should calculate zero revenue');
assertEqual(missingLines.totalCost, 0, 'missing operations should calculate zero cost');
assertEqual(missingLines.profit, 0, 'missing lines should calculate zero profit');
assertEqual(missingLines.paymentStatus, 'UNPAID', 'missing revenue payment status');
assertEqual(missingLines.costStatus, 'PENDING', 'missing cost status');

const overpaid = calculateOrderTotals({
  salesItems: [{ quantity: 1, serviceCount: 1, unitPrice: 100000, vat: 0 }],
  operationItems: [{ quantity: 1, netPrice: 50000, vat: 0 }],
  paidAmount: 120000,
  paidCost: 60000,
});
assertEqual(overpaid.remainingRevenue, 0, 'overpaid revenue should not go negative');
assertEqual(overpaid.remainingCost, 0, 'overpaid cost should not go negative');
assertEqual(overpaid.paymentStatus, 'PAID', 'overpaid revenue should be paid');
assertEqual(overpaid.costStatus, 'PAID', 'overpaid cost should be paid');

console.log('TEST_ORDER_CALCULATOR_OK');
NODE
