# Progress

## Done

- Optimized Booking list/detail usage:
  - Booking list uses a frontend-focused summary select and omits linked IDs,
    contact detail, timestamps, and Tour Program detail fields.
  - Added validated paging (`take`/`skip`), a 100-row default cap, 50-row
    Booking UI pages, and an 80-row Operations selector request.
  - Added `/bookings/:id/delete-guard` for lightweight dependency counts.
  - Full detail remains bounded and excludes operation tasks/services/costs.
  - Added indexes for Booking start-date order, status filter, and Tour
    Program filter.
  - 300-row benchmark: 20.3 ms default page, 26.2 ms requested full set,
    439.6 bytes per row.
  - Verified on VPS: API/web builds, `LIST_VIEW_INCLUDE_AUDIT_OK`,
    `TEST_BOOKINGS_SERVICE_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_LIST_VIEW_PERFORMANCE_OK`.

- Made Booking deletion atomic and dependency-safe:
  - Booking deletion now uses a transaction and row lock before dependency
    counts and hard deletion.
  - Operation forms, operation vouchers, and allotment allocations block
    deletion and keep their Booking links after a rejected attempt.
  - Linked Customer, Order, and Tour records are parent references and are
    preserved when deleting an unused Booking.
  - Booking has no `deletedAt`, so soft delete was intentionally deferred
    rather than added inconsistently.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`.

- Localized Booking DTO validation:
  - Booking create/update/status DTOs now return Vietnamese validation
    messages instead of `class-validator` defaults.
  - DTO date fields only accept `YYYY-MM-DD`; service validation continues to
    reject non-existent calendar dates and invalid ranges.
  - Tests cover localized code, customer, phone, email, pax, date, partial
    update, and status validation.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`.

- Hardened Booking dates and linked-data scope:
  - Date validation coverage includes strict `YYYY-MM-DD`, invalid dates,
    empty/null values, partial updates, and equal dates for one-day tours.
  - Booking branch+department reads now require a single linked Customer,
    Order, or Tour to match both scope values.
  - Cross-relation scope combinations no longer expose bookings.
  - Tests reject out-of-scope Customer/Order/Tour updates and reference
    changes after operational dependencies exist.
  - Verified on VPS: `BOOKING_SCOPE_OK`, `TEST_BOOKINGS_SERVICE_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Tightened Booking text-field validation:
  - DTO and service validation now reject unsafe `customerName`, `saleOwner`,
    and `operatorOwner` values containing control characters or `< >`.
  - Owner fields remain optional but must be at least 2 characters when set.
  - `customerPhone` now requires 6-15 actual digits while preserving common
    formatting characters; `customerEmail` uses the shared stricter pattern.
  - `/bookings` UI form and server action mirror min/max/safe-text constraints
    for customer/owner fields currently exposed by the stable screen.
  - Booking service tests cover short/unsafe text, digitless phones, and
    unsafe emails on create/update paths.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`, web/API Docker builds,
    API/web redeploy, and `HEALTHCHECK_OK`.

- Classified Booking DTO fields:
  - `CreateBookingDto` now explicitly separates booking-core fields from
    cross-reference fields.
  - Booking-core fields are `code`, contact snapshot, pax/date/owner/price
    fields.
  - Cross-reference fields are `tourProgramId`, `customerId`, `orderId`, and
    `tourId`.
  - `UpdateBookingDto` reuses the approved create/edit field list and continues
    excluding status and operation-form fields.
  - Booking service tests assert the exact grouping contract and coverage.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`, API redeploy, and
    `HEALTHCHECK_OK`.

- Locked Booking code normalization and unique-conflict message:
  - Runtime writes to `Booking.code` are centralized through
    `BookingsService.create()` and `BookingsService.update()`.
  - Service-level `bookingCode()` keeps trim + uppercase + code-pattern
    validation at the write boundary.
  - `BOOKING_CODE_CONFLICT_MESSAGE` is now exported from the shared booking
    error contract.
  - Booking service tests assert exact duplicate-code conflict messages for
    normalized create and update writes.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`, API redeploy, and
    `HEALTHCHECK_OK`.

- Standardized Booking not-found messages:
  - Added a shared `BOOKING_NOT_FOUND_MESSAGES` map for Booking and its
    linked entity checks.
  - Booking detail/load mutations now use the same missing-booking message.
  - Booking reference validation now returns consistent entity messages for
    missing tour program, customer, order, and tour.
  - Booking service tests assert the exact messages so FE-facing contracts do
    not drift.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`, API redeploy, and
    `HEALTHCHECK_OK`.

- Confirmed Booking delete guardrails:
  - Booking delete remains blocked when `operationForm`,
    `operationVouchers`, or `allotmentLocks` exist.
  - This is required because the underlying relations are nullable and would
    otherwise be set to null, losing the booking link from operational history.
  - Existing `BookingsService.bookingUsage()` already checks all three groups.
  - Added service-test coverage for operation-voucher and allotment-allocation
    delete blockers.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`.

- Locked Booking update/status boundaries:
  - `UpdateBookingDto` remains limited to approved booking edit fields and does
    not expose `status`.
  - `BOOKING_UPDATE_FIELDS` now makes the editable field list explicit for DTO
    and tests.
  - `UpdateBookingStatusDto` remains the only DTO for status changes through
    `PATCH /api/bookings/:id/status`.
  - Booking service tests now assert the exact update field list and ensure
    general update rejects status changes.
  - Legacy `bookings-page.tsx` status action now calls `/bookings/:id/status`
    instead of the general booking update endpoint.
  - Verified on VPS: `TEST_BOOKINGS_SERVICE_OK`, web Docker build, API/web
    redeploy, and `HEALTHCHECK_OK`.

