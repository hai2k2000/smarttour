const fs = require('fs');
const assert = require('assert');

const dto = fs.readFileSync('apps/api/src/modules/finance/dto/finance-body.dto.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/finance/finance.service.ts', 'utf8');

assert(!/attachmentName\??:\s*unknown/.test(dto), 'Finance write DTO must not accept attachmentName from JSON bodies');
assert(!/attachmentUrl\??:\s*unknown/.test(dto), 'Finance write DTO must not accept attachmentUrl from JSON bodies');

assert(
  !/attachmentName:\s*this\.text\(dto\.attachmentName\)/.test(service),
  'Finance receipt/payment data must not persist attachmentName from DTO',
);
assert(
  !/attachmentUrl:\s*this\.text\(dto\.attachmentUrl\)/.test(service),
  'Finance receipt/payment data must not persist attachmentUrl from DTO',
);

console.log('TEST_PHASE1_FINANCE_ATTACHMENT_CONTRACT_OK');
