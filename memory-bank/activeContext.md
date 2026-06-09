# Active Context

## Current Focus

Tour Management core redesign is now the active implementation area after the first FIT prototype.

## Immediate Next Tasks

1. Continue Orders module after first shared order implementation: hotel booking specific room service selectors, receipts/payments, export/Word/PDF, approval UI, and member import/export.
2. Continue Quotes module: quote detail/print/PDF, import/export, convert-to-booking payloads, approval comments UI, and customer lookup.
3. Continue Supplier module: upload files, import/export, debt/payment links, transaction-aware soft delete, and specialized child tables where needed.
4. Add real file upload storage for common tour and supplier attachments.
5. Implement common revenue, cost, receipt, payment, expense, and report flows.
6. Add authentication and RBAC enforcement.

## Notes

The repository lives on the VPS under `/opt/smarttour` and tracks `git@github.com:hai2k2000/smarttour.git`.
Docker build remains the verified deploy path for API/web on the VPS because host-level workspace builds still have broken `node_modules/.bin` CLI resolution. Booking service and tour-type APIs have current isolated coverage and production smoke coverage.

## Latest Session Notes

- Continued P2 FIT changed-field child sync and attachment ownership cleanup:
  - FIT update now syncs common Tour children by changed field groups instead
    of recreating every common child collection on every update.
  - Attachment metadata is upload-endpoint owned after create/import: step
    saves and full updates strip/ignore attachment patches so uploaded common
    `tour_attachments` and legacy snapshots are not overwritten by autosave.
  - FIT wizard pricing step payload no longer sends `attachments`; file upload
    remains routed through multipart `POST /api/fit-tours/:id/attachments`.
  - VPS verification passed on 2026-06-09: API/web Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`,
    API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT export CSV workflow:
  - Added CSV download `GET /api/fit-tours/:id/export` and kept legacy
    `POST /api/fit-tours/export` on the same export service path.
  - `FitToursService.exportCsv()` builds the file from scoped FIT detail and
    requires the common `tourId`, so stale legacy common fields do not drive
    export output.
  - The FIT list UI now downloads the CSV through the new endpoint.
  - VPS verification passed on 2026-06-09: API/web Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`,
    API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT attachment upload workflow:
  - Added multipart `POST /api/fit-tours/:id/attachments` for real FIT file
    uploads through `FilesService` / MinIO, scoped by `fitTourId` and workflow
    step.
  - Upload persistence now writes canonical metadata to common
    `tour_attachments` through `TourCoreService.addAttachment()` and keeps a
    legacy `fit_attachments` snapshot through `FitTourLegacyCompatService`.
  - The FIT wizard now uploads selected files immediately, refreshes from the
    returned FIT detail, and keeps `fileUrl` / `uploadedBy` metadata in the form
    schema.
  - VPS verification passed on 2026-06-09: API/web Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`,
    API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT draft/confirm flow separation:
  - `PATCH /api/fit-tours/:id/steps/:step` now saves only a draft of the
    current wizard step and no longer advances `workflowStatus`.
  - Added `POST /api/fit-tours/:id/steps/:step/confirm` and
    `FitToursService.confirmStep()` so workflow advancement happens only on an
    explicit confirm action.
  - The FIT wizard now exposes separate `Lưu nháp` and `Xác nhận bước` actions;
    autosave remains draft-only.
  - VPS verification passed on 2026-06-09: API/web Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`,
    API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT wizard step-save contract cleanup:
  - Added `FIT_TOUR_STEP_FIELDS` and `PATCH /api/fit-tours/:id/steps/:step`
    so existing FIT wizard records can save only the current workflow step.
  - `FitToursService.saveStep()` now filters payloads by step, advances the
    workflow only forward, and ignores fields outside the active step while
    preserving common Tour root/child sync.
  - The FIT wizard now autosaves/submits existing records with step-scoped
    PATCH payloads instead of sending the whole aggregate through `PUT` on
    every step.
  - VPS verification passed on 2026-06-09: API/web Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`,
    API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT and LandTour ownership cleanup:
  - FIT root create/update now delegates to `TourCoreService.createRoot()` /
    `updateRoot()` instead of direct `tx.tour.create()` / `tx.tour.update()`
    in `FitToursService`.
  - Cleaned remaining FIT mojibake validation messages and legacy fallback
    service labels in `FitTourLegacyCompatService`.
  - Locked FIT root boundary/static text regressions in
    `scripts/test-fit-tour-root-contract.sh`.
  - Completed LandTour terms ownership cleanup: `termsVi` / `termsEn` are no
    longer written to `LandTourDetail`; common `tour_terms` owns canonical
    term rows while response overlays preserve the existing API shape.
  - VPS verification passed on 2026-06-09: `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and
    `HEALTHCHECK_OK`.

- Continued P2 LandTour guide ownership cleanup:
  - Stopped writing `guideName` into `LandTourDetail`; LandTour guides now live
    in common `tour_guides` rows with `guideType = LANDTOUR`.
  - Added a response overlay so existing LandTour API/UI consumers still receive
    `landTour.guideName`, derived from the common guide row.
  - Reclassified `guideName` into LandTour child/common guide DTO fields and
    marked legacy `LandTourDetail.guideName` as a read-only snapshot in schema
    comments and migration notes.
  - Extended tour-type regression to verify legacy detail `guideName` stays
    null, the common LANDTOUR guide row is written, list search finds the
    guide, and list responses do not expose guide payload just for overlay.
  - VPS verification passed on 2026-06-09: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 GIT link/customer ownership cleanup:
  - Stopped writing `agentName` into `GitTourDetail`; GIT agents now live in
    common `tour_customers` rows with `customerType = AGENT`.
  - Added a response overlay so existing GIT API/UI consumers still receive
    `gitTour.agentName`, derived from the common agent customer row.
  - Marked legacy `GitTourDetail.agentName` as a read-only snapshot in schema
    comments and migration notes.
  - Extended tour-type regression to verify legacy detail `agentName` stays
    null, the common AGENT customer row is written, list search finds the
    agent, and list responses keep the primary customer focused.
  - VPS verification passed on 2026-06-09: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 field ownership and legacy-read-only cleanup:
  - Documented the common Tour root vs product extension ownership matrix in
    `docs/tour-migration-notes.md`.
  - Marked legacy `GitTourDetail.branch`, `department`, and `customerSource`
    schema fields as read-only snapshots whose canonical values live on `Tour`.
  - Extended tour-type regression guards so GIT/LandTour DTO detail groups and
    detail mappers cannot reintroduce common root fields.
  - VPS verification passed on 2026-06-09: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT copy orchestration cleanup:
  - Changed FIT copy-budget/copy-operation to use a focused
    `replaceFitTourServices()` helper, which updates common `tour_services`
    and derived suppliers through `TourCoreService.replaceServicesAndSuppliers`
    instead of resyncing every common Tour child row.
  - Updated FIT service mapping so `mapTourServices()` returns common
    `TourService` create rows directly, and fixed remaining FIT validation /
    workflow messages with proper Vietnamese accents.
  - Extended FIT root contract guards to prevent copy actions from calling
    full common-child sync and to catch mojibake validation messages.
  - VPS verification passed on 2026-06-09: `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 service cleanup for FIT defaults:
  - Added shared `fit-tour-defaults.ts` for FIT default handover items and
    survey questions.
  - Removed duplicated default handover/survey constants from the main FIT
    service and legacy compatibility service, and fixed accented fallback text
    for legacy handover/survey rows.
  - Updated FIT regression guards so service files must import shared defaults
    and cannot reintroduce duplicate default constants.
  - VPS verification passed on 2026-06-09: `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Started P2 backend cleanup after P1 pass:
  - Fixed mojibake Vietnamese messages in `TourCoreService`, `GitToursService`,
    and FIT required-field validation.
  - Restored Vietnamese accents for FIT default handover items and survey
    questions in both the main FIT service and legacy compatibility service.
  - Added regression guards so Tour/FIT tests fail if mojibake messages or
    accent-stripped FIT defaults reappear.
  - VPS verification passed on 2026-06-09: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P1 copy-service source boundary cleanup:
  - `TourCoreService.copyServicesFromTour()` now owns source Tour lookup, type
    filtering, data-scope filtering, service clone, and service/supplier
    replacement for common service copy flows.
  - GIT and LandTour `copyServices()` actions now only validate the target and
    delegate source lookup/copy orchestration to the Tour core boundary.
  - Tour-type regression now guards against product modules querying source
    Tour services directly for copy actions.
  - VPS verification passed on 2026-06-09: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P1 common tour copy boundary cleanup:
  - `TourCoreService` now owns `copyServices()`, wrapping service clone and
    service/supplier replacement in one common helper.
  - GIT and LandTour `copyServices()` actions now delegate to
    `tourCore.copyServices()` instead of directly coordinating
    `cloneServicesForCopy()` plus `replaceServicesAndSuppliers()` in each
    product module.
  - FIT root contract coverage now also verifies `copyBudget()` fallback from
    pricing-only common `TourCost` rows when legacy FIT cost rows are stale.
  - VPS verification passed on 2026-06-09: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued FIT common-root cost read cleanup:
  - FIT common/hotel/private pricing rows now sync to common `TourCost` with
    tagged `costType` values like `FIT_COMMON_COST:CAR`, preserving both the
    FIT cost group and service type in the common root table.
  - FIT detail now rebuilds `commonCosts`, `hotelCosts`, and `privateCosts`
    from tagged common `TourCost` rows when present, so stale legacy FIT cost
    tables no longer win on reads.
  - FIT list uses common `TourCost.costType` tags to refresh cost `_count`
    values without exposing the nested Tour root payload.
  - Regression now stales legacy FIT cost rows and verifies detail reads the
    common `TourCost` source instead. VPS verification passed on 2026-06-09:
    API Docker build/deploy, `HEALTHCHECK_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`.

