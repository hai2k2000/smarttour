const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/operations/operations.service.ts', 'utf8');

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

console.log('TEST_PHASE1_OPERATION_PAYMENT_REQUEST_CONCURRENCY_CONTRACT_OK');
