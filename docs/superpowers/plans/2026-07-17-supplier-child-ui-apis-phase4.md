# Supplier Child UI APIs Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Supplier edit forms to use dedicated child-row APIs for contacts, services, and hotel allotments while preserving parent create/update compatibility.

**Architecture:** Parent create still sends nested arrays so the existing create flows remain compatible. Parent edit sends root supplier fields only, then synchronizes changed child collections through `/api/suppliers/:id/contacts`, `/api/suppliers/:id/services`, and `/api/suppliers/:id/allotments`. Shared diff helpers live in `SupplierClientUi.tsx`, while generic and hotel forms keep row ids in form state and call the helper after the parent update succeeds.

**Tech Stack:** Next.js App Router, React Hook Form, TypeScript, source-contract scripts, Playwright-style hotel UI smoke.

---

## File Structure

- Modify `scripts/test-suppliers-client-contract.sh`: add source-contract assertions that edit payload builders exclude child collections and UI clients call child-row API helpers.
- Modify `apps/web/app/suppliers/SupplierClientUi.tsx`: add reusable child-row sync helpers built on `supplierApi`.
- Modify `apps/web/app/suppliers/[type]/GenericSupplierClient.tsx`: keep contact/service ids in form rows, split root payload from child payload, and sync dirty child rows after parent edit.
- Modify `apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx`: keep contact/service/allotment ids in form rows, split edit payloads from create payloads, and sync dirty child rows after parent edit.
- Modify `scripts/test-suppliers-hotel-client-ui.js`: update API mock and assertions for child-row API calls during hotel edits.
- Modify `memory-bank/activeContext.md` and `memory-bank/progress.md`: record the completed UI migration slice and verification evidence.

## Task 1: Plan Commit

**Files:**
- Create: `docs/superpowers/plans/2026-07-17-supplier-child-ui-apis-phase4.md`

- [ ] **Step 1: Save this plan**

Save the full plan at `docs/superpowers/plans/2026-07-17-supplier-child-ui-apis-phase4.md`.

- [ ] **Step 2: Commit the plan**

Run:

```bash
git add docs/superpowers/plans/2026-07-17-supplier-child-ui-apis-phase4.md
git commit -m "docs: add supplier child ui api migration plan"
```

Expected: a docs-only commit on `fix/supplier-child-ui-apis-phase4`.

## Task 2: Source Contract RED

**Files:**
- Modify: `scripts/test-suppliers-client-contract.sh`

- [ ] **Step 1: Add failing source-contract assertions**

Add assertions requiring:

```python
assert 'syncSupplierContacts(' in shared
assert 'syncSupplierServices(' in shared
assert 'syncSupplierAllotments(' in shared
assert '/contacts/${row.id}' in shared
assert '/services/${row.id}' in shared
assert '/allotments/${row.id}' in shared
assert 'function supplierRootPayload(' in generic
assert 'function supplierChildPayload(' in generic
assert 'await syncSupplierContacts(editingId, originalContactRows, childPayload.contacts' in generic
assert 'await syncSupplierServices(editingId, originalServiceRows, childPayload.services' in generic
assert 'contacts:' not in generic[generic.index('function supplierRootPayload('):generic.index('function supplierChildPayload(')]
assert 'services:' not in generic[generic.index('function supplierRootPayload('):generic.index('function supplierChildPayload(')]
assert 'await syncSupplierContacts(editingId, originalContactRows, childPayload.contacts' in hotel
assert 'await syncSupplierServices(editingId, originalServiceRows, childPayload.services' in hotel
assert 'await syncSupplierAllotments(editingId, originalAllotmentRows, childPayload.allotments' in hotel
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
```

Expected: FAIL because the shared sync helpers and UI calls are not implemented yet.

## Task 3: Shared Child Sync Helpers

**Files:**
- Modify: `apps/web/app/suppliers/SupplierClientUi.tsx`

- [ ] **Step 1: Implement reusable row diff/sync helpers**

Add these exports:

