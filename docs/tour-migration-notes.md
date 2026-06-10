# Tour Migration Notes

## Ownership

- `tours` owns the shared tour root and shared collections: customer, supplier, service, revenue, cost, guide, attachment, survey, term, log, finance links.
- `fit-tours`, `git-tours`, and `landtours` own only product-specific extension data and route orchestration.
- Product controllers should not write shared child tables directly. They should call `TourCoreService`.

## Current Compatibility Phase

- `FitTour` legacy tables remain writable only through `FitTourLegacyCompatService` while data is being verified.
- `GitTourDetail` and `LandTourDetail` keep product-specific fields only. Shared fields should live on `Tour`.
- Legacy child tables should be treated as compatibility/read-only data after shared `Tour` child tables are verified in production.

## Locked Common Schema

The common tour schema below is the canonical contract for FIT, GIT, and
LandTour. Product modules may expose compatibility aliases in their DTOs, but
writes must resolve to the canonical owner listed here.

### Common Root Fields

| Group | Canonical `Tour` fields | Notes |
| --- | --- | --- |
| Identity and type | `id`, `type`, `systemCode`, `tourCode`, `name`, `productType` | FIT currently maps legacy `quoteCode` to `systemCode` and `tourName` to `name`. |
| Lifecycle | `status`, `paymentStatus`, `workflowStep`, `closedAt`, `closedBy`, `deletedAt` | FIT keeps `workflowStatus` in `fit_tours`; GIT/LandTour use common `workflowStep`. |
| Links and scope | `orderId`, `createdBy`, `operatorOwner`, `branch`, `department`, `customerSource` | Scope fields are common-root only. Product detail tables must not write them. |
| Dates | `bookingDate`, `paymentDueDate`, `startDate`, `endDate` | DTO contract is date-only `YYYY-MM-DD`. |
| Money/exchange | `exchangeRateCode`, `exchangeRate` | Product-specific price breakdowns stay in detail or child rows. |
| Movement and notes | `route`, `flightRoute`, `pickupPoint`, `dropoffPoint`, `notes` | GIT/LandTour may accept `itinerarySummary` as a legacy alias for `route`; canonical route storage is common. |

### Product Detail Fields

| Module | Detail-only fields to keep writable | Compatibility aliases or legacy snapshots |
| --- | --- | --- |
| FIT | `adultCount`, `childCount`, `infantCount`, `sellingPrice`, `commissionPerGuest`, `allowOverbooking`, `seatCount`, `tourPrice`, `discount`, `adultPrice`, `childPrice25`, `childPrice611`, `infantPrice`, `surcharge`, `transportMode`, `outboundRoute`, `outboundCarrier`, `returnRoute`, `returnCarrier`, `visaDeadline`, `holdUntil`, `confirmedAt`, `closeAt`, `handoverGuideRequest`, `surveyDescription`, `workflowStatus` | `quoteCode`, `tourCode`, `tourName`, `marketGroup`, dates, customer snapshot, `flightRoute`, `exchangeRate*`, `operatorOwner`, pickup/dropoff, and `notes` are mirrored for compatibility but canonical values live on `Tour` or common children. `surveyDescription` remains FIT-only until common `TourSurvey` gains a description/section field or a separate common survey summary table is introduced. |
| GIT | `holdCode`, `itinerarySummary`, `collaborator`, `commissionRate`, `invoiceStatus`, `accountCode`, `fileNote` | `agentName` is derived from common `TourCustomer(customerType = AGENT)`. Legacy `branch`, `department`, and `customerSource` columns are read-only snapshots. |
| LandTour | `comboType`, `autoTermsEnabled`, `smartLinkCode`, `confirmationNote` | `guideName` is derived from common `TourGuide(guideType = LANDTOUR)`. `termsVi` and `termsEn` are derived from common `TourTerm`. `itinerarySummary` is a DTO alias for common `route`, not detail storage. |

### Common Child Collections

| Canonical child | Used by modules | Ownership decision |
| --- | --- | --- |
| `tourCustomer` | FIT, GIT, LandTour | Common owner for primary customers and GIT agents. FIT `customerId` links to CRM through `TourCustomer.crmCustomerId`; FIT customer snapshot fields remain compatibility inputs. |
| `tourService` | FIT, GIT, LandTour | Common owner for sales/budget/operation service rows. Legacy FIT service rows are compatibility snapshots only. |
| `tourRevenue` | FIT, GIT, LandTour | Common owner for revenue lines. Product-specific revenue arrays map through `TourCoreService.mapRevenues()` or module-specific wrappers. |
| `tourCost` | FIT, GIT, LandTour | Common owner for cost lines, even though it is broader than the minimum Step 1 checklist. FIT common/hotel/private cost arrays map into this surface during compatibility. |
| `tourGuide` | FIT, LandTour, optionally GIT | Common owner for guide rows. LandTour legacy `guideName` must be response-derived only. |
| `tourTerm` | LandTour, optionally GIT/FIT | Common owner for reusable tour terms. LandTour `termsVi`/`termsEn` must be response-derived only. |
| `tourAttachment` | FIT, GIT, LandTour | Common owner for uploaded file metadata. FIT uploads also keep `fit_attachments` as a legacy snapshot; autosave/update must not own attachments. |
| `tourSurvey` | FIT, GIT, LandTour | Common owner for survey question rows. FIT `surveyDescription` is still detail-only because common survey has `question`/`notes` but no description field. |
| `tourLog` | FIT, GIT, LandTour | Common owner for audit/activity rows. Product modules should write logs through `TourCoreService.log()`. |

