const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/operations/operations.service.ts', 'utf8');

function sliceBetween(startNeedle, endNeedle) {
  const start = service.indexOf(startNeedle);
  assert(start >= 0, `${startNeedle} must exist`);
  const end = service.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `${endNeedle} must exist after ${startNeedle}`);
  return service.slice(start, end);
}

function helperBody(name, nextName) {
  const start = service.indexOf(`private async ${name}`);
  assert(start !== -1, `OperationsService.${name} helper must exist`);
  const end = nextName ? service.indexOf(`  private async ${nextName}`, start + 1) : service.indexOf('\n  private ', start + 1);
  return service.slice(start, end === -1 ? service.length : end);
}

function indexOf(body, needle, message) {
  const index = body.indexOf(needle);
  assert(index !== -1, message);
  return index;
}

const createPaymentRequest = sliceBetween('async createPaymentRequest', '  async updatePaymentRequest');
const createTransactionIndex = indexOf(createPaymentRequest, 'this.prisma.$transaction(async (tx) => {', 'createPaymentRequest must open a transaction');
const createPreTransaction = createPaymentRequest.slice(0, createTransactionIndex);
assert(!createPreTransaction.includes('ensurePaymentItemsScoped(items, user)'), 'createPaymentRequest must not scope-check payment items before the transaction');
assert(!createPreTransaction.includes('paymentRequestCodeBranch(items, dto, user)'), 'createPaymentRequest must not derive code branch before the transaction');
const createFormLockIndex = indexOf(createPaymentRequest, 'lockPaymentItemOperationForms(tx, items)', 'createPaymentRequest must lock parent OperationForm rows for item costs');
const createCostLockIndex = indexOf(createPaymentRequest, 'lockPaymentItemCosts(tx, items)', 'createPaymentRequest must lock OperationCost rows');
const createScopeIndex = indexOf(createPaymentRequest, 'ensurePaymentItemsScoped(items, user, tx)', 'createPaymentRequest must scope-check payment items through the transaction client');
const createValidateIndex = indexOf(createPaymentRequest, 'validatePaymentItems(items, undefined, tx)', 'createPaymentRequest must validate payment items through the transaction client');
const createCodeBranchIndex = indexOf(createPaymentRequest, 'paymentRequestCodeBranch(items, dto, user, tx)', 'createPaymentRequest must derive code branch through the transaction client');
assert(createFormLockIndex > createTransactionIndex, 'createPaymentRequest form lock must run inside the transaction');
assert(createFormLockIndex < createCostLockIndex, 'createPaymentRequest must lock OperationForm rows before OperationCost rows');
assert(createCostLockIndex < createScopeIndex, 'createPaymentRequest must scope-check after cost locks');
assert(createScopeIndex < createValidateIndex, 'createPaymentRequest must validate after scoped item checks');
assert(createValidateIndex < createCodeBranchIndex, 'createPaymentRequest must derive code branch after locked item validation');

const updatePaymentRequest = sliceBetween('async updatePaymentRequest', '  submitPaymentRequest');
const updateTransactionIndex = indexOf(updatePaymentRequest, 'this.prisma.$transaction(async (tx) => {', 'updatePaymentRequest must open a transaction');
const updatePreTransaction = updatePaymentRequest.slice(0, updateTransactionIndex);
assert(!updatePreTransaction.includes('ensurePaymentItemsScoped(items, user)'), 'updatePaymentRequest must not scope-check replacement items before the transaction');
const updateRequestLockIndex = indexOf(updatePaymentRequest, 'lockSupplierPaymentRequest(tx, id)', 'updatePaymentRequest must lock the payment request first');
const updateFormLockIndex = indexOf(updatePaymentRequest, 'lockPaymentItemOperationForms(tx, items)', 'updatePaymentRequest must lock parent OperationForm rows for replacement items');
const updateCostLockIndex = indexOf(updatePaymentRequest, 'lockPaymentItemCosts(tx, items)', 'updatePaymentRequest must lock replacement OperationCost rows');
const updateScopeIndex = indexOf(updatePaymentRequest, 'ensurePaymentItemsScoped(items, user, tx)', 'updatePaymentRequest must scope-check replacement items through the transaction client');
const updateValidateIndex = indexOf(updatePaymentRequest, 'validatePaymentItems(items, id, tx)', 'updatePaymentRequest must validate replacement items through the transaction client');
assert(updateRequestLockIndex < updateFormLockIndex, 'updatePaymentRequest must lock request before replacement form rows');
assert(updateFormLockIndex < updateCostLockIndex, 'updatePaymentRequest must lock OperationForm rows before OperationCost rows');
assert(updateCostLockIndex < updateScopeIndex, 'updatePaymentRequest must scope-check after cost locks');
assert(updateScopeIndex < updateValidateIndex, 'updatePaymentRequest must validate after scoped item checks');