- Continued FIT legacy read-side cleanup:
  - FIT detail/list now overlay service, guide, attachment, and survey response
    fields from the common `Tour` root when those common rows exist. The API
    keeps the existing FIT wizard response shape, but stale legacy child rows no
    longer win for budget/operation services.
  - Copy-budget/copy-operation source data now benefits from the same common
    root overlay, reducing dependency on legacy FIT child tables while legacy
    writes remain isolated for compatibility.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`.

- Continued P1 finance/report and FIT date hardening:
  - Finance receipt/payment/invoice create/update/import/approve/cancel paths now
    require a resolvable common `tourId`; linked customer/order/supplier/voucher
    consistency is validated before writes.
  - Finance file cleanup uses `removeIfPresent()` and parses both current
    `/api/files/download?key=...` URLs and legacy `/files/...` URLs.
  - Reversal records now preserve scope/link data and receipt order allocations,
    keeping cashflow and debt reports tied back to the same tour/order context.
  - FIT DTO/service/legacy date handling now matches the date-only
    `YYYY-MM-DD` contract used by common/GIT/LandTour and avoids direct
    timezone-prone `new Date(text)` parsing.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, and `TEST_FIT_TOUR_ROOT_CONTRACT_OK`.

- Continued common Tour DTO date-only contract normalization:
  - Common `CreateTourDto` now exports `TOUR_DATE_PATTERN` and uses
    `IsString` + `Matches(YYYY-MM-DD)` for booking, payment due, start, and
    end dates instead of `IsDateString()`.
  - Tour-type regression now guards the common Tour date pattern and verifies
    common `/api/tours` rejects ISO datetime date payloads at the API contract
    layer.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued common Tour root write boundary cleanup:
  - Common `ToursService.create()` now creates root rows through
    `TourCoreService.createRoot()` and fetches the full include payload after
    logging so the API response shape stays stable.
  - Common `ToursService.update()` now updates root rows through
    `TourCoreService.updateRoot()` and then fetches the full include payload,
    so order validation, date-only parsing, and date-range validation all live
    behind the Tour core boundary.
  - `scripts/test-tour-type-apis.sh` now guards common `ToursService` against
    direct `tx.tour.create()` / `tx.tour.update()` root writes and direct
    `tourCore.toTourData()` calls.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued P1/P2 duplicate root mapping cleanup:
  - Removed the stale private Tour root mapper and duplicate order/date/number
    helpers from common `ToursService` after its create/update flow had moved
    to `TourCoreService.toTourData()` and shared date-range helpers.
  - Kept only the small query-normalization helper needed for `type`/`status`
    filters in `ToursService`.
  - `scripts/test-tour-type-apis.sh` now statically guards common
    `ToursService` against reintroducing duplicate root mappers, private date
    parsers, number parsers, required-text validation, or duplicate order-link
    validation.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued P1 Tour date range validation normalization:
  - Added shared `TourCoreService.ensureDateRange()` and
    `ensureUpdatedDateRange()` so common Tour root writes reject
    `startDate > endDate` and also validate partial updates against the
    existing stored counterpart date.
  - GIT and LandTour already write through `TourCore.createRoot()` /
    `updateRoot()`, and common `ToursService` now calls the same range helpers
    around its direct root writes.
  - Tour-type API regression now covers invalid common Tour create ranges,
    invalid common/GIT partial date updates, invalid GIT/LandTour create
    ranges, and equal LandTour start/end dates for one-day tours.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued P1 date validation normalization for Tour core, GIT, and LandTour:
  - `TourCoreService.optionalDate()` now accepts date-only `YYYY-MM-DD` strings
    and validates the real calendar date with UTC components instead of using
    `new Date(text)` directly.
  - GIT and LandTour DTO date fields now use explicit `YYYY-MM-DD` regex
    contracts instead of `IsDateString()`, so ISO datetime payloads are
    rejected before root sync.
  - Tour-type API regression now checks the date regex contract, rejects GIT
    ISO datetime payloads, and rejects non-existent LandTour calendar dates.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued P1 DTO/validation contract normalization for GIT and LandTour:
  - Added explicit DTO field groups for GIT and LandTour create/update
    contracts: common Tour root, lifecycle status, workflow step,
    linked/customer data, product detail fields, legacy aliases, and child
    collections.
  - GIT now classifies `route` as common Tour root data,
    `itinerarySummary` as GIT detail data, and `agentName` as linked/customer
    data rather than a pure detail field.
  - LandTour now classifies `route` as common Tour root data and keeps
    `itinerarySummary` only as a legacy route alias, not detail data.
  - `scripts/test-tour-type-apis.sh` now guards the GIT/LandTour DTO field
    groups and verifies `status` stays separate from `workflowStep`.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued P1 common child orchestration cleanup:
  - Added `TourCommonChildren` and `TourCoreService.replaceCommonChildren()`
    so common customer, revenue, cost, service/supplier, guide, attachment,
    survey, and term replacement can be orchestrated through the Tour core.
  - FIT, GIT, and LandTour now build a common child payload and delegate the
    replace sequence to Tour core instead of calling individual common child
    replace helpers from product services.
  - Tour-type and FIT root-contract tests now statically guard this boundary
    while still allowing copy-services actions to use
    `replaceServicesAndSuppliers()` directly.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued P1 service/supplier common ownership cleanup:
  - Added `TourCoreService.replaceServicesAndSuppliers()` to keep common
    `tour_services` replacement and derived `tour_suppliers` replacement as
    one shared operation.
  - FIT, GIT, and LandTour now use the shared helper for service/supplier sync
    instead of calling `replaceServices()` and `replaceSuppliers()` directly
    from product modules.
  - FIT root-contract and tour-type API tests now statically guard against
    direct module-level `replaceServices()` / `replaceSuppliers()` calls.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued P1 common child-service normalization:
  - Added `TourCoreService.cloneServicesForCopy()` to own common
    `tour_services` clone mapping for copy actions.
  - GIT and LandTour `copyServices()` now delegate service-row cloning to the
    Tour core helper, then refresh common services and derived suppliers.
  - `scripts/test-tour-type-apis.sh` now statically rejects inline
    `source.services.map(...)` copy mapping in GIT/LandTour services and
    runtime-tests both copy-services endpoints.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Started P1 Tour backend normalization:
  - GIT and LandTour DTOs now expose `route` as the common Tour-root route
    field.
  - GIT/LandTour root sync now maps `Tour.route` from `route`, while keeping
    `itinerarySummary` as a legacy alias fallback for existing clients.
  - GIT keeps `itinerarySummary` on `gitTourDetail` as the type-specific
    itinerary summary, so common route and detail itinerary are no longer
    collapsed into one field.
  - `scripts/test-tour-type-apis.sh` now asserts GIT route/detail separation
    and LandTour route precedence over the legacy alias.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued standardizing Tour-root orchestration across tour-type modules:
  - Added `TourCoreService.createRoot()` as the shared root creation boundary
    next to `updateRoot()`.
  - GIT and LandTour create/update now write the common `Tour` root through
    `TourCoreService.createRoot()` / `updateRoot()` before writing their
    type-specific detail rows and children.
  - `scripts/test-tour-type-apis.sh` now statically guards GIT and LandTour
    against direct `tx.tour.create()` / `tx.tour.update()` calls in module
    services.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued separating common `TourStatus` lifecycle from tour workflow:
  - `TourCoreService` no longer derives `Tour.status` from an arbitrary
    `workflowStep`; lifecycle status is now derived from workflow only when a
    module provides an explicit `statusFromWorkflow` mapper.
  - FIT keeps the explicit workflow-to-lifecycle mapper and now declares at
    the Tour core boundary that raw `status` and `workflowStep` payload fields
    are not accepted for FIT root sync.
  - Common Tour, GIT, and LandTour workflow-step updates now preserve existing
    lifecycle `status`; lifecycle updates continue to use explicit `status`
    writes.
  - Regression coverage was added to `scripts/test-tour-type-apis.sh` and the
    FIT root contract guard was tightened.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued the `tour-backend-issues.md` P0 FIT DTO/source-of-truth cleanup:
  - `CreateFitTourDto` now publishes explicit field groups for common Tour
    root fields, link/customer fields, FIT workflow, FIT detail fields, and
    legacy child collections.
  - `UpdateFitTourDto` reuses the same approved field surface so create/edit
    contracts do not drift.
  - FIT DTOs no longer expose common Tour lifecycle/workflow override fields
    (`status` and `workflowStep`); `FitToursService` also strips those keys
    from direct service payloads before syncing the common Tour root.
  - `scripts/test-fit-tour-root-contract.sh` now locks the DTO grouping
    contract and verifies runtime payloads cannot override derived common
    `Tour.status` / `Tour.workflowStep`.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued standardizing FIT create/update/remove/copy orchestration:
  - `FitToursService` public create/update/remove/copy methods now delegate to
    explicit aggregate helpers: `createFitTourAggregate`,
    `updateFitTourAggregate`, `removeFitTourAggregate`,
    `copyFitBudgetAggregate`, and `copyFitOperationAggregate`.
  - Added preparation helpers for create/update validation and snapshot merge,
    plus focused helpers for common Tour root creation, legacy FIT detail
    creation/update, action logging, actor resolution, and unique-code conflict
    handling.
  - The FIT workflow now reads as common Tour orchestration first, legacy FIT
    compatibility second, then log.
  - `scripts/test-fit-tour-root-contract.sh` now statically asserts the
    orchestration helper boundary in addition to the legacy compatibility
    boundary.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued isolating FIT legacy dual-write behavior:
  - Moved FIT legacy child create/sync/copy responsibilities into
    `FitTourLegacyCompatService` (`toChildCreateData`, `syncChildren`,
    `replaceBudgetServices`, and `replaceOperationServices`).
  - `FitToursService` now orchestrates `Tour` root/common sync first, then
    delegates legacy FIT child persistence to the compatibility layer.
  - Common FIT mappers in `FitToursService` now delegate row-shape mapping to
    the compatibility service so legacy row mapping has one owner.
  - Added a static boundary assertion in `scripts/test-fit-tour-root-contract.sh`
    to prevent direct legacy FIT child table writes from returning to
    `FitToursService`.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued the `tour-backend-issues.md` P0 FIT read-side root-source work:
  - FIT list now selects the linked common `Tour` root only for internal
    snapshot overlay, then returns the existing lightweight list shape without
    exposing nested `tour` payloads.
  - FIT list search now checks common `Tour.systemCode`, `Tour.tourCode`,
    `Tour.name`, and `TourCustomer` name/phone in addition to legacy FIT
    fields.
  - FIT detail/list now overlay common fields from `Tour` / `TourCustomer`
    (`quoteCode`, `tourCode`, `tourName`, dates, owner/route fields, and
    primary customer snapshot) so stale legacy common fields do not become
    the source of truth.
  - `scripts/test-fit-tour-root-contract.sh` now corrupts legacy FIT common
    fields and verifies list/detail still return/search by the common root.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Started the `tour-backend-issues.md` P0 Tour-root refactor in FIT:
  - Confirmed the common `Tour` root, common child tables, and separate
    `TourStatus` / `FitTourWorkflowStatus` enums already exist in schema.
  - Reordered FIT create/update so the common `Tour` root and common child
    sync run before the legacy FIT detail/child writes.
  - Renamed the FIT sync helpers around explicit ownership:
    `syncTourRootFromFit`, `syncTourCoreFromFit`, and
    `syncLegacyFitChildren`.
  - Updated `copyBudget()` and `copyOperation()` so copy actions also refresh
    common `tour_services` and derived `tour_suppliers`, not only the legacy
    `fit_budget_services` / `fit_operation_services` rows.
  - FIT remove now soft-deletes the common `Tour` root before cancelling the
    legacy FIT workflow detail.
  - Added `scripts/test-fit-tour-root-contract.sh` to lock FIT create/update,
    copy budget, copy operation, and remove behavior against the common
    `Tour` root.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Hardened Booking DTO and controller/API contract:
  - Added `ListBookingsQueryDto` for `/api/bookings` query validation:
    normalized search/status filters and bounded `take`/`skip` paging.
  - Locked Booking controller route contract with an audit script: list/detail
    use `booking.view`, create/update/status/delete use `booking.manage`, the
    lightweight delete guard also requires `booking.manage`, and partial
    booking updates remain `PATCH` rather than `PUT`.
  - Split `UpdateBookingDto` into non-nullable fields and clearable fields so
    partial updates preserve omitted data but reject `null` for core fields
    such as dates, pax, and total sell price.
  - Status remains rejected from the general update DTO and must use
    `PATCH /api/bookings/:id/status`.
  - Booking list response remains a stable, lightweight frontend summary
    without contact details, linked IDs, timestamps, or tour-program detail.
  - Booking detail response shape is now explicitly regression-tested.
  - Once a booking has an operation form, operation voucher, or allotment lock,
    structural fields and customer/contact snapshots are locked; `saleOwner`
    and `operatorOwner` remain editable for assignment changes.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_BOOKINGS_CONTROLLER_CONTRACT_OK`, `TEST_ROUTE_PERMISSIONS_OK`,
    `TEST_BOOKINGS_SERVICE_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API
    redeploy, and `HEALTHCHECK_OK`.

- Standardized Booking input normalization across API and web:
  - Booking codes are now validated consistently in the active web form and
    backend: trim, uppercase, 2-64 ASCII letters/digits, hyphen, or underscore,
    with no spaces or diacritics.
  - Confirmed and retained existing customer/owner/contact validation:
    customer names are 2-180 characters, owner names are 2-120, phone numbers
    contain 6-15 digits, and emails are normalized to lowercase with a
    160-character maximum.
  - `totalSellPrice` remains optional for newly created `DRAFT` bookings.
    Missing values intentionally default to `0` in both the service contract
    and database schema so an initial draft can be saved before pricing is
    finalized.
  - The Booking form now explains the draft-price behavior and lets the API
    apply the default instead of silently inserting a web-only fallback.
  - VPS verification passed on 2026-06-09: API/web Docker builds and
    `TEST_BOOKINGS_SERVICE_OK`.

- Expanded Booking data-scope regression coverage without changing production
  behavior:
  - Branch-only, department-only, combined branch+department, missing-scope,
    and unrestricted users now have explicit list/detail/write assertions.
  - Customer-only, Order-only, and Tour-only Booking links are covered
    independently so all three authorization paths remain visible.
  - Combined scope still requires one relation to match both branch and
    department; matching those values across different relations is denied.
  - Scoped users cannot read or create a Booking without a scoped Customer,
    Order, or Tour link, while unrestricted users retain access.
  - Every explicitly supplied linked entity must be in scope, preventing an
    allowed relation from masking another out-of-scope relation.
  - VPS verification passed on 2026-06-09: `BOOKING_SCOPE_OK`,
    `TEST_AUTH_DATA_SCOPE_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Optimized Booking list/detail usage:
  - Booking list now returns a dedicated summary shape containing only fields
    used by `/bookings` and the Operations booking selector.
  - Added validated `take`/`skip` paging with a default limit of 100 and a
    maximum of 500; `/bookings` renders 50 rows per page and Operations
    requests exactly 80 rows.
  - Added a lightweight `/bookings/:id/delete-guard` endpoint returning
    dependency counts so the Booking page no longer loads full detail before
    deletion.
  - Full detail remains available for API consumers, but its operation form is
    summary-only and voucher/allotment previews remain capped at 20.
  - Added Booking indexes for start-date ordering plus status/tour-program
    filters.
  - With 300 test rows, Booking list measured 20.3 ms for the default 100-row
    page and 26.2 ms for 300 requested rows, with a 439.6-byte average row
    payload.
  - VPS verification passed on 2026-06-09: API/web builds,
    `LIST_VIEW_INCLUDE_AUDIT_OK`, `TEST_BOOKINGS_SERVICE_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_LIST_VIEW_PERFORMANCE_OK`.