```typescript
export type SupplierChildRow = { id?: string | null };
export type SupplierChildApiPath = 'contacts' | 'services' | 'allotments';

export function rowIdSet<T extends SupplierChildRow>(rows: T[]) {
  return new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)));
}

export async function syncSupplierChildRows<T extends SupplierChildRow>(
  supplierId: string,
  apiPath: SupplierChildApiPath,
  originalRows: T[],
  nextRows: T[],
  label: string,
) {
  const nextIds = rowIdSet(nextRows);
  for (const row of originalRows) {
    if (row.id && !nextIds.has(row.id)) {
      await supplierApi(`/api/suppliers/${supplierId}/${apiPath}/${row.id}`, { method: 'DELETE' }, `${label}: xoa dong`);
    }
  }
  for (const row of nextRows) {
    const { id, ...body } = row;
    if (id) {
      await supplierApi(`/api/suppliers/${supplierId}/${apiPath}/${id}`, { method: 'PUT', body: JSON.stringify(body) }, `${label}: cap nhat dong`);
    } else {
      await supplierApi(`/api/suppliers/${supplierId}/${apiPath}`, { method: 'POST', body: JSON.stringify(body) }, `${label}: them dong`);
    }
  }
}

export function syncSupplierContacts<T extends SupplierChildRow>(supplierId: string, originalRows: T[], nextRows: T[]) {
  return syncSupplierChildRows(supplierId, 'contacts', originalRows, nextRows, 'Dong bo lien he nha cung cap');
}

export function syncSupplierServices<T extends SupplierChildRow>(supplierId: string, originalRows: T[], nextRows: T[]) {
  return syncSupplierChildRows(supplierId, 'services', originalRows, nextRows, 'Dong bo dich vu nha cung cap');
}

export function syncSupplierAllotments<T extends SupplierChildRow>(supplierId: string, originalRows: T[], nextRows: T[]) {
  return syncSupplierChildRows(supplierId, 'allotments', originalRows, nextRows, 'Dong bo quy phong nha cung cap');
}
```

- [ ] **Step 2: Keep helper behavior small**

Do not add retry, batching, optimistic UI, or extra abstractions. The child API already owns validation and locking.

## Task 4: Generic Supplier UI Migration

**Files:**
- Modify: `apps/web/app/suppliers/[type]/GenericSupplierClient.tsx`

- [ ] **Step 1: Add row ids to form types and defaults**

Change:

```typescript
type Contact = { fullName: string; position: string; birthday: string; phone: string; email: string };
type Service = { ... };
```

to:

```typescript
type Contact = { id?: string; fullName: string; position: string; birthday: string; phone: string; email: string };
type Service = { id?: string; ... };
```

Keep `freshContact()` and `freshService()` returning rows without ids.

- [ ] **Step 2: Preserve ids in `toForm()`**

Map child rows as:

```typescript
contacts: supplier.contacts?.length
  ? supplier.contacts.map((item) => ({ id: item.id, fullName: item.fullName || '', position: item.position || '', birthday: dateOnly(item.birthday), phone: item.phone || '', email: item.email || '' }))
  : [freshContact()],
services: supplier.supplierServices?.length
  ? supplier.supplierServices.map((item) => ({ id: item.id, ... }))
  : [freshService()],
```

Update `Supplier` child response types to include optional `id`.

- [ ] **Step 3: Split root and child payload builders**

Replace `supplierPayload` with:

```typescript
function supplierRootPayload(values: SupplierForm, canViewSupplierFinancialFields: boolean) {
  const { contacts, services, taxCode, bankAccountName, bankAccountNumber, bankName, ...baseValues } = values;
  return {
    ...baseValues,
    ...(canViewSupplierFinancialFields ? { taxCode, bankAccountName, bankAccountNumber, bankName } : {}),
    rating: Number.isFinite(values.rating) ? values.rating : undefined,
  };
}

function supplierChildPayload(values: SupplierForm) {
  return {
    contacts: values.contacts.map(...).filter((item) => item.fullName),
    services: values.services.map(...).filter((item) => item.serviceName),
  };
}
```

Each child row payload must keep `id` when present so the sync helper can choose `PUT` or `DELETE`.

- [ ] **Step 4: Track original edit child rows**

Add state:

```typescript
const [originalContactRows, setOriginalContactRows] = useState<Array<Contact & { id?: string }>>([]);
const [originalServiceRows, setOriginalServiceRows] = useState<Array<Service & { id?: string }>>([]);
```

In `startEdit`, after `const formValues = toForm(detail)`, call:

```typescript
setOriginalContactRows(formValues.contacts.filter((item) => item.id));
setOriginalServiceRows(formValues.services.filter((item) => item.id));
reset(formValues);
```

Clear both arrays in `closeForm`.

- [ ] **Step 5: Sync child rows after parent edit**

In `onSubmit`:

```typescript
const rootPayload = supplierRootPayload(values, canViewSupplierFinancialFields);
const childPayload = supplierChildPayload(values);
saved = await supplierApi<Supplier>(..., { body: JSON.stringify(editingId ? rootPayload : { ...rootPayload, ...childPayload }) }, ...);
if (editingId) {
  await syncSupplierContacts(editingId, originalContactRows, childPayload.contacts);
  await syncSupplierServices(editingId, originalServiceRows, childPayload.services);
}
```

If child sync fails, keep the form open and show `Khong dong bo duoc dong con nha cung cap.` through `errorText`.

## Task 5: Hotel Supplier UI Migration

**Files:**
- Modify: `apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx`
- Modify: `scripts/test-suppliers-hotel-client-ui.js`

- [ ] **Step 1: Add ids to contact form rows**

Change:

```typescript
type ContactLine = { fullName: string; ... };
```

