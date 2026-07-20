# Operation Payment Item Form Lock Design

## Context

Operation form update/cancel paths now lock the `OperationForm` row before replacing costs or checking active supplier payment requests. Supplier payment request create/update still starts from cost ids, checks data scope before the write transaction, then locks `OperationCost` rows inside the transaction.

That leaves two related races:

- A payment request can validate against a cost/form snapshot while a concurrent operation form update/cancel is between its form lock and child checks.
- Operation form writes use the lock order `OperationForm -> OperationCost`, while payment request item writes only lock `OperationCost`, making coordination partial and exposing stale business errors.

## Design

Keep routes, DTOs, statuses, and UI behavior unchanged. Tighten only backend write ordering:

- For payment request create/update when items are supplied, enter the existing Prisma transaction first.
- Lock referenced parent `OperationForm` rows in deterministic id order from the supplied `OperationCost` ids.
- Then lock the referenced `OperationCost` rows, preserving the existing child lock.
- Run payment item data-scope checks, duplicate checks, amount checks, and code-branch derivation through the same transaction client after the form lock.
- When submitting a supplier payment request to `REQUESTED`, lock the operation forms referenced by the request items before re-reading request detail and checking cancelled-form guards.

## Boundaries

This change does not alter supplier payment request workflow rules, finance payment generation, supplier ledger posting, cost replacement semantics, or database schema.

## Testing

Add a RED/GREEN source contract proving payment request item flows lock `OperationForm` before `OperationCost`, move item scope/branch reads into the transaction, and lock request-linked forms before submit checks. Then run existing operation payment concurrency, operation form, controller, service-flow, API lint/build, deploy, and healthcheck verification.
