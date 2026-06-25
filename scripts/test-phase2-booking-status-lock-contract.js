const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/bookings/bookings.service.ts', 'utf8');
const start = service.indexOf('async updateStatus');
assert(start !== -1, 'BookingsService.updateStatus must exist');
const next = service.indexOf('\n  async ', start + 1);
const body = service.slice(start, next === -1 ? service.length : next);

assert(body.includes('this.prisma.$transaction'), 'Booking status update must run in a transaction');
assert(body.includes('FOR UPDATE'), 'Booking status update must lock the booking row with FOR UPDATE');
assert(/loadForMutation\(id,\s*user,\s*tx\)/.test(body), 'Booking status update must reload current state inside the transaction');
assert(/tx\.booking\.update/.test(body), 'Booking status update must write through the transaction client');

console.log('TEST_PHASE2_BOOKING_STATUS_LOCK_CONTRACT_OK');
