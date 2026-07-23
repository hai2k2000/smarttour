# Supplier Atomic Batch Save Design

## Context

Supplier edit forms currently save the root supplier first and then synchronize contacts, services, and hotel allotments through multiple browser requests. Each child-row endpoint is individually transactional, but the full user action is not. A failure after the root update or after one child request can leave the supplier in a partially saved state.

The dedicated child-row APIs remain valuable for focused row actions and must stay compatible. The existing parent update behavior that replaces complete child collections must also remain available for existing callers, but the UI must not return to delete-all/recreate-all updates because that destroys stable child ids and can conflict with hotel allocation history.

## Goals

- Make one generic or hotel supplier edit atomic across the root record and every dirty database-backed child collection.
- Preserve ids for existing contacts, services, and allotments.
- Reuse current validation, permission, supplier locking, lifecycle, SKU, allocation, and overlap rules.
- Keep existing create, parent update, and dedicated child-row APIs backward compatible.
- Return the complete saved supplier detail only after the transaction commits.
- Provide regression coverage that proves failures leave both root and child data unchanged.

## Non-Goals

- File uploads are not part of the database transaction because object storage cannot participate in the Prisma transaction. They continue after a successful supplier save and keep the existing explicit partial-upload error message.
- Hotel allotment operations such as override, lock, confirm, and release remain separate operational actions with their existing audit and inventory semantics.
- The design does not add client-generated cross-row references. A newly created allotment cannot reference a newly created service in the same request unless the service already has a persisted id.
- No Prisma schema migration or broad Supplier module refactor is required.

## Considered Approaches

### 1. ID-aware transactional batch endpoint

Add dedicated edit endpoints that accept root data plus optional final snapshots of child collections. The API locks the supplier once, validates the complete requested state, computes row-level changes by id, and commits everything in one transaction.

This is the selected approach because it preserves child identity, provides real rollback, and leaves current APIs intact.

### 2. Reuse parent update full-array replacement

The current parent update service is already transactional when nested arrays are supplied. However, it deletes/recreates contacts, soft-deletes/recreates services, and replaces allotments. That changes ids and is incompatible with increasingly operational child data.

This approach is rejected.

### 3. Client-side compensation

The browser could attempt to restore previous root and child snapshots after a request fails. Compensation can also fail, races with other users, and cannot guarantee the original state.

This approach is rejected.

## API Contract

Two new routes are added before conflicting dynamic routes:

- `PUT /api/suppliers/:type/:id/batch` for typed generic suppliers.
- `PUT /api/suppliers/hotels/:id/batch` for hotel suppliers.

Both routes inherit `supplier.view` from the controller and explicitly require `supplier.manage`, matching existing supplier write routes.

### Generic Request

```json
{
  "root": {
    "supplierCode": "TRANS-001",
    "name": "Transport Supplier",
    "phone": "0900000000"
  },
  "contacts": [
    {
      "id": "existing-contact-uuid",
      "fullName": "Nguyen Van A",
      "phone": "0911111111"
    },
    {
      "fullName": "Tran Thi B",
      "phone": "0922222222"
    }
  ],
  "services": [
    {
      "id": "existing-service-uuid",
      "sku": "CAR-16",
      "serviceName": "Xe 16 cho"
    }
  ]
}
```

### Hotel Request

```json
{
  "root": {
    "supplierCode": "HOTEL-001",
    "name": "SmartTour Hotel",
    "phone": "0900000000",
    "classHotel": "4 sao"
  },
  "contacts": [],
  "services": [
    {
      "id": "existing-service-uuid",
      "sku": "DELUXE",
      "serviceName": "Deluxe Room",
      "netPrice": 1200000
    }
  ],
  "allotments": [
    {
      "id": "existing-allotment-uuid",
      "serviceId": "existing-service-uuid",
      "serviceName": "Deluxe Room",
      "allotmentQty": 10,
      "status": "ACTIVE"
    }
  ]
}
```

### Snapshot Semantics

- `root` is required and uses a root-only update DTO. Nested child fields are not accepted inside `root`.
- A child collection omitted from the request remains unchanged.
- A child collection supplied in the request is the desired final snapshot for that collection.
- An empty supplied collection removes every removable current row in that collection.
- A row with `id` updates and preserves that row.
- A row without `id` creates a new row.
- A current row whose id is absent from a supplied snapshot is deleted according to existing semantics: contacts hard-delete, services soft-delete, and allotments hard-delete after allocation guards pass.
- Every supplied id must be unique within its collection and must belong to the requested supplier. Unknown, inactive, or foreign ids reject the whole request.
- Batch rows use full create-shaped validation plus an optional UUID id. They are snapshots, not partial row patches.

## Transaction Design

The service performs request-shape and permission-safe validation before the transaction, then performs all state-sensitive checks and writes inside one interactive Prisma transaction.

