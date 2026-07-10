const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/bookings/bookings.service.ts', 'utf8');

function methodBody(name) {
  const start = service.indexOf(`async ${name}`);
  assert(start !== -1, `BookingsService.${name} must exist`);
  const next = service.indexOf('\n  async ', start + 1);
  return service.slice(start, next === -1 ? service.length : next);
}

const statusBody = methodBody('updateStatus');
assert(statusBody.includes('this.prisma.$transaction'), 'Booking status update must run in a transaction');
assert(statusBody.includes('FOR UPDATE'), 'Booking status update must lock the booking row with FOR UPDATE');
assert(/loadForMutation\(id,\s*user,\s*tx\)/.test(statusBody), 'Booking status update must reload current state inside the transaction');
assert(/tx\.booking\.update/.test(statusBody), 'Booking status update must write through the transaction client');

assert(service.includes('private async lockBookingForWrite'), 'BookingsService must expose a shared booking write lock helper');
const lockBody = service.slice(service.indexOf('private async lockBookingForWrite'));
assert(lockBody.includes('FOR UPDATE'), 'Booking write lock helper must lock the booking row with FOR UPDATE');
assert(/loadForMutation\(id,\s*user,\s*tx\)/.test(lockBody), 'Booking write lock helper must reload scoped state inside the transaction');

const updateBody = methodBody('update');
assert(updateBody.includes('this.prisma.$transaction'), 'Booking update must run in a transaction');
assert(/lockBookingForWrite\(tx,\s*id,\s*user\)/.test(updateBody), 'Booking update must lock and reload current state inside the transaction');
assert(
  /resolveBookingReferences\(dto,\s*user,\s*\{\s*creating:\s*false,\s*current\s*\},\s*tx\)/s.test(updateBody),
  'Booking update must resolve linked references through the same transaction client',
);
assert(
  /ensureOperationalDataEditAllowed\(current,\s*dto,\s*references\.values,\s*tx\)/.test(updateBody),
  'Booking update must check operation usage through the same transaction client after locking',
);
assert(/tx\.booking\.update/.test(updateBody), 'Booking update must write through the transaction client');

const removeBody = methodBody('remove');
assert(removeBody.includes('this.prisma.$transaction'), 'Booking remove must run in a transaction');
assert(/lockBookingForWrite\(tx,\s*id,\s*user\)/.test(removeBody), 'Booking remove must lock and reload current state inside the transaction');
assert(/ensureCanDelete\(booking\.id,\s*tx\)/.test(removeBody), 'Booking remove must check delete usage through the same transaction client after locking');
assert(/tx\.booking\.update/.test(removeBody), 'Booking remove must write through the transaction client');

console.log('TEST_PHASE2_BOOKING_STATUS_LOCK_CONTRACT_OK');