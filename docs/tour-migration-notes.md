# Tour Migration Notes

## Ownership

- `tours` owns the shared tour root and shared collections: customer, supplier, service, revenue, cost, guide, attachment, survey, term, log, finance links.
- `fit-tours`, `git-tours`, and `landtours` own only product-specific extension data and route orchestration.
- Product controllers should not write shared child tables directly. They should call `TourCoreService`.

## Current Compatibility Phase

- `FitTour` legacy tables remain writable only through `FitTourLegacyCompatService` while data is being verified.
- `GitTourDetail` and `LandTourDetail` keep product-specific fields only. Shared fields should live on `Tour`.
- Legacy child tables should be treated as compatibility/read-only data after shared `Tour` child tables are verified in production.


## Field Ownership Matrix

| Area | Canonical owner | Product extension owner | Legacy/read-only notes |
| --- | --- | --- | --- |
| Common identity/scope | `tours.systemCode`, `tourCode`, `name`, `branch`, `department`, `customerSource`, dates, owners, route, notes | none | Product detail tables must not write these after common-root migration. |
| GIT detail | `tours` for shared identity/scope/route and `tour_customers` for customer/agent rows | `git_tour_details.holdCode`, `itinerarySummary`, `collaborator`, `commissionRate`, `invoiceStatus`, `accountCode`, `fileNote` | `git_tour_details.agentName`, `git_tour_details.branch`, `git_tour_details.department`, and `git_tour_details.customerSource` are legacy snapshots only and should stay read-only until column removal is scheduled. |
| LandTour detail | `tours` for shared identity/scope/route | `land_tour_details.guideName`, `comboType`, `autoTermsEnabled`, `smartLinkCode`, `confirmationNote`, `termsVi`, `termsEn` | `itinerarySummary` remains a DTO alias for root `route`, not detail storage. |
| FIT root/detail | `tours` for shared identity/scope/dates/customer/service/cost/revenue/guide/attachment/survey data | `fit_tours` keeps FIT workflow and FIT-only operational fields during compatibility phase | Legacy `fit_*` child tables are writable only through `FitTourLegacyCompatService` and should become read-only after production drift checks pass. |

## Application Guardrails

- DTO field groups must classify shared fields as root/link/common child data, not product detail data.
- Product detail mappers must not write common root fields such as `branch`, `department`, `customerSource`, `operatorOwner`, dates, route, notes, or payment status.
- Product copy actions may orchestrate product-specific behavior, but shared service rows should be refreshed through `TourCoreService` helpers.
- Compatibility writes are allowed only where a named compatibility service owns the legacy surface.

## Shared Data Migration

- Shared collections must be written through `TourCoreService.replace*` methods.
- Finance rows should link by `tourId` first. `orderId` remains as historical context and fallback for backfill.
- Reports that summarize finance should prefer `Tour` shared tables and finance rows linked by `tourId`.

## Decommission Path

1. Verify shared `Tour` child tables match legacy FIT/GIT/LandTour screens.
2. Stop direct writes to legacy child tables outside compatibility services.
3. Mark legacy child tables read-only at application level.
4. Remove compatibility writes after migration reports show no drift.