1. Lock the supplier with the existing `SELECT ... FOR UPDATE` helper.
2. Revalidate that the locked supplier is active, not deleted, and matches the requested typed or hotel route.
3. Validate the requested lifecycle/status transition and financial-field permissions using current rules.
4. Load current child rows through the transaction client after the parent lock.
5. Validate duplicate ids, row ownership, complete final service SKU uniqueness, hotel allocation restrictions, allotment overlap rules, and final service/allotment references before mutation.
6. Update the root supplier and hotel profile fields.
7. Apply contact creates, updates, and deletes.
8. Apply service creates and changed-row updates while retaining rows scheduled for deletion until allotment validation and writes finish.
9. Apply allotment creates, changed-row updates, and deletes. Changed or deleted allotments retain the existing active-allocation guards.
10. Soft-delete services absent from the final snapshot. Hotel service changes/deletions retain the existing active-allocation guard. If `allotments` is omitted, deleting a service keeps current child-API behavior and clears that service id from dependent allotments; if `allotments` is supplied, no final allotment may reference a deleted service.
11. Re-read the complete typed or hotel supplier through the transaction client and return it after commit.

Any validation or database error rolls back the root and every child change. The service continues translating the existing supplier-code uniqueness conflict to the current Vietnamese business error.

## Final-State Validation

Validation is based on the desired final snapshot instead of validating each request as an isolated browser operation.

- Existing row ids cannot be duplicated or moved from another supplier.
- Generic and hotel service SKUs remain unique among active final services.
- A provided hotel allotment `serviceId` must refer to an active service that remains after the same batch.
- A newly created id-less service cannot be referenced by an allotment in the same request; the caller must save the service first and use its returned id in a later focused allotment action.
- Removing a hotel service still fails when active locked or confirmed allocations depend on it.
- Updating or removing an allotment still fails when active allocations make that operation unsafe.
- Hotel allotment date/day/SKU overlap validation evaluates the complete final allotment snapshot.
- Unchanged rows are not rewritten and do not trigger update-only guards unnecessarily.

## UI Data Flow

Generic and hotel edit forms keep their existing root and child payload builders, but submit one batch request:

```text
form values
  -> root payload + dirty child snapshots with ids
  -> one batch endpoint
  -> one database transaction
  -> refreshed complete supplier detail
```

- Generic edit sends `root` plus dirty `contacts` and/or `services`.
- Hotel edit sends `root` plus dirty `contacts`, `services`, and optional `allotments` when that collection is exposed by a caller.
- Supplier create continues using the existing atomic parent `POST` with nested children.
- Dedicated contact/service/allotment CRUD endpoints remain available for focused row workflows.
- Remove the sequential `syncSupplierContacts`, `syncSupplierServices`, and `syncSupplierAllotments` browser helpers and their form imports after both edit callers migrate; focused child actions continue calling their dedicated endpoints directly through `supplierApi`.
- On batch failure, the form remains open and shows one API error; no database portion of the edit has been saved.
- Pending files upload only after the batch succeeds, preserving current object-storage error behavior.

## Error Handling

- Validation errors remain `400` with existing Vietnamese field messages.
- Foreign or missing child ids use disclosure-safe not-found behavior and roll back the entire batch.
- Active allocation, lifecycle, SKU, or overlap conflicts remain `409` with the existing operational reason.
- Unexpected Prisma errors are rethrown; only known supplier-code uniqueness conflicts are translated.
- The UI does not report partial database success because the endpoint has no partial-success response.

## Compatibility and Rollout

- Existing `POST` and `PUT` supplier routes remain unchanged.
- Existing dedicated child CRUD routes remain unchanged.
- Only edit-form callers migrate to the batch routes.
- No database migration is needed.
- The rollout can be reverted at the UI call site without deleting the batch API, and old API clients continue working.

## Testing Strategy

### API and Source Contracts

- Require both batch controller routes before dynamic route dispatch.
- Require `supplier.manage`, nested DTO validation, optional UUID ids, and root-only DTOs.
- Require the batch service paths to lock the supplier and write through one transaction client.
- Preserve current child CRUD and parent route contracts.

### Database-Backed Service Tests

- Generic root plus contact/service changes commit together.
- Hotel root plus contact/service/allotment changes commit together.
- An invalid child after a valid root change leaves the root unchanged.
- A root uniqueness failure leaves child rows unchanged.
- Existing child ids survive updates.
- Omitted collections remain unchanged; empty collections apply deletion semantics.
- Duplicate, foreign, inactive, or missing child ids reject without mutation.
- Active allocation conflicts roll back every root and child change.
- Final service/allotment reference and overlap validation rejects incompatible snapshots atomically.
- Concurrent focused child writes serialize through the same supplier row lock.

### Web Tests

- Generic edit makes exactly one batch request and no sequential child requests.
- Hotel edit makes exactly one batch request and no sequential child requests.
- Create remains on the current parent `POST` contract.
- Only dirty collections are included, and child ids remain in snapshot payloads.
- A batch error keeps the form open and displays the API reason.
- File upload still starts only after the batch succeeds.

### Verification

- Supplier controller, child-row, typed, hotel, client, sensitive-field, permission, and hotel UI contracts.
- Supplier API/service smoke tests.
- API and web TypeScript lint plus production builds.
- `git diff --check` and focused MCP `codex-review` before merge.
- Production deployment through `scripts/deploy-production.sh`, followed by Supplier smoke, healthcheck, and internal API health probe.

## Success Criteria

- A user-visible supplier edit either commits all requested database changes or commits none.
- Existing child ids and operational history are preserved.
- Existing clients and focused child-row workflows remain compatible.
- Allocation and lifecycle guards are not weakened.
- Focused MCP review reports no actionable correctness issues before deployment.
