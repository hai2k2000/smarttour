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
    name: 'uploadReceiptFile',
    start: '  async uploadReceiptFile(',
    end: '  async deleteReceiptFile(id: string, user?: RequestUser) {',
    lock: 'await lockFinanceReceipt(tx, id);',
    find: 'tx.financeReceipt.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    write: 'tx.financeReceipt.update',
  },
  {
    name: 'deleteReceiptFile',
    start: '  async deleteReceiptFile(id: string, user?: RequestUser) {',
    end: '  async createReceipt',
    lock: 'await lockFinanceReceipt(tx, id);',
    find: 'tx.financeReceipt.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    write: 'tx.financeReceipt.update',
  },
  {
    name: 'uploadPaymentFile',
    start: '  async uploadPaymentFile(',
    end: '  async deletePaymentFile(id: string, user?: RequestUser) {',
    lock: 'await lockFinancePayment(tx, id);',
    find: 'tx.financePayment.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    write: 'tx.financePayment.update',
  },
  {
    name: 'deletePaymentFile',
    start: '  async deletePaymentFile(id: string, user?: RequestUser) {',
    end: '  async createPayment',
    lock: 'await lockFinancePayment(tx, id);',
    find: 'tx.financePayment.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    write: 'tx.financePayment.update',
  },
  {
    name: 'uploadInvoiceFile',
    start: '  async uploadInvoiceFile(',
    end: '  async deleteInvoiceFile(id: string, fileId: string, user?: RequestUser) {',
    lock: 'await lockFinanceInvoice(tx, id);',
    find: 'tx.financeInvoice.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    write: 'tx.financeInvoiceFile.create',
  },
  {
    name: 'deleteInvoiceFile',
    start: '  async deleteInvoiceFile(id: string, fileId: string, user?: RequestUser) {',
    end: '  async createInvoice',
    lock: 'await lockFinanceInvoice(tx, id);',
    find: 'tx.financeInvoice.findFirst',
    assert: 'assertCanUpdateFinanceEntity(current,',
    write: 'tx.financeInvoiceFile.delete',
  },
];

const failures = [];

for (const item of cases) {
  const block = sliceBetween(service, item.start, item.end);
  const transactionIndex = block.indexOf('this.prisma.$transaction(async (tx) => {');
  if (transactionIndex === -1) {
    failures.push(`${item.name}: attachment metadata write must run inside prisma transaction`);
    continue;
  }

  const transactionBlock = block.slice(transactionIndex);
  for (const required of [item.lock, item.find, item.assert, item.write]) {
    if (!transactionBlock.includes(required)) failures.push(`${item.name}: missing ${required} inside transaction`);
  }

  const lockIndex = transactionBlock.indexOf(item.lock);
  const findIndex = transactionBlock.indexOf(item.find);
  const assertIndex = transactionBlock.indexOf(item.assert);
  const writeIndex = transactionBlock.indexOf(item.write);
  if (lockIndex !== -1 && findIndex !== -1 && lockIndex > findIndex) failures.push(`${item.name}: row lock must happen before scoped re-read`);
  if (findIndex !== -1 && assertIndex !== -1 && findIndex > assertIndex) failures.push(`${item.name}: scoped re-read must happen before final-state guard`);
  if (assertIndex !== -1 && writeIndex !== -1 && assertIndex > writeIndex) failures.push(`${item.name}: final-state guard must happen before attachment metadata write`);
}

if (failures.length) {
  console.error('TEST_FINANCE_ATTACHMENT_WRITE_LOCK_CONTRACT_FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('TEST_FINANCE_ATTACHMENT_WRITE_LOCK_CONTRACT_OK');
