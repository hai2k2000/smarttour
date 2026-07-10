const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/operations/operations.service.ts', 'utf8');

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `${startNeedle} must exist`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `${endNeedle} must exist after ${startNeedle}`);
  return source.slice(start, end);
}

assert(
  /private\s+async\s+lockPaymentItemCosts/.test(service),
  'OperationsService must lock operation costs before validating/creating supplier payment requests',
);
assert(
  /lockPaymentItemCosts\(tx,\s*items\)/.test(service),
  'create/update supplier payment request flows must call lockPaymentItemCosts inside the transaction',
);
assert(
  /validatePaymentItems\(items,\s*undefined,\s*tx\)/.test(service),
  'createPaymentRequest must validate duplicate cost usage against the transaction client after locking',
);
assert(
  /validatePaymentItems\(items,\s*id,\s*tx\)/.test(service),
  'updatePaymentRequest must validate duplicate cost usage against the transaction client after locking',
);
assert(
  /FOR UPDATE/.test(service),
  'Operation cost locking must use SELECT ... FOR UPDATE',
);

const cancelForm = sliceBetween(service, 'async cancelForm', 'async listPaymentRequests');
const ensureFormCanBeCancelled = sliceBetween(service, 'private async ensureFormCanBeCancelled', 'private async validatePaymentItems');

assert(
  /FOR UPDATE/.test(cancelForm),
  'cancelForm must lock the OperationForm row before checking terminal status and active supplier payment requests',
);
assert(
  /formDetail\(id,\s*user,\s*tx\)/.test(cancelForm),
  'cancelForm must re-read the operation form with user scope inside the transaction after locking',
);
assert(
  /ensureFormCanBeCancelled\(id,\s*tx\)/.test(cancelForm),
  'cancelForm must check active supplier payment requests inside the same transaction as the cancel update',
);
assert(
  /client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(ensureFormCanBeCancelled),
  'ensureFormCanBeCancelled must accept a transaction client',
);
assert(
  /client\.supplierPaymentItem\.findFirst/.test(ensureFormCanBeCancelled),
  'ensureFormCanBeCancelled must query through the provided transaction client',
);

console.log('TEST_PHASE1_OPERATION_PAYMENT_REQUEST_CONCURRENCY_CONTRACT_OK');
