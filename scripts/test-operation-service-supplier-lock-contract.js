const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/operations/operations.service.ts', 'utf8');

function methodBody(name) {
  const start = service.indexOf(`async ${name}`);
  assert(start !== -1, `OperationsService.${name} must exist`);
  const next = service.indexOf('\n  async ', start + 1);
  return service.slice(start, next === -1 ? service.length : next);
}

function helperBody(name, nextName) {
  const start = service.indexOf(`private async ${name}`);
  assert(start !== -1, `OperationsService.${name} helper must exist`);
  const end = nextName ? service.indexOf(`  private async ${nextName}`, start + 1) : service.indexOf('\n  private ', start + 1);
  return service.slice(start, end === -1 ? service.length : end);
}

function firstIndex(body, needle, message) {
  const index = body.indexOf(needle);
  assert(index !== -1, message);
  return index;
}

const createBody = methodBody('createForm');
const createTransactionIndex = firstIndex(createBody, 'this.prisma.$transaction(async (tx) => {', 'createForm must write inside a Prisma transaction');
const createPreTransaction = createBody.slice(0, createTransactionIndex);
assert(!createPreTransaction.includes("await this.validateFormPayload(dto, 'create');"), 'createForm must not validate service references before the write transaction');
const createValidateIndex = firstIndex(createBody, "await this.validateFormPayload(dto, 'create', tx)", 'createForm must validate payload through the transaction client');
const createWriteIndex = firstIndex(createBody, 'tx.operationForm.create', 'createForm must create OperationForm through the transaction client');
assert(createValidateIndex > createTransactionIndex, 'createForm validation must run inside the transaction');
assert(createValidateIndex < createWriteIndex, 'createForm must validate and lock service references before creating child rows');

const updateBody = methodBody('updateForm');
const updateTransactionIndex = firstIndex(updateBody, 'this.prisma.$transaction(async (tx) => {', 'updateForm must write inside a Prisma transaction');
const updatePreTransaction = updateBody.slice(0, updateTransactionIndex);
assert(!updatePreTransaction.includes("await this.validateFormPayload(dto, 'update');"), 'updateForm must not validate service references before the write transaction');
const updateLockIndex = firstIndex(updateBody, 'lockOperationFormForWrite(tx, id, user)', 'updateForm must lock and re-read the OperationForm before update guards');
const updateValidateIndex = firstIndex(updateBody, "await this.validateFormPayload(dto, 'update', tx)", 'updateForm must validate payload through the transaction client');
const updateReplaceIndex = firstIndex(updateBody, 'replaceFormChildren(tx, id, dto)', 'updateForm must replace children through the transaction client');
assert(updateValidateIndex > updateTransactionIndex, 'updateForm validation must run inside the transaction');
assert(updateValidateIndex > updateLockIndex, 'updateForm must validate service references after locking the OperationForm');
assert(updateValidateIndex < updateReplaceIndex, 'updateForm must validate and lock service references before replacing child rows');

const payloadValidation = helperBody('validateFormPayload', 'validateFormServices');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(payloadValidation), 'validateFormPayload must accept a Prisma client');
assert(/validateFormServices\(rows,\s*client\)/.test(payloadValidation), 'validateFormPayload must pass the transaction client to service validation');

const serviceValidation = helperBody('validateFormServices', 'ensureFormCostServiceLinks');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(serviceValidation), 'validateFormServices must accept a Prisma client');
assert(serviceValidation.includes('lockOperationServiceSuppliers(client, supplierIds)'), 'validateFormServices must lock referenced Supplier rows');
assert(serviceValidation.includes('lockOperationSupplierServices(client, serviceIds)'), 'validateFormServices must lock referenced SupplierService rows');
assert(serviceValidation.includes('client.tourItineraryDay.findMany'), 'validateFormServices must validate itinerary days through the supplied client');
assert(serviceValidation.includes('SupplierStatus.ACTIVE'), 'validateFormServices must reject inactive suppliers');
assert(serviceValidation.includes("service.status !== 'ACTIVE'"), 'validateFormServices must reject inactive supplier services');
assert(serviceValidation.includes('service.deletedAt'), 'validateFormServices must reject soft-deleted supplier services');

const supplierLock = helperBody('lockOperationServiceSuppliers', 'lockOperationSupplierServices');
assert(supplierLock.includes('FROM "Supplier"'), 'Supplier lock helper must query Supplier');
assert(supplierLock.includes('FOR UPDATE'), 'Supplier lock helper must use FOR UPDATE');
assert(supplierLock.includes('"deletedAt"'), 'Supplier lock helper must read deletedAt');
assert(supplierLock.includes('"status"'), 'Supplier lock helper must read status');

const supplierServiceLock = helperBody('lockOperationSupplierServices', 'ensureFormCostServiceLinks');
assert(supplierServiceLock.includes('FROM "SupplierService"'), 'SupplierService lock helper must query SupplierService');
assert(supplierServiceLock.includes('FOR UPDATE'), 'SupplierService lock helper must use FOR UPDATE');
assert(supplierServiceLock.includes('"supplierId"'), 'SupplierService lock helper must read supplierId');
assert(supplierServiceLock.includes('"deletedAt"'), 'SupplierService lock helper must read deletedAt');
assert(supplierServiceLock.includes('"status"'), 'SupplierService lock helper must read status');

console.log('TEST_OPERATION_SERVICE_SUPPLIER_LOCK_CONTRACT_OK');