to:

```typescript
type ContactLine = { id?: string; fullName: string; ... };
```

Keep empty rows id-less.

- [ ] **Step 2: Preserve ids in hotel `toForm()`**

Map:

```typescript
contacts: hotel.contacts.map((item) => ({ id: item.id, ... }))
services: hotel.supplierServices.map((item) => ({ id: item.id, ... }))
allotments: hotel.allotments.map((item) => ({ id: item.id, serviceId: item.serviceId ?? null, ... }))
```

- [ ] **Step 3: Split hotel payload builders**

Keep create behavior compatible:

```typescript
function hotelSupplierPayload(values, 'create', dirtyFields, canViewSupplierFinancialFields) {
  return { root fields, contacts, services, allotments };
}
```

For update, return root fields only from the parent payload. Add:

```typescript
function hotelChildPayload(values: HotelForm, dirtyFields: DirtyCollections) {
  return {
    ...(dirtyFields.contacts !== undefined ? { contacts: values.contacts.filter(...).map(...) } : {}),
    ...(dirtyFields.services !== undefined ? { services: values.services.filter(...).map(...) } : {}),
    ...(dirtyFields.allotments !== undefined ? { allotments: values.allotments.filter(...).map(...) } : {}),
  };
}
```

Each mapped child row keeps `id` and allotments keep `serviceId`.

- [ ] **Step 4: Track original hotel child rows**

Add:

```typescript
const [originalContactRows, setOriginalContactRows] = useState<Array<ContactLine & { id?: string }>>([]);
const [originalServiceRows, setOriginalServiceRows] = useState<Array<ServiceLine & { id?: string }>>([]);
const [originalAllotmentRows, setOriginalAllotmentRows] = useState<Array<AllotmentLine & { id?: string }>>([]);
```

Set them from `toForm(detail)` in `startEdit`, and clear them in `closeForm`.

- [ ] **Step 5: Sync dirty hotel child collections after parent edit**

After parent `PUT /api/suppliers/hotels/:id` succeeds:

```typescript
if (editingId) {
  if (childPayload.contacts) await syncSupplierContacts(editingId, originalContactRows, childPayload.contacts);
  if (childPayload.services) await syncSupplierServices(editingId, originalServiceRows, childPayload.services);
  if (childPayload.allotments) await syncSupplierAllotments(editingId, originalAllotmentRows, childPayload.allotments);
}
```

For create, continue sending nested children in the parent `POST`.

- [ ] **Step 6: Update hotel UI mock assertions**

Add `state.calls.contactCreates`, `contactUpdates`, `contactDeletes`, `serviceCreates`, `serviceUpdates`, `serviceDeletes`, `allotmentCreates`, `allotmentUpdates`, and `allotmentDeletes`.

Mock:

```javascript
const contactMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/contacts(?:\/([^/]+))?$/);
const serviceMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/services(?:\/([^/]+))?$/);
const allotmentMatch = apiPath.match(/^\/api\/suppliers\/([^/]+)\/allotments(?:\/([^/]+))?$/);
```

Assert an edit that changes child rows does not include `contacts`, `services`, or `allotments` in the parent update payload, and does call the child endpoints.

## Task 6: Verification, Docs, Commit, Deploy

**Files:**
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
bash scripts/test-suppliers-client-contract.sh
node scripts/test-supplier-ui-permission-contract.js
node scripts/test-suppliers-child-row-apis-contract.js
bash scripts/test-suppliers-controller-contract.sh
npm run lint --workspace @smarttour/web
```

If the Playwright environment is available, also run:

```bash
node scripts/test-suppliers-hotel-client-ui.js
```

- [ ] **Step 2: Update Memory Bank**

Add a latest session note saying Supplier UI edit flows now sync child rows through dedicated child-row APIs, parent create compatibility remains, and verification passed.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add apps/web/app/suppliers/SupplierClientUi.tsx apps/web/app/suppliers/[type]/GenericSupplierClient.tsx apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx scripts/test-suppliers-client-contract.sh scripts/test-suppliers-hotel-client-ui.js memory-bank/activeContext.md memory-bank/progress.md
git commit -m "feat: migrate supplier UI child row edits"
```

- [ ] **Step 4: Merge, deploy, and verify production**

From `/opt/smarttour`, merge the feature branch, rebuild API/Web through Docker, run:

```bash
bash scripts/smoke-suppliers.sh
npm run ops:health
```

Push `main` to `origin` only after production verification passes.

## Self-Review

- Spec coverage: Phase 4 UI migration is covered for contacts, services, and hotel allotments; parent create/update compatibility remains.
- Placeholder scan: No TBD/TODO/later placeholders remain in executable steps.
- Type consistency: The plan consistently uses `Contact`, `Service`, `ContactLine`, `ServiceLine`, `AllotmentLine`, and the shared sync helper names used by source contracts.
