# Supplier Export Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add supplier CSV/XLSX exports for common, hotel, and typed supplier list views without leaking finance-only fields.

**Architecture:** Supplier remains global master data. Export routes reuse current list filters, stream CSV by default, stream native XLSX when `format=xlsx`, and centralize row shaping in a small Supplier export helper that applies existing financial masking before selecting columns.

**Tech Stack:** NestJS, TypeScript strict, Prisma, existing `csvRows`, existing `csvToXlsxWorkbook`/`XLSX_MIME`, source contracts, supplier/export smoke scripts.

---

## Scope

Implement export first. Supplier import preview/write is intentionally left for the next Phase 2 sub-plan because it needs duplicate policy, validation, transactional writes, and partial failure UX.

## File Structure

- Create: `scripts/test-suppliers-export-contract.js` - source/runtime contract for routes, route order, DTO format, XLSX helper usage, smoke coverage, and financial masking.
- Create: `apps/api/src/modules/suppliers/supplier-export.ts` - pure helpers that flatten supplier rows into CSV-friendly records after masking.
- Modify: `apps/api/src/modules/suppliers/dto/supplier-query.dto.ts` - add `format?: string` to common, hotel, and typed list query DTOs.
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts` - add CSV export methods that reuse existing list filters.
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts` - add `GET /suppliers/export`, `GET /suppliers/hotels/export`, and `GET /suppliers/:type/export` before dynamic routes.
- Modify: `scripts/smoke-exports.sh` - add supplier CSV/XLSX live smoke endpoints.
- Modify: `memory-bank/activeContext.md`, `memory-bank/progress.md` - record Phase 2 export status and verification evidence.

---

### Task 1: Supplier Export Contract

**Files:**
- Create: `scripts/test-suppliers-export-contract.js`

- [ ] **Step 1: Write the failing contract**

Create a Node source contract that reads `suppliers.controller.ts`, `suppliers.service.ts`, `supplier-query.dto.ts`, `supplier-export.ts`, and `scripts/smoke-exports.sh`. It must assert controller routes, route order, DTO `@IsIn(['csv', 'xlsx'])`, service export methods, helper masking, smoke entries, and runtime masking through `SuppliersService` from `apps/api/dist` with fake Prisma.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-suppliers-export-contract.js`

Expected: FAIL because routes/helper/service methods do not exist.

---

### Task 2: DTO And Export Helper

**Files:**
- Create: `apps/api/src/modules/suppliers/supplier-export.ts`
- Modify: `apps/api/src/modules/suppliers/dto/supplier-query.dto.ts`

- [ ] **Step 1: Add DTO format support**

Add `ApiPropertyOptional` and `IsIn` imports, then add this field to `SupplierListQueryDto`, `HotelSupplierListQueryDto`, and `TypedSupplierListQueryDto`:

```ts
@ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
@Transform(trimOptional)
@IsOptional()
@IsIn(['csv', 'xlsx'])
format?: string;
```

- [ ] **Step 2: Create the export helper**

Create `SUPPLIER_EXPORT_HEADERS` and `toSupplierExportCsvRows(rows, user)`. The helper must call `maskSupplierFinancialFields(rows, user)` before selecting columns. Include stable columns for code/name/category/status/contact/phone/email/province/market, sensitive finance fields, hotel profile fields, contacts, services, and updatedAt.

- [ ] **Step 3: Verify contract moves forward**

Run: `node scripts/test-suppliers-export-contract.js`

Expected: still FAIL until controller/service methods are added.

---

### Task 3: Service And Controller Routes

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`

- [ ] **Step 1: Add service methods**

Add `exportSuppliersCsv`, `exportHotelSuppliersCsv`, and `exportTypedSuppliersCsv`. Each method should call the matching list method and return `csvRows(SUPPLIER_EXPORT_HEADERS, toSupplierExportCsvRows(rows, user))`.

- [ ] **Step 2: Add controller routes**

Import `StreamableFile`, `ServerResponse`, `csvToXlsxWorkbook`, and `XLSX_MIME`. Add static routes before `hotels/:id` and `:routeKey`; each route sets export headers and returns XLSX only when `query.format === 'xlsx'`.

- [ ] **Step 3: Verify GREEN**

Run: `npm run build --workspace @smarttour/api && node scripts/test-suppliers-export-contract.js`

Expected: PASS with `TEST_SUPPLIERS_EXPORT_CONTRACT_OK`.

---

### Task 4: Smoke Coverage, Memory Bank, And Deploy

**Files:**
- Modify: `scripts/smoke-exports.sh`
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Extend live export smoke**

Add CSV endpoints `suppliers:/suppliers/export`, `suppliers-hotels:/suppliers/hotels/export`, `suppliers-restaurants:/suppliers/restaurants/export`; add XLSX endpoints with `?format=xlsx` for the same three paths.

- [ ] **Step 2: Run focused verification**

Run:

```bash
node scripts/test-suppliers-export-contract.js
node scripts/test-native-xlsx-export-contract.js
bash scripts/test-suppliers-controller-contract.sh
bash scripts/test-suppliers-typed-contract.sh
node scripts/test-suppliers-sensitive-fields-contract.js
npm run lint --workspace @smarttour/api
```

- [ ] **Step 3: Update Memory Bank**

Record export endpoints, masking behavior, smoke coverage, and that import remains next.

- [ ] **Step 4: Commit, merge, deploy, push**

Commit focused files, merge into `/opt/smarttour`, run `docker compose build api && docker compose up -d api`, run `bash scripts/smoke-exports.sh`, run `npm run ops:health`, push to `origin/main`, and confirm a clean worktree.
