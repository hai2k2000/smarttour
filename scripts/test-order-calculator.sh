#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null

docker compose run --rm --entrypoint node api <<'NODE'
const { calculateOrderTotals, operationAmount, salesAmount } = require('./apps/api/dist/modules/orders/order-calculator');

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

console.log('TEST_ORDER_CALCULATOR_OK');
NODE
