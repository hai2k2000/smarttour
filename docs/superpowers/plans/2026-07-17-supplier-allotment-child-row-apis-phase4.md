# Supplier Allotment Child-Row APIs Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dedicated hotel allotment child-row APIs under Supplier while preserving existing parent payload compatibility and allocation-safe override/lock/release flows.

**Architecture:** Keep the implementation inside `apps/api/src/modules/suppliers`. Add exported allotment child DTOs, explicit `/:id/allotments` controller routes before dynamic typed supplier routes, and service methods that lock the parent hotel supplier plus the target allotment row for writes. Existing global `hotel-allotments` inventory/override/lock/release endpoints remain the operational allocation workflow; these child-row APIs cover row creation, static detail edits, and deletion when no locked/confirmed allocation depends on the row.

**Tech Stack:** NestJS controller/service, Prisma transactions and row locks, existing supplier DTO validators, focused source contracts, Docker-based VPS verification.

---

### Task 1: Contract for Hotel Allotment Child APIs

**Files:**
- Modify: `scripts/test-suppliers-child-row-apis-contract.js`
- Modify: `scripts/test-suppliers-controller-contract.sh`

- [ ] **Step 1: Extend the failing child-row source contract**

Assert the following routes exist and are declared before `@Get(':routeKey')`:

```ts
@Get(':id/allotments')
@Post(':id/allotments')
@Put(':id/allotments/:allotmentId')
@Delete(':id/allotments/:allotmentId')
```

Assert write routes require `supplier.manage`, controller delegates with `request.user`, service methods exist, parent writes lock the supplier, target writes lock the allotment row, active allocations block update/delete, sibling overlap checks run against persisted rows, linked `serviceId` is validated against active services on the same hotel supplier, and routes preserve existing `hotel-allotments` global paths.

- [ ] **Step 2: Run contract and verify RED**

Run: `node scripts/test-suppliers-child-row-apis-contract.js`

Expected: FAIL with a missing `@Get(':id/allotments')` route.

---

### Task 2: DTO Support for Allotment Child Rows

**Files:**
- Modify: `apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts`

- [ ] **Step 1: Export the existing allotment input DTO**

Change `class SupplierAllotmentInputDto` to `export class SupplierAllotmentInputDto` so controller child routes can reuse the established validators.

- [ ] **Step 2: Add optional service linking and update DTO**

Add optional `serviceId?: string` to `SupplierAllotmentInputDto` with `@IsUUID('4')` and a Vietnamese message. Add:

```ts
export class UpdateSupplierAllotmentInputDto extends PartialType(SupplierAllotmentInputDto) {}
```

Parent create/update payloads remain compatible because `serviceId` is optional.

---

### Task 3: Controller Routes

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`

- [ ] **Step 1: Import allotment DTOs**

Import `SupplierAllotmentInputDto` and `UpdateSupplierAllotmentInputDto` from `hotel-supplier.dto.ts`.

- [ ] **Step 2: Add routes before `@Get(':type/export')` and `@Get(':routeKey')`**

Add:

```ts
@Get(':id/allotments')
listSupplierAllotments(@Param('id') id: string, @Req() request: { user?: RequestUser }) {
  return this.suppliersService.listSupplierAllotments(id, request.user);
}

@Post(':id/allotments')
@RequirePermissions('supplier.manage')
createSupplierAllotment(@Param('id') id: string, @Body() dto: SupplierAllotmentInputDto, @Req() request: { user?: RequestUser }) {
  return this.suppliersService.createSupplierAllotment(id, dto, request.user);
}

@Put(':id/allotments/:allotmentId')
@RequirePermissions('supplier.manage')
updateSupplierAllotment(@Param('id') id: string, @Param('allotmentId') allotmentId: string, @Body() dto: UpdateSupplierAllotmentInputDto, @Req() request: { user?: RequestUser }) {
  return this.suppliersService.updateSupplierAllotment(id, allotmentId, dto, request.user);
}

@Delete(':id/allotments/:allotmentId')
@RequirePermissions('supplier.manage')
deleteSupplierAllotment(@Param('id') id: string, @Param('allotmentId') allotmentId: string, @Req() request: { user?: RequestUser }) {
  return this.suppliersService.deleteSupplierAllotment(id, allotmentId, request.user);
}
```

---

### Task 4: Service Methods and Safety Guards

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`

- [ ] **Step 1: Add list method**

`listSupplierAllotments(id, user)` must call `getHotelSupplier(id, user)` for existence/read behavior, then return supplier allotments ordered by `createdAt`, including recent allocations/logs as `hotelInclude()` already does.

- [ ] **Step 2: Add create method**

Inside a Prisma transaction:

1. `await this.lockSupplierForAllotmentWrite(tx, supplierId)` to reject deleted/inactive suppliers.
2. `await this.ensureHotelSupplierForChildWrite(tx, supplierId)` to ensure the parent is actually a hotel supplier.
3. Normalize a single row through `normalizeHotelAllotments([dto])`.
4. Validate optional `serviceId` belongs to the same supplier and is not deleted.
5. Check persisted sibling overlaps with `ensureNoOverlappingAllotmentsForSupplier(tx, supplierId, allotment, undefined)`.
6. Create the row and return `allotmentInventoryById`.

- [ ] **Step 3: Add update method**

Inside a transaction:

1. Lock parent with `lockSupplierForAllotmentWrite`.
2. Lock the target allotment using raw SQL `FOR UPDATE`.
3. Reject if the row does not belong to the supplier.
4. Reject when active allocations exist.
5. Merge current row with the partial DTO, normalize once, validate service link, check sibling overlaps excluding the current id, update, and return `allotmentInventoryById`.

- [ ] **Step 4: Add delete method**

Inside a transaction:

1. Lock parent with `lockSupplierForAllotmentWrite`.
2. Lock target allotment with `FOR UPDATE`.
3. Reject when active allocations exist.
4. Delete the row and return `{ id, deleted: true }`.

Do not change existing `overrideAllotment`, `lockAllotment`, `confirmAllotmentAllocation`, or `releaseAllotmentAllocation` behavior in this slice.

---

### Task 5: Verification, Review, Merge, Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification in the worktree**

Run sequentially:

```bash
npm run build --workspace @smarttour/api
npm run lint --workspace @smarttour/api
node scripts/test-suppliers-child-row-apis-contract.js
bash scripts/test-suppliers-controller-contract.sh
bash scripts/test-suppliers-hotel-contract.sh
bash scripts/test-suppliers-typed-contract.sh
node scripts/test-suppliers-sensitive-fields-contract.js
git diff --check HEAD
```

- [ ] **Step 2: Request code review before merge**

Ask a reviewer to inspect `origin/main..HEAD` for route conflicts, allocation races, delete/update safety, service link validation, and missing tests. Address Critical/Important feedback before merge.

- [ ] **Step 3: Update Memory Bank and commit**

Document the allotment child-row API slice and remaining UI migration/lifecycle work in `memory-bank/activeContext.md` and `memory-bank/progress.md`. Commit plan separately, then implementation/remediation commits with focused `git add` paths only.

- [ ] **Step 4: Deploy from `/opt/smarttour`**

After fast-forward merge to main:

```bash
docker compose build api web
docker compose up -d api web
bash scripts/smoke-suppliers.sh
npm run ops:health
git push origin main
```

Clean up the worktree and local branch after push.