- Made Booking deletion atomic and dependency-safe:
  - `BookingsService.remove()` now locks the Booking row and checks operational
    dependencies inside one database transaction before hard deletion.
  - Deletion remains blocked for operation forms, operation vouchers, and
    supplier allotment allocations so `SET NULL` relations cannot erase
    operational history.
  - Customer, Order, and Tour are parent links and remain intact when an
    otherwise unused Booking is deleted.
  - Booking currently has no `deletedAt`; soft delete was not introduced
    because it would require a schema migration plus consistent filtering and
    unique-code behavior across all Booking reads/writes.
  - Tests verify exact conflict messages, rollback integrity, and preservation
    of linked Customer/Order/Tour records.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`.

- Localized Booking DTO validation:
  - Added Vietnamese `class-validator` messages for Booking codes, linked IDs,
    customer/contact fields, pax, dates, owners, price, and status.
  - Booking dates now enforce date-only `YYYY-MM-DD` format at the DTO
    boundary; calendar validity remains enforced by `BookingsService`.
  - `UpdateBookingDto` inherits the same localized validation contract through
    the approved partial field set.
  - Booking tests now execute DTO transforms and validators directly for
    create, update, and status payloads.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`.

- Hardened Booking date and linked-data scope coverage:
  - Booking date tests now lock date-only `YYYY-MM-DD` parsing, invalid
    calendar dates, empty/null values, partial updates, and one-day tours
    without timezone drift.
  - `bookingScopeWhere()` now requires one linked Customer, Order, or Tour to
    match all required branch/department scopes on the same relation.
  - This prevents mixed-scope access where branch matched one linked row and
    department matched a different linked row.
  - Booking integration tests now reject out-of-scope Customer/Order/Tour
    updates and linked-reference changes after operation vouchers, allotment
    locks, or operation forms exist.
  - VPS verification passed on 2026-06-09: `BOOKING_SCOPE_OK`,
    `TEST_BOOKINGS_SERVICE_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Tightened Booking text-field validation:
  - Added shared Booking text validation constants for customer name min
    length, owner min length, safe text characters, stricter phone digit
    count, and email pattern.
  - `CreateBookingDto` now rejects unsafe `customerName`, `saleOwner`, and
    `operatorOwner` values containing control characters or `< >`; owners must
    be at least 2 characters when provided.
  - `BookingsService` now enforces the same rules for direct service writes,
    including 6-15 actual digits for `customerPhone` and stricter
    `customerEmail` validation.
  - `/bookings` server action and form inputs now mirror customer/owner
    min/max/safe-text constraints for the stable UI fields.
  - Expanded `scripts/test-bookings-service.sh` with create/update rejection
    cases for short, unsafe, and digitless text/contact inputs.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`, web/API
    Docker builds, API/web redeploy, and `HEALTHCHECK_OK`.

