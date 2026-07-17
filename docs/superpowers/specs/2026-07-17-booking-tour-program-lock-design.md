# Booking Tour Program Lock Design

## Context

Tour Programs are the reusable itinerary template for Bookings. `TourProgramsService` already locks the owning `TourProgram` row before changing duration or itinerary structure, and `BookingsService` rejects booking create/update when the selected tour program itinerary is incomplete.

The remaining race is on the Booking side: booking creation reads the tour program and then inserts the booking without holding the same `TourProgram` row lock. Booking update locks the `Booking` row, but changing `tourProgramId` still reads the new tour program without locking it. A concurrent itinerary structure change can pass its zero-booking guard before the booking write lands, leaving a booking attached to a tour program whose itinerary is no longer complete.

## Design

`BookingsService.create()` will run in a Prisma transaction. Inside that transaction it resolves references through the transaction client, locks the required `TourProgram` row with `SELECT ... FOR UPDATE`, verifies the itinerary completeness and booking date duration from the locked snapshot, then inserts the booking through `tx.booking.create`.

`BookingsService.update()` already runs in a transaction and locks the `Booking` row. When the update payload includes `tourProgramId`, it will lock that target `TourProgram` row before itinerary completeness and duration validation. If the payload does not change `tourProgramId`, it will continue to use the locked booking's current `tourProgram` snapshot.

## Boundaries

This change does not alter public DTOs, API routes, status workflow, data-scope rules, or UI behavior. It only tightens transactional ordering between Bookings and Tour Programs.

## Testing

Add a source contract for:

- booking create runs inside `this.prisma.$transaction`;
- booking create resolves references through `tx` before validation;
- booking create writes through `tx.booking.create`;
- `resolveBookingReferences()` calls a TourProgram lock before `ensureTourProgram()`;
- the lock helper uses `FOR UPDATE`;
- booking update still resolves references through the transaction client.

Run the new RED contract before implementation, then run it green with existing booking/tour-program contracts and the booking service smoke.