- Trimmed heavy include/select payloads in list/detail APIs:
  - Operations form and supplier-payment-request list calls now use explicit
    list `select` helpers; detail/mutation responses keep needed nested data
    through narrowed relation selects.
  - Supplier typed/hotel list calls now use list include helpers that omit
    detail-only files/category/allotment log/allocation payloads while
    preserving UI edit/list requirements.
  - Tour Program detail now returns lightweight booking previews instead of
    full booking rows.
  - Updated list include audit coverage for operations, suppliers,
    tour-program detail, and current finance list contracts.
  - Refreshed Operations backend smoke fixture to create itinerary day 1 before
    booking creation.
  - Verified on VPS: `LIST_VIEW_INCLUDE_AUDIT_OK`, API Docker build,
    `TEST_LIST_VIEW_PERFORMANCE_OK`, API redeploy,
    `SMOKE_OPERATIONS_BACKEND_OK`, `SMOKE_SUPPLIERS_OK`,
    `TEST_TOUR_PROGRAMS_SERVICE_OK`, and `HEALTHCHECK_OK`.

- Standardized free-text search behavior in list/list-like APIs:
  - Added shared list search normalization with trim, whitespace collapse,
    min length 2, max length 80, and consistent insensitive `contains`.
  - Applied it across Orders, Booking, Tours, FIT/GIT/LandTour, Operation
    Vouchers, Operations, Suppliers, Tour Guides, Tour Programs, Order Center,
    Quotations, Quotes, Customers, Commission, Finance, and Reports.
  - Avoids unnecessary broad `OR contains` and nested relation search for
    one-character or blank terms.
  - Lightened Finance invoice/receipt list payloads so dense list calls do not
    return heavy child arrays.
  - Verified on VPS: API Docker build, `TEST_LIST_VIEW_PERFORMANCE_OK`,
    `TEST_ORDERS_API_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API redeploy, and
    `HEALTHCHECK_OK`.

- Hardened read-side branch/department data scope:
  - `branchDepartmentScopeWhere()` now narrows reads by every enabled scope
    dimension, so users with both branch and department scope must match both.
  - Booking, Operation Voucher, and Operations list/detail helpers now apply
    relation-based branch and department scopes as separate required groups.
  - Updated data-scope tests and audit coverage for mixed branch+department
    users, including Orders list/detail rows that match only one dimension.
  - Verified on VPS: `TEST_AUTH_DATA_SCOPE_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `DATA_SCOPE_AUDIT_OK`, API Docker build,
    API redeploy, and `HEALTHCHECK_OK`.

- Fixed Orders client-side auth under production enforcement:
  - Browser fetches in `apps/web/app/orders/[type]/OrdersClient.tsx` now send
    `Authorization` through shared auth helpers for list reload, detail load,
    create/update, copy/settle, and unlock.
  - Added `scripts/test-orders-ui-auth-contract.sh` so this fetch/header wiring
    is covered by a fast contract test.
  - Verified on VPS: `TEST_ORDERS_UI_AUTH_CONTRACT_OK`, web Docker build,
    isolated `TEST_ORDERS_API_OK`, web redeploy, and `HEALTHCHECK_OK`.
  - `smoke-ui-pages.sh` and `smoke-order-lifecycle.sh` still need
    `ADMIN_PASSWORD` before they can run against production.

- Refactored Booking update/status boundaries:
  - `UpdateBookingDto` now excludes status; `UpdateBookingStatusDto` owns
    workflow status updates and normalizes status input.
  - `PATCH /api/bookings/:id` now rejects status payloads; `/bookings` UI uses
    `PATCH /api/bookings/:id/status` for status changes.
  - Booking service now validates `tourProgramId`, `customerId`, `orderId`,
    and `tourId` through one shared reference helper for create/update and
    scoped-link checks.
  - Create/update/status writes validate existing or incoming date ranges
    before persistence, and partial date updates are checked against current
    booking dates.
  - Expanded Booking service tests for missing references, partial invalid
    date updates, status rejection on general update, and lowercase
    `updateStatus`.
  - Verified API/web Docker builds, `TEST_BOOKINGS_SERVICE_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, production Booking smoke with cleanup,
    and `HEALTHCHECK_OK`.

- Reviewed Booking and all current tour type APIs on the VPS.
- Confirmed Booking service has active validation/scope coverage for linked
  Customer/Order/Tour data, complete Tour Program itinerary days,
  duration/date consistency, status transitions, and operation-form locks.
- Added `PATCH /api/tours/:id`, `PATCH /api/fit-tours/:id`, and
  `PATCH /api/landtours/:id` partial-update aliases; GIT already had `PATCH`.
- Hardened common Tour list filters so invalid `type`/`status` values return
  controlled 400 responses instead of Prisma enum errors.
- Normalized lowercase status query values for FIT, GIT, LandTour, and common
  Tour list endpoints while preserving controlled 400 responses for invalid
  enum filters.
- Added `scripts/test-tour-type-apis.sh` to integration-test authenticated
  HTTP `PATCH` routes and enum query behavior on an isolated temp database.
- Verified `TEST_BOOKINGS_SERVICE_OK`, `TEST_TOUR_TYPE_APIS_OK`,
  `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, production API restart, production
  tour-type authenticated smoke with cleanup, and `HEALTHCHECK_OK`.

