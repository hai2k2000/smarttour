# Operation Payment Item Form Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coordinate supplier payment request item writes with operation form cost replacement/cancel writes by locking parent OperationForm rows first.

**Architecture:** Add focused helpers in `OperationsService` to lock OperationForm rows derived from either payment item cost ids or an existing SupplierPaymentRequest. Move item data-scope and code-branch reads into the existing Prisma transactions and keep the lock order `OperationForm -> OperationCost`.

**Tech Stack:** NestJS, Prisma transactions, PostgreSQL row locks, Node source contracts, existing operations service flows.

---

### Task 1: Add RED Source Contract

**Files:**
- Create: `scripts/test-operation-payment-item-form-lock-contract.js`

- [ ] **Step 1: Write the failing contract**

The contract reads `apps/api/src/modules/operations/operations.service.ts` and asserts:

- `createPaymentRequest()` no longer calls `ensurePaymentItemsScoped()` or `paymentRequestCodeBranch()` before opening the transaction.
- `createPaymentRequest()` calls `lockPaymentItemOperationForms(tx, items)` before `lockPaymentItemCosts(tx, items)`.
- `createPaymentRequest()` runs `ensurePaymentItemsScoped(items, user, tx)` and `paymentRequestCodeBranch(items, dto, user, tx)` inside the transaction.
- `updatePaymentRequest()` no longer calls `ensurePaymentItemsScoped()` before the transaction and locks forms before costs when replacing items.
- `changePaymentRequestStatus()` locks request-linked forms before re-reading request detail when submitting to `REQUESTED`.
- The new helper methods use `SELECT ... FROM "OperationForm" ... FOR UPDATE`.
- `paymentItemsScope()` and `ensurePaymentItemsScoped()` accept and use a Prisma client.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-operation-payment-item-form-lock-contract.js`
Expected: FAIL because payment item form locks and transaction-client scope reads are missing.

### Task 2: Implement Parent Form Locking

**Files:**
- Modify: `apps/api/src/modules/operations/operations.service.ts`

- [ ] **Step 1: Add lock helpers**

Add:

```ts
private async lockPaymentItemOperationForms(tx: Prisma.TransactionClient, items: ParsedPaymentItem[]) {
  const costIds = Array.from(new Set(items.map((item) => item.costId)));
  if (!costIds.length) return [];
  const placeholders = costIds.map((_, index) => `$${index + 1}`).join(', ');
  return tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "OperationForm" WHERE "id" IN (SELECT DISTINCT "operationFormId" FROM "OperationCost" WHERE "id" IN (${placeholders})) ORDER BY "id" FOR UPDATE`,
    ...costIds,
  );
}
```

Add a request-id helper that locks forms linked through `SupplierPaymentItem -> OperationCost`.

- [ ] **Step 2: Move create request reads into transaction**

Remove pre-transaction `ensurePaymentItemsScoped()` and `paymentRequestCodeBranch()` calls. Inside the transaction, lock forms, lock costs, scope-check, validate, derive `codeBranch`, then create.

- [ ] **Step 3: Move update request item reads into transaction**

Keep parsing/empty-item validation before the transaction. Inside the transaction, when items are supplied, lock forms, lock costs, scope-check, validate, then replace items.

- [ ] **Step 4: Lock forms before submit checks**

In `changePaymentRequestStatus()`, when `status === SupplierPaymentStatus.REQUESTED`, lock forms linked to request items before `paymentRequestDetail(id, user, tx)` so cancelled-form guards read after the shared form lock.

- [ ] **Step 5: Make scope helpers transaction-client aware**

Update `paymentRequestCodeBranch()`, `paymentItemsScope()`, and `ensurePaymentItemsScoped()` to accept `client: Prisma.TransactionClient | PrismaService = this.prisma` and replace root `this.prisma` reads with `client`.

### Task 3: Verify, Deploy, And Document

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node scripts/test-operation-payment-item-form-lock-contract.js
node scripts/test-phase1-operation-payment-request-concurrency-contract.js
node scripts/test-operation-service-supplier-lock-contract.js
node scripts/test-operation-form-booking-lock-contract.js
bash scripts/test-operations-controller-contract.sh
bash scripts/test-operations-service-flows.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
```

- [ ] **Step 2: Merge, deploy, healthcheck, and update memory**

Fast-forward `/opt/smarttour`, rebuild/restart the API container, run `npm run ops:health`, update Memory Bank, commit, push, and remove the temporary worktree.
