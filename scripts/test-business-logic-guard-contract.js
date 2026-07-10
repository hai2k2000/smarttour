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

const quotations = read('apps/api/src/modules/quotations/quotations.service.ts');
const operations = read('apps/api/src/modules/operations/operations.service.ts');
const operationVouchers = read('apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts');
const orderLifecycle = read('apps/api/src/modules/orders/order-lifecycle.ts');
const orderAllotments = read('apps/api/src/modules/orders/order-allotment-sync.ts');

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
includes(
  quotations,
  "if (enabled) {\n      this.assertStatus(current.status, ['APPROVED'], 'toggle smartlink');\n      this.assertSmartLinkPublishable(current);\n    }",
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