- Hardened Auth/RBAC data-scope enforcement for Finance Invoice and supplier
  allotment allocations while production auth enforcement is enabled.
- Finance Invoice APIs now scope list/detail/export, file operations,
  create/update/delete, approve/reject/cancel through linked Customer, Order,
  Tour, or Finance Receipt.
- Scoped Finance Invoice writes now reject records without a scoped business
  link and reject links outside the user's branch/department scope.
- Hotel allotment locks now require a scoped Order, Booking, or Tour link for
  scoped users, and allocation confirm/release respects the same scope.
- Updated `scripts/test-data-scope-module-flows.sh` to instantiate current tour
  services and create complete Tour Program itinerary setup for Booking tests.
- Verified API Docker build, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
  production API restart, `HEALTHCHECK_OK`, and production scoped smoke for
  invoice scope plus allotment lock scope.

- Reviewed and hardened Tour Program, FIT Tour, and GIT Tour modules on the VPS.
- Confirmed Tour Program has backend validation, create/edit/delete UI guards,
  itinerary-day add flows, and passing service coverage.
- Added auth-token forwarding to FIT Tour server page fetches, client list
  reload, wizard detail load, save/autosave, copy-budget, and copy-operation
  requests so FIT works under enforced Auth/RBAC.
- Added `PATCH /api/git-tours/:id` as a partial-update alias for GIT Tour and
  kept existing `PUT /api/git-tours/:id`.
- Added controlled validation for invalid GIT Tour `status` list filters.
- Rebuilt and restarted API/web containers; authenticated smoke passed for Tour
  Program create/list, FIT create/detail/update, GIT create/PATCH/detail,
  invalid GIT status 400, and routes `/tour-programs`, `/fit-tours`,
  `/git-tours`.

- Added scheduled production operations and OS-reinstall readiness:
  - Systemd health check every 10 minutes.
  - Daily PostgreSQL backup at 02:15.
  - Weekly full disaster backup at 03:30 Sunday.
  - Weekly PostgreSQL restore drill at 05:00 Sunday.
  - Full backup includes logical database dumps, consistent raw
    PostgreSQL/MinIO/n8n volumes, Git bundle, secrets/configuration, host
    configuration, inventory, and checksums.
  - Health check detects the root-directory permission failure that caused the
    June 8 systemd/network incident and rejects stale or invalid DB backups.
  - Added `docs/operations-backup-reinstall.md`.
  - Installed and enabled all four timers on the VPS.
  - Verified daily backup checksum and restore drill against 31 migrations,
    4 users, 4 roles, and 120 role permissions.
  - Created and verified full disaster archive
    `smarttour-disaster-20260608-161016.tar.gz`, including internal checksums
    and a complete Git bundle, then copied it off-server with matching SHA256.

