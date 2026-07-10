#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const service = fs.readFileSync(path.join(process.cwd(), 'apps/api/src/modules/customers/customers.service.ts'), 'utf8');

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) throw new Error(`missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`missing block end after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const failures = [];
if (!service.includes('private assertCustomerWritable(')) failures.push('missing merged-customer terminal write guard helper');
if (!service.includes('CustomerStatus.MERGED')) failures.push('merged-customer guard must check CustomerStatus.MERGED');
if (!service.includes('mergedIntoId')) failures.push('merged-customer guard should account for mergedIntoId metadata');

const guardedMethods = [
  ['addFile', '  async addFile(', '  async deleteFile('],
  ['deleteFile', '  async deleteFile(', '  async create('],
  ['update', '  async update(', '  async remove('],
  ['remove', '  async remove(', '  async merge('],
  ['transferOwner', '  async transferOwner(', '  async addComment('],
  ['addComment', '  async addComment(', '  async addCareTask('],
  ['addCareTask', '  async addCareTask(', '  async addCallLog('],
  ['addCallLog', '  async addCallLog(', '  async addOpportunity('],
  ['addOpportunity', '  async addOpportunity(', '  async updateCareTask('],
  ['updateCareTask', '  async updateCareTask(', '  async orders('],
];

for (const [name, start, end] of guardedMethods) {
  const block = sliceBetween(service, start, end);
  if (!block.includes('getWritableCustomer') && !block.includes('assertCustomerWritable') && !block.includes('lockWritableCustomerForWrite')) failures.push(`${name}: must reject writes on MERGED customers`);
}

if (!service.includes('private async lockWritableCustomerForWrite')) failures.push('customer interaction writes must share a row-lock helper for terminal customer checks');
if (!service.includes('FROM "Customer"') || !service.includes('FOR UPDATE')) failures.push('customer row-lock helper must use SELECT ... FOR UPDATE');

const interactionWriteMethods = [
  ['transferOwner', '  async transferOwner(', '  async addComment('],
  ['addComment', '  async addComment(', '  async addCareTask('],
  ['addCareTask', '  async addCareTask(', '  async addCallLog('],
  ['addCallLog', '  async addCallLog(', '  async addOpportunity('],
  ['addOpportunity', '  async addOpportunity(', '  async updateCareTask('],
  ['updateCareTask', '  async updateCareTask(', '  async orders('],
];

for (const [name, start, end] of interactionWriteMethods) {
  const block = sliceBetween(service, start, end);
  const transactionIndex = block.indexOf('this.prisma.$transaction(async (tx) => {');
  if (transactionIndex === -1) failures.push(`${name}: interaction writes must run in one transaction`);
  const beforeTransaction = transactionIndex === -1 ? block : block.slice(0, transactionIndex);
  if (beforeTransaction.includes('getWritableCustomer')) failures.push(`${name}: must not use a pre-transaction customer writability snapshot`);
  const transactionBlock = transactionIndex === -1 ? '' : block.slice(transactionIndex);
  if (!transactionBlock.includes('await this.lockWritableCustomerForWrite(tx, id, user)')) failures.push(`${name}: must lock and re-read writable customer inside the transaction`);
}

const mergeBlock = sliceBetween(service, '  async merge(', '  async transferOwner(');
if ((mergeBlock.match(/assertCustomerWritable/g) || []).length < 2) failures.push('merge: must reject MERGED target and source customers');

if (failures.length) {
  console.error('TEST_CUSTOMERS_MERGED_TERMINAL_CONTRACT_FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('TEST_CUSTOMERS_MERGED_TERMINAL_CONTRACT_OK');