### DTO Contract Groups

Each product DTO must publish explicit field groups so create/update payloads do
not quietly absorb unrelated fields:

- Core/root fields: common `Tour` identity, scope, date, route, payment, and
  notes fields.
- Link/customer fields: primary customer snapshots, CRM customer links, order
  links, and GIT agent aliases that map to common customers.
- Workflow/lifecycle fields: module workflow fields and common lifecycle status
  must stay separated. FIT exposes only `workflowStatus` and rejects raw common
  `status` / `workflowStep` input.
- Detail fields: fields owned by the product detail table only.
- Child fields: arrays that map to common child tables or temporary legacy
  compatibility child rows.
- Action fields: IDs and options for export, copy, upload, and similar helper
  actions. These must live in focused action DTOs and must not appear in the
  create/update aggregate field list.

Required create fields are locked per module:

- FIT: `quoteCode`, `tourCode`, `customerName`.
- GIT: `systemCode`, `tourCode`, `name`.
- LandTour: `systemCode`, `tourCode`, `name`.

## Legacy Table Decisions

| Legacy surface | Current status | Keep until | Drop/read-only decision |
| --- | --- | --- | --- |
| `git_tour_details.agentName`, `branch`, `department`, `customerSource` | Read-only snapshot fields | Existing API response overlays no longer need DB fallback and production drift report shows zero consumers reading raw legacy columns. | Already read-only at application level. Schedule column removal after one stable release with no fallback reads. |
| `land_tour_details.guideName`, `termsVi`, `termsEn` | Read-only snapshot fields | Existing API response overlays no longer need DB fallback and production drift report shows zero consumers reading raw legacy columns. | Already read-only at application level. Schedule column removal after one stable release with no fallback reads. |
| `fit_common_costs`, `fit_hotel_costs`, `fit_private_costs` | Compatibility snapshots | FIT pricing screen/import/export remains compatible and common `tour_costs` drift checks pass for pricing rows. | Keep writable only through `FitTourLegacyCompatService`; mark read-only after two stable releases with common `TourCost` as source of truth. |
| `fit_budget_services`, `fit_operation_services` | Compatibility snapshots | FIT budget/operation screens, copy actions, and operation integration read from common `tour_services` without fallback. | Keep writable only through `FitTourLegacyCompatService`; mark read-only after copy/import drift checks pass for two stable releases. |
| `fit_tour_guides` | Compatibility snapshot | FIT guide UI and exports read common `tour_guides` without legacy fallback. | Keep writable only through `FitTourLegacyCompatService`; mark read-only after guide drift checks pass. |
| `fit_survey_questions` | Compatibility snapshot for question rows | FIT survey UI reads common `tour_surveys`; `surveyDescription` is handled separately. | Keep writable only through `FitTourLegacyCompatService`; mark question rows read-only after survey drift checks pass. |
| `fit_attachments` | Compatibility upload snapshot | FIT attachment UI/export reads common `tour_attachments`; upload endpoint still appends legacy snapshot for old clients. | Keep append-only via upload/import compatibility; normal create, update, and autosave must not write it. Mark read-only once old attachment consumers are removed. |
| `fit_handover_items` | FIT-only detail child | A common handover table exists, or product decision confirms handover is FIT-only permanently. | Not ready for read-only. Keep as FIT-owned detail child for now. |
| `fit_tours` root-like columns (`quoteCode`, `tourCode`, `tourName`, dates, customer snapshot, scope-ish fields) | FIT compatibility/detail surface | Common `Tour` root and common child rows fully drive FE detail/list/export and import has a dedicated payload. | Keep writable through FIT aggregate for compatibility. Convert root-like columns to read-only snapshots only after import/create payload is split and drift checks pass. |

## FE/BE Mapping