- Created SmartTour monorepo structure.
- Added Next.js web app skeleton.
- Added NestJS API skeleton.
- Added Prisma schema for operation-focused MVP.
- Added Docker Compose for postgres, redis, minio, n8n, api, web, and nginx.
- Added AGENTS.md.
- Added memory-bank documentation.
- Added PrismaService and DatabaseModule.
- Added SupplierCategory and Supplier CRUD API.
- Added supplier management web page for creating categories and suppliers.
- Added Tour Program and Itinerary Day CRUD API.
- Added tour program web page for creating tour templates and itinerary days.
- Added Booking CRUD API.
- Added booking web page for creating and listing bookings from tour programs.
- Added Booking screen inline edit, delete, and status update flows.
- Fixed API Docker build so Prisma Client is generated for the Alpine runtime.
- Smoke-tested Booking create, edit, status update, and delete through the API against Docker Postgres.
- Added FIT TourKit database schema and migration `20260525021343_fit_tourkit_module`.
- Added FIT TourKit API module with CRUD, copy budget, copy operation, import, and export endpoints.
- Added `/fit-tours` 6-step wizard with React Hook Form, Zod validation, TanStack Table dynamic cost/service tables, realtime summaries, and draft autosave.
- Smoke-tested FIT create, update, copy operation, and delete through the API against Docker Postgres.
- Added `docs/tour-management-module.md` to align future work with a common `tours` architecture for FIT, GIT, and LandTour.
- Added common Tour core migration `20260525023000_tour_common_core`.
- Added common Tour API module `/api/tours`.
- Refactored FIT API so FIT create/update/delete also creates, syncs, and removes the common `Tour` aggregate.
- Smoke-tested common Tour sync through FIT create/update/delete and `/api/tours/:id`.
- Added GIT extension migration `20260525024500_git_tour_detail`.
- Added GIT API module `/api/git-tours` on top of common `Tour`.
- Added `/git-tours` first management screen for creating and listing GIT tours.
- Smoke-tested GIT create, update, list, and delete through the API against Docker Postgres.
- Added LandTour extension migration `20260525030000_landtour_detail`.
- Added LandTour API module `/api/landtours` on top of common `Tour`.
- Added `/landtours` first management screen for creating and listing LandTour/Combo products.
- Smoke-tested LandTour create, update, list, and delete through the API against Docker Postgres.
- Added Hotel Supplier core migration `20260525032500_hotel_supplier_core`.
- Extended Supplier data with supplier code, tax code, location, website, and active/inactive status.
- Added Hotel Supplier profile, contacts, service/product rows, allotment rows, and file metadata tables.
- Added `/api/suppliers/hotels` list/detail/create/update endpoints and `PATCH /api/suppliers/:id/status`.
- Added `/suppliers/hotels` first management screen with React Hook Form, Zod validation, TanStack Table dynamic rows, search/list, edit, save, and close actions.
- Smoke-tested Hotel Supplier create, detail, status update, delete cleanup, and web page availability.
- Added generic supplier migration `20260525034500_supplier_generic_types`.
- Added shared Supplier bank/rating/market/link fields and SupplierService quantity/status/metadata fields for non-hotel supplier modules.
- Added typed Supplier API routes for restaurants, flights, attraction tickets, landtour suppliers, water, transport, bus, other costs, villas, passport/visa, guides, and series tickets.
- Added `/suppliers/[type]` dynamic UI for the remaining NCC modules with type-specific service columns.
- Smoke-tested generic supplier create, detail, status update, and delete for restaurants, flights, attraction tickets, and landtour suppliers.
- Checked web page availability for `/suppliers/restaurants`, `/suppliers/flights`, `/suppliers/attraction-tickets`, `/suppliers/landtour-suppliers`, `/suppliers/water`, and `/suppliers/guides`.
- Added Quotes module migration `20260525041000_quotes_module`.
- Added Tour Quote database tables for quote header, cost items, and itineraries.
- Added Combo Quote database tables for combo header and service items.
- Added `/api/quotes/tours` CRUD with approve, reject, and convert actions.
- Added `/api/quotes/combos` CRUD with create-quote, create-order, and recalculate actions.
- Added `/quotes/tours` UI with realtime cost summary, 3 cost groups, itinerary rows, approval/convert actions, and list.
- Added `/quotes/combos` UI with supplier/service rows, combo type, notes, realtime price block, quote/order actions, and list.
- Smoke-tested Quotes API calculations and actions, plus web page availability.
- Added shared Orders module migration `20260525043500_orders_module`.
- Added common `Order` database aggregate with child tables for guides, sales services, operation services, members, itineraries, handover items, survey questions, terms, files, and logs.
- Added `/api/orders/:type` CRUD/status/copy/settle endpoints for `fit-tours`, `git-combos`, `landtours`, and `single-services`.
- Added `/orders/[type]` dynamic UI for FIT order, GIT/Combo order, LandTour order, and single-service order creation/management.
- Added hotel booking order type migration `20260525050000_hotel_booking_order_type`.
- Added `/api/orders/hotel-bookings` and `/orders/hotel-bookings` for Booking Phong/Khach san.
- Smoke-tested hotel booking create, status update, copy, soft-delete cleanup, and web page availability.
- Added flight booking order type migration `20260525053000_operation_vouchers_flight_orders`.
- Added `/api/orders/flight-orders` and `/orders/flight-orders` for Booking ve may bay.
- Added Operation Voucher database tables for voucher header, service details, and payments.
- Added `/api/operation-vouchers` CRUD plus payment and create-payment-voucher endpoints.
- Added `/operation-vouchers` management UI with dynamic service rows, realtime total, payment recording, search/list, and edit flow.
- Smoke-tested operation voucher create/payment, flight order create, and web page availability for `/operation-vouchers` and `/orders/flight-orders`.
- Added independent HDV migration `20260525054500_tour_guides_module`.
- Added `/api/tour-guides` CRUD for guide profiles, cards, passport/visa documents, guide cost services, files, and schedules.
- Added `/tour-guides` UI with profile form, dynamic HDV card/document/cost/schedule rows, search/list, and edit flow.
- Smoke-tested HDV create/delete cleanup and web page availability.
- Added hotel allotment inventory migration `20260525060000_hotel_allotment_inventory`.
- Extended Supplier Allotment with total allotment, booked, locked, status, and audit log table.
- Added hotel allotment dashboard, inventory, and override APIs.
- Added allotment metrics and inventory columns to `/suppliers/hotels`.
- Smoke-tested hotel allotment create, remaining-room calculation, override, dashboard, and web page availability.
- Added Order Center independent module from `tour/bosung.md`.
- Added `/api/order-center` dashboard/list and `/api/order-center/export` CSV export using shared `Order` data.
- Added `/order-center` UI with dashboard cards, advanced filters, centralized order table, and CSV export.
- Added settlement unlock flow with reason and `OrderLog`; settle now also writes audit log.
- Smoke-tested Order Center dashboard/list/export and settlement settle/unlock flow.
- Added unified Quotation Engine migration `20260525062000_unified_quotation_engine`.
- Added common Quotation tables for product type, quote header, dynamic service items, approval logs, SmartLink token, and convert-to-order link.
- Added `/api/quotations` dashboard/list/detail/create/update/delete plus submit/approve/reject/smartlink/convert actions and public SmartLink detail.
- Added `/quotations` UI with unified quote form, product type selector, price engine, item markup amount/percent, approval, SmartLink, and convert-to-order actions.
- Smoke-tested unified quotation create, submit, approve, SmartLink, convert-to-order, dashboard, and web page availability.
- Added Reporting & Analytics module from `SmartTour_Reporting_Module_Additional_Spec.md`.
- Added `/api/reports` endpoints for overview, business summary, revenue grouping, profit, finance, customer debt, supplier debt, employee performance, order history, supplier history, and CSV export.
- Added `/reports` UI with shared filters, KPI dashboard, report tabs, grouping selector, normalized debt rows, and export.
- Linked dashboard `Bao cao lai lo` to `/reports`.
- Smoke-tested reports overview, revenue, customer debt, supplier debt, export, and web page availability.
- Added Customer CRM core migration `20260525070000_customer_crm_core`.
- Added Customer master data tables for configurable customer types, tags, campaigns, contacts, timeline, care tasks, comments, call logs, and opportunities.
- Added nullable `customerId` fields to `Order`, `TourQuote`, and `Quotation` for direct CRM linking.
- Added `/api/customers` dashboard/list/detail/create/update/delete plus type/tag/campaign config, bulk tag, merge, transfer owner, import/export CSV, and related orders/quotes/debts/timeline/care/opportunity endpoints.
- Added `/customers` UI with CRM KPI dashboard, advanced filters, customer master form, tag picker, contact/CSKH/opportunity quick entry, list, detail panel, and CSV export.
- Linked dashboard `CRM khach hang` to `/customers`.
- Smoke-tested Customer CRM create/detail/dashboard/export/list, duplicate phone validation, delete cleanup, and web page availability.
- Added Commission Reporting migration `20260525073000_commission_reporting`.
- Added commission rule, entry, approval log, and payment tracking tables linked directly to `Order`.
- Added `/api/commission-reports` list/detail/summary/grouping/export/sync and approve/reject/revoke/pay actions.
- Added `/commission-reports` UI with dashboard KPIs, filters, grouped summaries, detail logs, approve/reject/pay actions, and CSV export.
- Linked dashboard `Bao cao hoa hong` to `/commission-reports`.
- Extended `/api/customers` with bulk update and post-create endpoints for comments, care tasks, call logs, opportunities, and care-task status updates.
- Smoke-tested commission sync/list/summary/export/approve/pay, `/commission-reports` page availability, and customer sub-actions/bulk update cleanup.
- Added shared web app shell with grouped sidebar navigation, sticky topbar, global search field, domain/status pills, and responsive mobile menu.
- Reworked `/` into a SmartTour operations dashboard that uses the shared shell instead of rendering its own sidebar.
- Updated global CSS so existing module pages render inside the shell with consistent spacing.
- Rebuilt and redeployed `smarttour-web-preview`; smoke-tested `/`, `/customers`, and `/reports` through `https://quanly.dunientravel.com`.
- Improved the shared app shell topbar with current route group/title, icon, and quick workflow links.
- Added sidebar workspace footer and shared table/panel/metric polish including sticky table headers, row hover, and subtle card shadows.
- Rebuilt and redeployed `smarttour-web-preview`; smoke-tested `/`, `/order-center`, and `/commission-reports` through `https://quanly.dunientravel.com`.
- Added functional global module search dropdown in the shared shell.
- Added contextual module strip below the topbar for lateral navigation within each workflow group.
- Added shared empty/loading state styles for future module UI passes.
- Rebuilt and redeployed `smarttour-web-preview`; smoke-tested `/`, `/orders/fit-tours`, and `/customers` through `https://quanly.dunientravel.com`.
- Added `Ctrl+K` command palette and collapsible desktop sidebar to the shared app shell.
- Rebuilt and redeployed `smarttour-web-preview`; smoke-tested `/`, `/reports`, and `/suppliers` through `https://quanly.dunientravel.com`.
- Added activity/notification drawer to the topbar with actionable links for order reconciliation, commission approval, debt reports, and quick workflows.
- Persisted sidebar collapsed state in browser local storage.
- Cleaned up `/order-center` to use the shared AppShell instead of rendering its old nested sidebar/topbar.
- Polished Order Center metrics, filter panel, status pills, data table, and empty state.
- Cleaned up `/reports` to use the shared AppShell and removed its legacy nested sidebar/topbar.
- Updated `/commission-reports` and `/customers` headers to the shared `pageHeader` pattern.
- Polished report metrics, filter grid, data table, and empty state.
- Cleaned up `/bookings`, `/fit-tours`, `/git-tours`, `/landtours`, `/operation-vouchers`, `/quotations`, `/suppliers`, `/tour-guides`, and `/tour-programs` to use shared `AppShell` navigation and `pageHeader` instead of nested legacy shell/sidebar/topbar markup.
- Rebuilt and redeployed `smarttour-web-preview`; smoke-tested `/`, all newly migrated module pages, `/order-center`, `/reports`, `/commission-reports`, and `/customers` through `https://quanly.dunientravel.com`.
- Pruned Docker build cache and unused images after image build failed from low disk space; Docker volumes were left intact.
- Added Finance & Accounting migration `20260525081500_finance_accounting_module`.
- Added finance tables for receipts, receipt order allocations, payments, VAT invoices, invoice items, and approved cashflow entries.
- Added `/api/finance/receipts`, `/api/finance/payments`, `/api/finance/invoices`, and `/api/finance/cashflow` with list/detail/create/update/delete, approve/reject, CSV export, and import placeholder endpoints.
- Approved receipts/payments now generate cashflow entries and can update linked `Order` payment/cost status when an order id is supplied.
- Added `/finance` UI with tabs for pending receipts, receipts, payments, VAT invoices, and cashflow summary.
- Added `Tai chinh / Ke toan` navigation group to the shared AppShell.
- Rebuilt/restarted `smarttour-api-1` and `smarttour-web-preview`; smoke-tested finance create/approve/cashflow API flows with cleanup and page availability for `/finance` tabs.
- Added production Finance linking migration `20260525084500_production_finance_links`.
- Added real FK relations for finance/customer/order/supplier/operation-voucher links plus customer/order relations on quotes and orders.
- Added `CustomerLedgerEntry`, `SupplierLedgerEntry`, and `CodeSequence` tables.
- Added cancel/reversal metadata fields to finance receipts, payments, and invoices.
- Added DB check constraints for non-negative finance amounts and one-sided ledger debit/credit entries.
- Updated Finance approve flow to be idempotent and to write customer/supplier ledger entries.
- Rebuilt `smarttour-api-1`; smoke-tested linked customer receipt, supplier payment, invoice approval, repeated approve idempotency, ledger generation, and cleanup.
- Finance create endpoints now use `CodeSequence` generated codes for receipts, payments, and invoices when no code is supplied.
- Added approved-voucher cancel/reversal endpoints for finance receipts, payments, and invoices.
- Cancel flow creates reversal documents plus reversing cashflow and ledger rows; approved originals are marked `CANCELLED`.
- Added `/api/finance/debt/customers` and `/api/finance/debt/suppliers` ledger summary endpoints.
- Rebuilt `smarttour-api-1`; smoke-tested sequence generation, approve, cancel/reversal, debt summary, and cleanup.
- Added core production DB link migration `20260525093000_core_booking_supplier_links`.
- Linked legacy `Booking` to CRM `Customer`, `Order`, and common `Tour`; added customer phone/email snapshot fields.
- Linked common `Tour` back to `Order`, and linked `TourCustomer` to CRM via `crmCustomerId`.
- Linked `TourService` and `OperationService` to `SupplierService`.
- Added `OperationVoucher.orderId`, FK for `OperationVoucher.bookingId`, and FK from `OperationVoucherPayment.paymentVoucherId` to `FinancePayment`.
- Added `SupplierAllotmentAllocation` for inventory locks/confirm/release by allotment, supplier, service, order, booking, and tour.
- Added supplier/supplier-service soft-delete columns plus non-negative DB check constraints for booking/order/supplier/tour/operation amount fields.
- Deployed migration to VPS, generated Prisma Client, rebuilt/restarted `smarttour-api-1`, and smoke-tested API/page availability plus Prisma Client query against the new allocation table.
- Updated Booking API to persist and return `customerId`, `orderId`, `tourId`, and customer contact snapshots.
- Updated Tour API to persist and return `orderId`.
- Updated Operation Voucher API to validate/derive booking, order, tour, and supplier links; voucher details now return linked booking/order/tour and linked finance payment vouchers.
- Operation Voucher `create-payment-voucher` now creates a real `FinancePayment` row and links `OperationVoucherPayment.paymentVoucherId` to its ID.
- Supplier deletion now soft-deletes suppliers instead of physically deleting production history.
- Added allotment allocation lock, confirm, and release endpoints with transactional `lockedQty`/`bookedQty` updates and logs.
- Rebuilt/restarted `smarttour-api-1`; smoke-tested full linked flow and verified smoke rows were cleaned.
- Hotel booking orders now automatically sync hotel allotment inventory:
  - Create locks active allotments for operation items with `serviceId`.
  - Update releases prior auto locks and recreates them from the new operation item list.
  - Delete or status `CANCELLED` releases auto allocations.
  - Status `RUNNING`, `COMPLETED`, or `SETTLED` confirms locks into booked quantity.
  - All actions write `SupplierAllotmentLog` with actor `ORDER_AUTO`.
