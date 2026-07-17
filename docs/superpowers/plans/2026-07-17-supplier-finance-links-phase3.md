# Supplier Finance Links Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only supplier finance summaries and navigation links from Supplier screens without duplicating Finance or Operations write workflows.

**Architecture:** Supplier remains global master data. Supplier API endpoints aggregate authoritative Finance/Operations records through Prisma, preserve data-scope filters on transaction rows, and require the existing `finance.payment.view` permission used by Supplier financial fields. The common Supplier list fetches summaries in one batch and renders totals plus links.

**Tech Stack:** NestJS, TypeScript strict, Prisma, Next.js App Router server page, existing RBAC/data-scope helpers, source/runtime contract scripts, Docker VPS verification.

---

## Scope

This implements Phase 3 from `docs/superpowers/specs/2026-07-16-supplier-deepening-design.md`.

It does not add finance writes from Supplier, cached debt columns, schema changes, child-row APIs, or lifecycle UI changes.

## File Structure

- Create: `scripts/test-suppliers-finance-links-contract.js` - source/runtime contract for routes, permissions, authoritative queries, data scope, and UI rendering.
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts` - add batch and detail finance routes before dynamic supplier routes.
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts` - add read-only finance summary aggregation from supplier ledger, finance payments, operation vouchers, and supplier payment requests.
- Modify: `apps/web/app/suppliers/page.tsx` - fetch finance summaries only with `finance.payment.view` and render operational totals/links.
- Modify: `memory-bank/activeContext.md`, `memory-bank/progress.md` - record Phase 3 status and remaining phases.

---

### Task 1: Supplier Finance Links Contract

**Files:**
- Create: `scripts/test-suppliers-finance-links-contract.js`

- [ ] **Step 1: Write the failing source/runtime contract**

Create a Node script that asserts:

```js
includes(controller, "@Get('finance-summaries')", 'Batch supplier finance route must exist.');
includes(controller, "@Get(':id/finance-summary')", 'Detail supplier finance route must exist.');
includes(controller, "@RequirePermissions('supplier.view', 'finance.payment.view')", 'Supplier finance routes must require supplier.view and finance.payment.view.');
before(controller, "@Get('finance-summaries')", "@Get(':routeKey')", 'Batch route must be before dynamic supplier route.');
before(controller, "@Get(':id/finance-summary')", "@Get(':type/:id')", 'Detail finance route must be before typed dynamic detail route.');
includes(service, 'listSupplierFinanceSummaries(ids', 'Batch finance summary service must exist.');
includes(service, 'supplierFinanceSummary(id', 'Detail finance summary service must exist.');
includes(service, 'branchDepartmentScopeWhere<Prisma.SupplierLedgerEntryWhereInput>', 'Ledger query must apply data scope.');
includes(service, 'branchDepartmentScopeWhere<Prisma.FinancePaymentWhereInput>', 'Payment query must apply data scope.');
includes(service, 'operationVoucherScopeWhere', 'Operation voucher links must apply operation scope.');
includes(service, 'supplierPaymentRequestScopeWhere', 'Payment request links must apply operation/finance scope.');
includes(service, 'supplierLedgerEntry.groupBy', 'Summary must derive payable/paid from SupplierLedgerEntry.');
includes(service, 'financePayment.groupBy', 'Summary must derive payment totals from FinancePayment.');
includes(service, 'operationVoucher.groupBy', 'Summary must derive voucher totals from OperationVoucher.');
includes(service, 'supplierPaymentItem.groupBy', 'Summary must derive request totals from SupplierPaymentItem.');
includes(page, '/suppliers/finance-summaries?ids=', 'Common Supplier page must fetch batch finance summaries.');
includes(page, 'supplierFinanceSummaryById', 'Common Supplier page must map summaries by supplier id.');
```

The runtime part should build `@smarttour/api`, instantiate `SuppliersService` with fake Prisma clients, and prove `payable`, `paid`, and `balance` come from `SupplierLedgerEntry` sums while branch/department scope values appear in ledger/payment query arguments. It should also prove users without `finance.payment.view` receive a missing-permission error.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-suppliers-finance-links-contract.js`

Expected: `FAIL_SUPPLIERS_FINANCE_LINKS_CONTRACT` because the new routes/service/UI do not exist yet.

---

### Task 2: Supplier Finance Summary API

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`

- [ ] **Step 1: Add controller routes before dynamic routes**

Add `GET /suppliers/finance-summaries?ids=a,b` and `GET /suppliers/:id/finance-summary`. Both routes require `@RequirePermissions('supplier.view', 'finance.payment.view')`.

- [ ] **Step 2: Add read-only aggregation service**

Add `listSupplierFinanceSummaries(ids, user)` and `supplierFinanceSummary(id, user)`. They reject users without `finance.payment.view`, cap batch ids at 100, verify suppliers are not deleted, use scoped `groupBy`/`findMany` calls for ledger, payments, vouchers, and payment requests, and return stable `financeLinksForSupplier(id)` paths.

- [ ] **Step 3: Verify API contract**

Run: `node scripts/test-suppliers-finance-links-contract.js`

Expected: source assertions for API pass; UI assertions may still fail until Task 3.

---

### Task 3: Common Supplier UI Finance Context

**Files:**
- Modify: `apps/web/app/suppliers/page.tsx`

- [ ] **Step 1: Fetch summaries in batch**

When `canViewSupplierFinancialFields` is true, call `apiGet<SupplierFinanceSummary[]>(/suppliers/finance-summaries?ids=...)` after suppliers load. Build `supplierFinanceSummaryById` with `new Map(summaryRows.map((row) => [row.supplierId, row]))`.

- [ ] **Step 2: Render operational finance summary**

In the existing finance note cell, show payable, paid, balance, and link buttons. Keep existing manual `debtNote`, `pricePolicy`, and `notes` below the real totals. Keep the hidden state for users without `finance.payment.view`.

- [ ] **Step 3: Verify UI contract**

Run: `node scripts/test-suppliers-finance-links-contract.js && node scripts/test-supplier-ui-permission-contract.js`

Expected: both scripts pass.

---

### Task 4: Verification, Memory Bank, Commit, Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node scripts/test-suppliers-finance-links-contract.js
node scripts/test-suppliers-sensitive-fields-contract.js
node scripts/test-suppliers-export-contract.js
node scripts/test-suppliers-import-contract.js
node scripts/test-supplier-ui-permission-contract.js
npm run lint --workspace @smarttour/api
git diff --check
```

- [ ] **Step 2: Update Memory Bank**

Record Phase 3 summary endpoints, authoritative ledger/payment/voucher/request source usage, permission behavior, UI batch rendering, and that Phase 4 child-row APIs remain next.

- [ ] **Step 3: Commit focused files**

Use explicit file paths only:

```bash
git add scripts/test-suppliers-finance-links-contract.js apps/api/src/modules/suppliers/suppliers.controller.ts apps/api/src/modules/suppliers/suppliers.service.ts apps/web/app/suppliers/page.tsx memory-bank/activeContext.md memory-bank/progress.md docs/superpowers/plans/2026-07-17-supplier-finance-links-phase3.md
git commit -m "feat: add supplier finance summaries"
```

- [ ] **Step 4: Merge, deploy, smoke, push**

After merging back to `/opt/smarttour`, run:

```bash
docker compose build api
docker compose up -d api
bash scripts/smoke-suppliers.sh
npm run ops:health
git push origin main
```