- Classified Booking DTO fields into core and cross-reference groups:
  - `CreateBookingDto` now exports `BOOKING_CORE_FIELDS`,
    `BOOKING_CROSS_REFERENCE_FIELDS`, and `BOOKING_CREATE_FIELDS`.
  - Booking-core fields are the booking-owned values and snapshots:
    `code`, customer contact snapshot, pax/date/owner/price fields.
  - Cross-reference fields are `tourProgramId`, `customerId`, `orderId`, and
    `tourId`.
  - `UpdateBookingDto` now reuses `BOOKING_CREATE_FIELDS` for the normal edit
    surface; status remains isolated in `UpdateBookingStatusDto`, and
    operation-form fields are not exposed.
  - Expanded `scripts/test-bookings-service.sh` to assert the DTO field groups,
    no group overlap, full create/update field coverage, and excluded
    workflow/operation-form fields.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`, API
    redeploy, and `HEALTHCHECK_OK`.

- Locked Booking code normalization and duplicate-code message:
  - Confirmed runtime writes to `Booking.code` go through
    `BookingsService.create()` and `BookingsService.update()`; status updates
    do not write code.
  - Kept service-level `bookingCode()` normalization as the write boundary:
    trim, uppercase, ASCII code-pattern validation.
  - Moved `BOOKING_CODE_CONFLICT_MESSAGE` into the shared booking error
    contract next to not-found messages.
  - Expanded Booking service tests to assert duplicate-code conflicts after
    normalization on both create and update paths.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`, API
    redeploy, and `HEALTHCHECK_OK`.

- Standardized Booking not-found messages for linked entities:
  - Added `BOOKING_NOT_FOUND_MESSAGES` as the single source for Booking
    service not-found responses.
  - Booking `detail()`/mutation loading now uses the shared booking message.
  - Booking create/update linked-reference checks now return stable entity
    messages for tour program, customer, order, and tour instead of mixed
    "linked" variants.
  - Expanded `scripts/test-bookings-service.sh` to assert exact not-found
    messages for missing booking and missing booking references.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`, API
    redeploy, and `HEALTHCHECK_OK`.

- Confirmed Booking delete guardrails:
  - Deleting a booking must remain blocked once the booking has generated
    `operationForm`, `operationVouchers`, or `allotmentLocks`
    (`SupplierAllotmentAllocation`) because those relations use nullable links
    and `onDelete: SetNull`; deleting would orphan operational history.
  - Existing `BookingsService.ensureCanDelete()` already counts all three
    dependency groups through `bookingUsage()`, so no service behavior change
    was needed.
  - Expanded `scripts/test-bookings-service.sh` with delete-block tests for
    operation vouchers and allotment allocations, in addition to the existing
    operation form delete guard.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`.

- Locked the Booking update/status contract:
  - Confirmed `UpdateBookingDto` should remain a narrow booking edit DTO and
    should not include `status`; status updates stay isolated in
    `UpdateBookingStatusDto` and `PATCH /api/bookings/:id/status`.
  - Exported `BOOKING_UPDATE_FIELDS` so the allowed update surface is explicit
    and cannot silently grow from `CreateBookingDto`.
  - Extended `scripts/test-bookings-service.sh` to assert the exact
    `UpdateBookingDto` field list and to keep rejecting status changes through
    general `update()`.
  - Fixed legacy `apps/web/app/bookings-page.tsx` to call
    `/api/bookings/:id/status` for booking status changes instead of sending
    `{ status }` to the general update route.
  - VPS verification passed on 2026-06-09: `TEST_BOOKINGS_SERVICE_OK`, web
    Docker build, API/web redeploy, and `HEALTHCHECK_OK`.

- Trimmed unused list/detail include payloads for dense modules:
  - Operations list APIs now use explicit list `select` helpers for operation
    forms and supplier payment requests, while detail/mutation responses keep
    detail-shaped includes with scoped nested selects instead of full related
    entities.
  - Supplier typed/hotel list APIs now use list include helpers that keep the
    UI-required contacts/services/allotments but omit detail-only files,
    category, allotment logs, and allocation histories.
  - Tour Program detail now returns booking previews (`id`, `code`,
    `customerName`) instead of full booking records.
  - `scripts/audit-list-view-includes.js` was updated to guard the new
    operations/suppliers/tour-program include contracts and to align stale
    finance checks with the current lightweight list behavior.
  - `scripts/smoke-operations-backend.sh` fixture now creates itinerary day 1
    before booking creation, matching current Booking validation.
  - VPS verification passed on 2026-06-09: `LIST_VIEW_INCLUDE_AUDIT_OK`,
    API Docker build, `TEST_LIST_VIEW_PERFORMANCE_OK`,
    `SMOKE_OPERATIONS_BACKEND_OK`, `SMOKE_SUPPLIERS_OK`,
    `TEST_TOUR_PROGRAMS_SERVICE_OK`, API redeploy, and `HEALTHCHECK_OK`.

- Standardized list free-text search filters:
  - Added shared `apps/api/src/modules/list-search.ts` with trim,
    whitespace-collapse, min length 2, max length 80, and common
    case-insensitive contains behavior.
  - Wired normalized search into Orders, Booking, Tours, FIT/GIT/LandTour,
    Operation Vouchers, Operations, Suppliers, Tour Guides, Tour Programs,
    Order Center, Quotations, Quotes, Customers, Commission, Finance, and
    Reports list/search where helpers.
  - One-character free-text search now avoids broad `OR contains` filters;
    overlong terms return a controlled validation error.
  - Finance invoice and receipt list payloads were lightened: invoice list no
    longer includes item/file child arrays, and receipt list uses lightweight
    order-line previews.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_LIST_VIEW_PERFORMANCE_OK`, `TEST_ORDERS_API_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API redeploy, and `HEALTHCHECK_OK`.

- Hardened read data-scope composition for branch + department:
  - `branchDepartmentScopeWhere()` now treats enabled scope dimensions as
    required conditions. A user with both `data.scope.branch` and
    `data.scope.department` must match both values on list/detail reads,
    instead of matching either value.
  - Booking, Operation Voucher, and Operations scope helpers now compose
    relation-based scopes as `branch-link OR` AND `department-link OR`, so
    linked Customer/Order/Tour records can satisfy each dimension without
    broadening reads.
  - Updated `scripts/test-auth-data-scope.sh` and
    `scripts/test-data-scope-module-flows.sh` to cover mixed branch+department
    list/detail behavior.
  - Refreshed `scripts/audit-data-scope.js` so it tracks the current
    `TourCoreService.scopeWhere` and Operations/Supplier scope helper
    architecture.
  - VPS verification passed on 2026-06-09: `TEST_AUTH_DATA_SCOPE_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `DATA_SCOPE_AUDIT_OK`,
    `docker compose build api`, API redeploy, and `HEALTHCHECK_OK`.

- Continued Orders UI hardening under enforced Auth/RBAC:
  - Found `OrdersClient` browser-side fetches for reload, detail, create/update,
    copy/settle, and unlock were not sending the stored auth token. Initial SSR
    page loads could work, but follow-up actions could 401 with
    `SMARTTOUR_AUTH_ENFORCE=true`.
  - Wired the shared `authHeaders()` and `authJsonHeaders()` helpers into all
    Orders browser fetches.
  - Added `scripts/test-orders-ui-auth-contract.sh` to guard the Orders UI auth
    fetch contract.
  - VPS verification passed on 2026-06-09: `TEST_ORDERS_UI_AUTH_CONTRACT_OK`,
    `docker compose build web`, isolated `TEST_ORDERS_API_OK`, web redeploy,
    and `HEALTHCHECK_OK`.
  - Credentialed UI page/lifecycle smoke scripts still require
    `ADMIN_PASSWORD`; they were not run in this session to avoid changing
    production admin credentials.

- Refactored Booking API boundaries on the VPS:
  - `UpdateBookingDto` now only covers editable booking fields; status changes
    are handled by `UpdateBookingStatusDto` and
    `PATCH /api/bookings/:id/status`.
  - `PATCH /api/bookings/:id` rejects payloads containing `status` to avoid
    accidental workflow overwrites from normal edit forms.
  - Booking service now resolves and validates `tourProgramId`, `customerId`,
    `orderId`, and `tourId` through a shared reference helper instead of
    duplicating link checks across create/update/operation-form guards.
  - Create/update paths validate date range before writes, including partial
    date updates merged with the current booking dates.
  - Web `/bookings` status action now calls the dedicated status endpoint.
  - VPS verification passed on 2026-06-08: API Docker build, web Docker build,
    `TEST_BOOKINGS_SERVICE_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, production
    Booking reference/status smoke with cleanup, and `HEALTHCHECK_OK`.

