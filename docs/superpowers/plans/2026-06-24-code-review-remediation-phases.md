# Code Review Remediation Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining backend/API/database review findings in risk order without reopening already-remediated review items.

**Architecture:** Keep SmartTour as a NestJS modular monolith with Prisma/PostgreSQL, using DTO validation at controller boundaries, service-level RBAC/data-scope checks, and database constraints for data integrity. Each phase should be implemented with tests first, then small focused fixes, then regression verification.

**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL, MinIO, Next.js App Router, Docker Compose.

---

## Scope Notes

- `docs/code-review-2026-06-13.md` says all original High/Medium/Low review findings were remediated by 2026-06-23.
- This plan only tracks the open/new READ-ONLY findings from the 2026-06-24 backend/API/database review.
- Do not refactor broad services before Phase 1 and Phase 2 behavior is protected by regression tests.
- After implementation work, follow `AGENTS.md`: update Memory Bank, verify, commit focused files, and push.

## Phase Summary

| Phase | Mục tiêu | Việc cần làm | File liên quan | Test cần chạy | Tiêu chí hoàn thành |
|---|---|---|---|---|---|
| Phase 1: Critical/security/data integrity | Chặn auth enumeration/bruteforce, sửa audit reject tài chính, validate DB constraints | 1. Login trả lỗi chung và có rate-limit/backoff. 2. Reject receipt/payment/invoice ghi `rejectedBy/rejectedAt`. 3. Cleanup/backfill dữ liệu và validate constraints `NOT VALID`. | `apps/api/src/modules/auth/auth.service.ts`; `apps/api/src/modules/auth/auth.controller.ts`; `apps/api/src/modules/finance/finance.service.ts`; `apps/api/src/modules/finance/finance-final-state.ts`; `prisma/migrations/*`; migration mới. | Auth invalid credentials/rate-limit; finance reject receipt/payment/invoice; DB `pg_constraint.convalidated=false`; API typecheck; finance regression. | Không còn user enumeration; brute-force bị throttle; reject audit đúng; DB constraints được validate hoặc có ngoại lệ documented. |
| Phase 2: High/business logic/RBAC/API | Siết RBAC/API với dữ liệu nhạy cảm và public exposure | 1. Mask/tách quyền supplier financial fields. 2. SmartLink public enforce expiry/status. 3. Validate finance query enums. 4. Chặn orphan generic file upload. | `suppliers.controller.ts`; `suppliers.service.ts`; `quotations.controller.ts`; `quotations.service.ts`; `finance-query.dto.ts`; `finance.service.ts`; `files.controller.ts`; `files.service.ts`. | Supplier RBAC/masking; SmartLink expired; finance query 400; files scope/orphan; `npm run smoke:files`. | User thiếu quyền không thấy bank/tax/debt; SmartLink expired không public; query sai trả 400; không tạo orphan object. |
| Phase 3: Medium/frontend/test/edge case | Đồng bộ UI/error/test để tránh hồi quy | 1. UI supplier/auth/finance theo API mới. 2. Chuẩn hóa non-HTTP/Prisma error response. 3. Thêm edge-case regression scripts. | `apps/web/**`; `apps/api/src/http-error-response.filter.ts`; `apps/api/src/request-logging.interceptor.ts`; `apps/api/src/main.ts`; `scripts/*`. | Web build/typecheck; API error/OpenAPI/correlation smoke; healthcheck; all Phase 1-2 tests. | UI không crash; login UX an toàn; lỗi 500 sanitized; có regression coverage cho edge cases chính. |
| Phase 4: Refactor/performance/cleanup | Dọn kỹ thuật sau khi behavior đã ổn định | 1. Helper chung cho enum/query validation. 2. Helper supplier projection/masking. 3. Tách file authorization strategy. 4. Dry-run và cleanup orphan storage. 5. Runbook DB/storage cleanup. | Finance/report DTO helpers; `suppliers.service.ts`; `files.service.ts`; cleanup scripts; docs/runbooks. | Full auth/finance/reports/suppliers/files/quotations contracts; storage cleanup dry-run; production healthcheck/security audit. | Không đổi behavior ngoài test; service dễ đọc hơn; orphan cleanup có audit trail; docs cập nhật. |

---

## Phase 1: Critical / Security / Data Integrity

### Objective

Remove public authentication enumeration/bruteforce risk, fix finance reject audit correctness, and close database integrity gaps caused by unvalidated constraints.

### Files

- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify or add: auth rate-limit guard/interceptor/provider under `apps/api/src/modules/auth/`
- Modify: `apps/api/src/modules/finance/finance.service.ts`
- Review: `apps/api/src/modules/finance/finance-final-state.ts`
- Add: `prisma/migrations/<timestamp>_validate_legacy_constraints/migration.sql`
- Add or modify test scripts under `scripts/`

### Order

- [ ] Write auth tests proving current behavior leaks user existence:
  - nonexistent identifier and wrong-password existing identifier must currently produce different responses.
  - repeated login attempts must currently not throttle.
