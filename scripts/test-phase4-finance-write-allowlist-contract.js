const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/finance/finance.service.ts', 'utf8');

assert(/const WRITABLE_FINANCE_FIELDS = new Set/.test(service), 'Finance write path must use an explicit writable-field allowlist');
assert(/WRITABLE_FINANCE_FIELDS\.has\(key\)/.test(service), 'financeWriteInput must filter keys through WRITABLE_FINANCE_FIELDS');

const allowlistMatch = service.match(/const WRITABLE_FINANCE_FIELDS = new Set\(\[([\s\S]*?)\]\);/);
assert(allowlistMatch, 'WRITABLE_FINANCE_FIELDS declaration must be statically auditable');
const allowlist = allowlistMatch[1];
for (const forbidden of ['attachmentName', 'attachmentUrl', 'approvalStatus', 'deletedAt', 'lockedAt', 'reversalOfId']) {
  assert(!allowlist.includes(`'${forbidden}'`), `WRITABLE_FINANCE_FIELDS must not include ${forbidden}`);
}

for (const required of ['receiptCode', 'receiptAmount', 'orders', 'voucherCode', 'paymentAmount', 'invoiceCode', 'items']) {
  assert(allowlist.includes(`'${required}'`), `WRITABLE_FINANCE_FIELDS must include ${required}`);
}

console.log('TEST_PHASE4_FINANCE_WRITE_ALLOWLIST_CONTRACT_OK');
