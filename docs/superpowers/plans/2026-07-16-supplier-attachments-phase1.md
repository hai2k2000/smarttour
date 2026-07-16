# Supplier Attachments Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make supplier attachments a real supplier-owned file workflow where supplier users can download/manage supplier files through supplier permissions, without requiring generic `file.view`/`file.manage` permissions for supplier-owned download/delete.

**Architecture:** Keep MinIO/object storage and supplier file metadata as they are. Tighten the route contract so `/api/files/download` and `DELETE /api/files` rely on `FilesService.assertObjectAccess()` for entity-specific permissions, while generic `/api/files/upload` still requires `file.manage`. Extend supplier smoke coverage so a user with only `supplier.view` can download supplier files and a supplier manager without generic `file.view` can still download files they uploaded.

**Tech Stack:** NestJS, Prisma, MinIO file service, Bash smoke tests, Node source-contract tests, Docker Compose verification on the VPS.

---

## Scope Check

This plan implements Phase 1 only from `docs/superpowers/specs/2026-07-16-supplier-deepening-design.md`: real supplier attachments. It does not implement supplier import/export, supplier finance links, dedicated child-row APIs, or lifecycle UI.

## File Structure

- Modify `scripts/test-files-controller-contract.js`: source contract proving file download/delete are entity-scoped, not guarded by generic file permissions.
- Existing verification `scripts/test-suppliers-file-contract.sh`: supplier-specific source contract proving supplier file routes use supplier permissions and metadata-backed download URLs.
- Modify `scripts/smoke-suppliers.sh`: runtime smoke proving supplier-view-only users can download supplier files and supplier managers no longer need `file.view`.
- Modify `apps/api/src/modules/files/files.controller.ts`: remove generic permission decorators from download/delete while keeping generic upload guarded.
- Modify `memory-bank/activeContext.md`: add latest session note after implementation.
- Modify `memory-bank/progress.md`: add completed Phase 1 supplier attachment note after implementation.

---

### Task 1: Add Source Contract For Entity-Scoped File Download/Delete

**Files:**
- Modify: `scripts/test-files-controller-contract.js`

- [ ] **Step 1: Write the failing controller contract**

Replace the route-token section in `scripts/test-files-controller-contract.js` with explicit checks for upload/download/delete guard boundaries:

```js
const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/files/files.controller.ts', 'utf8');
const tourGuidesController = fs.readFileSync('apps/api/src/modules/tour-guides/tour-guides.controller.ts', 'utf8');
const dtoPath = 'apps/api/src/modules/files/dto/file-query.dto.ts';
const failures = [];

function decoratorBlockBefore(source, methodSignature) {
  const methodIndex = source.indexOf(methodSignature);
  if (methodIndex === -1) return '';
  const before = source.slice(0, methodIndex);
  const lastBlank = before.lastIndexOf('\n\n');
  return before.slice(lastBlank === -1 ? 0 : lastBlank);
}

if (!fs.existsSync(dtoPath)) {
  failures.push('File query DTO is missing');
} else {
  const dto = fs.readFileSync(dtoPath, 'utf8');
  for (const token of [
    'export class FileUploadBodyDto',
    'scope?: string',
    'export class FileObjectKeyQueryDto',
    '@IsString()',
    '@MinLength(1)',
    'key!: string',
  ]) {
    if (!dto.includes(token)) failures.push(`FileObjectKeyQueryDto missing ${token}`);
  }
}

for (const token of [
  "import type { ServerResponse } from 'node:http';",
  "import { FileObjectKeyQueryDto, FileUploadBodyDto } from './dto/file-query.dto';",
  "import { RequirePermissions } from '../auth/permissions.decorator';",
  'upload(',
  "@RequirePermissions('file.manage')",
  '@Body() dto: FileUploadBodyDto',
  'this.filesService.uploadAuthorized(file, dto.scope, request.user)',
  'async download(@Query() query: FileObjectKeyQueryDto',
  '@Res() response: ServerResponse',
  'const key = query.key;',
  'downloadAuthorized(key, request.user)',
  'remove(@Query() query: FileObjectKeyQueryDto',
  'removeAuthorized(key, request.user)',
]) {
  if (!controller.includes(token)) failures.push(`FilesController missing ${token}`);
}

const downloadDecorators = decoratorBlockBefore(controller, 'async download(');
const removeDecorators = decoratorBlockBefore(controller, 'remove(@Query() query: FileObjectKeyQueryDto');
if (downloadDecorators.includes('@RequirePermissions')) {
  failures.push('FilesController download must not require generic file.view; FilesService enforces entity-specific view permission');
}
if (removeDecorators.includes('@RequirePermissions')) {
  failures.push('FilesController delete must not require generic file.manage; FilesService enforces entity-specific manage permission');
}

for (const unsafe of [
  "@Body('scope')",
  "@Query('key')",
  'response: any',
  "@RequirePermissions('file.view')\n  async download",
  "@RequirePermissions('file.manage')\n  remove",
]) {
  if (controller.includes(unsafe)) failures.push(`FilesController must not use loose or generic file contract ${unsafe}`);
}

for (const token of [
  "import { fileUploadInterceptorOptions } from '../files/files.service';",
  "@UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))",
]) {
  if (!tourGuidesController.includes(token)) failures.push(`TourGuidesController missing standardized upload interceptor contract ${token}`);
}

if (tourGuidesController.includes("FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })")) {
  failures.push('TourGuidesController must not bypass shared fileUploadInterceptorOptions');
}

if (failures.length) {
  console.error('FAIL_FILES_CONTROLLER_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_FILES_CONTROLLER_CONTRACT_OK');
```