- Reviewed Booking plus FIT/GIT/LandTour/common Tour APIs directly on the VPS:
  - Booking service already enforces linked Customer/Order/Tour scope,
    complete Tour Program itinerary days, date/duration consistency, guarded
    status transitions, and operation-form edit/delete locks.
  - Added `PATCH` partial-update aliases for common Tours, FIT Tours, and
    LandTour to match existing UI/API update behavior; GIT already had
    `PATCH`.
  - Common Tours now validates `type` and `status` query values with controlled
    400 errors and accepts lowercase enum input.
  - FIT, GIT, and LandTour list filters now normalize lowercase status values
    and return controlled 400 errors for invalid enum filters.
  - Added `scripts/test-tour-type-apis.sh`, an isolated HTTP integration test
    that creates a temp DB, auth token, FIT/GIT/LandTour/common Tour rows, and
    verifies `PATCH` plus enum query behavior.
  - VPS verification passed on 2026-06-08: `TEST_BOOKINGS_SERVICE_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, production API
    restart, production tour-type authenticated smoke with cleanup, and
    `HEALTHCHECK_OK`.

- Continued Auth/RBAC and data-scope hardening after production enforcement:
  - Confirmed `SMARTTOUR_ENV=production` and
    `SMARTTOUR_AUTH_ENFORCE=true` on `smarttour-api-1`.
  - Hardened Finance Invoice data scope. Invoice list/detail/export,
    file upload/delete, create/update/delete, approve/reject/cancel now honor
    scoped users through linked Customer, Order, Tour, or Finance Receipt.
  - Scoped invoice writes now require at least one linked Customer, Order, Tour,
    or Finance Receipt in the user's branch/department scope.
  - Hardened hotel allotment allocation scope. Scoped locks now require an
    Order, Booking, or Tour link in scope, and confirm/release only operates on
    scoped allocations.
  - Updated `scripts/test-data-scope-module-flows.sh` for current constructor
    dependencies and Booking itinerary requirements.
  - VPS verification passed on 2026-06-08: API Docker build, isolated
    data-scope module flow test (`TEST_DATA_SCOPE_MODULE_FLOWS_OK`),
    production API restart, `HEALTHCHECK_OK`, and production scoped smoke for
    Finance Invoice plus hotel allotment lock.

- Reviewed Tour Program, FIT Tour, and GIT Tour modules directly on the VPS:
  - Tour Program backend/service and dense UI already support create, edit,
    guarded delete, itinerary-day add, auth-aware server actions, and service
    test coverage.
  - FIT Tour page/server fetch, list reload, wizard detail load, save/autosave,
    copy-budget, and copy-operation now send the existing SmartTour auth token
    from cookie/localStorage, so the screen works with
    `SMARTTOUR_AUTH_ENFORCE=true`.
  - GIT Tour API now accepts `PATCH /api/git-tours/:id` for partial updates,
    matching the existing status modal behavior, while keeping the existing
    `PUT` endpoint.
  - GIT Tour list now validates `status` query values and returns a controlled
    400 instead of leaking a Prisma enum error for invalid statuses.
  - Rebuilt and restarted `smarttour-api-1` and `smarttour-web-1`.
  - VPS verification passed on 2026-06-08: Docker build for API/web, Tour
    Program service test, authenticated API smoke for Tour Program/FIT/GIT,
    GIT PATCH status persistence, invalid GIT status 400, and route checks for
    `/tour-programs`, `/fit-tours`, and `/git-tours`.
  - Host-level `npm run build --workspace apps/api` and
    `npm run build --workspace apps/web` currently fail because VPS
    `node_modules/.bin` cannot resolve the `nest`/`next` CLI internals; Docker
    build is the verified deploy path.

- Added OS-reinstall readiness and scheduled operations tooling:
  - Health checks now verify all seven containers, root `/` mode, critical
    systemd units, PostgreSQL backup age/checksum, disk, HTTP, database, Redis,
    authentication enforcement, recent logs, and private port bindings.
  - Added weekly full disaster backup for PostgreSQL logical dumps, consistent
    PostgreSQL/MinIO/n8n raw volumes, Git bundle, `.env`, application config,
    SSH/network/Nginx/Let's Encrypt/system configuration, inventory, and
    checksums.
  - Added systemd services/timers for 10-minute health checks, daily PostgreSQL
    backup, weekly disaster backup, and weekly restore drill.
  - Added schedule installer and operations/reinstall documentation.
  - VPS verification passed on 2026-06-08: healthcheck, PostgreSQL backup,
    PostgreSQL restore drill, full consistent-volume disaster backup, internal
    archive checksums, and complete Git bundle verification.
  - Latest verified full archive:
    `/var/backups/smarttour/disaster/smarttour-disaster-20260608-161016.tar.gz`.
    A checksum-verified copy was downloaded to the administrator workstation.

- Booking screen now exposes inline status updates, quick edit rows, and delete actions using the existing Booking PATCH/DELETE API.
- API Docker build now regenerates Prisma Client for Alpine with `linux-musl-openssl-3.0.x`, fixing the container startup error found during verification.
- Booking API smoke test passed: create, edit, status update, and delete all worked against Docker Postgres.
- SmartTour web preview is running in `smarttour-web-preview` on host port `3001` because host port `3000` is occupied by a `next-server` process from `/opt/building-admin`.
- Added first FIT TourKit module:
  - Prisma tables for `fit_tours`, common/hotel/private costs, budget services, operation services, guides, handover items, survey questions, and attachments.
  - NestJS `fit-tours` module with CRUD, copy-budget, copy-operation, import, and export endpoints.
  - Next.js `/fit-tours` 6-step wizard using React Hook Form, Zod, and TanStack Table.
  - Realtime cost/profit summaries, dynamic tables, draft autosave, source tour loading, and metadata-only attachment selection.
- FIT API smoke test passed: create, update, copy operation from budget, and delete.
- New Tour Management guidance supersedes a pure `fit_tours` root architecture. The target design is now documented in `docs/tour-management-module.md`: common `tours` aggregate with FIT/GIT/LANDTOUR extension tables and shared customers, suppliers, finance, documents, attachments, operations, surveys, reports, and logs.
- Added common Tour core implementation:
  - Prisma enums `TourType`, `TourStatus`, `PaymentStatus`, and `TourServiceStatus`.
  - Common models: `Tour`, `TourCustomer`, `TourSupplier`, `TourService`, `TourRevenue`, `TourCost`, `TourOperation`, `TourGuide`, `TourAttachment`, `TourNote`, `TourTerm`, `TourSurvey`, `TourPayment`, `TourReceipt`, `TourExpense`, and `TourLog`.
  - `FitTour` now has optional unique `tourId` and the FIT API creates/updates/deletes the common `Tour` aggregate.
  - Added NestJS `/api/tours` CRUD for common tour records.
  - Migration `20260525023000_tour_common_core` was applied and marked in Prisma.
- Common core smoke test passed: FIT create created `Tour(type=FIT)`, `/tours/:id` returned synced customer/service data, FIT update synced common status/services, and FIT delete removed the common tour.
- Added first GIT module on common Tour core:
  - Prisma `GitTourDetail` extension table linked one-to-one to common `Tour`.
  - NestJS `/api/git-tours` with list/detail/create/update/delete and copy-services.
  - Next.js `/git-tours` first management screen for creating/listing GIT tours.
  - GIT revenue and service data is stored in common `TourRevenue` and `TourService`, not standalone GIT root tables.
- GIT API smoke test passed: create, update operation service/status, list, and delete.
- Added first LandTour/Combo module on common Tour core:
  - Prisma `LandTourDetail` extension table linked one-to-one to common `Tour`.
  - NestJS `/api/landtours` with list/detail/create/update/delete and copy-services.
  - Next.js `/landtours` first management screen for creating/listing LandTour and Combo products.
  - LandTour services and terms are stored in common `TourService` and `TourTerm`, not standalone LandTour root tables.
- LandTour API smoke test passed: create, update operation service/status, list, and delete.
- Started Supplier module from `Supplier_Hotel_Form_Spec.md` with Hotel Supplier as the first NCC type:
  - Added Prisma migration `20260525032500_hotel_supplier_core`.
  - Extended `Supplier` with code, tax, country/province, website, status, creator-ready fields.
  - Added `HotelSupplier`, `SupplierContact`, `SupplierService`, `SupplierAllotment`, and `SupplierFile` models.
  - Added NestJS hotel supplier endpoints under `/api/suppliers/hotels` plus `PATCH /api/suppliers/:id/status`.
  - Added Next.js route `/suppliers/hotels` using React Hook Form, Zod, and TanStack Table for hotel form, contacts, services, allotments, list/search, and edit.
  - Web preview is updated on `http://103.75.185.200:3001/suppliers/hotels`.
- Hotel Supplier smoke test passed: create with contacts/services/allotments, detail read, status update, delete cleanup, and web page HTTP 200.
- Read the remaining Supplier specs for Restaurant, Flight ticket, Attraction ticket, Landtour supplier, Water, Transport, Bus, Other cost, Villas, Passport/Visa, Tour Guide, and Series Ticket.
- Added generic Supplier implementation for non-hotel supplier types:
  - Prisma migration `20260525034500_supplier_generic_types` adds shared bank, rating, market, link fields to `Supplier` and quantity/status/metadata fields to `SupplierService`.
  - Added NestJS typed supplier endpoints under `/api/suppliers/:type` for `restaurants`, `flights`, `attraction-tickets`, `landtour-suppliers`, `water`, `transport`, `bus`, `other`, `villas`, `passport`, `guides`, and `series-tickets`.
  - Added dynamic Next.js page `/suppliers/[type]` with React Hook Form, Zod, TanStack Table, dynamic contacts, dynamic service rows, type-specific service fields, list/search, edit, save, and close actions.
  - LandTour supplier route intentionally uses `/suppliers/landtour-suppliers` to avoid conflicting with the existing product module `/landtours`.
- Generic supplier smoke test passed for representative types: restaurants, flights, attraction-tickets, and landtour-suppliers. Dynamic supplier pages checked with HTTP 200 for restaurants, flights, attraction-tickets, landtour-suppliers, water, and guides.
- Read Quote specs for Tour pricing and Combo pricing.
- Added first Quotes module:
  - Prisma migration `20260525041000_quotes_module`.
  - Enums/models: `QuoteStatus`, `QuoteCostType`, `QuoteComboStatus`, `TourQuote`, `QuoteCostItem`, `QuoteItinerary`, `QuoteCombo`, and `QuoteComboItem`.
  - NestJS `/api/quotes/tours` CRUD plus approve, reject, convert actions.
  - NestJS `/api/quotes/combos` CRUD plus create-quote, create-order, and recalculate actions.
  - Backend recalculates tour totals and combo totals before saving.
  - Next.js `/quotes/tours` pricing screen with quote info, 3 cost groups, itinerary rows, realtime summary, approve/convert buttons, and quote list.
  - Next.js `/quotes/combos` pricing screen with combo type, supplier/service rows, notes, realtime price block, create-quote/create-order buttons, and combo list.