| FE/API field surface | Backend canonical owner | Compatibility response/source notes |
| --- | --- | --- |
| FIT list/detail identity: `quoteCode`, `tourCode`, `tourName`, dates, `marketGroup`, `flightRoute`, pickup/dropoff, notes | Common `Tour` root, with `quoteCode` mapped to `Tour.systemCode` and `tourName` mapped to `Tour.name` | FIT response overlays common root values while keeping existing FE shape. |
| FIT customer: `customerId`, `customerName`, `phone`, `email` | Common `TourCustomer` plus CRM `Customer` link via `crmCustomerId` | FIT detail still preserves editable snapshot fields for compatibility. |
| FIT pricing costs | Common `TourCost` | Legacy `fit_*_costs` are compatibility snapshots only. |
| FIT budget/operation services | Common `TourService` and derived `TourSupplier` | Legacy FIT service tables are compatibility snapshots only; copy actions update targeted common service rows. |
| FIT guides | Common `TourGuide` | Legacy `fit_tour_guides` is compatibility snapshot only. |
| FIT survey questions | Common `TourSurvey` | `surveyDescription` remains `fit_tours.surveyDescription` until common schema gets a description/section field. |
| FIT attachments | Common `TourAttachment` | Upload endpoint also appends `fit_attachments` snapshot; autosave/update does not own attachments. |
| FIT handover | `fit_handover_items` and `fit_tours.handoverGuideRequest` | No common child table yet; keep FIT-owned detail surface. |
| GIT agent/customer | Common `TourCustomer`, with `customerType = AGENT` for agent | `gitTour.agentName` is response-derived from common customer rows; legacy column is read-only fallback. |
| GIT detail fields | `git_tour_details` | Only `holdCode`, `itinerarySummary`, collaborator/commission/invoice/account/file notes remain writable. |
| LandTour guide | Common `TourGuide`, with `guideType = LANDTOUR` | `landTour.guideName` is response-derived from common guide rows; legacy column is read-only fallback. |
| LandTour terms | Common `TourTerm` | `termsVi` / `termsEn` are response-derived from common terms; legacy columns are read-only fallback. |
| LandTour detail fields | `land_tour_details` | Only combo/smart-link/confirmation fields remain writable. |

## Field Ownership Matrix

| Area | Canonical owner | Product extension owner | Legacy/read-only notes |
| --- | --- | --- | --- |
| Common identity/scope | `tours.systemCode`, `tourCode`, `name`, `branch`, `department`, `customerSource`, dates, owners, route, notes | none | Product detail tables must not write these after common-root migration. |
| GIT detail | `tours` for shared identity/scope/route and `tour_customers` for customer/agent rows | `git_tour_details.holdCode`, `itinerarySummary`, `collaborator`, `commissionRate`, `invoiceStatus`, `accountCode`, `fileNote` | `git_tour_details.agentName`, `git_tour_details.branch`, `git_tour_details.department`, and `git_tour_details.customerSource` are legacy snapshots only and should stay read-only until column removal is scheduled. |
| LandTour detail | `tours` for shared identity/scope/route, `tour_guides` for guide rows, and `tour_terms` for terms | `land_tour_details.comboType`, `autoTermsEnabled`, `smartLinkCode`, `confirmationNote` | `land_tour_details.guideName`, `land_tour_details.termsVi`, and `land_tour_details.termsEn` are legacy snapshots only; `itinerarySummary` remains a DTO alias for root `route`, not detail storage. |
| FIT root/detail | `tours` for shared identity/scope/dates/customer/service/cost/revenue/guide/attachment/survey data | `fit_tours` keeps FIT workflow and FIT-only operational fields during compatibility phase | Legacy `fit_*` child tables are writable only through `FitTourLegacyCompatService` and should become read-only after production drift checks pass. |

## Application Guardrails

- DTO field groups must classify shared fields as root/link/common child data, not product detail data.
- Product detail mappers must not write common root fields such as `branch`, `department`, `customerSource`, `operatorOwner`, dates, route, notes, or payment status.
- Product copy actions may orchestrate product-specific behavior, but shared service rows should be refreshed through `TourCoreService` helpers.
- Compatibility writes are allowed only where a named compatibility service owns the legacy surface.
- Shared and legacy child sync must follow the same orchestration shape:
  detect changed groups, delete existing rows for the parent, then create
  mapped rows when non-empty. `TourCoreService.replaceRows()` owns the common
  child implementation; FIT legacy compatibility owns the equivalent
  `replaceFitChildren()` helper.
- Product services should keep child mappers in focused helpers such as
  `mapTourCustomers()`, `mapTourServices()`, `mapTerms()`, and FIT-specific
  cost/revenue mappers. `create()`, `update()`, and copy actions should not
  inline common child row mapping.
- Create, update, copy, upload, close, and remove flows should log through
  `TourCoreService.logAction()` so metadata stays consistent:
  actor, action, module, entity, entityId, and action-specific fields.
- Copy actions should only replace the targeted child groups and then write a
  copy action log; they should not call the full update aggregate or resync
  unrelated common children.
- Remove ownership belongs to the common `Tour` root. Product remove actions
  should soft-delete the common root through `TourCoreService.softDelete()`;
  product detail rows may keep their compatibility status/snapshot but should
  not be hard-deleted by module services.

## Shared Data Migration

- Shared collections must be written through `TourCoreService.replace*` methods.
- Finance rows should link by `tourId` first. `orderId` remains as historical context and fallback for backfill.
- Reports that summarize finance should prefer `Tour` shared tables and finance rows linked by `tourId`.

## Decommission Path

1. Verify shared `Tour` child tables match legacy FIT/GIT/LandTour screens.
2. Stop direct writes to legacy child tables outside compatibility services.
3. Mark legacy child tables read-only at application level.
4. Remove compatibility writes after migration reports show no drift.
