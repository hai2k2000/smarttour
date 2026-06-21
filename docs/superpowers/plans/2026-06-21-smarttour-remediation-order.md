# SmartTour Remediation Order Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Keep each phase independently reviewable and verify before moving to the next phase.

**Goal:** Fix the reviewed SmartTour security, authorization, data integrity, business logic, frontend contract, and cleanup issues in risk-first order.

**Architecture:** SmartTour is a modular monolith with NestJS API modules, Prisma/PostgreSQL persistence, and a Next.js App Router admin dashboard. Backend service and database invariants are the source of truth; frontend changes follow backend contract changes.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js App Router, TypeScript, Docker-based deployment.

---

## Deployment Order Summary

1. Phase 1: Critical security and data integrity.
2. Phase 2: High-risk business logic, RBAC, and API lifecycle fixes.
3. Phase 3: Medium-risk frontend, API contract, tests, and edge-case hardening.
4. Phase 4: Refactor, performance, logging, and cleanup.

Do not start broad refactors before Phase 1 and Phase 2 have passing regression tests.

---

## Phase 1: Critical Security And Data Integrity

### Objective

Stop cross-scope data exposure, reduce session/PII leakage, and enforce financial/data integrity invariants before changing broader workflows.

### Implementation Order

1. Add/standardize data scope enforcement for tour guide records and guide files.
2. Split minimal session user response from full admin/user profile response.
3. Decide and implement cookie-only auth response for browser login, while preserving any intentional API/Bearer compatibility if still required by smoke scripts.
4. Add database-backed invariant for operation voucher payment linkage after auditing existing duplicate data.
5. Make quotation conversion concurrency-safe and idempotent.
6. Decide booking deletion policy, then implement soft delete/audit if bookings are business records.

### Files To Review/Modify

- `apps/api/src/modules/tour-guides/tour-guides.controller.ts`
- `apps/api/src/modules/tour-guides/tour-guides.service.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth-cookie.ts`
- `apps/api/src/modules/auth/auth-session.service.ts`
- `apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts`
- `apps/api/src/modules/quotations/quotations.service.ts`
- `apps/api/src/modules/bookings/bookings.service.ts`
- `prisma/schema.prisma`
- New Prisma migration under `prisma/migrations/*` if schema changes are needed.
- Frontend auth/API files under `apps/web/**/auth*`, `apps/web/**/api*`, and `apps/web/**/session*` if login response contract changes.

### Risks

- Tightening guide scope can hide data currently visible in demo/admin flows.
- Removing token from response can break frontend or smoke scripts that still read JSON token.
- Unique constraints can fail migration if production already has duplicate rows.
- Soft delete can require query filters across booking lists/details.

### Required Tests

- Auth login, `/auth/me`, logout, change-password, session revoke regression.
- Guide list/detail/update/remove/file access with all-scope, branch-scope, department-scope, and out-of-scope users.
- Operation voucher payment duplicate and concurrent add-payment regression.
- Quotation convert concurrent requests regression.
- Booking delete/soft-delete behavior regression.
- Migration dry-run or staging restore test before production deploy.

### Completion Criteria

- Users cannot access guide records or guide files outside permitted data scope.
- Browser session response no longer exposes unnecessary token/PII according to chosen contract.
- Operation voucher payment duplicate usage is blocked by service and database invariant where applicable.
- Quote conversion is idempotent or returns a clean business error under concurrency.
- Booking deletion behavior matches documented business retention policy.

---

## Phase 2: High Business Logic, RBAC, And API Lifecycle

### Objective

Prevent invalid state changes and business workflow bypasses in core operation modules.

### Implementation Order

1. Orders: reject `status` changes through normal update endpoints.
2. Orders: add explicit current-to-next transition matrix by order type.
3. Operation forms: reject `status` changes through normal update endpoints.
4. Operation forms: route all lifecycle changes through dedicated action services with reason/guard checks.
5. Quotations: make approved/converted quotations immutable or force revision/re-approval on material edits.
6. Bookings: preserve existing transition matrix and add regression coverage for invalid transitions and operation-form dependencies.
7. Review whether approval/settlement/unlock actions need separate permissions instead of broad manage permissions.

### Files To Review/Modify

- `apps/api/src/modules/orders/orders.controller.ts`
- `apps/api/src/modules/orders/orders.service.ts`
- `apps/api/src/modules/orders/order-data-mapper.ts`
- `apps/api/src/modules/orders/order-lifecycle.ts`
- `apps/api/src/modules/orders/dto/order.dto.ts`
- `apps/api/src/modules/operations/operations.controller.ts`
- `apps/api/src/modules/operations/operations.service.ts`
- `apps/api/src/modules/quotations/quotations.controller.ts`
- `apps/api/src/modules/quotations/quotations.service.ts`
- `apps/api/src/modules/bookings/bookings.service.ts`
- Frontend order, operation, quotation, and booking screens under `apps/web/**` that currently send status in update payloads.

### Risks