- [ ] **Step 2: Run the contract and verify it fails**

Run:

```bash
node scripts/test-files-controller-contract.js
```

Expected before implementation:

```text
FAIL_FILES_CONTROLLER_CONTRACT
FilesController download must not require generic file.view; FilesService enforces entity-specific view permission
FilesController delete must not require generic file.manage; FilesService enforces entity-specific manage permission
```

- [ ] **Step 3: Commit the red contract**

```bash
git add scripts/test-files-controller-contract.js
git commit -m "test: cover entity scoped file permissions"
```

---

### Task 2: Add Runtime Supplier Smoke For Supplier-Owned Downloads

**Files:**
- Modify: `scripts/smoke-suppliers.sh`

- [ ] **Step 1: Make the manage smoke user lack generic file view**

In the `RolePermission` seed block, remove this row from the manage role:

```sql
('${MANAGE_ROLE_ID}_rp_file_view', '${MANAGE_ROLE_ID}', 'file.view', now()),
```

The manage role must still keep:

```sql
('${MANAGE_ROLE_ID}_rp_supplier_view', '${MANAGE_ROLE_ID}', 'supplier.view', now()),
('${MANAGE_ROLE_ID}_rp_supplier_manage', '${MANAGE_ROLE_ID}', 'supplier.manage', now()),
('${MANAGE_ROLE_ID}_rp_finance_payment_view', '${MANAGE_ROLE_ID}', 'finance.payment.view', now()),
('${MANAGE_ROLE_ID}_rp_scope_all', '${MANAGE_ROLE_ID}', 'data.scope.all', now()),
```

- [ ] **Step 2: Add supplier-view-only download assertions**

Immediately after the existing manage download assertion:

```js
let uploadedDownload = await fetch(new URL(uploadedFile.fileUrl, api), { headers: { Authorization: `Bearer ${manageToken}` } });
assert(uploadedDownload.status === 200 && await uploadedDownload.text() === 'supplier file smoke', 'uploaded supplier object must be downloadable');
```

add:

```js
const viewDownload = await fetch(new URL(uploadedFile.fileUrl, api), { headers: { Authorization: `Bearer ${viewToken}` } });
assert(viewDownload.status === 200 && await viewDownload.text() === 'supplier file smoke', 'supplier.view user must download supplier-owned files without generic file.view');
```

Immediately after the existing wrong-supplier delete preservation assertion:

```js
uploadedDownload = await fetch(new URL(uploadedFile.fileUrl, api), { headers: { Authorization: `Bearer ${manageToken}` } });
assert(uploadedDownload.status === 200, 'wrong-supplier delete must not remove the storage object');
```

add:

```js
const viewDownloadAfterWrongDelete = await fetch(new URL(uploadedFile.fileUrl, api), { headers: { Authorization: `Bearer ${viewToken}` } });
assert(viewDownloadAfterWrongDelete.status === 200, 'supplier.view download must remain available after failed wrong-supplier delete');
```

- [ ] **Step 3: Run the supplier smoke and verify it fails before implementation**

Run:

```bash
bash scripts/smoke-suppliers.sh
```

Expected before implementation: the smoke fails at the first download with a `403` because `FilesController.download` still requires `file.view`.

- [ ] **Step 4: Commit the red smoke**

```bash
git add scripts/smoke-suppliers.sh
git commit -m "test: smoke supplier-owned file downloads"
```

---

### Task 3: Implement Entity-Scoped File Controller Permissions

**Files:**
- Modify: `apps/api/src/modules/files/files.controller.ts`

- [ ] **Step 1: Remove generic permission decorators from download/delete**

Change this controller section:

```ts
  @Get('download')
  @RequirePermissions('file.view')
  async download(@Query() query: FileObjectKeyQueryDto, @Req() request: { user?: RequestUser }, @Res() response: ServerResponse) {
    const key = query.key;
    const file = await this.filesService.downloadAuthorized(key, request.user);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    file.stream.pipe(response);
  }

  @Delete()
  @RequirePermissions('file.manage')
  remove(@Query() query: FileObjectKeyQueryDto, @Req() request: { user?: RequestUser }) {
    const key = query.key;
    return this.filesService.removeAuthorized(key, request.user);
  }
```

to:

```ts
  @Get('download')
  async download(@Query() query: FileObjectKeyQueryDto, @Req() request: { user?: RequestUser }, @Res() response: ServerResponse) {
    const key = query.key;
    const file = await this.filesService.downloadAuthorized(key, request.user);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    file.stream.pipe(response);
  }

  @Delete()
  remove(@Query() query: FileObjectKeyQueryDto, @Req() request: { user?: RequestUser }) {
    const key = query.key;
    return this.filesService.removeAuthorized(key, request.user);
  }
```

Do not remove `RequirePermissions` import because generic `upload()` still uses `@RequirePermissions('file.manage')`.

- [ ] **Step 2: Run focused contracts**

Run:

```bash
node scripts/test-files-controller-contract.js
bash scripts/test-suppliers-file-contract.sh
node scripts/test-file-upload-scope-contract.js
```

Expected:

```text
TEST_FILES_CONTROLLER_CONTRACT_OK
TEST_SUPPLIERS_FILE_CONTRACT_OK
TEST_FILE_UPLOAD_SCOPE_CONTRACT_OK
```

- [ ] **Step 3: Build and lint API**

Run:

```bash
npm run build --workspace @smarttour/api
npm run lint --workspace @smarttour/api
```

Expected: both commands exit `0`.

- [ ] **Step 4: Commit implementation**

```bash
git add apps/api/src/modules/files/files.controller.ts
git commit -m "fix: use entity scoped file permissions"
```

---

### Task 4: Verify Runtime Supplier Attachment Behavior

**Files:**
- No source changes expected.

- [ ] **Step 1: Rebuild/restart API through Docker**

Run:

```bash
docker compose build api
docker compose up -d api
```

Expected: both commands exit `0`.

- [ ] **Step 2: Run supplier file runtime smoke**

Run:

```bash
bash scripts/smoke-suppliers.sh
```

Expected:

```text
SMOKE_SUPPLIERS_OK
```

The output must include successful file upload, supplier-view download, forbidden supplier-view delete, supplier file delete, and deleted-file 404 assertions.

- [ ] **Step 3: Run production healthcheck**

Run:

```bash
npm run ops:health
```

Expected:

```text
HEALTHCHECK_OK
```

---

### Task 5: Update Memory Bank

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Add active context note**

Insert this note at the top of `## Latest Session Notes` in `memory-bank/activeContext.md`:

```md
- Supplier attachment permission deepening:
  - File download/delete now rely on entity-scoped file access in FilesService instead of requiring generic file.view/file.manage on the shared FilesController routes.
  - Supplier-owned file downloads now work for users with supplier.view only, while supplier file upload/delete still require supplier.manage through supplier routes and metadata ownership checks.
  - Verification passed for files controller contract, supplier file contract, file upload scope contract, API build/lint, Docker API rebuild/restart, supplier smoke, and production healthcheck.
```

- [ ] **Step 2: Add progress note**

Insert this note at the top of `memory-bank/progress.md` after `# Progress`:

```md
- Completed Supplier attachments Phase 1 permission deepening:
  - Shared file download/delete routes now delegate permission decisions to FilesService entity-specific access checks, allowing supplier.view users to download supplier-owned files without generic file.view.
  - Supplier smoke coverage now proves supplier managers can upload/download without generic file.view, supplier viewers can download, supplier viewers cannot delete, wrong-supplier deletes preserve storage objects, and final delete removes the object.
  - Verification passed: node scripts/test-files-controller-contract.js, bash scripts/test-suppliers-file-contract.sh, node scripts/test-file-upload-scope-contract.js, API build/lint, Docker API rebuild/restart, bash scripts/smoke-suppliers.sh, and npm run ops:health.
```

- [ ] **Step 3: Run docs diff check**

Run:

```bash
git diff --check memory-bank/activeContext.md memory-bank/progress.md
```

Expected: exit `0`.

- [ ] **Step 4: Commit Memory Bank updates**

```bash
git add memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: update supplier attachment progress"
```

---

### Task 6: Final Verification And Push

**Files:**
- No source changes expected.

- [ ] **Step 1: Run final focused verification**

Run:

```bash
node scripts/test-files-controller-contract.js
bash scripts/test-suppliers-file-contract.sh
node scripts/test-file-upload-scope-contract.js
npm run build --workspace @smarttour/api
npm run lint --workspace @smarttour/api
git diff --check origin/main..HEAD
git status --short --branch
```

Expected:

```text
TEST_FILES_CONTROLLER_CONTRACT_OK
TEST_SUPPLIERS_FILE_CONTRACT_OK
TEST_FILE_UPLOAD_SCOPE_CONTRACT_OK
```

Build/lint and diff-check must exit `0`. `git status --short --branch` should show the branch ahead of origin only by the new implementation/docs commits and no dirty files.

- [ ] **Step 2: Push commits**

Run:

```bash
git push origin main
git status --short --branch
```

Expected:

```text
main -> main
## main...origin/main
```

- [ ] **Step 3: Report outcome**

Report:

- Commit hashes for the red contracts, implementation, and Memory Bank docs.
- Push status.
- Exact verification commands that passed.
- Any skipped verification and why.
