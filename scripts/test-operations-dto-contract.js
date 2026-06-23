const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/operations/operations.controller.ts', 'utf8');
const dtoPath = 'apps/api/src/modules/operations/dto/operation-body.dto.ts';
const failures = [];

if (!fs.existsSync(dtoPath)) {
  failures.push('operations body DTO file is missing');
} else {
  const dto = fs.readFileSync(dtoPath, 'utf8');
  for (const name of [
    'CreateOperationFormDto',
    'UpdateOperationFormDto',
    'OperationFormStatusDto',
    'CancelOperationFormDto',
    'CreateSupplierPaymentRequestDto',
    'UpdateSupplierPaymentRequestDto',
    'SupplierPaymentRequestActionDto',
    'CreateFinancePaymentForRequestDto',
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
    "['PENDING', 'IN_PROGRESS', 'DONE', 'PROBLEM', 'CANCELLED']",
    "['DRAFT', 'REQUESTED', 'APPROVED', 'PAID', 'REJECTED']",
    "['CASH', 'BANK_TRANSFER', 'CARD', 'QR', 'OFFSET', 'OTHER']",
  ]) {
    if (!dto.includes(token)) failures.push(`operations DTO validation missing ${token}`);
  }
}

if (!controller.includes("from './dto/operation-body.dto'")) failures.push('OperationsController must import operation body DTO classes');
for (const [method, dtoName] of [
  ['createForm', 'CreateOperationFormDto'],
  ['updateForm', 'UpdateOperationFormDto'],
  ['updateFormStatus', 'OperationFormStatusDto'],
  ['cancelFormLegacy', 'CancelOperationFormDto'],
  ['cancelForm', 'CancelOperationFormDto'],
  ['createPaymentRequest', 'CreateSupplierPaymentRequestDto'],
  ['updatePaymentRequest', 'UpdateSupplierPaymentRequestDto'],
  ['submitPaymentRequest', 'SupplierPaymentRequestActionDto'],
  ['approvePaymentRequest', 'SupplierPaymentRequestActionDto'],
  ['rejectPaymentRequest', 'SupplierPaymentRequestActionDto'],
  ['createFinancePaymentForRequest', 'CreateFinancePaymentForRequestDto'],
]) {
  if (!controller.includes(`@Body() dto: ${dtoName}`)) failures.push(`${method} must use ${dtoName}`);
}
if (controller.includes('@Body() dto?: Record<string, unknown>')) {
  failures.push('OperationsController must not use Record<string, unknown> request bodies');
}

if (failures.length) {
  console.error('FAIL_OPERATIONS_DTO_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_OPERATIONS_DTO_CONTRACT_OK');