- Quote smoke test passed: tour quote create/approve/convert/delete, combo quote create/create-order/recalculate/delete, and HTTP 200 for `/quotes/tours` and `/quotes/combos`.
- Added first shared Orders module:
  - Prisma migration `20260525043500_orders_module`.
  - Common `Order` aggregate with type-specific enum values for FIT Tour, GIT/Combo, LandTour, and Single Service.
  - Shared child tables for guides, sales items, operation items, members, itineraries, handover items, survey questions, terms, files, and logs.
  - NestJS `/api/orders/:type` CRUD plus status, copy, and settle actions.
  - Next.js `/orders/[type]` dynamic UI for `/orders/fit-tours`, `/orders/git-combos`, `/orders/landtours`, and `/orders/single-services`.
- Added hotel room booking as a dedicated order type from `booking phong.ks.md`:
  - Prisma migration `20260525050000_hotel_booking_order_type` adds `HOTEL_BOOKING`.
  - API route `/api/orders/hotel-bookings`.
  - UI route `/orders/hotel-bookings`.
  - Booking room currently uses shared order sales/operation lines: sales line revenue = room count x night count x selling price; operation line cost = room count x net price.
- Order smoke tests passed for shared orders and hotel booking. Test rows with `ORD-SMOKE-%` and `HB-SMOKE-%` were soft-deleted.
- Continued from operation/guide/flight booking specs:
  - Added flight ticket booking as shared order type `FLIGHT_ORDER`.
  - Added API route `/api/orders/flight-orders` and UI route `/orders/flight-orders`.
  - Added operation voucher module for "Phieu dieu hanh dich vu": Prisma enum/model set, `/api/operation-vouchers` CRUD, `POST /:id/payment`, and `POST /:id/create-payment-voucher`.
  - Added `/operation-vouchers` UI with voucher info, dynamic service detail table, realtime total, payment entry, search/list, and edit.
  - Migration `20260525053000_operation_vouchers_flight_orders` was applied and marked in Prisma.
  - Smoke test passed for operation voucher create/payment and flight order create. Web pages `/operation-vouchers` and `/orders/flight-orders` returned HTTP 200. Smoke rows were removed.
- Added independent HDV module from `HDV.md`:
  - Prisma migration `20260525054500_tour_guides_module`.
  - Models: `GuideProfile`, `GuideCard`, `GuideDocument`, `GuideCostService`, `GuideFile`, and `GuideSchedule`.
  - API `/api/tour-guides` CRUD with child row replacement and basic schedule conflict validation.
  - UI `/tour-guides` with guide profile, cards, passport/visa documents, guide cost services, schedules, search/list, and edit.
  - Smoke test passed for guide create/delete cleanup and page `/tour-guides` returned HTTP 200.
- Continued enhancement spec with real hotel allotment inventory:
  - Migration `20260525060000_hotel_allotment_inventory`.
  - Extended `SupplierAllotment` with `allotmentQty`, `bookedQty`, `lockedQty`, and `status`.
  - Added `SupplierAllotmentLog` for override audit history.
  - Added APIs: `/api/suppliers/hotel-allotments/dashboard`, `/api/suppliers/hotel-allotments/inventory`, and `PATCH /api/suppliers/hotel-allotments/:id/override`.
  - Hotel supplier UI now has allotment summary metrics and editable inventory columns.
  - Smoke test passed for hotel allotment create, inventory remaining calculation, override logging path, dashboard, and `/suppliers/hotels` page HTTP 200.
- Read `tour/bosung.md` missing-feature spec and added the first independent missing module:
  - New Order Center API module `/api/order-center` with dashboard, advanced filters, list, and CSV export.
  - New UI `/order-center` with centralized order dashboard, advanced filters, result table, and export button.
  - Added navigation link `Order Center` on the main dashboard.
  - Extended settlement lock flow: `POST /api/orders/:type/:id/settle` now writes `OrderLog`; added `POST /api/orders/:type/:id/unlock` with actor/reason and audit log.
  - Smoke test passed for order center dashboard/list/export, settle/unlock, and pages `/order-center` and `/orders/single-services`.
- Read `tour/BAOGIA/bosung.md` Quotation Engine spec and added unified quotation module:
  - Migration `20260525062000_unified_quotation_engine`.
  - Added `QuotationProductType`, `QuotationStatus`, `Quotation`, `QuotationItem`, and `QuotationApprovalLog`.
  - API `/api/quotations` with dashboard/list/detail/create/update/delete, submit, approve, reject, smartlink toggle, public smartlink detail, and convert-to-order.
  - UI `/quotations` with dashboard, product type selector, common quote fields, dynamic service item table, markup amount/percent, realtime price engine, SmartLink, approval, and convert buttons.
  - Smoke test passed for create, submit, approve, smartlink enable, convert-to-order, dashboard, and `/quotations` page HTTP 200. Smoke rows were removed.
- Read `baocao/SmartTour_Reporting_Module_Additional_Spec.md` and added first Reporting & Analytics module:
  - API `/api/reports/overview`, `/business-summary`, `/revenue/:groupBy`, `/profit`, `/finance`, `/finance/order-history/:orderId`, `/debt/customers`, `/debt/suppliers`, `/debt/suppliers/:supplierId/history`, `/employees`, `/employees/performance`, and `/export/:report`.
  - Reports currently read from existing `Order` and `OperationVoucher` data, with shared filters for dates, service type, branch, department, employee, agency, market, payment status, and settlement status.
  - UI `/reports` with KPI cards, shared filters, report tabs for revenue/profit/finance/customer debt/supplier debt/employees, grouping selector, realtime reload, and CSV export.
  - Main dashboard `Bao cao lai lo` now links to `/reports`.
  - Smoke test passed for overview, revenue by employee, customer debt, supplier debt, CSV export, and `/reports` page HTTP 200.
- Added Customer CRM core from `khach/datakhach.md`:
  - Migration `20260525070000_customer_crm_core`.
  - New Customer master tables for type config, tags, campaigns, contacts, timeline, care tasks, comments, call logs, and opportunities.
  - Added nullable `customerId` to `Order`, `TourQuote`, and `Quotation` for direct future linking while still matching legacy rows by phone/email/name.
  - API `/api/customers` with dashboard/list/detail/create/update/delete, type/tag/campaign config, bulk tag, merge, transfer owner, import/export CSV, related orders/quotes/debts/timeline/care/opportunities.
  - UI `/customers` with KPI dashboard, advanced filters, master-data form, tag picker, contact/CSKH/opportunity quick fields, list, detail panel, and CSV export.
  - Smoke test passed for customer create/detail/dashboard/export/list, duplicate phone validation, cleanup delete, and `/customers` page HTTP 200.
- Continued Finance and Customer specs:
  - Added Commission Reporting migration `20260525073000_commission_reporting`.
  - Added `CommissionRule`, `CommissionEntry`, `CommissionLog`, and `CommissionPayment` with approval/payment status tracking linked directly to `Order`.
  - Added `/api/commission-reports` list/detail/summary/grouping/export/sync plus approve, reject, revoke, and pay actions.
  - Commission sync reads non-cancelled `Order` rows, applies product default rules, uses check-in as default milestone, and keeps payment/approval logs.
  - Added `/commission-reports` UI with KPI cards, advanced filters, grouping panel, detail log panel, approve/reject/pay actions, CSV export, and dashboard navigation link.
  - Extended Customer API with bulk update plus post-create comment, care task, call log, opportunity, and care-task update endpoints.
  - Smoke test passed for commission sync/list/summary/export/approve/pay/page and customer sub-actions/bulk update cleanup.
- Started the unified SmartTour app interface:
  - Added shared Next.js `AppShell` in `apps/web/app/layout.tsx` with grouped sidebar navigation, sticky topbar, global search field, domain/status pills, and mobile menu.
  - Reworked `/` into an operational dashboard screen instead of a standalone sidebar page.
  - Updated global CSS so existing module pages render inside the shared shell without double padding.
  - Rebuilt and redeployed `smarttour-web-preview`; `https://quanly.dunientravel.com/`, `/customers`, and `/reports` returned HTTP 200.
- Continued app UI shell polish:
  - Topbar now shows current route module group and page title with matching icon.
  - Added topbar shortcuts for quote/order/customer workflows and a sidebar workspace footer.
  - Improved shared panel, metric, and table styling with subtle shadows, row hover, sticky table headers, and tighter responsive behavior.
  - Rebuilt and redeployed `smarttour-web-preview`; `/`, `/order-center`, and `/commission-reports` returned HTTP 200 through the domain.
- Continued app shell interaction polish:
  - Global search now filters SmartTour modules and shows a dropdown with module group labels for quick navigation.
  - Added contextual module strip below the topbar for lateral navigation within the current workflow group.
  - Added shared empty/loading state styles for upcoming table and async states.
  - Rebuilt and redeployed `smarttour-web-preview`; `/`, `/orders/fit-tours`, and `/customers` returned HTTP 200 through the domain.
- Continued navigation UX:
  - Added `Ctrl+K` command palette with searchable module list and keyboard escape close behavior.
  - Added collapsible desktop sidebar for wider data-table workspaces.
  - Global search now opens the command palette on focus while retaining compact dropdown results.
  - Rebuilt and redeployed `smarttour-web-preview`; `/`, `/reports`, and `/suppliers` returned HTTP 200 through the domain.
- Continued workspace shell polish:
  - Added activity/notification drawer from the topbar with quick links to order reconciliation, commission approval, debt reports, and common actions.
  - Persisted desktop sidebar collapse state in local storage.
- Continued module UI cleanup:
  - Removed the old nested sidebar/topbar layout from `/order-center` so it renders cleanly inside the shared `AppShell`.
  - Polished Order Center metrics, filters, status pills, table alignment, and empty state.
- Continued shared-shell migration:
  - Removed the old nested sidebar/topbar layout from `/reports`.
  - Updated `/commission-reports` and `/customers` headers to use the shared `pageHeader` pattern instead of the legacy `.topbar`.
  - Polished report metrics, filters, table, and empty state styling.
