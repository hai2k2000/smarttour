# Supplier Atomic Batch Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ID-preserving transactional batch-save endpoints and migrate generic/hotel Supplier edit forms from sequential root/child requests to one atomic request.

**Architecture:** New root-only and batch-row DTOs define optional child snapshots with stable ids. `SuppliersService` locks the parent Supplier once, validates final collection state, applies row-level creates/updates/deletes inside one Prisma transaction, and returns the complete supplier. Existing parent create/update and focused child CRUD routes remain compatible; only edit-form callers move to the batch routes.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL, class-validator/class-transformer, Next.js 16, React Hook Form, shell/Node source contracts, Docker-backed Supplier smoke tests, MCP `codex-review`.

---

## File Structure

- Create `apps/api/src/modules/suppliers/dto/supplier-batch.dto.ts`: root-only DTOs, ID-aware full snapshot row DTOs, and generic/hotel batch request DTOs.
- Modify `apps/api/src/modules/suppliers/suppliers.controller.ts`: add hotel and typed batch routes before dynamic parent routes.
- Modify `apps/api/src/modules/suppliers/suppliers.service.ts`: implement atomic batch methods and focused snapshot-sync helpers.
- Create `scripts/test-suppliers-atomic-batch-contract.js`: guard DTO, route, transaction, and UI batch-call contracts.
- Modify `scripts/smoke-suppliers.sh`: add authenticated generic/hotel batch success and rollback coverage.
- Modify `scripts/test-suppliers-client-contract.sh`: require one batch edit request and prohibit sequential child sync during form submission.
- Modify `scripts/test-suppliers-hotel-client-ui.js`: mock/assert the hotel batch request and unchanged create/file behavior.
- Modify `apps/web/app/suppliers/SupplierClientUi.tsx`: remove sequential form child-sync helpers.
- Modify `apps/web/app/suppliers/[type]/GenericSupplierClient.tsx`: submit root plus dirty child snapshots to the typed batch endpoint.
- Modify `apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx`: submit root plus dirty child snapshots to the hotel batch endpoint.
- Modify `memory-bank/activeContext.md` and `memory-bank/progress.md`: record final behavior, tests, review, and deployment.

### Task 1: Batch DTO and Route Contract

**Files:**
- Create: `scripts/test-suppliers-atomic-batch-contract.js`
- Create: `apps/api/src/modules/suppliers/dto/supplier-batch.dto.ts`
- Modify: `apps/api/src/modules/suppliers/suppliers.controller.ts`

- [ ] **Step 1: Write the failing source contract**

Create `scripts/test-suppliers-atomic-batch-contract.js` with focused assertions:

```javascript
const fs = require('fs');

const dto = fs.readFileSync('apps/api/src/modules/suppliers/dto/supplier-batch.dto.ts', 'utf8');
const controller = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.service.ts', 'utf8');
const generic = fs.readFileSync('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx', 'utf8');
const hotel = fs.readFileSync('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx', 'utf8');
const shared = fs.readFileSync('apps/web/app/suppliers/SupplierClientUi.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const name of [
  'UpdateGenericSupplierRootDto',
  'UpdateHotelSupplierRootDto',
  'SupplierBatchContactDto',
  'SupplierBatchGenericServiceDto',
  'SupplierBatchHotelServiceDto',
  'SupplierBatchAllotmentDto',
  'UpdateGenericSupplierBatchDto',
  'UpdateHotelSupplierBatchDto',
]) assert(dto.includes(`export class ${name}`), `missing ${name}`);

assert(dto.includes("@IsUUID('4'"), 'batch row ids must be UUID v4');
assert(/OmitType\(\s*UpdateGenericSupplierDto,\s*\['contacts', 'services'\]/.test(dto), 'generic root must omit children');
assert(/OmitType\(\s*UpdateHotelSupplierDto,\s*\['contacts', 'services', 'allotments'\]/.test(dto), 'hotel root must omit children');

const hotelRoute = controller.indexOf("@Put('hotels/:id/batch')");
const typedRoute = controller.indexOf("@Put(':type/:id/batch')");
assert(hotelRoute !== -1 && typedRoute !== -1, 'missing supplier batch routes');
assert(hotelRoute < controller.indexOf("@Put('hotels/:id')"), 'hotel batch route must precede hotel parent update');
assert(typedRoute < controller.indexOf("@Put(':type/:id')"), 'typed batch route must precede typed parent update');
assert(controller.slice(hotelRoute, hotelRoute + 500).includes("@RequirePermissions('supplier.manage')"), 'hotel batch must require supplier.manage');
assert(controller.slice(typedRoute, typedRoute + 500).includes("@RequirePermissions('supplier.manage')"), 'typed batch must require supplier.manage');

assert(service.includes('async updateTypedSupplierBatch('), 'missing typed batch service');
assert(service.includes('async updateHotelSupplierBatch('), 'missing hotel batch service');
assert(service.includes('syncSupplierContactsSnapshot('), 'missing contact snapshot sync');
assert(service.includes('syncSupplierServicesSnapshot('), 'missing service snapshot sync');
assert(service.includes('syncSupplierAllotmentsSnapshot('), 'missing allotment snapshot sync');

assert(generic.includes('/batch`'), 'generic edit must use batch endpoint');
assert(hotel.includes('/batch`'), 'hotel edit must use batch endpoint');
for (const helper of ['syncSupplierContacts', 'syncSupplierServices', 'syncSupplierAllotments']) {
  assert(!shared.includes(`export function ${helper}`), `${helper} must not orchestrate form saves`);
}

