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

function methodSection(sourceText, startToken, endToken) {
  const start = sourceText.indexOf(startToken);
  assert(start >= 0, `${startToken} must exist in finance service`);
  const end = sourceText.indexOf(endToken, start);
  assert(end > start, `${endToken} must follow ${startToken}`);
  return sourceText.slice(start, end);
}

const financeFileGuardChecks = [
  { name: 'uploadReceiptFile', start: 'async uploadReceiptFile', end: 'async deleteReceiptFile', before: 'tx.financeReceipt.update(' },
  { name: 'deleteReceiptFile', start: 'async deleteReceiptFile', end: 'async createReceipt', before: 'tx.financeReceipt.update(' },
  { name: 'uploadPaymentFile', start: 'async uploadPaymentFile', end: 'async deletePaymentFile', before: 'tx.financePayment.update(' },
  { name: 'deletePaymentFile', start: 'async deletePaymentFile', end: 'async createPayment', before: 'tx.financePayment.update(' },
  { name: 'uploadInvoiceFile', start: 'async uploadInvoiceFile', end: 'async deleteInvoiceFile', before: 'tx.financeInvoiceFile.create(' },
  { name: 'deleteInvoiceFile', start: 'async deleteInvoiceFile', end: 'async createInvoice', before: 'tx.financeInvoiceFile.delete(' },
];

assert(!/assertCanUpdateFinanceEntity\(current, '[^']*\?/.test(service), 'Finance final-state guard labels must not contain mojibake placeholders');

for (const check of financeFileGuardChecks) {
  const section = methodSection(service, check.start, check.end);
  const guardMatch = section.match(/assertCanUpdateFinanceEntity\(current,\s*['\"][^'\"]+['\"]\)/);
  const guardIndex = guardMatch ? guardMatch.index : -1;
  const beforeIndex = section.indexOf(check.before);
  assert(guardIndex >= 0, `${check.name} must guard final-state finance entities before file changes`);
  assert(beforeIndex >= 0, `${check.name} must contain ${check.before}`);
  assert(guardIndex < beforeIndex, `${check.name} must guard final-state finance entities before ${check.before}`);
}

console.log('TEST_PHASE1_FINANCE_ATTACHMENT_CONTRACT_OK');
