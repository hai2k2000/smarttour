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
const tourCore = read('apps/api/src/modules/tours/tour-core.service.ts');
const commonTours = read('apps/api/src/modules/tours/tours.service.ts');
const gitTours = read('apps/api/src/modules/git-tours/git-tours.service.ts');
const landTours = read('apps/api/src/modules/landtours/landtours.service.ts');
const fitTours = read('apps/api/src/modules/fit-tours/fit-tours.service.ts');
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
const operationVoucherAddPayment = sliceBetween(operationVouchers, 'async addPayment', '  async createPaymentVoucher');

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
  'private async lockFinancePaymentForVoucherRecording',
  'Operation voucher manual payment recording should lock FinancePayment through a named helper.',
);
includes(
  operationVoucherAddPayment,
  'await this.lockFinancePaymentForVoucherRecording(tx, paymentVoucherId)',
  'Operation voucher addPayment must lock the finance payment before locking the operation voucher.',
);
assert(
  operationVoucherAddPayment.indexOf('await this.lockFinancePaymentForVoucherRecording(tx, paymentVoucherId)') < operationVoucherAddPayment.indexOf('this.lockVoucherForPayment(tx, id, user)'),
  'Operation voucher addPayment must use FinancePayment -> OperationVoucher lock order to match finance approval/cancel reconciliation.',
);

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

includes(
  tourCore,
  'export function isTerminalTourStatus(status: TourStatus)',
  'TourCore update must identify terminal tour statuses for non-status write guards.',
);
includes(
  tourCore,
  'export function assertTourTerminalDataUpdateAllowed(currentStatus: TourStatus, dataFields: string[])',
  'TourCore terminal data edit guard should be shared by typed tour services.',
);
includes(
  tourCore,
  'const fieldsForTerminalGuard = guardFields || changedFields',
  'TourCore update must distinguish client-requested fields from server-applied write-scope fields.',
);
includes(
  tourCore,
  "const dataFields = fieldsForTerminalGuard.filter((field) => field !== 'status')",
  'TourCore update must distinguish lifecycle status changes from other data edits.',
);
includes(
  tourCore,
  'assertTourTerminalDataUpdateAllowed(current.status, dataFields)',
  'TourCore update must reject non-status data edits after terminal tour status.',
);
includes(
  commonTours,
  'const requestedFields = Object.keys(dto as Record<string, unknown>)',
  'Common tour updates should capture client-requested fields before write-scope stamping.',
);
includes(
  commonTours,
  'this.tourCore.updateRoot(tx, id, dto as Record<string, unknown>, { type: current.type }, user, requestedFields)',
  'Common tour updates should pass client-requested fields into TourCore terminal guards.',
);
for (const pair of [['GIT', gitTours], ['LandTour', landTours]]) {
  const label = pair[0];
  const moduleSource = pair[1];
  includes(moduleSource, 'const requestedFields = Object.keys(dto as Row)', label + ' updates should capture client-requested fields before write-scope stamping.');
  includes(moduleSource, 'assertTourTerminalDataUpdateAllowed(current.status, this.nonStatusFields(requestedFields))', label + ' updates should guard terminal detail edits using client-requested fields.');
  includes(moduleSource, 'private nonStatusFields(fields: string[])', label + ' terminal detail guard should operate on a field list, not the scope-stamped DTO.');
  includes(moduleSource, 'this.tourCore.updateRoot(tx, id, this.toTourRootDto(dto), this.tourConfig(), user, requestedFields)', label + ' updates should pass client-requested fields into TourCore terminal guards.');
}
includes(
  fitTours,
  'const requestedFields = Object.keys(dto as Row)',
  'FIT tour updates should capture client-requested fields before write-scope stamping.',
);
includes(
  fitTours,
  'requestedFields?: string[]',
  'FIT tour update options should carry client-requested fields into TourCore sync.',
);
includes(
  fitTours,
  'this.tourCore.updateRoot(tx, current.tourId, dto as unknown as Row, this.tourConfig(), user, guardFields)',
  'FIT tour root sync should pass client-requested fields into TourCore terminal guards.',
);
includes(
  tourCore,
  'Kh\\u00f4ng th\\u1ec3 ch\\u1ec9nh s\\u1eeda tour \\u0111\\u00e3 \\u1edf tr\\u1ea1ng th\\u00e1i cu\\u1ed1i',
  'TourCore terminal data edit guard should return a business-facing message.',
);