- Rebuilt/restarted `smarttour-api-1`; smoke-tested create lock, status confirm, status cancel release, and cleanup.
- Added migration `20260525102000_order_operation_allotment_trace`.
- Added `SupplierAllotmentAllocation.orderOperationItemId` FK to trace auto inventory locks back to the exact `OrderOperationItem`.
- Order API now accepts `customerId`, validates it, and fills missing customer snapshot fields from CRM.
- Order list/detail includes linked Customer, supplier/service details, and allotment lock relations.
- Hotel booking auto-allocation now stores `orderOperationItemId`.
- Deployed migration, regenerated Prisma Client, rebuilt/restarted `smarttour-api-1`; smoke-tested CRM customer link/snapshot and allocation operation-item trace with cleanup.
- Added migration `20260525104500_operation_fit_guide_payment_links`.
- Linked guide schedules to common `Tour` and `Order`.
- Linked operation forms to `Order` and `Tour` at DB level for the future operation workflow.
- Linked FIT tours to CRM `Customer` and `Order`.
- Linked FIT operation service rows to `SupplierService`.
- Linked supplier payment requests to `FinancePayment` at DB level for future supplier payment reconciliation.
- Updated FIT API to accept `customerId` and `orderId`, validate the linked order, return linked customer/order data, link the common `Tour` to the order, and write `TourCustomer.crmCustomerId`.
- Updated FIT operation service mapping/copy flow to preserve `supplierServiceId`.
- Updated Tour Guide API to validate schedule `tourId`/`orderId` and include linked tour/order data in responses.
- Deployed migration, regenerated Prisma Client, rebuilt/restarted `smarttour-api-1`; smoke-tested FIT customer/order/service links and guide schedule links with cleanup.
- Replaced the stub Operations API with real backend workflows using existing DB tables.
- Added `/api/operations/forms` list/detail/create/update/cancel endpoints.
- Operation forms now validate and derive booking/order/tour links and persist services, tasks, costs, supplier links, and supplier-service links.
- Added `/api/operations/supplier-payment-requests` list/detail/create/update/delete endpoints.
- Added supplier payment request submit, approve, reject, and create-finance-payment actions.
- Approved supplier payment requests now create supplier ledger payable credits.
- Creating finance payment from a supplier payment request creates a real `FinancePayment` and stores `SupplierPaymentRequest.financePaymentId`.
- Rebuilt/restarted `smarttour-api-1`; smoke-tested operation form creation, supplier-service link, supplier payment approval, ledger credit, finance payment creation/approval, supplier debt balance, route health, and cleanup.
- Added `/operations` UI for the new Operations backend.
- Added AppShell navigation item `Van hanh tour` and contextual workflow link.
- `/operations` includes dashboard KPIs, filters, Operation Form quick-create/list/cancel, and Supplier Payment Request create/list/actions.
- Supplier Payment Request UI can submit, approve, reject, create linked finance payment, and approve the generated finance payment.
- Rebuilt/restarted `smarttour-web-preview`; smoke-tested `/operations`, operation APIs, `/finance`, and `/operation-vouchers` through the domain.
- Added Auth/RBAC foundation migration `20260526090000_auth_rbac_foundation`.
- Extended `User` with status, branch, department, last login, role relations, session relations, and audit relations.
- Added `Role`, `UserRole`, `RolePermission`, and `UserSession` models.
- Added FK from `AuditLog.actorId` to `User`.
- Seeded system roles `super_admin`, `accounting`, `operation`, and `sales` with initial permissions.
- Added API `/api/auth/bootstrap`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/users`, and `/api/auth/roles`.
- Added PBKDF2 password hashing and DB-backed token sessions using SHA-256 token hashes.
- Added permission decorator and global Auth/RBAC guard; enforcement can be fully enabled with `SMARTTOUR_AUTH_ENFORCE=true`.
- Decorated sensitive finance approval/cancel endpoints and operations mutation/approval endpoints.
- Added `/login` UI, AppShell login/logout display, and localStorage Bearer token wiring for Finance and Operations actions.
- Deployed migration/API/web; smoke-tested auth create/login/me/logout, RBAC insufficient-permission denial, super-admin role/user access, route health, and migration status.
- Added `/security` UI for Auth/RBAC administration.
- Added AppShell `He thong` navigation group with `Phan quyen`.
- `/security` supports creating users, assigning roles, updating user status/branch/department/password, creating roles, updating roles, and editing permission lists.
- Rebuilt/restarted `smarttour-web-preview`; smoke-tested `/security`, `/login`, auth APIs, `/operations`, and `/finance`.
- Added migration `20260526093000_expand_rbac_permissions`.
- Expanded seeded role permissions for finance create/update/delete/import and operation/sales management scopes.
- Added permission decorators to mutation endpoints for orders, bookings, tours, FIT/GIT/LandTour, tour guides, operation vouchers, suppliers, quotes, quotations, customers, commission reports, tour programs, and finance create/update/delete/import flows.
- Rebuilt and restarted `smarttour-api-1`; current VPS migration status is up to date with 23 migrations.
- Smoke-tested API/page health through the domain for auth/security, order, booking, supplier, tour, quote, customer, commission, finance, and operations routes.
- Smoke-tested RBAC behavior with a temporary `accounting` user: authenticated order mutation is denied with `401 Missing permission`; legacy unauthenticated behavior still works while `SMARTTOUR_AUTH_ENFORCE` is false.
- Added shared frontend auth helpers for client fetches and server actions.
- Login now writes the auth token to both localStorage and a `smarttour.auth.token` cookie; logout clears both.
- Wired Bearer token headers into main client mutation flows for Orders, FIT, Quotes, Quotations, Operation Vouchers, Suppliers, Tour Guides, Customers, and Commission Reports.
- Wired legacy server-action mutation pages to send the cookie-backed token for Bookings, GIT, LandTour, Tour Programs, and Suppliers.
- Rebuilt/restarted `smarttour-web-preview`; smoke-tested 21 domain pages including `/login`, `/security`, `/bookings`, product/tour pages, quotes/quotations, suppliers, customers, commission, finance, and operations.
- Added `usePermissions` helper for permission-aware UI controls in logged-in sessions while preserving legacy no-enforce behavior when no user is present.
- Disabled major create/approve/mutation buttons by permission in Finance, Operations, Orders, FIT, Quotes, Quotations, Operation Vouchers, Suppliers, Tour Guides, Customers, and Commission Reports.
- Rebuilt/restarted `smarttour-web-preview`; smoke-tested 20 key pages through the domain with all returning 200.
- Added migration `20260526100000_complete_rbac_role_permissions`.
- Expanded system role seeds with explicit view/manage/import/export permissions for super admin, accounting, operation, and sales.
- Accounting now has commission management and report/export permissions; sales has quote/quotation/customer/order permissions; operation has booking/tour/guide/supplier/order/operation permissions.
- Expanded `/security` common permission catalog so role admins can edit the current app permission set.
- Moved permission helper to `usePermissions.tsx`, added `canAny()` and reusable `PermissionNotice`.
- Added page-level permission notices across Finance, Operations, Orders, FIT, Quotes, Quotations, Operation Vouchers, Suppliers, Tour Guides, Customers, and Commission Reports.
- Applied migration on VPS; Prisma status is up to date with 24 migrations.
- Rebuilt/restarted `smarttour-web-preview`; smoke-tested 20 key routes through the domain.
- Authenticated RBAC smoke-tested temporary sales/accounting/operation users and cleaned them up. Guard behavior passed; operation form empty-payload path currently reaches service and returns 500, so validation hardening remains before global enforcement.
- Added Operations backend and UI smoke coverage.
- `smoke-operations-backend.sh` now exercises dashboard load, operation form create/update/cancel, supplier payment request lifecycle, finance payment creation/approval/cancel reconciliation, branch scope, missing branch guardrails, and permission denials for view-only/request-create roles.
- `smoke-operations-ui.js` now uses Playwright to cover `/operations` dashboard/form list loading, form and payment modals, request search, reconciliation panel, action button state, and tab-state reset.
- Added stable Operations UI `data-testid` anchors and `smoke:operations:ui` npm script.
- Verified on VPS: Operations backend smoke passed with `SMOKE_OPERATIONS_BACKEND_OK`, web Docker build passed, and Operations UI smoke passed with `SMOKE_OPERATIONS_UI_OK` against `https://aitour.io.vn`.