console.log('TEST_SUPPLIERS_ATOMIC_BATCH_CONTRACT_OK');
```

- [ ] **Step 2: Run the contract to verify RED**

Run:

```bash
node scripts/test-suppliers-atomic-batch-contract.js
```

Expected: FAIL because `supplier-batch.dto.ts` and batch routes do not exist.

- [ ] **Step 3: Add ID-aware batch DTOs**

Create `apps/api/src/modules/suppliers/dto/supplier-batch.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import {
  SupplierChildServiceInputDto,
  SupplierContactInputDto,
  UpdateGenericSupplierDto,
} from './generic-supplier.dto';
import {
  SupplierAllotmentInputDto,
  SupplierServiceInputDto,
  UpdateHotelSupplierDto,
} from './hotel-supplier.dto';

export class UpdateGenericSupplierRootDto extends OmitType(
  UpdateGenericSupplierDto,
  ['contacts', 'services'] as const,
) {}

export class UpdateHotelSupplierRootDto extends OmitType(
  UpdateHotelSupplierDto,
  ['contacts', 'services', 'allotments'] as const,
) {}

export class SupplierBatchContactDto extends SupplierContactInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID liên hệ nhà cung cấp không hợp lệ' })
  id?: string;
}

export class SupplierBatchGenericServiceDto extends SupplierChildServiceInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID dịch vụ nhà cung cấp không hợp lệ' })
  id?: string;
}

export class SupplierBatchHotelServiceDto extends SupplierServiceInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID dịch vụ khách sạn không hợp lệ' })
  id?: string;
}

export class SupplierBatchAllotmentDto extends SupplierAllotmentInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID quỹ phòng không hợp lệ' })
  id?: string;
}

