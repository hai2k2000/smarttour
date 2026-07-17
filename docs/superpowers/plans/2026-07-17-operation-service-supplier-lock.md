# Operation Service Supplier Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent operation service child rows from being written from stale Supplier or SupplierService snapshots.

**Architecture:** Keep operation form writes inside the current `OperationsService` transactions. Move payload validation into those transactions and make service reference validation lock Supplier and SupplierService rows through the transaction client before `replaceFormChildren()` creates operation services.

**Tech Stack:** NestJS, Prisma transactions, PostgreSQL row locks, Node source contracts, existing shell service flows.

---

### Task 1: Add RED Source Contract

**Files:**
- Create: `scripts/test-operation-service-supplier-lock-contract.js`

- [ ] **Step 1: Write the failing source contract**

The contract reads `apps/api/src/modules/operations/operations.service.ts` and asserts:

- `createForm()` calls `validateFormPayload(dto, 'create', tx)` after opening the Prisma transaction and before `tx.operationForm.create`.
- `updateForm()` calls `validateFormPayload(dto, 'update', tx)` after `lockOperationFormForWrite()` and before `replaceFormChildren()`.
- No operation form create/update path keeps the stale pre-transaction `validateFormPayload(dto, mode)` call.
- `validateFormPayload()` and `validateFormServices()` accept a Prisma client.
- Service validation locks `Supplier` and `SupplierService` rows with `FOR UPDATE` and rejects inactive/deleted references.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-operation-service-supplier-lock-contract.js`
Expected: FAIL because validation still runs before the transaction and no Supplier/SupplierService lock helpers exist.

### Task 2: Implement Transactional Service Reference Locking

**Files:**
- Modify: `apps/api/src/modules/operations/operations.service.ts`

- [ ] **Step 1: Move operation form payload validation into create transaction**

In `createForm()`, remove the pre-transaction validation call. Inside `this.prisma.$transaction(async (tx) => { ... })`, validate with `await this.validateFormPayload(dto, 'create', tx)` before creating the form and children.

- [ ] **Step 2: Move operation form payload validation into update transaction**

In `updateForm()`, remove the pre-transaction validation call. After `lockOperationFormForWrite()` and `assertFormEditable()`, validate with `await this.validateFormPayload(dto, 'update', tx)` before child-link checks and replacement writes.

- [ ] **Step 3: Make service validation transaction-client aware**

Update `validateFormPayload()` to accept `client: Prisma.TransactionClient | PrismaService = this.prisma` and pass it into `validateFormServices(rows, client)`.

- [ ] **Step 4: Lock Supplier and SupplierService references**

Update `validateFormServices()` to accept the same client. Add focused helpers that use `SELECT ... FOR UPDATE` for referenced Supplier and SupplierService ids, reject soft-deleted or inactive rows, and keep the existing service-to-supplier ownership check.

### Task 3: Verify, Deploy, And Document

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node scripts/test-operation-service-supplier-lock-contract.js
node scripts/test-operation-form-booking-lock-contract.js
bash scripts/test-operations-controller-contract.sh
node scripts/test-phase1-operation-payment-request-concurrency-contract.js
bash scripts/test-operations-service-flows.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
```

- [ ] **Step 2: Merge and deploy**

Fast-forward `/opt/smarttour` from the finished branch, rebuild/restart the API container, run `npm run ops:health`, update Memory Bank, commit, push, and remove the temporary worktree when it is no longer needed.
