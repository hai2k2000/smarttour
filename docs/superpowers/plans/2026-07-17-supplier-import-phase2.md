# Supplier Import Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add supplier import preview and all-or-nothing write execution for common/root supplier rows.

**Architecture:** Keep import parsing in a focused supplier helper, keep DB/category/code validation in `SuppliersService`, and expose two supplier-managed endpoints: preview and execute. CSV/XLSX parsing follows the existing Finance import pattern and uses the shared native XLSX parser; write execution runs only after preview has zero blocking row errors.

**Tech Stack:** NestJS, TypeScript strict, Prisma, existing `parseXlsxRows`, existing supplier validation helpers, Multer `FileInterceptor`, source/runtime contracts, supplier smoke scripts.

---

## Scope

This plan implements the second half of Phase 2 after export: common supplier root import. It intentionally does not import typed child fields, contacts, services, hotel profile fields, or hotel allotments; those remain later Phase 2/Phase 4 sub-steps because they need dedicated child-row semantics and allotment lock safety.

## File Structure

- Create: `apps/api/src/modules/suppliers/supplier-import.ts` - parse CSV/XLSX/JSON rows, normalize aliases from exported supplier columns, enforce max size/count, and detect row-level payload errors.
- Create: `apps/api/src/modules/suppliers/supplier-import-size-exception.filter.ts` - translate Multer file-size errors for supplier import to a Vietnamese 5 MB response.
- Create: `apps/api/src/modules/suppliers/dto/supplier-import.dto.ts` - DTO for JSON import rows or inline CSV plus optional mode.
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts` - add `POST /suppliers/import/preview` and `POST /suppliers/import` before dynamic supplier routes.
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts` - add `previewSupplierImport()` and `importSuppliers()` using all-or-nothing validation/write.
- Create: `scripts/test-suppliers-import-contract.js` - source/runtime contract for routes, permissions, file parsing, validation, all-or-nothing behavior, sensitive field protection, and no external XLSX dependency.
- Modify: `scripts/smoke-suppliers.sh` - add runtime smoke for preview success, preview blocking errors, import write, and all-or-nothing rejection.
- Modify: `memory-bank/activeContext.md`, `memory-bank/progress.md` - record import foundation progress and remaining typed/hotel child import scope.

---

### Task 1: Import Contract

**Files:**
- Create: `scripts/test-suppliers-import-contract.js`

- [ ] **Step 1: Write the failing contract**

Create a Node script that reads supplier controller/service/import helper/smoke files and asserts:

```js
includes(controller, "@Post('import/preview')", 'Supplier import preview route must exist.');
includes(controller, "@Post('import')", 'Supplier import write route must exist.');
includes(controller, "@RequirePermissions('supplier.manage')", 'Supplier import routes must require supplier.manage.');
includes(controller, "FileInterceptor('file', supplierImportInterceptorOptions())", 'Supplier import must accept CSV/XLSX files.');
before(controller, "@Post('import')", "@Post(':type')", 'Supplier import write must be before typed dynamic route.');
includes(service, 'previewSupplierImport(dto', 'Supplier preview service method must exist.');
includes(service, 'importSuppliers(dto', 'Supplier import service method must exist.');
includes(helper, 'parseXlsxRows(file.buffer)', 'Supplier import must use the shared native XLSX parser.');
includes(helper, 'MAX_SUPPLIER_IMPORT_ROWS = 500', 'Supplier import must cap rows.');
includes(helper, 'supplierCode', 'Supplier import must understand supplierCode.');
includes(helper, 'categoryName', 'Supplier import must support categoryName from exports.');
includes(helper, 'bankAccountNumber', 'Supplier import must classify finance-sensitive fields.');
excludes(helper, 'exceljs', 'Supplier import must not add workbook dependencies.');
includes(smoke, '/suppliers/import/preview', 'Supplier smoke must cover import preview.');
includes(smoke, '/suppliers/import', 'Supplier smoke must cover import write.');
```