const changePaymentRequestStatus = sliceBetween('private async changePaymentRequestStatus', '  private async replaceFormChildren');
const submitFormLockIndex = indexOf(changePaymentRequestStatus, 'lockPaymentRequestOperationForms(tx, id)', 'submitPaymentRequest must lock request-linked OperationForm rows');
const detailIndex = indexOf(changePaymentRequestStatus, 'paymentRequestDetail(id, user, tx)', 'changePaymentRequestStatus must re-read scoped request detail');
assert(submitFormLockIndex < detailIndex, 'submitPaymentRequest must lock OperationForm rows before reading request detail and cancelled-form guards');

const itemFormLock = helperBody('lockPaymentItemOperationForms', 'lockPaymentRequestOperationForms');
assert(itemFormLock.includes('FROM "OperationForm"'), 'lockPaymentItemOperationForms must lock OperationForm rows');
assert(itemFormLock.includes('FROM "OperationCost"'), 'lockPaymentItemOperationForms must derive forms from OperationCost ids');
assert(itemFormLock.includes('ORDER BY "id"'), 'lockPaymentItemOperationForms must use deterministic form lock order');
assert(itemFormLock.includes('FOR UPDATE'), 'lockPaymentItemOperationForms must use SELECT ... FOR UPDATE');

const requestFormLock = helperBody('lockPaymentRequestOperationForms', 'lockPaymentItemCosts');
assert(requestFormLock.includes('FROM "OperationForm"'), 'lockPaymentRequestOperationForms must lock OperationForm rows');
assert(requestFormLock.includes('FROM "SupplierPaymentItem"'), 'lockPaymentRequestOperationForms must derive forms from SupplierPaymentItem rows');
assert(requestFormLock.includes('JOIN "OperationCost"'), 'lockPaymentRequestOperationForms must join through OperationCost rows');
assert(requestFormLock.includes('ORDER BY f."id"'), 'lockPaymentRequestOperationForms must use deterministic form lock order');
assert(requestFormLock.includes('FOR UPDATE'), 'lockPaymentRequestOperationForms must use SELECT ... FOR UPDATE');

const codeBranch = helperBody('paymentRequestCodeBranch', 'paymentItemsScope');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(codeBranch), 'paymentRequestCodeBranch must accept a Prisma client');
assert(codeBranch.includes('paymentItemsScope(items, client)'), 'paymentRequestCodeBranch must derive scope through the supplied client');

const itemsScope = helperBody('paymentItemsScope', 'ensurePaymentItemsScoped');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(itemsScope), 'paymentItemsScope must accept a Prisma client');
assert(itemsScope.includes('client.operationCost.findMany'), 'paymentItemsScope must read OperationCost through the supplied client');
assert(!itemsScope.includes('this.prisma.operationCost.findMany'), 'paymentItemsScope must not force root Prisma reads');

const ensureScoped = helperBody('ensurePaymentItemsScoped', 'assertScopedWriteUser');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(ensureScoped), 'ensurePaymentItemsScoped must accept a Prisma client');
assert(ensureScoped.includes('client.operationCost.count'), 'ensurePaymentItemsScoped must read OperationCost through the supplied client');
assert(!ensureScoped.includes('this.prisma.operationCost.count'), 'ensurePaymentItemsScoped must not force root Prisma reads');

console.log('TEST_OPERATION_PAYMENT_ITEM_FORM_LOCK_CONTRACT_OK');
