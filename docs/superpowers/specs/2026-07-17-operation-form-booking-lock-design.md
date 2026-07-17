# Operation Form Booking Lock Design

## Context

Bookings already lock their own row before data edits, status changes, and soft deletion. Operation forms are the next handoff step, but `OperationsService.createForm()` currently resolves the Booking/Order/Tour links and data scope before the write transaction, then inserts the `OperationForm` later. `updateForm()` has the same pre-transaction snapshot pattern for existing form state and replacement Booking links.

This leaves a race where Booking delete/update can pass its operational usage checks while an operation form is being created from a stale booking snapshot.

## Design

Keep public API routes and UI behavior unchanged. Tighten only backend write ordering:

- `createForm()` validates payload shape first, then starts a transaction.
- Inside the transaction, it locks the selected `Booking` row with `SELECT ... FOR UPDATE` and `deletedAt IS NULL`.
- It re-reads the booking through existing data-scope rules, resolves order/tour links through the transaction client, checks link scope through the transaction client, and creates the operation form plus children.
- `updateForm()` locks the `OperationForm` row, re-reads it through scoped `formDetail()`, and runs edit guards after the lock.
- If an update changes `bookingId`, it locks the replacement Booking row before resolving replacement order/tour links and writing the form.

## Boundaries

This change does not alter DTOs, routes, permission names, UI copy, status workflow, payment request behavior, or operation child payload semantics.

## Testing

Add a source contract proving create/update form write paths acquire the expected row locks inside transactions and that scoped link checks use transaction clients. Then run existing operations controller and service flow suites, plus API lint/build and production healthcheck after deploy.