- Continued shared-shell migration for remaining product/operation pages:
  - Removed legacy nested `shell/sidebar/topbar` wrappers from `/bookings`, `/fit-tours`, `/git-tours`, `/landtours`, `/operation-vouchers`, `/quotations`, `/suppliers`, `/tour-guides`, and `/tour-programs`.
  - Converted these pages to shared `workspace` + `pageHeader` headers so they render inside `AppShell` without duplicate navigation.
  - Build passed on VPS and `smarttour-web-preview` was rebuilt/restarted.
  - Docker build initially hit `no space left on device`; pruned Docker build cache and unused images only, not volumes. Root filesystem now has healthy free space.
  - Smoke test through `https://quanly.dunientravel.com` returned 200 for `/`, all nine migrated pages, `/order-center`, `/reports`, `/commission-reports`, and `/customers`.
- Added first Finance & Accounting module:
  - Migration `20260525081500_finance_accounting_module`.
  - New Prisma models/enums for `FinanceReceipt`, receipt order allocation rows, `FinancePayment`, `FinanceInvoice`, invoice items, and approved cashflow entries.
  - Added API `/api/finance/receipts`, `/payments`, `/invoices`, and `/cashflow` with CRUD, approve/reject, CSV export, import placeholder, and audit log writes.
  - Approved receipts create cashflow entries and update linked order paid/remaining revenue when an order id is supplied.
  - Approved payments create cashflow entries and update linked order paid/remaining cost when an order id is supplied.
  - Added `/finance` UI with tabs for pending receipts, receipts, payments, VAT invoices, and cashflow; added Finance group to AppShell navigation.
  - Rebuilt/restarted both `smarttour-api-1` and `smarttour-web-preview`; API uses Docker network DB URL `smarttour-postgres-1:5432`.
  - Smoke test passed for receipt/payment/invoice create + approve + cashflow generation, and smoke rows were removed. Domain returned 200 for `/finance` and tab URLs.
- Hardened Finance DB for production use:
  - Migration `20260525084500_production_finance_links`.
  - Added real FK relations from orders, quotations, tour quotes, finance receipts/payments/invoices/cashflow to Customer, Order, Supplier, OperationVoucher, and FinanceReceipt where applicable.
  - Added `CustomerLedgerEntry` and `SupplierLedgerEntry` as durable receivable/payable ledgers.
  - Added `CodeSequence` for future non-timestamp document number generation, including a null-safe unique expression index.
  - Added reversal/cancel metadata fields to finance receipts, payments, and invoices.
  - Added DB check constraints for non-negative accounting amounts and one-sided ledger debit/credit entries.
  - Finance approve flow is now idempotent: approving the same receipt/payment/invoice repeatedly does not double-apply cashflow, ledger, or order payment totals.
  - Approved receipts write customer ledger credits when linked to a customer/order; approved invoices write customer ledger debits; approved payments write supplier ledger debits when linked to supplier/operation voucher.
  - Rebuilt `smarttour-api-1`; smoke test passed with linked Customer/Supplier records and cleanup. Migration status is up to date.
- Continued production Finance backend:
  - Finance create endpoints now generate document codes from `CodeSequence` (`PT-YYYYMM-000001`, `PC-YYYYMM-000001`, `VAT-YYYYMM-000001`) instead of timestamp fallback when code is omitted.
  - Finance update endpoints preserve existing document codes when the payload does not explicitly send a new code.
  - Added cancel endpoints for approved receipts, payments, and invoices:
    - `POST /api/finance/receipts/:id/cancel`
    - `POST /api/finance/payments/:id/cancel`
    - `POST /api/finance/invoices/:id/cancel`
  - Cancel creates reversal documents, reversal cashflow rows, and reversal ledger rows instead of deleting approved vouchers.
  - Added ledger debt endpoints:
    - `GET /api/finance/debt/customers`
    - `GET /api/finance/debt/suppliers`
  - Rebuilt `smarttour-api-1`; smoke test passed for sequence code generation, approve, cancel/reversal, customer/supplier debt summary returning zero balance after reversal, and cleanup.
- Added core DB links for long-term booking/supplier/tour usage:
  - Migration `20260525093000_core_booking_supplier_links`.
  - Added nullable links from legacy `Booking` to `Customer`, `Order`, and common `Tour`, plus customer phone/email snapshots.
  - Added nullable `Tour.orderId` so common tour records can be tied back to Order Center.
  - Added `TourCustomer.crmCustomerId` to link tour passengers/bookers to CRM while retaining tour-time snapshots.
  - Added `TourService.supplierServiceId` and `OperationService.supplierServiceId` to connect tour/operation services to supplier catalog rows.
  - Added `OperationVoucher.orderId` and real FK relations for `OperationVoucher.bookingId` and `OperationVoucherPayment.paymentVoucherId`.
  - Added `Supplier.deletedAt` and `SupplierService.deletedAt` for soft-delete readiness.
  - Added `SupplierAllotmentAllocation` to track allotment locks/confirm/release by allotment, supplier, service, order, booking, and tour.
  - Added DB guardrails for non-negative quantities/amounts on booking, order, supplier service/allotment, tour service, operation service, and operation voucher rows.
  - Deployed schema/migration to VPS, ran Prisma validate/migrate/generate, rebuilt `smarttour-api-1`, and smoke-tested finance APIs plus Prisma Client access to the new allocation model.
- Continued backend use of the new DB links:
  - Booking create/update DTOs now accept `customerId`, `orderId`, `tourId`, `customerPhone`, and `customerEmail`; service validates links and includes linked Customer/Order/Tour on list/detail responses.
  - Tour create/update DTOs now accept `orderId`; service validates the order and includes linked Order plus CRM-linked tour customers and supplier catalog service links.
  - Operation vouchers now accept/use `orderId`, validate linked booking/tour/order/supplier, derive missing order/tour from booking, and include linked booking/order/tour plus finance payment vouchers.
  - `create-payment-voucher` on operation vouchers now creates a real `FinancePayment` row with a `PC-YYYYMM-000001` style code and links `OperationVoucherPayment.paymentVoucherId` to that finance payment ID.
  - Supplier delete is now soft delete (`deletedAt`, `INACTIVE`) and supplier lists/details exclude soft-deleted rows.
  - Added allotment allocation backend endpoints:
    - `POST /api/suppliers/hotel-allotments/:id/lock`
    - `POST /api/suppliers/hotel-allotment-allocations/:id/confirm`
    - `POST /api/suppliers/hotel-allotment-allocations/:id/release`
  - Lock/confirm/release runs in DB transactions and updates `lockedQty`/`bookedQty` plus allotment logs.
  - Rebuilt `smarttour-api-1`; smoke test created and cleaned linked Customer/Order/TourProgram/Supplier/Allotment, then verified tour-link, booking-link, voucher-link derivation, real finance payment creation, and allotment lock/confirm/release.
- Added automatic hotel-order allotment sync:
  - In `OrdersService`, `/api/orders/hotel-bookings` create now auto-locks allotment rows for operation items with `serviceId`.
  - Updating hotel booking operation items releases existing `ORDER_AUTO` allocations and recreates locks from the new item list.
  - Deleting hotel booking or setting status `CANCELLED` releases existing auto allocations.
  - Setting hotel booking status to `RUNNING`, `COMPLETED`, or `SETTLED` confirms auto allocations by moving quantities from `lockedQty` to `bookedQty`.
  - Auto allocation uses `SupplierAllotment.serviceId`, active date window, quantity from operation item, and logs every lock/confirm/release with actor `ORDER_AUTO`.
  - Rebuilt/restarted `smarttour-api-1`; smoke test verified create locks 2 rooms, status `COMPLETED` confirms to booked, status `CANCELLED` releases back to zero, and smoke rows were cleaned.
- Continued backend/DB hardening:
  - Migration `20260525102000_order_operation_allotment_trace`.
  - Added `SupplierAllotmentAllocation.orderOperationItemId -> OrderOperationItem` so automatic locks can be traced to the exact operation item row.
  - Order DTO now accepts `customerId`.
  - Order create/update validates `customerId` and fills customer snapshots (`customerName`, `customerPhone`, `customerEmail`, `customerAddress`, `customerType`) from CRM when omitted.
  - Order list/detail responses now include linked customer, richer supplier/service includes, order allocation locks, and operation item allocation locks.
  - Hotel booking auto-allocation stores `orderOperationItemId` after operation rows are created.
  - Deployed migration, generated Prisma Client, rebuilt/restarted `smarttour-api-1`; smoke test verified customer CRM link/snapshot and allocation-to-operation-item trace, then cleaned smoke rows.
- Continued long-term DB/backend linking:
  - Migration `20260525104500_operation_fit_guide_payment_links`.
  - Added `GuideSchedule.tourId/orderId`, `OperationForm.orderId/tourId`, `FitTour.customerId/orderId`, `FitOperationService.supplierServiceId`, and `SupplierPaymentRequest.financePaymentId`.
  - FIT create/update now accepts `customerId` and `orderId`, validates the order, keeps the existing FIT customer snapshot behavior, links the common `Tour` to `Order`, and writes `TourCustomer.crmCustomerId` for CRM traceability.
  - FIT operation services now persist and return `supplierServiceId`, so operation costing can point to the supplier catalog row instead of only free-text/service snapshots.
  - Tour guide schedules now validate linked Tour/Order IDs and return linked tour/order data in responses.
  - Deployed migration, regenerated Prisma Client, rebuilt/restarted `smarttour-api-1`; smoke test verified FIT customer/order links, common Tour links, supplier-service operation links, guide schedule links, route health, and cleanup.
  - `SupplierPaymentRequest.financePaymentId` and `OperationForm.orderId/tourId` are DB-ready; full backend workflows for operation forms and supplier payment requests still need implementation.
