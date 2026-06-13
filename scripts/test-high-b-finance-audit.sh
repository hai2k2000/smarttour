#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

node <<'NODE'
const fs = require('fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const failures = [];
const block = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from === -1 || to === -1 ? '' : source.slice(from, to);
};

const commission = read('apps/api/src/modules/commission-reports/commission-reports.service.ts');
for (const [start, end, label] of [
  ['async list(', 'async summary(', 'commission list'],
  ['async summary(', 'private summaryFromRows(', 'commission summary'],
  ['async grouping(', 'private groupingFromRows(', 'commission grouping'],
]) {
  if (block(commission, start, end).includes('syncFromOrders')) failures.push(`${label} must not sync or write data`);
}

const vouchers = read('apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts');
const createPaymentVoucher = block(vouchers, 'async createPaymentVoucher(', 'private async resolveLinks(');
if (createPaymentVoucher.includes('operationVoucherPayment.create')) failures.push('createPaymentVoucher must not record payment before finance approval');
if (createPaymentVoucher.includes('operationVoucher.update')) failures.push('createPaymentVoucher must not update voucher debt before finance approval');
if (!createPaymentVoucher.includes('createdBy: actor')) failures.push('createPaymentVoucher must derive createdBy from request.user');
const addPayment = block(vouchers, 'async addPayment(', 'async createPaymentVoucher(');
if (!addPayment.includes('if (!paymentVoucherId)')) failures.push('addPayment must require a linked approved FinancePayment');
if (!addPayment.includes("payment.approvalStatus !== 'APPROVED'")) failures.push('addPayment must only apply an approved linked FinancePayment');
if (!vouchers.includes('createdBy: this.actor(user)')) failures.push('operation voucher create must derive createdBy from request.user');

const operations = read('apps/api/src/modules/operations/operations.service.ts');
for (const token of ['operationActor(dto)', 'this.text(dto.actor) || this.text(dto.approvedBy)', 'this.text(dto.requestedBy) || actor']) {
  if (operations.includes(token)) failures.push(`operations audit actor must not come from body: ${token}`);
}
if (operations.includes('payload: dto')) failures.push('operations audit payload must not preserve client-supplied actor fields');
if (!operations.includes('actorId: user?.id')) failures.push('operations AuditLog must record request.user id');

const customers = read('apps/api/src/modules/customers/customers.service.ts');
if (customers.includes('this.text(dto.actor)')) failures.push('customer timeline actor must not come from body');
if (customers.includes('createdBy: this.text(dto.createdBy)')) failures.push('customer createdBy must not come from body');
if (customers.includes('createdBy: () => this.text(dto.createdBy)')) failures.push('customer update must not allow client to replace createdBy');

const finance = read('apps/api/src/modules/finance/finance.service.ts');
if (!finance.includes('actorId: user?.id')) failures.push('finance AuditLog must record request.user id');

if (failures.length) {
  console.error(failures.map((failure) => `FAIL_HIGH_B ${failure}`).join('\n'));
  process.exit(1);
}
console.log('TEST_HIGH_B_FINANCE_AUDIT_OK');
NODE