export class UpdateGenericSupplierBatchDto {
  @ApiProperty({ type: UpdateGenericSupplierRootDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateGenericSupplierRootDto)
  root!: UpdateGenericSupplierRootDto;

  @ApiPropertyOptional({ type: [SupplierBatchContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchContactDto)
  contacts?: SupplierBatchContactDto[];

  @ApiPropertyOptional({ type: [SupplierBatchGenericServiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchGenericServiceDto)
  services?: SupplierBatchGenericServiceDto[];
}

export class UpdateHotelSupplierBatchDto {
  @ApiProperty({ type: UpdateHotelSupplierRootDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateHotelSupplierRootDto)
  root!: UpdateHotelSupplierRootDto;

  @ApiPropertyOptional({ type: [SupplierBatchContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchContactDto)
  contacts?: SupplierBatchContactDto[];

  @ApiPropertyOptional({ type: [SupplierBatchHotelServiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchHotelServiceDto)
  services?: SupplierBatchHotelServiceDto[];

  @ApiPropertyOptional({ type: [SupplierBatchAllotmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchAllotmentDto)
  allotments?: SupplierBatchAllotmentDto[];
}
```

- [ ] **Step 4: Add controller routes**

Import the two batch DTOs and add these routes before their parent update routes:

```typescript
@Put('hotels/:id/batch')
@RequirePermissions('supplier.manage')
updateHotelBatch(
  @Param('id') id: string,
  @Body() dto: UpdateHotelSupplierBatchDto,
  @Req() request: { user?: RequestUser },
) {
  return this.suppliersService.updateHotelSupplierBatch(id, dto, request.user);
}

@Put(':type/:id/batch')
@RequirePermissions('supplier.manage')
updateTypedBatch(
  @Param('type') type: string,
  @Param('id') id: string,
  @Body() dto: UpdateGenericSupplierBatchDto,
  @Req() request: { user?: RequestUser },
) {
  return this.suppliersService.updateTypedSupplierBatch(type, id, dto, request.user);
}
```

- [ ] **Step 5: Run the contract and record the expected remaining RED**

Run:

```bash
node scripts/test-suppliers-atomic-batch-contract.js
```

Expected: FAIL on missing service or UI implementation, while DTO/route assertions now pass.

- [ ] **Step 6: Commit DTO and route scaffolding**

```bash
git add apps/api/src/modules/suppliers/dto/supplier-batch.dto.ts apps/api/src/modules/suppliers/suppliers.controller.ts scripts/test-suppliers-atomic-batch-contract.js
git commit -m "feat: add supplier batch save contracts"
```

### Task 2: Generic Supplier Atomic Batch Service

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`
- Modify: `scripts/smoke-suppliers.sh`

- [ ] **Step 1: Add generic API smoke assertions and verify RED**

After a typed supplier fixture has contacts and services, add:

```javascript
const genericBeforeBatch = await request(manageToken, 'GET', `/suppliers/${type}/${created.id}`);
const keptContact = genericBeforeBatch.contacts[0];
const keptService = genericBeforeBatch.supplierServices[0];
const genericBatch = await request(manageToken, 'PUT', `/suppliers/${type}/${created.id}/batch`, {
  root: { name: `${created.name} Atomic` },
  contacts: [{
    id: keptContact.id,
    fullName: `${keptContact.fullName} Atomic`,
    position: keptContact.position || undefined,
    phone: keptContact.phone || undefined,
    email: keptContact.email || undefined,
  }],
  services: [{
    id: keptService.id,
    sku: keptService.sku || undefined,
    serviceName: `${keptService.serviceName} Atomic`,
    quantity: keptService.quantity,
    accountingPrice: Number(keptService.accountingPrice),
    netPrice: Number(keptService.netPrice),
    sellingPrice: Number(keptService.sellingPrice),
    description: keptService.description || undefined,
    note: keptService.note || undefined,
    metadata: keptService.metadata || undefined,
  }],
});
assert(genericBatch.name.endsWith('Atomic'), 'generic batch should update root');
assert(genericBatch.contacts[0].id === keptContact.id, 'generic batch should preserve contact id');
assert(genericBatch.supplierServices[0].id === keptService.id, 'generic batch should preserve service id');

const genericRollbackBefore = await request(manageToken, 'GET', `/suppliers/${type}/${created.id}`);
await request(manageToken, 'PUT', `/suppliers/${type}/${created.id}/batch`, {
  root: { name: `${created.name} Must Roll Back` },
  contacts: [{ id: '00000000-0000-4000-8000-000000000099', fullName: 'Foreign Contact' }],
}, [404]);
const genericRollbackAfter = await request(manageToken, 'GET', `/suppliers/${type}/${created.id}`);
assert(genericRollbackAfter.name === genericRollbackBefore.name, 'generic batch failure must roll back root');
assert(genericRollbackAfter.contacts[0].id === genericRollbackBefore.contacts[0].id, 'generic batch failure must preserve children');
```

Run `bash scripts/smoke-suppliers.sh` on the VPS worktree.

Expected: FAIL with `404`/missing route or missing service method.

- [ ] **Step 2: Import batch DTO types and add ID validation helpers**

Add imports for `UpdateGenericSupplierBatchDto`, `SupplierBatchContactDto`, `SupplierBatchGenericServiceDto`, and `SupplierBatchHotelServiceDto`. Add:

```typescript
private batchRowIds<T extends { id?: string }>(rows: T[], label: string) {
  const ids = rows.flatMap((row) => row.id ? [row.id] : []);
  if (new Set(ids).size !== ids.length) throw new BadRequestException(`${label} có ID bị trùng`);
  return ids;
}

private assertBatchIdsBelong(ids: string[], currentIds: Set<string>, message: string) {
  if (ids.some((id) => !currentIds.has(id))) throw new NotFoundException(message);
}

private async assertSupplierContactsSnapshot(
  tx: Prisma.TransactionClient,
  supplierId: string,
  rows: SupplierBatchContactDto[],
) {
  const ids = this.batchRowIds(rows, 'Danh sách liên hệ');
  const current = await tx.supplierContact.findMany({ where: { supplierId }, select: { id: true } });
  this.assertBatchIdsBelong(ids, new Set(current.map((row) => row.id)), 'Không tìm thấy người liên hệ nhà cung cấp');
}

private async assertSupplierServicesSnapshot(
  tx: Prisma.TransactionClient,
  supplierId: string,
  rows: SupplierBatchGenericServiceDto[] | SupplierBatchHotelServiceDto[],
  typedRoute: TypedSupplierRoute | null,
  hotelProfileId: string | null,
) {
  const ids = this.batchRowIds(rows, 'Danh sách dịch vụ');
  const current = await tx.supplierService.findMany({ where: { supplierId, deletedAt: null } });
  this.assertBatchIdsBelong(ids, new Set(current.map((row) => row.id)), 'Không tìm thấy dịch vụ nhà cung cấp');
  if (hotelProfileId) {
    const hotelRows = rows as SupplierBatchHotelServiceDto[];
    const normalized = this.normalizeHotelServices(hotelRows.map(({ id, ...row }) => row));
    for (const [index, row] of hotelRows.entries()) {
      if (!row.id) continue;
      const currentRow = current.find((item) => item.id === row.id)!;
      if (this.supplierBatchRowChanged(
        currentRow as unknown as Record<string, unknown>,
        normalized[index] as unknown as Record<string, unknown>,
      )) {
        await this.ensureServiceHasNoActiveHotelAllocations(tx, supplierId, row.id);
      }
    }
    for (const deleted of current.filter((row) => !ids.includes(row.id))) {
      await this.ensureServiceHasNoActiveHotelAllocations(tx, supplierId, deleted.id);
    }
    return;
  }
  const genericRows = rows as SupplierBatchGenericServiceDto[];
  this.normalizeGenericServices(genericRows.map(({ id, ...row }) => row), typedRoute);
}

private supplierBatchComparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

private supplierBatchRowChanged(current: Record<string, unknown>, next: Record<string, unknown>) {
  return Object.entries(next).some(([key, value]) => (
    this.supplierBatchComparable(current[key]) !== this.supplierBatchComparable(value)
  ));
}
```

- [ ] **Step 3: Implement contact snapshot sync**

Add `syncSupplierContactsSnapshot(tx, supplierId, rows)` that:

```typescript
const current = await tx.supplierContact.findMany({ where: { supplierId } });
const ids = this.batchRowIds(rows, 'Danh sách liên hệ');
this.assertBatchIdsBelong(ids, new Set(current.map((row) => row.id)), 'Không tìm thấy người liên hệ nhà cung cấp');
const normalized = this.normalizeSupplierContacts(rows.map(({ id, ...row }) => row));
const deletedIds = current.filter((row) => !ids.includes(row.id)).map((row) => row.id);

for (const [index, row] of rows.entries()) {
  if (row.id) await tx.supplierContact.update({ where: { id: row.id }, data: normalized[index] });
  else await tx.supplierContact.create({ data: { supplierId, ...normalized[index] } });
}
if (deletedIds.length) await tx.supplierContact.deleteMany({ where: { supplierId, id: { in: deletedIds } } });
```

When `ids` is empty, use `{ supplierId }` so an empty snapshot deletes all contacts.

- [ ] **Step 4: Implement generic service snapshot sync**

Add `syncSupplierServicesSnapshot(tx, supplierId, rows, typedRoute, hotelProfileId)`:

```typescript
const current = await tx.supplierService.findMany({ where: { supplierId, deletedAt: null } });
const ids = this.batchRowIds(rows, 'Danh sách dịch vụ');
this.assertBatchIdsBelong(ids, new Set(current.map((row) => row.id)), 'Không tìm thấy dịch vụ nhà cung cấp');
const normalized = this.normalizeGenericServices(rows.map(({ id, ...row }) => row), typedRoute);
const deletedIds = current.filter((row) => !ids.includes(row.id)).map((row) => row.id);

for (const [index, row] of rows.entries()) {
  if (row.id) {
    await tx.supplierService.update({ where: { id: row.id }, data: normalized[index] });
  } else {
    await tx.supplierService.create({ data: { supplierId, ...normalized[index] } });
  }
}

if (deletedIds.length) {
  await tx.supplierService.updateMany({
    where: { supplierId, deletedAt: null, id: { in: deletedIds } },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });
}
```

Keep the helper signature shared with Task 3. Generic calls pass `hotelProfileId = null`; hotel calls use hotel normalization and allocation guards instead of the generic branch.

- [ ] **Step 5: Implement `updateTypedSupplierBatch`**

Follow the existing typed update validation and uniqueness translation, but use `dto.root` and one transaction:

```typescript
async updateTypedSupplierBatch(type: string, id: string, dto: UpdateGenericSupplierBatchDto, user?: RequestUser) {
  const typedRoute = this.getTypedRoute(type);
  await this.ensureTypedSupplier(typedRoute, id);
  this.validateSupplierPayload(dto.root, true, false);
  this.assertCanWriteSupplierFinancialFields(dto.root, user);
  this.validateSpecializedSupplierIdentity(dto.root, true);
  this.validateTypedSupplierPayload(typedRoute, dto.root);
  if (dto.contacts !== undefined) this.normalizeSupplierContacts(dto.contacts);
  if (dto.services !== undefined) this.normalizeGenericServices(dto.services, typedRoute);
  if (dto.root.supplierCode !== undefined) await this.ensureSupplierCodeAvailable(dto.root.supplierCode, id);

  try {
    return maskSupplierFinancialFields(await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockSupplierForStatusWrite(tx, id);
      if (this.typedRouteForSupplierCategory(locked.categoryName) !== typedRoute) {
        throw new NotFoundException(SUPPLIER_ERRORS.typedSupplierNotFound);
      }
      this.requestedSupplierStatusChange(locked.status, dto.root.status);
      if (dto.contacts !== undefined) await this.assertSupplierContactsSnapshot(tx, id, dto.contacts);
      if (dto.services !== undefined) await this.assertSupplierServicesSnapshot(tx, id, dto.services, typedRoute, null);
      await tx.supplier.update({ where: { id }, data: this.toSupplierData(dto.root) as Prisma.SupplierUncheckedUpdateInput });
      if (dto.contacts !== undefined) await this.syncSupplierContactsSnapshot(tx, id, dto.contacts);
      if (dto.services !== undefined) await this.syncSupplierServicesSnapshot(tx, id, dto.services, typedRoute, null);
      return tx.supplier.findUniqueOrThrow({ where: { id }, include: this.genericInclude() });
    }), user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(SUPPLIER_ERRORS.codeExists);
    }
    throw error;
  }
}
```

- [ ] **Step 6: Run generic smoke and API lint**

Run:

```bash
bash scripts/smoke-suppliers.sh
npm run lint --workspace @smarttour/api
```

Expected: generic batch success/rollback assertions pass; the hotel batch assertions are not part of this checkpoint.

- [ ] **Step 7: Commit generic backend**

```bash
git add apps/api/src/modules/suppliers/suppliers.service.ts scripts/smoke-suppliers.sh
git commit -m "feat: save generic suppliers atomically"
```

### Task 3: Hotel Supplier Atomic Batch Service

**Files:**
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts`
- Modify: `scripts/smoke-suppliers.sh`

- [ ] **Step 1: Add hotel batch success and rollback tests**

Use the existing `ownedDataHotel` fixture before active allocations are created:

```javascript
const hotelBeforeBatch = await request(manageToken, 'GET', `/suppliers/hotels/${ownedDataHotel.id}`);
const hotelContact = hotelBeforeBatch.contacts[0];
const hotelService = hotelBeforeBatch.supplierServices[0];
const hotelAllotment = hotelBeforeBatch.allotments[0];
const hotelBatch = await request(manageToken, 'PUT', `/suppliers/hotels/${ownedDataHotel.id}/batch`, {
  root: { notes: `${run} atomic hotel note` },
  contacts: [{ id: hotelContact.id, fullName: `${hotelContact.fullName} Atomic`, phone: hotelContact.phone || undefined }],
  services: [{
    id: hotelService.id,
    sku: hotelService.sku || undefined,
    serviceName: `${hotelService.serviceName} Atomic`,
    startDate: hotelService.startDate?.slice(0, 10),
    endDate: hotelService.endDate?.slice(0, 10),
    dayType: hotelService.dayType,
    accountingPrice: Number(hotelService.accountingPrice),
    netPrice: Number(hotelService.netPrice),
    sellingPrice: Number(hotelService.sellingPrice),
  }],
  allotments: [{
    id: hotelAllotment.id,
    serviceId: hotelService.id,
    sku: hotelAllotment.sku || undefined,
    serviceName: hotelAllotment.serviceName,
    startDate: hotelAllotment.startDate?.slice(0, 10),
    endDate: hotelAllotment.endDate?.slice(0, 10),
    dayType: hotelAllotment.dayType,
    allotmentQty: hotelAllotment.allotmentQty,
    bookedQty: hotelAllotment.bookedQty,
    lockedQty: hotelAllotment.lockedQty,
    cutoffDays: hotelAllotment.cutoffDays,
    netCostPerDay: Number(hotelAllotment.netCostPerDay),
    sellingPricePerDay: Number(hotelAllotment.sellingPricePerDay),
    status: hotelAllotment.status,
  }],
});
assert(hotelBatch.contacts[0].id === hotelContact.id, 'hotel batch should preserve contact id');
assert(hotelBatch.supplierServices[0].id === hotelService.id, 'hotel batch should preserve service id');
assert(hotelBatch.allotments[0].id === hotelAllotment.id, 'hotel batch should preserve allotment id');

const hotelRollbackBefore = await request(manageToken, 'GET', `/suppliers/hotels/${ownedDataHotel.id}`);
await request(manageToken, 'PUT', `/suppliers/hotels/${ownedDataHotel.id}/batch`, {
  root: { notes: `${run} must roll back` },
  allotments: [{ id: '00000000-0000-4000-8000-000000000098', serviceName: 'Missing', allotmentQty: 1 }],
}, [404]);
const hotelRollbackAfter = await request(manageToken, 'GET', `/suppliers/hotels/${ownedDataHotel.id}`);
assert(hotelRollbackAfter.notes === hotelRollbackBefore.notes, 'hotel batch failure must roll back root');
assert(hotelRollbackAfter.allotments[0].id === hotelRollbackBefore.allotments[0].id, 'hotel batch failure must preserve allotments');
```

Run `bash scripts/smoke-suppliers.sh` and verify RED on the hotel batch route/service.

- [ ] **Step 2: Add final-state service validation**

When `services` is supplied, build the final persisted service id set from rows with ids. Before allotment writes:

```typescript
const finalServiceIds = dto.services === undefined
  ? new Set((await tx.supplierService.findMany({ where: { supplierId: id, deletedAt: null }, select: { id: true } })).map((row) => row.id))
  : new Set(dto.services.flatMap((row) => row.id ? [row.id] : []));

for (const allotment of dto.allotments || []) {
  if (allotment.serviceId && !finalServiceIds.has(allotment.serviceId)) {
    throw new ConflictException('Quỹ phòng phải tham chiếu dịch vụ còn hoạt động của cùng nhà cung cấp');
  }
}
```

This intentionally rejects references to a newly created id-less service.

- [ ] **Step 3: Implement hotel service snapshot behavior**

Extend `syncSupplierServicesSnapshot` for hotel suppliers:

- Normalize with `normalizeHotelServices`.
- For each existing row, compare normalized service fields; call `ensureServiceHasNoActiveHotelAllocations` only when the row changes.
- Create id-less rows.
- Defer missing-row soft deletes until after allotment synchronization.
- For each missing service, call `ensureServiceHasNoActiveHotelAllocations`, clear dependent `SupplierAllotment.serviceId`, then soft-delete the service.

Use a focused equality helper comparing SKU/name/date/day type, numeric price fields, description, note, quantity, and metadata after normalization. Do not update unchanged rows.

- [ ] **Step 4: Implement allotment snapshot sync**

Import `SupplierBatchAllotmentDto`, then add a pre-mutation assertion helper:

```typescript
private async assertSupplierAllotmentsSnapshot(
  tx: Prisma.TransactionClient,
  supplierId: string,
  rows: SupplierBatchAllotmentDto[],
  finalServiceIds: Set<string>,
) {
  const current = await tx.supplierAllotment.findMany({ where: { supplierId } });
  const ids = this.batchRowIds(rows, 'Danh sách quỹ phòng');
  this.assertBatchIdsBelong(ids, new Set(current.map((row) => row.id)), 'Không tìm thấy quỹ phòng');
  const normalized = this.normalizeHotelAllotments(rows.map(({ id, ...row }) => row));
  for (const allotment of normalized) {
    if (allotment.serviceId && !finalServiceIds.has(allotment.serviceId)) {
      throw new ConflictException('Quỹ phòng phải tham chiếu dịch vụ còn hoạt động của cùng nhà cung cấp');
    }
  }
  for (const [index, row] of rows.entries()) {
    if (!row.id) continue;
    const currentRow = current.find((item) => item.id === row.id)!;
    if (this.supplierBatchRowChanged(
      currentRow as unknown as Record<string, unknown>,
      normalized[index] as unknown as Record<string, unknown>,
    )) {
      await this.ensureAllotmentHasNoActiveAllocations(tx, row.id);
    }
  }
  for (const deleted of current.filter((row) => !ids.includes(row.id))) {
    await this.ensureAllotmentHasNoActiveAllocations(tx, deleted.id);
  }
}
```

Then add `syncSupplierAllotmentsSnapshot(tx, supplierId, rows, finalServiceIds)`:

```typescript
const current = await tx.supplierAllotment.findMany({ where: { supplierId } });
const ids = this.batchRowIds(rows, 'Danh sách quỹ phòng');
this.assertBatchIdsBelong(ids, new Set(current.map((row) => row.id)), 'Không tìm thấy quỹ phòng');
const normalized = this.normalizeHotelAllotments(rows.map(({ id, ...row }) => row));

for (const allotment of normalized) {
  if (allotment.serviceId && !finalServiceIds.has(allotment.serviceId)) {
    throw new ConflictException('Quỹ phòng phải tham chiếu dịch vụ còn hoạt động của cùng nhà cung cấp');
  }
}

for (const [index, row] of rows.entries()) {
  if (row.id) {
    const currentRow = current.find((item) => item.id === row.id)!;
    if (this.supplierAllotmentChanged(currentRow, normalized[index])) {
      await this.ensureAllotmentHasNoActiveAllocations(tx, row.id);
      await tx.supplierAllotment.update({ where: { id: row.id }, data: normalized[index] });
    }
  } else {
    await tx.supplierAllotment.create({ data: { supplierId, ...normalized[index] } });
  }
}

for (const currentRow of current.filter((row) => !ids.includes(row.id))) {
  await this.ensureAllotmentHasNoActiveAllocations(tx, currentRow.id);
  await tx.supplierAllotment.delete({ where: { id: currentRow.id } });
}
```

- [ ] **Step 5: Implement `updateHotelSupplierBatch`**

Mirror current hotel update validation using `dto.root`, then inside one transaction:

```typescript
const locked = await this.lockSupplierForStatusWrite(tx, id);
if (!locked.hotelProfileId) throw new NotFoundException(SUPPLIER_ERRORS.hotelSupplierNotFound);
const statusChange = this.requestedSupplierStatusChange(locked.status, dto.root.status);
if (statusChange === SupplierStatus.INACTIVE) await this.ensureHotelSupplierCanDeactivate(tx, id);

if (dto.contacts !== undefined) await this.assertSupplierContactsSnapshot(tx, id, dto.contacts);
if (dto.services !== undefined) await this.assertSupplierServicesSnapshot(tx, id, dto.services, null, locked.hotelProfileId);
const finalServiceIds = dto.services === undefined
  ? new Set((await tx.supplierService.findMany({ where: { supplierId: id, deletedAt: null }, select: { id: true } })).map((row) => row.id))
  : new Set(dto.services.flatMap((row) => row.id ? [row.id] : []));
if (dto.allotments !== undefined) await this.assertSupplierAllotmentsSnapshot(tx, id, dto.allotments, finalServiceIds);

await tx.supplier.update({
  where: { id },
  data: {
    ...this.toSupplierData(dto.root),
    ...(Object.keys(hotelProfileData).length ? { hotelProfile: { update: hotelProfileData } } : {}),
  } as Prisma.SupplierUncheckedUpdateInput,
});
if (dto.contacts !== undefined) await this.syncSupplierContactsSnapshot(tx, id, dto.contacts);
if (dto.services !== undefined) await this.syncSupplierServicesSnapshot(tx, id, dto.services, null, locked.hotelProfileId, { deferDeletes: true });
if (dto.allotments !== undefined) await this.syncSupplierAllotmentsSnapshot(tx, id, dto.allotments, finalServiceIds);
if (dto.services !== undefined) await this.softDeleteMissingHotelServices(tx, id, dto.services);
return tx.supplier.findUniqueOrThrow({ where: { id }, include: this.hotelInclude() });
```

Translate supplier-code `P2002` exactly as current hotel update does.

- [ ] **Step 6: Run Supplier backend verification**

```bash
node scripts/test-suppliers-atomic-batch-contract.js
bash scripts/smoke-suppliers.sh
node scripts/test-suppliers-child-row-apis-contract.js
bash scripts/test-suppliers-controller-contract.sh
bash scripts/test-suppliers-typed-contract.sh
bash scripts/test-suppliers-hotel-contract.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
```

Expected: backend tests pass; atomic source contract remains RED only on UI migration assertions.

- [ ] **Step 7: Commit hotel backend**

```bash
git add apps/api/src/modules/suppliers/suppliers.service.ts scripts/smoke-suppliers.sh
git commit -m "feat: save hotel suppliers atomically"
```

### Task 4: Generic Supplier UI Batch Migration

**Files:**
- Modify: `scripts/test-suppliers-client-contract.sh`
- Modify: `apps/web/app/suppliers/[type]/GenericSupplierClient.tsx`

- [ ] **Step 1: Change source-contract expectations and verify RED**

Require the generic client to contain:

```python
assert '/batch`' in generic
assert 'root: rootPayload' in generic
assert "collectionDirtyFields.contacts !== undefined ? { contacts: childPayload.contacts }" in generic
assert "collectionDirtyFields.services !== undefined ? { services: childPayload.services }" in generic
assert 'await syncSupplierContacts(' not in generic
assert 'await syncSupplierServices(' not in generic
```

Run `bash scripts/test-suppliers-client-contract.sh`.

Expected: FAIL because the generic edit still calls sequential child helpers.

- [ ] **Step 2: Build the generic batch payload**

Replace the edit flow with:

```typescript
const rootPayload = supplierRootPayload(values, canViewSupplierFinancialFields);
const childPayload = supplierChildPayload(values);
const collectionDirtyFields = dirtyFields as DirtyCollections;
const payload = editingId
  ? {
      root: rootPayload,
      ...(collectionDirtyFields.contacts !== undefined ? { contacts: childPayload.contacts } : {}),
      ...(collectionDirtyFields.services !== undefined ? { services: childPayload.services } : {}),
    }
  : { ...rootPayload, ...childPayload };

saved = await supplierApi<Supplier>(
  `/api/suppliers/${type}${editingId ? `/${editingId}/batch` : ''}`,
  { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) },
  editingId ? 'Cập nhật nhà cung cấp' : 'Tạo nhà cung cấp',
);
```

Delete the post-parent `syncSupplierContacts`/`syncSupplierServices` block and remove original contact/service snapshot state that is no longer needed. Keep ids in `toForm()` and child payload rows.

- [ ] **Step 3: Run generic client tests and lint**

```bash
bash scripts/test-suppliers-client-contract.sh
node scripts/test-supplier-ui-permission-contract.js
npm run lint --workspace @smarttour/web
```

Expected: PASS for generic source assertions; the full client contract remains RED until the hotel/shared migration in Task 5.

- [ ] **Step 4: Commit generic UI migration**

```bash
git add apps/web/app/suppliers/[type]/GenericSupplierClient.tsx scripts/test-suppliers-client-contract.sh
git commit -m "feat: batch generic supplier edits"
```

### Task 5: Hotel Supplier UI and Shared Helper Cleanup

**Files:**
- Modify: `apps/web/app/suppliers/SupplierClientUi.tsx`
- Modify: `apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx`
- Modify: `scripts/test-suppliers-client-contract.sh`
- Modify: `scripts/test-suppliers-hotel-client-ui.js`

- [ ] **Step 1: Update hotel UI mock for a single batch request**

Add a mock branch matching:

```javascript
const hotelBatchMatch = apiPath.match(/^\/api\/suppliers\/hotels\/([^/]+)\/batch$/);
if (hotelBatchMatch && method === 'PUT') {
  state.calls.hotelBatchUpdates.push({ supplierId: hotelBatchMatch[1], body });
  return jsonResponse({ ...state.hotelDetail, ...body.root });
}
```

Update edit assertions:

```javascript
assert(state.calls.hotelBatchUpdates.length === 1, 'hotel edit should send one atomic batch request');
assert(state.calls.contactCreates.length === 0 && state.calls.contactUpdates.length === 0 && state.calls.contactDeletes.length === 0, 'hotel edit should not call contact CRUD during form save');
assert(state.calls.serviceCreates.length === 0 && state.calls.serviceUpdates.length === 0 && state.calls.serviceDeletes.length === 0, 'hotel edit should not call service CRUD during form save');
assert(state.calls.allotmentCreates.length === 0 && state.calls.allotmentUpdates.length === 0 && state.calls.allotmentDeletes.length === 0, 'hotel edit should not call allotment CRUD during form save');
```

Run the hotel client UI test and verify RED.

- [ ] **Step 2: Migrate hotel edit submission**

Build the request as:

```typescript
const childPayload = hotelChildPayload(values, collectionDirtyFields);
const rootPayload = hotelSupplierPayload(values, editingId ? 'update' : 'create', collectionDirtyFields, canViewSupplierFinancialFields);
const payload = editingId ? { root: rootPayload, ...childPayload } : rootPayload;

saved = await supplierApi<HotelSupplier>(
  `/api/suppliers/hotels${editingId ? `/${editingId}/batch` : ''}`,
  { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) },
  editingId ? 'Cập nhật nhà cung cấp khách sạn' : 'Tạo nhà cung cấp khách sạn',
);
```

Delete the sequential child-sync block and remove original contact/service/allotment snapshot states and imports. Preserve row ids in current form values and payload builders.

- [ ] **Step 3: Remove shared sequential helpers**

Delete `SupplierChildRow`, `rowIdSet`, `syncSupplierChildRows`, `syncSupplierContacts`, `syncSupplierServices`, and `syncSupplierAllotments` from `SupplierClientUi.tsx`. Keep `supplierApi`, upload helpers, notices, and file rendering unchanged.

- [ ] **Step 4: Run all web contracts**

```bash
bash scripts/test-suppliers-client-contract.sh
node scripts/test-supplier-ui-permission-contract.js
SITE_URL=http://127.0.0.1:3001 bash scripts/test-suppliers-hotel-client-ui.sh
node scripts/test-suppliers-atomic-batch-contract.js
npm run lint --workspace @smarttour/web
npm run build --workspace @smarttour/web
```

Expected: all pass and the atomic contract prints `TEST_SUPPLIERS_ATOMIC_BATCH_CONTRACT_OK`.

- [ ] **Step 5: Commit hotel/shared UI migration**

```bash
git add apps/web/app/suppliers/SupplierClientUi.tsx apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx scripts/test-suppliers-client-contract.sh scripts/test-suppliers-hotel-client-ui.js
git commit -m "feat: batch hotel supplier edits"
```

### Task 6: Final Review, Documentation, Merge, and Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run the complete focused verification suite**

```bash
node scripts/test-suppliers-atomic-batch-contract.js
node scripts/test-suppliers-child-row-apis-contract.js
bash scripts/test-suppliers-controller-contract.sh
bash scripts/test-suppliers-common-contract.sh
bash scripts/test-suppliers-typed-contract.sh
bash scripts/test-suppliers-hotel-contract.sh
bash scripts/test-suppliers-client-contract.sh
node scripts/test-supplier-ui-permission-contract.js
node scripts/test-suppliers-sensitive-fields-contract.js
bash scripts/smoke-suppliers.sh
SITE_URL=http://127.0.0.1:3001 bash scripts/test-suppliers-hotel-client-ui.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
npm run lint --workspace @smarttour/web
npm run build --workspace @smarttour/web
git diff --check
```

- [ ] **Step 2: Run focused MCP review**

Review the branch against `main` with focus on:

- transaction rollback and parent lock coverage;
- child id ownership and duplicate handling;
- service/allotment final-state consistency;
- lifecycle and allocation guard preservation;
- DTO route ordering and permissions;
- UI create/file compatibility and exactly-one edit request.

Verify every finding before changing code, add a RED regression for confirmed issues, and repeat review until no actionable findings remain.

- [ ] **Step 3: Update Memory Bank**

Record:

- generic/hotel edit database changes are now atomic;
- child ids and dedicated CRUD compatibility are preserved;
- files and operational allotment actions remain intentionally separate;
- verification commands and final MCP result.

- [ ] **Step 4: Commit final docs and fixes**

```bash
git add memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: record supplier atomic batch save"
git status --short --branch
```

- [ ] **Step 5: Fast-forward, push, and deploy**

From `/opt/smarttour` after confirming `main` is clean:

```bash
git merge --ff-only fix/supplier-atomic-batch
git push origin main
BRANCH=main bash scripts/deploy-production.sh
```

- [ ] **Step 6: Verify production and clean review artifacts**

```bash
bash scripts/smoke-suppliers.sh
npm run ops:health
curl -fsS http://127.0.0.1:4000/api/health
git status --short --branch
```

Remove only the merged Supplier atomic batch worktrees/branch and test Compose resources created by this slice. Do not touch unrelated existing worktrees.

## Self-Review

- Spec coverage: atomic root/child save, stable ids, omitted/empty snapshot semantics, hotel final-state rules, backward compatibility, file/allotment-operation exclusions, tests, review, and deploy are mapped to tasks.
- Placeholder scan: no TBD/TODO or unspecified error-handling steps remain; intentionally deferred operational file/allotment actions are explicit non-goals in the approved design.
- Type consistency: controller/service names and DTO names are consistent across tasks; UI routes match API routes; batch row DTOs are full snapshots with optional UUID ids.
- Scope: one independently deployable Supplier edit-consistency slice with no schema migration or unrelated Supplier redesign.
