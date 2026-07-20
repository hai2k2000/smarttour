# Orders Hotel Service Selectors Design

## Context

Hotel Booking already stores supplier and supplier-service identifiers on Order sales and operation rows. Active hotel suppliers already own room services and allotment rows, while the Order allotment workflow locks inventory from `OrderOperationItem.serviceId`. The current shared Orders UI does not expose those identifiers and its generic step rendering does not match the five Hotel Booking step labels.

## Goals

- Let an Order user select an active hotel supplier and one of its active room services without requiring access to the Supplier module.
- Keep `supplierId`, `serviceId`, displayed service text, selling price, and net price consistent in Hotel Booking payloads.
- Show a concise, read-only allotment availability hint without adding a new inventory ownership model.
- Reject new or changed supplier/service links that are mismatched, inactive, deleted, or not owned by a hotel supplier.
- Preserve an unchanged historical link when a previously selected supplier or service later becomes inactive or soft-deleted.
- Align Hotel Booking content with its existing five configured steps.

## Non-Goals

- No Prisma schema or migration.
- No manual allotment override, lock, confirm, or release actions in Orders.
- No change to non-hotel Order selectors or workflows.
- No holiday calendar or new day-type pricing engine.
- No Supplier create/edit controls inside Orders.

## Chosen Approach

Add an Orders-owned read endpoint and reuse the existing Order sales/operation rows. This avoids coupling Order access to `supplier.view`, returns only fields needed for booking, and gives the Orders service one place to enforce supplier/service ownership.

An UI-only implementation against `/suppliers/hotels` was rejected because it would create an unnecessary permission dependency and leave direct API writes unprotected. A dedicated Hotel Booking room-line schema was rejected because it duplicates the existing Order line and allotment relationships.

## API Design

Add `GET /orders/hotel-service-options` before the dynamic `GET /orders/:type` route. It requires `order.view` and returns a bounded array of active hotel suppliers with active, non-deleted services and active allotment summaries.

Each supplier option contains:

- `id`, `supplierCode`, `name`, and `province`.
- Minimal hotel profile labels: `hotelProject` and `classHotel`.
- `supplierServices` with `id`, `sku`, `serviceName`, `netPrice`, `sellingPrice`, and `status`.
- `allotments` with `serviceId`, date range, day type, quantities, cutoff, prices, and status.

Supplier master data remains global. The endpoint exposes no tax, bank, debt, contact, file, or policy fields.

## Link Integrity

Create a focused Orders helper that checks supplier/service pairs in Hotel Booking sales and operation rows.

- A new or changed `serviceId` requires a matching `supplierId`.
- The service must belong to that supplier.
- A new or changed pair must use an active, non-deleted service owned by an active, non-deleted hotel supplier.
- A supplier-only new link must also point to an active hotel supplier.
- During update, exact supplier/service pairs already persisted on that Order may remain even if the master record later becomes inactive or soft-deleted. Changing away from that historical pair re-enters active validation.
- Validation runs inside the existing create/update transaction before child rows and allotment locks are synchronized.

This also prevents auto-allotment from locking inventory owned by a different supplier than the Order operation row.

## UI Design

The Orders server page loads hotel service options only for `hotel-bookings` and passes them to `OrdersClient`. A failed option request falls back to an empty list; the form remains usable with an inline explanation instead of failing the entire Order page.

Hotel Booking uses its configured steps as follows:

1. `Thong tin booking`: common booking, customer, and hotel-specific root fields.
2. `Dich vu va gia`: sales room rows and operation room rows with dependent hotel/service selectors.
3. `Danh sach thanh vien`: member rows.
4. `Dieu khoan`: terms rows.
5. `Danh gia dich vu`: survey description and survey rows.

Other Order types keep their current rendering.

For each Hotel Booking line:

- Changing supplier clears a selected service that belongs to another supplier and clears fields derived from that service.
- Changing service sets the supplier, sets `serviceType` to `HOTEL`, and fills the service label.
- Sales rows fill `description` and `unitPrice` from service name and selling price.
- Operation rows fill `netPrice` from the service net price.
- Service options are filtered by the selected supplier.
- Option labels include hotel, room service, and a compact active-allotment remaining quantity hint.

When editing, service and supplier data embedded in Order detail are merged into the option state so a historical inactive selection remains visible. Historical options are labelled unavailable and cannot be selected for a new row.

## Allotment Hint

The UI calculates a read-only remaining quantity from active allotment rows as `allotmentQty - bookedQty - lockedQty`, never below zero. It uses the row service date, falling back to the Order start date, to prefer date-compatible rows. The hint is advisory; the existing transactional auto-allotment lock remains authoritative at save/status time.

No new day-type allocation behavior is introduced in this slice. The backend continues to decide the actual allotment row and returns its existing capacity error if inventory cannot be locked.

## Error Handling

- The options endpoint returns an empty list only through the page-level fallback; direct API errors retain normal HTTP status handling.
- Orders shows an inline message when no active hotel services are available.
- Supplier changes clear incompatible derived values rather than silently submitting stale identifiers.
- Backend validation errors use Vietnamese operational messages and identify whether supplier ownership, hotel type, or active status is invalid.
- Existing Order save errors continue through the current `apiMessage()` path.

## Testing

- Add a backend source contract for the static route, minimal projection, transaction validation call, and ownership checks.
- Extend Order service flows for valid hotel pairs, mismatched supplier/service rejection, inactive new pair rejection, and unchanged historical pair compatibility.
- Add a web source contract for page loading, five-step Hotel Booking mapping, dependent selectors, price auto-fill, historical option merge, and availability hint.
- Run existing Order auth, write-lock, hotel allotment, Supplier hotel, API/web lint/build, and service-flow regressions.
- Wire new contracts into SmartTour CI.

## Deployment

After merge to `main`, deploy through `scripts/deploy-production.sh`. No migration is expected. Verify API/Web containers, the internal API health endpoint, and the existing healthcheck. Authenticated smoke remains credential-dependent and must not trigger credential changes.
