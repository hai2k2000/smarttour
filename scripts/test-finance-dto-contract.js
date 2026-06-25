const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/finance/finance.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/finance/finance.service.ts', 'utf8');
const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const dtoPath = 'apps/api/src/modules/finance/dto/finance-body.dto.ts';
const failures = [];

if (!fs.existsSync(dtoPath)) {
  failures.push('finance body DTO file is missing');
} else {
  const dto = fs.readFileSync(dtoPath, 'utf8');
  for (const name of [
    'FinanceReceiptBodyDto',
    'FinanceReceiptImportDto',
    'FinancePaymentBodyDto',
    'FinancePaymentImportDto',
    'FinanceInvoiceBodyDto',
    'FinanceDocumentActionDto',
    'FinanceDebtAdjustmentDto',
  ]) {
    if (!dto.includes(`export class ${name}`)) failures.push(`missing DTO class ${name}`);
  }
  for (const token of [
    'Allow',
    'IsArray',
    'IsIn',
    'IsOptional',
    'IsString',
    'MaxLength',
    "['DEPOSIT', 'TOUR_PAYMENT', 'CUSTOMER_DEBT', 'COLLECT_ON_BEHALF', 'SUPPLIER_FUND_REFUND', 'OTHER']",
    "['SUPPLIER_PAYMENT', 'CUSTOMER_REFUND', 'COMMISSION', 'INTERNAL_EXPENSE', 'SUPPLIER_DEPOSIT', 'ADVANCE', 'OTHER']",
    "['BANK_TRANSFER', 'CASH', 'CARD', 'QR', 'OFFSET', 'OTHER']",
    "['VAT', 'NO_VAT', 'ADJUSTMENT', 'REPLACEMENT']",
    "['INCREASE', 'DECREASE']",
  ]) {
    if (!dto.includes(token)) failures.push(`finance DTO validation missing ${token}`);
  }
}

for (const token of [
  'enum FinanceInvoiceType {',
  'VAT',
  'NO_VAT',
  'ADJUSTMENT',
  'REPLACEMENT',
]) {
  if (!schema.includes(token)) failures.push('Prisma schema missing FinanceInvoiceType token ' + token);
}
if (!service.includes("const FINANCE_INVOICE_TYPES = ['VAT', 'NO_VAT', 'ADJUSTMENT', 'REPLACEMENT'];")) {
  failures.push('FinanceService invoice type whitelist must match Prisma FinanceInvoiceType');
}
if (!controller.includes("from './dto/finance-body.dto'")) failures.push('FinanceController must import finance body DTO classes');
for (const [method, dtoName] of [
  ['createReceipt', 'FinanceReceiptBodyDto'],
  ['importReceipts', 'FinanceReceiptImportDto'],
  ['updateReceipt', 'FinanceReceiptBodyDto'],
  ['approveReceipt', 'FinanceDocumentActionDto'],
  ['rejectReceipt', 'FinanceDocumentActionDto'],
  ['cancelReceipt', 'FinanceDocumentActionDto'],
  ['createPayment', 'FinancePaymentBodyDto'],
  ['importPayments', 'FinancePaymentImportDto'],
  ['updatePayment', 'FinancePaymentBodyDto'],
  ['approvePayment', 'FinanceDocumentActionDto'],
  ['rejectPayment', 'FinanceDocumentActionDto'],
  ['cancelPayment', 'FinanceDocumentActionDto'],
  ['createInvoice', 'FinanceInvoiceBodyDto'],
  ['updateInvoice', 'FinanceInvoiceBodyDto'],
  ['approveInvoice', 'FinanceDocumentActionDto'],
  ['rejectInvoice', 'FinanceDocumentActionDto'],
  ['cancelInvoice', 'FinanceDocumentActionDto'],
  ['createCustomerDebtAdjustment', 'FinanceDebtAdjustmentDto'],
  ['createSupplierDebtAdjustment', 'FinanceDebtAdjustmentDto'],
]) {
  if (!controller.includes(`@Body() dto: ${dtoName}`)) failures.push(`${method} must use ${dtoName}`);
}
if (controller.includes('@Body() dto: Record<string, unknown>')) {
  failures.push('FinanceController must not use Record<string, unknown> request bodies');
}

if (failures.length) {
  console.error('FAIL_FINANCE_DTO_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_FINANCE_DTO_CONTRACT_OK');
