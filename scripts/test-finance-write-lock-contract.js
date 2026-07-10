#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const service = fs.readFileSync(path.join(process.cwd(), 'apps/api/src/modules/finance/finance.service.ts'), 'utf8');

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) throw new Error(`missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`missing block end after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const cases = [
  {
    name: 'updateReceipt',
    start: '  async updateReceipt(id: string, dto: AnyRecord, user?: RequestUser) {',
    end: '  async deleteReceipt(id: string, user?: RequestUser) {',
    lock: 'await lockFinanceReceipt(tx, id);',
    detail: 'this.receiptDetail(id, user)',
    find: 'tx.financeReceipt.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    update: 'tx.financeReceipt.update',
  },
  {
    name: 'deleteReceipt',
    start: '  async deleteReceipt(id: string, user?: RequestUser) {',
    end: '  async approveReceipt(id: string, dto: AnyRecord, user?: RequestUser) {',
    lock: 'await lockFinanceReceipt(tx, id);',
    detail: 'this.receiptDetail(id, user)',
    find: 'tx.financeReceipt.findFirst',
    assert: 'assertCanDeleteFinanceEntity(current,',
    update: 'tx.financeReceipt.update',
  },
  {
    name: 'updatePayment',
    start: '  async updatePayment(id: string, dto: AnyRecord, user?: RequestUser) {',
    end: '  async deletePayment(id: string, user?: RequestUser) {',
    lock: 'await lockFinancePayment(tx, id);',
    detail: 'this.paymentDetail(id, user)',
    find: 'tx.financePayment.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    update: 'tx.financePayment.update',
  },
  {
    name: 'deletePayment',
    start: '  async deletePayment(id: string, user?: RequestUser) {',
    end: '  async approvePayment(id: string, dto: AnyRecord, user?: RequestUser) {',
    lock: 'await lockFinancePayment(tx, id);',
    detail: 'this.paymentDetail(id, user)',
    find: 'tx.financePayment.findFirst',
    assert: 'assertCanDeleteFinanceEntity(current,',
    update: 'tx.financePayment.update',
  },
  {
    name: 'updateInvoice',
    start: '  async updateInvoice(id: string, dto: AnyRecord, user?: RequestUser) {',
    end: '  async deleteInvoice(id: string, user?: RequestUser) {',
    lock: 'await lockFinanceInvoice(tx, id);',
    detail: 'this.invoiceDetail(id, user)',
    find: 'tx.financeInvoice.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    update: 'tx.financeInvoice.update',
  },
  {
    name: 'deleteInvoice',
    start: '  async deleteInvoice(id: string, user?: RequestUser) {',
    end: '  async approveInvoice(id: string, dto: AnyRecord, user?: RequestUser) {',
    lock: 'await lockFinanceInvoice(tx, id);',
    detail: 'this.invoiceDetail(id, user)',
    find: 'tx.financeInvoice.findFirst',
    assert: 'assertCanDeleteFinanceEntity(current,',
    update: 'tx.financeInvoice.update',
  },
];

const failures = [];

for (const item of cases) {
  const block = sliceBetween(service, item.start, item.end);
  const transactionIndex = block.indexOf('this.prisma.$transaction(async (tx) => {');
  if (transactionIndex === -1) {
    failures.push(`${item.name}: write must run inside prisma transaction`);
    continue;
  }

  const beforeTransaction = block.slice(0, transactionIndex);
  if (beforeTransaction.includes(item.detail)) failures.push(`${item.name}: must not read detail before transaction lock`);
  if (beforeTransaction.includes('assertCanUpdateFinanceEntity') || beforeTransaction.includes('assertCanDeleteFinanceEntity')) failures.push(`${item.name}: must not check final-state guard before transaction lock`);

  const transactionBlock = block.slice(transactionIndex);
  for (const required of [item.lock, item.find, item.assert, item.update]) {
    if (!transactionBlock.includes(required)) failures.push(`${item.name}: missing ${required} inside transaction`);
  }

  const lockIndex = transactionBlock.indexOf(item.lock);
  const findIndex = transactionBlock.indexOf(item.find);
  const assertIndex = transactionBlock.indexOf(item.assert);
  const updateIndex = transactionBlock.indexOf(item.update);
  if (lockIndex !== -1 && findIndex !== -1 && lockIndex > findIndex) failures.push(`${item.name}: row lock must happen before scoped re-read`);
  if (findIndex !== -1 && assertIndex !== -1 && findIndex > assertIndex) failures.push(`${item.name}: scoped re-read must happen before final-state guard`);
  if (assertIndex !== -1 && updateIndex !== -1 && assertIndex > updateIndex) failures.push(`${item.name}: final-state guard must happen before write`);
}

if (failures.length) {
  console.error('TEST_FINANCE_WRITE_LOCK_CONTRACT_FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('TEST_FINANCE_WRITE_LOCK_CONTRACT_OK');
