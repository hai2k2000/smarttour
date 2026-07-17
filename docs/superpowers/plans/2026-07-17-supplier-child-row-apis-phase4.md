# Supplier Child-Row APIs Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dedicated Supplier contact and service child-row CRUD APIs while keeping existing parent create/update nested payloads compatible.

**Architecture:** The first Phase 4 slice stays inside `apps/api/src/modules/suppliers`: reusable child-row DTOs, explicit controller routes before dynamic typed supplier routes, and service methods that lock the parent supplier before every write. Hotel allotment child-row CRUD remains a later slice because existing override/lock/allocation flows already protect sensitive write cases and require deeper allocation-aware behavior.

**Tech Stack:** NestJS controllers/services, Prisma transactions, class-validator DTOs, existing supplier source-contract scripts, Docker-based VPS verification.

---

### Task 1: Contract for Dedicated Child-Row APIs

**Files:**
- Create: `scripts/test-suppliers-child-row-apis-contract.js`
- Modify: none

- [ ] **Step 1: Write the failing source contract**

Create a Node source contract that reads `suppliers.controller.ts`, `suppliers.service.ts`, `dto/generic-supplier.dto.ts`, and `dto/hotel-supplier.dto.ts`. Assert the eight contact/service routes exist, write routes use `supplier.manage`, read routes use inherited `supplier.view`, routes appear before `@Get(':routeKey')`, service methods exist, writes lock the parent supplier, services soft-delete, contacts remain hard-deleted, and reusable DTO classes are exported for child-row routes.

- [ ] **Step 2: Run the contract and verify RED**

Run: `node scripts/test-suppliers-child-row-apis-contract.js`

Expected: FAIL with a missing child-row route or missing service method message.

---

### Task 2: Export/Re-use Child-Row DTOs

**Files:**
- Modify: `apps/api/src/modules/suppliers/dto/generic-supplier.dto.ts`
- Modify: `apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts`

- [ ] **Step 1: Export existing input DTOs**

Change private nested DTO classes into exported classes:

```ts
export class SupplierContactInputDto { ... }
export class GenericSupplierServiceInputDto { ... }
export class SupplierServiceInputDto { ... }
```

Keep existing `contacts?: ...[]` and `services?: ...[]` parent payload fields compatible.

- [ ] **Step 2: Add update DTOs for partial row edits**

Add:

```ts
export class UpdateSupplierContactDto extends PartialType(SupplierContactInputDto) {}
export class UpdateGenericSupplierServiceInputDto extends PartialType(GenericSupplierServiceInputDto) {}
export class UpdateSupplierServiceInputDto extends PartialType(SupplierServiceInputDto) {}
```

---

### Task 3: Add Controller Routes Before Dynamic Supplier Routes

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`

- [ ] **Step 1: Import child-row DTOs**

Import contact and generic service DTOs from `generic-supplier.dto.ts`, and hotel service DTOs from `hotel-supplier.dto.ts`.

- [ ] **Step 2: Add contact CRUD routes before dynamic routes**

Add `GET/POST/PUT/DELETE /suppliers/:id/contacts` routes. Reads stay under controller-level `supplier.view`; writes add `@RequirePermissions('supplier.manage')`.

- [ ] **Step 3: Add service CRUD routes before dynamic routes**

Add `GET/POST/PUT/DELETE /suppliers/:id/services` routes. A create body accepts generic supplier service fields plus hotel date/day fields where supported; service normalization chooses generic or hotel behavior from the parent supplier shape.

---

### Task 4: Implement Service Methods with Parent Locks and Scoped Re-Reads

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`

- [ ] **Step 1: Add child list methods**

Implement `listSupplierContacts` and `listSupplierServices` by calling `getSupplier(id, user)` for existence/read behavior and returning ordered child rows:

```ts
return this.prisma.supplierContact.findMany({ where: { supplierId: id }, orderBy: { createdAt: 'asc' } });
return this.prisma.supplierService.findMany({ where: { supplierId: id, deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY });
```

- [ ] **Step 2: Add contact write methods**

Use `this.prisma.$transaction(async (tx) => { await this.lockSupplierForStatusWrite(tx, supplierId); ... })`. Create/update/delete rows using `{ id: contactId, supplierId }`, then re-read the supplier with `genericInclude()` or `hotelInclude()` according to `hotelProfileId`.

- [ ] **Step 3: Add service write methods**

Use the same parent lock. Normalize creates with existing `normalizeGenericServices([dto], typedRoute)` for typed suppliers and `normalizeHotelServices([dto])` for hotel suppliers. Normalize updates by merging the current active row with the partial DTO, then passing one row through the relevant normalizer. Delete soft-deletes with `data: { deletedAt: new Date(), status: 'INACTIVE' }`.

- [ ] **Step 4: Preserve hotel allocation safety**

When editing/deleting a hotel supplier service, block if an active allotment allocation references that service through `SupplierAllotmentAllocation` with status `LOCKED` or `CONFIRMED`, returning a Vietnamese conflict message. Do not modify allotment override/lock endpoints in this slice.

---

### Task 5: Verification, Memory Bank, Commit, Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
node scripts/test-suppliers-child-row-apis-contract.js
bash scripts/test-suppliers-controller-contract.sh
bash scripts/test-suppliers-typed-contract.sh
bash scripts/test-suppliers-hotel-contract.sh
node scripts/test-suppliers-sensitive-fields-contract.js
npm run build --workspace @smarttour/api
npm run lint --workspace @smarttour/api
git diff --check
```

- [ ] **Step 2: Update Memory Bank**

Add concise Phase 4 notes to `memory-bank/activeContext.md` and `memory-bank/progress.md`: endpoints delivered, parent payload compatibility preserved, contacts hard-delete semantics retained, services soft-delete semantics retained, allotment child CRUD deferred.

- [ ] **Step 3: Commit and merge**

Commit the plan separately, then implementation files with focused `git add` paths only. Merge `fix/supplier-child-row-apis-phase4` into `/opt/smarttour` main after verification.

- [ ] **Step 4: Deploy through Docker path**

Run from `/opt/smarttour`:

```bash
docker compose build api web
docker compose up -d api web
bash scripts/smoke-suppliers.sh
npm run ops:health
```

- [ ] **Step 5: Push and clean up**

Push `main` to origin, remove the Phase 4 worktree, delete the local branch, and report commit hashes plus verification evidence.
