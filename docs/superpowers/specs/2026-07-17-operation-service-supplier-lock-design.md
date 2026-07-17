# Operation Service Supplier Lock Design

## Context

Operation form create/update now locks Booking handoff state, but service child rows still validate Supplier and SupplierService references before the write transaction. `replaceFormChildren()` then creates `OperationService` rows inside the transaction from that earlier snapshot.

That leaves a race where a Supplier or SupplierService can be deactivated, soft-deleted, or relinked after validation but before operation services are written.

## Design

Keep routes, DTOs, UI behavior, and child payload shape unchanged. Tighten only backend write ordering:

- Move operation form payload validation for create/update into the existing Prisma write transactions.
- Keep operation form update edit guards after the `OperationForm` row lock.
- Validate service child rows through the transaction client.
- Lock referenced `Supplier` rows with `SELECT ... FOR UPDATE` and reject missing, soft-deleted, or inactive suppliers.
- Lock referenced `SupplierService` rows with `SELECT ... FOR UPDATE` and reject missing, soft-deleted, inactive, or wrong-supplier services.
- Keep itinerary day validation transaction-client aware.

## Boundaries

This change does not add operation-service CRUD endpoints, change payment request behavior, change operation cost rebinding, alter supplier lifecycle routes, or add schema migrations.

## Testing

Add a RED/GREEN source contract proving operation form create/update validates payloads inside transactions and that service validation locks Supplier/SupplierService rows before child writes. Then run existing operations controller/service flow coverage, payment request concurrency coverage, API lint/build, deploy, and healthcheck.