## Not Done

- UI pass for individual dense module screens: table polish, empty/loading states, drawer detail views, and consistent action toolbars, especially the now shell-aligned product/operation pages.
- Finance deepening: expose ledger/debt aging screens in UI, add manual adjustment endpoints, real XLSX import/export, Word/PDF export, binary upload storage, approval permissions, and richer operation-voucher/payment-request reconciliation UI.
- Commission RBAC scopes, real payment voucher integration, Excel/PDF commission exports, tier rule management UI, and AI forecast integration.
- Customer binary uploads, real Excel/PDF import/export, RBAC data scopes, customer contracts/visa/booking normalized links, and AI lead scoring/insights.
- Supplier edit/delete UI.
- Real binary/file storage for Supplier attachments; current Hotel Supplier screen only reserves the file input area.
- Supplier import/export, debt links, payment totals, and transaction-aware soft delete.
- Dedicated Supplier APIs for contact/service/allotment row-level CRUD.
- UI surfacing for automatic hotel allotment allocation status in hotel booking and supplier inventory screens.
- Dedicated normalized child tables for restaurant menu items, flight deadlines/pricing, landtour itineraries, villa pricing, and other type-specific records; current generic implementation stores type-specific service fields in `SupplierService.metadata`.
- Voucher/ticket supplier variants beyond attraction tickets and series tickets.
- Quote PDF/print/export/import.
- Quote customer lookup against CRM/customers.
- Real convert-to-booking flow from Tour Quote and Combo Quote; current actions mark status only.
- Rich text editor for quote itinerary content.
- Hotel booking dedicated room/NCC selector from Hotel Supplier service rows; current hotel booking uses shared sales/operation rows.
- Orders receipts, payments, finance history, export Word/PDF/Excel, and approval workflow UI.
- Credentialed production UI/page and order lifecycle smoke runs need the real
  `ADMIN_PASSWORD`; do not reset production credentials just to run them.
