const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/finance/finance.service.ts', 'utf8');

function functionBody(name) {
  const start = service.indexOf(`async ${name}`);
  assert(start !== -1, `${name} must exist`);
  const next = service.indexOf('\n  async ', start + 1);
  return service.slice(start, next === -1 ? service.length : next);
}

function assertDbBeforeObjectDelete(name, dbPattern) {
  const body = functionBody(name);
  const dbIndex = body.search(dbPattern);
  const objectIndex = body.indexOf('removeIfPresent');
  assert(dbIndex !== -1, `${name} must update/delete database metadata`);
  assert(objectIndex !== -1, `${name} must remove the object after database metadata changes`);
  assert(dbIndex < objectIndex, `${name} must change database metadata before removing the object`);
  assert(/removeIfPresent\(objectKey\)\.catch\(\(\) => undefined\)/.test(body), `${name} must remove the object best-effort after DB changes`);
}

assertDbBeforeObjectDelete('deleteReceiptFile', /financeReceipt\.update/);
assertDbBeforeObjectDelete('deletePaymentFile', /financePayment\.update/);
assertDbBeforeObjectDelete('deleteInvoiceFile', /financeInvoiceFile\.delete/);

console.log('TEST_PHASE2_FINANCE_FILE_DELETE_CONTRACT_OK');
