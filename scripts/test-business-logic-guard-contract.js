const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, needle, message) {
  assert(source.includes(needle), `${message}\nMissing: ${needle}`);
}

function excludes(source, needle, message) {
  assert(!source.includes(needle), `${message}\nFound: ${needle}`);
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `${startNeedle} must exist`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `${endNeedle} must exist after ${startNeedle}`);
  return source.slice(start, end);
}

const quotations = read('apps/api/src/modules/quotations/quotations.service.ts');
const operations = read('apps/api/src/modules/operations/operations.service.ts');
const operationVouchers = read('apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts');
const orderLifecycle = read('apps/api/src/modules/orders/order-lifecycle.ts');
const orderAllotments = read('apps/api/src/modules/orders/order-allotment-sync.ts');
const suppliers = read('apps/api/src/modules/suppliers/suppliers.service.ts');

excludes(
  quotations,
  "this.assertStatus(status, ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'EXPIRED'], 'edit')",
  'Quotation update must not allow editing after submit while pending approval.',
);
includes(
  quotations,
  "this.assertStatus(status, ['DRAFT', 'REJECTED', 'EXPIRED'], 'edit')",
  'Quotation update should only allow draft, rejected, or expired quotations.',
);
includes(
  quotations,
  "this.assertStatus(current.status, ['APPROVED'], 'toggle smartlink')",
  'Quotation SmartLink should only be enabled for approved quotations.',
);
includes(
  quotations,
  'this.assertSmartLinkPublishable(current)',
  'Quotation SmartLink should reject expired approved quotations before publishing.',
);
assert(
  /if\s*\(enabled\)\s*{\s*this\.assertStatus\(current\.status,\s*\['APPROVED'\],\s*'toggle smartlink'\);\s*this\.assertSmartLinkPublishable\(current\);\s*}/.test(quotations),
  'Quotation SmartLink enable path should require approved non-expired quotations without blocking disable.',
);
includes(
  quotations,
  'if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === \'P2002\') throw new ConflictException',
  'Quotation convert should return a business conflict when generated order code already exists.',
);

includes(
  operations,
  "this.assertFormEditable(current, 'update')",
  'Operation form update must reject finalized or cancelled forms.',
);
includes(
  operations,
  'FOR UPDATE',
  'Operation form status changes should lock rows before transition checks.',
);

for (const needle of [
  'supplierId: true',
  'orderId: true',
  'tourId: true',
  'this.assertPaymentMatchesVoucher(payment, voucher)',
  'this.paymentScopeFromVoucher(voucher, user)',
]) {
  includes(operationVouchers, needle, 'Operation voucher payment reconciliation must validate finance payment links and scope.');
}

const operationVoucherUpdate = sliceBetween(operationVouchers, 'async update', '  async remove');
const operationVoucherRemove = sliceBetween(operationVouchers, 'async remove', '  async addPayment');

includes(
  operationVouchers,
  'private async lockVoucherForWrite',
  'Operation voucher write flows should have a row-lock helper for lifecycle checks.',
);
includes(
  operationVouchers,
  'FROM "OperationVoucher"',
  'Operation voucher write lock should target the OperationVoucher row.',
);
includes(
  operationVouchers,
  'FOR UPDATE',
  'Operation voucher write lock should use SELECT ... FOR UPDATE.',
);
includes(operationVoucherUpdate, 'this.lockVoucherForWrite(tx, id, user)', 'Operation voucher update must lock and re-read the voucher inside the transaction before edit checks.');
includes(operationVoucherRemove, 'this.lockVoucherForWrite(tx, id, user)', 'Operation voucher delete must lock and re-read the voucher inside the transaction before delete checks.');
includes(operationVoucherUpdate, "this.assertEditable(current, 'update')", 'Operation voucher update must check editability after acquiring the row lock.');
includes(operationVoucherRemove, "this.assertEditable(current, 'delete')", 'Operation voucher delete must check editability after acquiring the row lock.');

