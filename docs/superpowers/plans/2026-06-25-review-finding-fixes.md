# Review Finding Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the backend/API/database review findings in risk order while preserving SmartTour's operation-core workflows.

**Architecture:** Keep the NestJS modular monolith shape: focused controller contracts, service-level business guards, Prisma as source of truth, and shell/contract tests under `scripts/`. Avoid broad refactors; each task should make one behavior safer and verifiable.

**Tech Stack:** NestJS API, Prisma/PostgreSQL schema, TypeScript DTO validation with `class-validator`, shell/Node contract tests.

---

### Task 1: Align finance invoice enum contract

**Files:**
- Modify: `apps/api/src/modules/finance/dto/finance-body.dto.ts`
- Modify: `apps/api/src/modules/finance/finance.service.ts`
- Test: `scripts/test-finance-dto-contract.js`
- Test: `scripts/test-finance-helper-contracts.sh` or `scripts/test-finance-service-flows.sh`

- [x] Write/extend a failing contract that asserts finance invoice DTO/service enum values match Prisma `FinanceInvoiceType`: `VAT`, `NO_VAT`, `ADJUSTMENT`, `REPLACEMENT`.
- [x] Run the focused finance DTO/contract test and confirm it fails on `E_INVOICE`, `PROFORMA`, or `OTHER` still being accepted/defined.
- [x] Replace the body/service invoice enum lists with the Prisma-aligned values.
- [x] Run focused finance tests until green.

### Task 2: Reduce auth user PII exposure

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Test: `scripts/test-auth-management-data.sh` or `scripts/test-auth-management-data.js` if present

- [x] Write/extend a failing test proving `GET /auth/users` style payload does not expose `identityNo`, `bankAccountNumber`, `bankAccountName`, or `bankName`, while `GET /auth/me` can still return the current user's profile fields if expected by profile UI.
- [x] Split auth user serializers if needed: one for self/profile, one for management list responses.
- [x] Run auth management/session tests.

### Task 3: Tighten operations supplier-payment-request permissions

**Files:**
- Modify: `apps/api/src/modules/operations/operations.controller.ts`
- Test: `scripts/test-operations-controller-contract.sh`

- [x] Extend controller contract to require non-create permissions for update/delete/submit if permission vocabulary exists; otherwise standardize these endpoints to `operation.payment-request.manage`.
- [x] Run the contract and confirm the current controller fails the expected permission mapping.
- [x] Update decorators and permission registry/migration wiring; service logic unchanged.
- [x] Run operations controller/service tests.

### Task 4: Validate order-center query enums and dates

**Files:**
- Modify: `apps/api/src/modules/order-center/dto/order-center-query.dto.ts`
- Modify: `apps/api/src/modules/order-center/order-center.service.ts`
- Test: create or extend a contract script under `scripts/` for order-center query validation

- [x] Add a failing test for invalid `paymentStatus`, invalid `costStatus`, and invalid date strings returning validation errors rather than reaching Prisma with `as any` or `Invalid Date`.
- [x] Add DTO enum/date decorators and safe service date parsing.
- [x] Run the new contract plus any order-center/order tests.

### Task 5: Apply supplier file data scope consistently

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`
- Modify: `apps/api/src/modules/files/files.service.ts` only if supplier file root must enforce scope
- Test: `scripts/test-suppliers-file-contract.sh`

- [x] Add a failing contract that supplier file upload/delete passes `request.user` into service and uses a scoped supplier lookup.
- [x] Thread `RequestUser` through file methods and use a scoped `getSupplier`/where helper.
- [x] Run supplier file/common/sensitive-field tests.

### Task 6: Protect customer nested collection replacement semantics

**Files:**
- Modify: `apps/api/src/modules/customers/customers.service.ts`
- Modify: `apps/api/src/modules/customers/dto/customer-body.dto.ts` if API contract needs explicit full-replace marker
- Test: `scripts/test-customers-service.sh` and `scripts/test-customers-dto-contract.js`

- [x] Add a failing service test for accidental deletion of nested comments/call logs/care tasks when a partial customer update is intended.
- [x] Require explicit `replaceNestedCollections: true` for destructive nested replacement while preserving existing create behavior.
- [x] Run customer API/service tests.

### Task 7: Final verification, docs, commit, push

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [x] Run focused tests from all completed tasks.
- [x] Run broader smoke tests that fit the touched backend surface: operations and suppliers passed; `npm run smoke:files` remains blocked unless `ADMIN_PASSWORD` is exported.
- [x] Update Memory Bank with concise operational notes.
- [ ] Inspect `git diff` and `git status --short`.
- [ ] Commit only touched files and push to origin.
