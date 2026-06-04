# Tour Migration Notes

## Ownership

- `tours` owns the shared tour root and shared collections: customer, supplier, service, revenue, cost, guide, attachment, survey, term, log, finance links.
- `fit-tours`, `git-tours`, and `landtours` own only product-specific extension data and route orchestration.
- Product controllers should not write shared child tables directly. They should call `TourCoreService`.

## Current Compatibility Phase

- `FitTour` legacy tables remain writable only through `FitTourLegacyCompatService` while data is being verified.
- `GitTourDetail` and `LandTourDetail` keep product-specific fields only. Shared fields should live on `Tour`.
- Legacy child tables should be treated as compatibility/read-only data after shared `Tour` child tables are verified in production.

## Shared Data Migration

- Shared collections must be written through `TourCoreService.replace*` methods.
- Finance rows should link by `tourId` first. `orderId` remains as historical context and fallback for backfill.
- Reports that summarize finance should prefer `Tour` shared tables and finance rows linked by `tourId`.

## Decommission Path

1. Verify shared `Tour` child tables match legacy FIT/GIT/LandTour screens.
2. Stop direct writes to legacy child tables outside compatibility services.
3. Mark legacy child tables read-only at application level.
4. Remove compatibility writes after migration reports show no drift.
