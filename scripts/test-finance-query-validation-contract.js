#!/usr/bin/env node
const fs = require('fs');

const source = fs.readFileSync('apps/api/src/modules/finance/dto/finance-query.dto.ts', 'utf8');
assert(source.includes("from '../../query-validation'"), 'FinanceQueryDto must use shared query validation helper');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function propertyBlock(name) {
  const endNeedle = `${name}?: string;`;
  const end = source.indexOf(endNeedle);
  if (end === -1) throw new Error(`FinanceQueryDto must declare ${name}`);
  const previousProperty = source.lastIndexOf('@ApiPropertyOptional', end - 1);
  return source.slice(previousProperty, end + endNeedle.length);
}

const expected = {
  status: { constant: 'FINANCE_APPROVAL_STATUSES', values: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] },
  receiptType: { constant: 'FINANCE_RECEIPT_TYPES', values: ['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER'] },
  voucherType: { constant: 'FINANCE_PAYMENT_TYPES', values: ['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER'] },
  invoiceType: { constant: 'FINANCE_INVOICE_TYPES', values: ['VAT', 'NO_VAT', 'ADJUSTMENT', 'REPLACEMENT'] },
  entryType: { constant: 'FINANCE_CASHFLOW_ENTRY_TYPES', values: ['RECEIPT', 'PAYMENT'] },
  paymentMethod: { constant: 'FINANCE_PAYMENT_METHODS', values: ['CASH', 'BANK_TRANSFER', 'CARD', 'QR', 'OFFSET', 'OTHER'] },
};

for (const [property, expectation] of Object.entries(expected)) {
  const block = propertyBlock(property);
  assert(block.includes(`@IsIn(readonlyValues(${expectation.constant}))`), `${property} must use helper-backed @IsIn enum validation`);
  const constantStart = source.indexOf(`const ${expectation.constant}`);
  const constantEnd = source.indexOf(' as const;', constantStart);
  const constantBlock = constantStart === -1 || constantEnd === -1 ? '' : source.slice(constantStart, constantEnd);
  for (const value of expectation.values) {
    assert(constantBlock.includes(`'${value}'`), `${property} must allow ${value}`);
  }
}
console.log('TEST_FINANCE_QUERY_VALIDATION_CONTRACT_OK');