Also build `apps/api` and require `apps/api/dist/modules/suppliers/supplier-import.js`; prove helper parsing maps `category` to `categoryName`, rejects too many rows, rejects unknown fields, and reports finance-sensitive fields without finance permission.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-suppliers-import-contract.js`

Expected: FAIL because supplier import helper/routes/service methods do not exist yet.

---

### Task 2: Parser, DTO, And Size Filte

**Files:**
- Create: `apps/api/src/modules/suppliers/supplier-import.ts`
- Create: `apps/api/src/modules/suppliers/supplier-import-size-exception.filter.ts`
- Create: `apps/api/src/modules/suppliers/dto/supplier-import.dto.ts`

- [ ] **Step 1: Add import DTO**

Create `SupplierImportDto` with optional `rows?: unknown[]`, `csv?: string`, and `mode?: 'create'`. Use `Allow`, `IsArray`, `IsIn`, and `IsOptional` from `class-validator`.

- [ ] **Step 2: Add supplier import helper**

Create exports:

```ts
export const MAX_SUPPLIER_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_SUPPLIER_IMPORT_ROWS = 500;
export function supplierImportInterceptorOptions() { ... }
export function supplierImportRows(dto: SupplierImportRecord, file?: SupplierImportFile) { ... }
export function normalizeSupplierImportRows(rows: SupplierImportRecord[], options?: { canWriteFinancialFields?: boolean }) { ... }
```

Supported columns: `supplierCode`, `categoryId`, `categoryName`/`category`, `name`, `taxCode`, `contactPerson`, `phone`, `email`, `country`, `province`, `address`, `website`, `link`, `rating`, `market`, `bankAccountName`, `bankAccountNumber`, `bankName`, `pricePolicy`, `debtNote`, `notes`, `status`.

- [ ] **Step 3: Verify contract still fails at controller/service**

Run: `node scripts/test-suppliers-import-contract.js`

Expected: FAIL because controller/service methods are still missing.

---

### Task 3: Service And Controlle

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`

- [ ] **Step 1: Add preview service method**

Add `previewSupplierImport(dto, file, user)` that parses rows, normalizes rows with financial permission awareness, resolves category by `categoryId` or `categoryName`, validates supplier payload using existing private helpers, checks supplierCode uniqueness and in-file duplicates, and returns `{ totalRows, validRows, failedRows, errors, rows }` without writing.

- [ ] **Step 2: Add write service method**

Add `importSuppliers(dto, file, user)` that reuses the preview validation. If `failedRows > 0`, throw `BadRequestException` containing the preview. If clean, create all suppliers in one Prisma transaction and return `{ created, rows }`.

- [ ] **Step 3: Add controller routes**

Add routes before `@Post(':type')`:

```ts
@Post('import/preview')
@RequirePermissions('supplier.manage')
@ApiConsumes('multipart/form-data')
@UseFilters(SupplierImportSizeExceptionFilter)
@UseInterceptors(FileInterceptor('file', supplierImportInterceptorOptions()))
previewImport(...)

@Post('import')
@RequirePermissions('supplier.manage')
@ApiConsumes('multipart/form-data')
@UseFilters(SupplierImportSizeExceptionFilter)
@UseInterceptors(FileInterceptor('file', supplierImportInterceptorOptions()))
importSuppliers(...)
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run build --workspace @smarttour/api && node scripts/test-suppliers-import-contract.js`

Expected: PASS with `TEST_SUPPLIERS_IMPORT_CONTRACT_OK`.

---

### Task 4: Smoke, Memory Bank, And Deploy

**Files:**
- Modify: `scripts/smoke-suppliers.sh`
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Extend supplier smoke**

Use the existing manage token/category in `scripts/smoke-suppliers.sh` to call preview and write for a new supplier row. Also call preview/import with an invalid row and verify no partial supplier is created.

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm run build --workspace @smarttour/api
node scripts/test-suppliers-import-contract.js
node scripts/test-suppliers-export-contract.js
bash scripts/test-suppliers-controller-contract.sh
node scripts/test-suppliers-sensitive-fields-contract.js
npm run lint --workspace @smarttour/api
```

- [ ] **Step 3: Deploy and smoke**

After merge to `/opt/smarttour`, run:

```bash
docker compose build api
docker compose up -d api
bash scripts/smoke-suppliers.sh
npm run ops:health
```

- [ ] **Step 4: Commit, push, cleanup**

Commit focused files, push `origin/main`, remove the feature worktree, and report commit hash plus verification evidence.