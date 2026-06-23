const fs = require('fs');

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

const requiredIndexes = {
  Order: [
    ['deletedAt', 'updatedAt'],
    ['deletedAt', 'startDate'],
    ['deletedAt', 'status'],
  ],
  FinanceReceipt: [
    ['deletedAt', 'updatedAt'],
    ['deletedAt', 'paymentDate'],
    ['deletedAt', 'approvalStatus'],
  ],
  FinancePayment: [
    ['deletedAt', 'updatedAt'],
    ['deletedAt', 'paymentDate'],
    ['deletedAt', 'approvalStatus'],
  ],
  FinanceInvoice: [
    ['deletedAt', 'updatedAt'],
    ['deletedAt', 'issuedDate'],
    ['deletedAt', 'approvalStatus'],
  ],
  FinanceCashflowEntry: [
    ['paymentDate', 'createdAt'],
    ['entryType', 'paymentDate'],
    ['branch', 'department', 'paymentDate'],
  ],
  CustomerLedgerEntry: [
    ['documentDate', 'createdAt'],
    ['branch', 'department', 'documentDate'],
    ['customerId', 'documentDate', 'createdAt'],
  ],
  SupplierLedgerEntry: [
    ['documentDate', 'createdAt'],
    ['branch', 'department', 'documentDate'],
    ['supplierId', 'documentDate', 'createdAt'],
  ],
  Customer: [
    ['status', 'createdAt'],
    ['branch', 'department', 'status', 'createdAt'],
    ['owner', 'createdAt'],
  ],
  CustomerCareTask: [
    ['customerId', 'scheduledAt'],
    ['customerId', 'status', 'scheduledAt'],
  ],
  CustomerComment: [
    ['customerId', 'createdAt'],
  ],
  CustomerCallLog: [
    ['customerId', 'calledAt'],
  ],
  CustomerOpportunity: [
    ['customerId', 'createdAt'],
    ['customerId', 'stage'],
  ],
  Booking: [
    ['deletedAt', 'startDate', 'code'],
    ['deletedAt', 'status', 'startDate'],
  ],
  OperationVoucher: [
    ['deletedAt', 'updatedAt'],
    ['deletedAt', 'serviceDate'],
    ['deletedAt', 'status', 'serviceDate'],
    ['supplierId', 'serviceDate'],
  ],
  OperationForm: [
    ['status', 'updatedAt'],
    ['updatedAt', 'createdAt'],
  ],
  OperationService: [
    ['operationFormId'],
    ['operationFormId', 'confirmationStatus'],
  ],
  OperationTask: [
    ['operationFormId'],
    ['operationFormId', 'status', 'dueDate'],
    ['status', 'dueDate'],
  ],
  OperationCost: [
    ['operationFormId'],
    ['serviceId'],
  ],
  SupplierPaymentRequest: [
    ['status', 'requestedAt'],
    ['requestedAt', 'code'],
  ],
  SupplierPaymentItem: [
    ['requestId'],
    ['supplierId'],
    ['costId'],
  ],
  Supplier: [
    ['deletedAt', 'updatedAt'],
    ['status', 'deletedAt', 'updatedAt'],
  ],
  Quotation: [
    ['updatedAt'],
    ['productType', 'status', 'updatedAt'],
  ],
  TourQuote: [
    ['updatedAt'],
    ['status', 'updatedAt'],
  ],
};

const failures = [];

function modelBlock(modelName) {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  return match ? match[1] : '';
}

function indexFields(block) {
  const indexes = [];
  const regex = /@@index\(\s*\[([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(block))) {
    indexes.push(
      match[1]
        .split(',')
        .map((field) => field.trim().replace(/\s.*$/, ''))
        .filter(Boolean),
    );
  }
  return indexes;
}

function hasIndex(indexes, required) {
  return indexes.some((index) => index.length === required.length && index.every((field, indexPosition) => field === required[indexPosition]));
}

for (const [modelName, indexes] of Object.entries(requiredIndexes)) {
  const block = modelBlock(modelName);
  if (!block) {
    failures.push(`missing Prisma model ${modelName}`);
    continue;
  }
  const existing = indexFields(block);
  for (const required of indexes) {
    if (!hasIndex(existing, required)) {
      failures.push(`${modelName} missing @@index([${required.join(', ')}])`);
    }
  }
}

if (failures.length) {
  console.error('FAIL_PRISMA_INDEX_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_PRISMA_INDEX_CONTRACT_OK');