- Existing frontend forms may include `status` in update payloads and start receiving 400 responses.
- A too-strict transition matrix can block valid real-world operations.
- Quote immutability can require a visible revision UX if users currently edit after approval.

### Required Tests

- Order lifecycle unit tests for valid and invalid transitions.
- Order update integration test proving normal update cannot mutate status.
- Hotel booking allotment sync regression for status and settlement actions.
- Operation form update/cancel/done/submit/reject regression.
- Quotation approved-edit and convert regression.
- Booking status transition regression.
- Manual demo workflow: quote -> approve -> convert -> order -> booking/operation form -> payment request.

### Completion Criteria

- No normal update endpoint can bypass lifecycle action services.
- Invalid state transitions return clear 400 responses.
- Approved quote edits cannot silently alter approved commercial terms.
- Frontend uses action endpoints for lifecycle operations.

---

## Phase 3: Medium Frontend, API Contract, Tests, And Edge Cases

### Objective

Stabilize demo and user workflows after backend contracts are safe.

### Implementation Order

1. Update frontend API client/session handling to match the final auth contract.
2. Remove invalid `status` fields from normal update payloads and call action endpoints for lifecycle actions.
3. Align frontend form validation with backend DTO/business validation for orders, quotations, operations, bookings, and finance.
4. Add consistent loading, error, and empty states for key list/detail pages.
5. Standardize permission-based rendering while keeping backend as the final authorization layer.
6. Standardize data table search/filter/pagination with backend `take/skip` contracts.
7. Add confirmation modals for destructive or irreversible actions: delete, cancel, approve, settle, unlock, convert.

### Files To Review/Modify

- `apps/web/**/api*`
- `apps/web/**/auth*`
- `apps/web/**/providers/**`
- `apps/web/**/orders/**`
- `apps/web/**/quotations/**`
- `apps/web/**/operations/**`
- `apps/web/**/operation-vouchers/**`
- `apps/web/**/bookings/**`
- `apps/web/**/finance/**`
- Shared table, modal, form, permission, and hook components under `apps/web/**/components/**` and `apps/web/**/hooks/**`.

### Risks

- Frontend validation can drift from backend validation if duplicated manually.
- API client auth changes can affect every page at once.
- Permission rendering can hide valid actions if role mapping is incomplete.

### Required Tests

- Frontend build and available unit/component tests.
- Browser smoke: login, reload, logout, 401 handling, 403 handling.
- E2E/manual smoke for quotation, order, booking, operation form, operation voucher, finance receipt/payment.
- Responsive spot checks for main list/detail/action screens.
- Failed request UX checks for 400, 401, 403, 404, and 500 responses.

### Completion Criteria

- Reload preserves session correctly.
- Main demo workflow works without contract errors.
- Forms do not send invalid lifecycle fields in normal update requests.
- Key screens have stable loading/error/empty states.
- Users cannot accidentally trigger destructive actions without confirmation.

---

## Phase 4: Refactor, Performance, Logging, And Cleanup

### Objective

Reduce maintenance risk after core security and business correctness are fixed.

### Implementation Order

1. Replace high-risk `Record<string, unknown>` controller bodies with explicit DTO/schema validation, starting with auth, operations, finance, and customers.
2. Standardize action endpoint HTTP status codes with `@HttpCode(200)` or `204` where appropriate.
3. Standardize error response shape and validation messages.
4. Add structured logging and correlation IDs without logging passwords, tokens, or secrets.
5. Review and add database indexes for high-volume list/search endpoints based on actual query patterns.
6. Split oversized services only where tests already protect behavior.
7. Consider generated API client/shared schemas only after DTO contracts stabilize.

### Files To Review/Modify

- `apps/api/src/main.ts`
- `apps/api/src/validation-exception.factory.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/customers/customers.controller.ts`
- `apps/api/src/modules/finance/finance.controller.ts`
- `apps/api/src/modules/operations/operations.controller.ts`
- `apps/api/src/modules/**/dto/*.ts`
- Large service files under `apps/api/src/modules/**/**/*.service.ts`
- `prisma/schema.prisma` for index changes only when justified.
- Frontend API client files if contract generation is introduced.

### Risks

- DTO tightening can break existing frontend or import payloads that contain extra fields.
- Large refactors can introduce regressions if done before Phase 1-3 tests exist.
- Index changes can slow writes or require migration windows.

### Required Tests

- Full backend test suite.
- Full frontend build/test suite.
- OpenAPI/Swagger smoke if generated docs are used by the team.
- Performance smoke for customer, finance, order, booking, operation voucher, and report lists.
- Log review confirming no password, token, secret, or bank/identity value is logged unnecessarily.

### Completion Criteria

- Important controllers have explicit DTO/schema contracts.
- Action status codes are consistent.
- Errors are predictable for frontend handling.
- Logs are useful for debugging and safe for production.
- Refactors do not alter Phase 1-3 protected behavior.

---

## Execution Rule

Before implementing a phase, create or update tests for that phase first. Do not move to the next phase until the current phase has passing regression tests and a concise review note.
