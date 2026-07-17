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

const createBody = methodBody('createForm');
const createTransactionIndex = createBody.indexOf('this.prisma.$transaction(async (tx) => {');
assert(createTransactionIndex !== -1, 'createForm must write inside a Prisma transaction');
assert(createBody.indexOf('resolveBookingOrderTour') > createTransactionIndex, 'createForm must resolve booking/order/tour links inside the transaction');
assert(/lockBookingForOperationForm\(tx,\s*bookingId,\s*user\)/.test(createBody), 'createForm must lock the selected Booking inside the transaction');
assert(createBody.indexOf('lockBookingForOperationForm') < createBody.indexOf('resolveBookingOrderTour'), 'createForm must lock Booking before resolving order/tour links');
assert(
  /ensureLinksScoped\(\{ bookingId, orderId: links\.orderId, tourId: links\.tourId \},\s*user,\s*tx\)/.test(createBody),
  'createForm must scope-check links through the transaction client',
);
assert(/tx\.operationForm\.create/.test(createBody), 'createForm must create OperationForm through the transaction client');

const updateBody = methodBody('updateForm');
const updateTransactionIndex = updateBody.indexOf('this.prisma.$transaction(async (tx) => {');
assert(updateTransactionIndex !== -1, 'updateForm must write inside a Prisma transaction');
assert(/lockOperationFormForWrite\(tx,\s*id,\s*user\)/.test(updateBody), 'updateForm must lock and re-read the OperationForm inside the transaction');
assert(updateBody.indexOf('lockOperationFormForWrite') < updateBody.indexOf('assertFormEditable'), 'updateForm must run edit guards after the form row lock');
assert(/lockBookingForOperationForm\(tx,\s*bookingId,\s*user\)/.test(updateBody), 'updateForm must lock replacement Booking links inside the transaction');
assert(/resolveBookingOrderTour\(\{[\s\S]*\},\s*tx,\s*lockedBooking\)/.test(updateBody), 'updateForm must resolve replacement links through the transaction client and locked booking snapshot');
assert(
  /ensureLinksScoped\(\{ bookingId, orderId: links\.orderId, tourId: links\.tourId \},\s*user,\s*tx\)/.test(updateBody),
  'updateForm must scope-check replacement links through the transaction client',
);

const bookingLock = helperBody('lockBookingForOperationForm', 'lockOperationFormForWrite');
assert(bookingLock.includes('FROM "Booking"'), 'Booking operation-form lock must query Booking');
assert(bookingLock.includes('"deletedAt" IS NULL'), 'Booking operation-form lock must reject soft-deleted bookings');
assert(bookingLock.includes('FOR UPDATE'), 'Booking operation-form lock must use FOR UPDATE');
assert(/bookingScopeWhere\(\{ id: bookingId, deletedAt: null \},\s*user\)/.test(bookingLock), 'Booking operation-form lock must re-read through data scope');

const formLock = helperBody('lockOperationFormForWrite', 'resolveBookingOrderTour');
assert(formLock.includes('FROM "OperationForm"'), 'OperationForm update lock must query OperationForm');
assert(formLock.includes('FOR UPDATE'), 'OperationForm update lock must use FOR UPDATE');
assert(/formDetail\(id,\s*user,\s*tx\)/.test(formLock), 'OperationForm update lock must re-read scoped detail through the transaction client');

const resolveBody = helperBody('resolveBookingOrderTour', 'validateFormPayload');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(resolveBody), 'resolveBookingOrderTour must accept a Prisma client');
assert(resolveBody.includes('lockedBooking?'), 'resolveBookingOrderTour must accept a locked booking snapshot');
assert(resolveBody.includes('client.tour.findUnique'), 'resolveBookingOrderTour must read tours through the supplied client');
assert(resolveBody.includes('client.order.findUnique'), 'resolveBookingOrderTour must read orders through the supplied client');
assert(!resolveBody.includes('this.prisma.booking.findUnique'), 'resolveBookingOrderTour must not force a root-client booking read');

const scopeBody = helperBody('ensureLinksScoped', 'paymentRequestCodeBranch');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(scopeBody), 'ensureLinksScoped must accept a Prisma client');
assert(scopeBody.includes('client.booking.findFirst'), 'ensureLinksScoped must read Booking through the supplied client');
assert(scopeBody.includes('client.order.findFirst'), 'ensureLinksScoped must read Order through the supplied client');
assert(scopeBody.includes('client.tour.findFirst'), 'ensureLinksScoped must read Tour through the supplied client');

console.log('TEST_OPERATION_FORM_BOOKING_LOCK_CONTRACT_OK');