includes(
  operationVouchers,
  'new RegExp(`^${codePrefix}(\\\\d+)$`)',
  'Operation voucher payment code parser must match numeric suffixes when seeding CodeSequence from existing finance payment codes.',
);
excludes(
  operationVouchers,
  'new RegExp(`^${codePrefix}(\\d+)$`)',
  'Operation voucher payment code parser must not use a string-literal \d escape that becomes a literal d matcher.',
);
excludes(
  orderLifecycle,
  "CANCELLED: new Set(['CANCELLED', 'UPCOMING'])",
  'Cancelled orders must not be reopened through the generic status endpoint.',
);
excludes(
  orderLifecycle,
  "COMPLETED: new Set(['COMPLETED', 'UPCOMING', 'RUNNING', 'CANCELLED', 'SETTLED'])",
  'Completed orders must not be moved backward or cancelled through the generic status endpoint.',
);
includes(
  orderLifecycle,
  "COMPLETED: new Set(['COMPLETED', 'SETTLED'])",
  'Completed orders should only remain completed or be settled.',
);

const supplierUpdate = sliceBetween(suppliers, 'async updateSupplier(id: string', '  async deleteSupplier');
const supplierStatusUpdate = sliceBetween(suppliers, 'async updateSupplierStatus', '  async listTypedSuppliers');
const typedSupplierUpdate = sliceBetween(suppliers, 'async updateTypedSupplier', '  async updateTypedSupplierStatus');
const typedSupplierStatusUpdate = sliceBetween(suppliers, 'async updateTypedSupplierStatus', '  async deleteTypedSupplier');
const hotelSupplierUpdate = sliceBetween(suppliers, 'async updateHotelSupplier', '  async allotmentDashboard');
const supplierManualAllotmentLock = sliceBetween(suppliers, 'async lockAllotment', '  async confirmAllotmentAllocation');
const supplierDeleteRecord = sliceBetween(suppliers, 'private async deleteSupplierRecord', '  private async supplierUsage');

includes(
  suppliers,
  'private async lockSupplierForStatusWrite',
  'Supplier status/deactivation write flows should lock the supplier row before checking transitions and active allocations.',
);
includes(
  suppliers,
  'private async lockSupplierForAllotmentWrite',
  'Manual allotment lock should share the supplier row lock with supplier deactivation flows.',
);
includes(supplierUpdate, 'this.lockSupplierForStatusWrite(tx, id)', 'Generic supplier update must re-read and lock supplier status inside the transaction.');
includes(supplierStatusUpdate, 'this.lockSupplierForStatusWrite(tx, id)', 'Generic supplier status endpoint must lock supplier row before transition checks.');
includes(typedSupplierUpdate, 'this.lockSupplierForStatusWrite(tx, id)', 'Typed supplier update must re-read and lock supplier status inside the transaction.');
includes(typedSupplierStatusUpdate, 'this.lockSupplierForStatusWrite(tx, id)', 'Typed supplier status endpoint must lock supplier row before transition checks.');
includes(hotelSupplierUpdate, 'this.lockSupplierForStatusWrite(tx, id)', 'Hotel supplier update must re-read and lock supplier status inside the transaction.');
includes(supplierManualAllotmentLock, 'this.lockSupplierForAllotmentWrite(tx, current.supplierId)', 'Manual allotment lock must lock the owning supplier before reserving inventory.');
includes(supplierDeleteRecord, 'this.lockSupplierForStatusWrite(tx, id)', 'Supplier soft delete must lock the supplier row before usage checks.');
includes(supplierDeleteRecord, 'const usage = await this.supplierUsage(id)', 'Supplier soft delete must re-check usage after acquiring the supplier row lock.');
includes(
  orderAllotments,
  'lockSupplierForAutoAllotmentWrite(tx, allotment.supplierId)',
  'Order hotel auto-lock must lock the owning supplier before reserving allotment inventory.',
);
includes(
  orderAllotments,
  'supplier.status !== \'ACTIVE\' || supplier.deletedAt',
  'Order hotel auto-lock must reject inactive or soft-deleted suppliers after acquiring the supplier row lock.',
);


includes(
  orderAllotments,
  'UPDATE "SupplierAllotment"',
  'Order hotel auto-lock should reserve supplier allotment inventory atomically.',
);
includes(
  orderAllotments,
  '"bookedQty" + "lockedQty" + ${quantity} <= "allotmentQty"',
  'Order hotel auto-lock should only reserve when booked plus locked quantity still fits the allotment.',
);
excludes(
  orderAllotments,
  "tx.supplierAllotment.update({ where: { id: allotment.id }, data: { lockedQty: { increment: quantity } } })",
  'Order hotel auto-lock must not check capacity and increment lockedQty in separate statements.',
);

console.log('TEST_BUSINESS_LOGIC_GUARD_CONTRACT_OK');
