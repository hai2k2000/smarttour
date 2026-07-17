const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/bookings/bookings.service.ts', 'utf8');

function methodBody(name) {
  const start = service.indexOf(`async ${name}`);
  assert(start !== -1, `BookingsService.${name} must exist`);
  const next = service.indexOf('\n  async ', start + 1);
  return service.slice(start, next === -1 ? service.length : next);
}

const createBody = methodBody('create');
assert(createBody.includes('this.prisma.$transaction(async (tx) => {'), 'Booking create must run inside a Prisma transaction');
assert(
  /resolveBookingReferences\(dto,\s*user,\s*\{\s*creating:\s*true\s*\},\s*tx\)/s.test(createBody),
  'Booking create must resolve references through the transaction client',
);
assert(/tx\.booking\.create/.test(createBody), 'Booking create must write through tx.booking.create');

const resolveStart = service.indexOf('private async resolveBookingReferences');
const resolveEnd = service.indexOf('  private normalizedBookingReferences');
assert(resolveStart !== -1 && resolveEnd !== -1, 'BookingsService.resolveBookingReferences block must exist');
const resolveBody = service.slice(resolveStart, resolveEnd);
assert(
  /lockTourProgramForBooking\(values\.tourProgramId,\s*client\)/.test(resolveBody),
  'Booking reference resolution must lock the target TourProgram before reading itinerary',
);
assert(
  resolveBody.indexOf('lockTourProgramForBooking') < resolveBody.indexOf('ensureTourProgram'),
  'TourProgram lock must happen before itinerary completeness validation',
);

const lockStart = service.indexOf('private async lockTourProgramForBooking');
const lockEnd = service.indexOf('  private async ensureTourProgram');
assert(lockStart !== -1 && lockEnd !== -1, 'BookingsService.lockTourProgramForBooking block must exist');
const lockBody = service.slice(lockStart, lockEnd);
assert(lockBody.includes('FOR UPDATE'), 'TourProgram booking lock helper must use FOR UPDATE');
assert(/client:\s*Prisma\.TransactionClient/.test(lockBody), 'TourProgram booking lock helper must require a transaction client');

const updateBody = methodBody('update');
assert(
  /resolveBookingReferences\(dto,\s*user,\s*\{\s*creating:\s*false,\s*current\s*\},\s*tx\)/s.test(updateBody),
  'Booking update must continue resolving references through the transaction client',
);

console.log('TEST_BOOKING_TOUR_PROGRAM_LOCK_CONTRACT_OK');