- HDV file upload binary storage and calendar conflict UI; current `/tour-guides` stores file URL fields and validates only overlapping schedules submitted in the same request.
- Allotment calendar day/week/month UI, automatic booked quantity updates from hotel booking orders, COD enforcement in order create flow, and full stop-sell blocking rules.
- Group Booking Engine, Tour Transfer, Refund Management, SmartLink Portal, Email/Notification Center, Bulk Tour Generator, Dynamic Code Generator, KPI dashboards, RBAC permissions, Excel import/export, and notification service from `tour/bosung.md`.
- Quotation Excel/PDF/Word export, supplier price picker, real hotel inventory pull for booking quotations, reminder notifications, 2-level approval permissions, public branded SmartLink page, quote AI readiness endpoints.
- Reporting SQL/materialized views, XLSX export, chart visualizations, drill-down modal UI, RBAC report permissions, and receipt/payment voucher detail joins beyond current `Order`/`OperationVoucher` aggregates.
- Operation voucher integration with real payment vouchers/expenses; current `create-payment-voucher` records voucher payment metadata only.
- Flight booking dedicated passenger/ticket/term tables; current implementation uses shared `Order` members, sales items, operation items, terms, and surveys.
- Real binary/file storage for FIT attachments; current UI records selected file metadata only.
- Structured XLSX/CSV import and export for FIT tours.
- Full GIT wizard/documents/payment-request workflow.
- Full LandTour service views by service/supplier/day, SmartLink confirmation, export, and calendar.
- Common finance/reporting UI from `tour_revenues`, `tour_costs`, `tour_receipts`, `tour_payments`, and `tour_expenses`.
- Deeper Operation UI workflow: edit existing operation forms/payment requests, calendar/kanban assignment views, and operation voucher reconciliation view.
- Full Auth/RBAC rollout: confirm/set real admin password flow, harden operation form/payment request validation, run authenticated mutation smoke tests with valid payloads across remaining modules, and broaden branch/department data scopes where modules still rely on legacy snapshots.
- Broader automated tests beyond smoke coverage.