- Continued operation backend completion using the existing DB links:
  - Replaced the stub `/api/operations` service with real dashboard counts plus Operation Form APIs:
    - `GET/POST /api/operations/forms`
    - `GET/PUT /api/operations/forms/:id`
    - `DELETE` and `POST /api/operations/forms/:id/cancel`
  - Operation Form create/update validates booking/order/tour links, derives order/tour from booking or tour, and persists services, tasks, costs, supplier, and supplier-service links.
  - Added Supplier Payment Request APIs:
    - `GET/POST /api/operations/supplier-payment-requests`
    - `GET/PUT/DELETE /api/operations/supplier-payment-requests/:id`
    - `submit`, `approve`, `reject`, and `create-finance-payment`.
  - Approving supplier payment requests now writes supplier ledger payable credits; creating a finance payment links `SupplierPaymentRequest.financePaymentId` to a real `FinancePayment`.
  - Smoke test verified operation form link derivation, supplier-service link, supplier payment approval ledger credit, finance payment creation, finance payment approval, supplier debt returning to zero, cleanup, and route health.
  - No new DB migration was needed in this step; it activates the tables/relations from the prior migration.
- Added Operations UI:
  - New Next.js route `/operations` with tabs for `Phieu dieu hanh` and `Thanh toan NCC`.
  - Operation Form tab shows dashboard metrics, filters, quick create form, service/task/cost inputs, booking selector, supplier/supplier-service selectors, list table, and cancel/create-payment shortcut actions.
  - Supplier Payment Request tab shows create form from an operation form/cost, list table, submit/approve/reject/create-finance-payment/approve-finance-payment actions.
  - AppShell navigation now includes `Van hanh tour` under `San pham & van hanh`, with contextual strip link.
  - Rebuilt and redeployed `smarttour-web-preview`; smoke test through domain returned 200 for `/operations`, `/api/operations/dashboard`, `/api/operations/forms`, `/api/operations/supplier-payment-requests`, `/finance`, and `/operation-vouchers`.
- Started Auth/RBAC foundation:
  - Migration `20260526090000_auth_rbac_foundation` adds `Role`, `UserRole`, `RolePermission`, `UserSession`, user status/branch/department/lastLoginAt fields, and `AuditLog.actorId -> User`.
  - Seeded system roles: `super_admin`, `accounting`, `operation`, and `sales`, with initial permission sets.
  - Added NestJS `AuthModule` with `/api/auth/bootstrap`, `/login`, `/logout`, `/me`, `/users`, and `/roles`.
  - Passwords use PBKDF2 hashes; sessions store only SHA-256 token hashes in DB.
  - Added permission decorator and global guard. Guard protects decorated routes when a Bearer token is provided, and fully enforces when `SMARTTOUR_AUTH_ENFORCE=true`.
  - Decorated sensitive Finance approval/cancel endpoints and Operations form/payment-request mutation endpoints.
  - Added `/login` web page, AppShell login/logout state, and Bearer-token wiring for Finance and Operations POST actions.
  - Deployed API and web; smoke tested auth create/login/me/logout, RBAC denial for insufficient role, super admin role/user listing, route health, and migration status.
  - Current deploy keeps `SMARTTOUR_AUTH_ENFORCE` unset/false so existing MVP screens remain usable while login rollout is completed.
- Added Auth/RBAC management UI:
  - New `/security` route for Users, Roles, and Permissions administration.
  - AppShell now includes a `He thong` navigation group with `Phan quyen`.
  - `/security` can create users, assign roles, update user status/branch/department/password, create roles, update role status/description, and edit permissions as newline/comma separated values.
  - The page reads auth token from localStorage and calls `/api/auth/users` and `/api/auth/roles`.
  - Rebuilt and redeployed `smarttour-web-preview`; smoke test returned 200 for `/security`, `/login`, `/`, `/api/auth/users`, `/api/auth/roles`, `/operations`, and `/finance`.
- Expanded Auth/RBAC protection across existing mutation APIs:
  - Migration `20260526093000_expand_rbac_permissions` adds role permissions for finance create/update/delete/import plus operation/sales booking, tour, order, supplier, and guide management scopes.
  - Added `RequirePermissions` decorators to order, booking, common tour, FIT/GIT/LandTour, tour guide, operation voucher, supplier, quote, quotation, customer, commission, tour-program, and finance mutation endpoints.
  - Rebuilt and restarted `smarttour-api-1` with the new API image.
  - Migration status is up to date with 23 migrations.
  - Smoke test through `https://quanly.dunientravel.com` returned 200 for auth/security, orders, bookings, suppliers, tours, FIT/GIT/LandTour, quotes, quotations, customers, commission reports, finance, operations, and finance pages.
  - RBAC smoke test passed: a temporary `accounting` user can log in, but `POST /api/orders/fit-tours` with that Bearer token returns `401 Missing permission`; unauthenticated legacy call still reaches validation while `SMARTTOUR_AUTH_ENFORCE` remains false.
- Continued Auth/RBAC frontend rollout:
  - Added shared client auth helpers in `apps/web/app/authFetch.ts`.
  - Added server-action auth helpers in `apps/web/app/serverAuth.ts`.
  - Login now stores the session token in both localStorage and a `smarttour.auth.token` cookie; logout clears both and still calls `/api/auth/logout`.
  - Wired Bearer token headers into main client mutation pages: orders, FIT, quotes, quotations, operation vouchers, suppliers, tour guides, customers, and commission reports.
  - Wired server actions for legacy pages: `/bookings`, root `bookings-page`, `/git-tours`, `/landtours`, `/tour-programs`, and `/suppliers` to read the auth cookie and send Authorization headers.
  - Web build passed, `smarttour-web-preview` was rebuilt/restarted, and domain smoke test returned 200 for `/`, `/login`, `/security`, bookings, product/tour, orders, quotes, quotations, operation vouchers, suppliers, tour guides, customers, commission, finance, and operations pages.
  - `SMARTTOUR_AUTH_ENFORCE` is still intentionally false/unset. Next hardening step is permission-aware buttons/views plus final authenticated mutation smoke tests after a real admin password is confirmed.
- Added first permission-aware UI controls:
  - New `apps/web/app/usePermissions.ts` reads logged-in user permissions from localStorage and exposes `can(permission)`.
  - `can()` allows actions when no user is logged in so legacy no-enforce mode remains usable; when a logged-in user exists it honors explicit permissions or `*`.
  - Finance create/approve buttons are disabled by `finance.receipt.*`, `finance.payment.*`, and `finance.invoice.*` permissions.
  - Operations create/cancel/request/approve/payment buttons are disabled by `operation.form.manage`, `operation.payment-request.create`, `operation.payment-request.approve`, and `finance.payment.approve`.
  - Orders actions are disabled by `order.manage`; FIT by `tour.manage`; Quotes by `quote.manage`; Quotations by `quotation.manage`; Suppliers by `supplier.manage`; Customers by `customer.manage`; Commission by `commission.manage`; Tour Guides by `guide.manage`.
  - Web build passed, `smarttour-web-preview` was rebuilt/restarted, and domain smoke test returned 200 for 20 key pages.
  - Remaining RBAC work: make page-level denied states, add view/export permissions, confirm/reset real admin password, then run authenticated mutation smoke tests and enable `SMARTTOUR_AUTH_ENFORCE=true`.
- Continued RBAC completion:
  - Migration `20260526100000_complete_rbac_role_permissions` expands seeded role permissions and is applied on VPS; Prisma reports 24 migrations and database is up to date.
  - Accounting now has `commission.manage`, commission/report view/export, finance export permissions, and read access to customers/suppliers/orders/payment requests.
  - Sales now has explicit quote/quotation/customer/order/tour/booking view/manage permissions plus commission/report view.
  - Operation now has explicit booking/tour/guide/supplier/order view/manage plus operation form/payment request and report view permissions.
  - Super admin now has `*` plus the explicit permission catalog so `/security` can display/edit the full list.
  - `/security` common permission checklist was expanded to include view/manage/import/export scopes used by the current app.
  - `usePermissions` moved to `usePermissions.tsx` and now exposes `canAny()` plus `PermissionNotice`.
  - Added page-level permission notices to Finance, Operations, Orders, FIT, Quotes, Quotations, Operation Vouchers, Suppliers, Tour Guides, Customers, and Commission Reports.
  - Web build passed and `smarttour-web-preview` was rebuilt/restarted.
  - Smoke test returned 200 for 20 key routes. Containers remain only `smarttour-web-preview`, `smarttour-api-1`, `smarttour-postgres-1`, and `smarttour-redis-1`.
  - Authenticated RBAC smoke test passed for guard behavior: sales can reach order/quote validation, accounting is denied order mutation, sales is denied operations mutation, and accounting can run commission sync. Operation form with empty payload passes permission guard but currently returns 500 instead of validation 400, so Operations DTO/service validation should be hardened before enabling global enforce.
- Added Operations test coverage:
  - `scripts/smoke-operations-backend.sh` now covers dashboard load, operation form create/update/cancel, supplier payment request create/submit/approve/reject, finance payment creation/approval/cancel reconciliation, branch scope, missing-branch guardrails, and per-action permission denials.
  - `scripts/smoke-operations-ui.js` adds Playwright coverage for `/operations` dashboard/list load, form/payment modals, reconciliation detail panel, action enabled/disabled state, and tab state reset.
  - Added stable `data-testid` anchors to `OperationsClient` for the smoke test and registered `smoke:operations:ui`.
  - VPS verification passed: `SMOKE_OPERATIONS_BACKEND_OK`, `docker compose build web`, and `SMOKE_OPERATIONS_UI_OK` against `https://aitour.io.vn`.
