# Operation Form Booking Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent operation forms from being created or relinked from stale Booking snapshots.

**Architecture:** Add local row-lock helpers in `OperationsService` for `Booking` and `OperationForm`. Move Booking link resolution and scope checks for operation form writes inside Prisma transactions and use the transaction client throughout.

**Tech Stack:** NestJS, Prisma transactions, Node source contracts, Docker-backed operations service flows.

---

### Task 1: Add RED Source Contract

**Files:**
- Create: `scripts/test-operation-form-booking-lock-contract.js`

- [ ] **Step 1: Write failing source contract**

```js
const fs = require('fs');
const assert = require('assert');

const service = fs.readFileSync('apps/api/src/modules/operations/operations.service.ts', 'utf8');

function methodBody(name) {
  const start = service.indexOf(`async ${name}`);
  assert(start !== -1, `OperationsService.${name} must exist`);
  const next = service.indexOf('\n  async ', start + 1);
  return service.slice(start, next === -1 ? service.length : next);
}

function helperBody(name, nextName) {
  const start = service.indexOf(`private async ${name}`);
  assert(start !== -1, `OperationsService.${name} helper must exist`);
  const end = nextName ? service.indexOf(`  private async ${nextName}`, start + 1) : service.indexOf('\n  private ', start + 1);
  return service.slice(start, end === -1 ? service.length : end);
}

const createBody = methodBody('createForm');
const createTransactionIndex = createBody.indexOf('this.prisma.$transaction(async (tx) => {');
assert(createTransactionIndex !== -1, 'createForm must write inside a Prisma transaction');
assert(createBody.indexOf('resolveBookingOrderTour') > createTransactionIndex, 'createForm must resolve booking/order/tour links inside the transaction');
assert(/lockBookingForOperationForm\(tx,\s*bookingId,\s*user\)/.test(createBody), 'createForm must lock the selected Booking inside the transaction');
assert(createBody.indexOf('lockBookingForOperationForm') < createBody.indexOf('resolveBookingOrderTour'), 'createForm must lock Booking before resolving order/tour links');
assert(/ensureLinksScoped\(\{ bookingId, orderId: links\.orderId, tourId: links\.tourId \},\s*user,\s*tx\)/.test(createBody), 'createForm must scope-check links through the transaction client');
assert(/tx\.operationForm\.create/.test(createBody), 'createForm must create OperationForm through the transaction client');

const updateBody = methodBody('updateForm');
const updateTransactionIndex = updateBody.indexOf('this.prisma.$transaction(async (tx) => {');
assert(updateTransactionIndex !== -1, 'updateForm must write inside a Prisma transaction');
assert(/lockOperationFormForWrite\(tx,\s*id,\s*user\)/.test(updateBody), 'updateForm must lock and re-read the OperationForm inside the transaction');
assert(updateBody.indexOf('lockOperationFormForWrite') < updateBody.indexOf('assertFormEditable'), 'updateForm must run edit guards after the form row lock');
assert(/lockBookingForOperationForm\(tx,\s*bookingId,\s*user\)/.test(updateBody), 'updateForm must lock replacement Booking links inside the transaction');
assert(/resolveBookingOrderTour\(\{[\s\S]*\},\s*tx,\s*lockedBooking\)/.test(updateBody), 'updateForm must resolve replacement links through the transaction client and locked booking snapshot');
assert(/ensureLinksScoped\(\{ bookingId, orderId: links\.orderId, tourId: links\.tourId \},\s*user,\s*tx\)/.test(updateBody), 'updateForm must scope-check replacement links through the transaction client');

const bookingLock = helperBody('lockBookingForOperationForm', 'lockOperationFormForWrite');
assert(bookingLock.includes('FROM "Booking"'), 'Booking operation-form lock must query Booking');
assert(bookingLock.includes('"deletedAt" IS NULL'), 'Booking operation-form lock must reject soft-deleted bookings');
assert(bookingLock.includes('FOR UPDATE'), 'Booking operation-form lock must use FOR UPDATE');
assert(/bookingScopeWhere\(\{ id: bookingId, deletedAt: null \},\s*user\)/.test(bookingLock), 'Booking operation-form lock must re-read through data scope');

const formLock = helperBody('lockOperationFormForWrite', 'resolveBookingOrderTour');
assert(formLock.includes('FROM "OperationForm"'), 'OperationForm update lock must query OperationForm');
assert(formLock.includes('FOR UPDATE'), 'OperationForm update lock must use FOR UPDATE');
assert(/formDetail\(id,\s*user,\s*tx\)/.test(formLock), 'OperationForm update lock must re-read scoped detail through the transaction client');

const resolveBody = helperBody('resolveBookingOrderTour', 'validateFormPayload');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(resolveBody), 'resolveBookingOrderTour must accept a Prisma client');
assert(resolveBody.includes('lockedBooking?'), 'resolveBookingOrderTour must accept a locked booking snapshot');
assert(resolveBody.includes('client.tour.findUnique'), 'resolveBookingOrderTour must read tours through the supplied client');
assert(resolveBody.includes('client.order.findUnique'), 'resolveBookingOrderTour must read orders through the supplied client');
assert(!resolveBody.includes('this.prisma.booking.findUnique'), 'resolveBookingOrderTour must not force a root-client booking read');

const scopeBody = helperBody('ensureLinksScoped', 'paymentRequestCodeBranch');
assert(/client:\s*Prisma\.TransactionClient \| PrismaService = this\.prisma/.test(scopeBody), 'ensureLinksScoped must accept a Prisma client');
assert(scopeBody.includes('client.booking.findFirst'), 'ensureLinksScoped must read Booking through the supplied client');
assert(scopeBody.includes('client.order.findFirst'), 'ensureLinksScoped must read Order through the supplied client');
assert(scopeBody.includes('client.tour.findFirst'), 'ensureLinksScoped must read Tour through the supplied client');

console.log('TEST_OPERATION_FORM_BOOKING_LOCK_CONTRACT_OK');
```

- [ ] **Step 2: Run RED**

Run: `node scripts/test-operation-form-booking-lock-contract.js`
Expected: FAIL because the helpers and in-transaction link resolution are missing.

### Task 2: Implement Minimal Locking

**Files:**
- Modify: `apps/api/src/modules/operations/operations.service.ts`

- [ ] **Step 1: Move `createForm()` link resolution inside transaction**

Lock the requested Booking, resolve links via `tx`, scope-check via `tx`, then create the form.

- [ ] **Step 2: Move `updateForm()` state/link resolution inside transaction**

Lock the OperationForm, run edit guards after the lock, lock replacement Booking when `bookingId` is supplied, resolve links via `tx`, scope-check via `tx`, then update the form and optional children.

- [ ] **Step 3: Make helper methods transaction-client aware**

Update `resolveBookingOrderTour()`, `ensureLinksScoped()`, `ensureFormCostServiceLinks()`, and `ensureFormChildrenReplaceable()` to accept a client and call them with `tx` from write paths.

### Task 3: Verify And Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node scripts/test-operation-form-booking-lock-contract.js
bash scripts/test-operations-controller-contract.sh
node scripts/test-phase1-operation-payment-request-concurrency-contract.js
bash scripts/test-operations-service-flows.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
```

- [ ] **Step 2: Deploy and healthcheck**

Merge to `/opt/smarttour`, restart API, run `npm run ops:health`, update Memory Bank, push, and clean up the worktree.
