# Supplier Deepening Design

## Context

SmartTour is prioritizing the operation core before broad CRM, SaaS, marketing, or AI work. Supplier management is one of the first-class operation modules and is already connected to orders, hotel allotments, operation vouchers, finance payments, supplier ledgers, supplier payment requests, quotations, tours, FIT services, files, and typed supplier screens.

The current supplier implementation has a usable base: typed supplier pages, hotel supplier pages, create/edit forms, soft delete guards, file metadata, service/contact replacement, hotel allotment handling, RBAC permissions, and several supplier contract/smoke scripts. The remaining work should deepen the module without breaking existing specialized supplier routes.

## Goals

Build supplier deepening in five phases, in this order:

1. Real supplier attachments.
2. Supplier import/export.
3. Supplier finance links.
4. Dedicated child-row APIs.
5. Supplier lifecycle UI.

Each phase must be useful on its own, covered by focused regression tests, and delivered through the existing Docker-based VPS verification path.

## Non-Goals

- Do not redesign the entire ERP shell.
- Do not add AI, forecasting, marketing automation, SaaS billing, or CRM expansion in this supplier effort.
- Do not replace the existing typed supplier screens with a new framework.
- Do not bypass existing RBAC/data-scope patterns.
- Do not remove existing bulk create/update supplier payloads until replacement child-row APIs are proven and callers are migrated.

## Phase 1: Real Supplier Attachments

Supplier attachments should become a reliable operational file workflow rather than a placeholder. The API should keep using the existing file service/storage path and supplier file metadata, while making the supplier-specific behavior explicit and testable.

Expected behavior:

- Users with `supplier.view` can see and download supplier files they are allowed to access.
- Users with `supplier.manage` can upload and delete supplier files.
- Upload validation uses the shared file limits and blocked MIME/extension rules.
- Metadata writes happen after a supplier row lock where needed, preserving the existing rollback behavior if metadata creation fails after object upload.
- Delete removes metadata and object storage consistently, with rollback/restore behavior matching the existing file service error-flow tests.
- The supplier UI shows current files, pending files, upload/delete busy states, clear Vietnamese errors, and disabled actions when permissions are missing.

Phase 1 intentionally does not add import/export or finance summaries.

## Phase 2: Supplier Import/Export

Supplier import/export should support business validation without forcing users to manually edit every supplier row in the UI.

Expected behavior:

- Export CSV and XLSX for supplier list data.
- Include typed supplier fields, contacts, services, and hotel-specific profile/allotment data where feasible.
- Keep CSV as the simplest interoperable format and XLSX as the business-friendly format.
- Add import preview/validation before write execution.
- Reject the whole import when any row has blocking validation errors.
- Reuse existing supplier DTO validation rules where practical.
- Preserve RBAC: export requires supplier export permission if introduced, otherwise `supplier.view`; import requires `supplier.manage`.

Hotel allotment import can be a distinct sub-step inside Phase 2 because allotment dates, capacities, and lock state are more sensitive than root supplier fields.

## Phase 3: Supplier Finance Links

Supplier screens should expose finance context without duplicating finance workflows.

Expected behavior:

- Show supplier debt/payment totals derived from existing finance/payment/ledger sources.
- Link to relevant finance payment, operation voucher, supplier payment request, and ledger detail screens when available.
- Keep write actions in Finance/Operations modules. Supplier should present a read-oriented operational summary plus navigation.
- Hide sensitive finance fields unless the current user has the existing finance permission used by supplier UI for financial fields.
- Avoid fake or cached debt numbers that can drift from Finance.

## Phase 4: Dedicated Child-Row APIs

Current supplier writes replace nested contacts/services/allotments through parent update payloads. That is workable for initial forms but risky as the module becomes more collaborative.

Expected behavior:

- Add focused CRUD endpoints for supplier contacts.
- Add focused CRUD endpoints for supplier services.
- Add focused CRUD endpoints for hotel allotments where the current override/lock flows do not already cover the write case.
- Use row locks and scoped re-reads for write paths that can race with supplier status changes, soft delete, hotel deactivation, or allotment allocations.
- Keep parent create/update payload compatibility during migration.
- Migrate UI row edits incrementally once endpoints are covered.

## Phase 5: Supplier Lifecycle UI

Supplier lifecycle actions should explain what is happening operationally instead of only surfacing generic API errors.

Expected behavior:

- Keep edit, delete, status, and deactivate actions visible only when permissions allow.
- Confirm destructive actions with supplier name and expected consequences.
- When delete/deactivate is blocked, show the usage reason returned by the API and guide the user to related modules.
- Refresh list and dependent inventory views after lifecycle actions.
- Preserve current soft-delete behavior: supplier delete marks the supplier inactive/deleted only when usage checks pass.
- Do not introduce hard delete from the UI.

## Architecture

Follow the existing modular monolith pattern:

- API code stays under `apps/api/src/modules/suppliers`.
- Shared export helpers can reuse `apps/api/src/common/csv-export.ts` and `apps/api/src/common/xlsx-workbook.ts`.
- Web code stays under `apps/web/app/suppliers`, including shared supplier UI helpers in `SupplierClientUi.tsx`.
- Tests stay in focused `scripts/test-suppliers-*` contracts and smoke scripts.
- Schema changes, if any, must use Prisma migrations.

Do not introduce broad abstractions before at least two supplier flows need them. Prefer small helper functions near the supplier module first.

## Data Flow

Supplier UI actions call supplier-specific API endpoints through `supplierApi`, which already wraps auth-aware fetch and response parsing. API services validate DTOs, enforce permissions through controllers, apply data scope where relevant, lock mutable supplier rows for lifecycle-sensitive writes, and write through Prisma transactions.

For files, object storage and metadata updates must remain coordinated. For import/export, parsing and validation should be isolated from write execution so tests can cover validation without mutating production data. For finance links, Supplier should read authoritative Finance/Operation data instead of storing duplicate totals.

## Permissions

Baseline permissions:

- `supplier.view`: supplier list/detail and allowed file reads.
- `supplier.manage`: supplier create/update/delete/status, file upload/delete, import writes, child-row writes.
- Existing finance permission used by supplier UI financial fields: financial totals and debt/payment links.

If a new supplier export permission is added, it must be added through migration, permission catalog, route guards, and role grants consistently.

## Error Handling

Errors should remain operational and Vietnamese in user-facing flows:

- Upload failures explain size/type/storage problems.
- Import failures identify row numbers and field names.
- Delete/deactivate conflicts preserve the API usage summary.
- Finance summaries fail closed: hide or show a clear unavailable state rather than presenting partial/fake totals.
- UI must not swallow failed file uploads after supplier save; it should keep the saved supplier editable and report that only file upload failed.

## Testing

Each phase needs targeted tests before implementation is considered complete:

- Source contracts for route usage, permissions, and UI behavior.
- Supplier service/API smoke coverage for write paths.
- File service error-flow coverage for attachment rollback.
- Import/export parser and endpoint smoke tests for CSV/XLSX.
- Finance link contracts that prove supplier totals come from authoritative finance/ledger data.
- Web client contracts for permission-gated UI actions and empty/loading/error states.

Verification should use the VPS/Docker path noted in Memory Bank. Avoid relying on host-level workspace binary resolution.

## Rollout

Deliver phase by phase. After each meaningful implementation phase:

- Run focused verification commands.
- Update `memory-bank/activeContext.md`.
- Update `memory-bank/progress.md`.
- Commit only the files belonging to the phase.
- Push to `origin`.
- Report commit hash, push status, and verification evidence.

## Open Decisions

Resolved for this plan:

- Work proceeds in order from Phase 1 to Phase 5.
- Phase 1 starts with supplier attachments.
- Supplier finance links remain read-oriented in Supplier; financial writes stay in Finance/Operations.
- Existing parent-level supplier write payloads remain supported during the child-row API migration.
