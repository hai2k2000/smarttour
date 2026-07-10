#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const service = fs.readFileSync(path.join(process.cwd(), 'apps/api/src/modules/orders/orders.service.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `missing block end after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const failures = [];
const helperBlock = service.includes('private async lockOrderForWrite')
  ? sliceBetween(service, '  private async lockOrderForWrite', '  private detailInclude')
  : '';

if (!helperBlock) failures.push('OrdersService must have a lockOrderForWrite helper for write/lifecycle mutations');
if (helperBlock && (!helperBlock.includes('FROM "Order"') || !helperBlock.includes('FOR UPDATE'))) failures.push('lockOrderForWrite must lock the Order row with SELECT ... FOR UPDATE');
if (helperBlock && !helperBlock.includes('branchDepartmentScopeWhere')) failures.push('lockOrderForWrite must re-read the locked order through data scope');

const cases = [
  { name: 'update', start: '  async update(typePath: string, id: string, dto: UpdateOrderDto, user?: RequestUser) {', end: '  async remove(typePath: string, id: string, user?: RequestUser) {' },
  { name: 'remove', start: '  async remove(typePath: string, id: string, user?: RequestUser) {', end: '  async updateStatus(typePath: string, id: string, status: OrderStatus, user?: RequestUser) {' },
  { name: 'updateStatus', start: '  async updateStatus(typePath: string, id: string, status: OrderStatus, user?: RequestUser) {', end: '  async copy(typePath: string, id: string, user?: RequestUser) {' },
  { name: 'settle', start: '  async settle(typePath: string, id: string, user?: RequestUser) {', end: '  async unlock(typePath: string, id: string, dto: UnlockOrderDto, user?: RequestUser) {' },
  { name: 'unlock', start: '  async unlock(typePath: string, id: string, dto: UnlockOrderDto, user?: RequestUser) {', end: '  private detailInclude() {' },
];

for (const item of cases) {
  const block = sliceBetween(service, item.start, item.end);
  const transactionIndex = block.indexOf('this.prisma.$transaction(async (tx) => {');
  if (transactionIndex === -1) {
    failures.push(`${item.name}: must run inside a transaction`);
    continue;
  }
  const beforeTransaction = block.slice(0, transactionIndex);
  if (beforeTransaction.includes('this.loadForEdit')) failures.push(`${item.name}: must not read mutable order state before the transaction lock`);
  if (beforeTransaction.includes('this.lifecycle.')) failures.push(`${item.name}: must not run lifecycle guards before the transaction lock`);

  const transactionBlock = block.slice(transactionIndex);
  const lockCall = 'await this.lockOrderForWrite(tx, typePath, id, user)';
  const lockIndex = transactionBlock.indexOf(lockCall);
  if (lockIndex === -1) failures.push(`${item.name}: missing ${lockCall} inside transaction`);
  const lifecycleIndex = transactionBlock.indexOf('this.lifecycle.');
  if (lockIndex !== -1 && lifecycleIndex !== -1 && lockIndex > lifecycleIndex) failures.push(`${item.name}: lifecycle checks/actions must happen after the locked scoped re-read`);
}

if (failures.length) {
  console.error('TEST_ORDERS_WRITE_LOCK_CONTRACT_FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('TEST_ORDERS_WRITE_LOCK_CONTRACT_OK');