includes(
  tourCore,
  'async lockTourForWrite(',
  'TourCore write flows should share a row-lock helper for Tour root state.',
);
includes(
  tourCore,
  'FROM "Tour"',
  'TourCore write lock should target the Tour row.',
);
includes(
  tourCore,
  'AND "deletedAt" IS NULL',
  'TourCore write lock should avoid deleted Tour rows before lifecycle checks.',
);
includes(
  tourCore,
  'FOR UPDATE',
  'TourCore write lock should use SELECT ... FOR UPDATE.',
);
includes(
  tourCore,
  'async ensureTourDataWriteAllowed(',
  'TourCore child-row write flows should share locked terminal data-edit checks.',
);
const tourCoreUpdateRoot = sliceBetween(tourCore, 'async updateRoot', '  private ensureLifecycleUpdateAllowed');
includes(
  tourCoreUpdateRoot,
  'const current = await this.lockTourForWrite(tx, tourId, user, config.type)',
  'TourCore.updateRoot must lock and re-read the Tour before lifecycle/date guards.',
);
includes(
  tourCoreUpdateRoot,
  'this.ensureLifecycleUpdateAllowed(current, data as AnyRecord, guardFields)',
  'TourCore.updateRoot must run lifecycle and terminal data guards on the locked Tour snapshot.',
);
assert(
  tourCoreUpdateRoot.indexOf('lockTourForWrite(tx, tourId, user, config.type)') < tourCoreUpdateRoot.indexOf('ensureLifecycleUpdateAllowed(current'),
  'TourCore.updateRoot must acquire the Tour lock before lifecycle checks.',
);
const tourCoreSoftDelete = sliceBetween(tourCore, 'async softDelete', '  async close');
includes(tourCoreSoftDelete, 'const current = await this.lockTourForWrite(tx, tourId, user)', 'TourCore.softDelete must lock and re-read Tour state before cancelling.');
includes(tourCoreSoftDelete, 'assertTourLifecycleUpdateAllowed(current.status, TourStatus.CANCELLED)', 'TourCore.softDelete must reject cancelling terminal tours through lifecycle rules.');
const tourCoreClose = sliceBetween(tourCore, 'async close', '  async log(');
includes(tourCoreClose, 'const current = await this.lockTourForWrite(tx, tourId, user)', 'TourCore.close must lock and re-read Tour state before completion.');
includes(tourCoreClose, 'assertTourCloseAllowed(current.status)', 'TourCore.close must check close rules on the locked Tour snapshot.');
const tourCoreAddAttachment = sliceBetween(tourCore, 'async addAttachment', '  async replaceSurveys');
includes(tourCoreAddAttachment, "await this.ensureTourDataWriteAllowed(tx, tourId, user, type, ['attachments'])", 'Tour attachment writes must reject terminal Tour data edits after locking.');
const tourCoreCopyServices = sliceBetween(tourCore, 'async copyServicesFromTour', '  async copyServices(');
includes(tourCoreCopyServices, "await this.ensureTourDataWriteAllowed(tx, targetTourId, user, type, ['services'])", 'Tour service copy must reject terminal target Tour data edits after locking.');
includes(
  commonTours,
  'this.tourCore.close(tx, id, this.actor(user), dto?.note, user)',
  'Common Tour close should pass user scope into the locked TourCore close path.',
);
includes(
  commonTours,
  'this.tourCore.softDelete(tx, id, this.actor(user), undefined, user)',
  'Common Tour remove should pass user scope into the locked TourCore delete path.',
);
for (const pair of [['GIT', gitTours], ['LandTour', landTours]]) {
  const label = pair[0];
  const moduleSource = pair[1];
  includes(moduleSource, "this.tourCore.softDelete(tx, id, user?.username || user?.email || user?.id || 'system', undefined, user)", label + ' remove should pass user scope into the locked TourCore delete path.');
}
const fitAddAttachment = sliceBetween(fitTours, 'async uploadAttachment', '  async removeAttachment');
includes(fitAddAttachment, 'this.tourCore.addAttachment(tx, tourId, tourAttachment, user, TourType.FIT)', 'FIT attachment upload should pass user scope/type into locked TourCore attachment writes.');
const fitRemoveAttachment = sliceBetween(fitTours, 'async removeAttachment', '  async remove(');
includes(fitRemoveAttachment, "this.tourCore.ensureTourDataWriteAllowed(tx, tourId, user, TourType.FIT, ['attachments'])", 'FIT attachment delete should lock and guard terminal Tour state before metadata deletion.');
const fitReplaceServices = sliceBetween(fitTours, 'private async replaceFitTourServices', '  private tourConfig');
includes(fitReplaceServices, "this.tourCore.ensureTourDataWriteAllowed(tx, tourId, user, TourType.FIT, ['services'])", 'FIT copy budget/operation should lock and guard terminal target Tour before replacing services.');
includes(fitTours, 'this.tourCore.softDelete(tx, fitTour.tourId, this.actor(user), undefined, user)', 'FIT remove should pass user scope into the locked TourCore delete path.');

const supplierUpdate = sliceBetween(suppliers, 'async updateSupplier(id: string', '  async deleteSupplier');
const supplierStatusUpdate = sliceBetween(suppliers, 'async updateSupplierStatus', '  async listTypedSuppliers');
const typedSupplierUpdate = sliceBetween(suppliers, 'async updateTypedSupplier', '  async updateTypedSupplierStatus');
const typedSupplierStatusUpdate = sliceBetween(suppliers, 'async updateTypedSupplierStatus', '  async deleteTypedSupplier');
const hotelSupplierUpdate = sliceBetween(suppliers, 'async updateHotelSupplier', '  async allotmentDashboard');
const supplierManualAllotmentLock = sliceBetween(suppliers, 'async lockAllotment', '  async confirmAllotmentAllocation');
const supplierDeleteRecord = sliceBetween(suppliers, 'private async deleteSupplierRecord', '  private async supplierUsage');
const supplierUsage = sliceBetween(suppliers, 'private async supplierUsage', '  private usageSummary');

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
includes(supplierDeleteRecord, 'const usage = await this.supplierUsage(tx, id)', 'Supplier soft delete must re-check usage through the transaction client after acquiring the supplier row lock.');
excludes(supplierUsage, 'this.prisma.', 'Supplier usage checks during delete must use the transaction client, not the root Prisma client.');
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