- [ ] Change login failure behavior:
  - return one `401` message such as `Thông tin đăng nhập không hợp lệ`.
  - keep server-side audit sanitized: identifier hash or normalized identifier, no password/token.
- [ ] Add login rate-limit/backoff:
  - key by IP plus normalized identifier.
  - keep bootstrap/logout behavior unaffected.
- [ ] Write finance reject tests:
  - receipt reject sets `approvalStatus=REJECTED`, `rejectedBy`, `rejectedAt`.
  - payment reject sets `approvalStatus=REJECTED`, `rejectedBy`, `rejectedAt`.
  - invoice reject sets `status=REJECTED`, `approvalStatus=REJECTED`, `rejectedBy`, `rejectedAt`.
  - none of these reject paths should set new `approvedBy/approvedAt`.
- [ ] Fix finance reject implementations.
- [ ] Add DB audit script/query for existing `NOT VALID` constraints:
  - `SELECT conname FROM pg_constraint WHERE convalidated = false;`
  - add data checks for non-negative amounts and FK orphan rows before validation.
- [ ] Add migration to cleanup/backfill violating rows and `VALIDATE CONSTRAINT`.
- [ ] Run verification on staging before production deploy.

### Risks

- Login UX changes can confuse users if frontend still displays old messages.
- Rate-limit can lock out legitimate users if thresholds are too aggressive.
- Finance reject audit changes affect reporting fields and existing data interpretation.
- Constraint validation can fail production deploy if legacy data violates checks.

### Tests

Run after Phase 1 implementation:

```bash
npm run typecheck --workspace apps/api
node scripts/test-auth-login-security-contract.js
node scripts/test-finance-reject-audit-contract.js
bash scripts/test-finance-helper-contracts.sh
npx prisma migrate deploy
node scripts/test-db-constraint-validation-contract.js
```

Expected:

- invalid login cases return same `401` body.
- repeated login attempts hit throttle/backoff.
- finance reject tests pass for receipt/payment/invoice.
- no unvalidated constraints remain unless explicitly documented.

### Completion Criteria

- Auth enumeration and brute-force findings are fixed.
- Finance reject audit is semantically correct.
- Legacy DB constraints are validated or blocked by a documented data-cleanup issue.
- Phase 1 tests pass locally/staging.

---

## Phase 2: High / Business Logic / RBAC / API

### Objective

Protect sensitive supplier data, fix public quotation expiry behavior, validate finance query enums, and prevent orphan file uploads.

### Files

- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`
- Modify or add: supplier response projection/masking helper under `apps/api/src/modules/suppliers/`
- Modify: `apps/api/src/modules/quotations/quotations.controller.ts`
- Modify: `apps/api/src/modules/quotations/quotations.service.ts`
- Modify: `apps/api/src/modules/finance/dto/finance-query.dto.ts`
- Modify: `apps/api/src/modules/finance/finance.service.ts`
- Modify: `apps/api/src/modules/files/files.controller.ts`
- Modify: `apps/api/src/modules/files/files.service.ts`
- Modify tests under `scripts/`

### Order

- [ ] Decide supplier sensitive-field policy:
  - `supplier.view` may see normal supplier profile.
  - `supplier.financial.view` or `finance.payment.view` is required for `taxCode`, `bankAccountName`, `bankAccountNumber`, `bankName`, `debtNote`, `pricePolicy`, and hotel profile bank fields.
- [ ] Write supplier masking/RBAC tests for list and detail.
- [ ] Pass `request.user` from supplier list/detail/hotel detail endpoints where masking decisions need permissions.
- [ ] Implement supplier projection/masking in service responses.
- [ ] Write SmartLink expired/status tests:
  - expired quotation public link returns 404 or 410.
  - disabled link returns 404.
  - valid enabled non-expired link returns public payload only.
- [ ] Update SmartLink enable/public detail rules.
- [ ] Write finance query validation tests:
  - invalid `status`, `receiptType`, `voucherType`, `invoiceType`, `paymentMethod`, `entryType` return 400.
  - valid values still filter correctly.
- [ ] Add DTO `@IsIn` or endpoint-specific validation for finance query fields.
- [ ] Write file upload orphan tests:
  - generic upload with invalid root/entity fails before MinIO write.
  - entity-specific upload still works.
- [ ] Restrict or validate `/files/upload` scope before `putObject`.

### Risks

- Supplier UI may currently expect bank/tax fields in list responses.
- SmartLink expiry can affect links already sent to customers.
- Finance filters may reveal frontend sending outdated enum values.
- File upload change can break screens using generic upload before metadata creation.

### Tests

Run after Phase 2 implementation:

```bash
node scripts/test-suppliers-sensitive-fields-contract.js
node scripts/test-quotations-smartlink-expiry-contract.js
node scripts/test-finance-query-validation-contract.js
npm run smoke:files
bash scripts/smoke-quotes-quotations.sh
```

Expected:

- supplier financial fields are hidden without the new/required permission.
- expired SmartLinks are not public.
- invalid finance query values return structured 400.
- file upload cannot create orphan objects through fake scope.

### Completion Criteria

- Sensitive supplier fields have explicit permission semantics.
- SmartLink public behavior matches expiry/status rules.
- Finance query validation is deterministic and returns 400 on bad input.
- Generic file upload cannot create inaccessible orphan objects.

---

## Phase 3: Medium / Frontend / Test / Edge Case

### Objective

Update frontend and runtime error behavior so the backend hardening from Phase 1-2 is usable, observable, and regression-safe.

### Files

- Modify: relevant supplier/auth/finance UI files under `apps/web/`
- Modify: `apps/api/src/http-error-response.filter.ts`
- Modify: `apps/api/src/request-logging.interceptor.ts`
- Review: `apps/api/src/main.ts`
- Add or update smoke/contract scripts under `scripts/`
- Update: `memory-bank/activeContext.md`
- Update: `memory-bank/progress.md`

### Order

- [ ] Update auth UI:
  - display generic invalid-credentials message.
  - handle rate-limit response without exposing internals.
- [ ] Update supplier UI:
  - hide bank/tax/debt columns when fields are absent.
  - show privileged fields only when permission allows.
- [ ] Update finance UI filters if enum validation reveals outdated values.
- [ ] Extend global error handling:
  - normalize unknown/Prisma errors into the standard error shape.
  - keep response sanitized.
  - log correlationId, error name/code, stack server-side only.
  - do not log password/token/authorization/cookie/body secrets.
- [ ] Add regression scripts covering:
  - auth generic error and throttle.
  - supplier masked response rendering.
  - finance invalid query 400.
  - unknown/Prisma error shape.
  - SmartLink expired public behavior.
- [ ] Update Memory Bank after changes.

### Risks

- UI may need permission plumbing if current hooks do not expose new supplier financial permission.
- Error filter changes can affect existing smoke tests that assert exact response shape.
- Logging changes must avoid secret leakage.

### Tests

Run after Phase 3 implementation:

```bash
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
node scripts/test-error-response-contract.js
node scripts/test-request-logging-sanitization-contract.js
node scripts/test-supplier-ui-permission-contract.js
bash scripts/healthcheck.sh
```

Expected:

- frontend builds and handles masked fields.
- unknown errors return the same structured shape as HTTP errors.
- logs include useful debug metadata without secrets.

### Completion Criteria

- Frontend works with hardened backend responses.
- Runtime errors are consistent and sanitized.
- Phase 1-2 edge cases have regression coverage.
- Memory Bank records the completed remediation.

---

## Phase 4: Refactor / Performance / Cleanup

### Objective

Clean up duplicated validation/projection logic and operational residue after behavior is protected by tests.

### Files

- Modify or add finance/report query validation helper under `apps/api/src/modules/`
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`
- Add supplier projection helper under `apps/api/src/modules/suppliers/`
- Modify: `apps/api/src/modules/files/files.service.ts`
- Add optional storage cleanup script under `scripts/`
- Update docs/runbooks under `docs/`
- Update Memory Bank.

### Order

- [ ] Extract shared enum/query validation helper only after Phase 2 tests pass.
- [ ] Extract supplier sensitive-field projection helper and keep response snapshots stable.
- [ ] Refactor `FilesService.assertObjectAccess()` into root-specific strategy functions or a dispatch map without changing authorization behavior.
- [ ] Add orphan object audit script:
  - dry-run by default.
  - list object key, inferred root/entity, reason orphaned.
  - require explicit flag to delete.
- [ ] Run orphan audit in dry-run and save evidence.
- [ ] Update DB/storage cleanup runbooks.
- [ ] Update Memory Bank and final verification notes.

### Risks

- Refactoring large services can accidentally change behavior if tests are incomplete.
- Storage cleanup can delete valid files if metadata matching is wrong.
- Shared validation helper can over-generalize endpoint-specific rules.

### Tests

Run after Phase 4 implementation:

```bash
npm run typecheck --workspace apps/api
node scripts/test-finance-query-validation-contract.js
node scripts/test-report-query-validation.sh
node scripts/test-suppliers-sensitive-fields-contract.js
npm run smoke:files
node scripts/audit-orphan-files.js --dry-run
bash scripts/healthcheck.sh
bash scripts/security-audit.sh
```

Expected:

- no behavior changes outside already-tested contracts.
- orphan audit is dry-run safe and produces actionable output.
- healthcheck and security audit still pass.

### Completion Criteria

- Validation/projection/file authorization code is easier to maintain.
- Orphan storage has an auditable cleanup path.
- Docs and Memory Bank reflect the final state.
- Full regression suite for touched modules passes.

---

## Implementation Checklist

- [ ] Start Phase 1 only.
- [ ] Write failing tests before each fix.
- [ ] Make focused implementation changes.
- [ ] Run phase-specific verification.
- [ ] Update Memory Bank.
- [ ] Commit and push focused changes.
- [ ] Request review before moving to the next phase.
- [ ] Repeat for Phase 2, Phase 3, then Phase 4.
