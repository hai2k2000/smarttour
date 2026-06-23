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

- Phase 3 reports debt row accuracy/payload hardening:
  - Customer-debt and supplier-debt report rows now use scoped database ledger `groupBy` helpers for grouped balances instead of grouping the capped 1000-entry ledger payload in Node.
  - Report debt rows keep the existing UI/export shape for customer/supplier names, order/voucher counts, and display codes, while `debitTotal`, `creditTotal`, and `balance` come from full matching ledger aggregates.
  - Report query validation contract now guards debt report rows against regressing to `this.customerDebtRows(entries)` / `this.supplierDebtRows(entries)` from capped ledger entries.

- Phase 3 finance report order-summary accuracy hardening:
  - Hybrid finance report order financial metrics (`totalRevenue`, paid/remaining amounts, cost, profit, commission, margin) now use scoped database order aggregates instead of the capped finance `orderRows` display list.
  - Finance report `summary.orderCount` now uses a scoped database count instead of `orderRows.length`, so it is not capped at the 1000-row order preload.
  - Report query validation contract now guards finance summaries against regressing to `...grouped.summary` or `orderCount: orderRows.length`.

- Phase 3 finance report order-filter correctness hardening:
  - Hybrid finance report receipt, payment, and cashflow queries now apply order-only filters (`type`, `status`, `paymentStatus`, `costStatus`, settled/order facets) through their linked order relation.
  - Finance document summaries and cashflow charts no longer depend on `orderIds` from the capped 1000-order display list, preventing filtered finance totals from mixing unrelated orders or missing older matching orders.
  - Report query validation contract now captures the generated finance document `where` clauses and guards against regressing to capped `orderIds` scoping.

- Phase 3 report overview chart accuracy hardening:
  - Report overview `byType` and `byMonth` now use scoped database order groupBy helpers instead of deriving chart rows from the capped 1000-order display list.
  - Overview no longer loads capped order rows for summary/count/chart metrics; grouped chart rows are generated from database `_count` and `_sum` aggregates.
  - Report query validation contract now guards overview charts against regressing to `groupOrders(orders, ...)` bounded-row calculations.

- Phase 3 finance report cashflow chart accuracy hardening:
  - Hybrid finance report `cashflowByMonth` now uses scoped database cashflow `groupBy` by payment date and entry type instead of deriving the chart from capped cashflow display rows.
  - The finance report keeps bounded cashflow row payloads, while monthly cashflow chart values are based on aggregated matching cashflow data.
  - Report query validation contract now guards `cashflowByMonth` against regressing to capped-row `cashflowByMonth(cashflowRows)`.

- Phase 3 revenue/profit report summary accuracy hardening:
  - Revenue and profit report endpoint summaries now use scoped database order aggregates instead of keeping the `groupOrders()` summary derived from capped display orders.
  - Grouped rows remain bounded display data, while summary totals reflect the full scoped matching dataset with the same normalized date field used by the group.
  - Report query validation contract now guards revenue/profit summaries against regressing to capped-row `groupOrders()` summaries.

- Phase 3 report overview count accuracy hardening follow-up:
  - Report overview `totalCustomers` now uses scoped database order grouping for phone/email/name/anonymous order identities instead of deriving from the capped 1000-row order list.
  - Report overview `supplierDebtCount` now uses scoped supplier ledger groupBy sums instead of `supplierDebt.rows.length`, so the count is not capped by display rows.
  - Report query validation contract now guards these overview metrics against regressing to bounded-row calculations.

- Phase 3 finance report summary accuracy hardening:
  - Hybrid finance report receipt/payment counts and cashflow totals now use scoped database count/groupBy helpers instead of deriving totals from capped receipt/payment/cashflow display rows.
  - Finance report rows remain bounded for payload safety, while summary totals are calculated from the full scoped matching dataset.
  - Report query validation contract now guards finance report summaries against regressing to capped-row `cashflowSummary(cashflowRows)` or `receiptRows.length`/`paymentRows.length`.

- Phase 3 finance debt row payload hardening:
  - Finance customer-debt and supplier-debt grouped `rows` now use scoped database ledger groupBy helpers instead of loading all matching ledger entries into `summaryEntries`.
  - The detailed `entries` list remains bounded by `take`, while grouped rows are sorted by balance and capped to the requested list size.
  - Finance helper contract now guards debt endpoints against regressing to full-ledger row loads for grouped debt rows.

- Phase 3 reports debt summary accuracy/payload hardening:
  - Reports customer-debt and supplier-debt summaries now use scoped database ledger groupBy helpers instead of deriving totals from the capped 1000-entry report rows.
  - Report query validation contract now guards debt report summaries against regressing to capped-row summary helpers.

- Phase 3 customer debt summary accuracy/payload hardening:
  - Customer profile debt totals now use scoped database order aggregates instead of reducing the bounded 100-row related order list.
  - Customer service contract now guards debts against bounded-row reductions while preserving the existing recent-order rows payload.

- Phase 3 finance debt summary payload hardening:
  - Customer and supplier debt summaries now use scoped database aggregate/count helpers instead of reducing full ledger row sets in the API process.
  - Finance helper contract now guards debt summaries against regressing to `ledgerSummary(summaryEntries)` or `supplierLedgerSummary(summaryEntries)`.

- Phase 3 report overview count accuracy hardening:
  - Report overview total order, unpaid revenue order, unpaid cost order, and settled order counts now use scoped database count queries instead of counting the bounded 1000-row display list.
  - Report query validation contract now guards overview counts against regressing to `orders.length` or bounded-row filters.

- Phase 3 order report summary accuracy/payload hardening:
  - Business summary and employee performance report summaries now use scoped database order aggregates instead of summing the bounded 1000-row display list.
  - Report query validation contract now guards these summary paths against regressing to `summary(orders)` from capped order rows.

- Phase 3 commission report summary/grouping payload hardening:
  - Commission report list, summary, and grouping now calculate summary totals and grouping buckets with scoped database aggregate/groupBy queries instead of loading every matching commission entry into Node.
  - Commission report security contract now guards against `summaryRows`, full-row summary/grouping regressions, and helper regressions away from database aggregate/groupBy behavior.

- Phase 3 finance cashflow summary payload hardening:
  - Finance cashflow summaries now use scoped database `groupBy` amount sums by entry type and payment method instead of loading every matching cashflow row into Node.
  - Finance helper contract now guards against `summaryRows`/full-row cashflow summary regressions while preserving bounded cashflow list rows.

- Phase 3 finance list summary payload hardening:
  - Finance receipt, payment, and invoice list summaries now use scoped database `count`/`aggregate` helpers instead of loading every matching finance row into Node.
  - Finance helper contract now guards against `summaryRows`/full-row summary regressions while preserving the existing bounded list rows.

- Phase 3 quotation dashboard payload hardening:
  - Legacy quotation dashboard now calculates counts and total selling value with database `count`/`aggregate` queries instead of loading every matching quotation into Node.
  - Quote backend contract now guards against dashboard regressions back to `findMany`/in-memory `reduce` payloads.

- Phase 3 Order Center dashboard payload hardening:
  - Order Center dashboard now calculates counts and revenue/cost/profit sums with database `count`/`aggregate` queries instead of loading every matching order into Node.
  - Order Center contract now guards against dashboard regressions back to `findMany`/in-memory `reduce` payloads.

- Phase 3 Operations supplier catalog payload hardening:
  - Operations static preload now requests the generic supplier catalog with `/api/suppliers?take=100` instead of relying on the implicit backend default.
  - Operations controller/client contract now guards that Operations keeps using the generic supplier source with an explicit bounded `take`.

- Phase 3 FIT supplier catalog preload hardening:
  - `/fit-tours` SSR supplier catalog preload now requests `/suppliers?take=100` for manage users, matching the supplier backend list cap explicitly.
  - FIT tours client contract now guards the bounded supplier catalog preload alongside the existing bounded FIT tour list preload.

- Phase 3 operation-voucher SSR payload hardening:
  - `/operation-vouchers` SSR preload now requests `/operation-vouchers?take=100`, matching the already bounded client reload and backend list DTO.
  - Operation voucher client contract now guards the bounded SSR voucher list preload.

- Phase 3 order-center list payload hardening:
  - `/order-center` SSR preload now requests `/order-center?compact=true&take=100`, so the first render does not load full order-center rows.
  - Order Center client reload now keeps dashboard filters separate from list filters and always requests compact bounded list rows with `compact=true&take=100`.
  - Order Center permission contract now guards the bounded/compact SSR and client list calls.

- Phase 3 orders list payload hardening:
  - `/api/orders/:type` now uses a validated `ListOrdersQueryDto` with bounded `take`; `OrdersService.list()` applies a defensive default/cap while keeping old string-search service callers compatible.
  - `/orders/[type]` SSR preload and client reload now request `?take=100` instead of loading all orders of a type.
  - Orders UI/backend contract coverage now guards DTO/controller/service bounded list behavior and the bounded SSR/client list calls.

- Phase 3 tour-guide list payload hardening:
  - `/api/tour-guides` now uses a validated `ListTourGuidesQueryDto` with bounded `take`, and list responses apply a defensive default/cap.
  - Tour-guide search keeps the existing Vietnamese accent-insensitive behavior by using a bounded search scan before in-memory matching and slicing to the requested list size.
  - `/tour-guides` SSR preload and client reload now request `?take=100`; the tour-guide contract guards backend/query/page/client bounded-list behavior.

- Phase 3 quotation list payload hardening:
  - Legacy quotation list API now uses a validated `ListQuotationsQueryDto` with bounded `take`, and the service applies a defensive default/cap before querying Prisma.
  - `/quotations` SSR preload and client reload now request `?take=100` instead of loading the full quotation table.
  - Quote/quotation backend and client contracts now guard against unbounded quotation list regressions.

- Phase 3 active-domain cleanup follow-up:
  - Remaining executable smoke defaults and current runbooks were aligned to the active SmartTour production host `https://aitour.io.vn` instead of stale `https://quanly.dunientravel.com`.
  - Updated business, finance report, UI page, quotes/quotations, and deploy-preview defaults plus go-live/rollback/ops runbooks.
  - UI page smoke no longer treats Next internal redirect/notFound payload markers as runtime error signatures; browser smoke remains the runtime route safety net.
  - Verification passed for bash syntax, stale-domain grep, business smoke, finance report smoke, UI page smoke, and quotes/quotations smoke with temporary admin cleanup.

- Phase 3 browser smoke hardening follow-up:
  - Browser smoke defaults now target the active SmartTour production domain `https://aitour.io.vn` instead of stale `quanly.dunientravel.com`, which resolves to a different host and old bundle.
  - Browser page smoke now waits for rendered body text before asserting route content, avoiding false failures during Next hydration/data load.
  - Interaction smoke was aligned with current Finance, Operations, Security, and global-search UI selectors, using stable test ids/classes where available.
  - Operations UI smoke now targets the active domain, accepts the current confirmation dialogs for payment-request actions, resets/selects reconciliation rows deterministically, and mocks `/api/auth/me` for the view-only client-permission scenario.
  - Verified with full browser route smoke, UI interaction smoke, and operations UI smoke using temporary admin users cleaned up afterward.

- Phase 3 admin-live file/upload smoke alignment:
  - File smoke now uses a generated `.txt` fixture that matches the shared upload whitelist instead of relying on `AGENTS.md`.
  - FIT tour attachment smoke now targets the current `/fit-tours/:id/attachments` endpoints and extracts uploaded files from the returned tour detail payload.
  - Finance file smoke now creates a valid customer/order/tour for receipt and invoice attachments, while company expense payment/import paths use `OTHER` so they remain intentionally tour-independent.
  - Fresh admin-live verification passed for exports, files, operations backend, quotes/quotations, and UI page reachability; temporary admin users/roles were cleaned up afterward.


- Phase 3 admin-live smoke contract alignment:
  - Admin-live finance cancellation and finance report smokes now create valid linked tours before posting receipts, payments, and invoices, matching the hardened finance tour-link rules.
  - Business workflow smoke now creates the itinerary day required by booking validation before booking creation.
  - Operation voucher workflow smoke now follows the current payment lifecycle: create a linked order/tour, create a finance payment voucher from the operation voucher, approve the finance payment, and assert approval reconciles the operation voucher to PAID instead of recording a duplicate manual payment.
  - Temporary admin smoke users now need RBAC relation-style permissions in the live DB; the latest verification seeded and cleaned a temporary role/user successfully with no leftovers.


- Phase 3 customer file-validation test alignment:
  - Customer service regression now matches the shared file upload validator: dangerous extensions, invalid MIME types, declared-size mismatches, and oversized files are asserted as separate cases.
  - Deep service/API coverage was rerun for auth management, customers, bookings, orders, operation vouchers, commission reports, tour programs/type APIs, report query validation, security, and SmartLink audit.

- Phase 3 core workflow smoke alignment:
  - Core business workflow smoke now follows the hardened order lifecycle boundary: financial edits stay on `PUT /orders/:type/:id`, while status changes use `PATCH /orders/:type/:id/status`.
  - This keeps the smoke aligned with the backend guard that blocks status mutations through ordinary order updates.
  - Non-admin smoke coverage was rerun for core workflows, reports, UX/export, suppliers, and TourKit import flows; admin-live smokes still require `ADMIN_PASSWORD` and were not run in this environment.

- Phase 3 hotel allotment dashboard contract cleanup:
  - Hotel allotment dashboard status bucketing now uses an explicit sellable predicate (`ACTIVE` with positive remaining quantity) before COD-lock classification, keeping active/COD/stop-sell buckets mutually exclusive and easier to audit.
  - Hotel supplier/allotment contracts and Playwright UI tests were aligned with the shared required-field indicator convention and current date-only validation helper.
  - Verification covered hotel allotment contract, full hotel supplier suite, backend/data-scope/finance/UI contract groups, API TypeScript, Prisma validation, API Docker deploy, and healthcheck.

- Phase 3 hotel supplier required-field indicator cleanup:
  - Hotel supplier form labels no longer embed manual `*` characters; required inputs now rely on the shared/global required-field indicator while keeping native `required` attributes and schema validation messages.
  - Hotel supplier contracts were aligned with the global required-field UI contract so future form cleanup does not regress back to manual stars.
  - During verification, a stale Prisma client was regenerated because the schema already contained `Booking.deletedAt` but the generated types had not caught up.

- Phase 3 backend critical audit/logging hardening:
  - Backend critical flow verification now passes after aligning audit contracts with current FinanceModule shorthand providers and tour-program detail payload behavior.
  - File upload core contract now explicitly rejects extensionless dotfiles such as `.env`, matching the production whitelist.
  - Operations audit logging now records `request.user.id` directly on AuditLog rows instead of dropping actorId when a lookup is not performed, preserving traceability for operation forms and supplier payment request actions.

- Phase 3 backend/data-scope verification hardening follow-up:
  - Data-scope static and module audits are clean, but full verification exposed stale smoke/regression scripts that still expected public auth token JSON after the HttpOnly cookie-session hardening.
  - API/data-scope/customer and production smoke scripts now authenticate through the `smarttour.auth.token` cookie and assert login/bootstrap responses do not expose token JSON.
  - RBAC smoke uncovered accounting could view/manage commission reports but lacked the dedicated `commission.approve` permission required by the approve endpoint; a migration now grants accounting `commission.approve` and the role contract guards it.
  - `verify-data-scope.sh` now passes through route/data-scope/API/module/RBAC checks; ADMIN_PASSWORD-dependent admin workflow smokes remain skipped when the env var is not provided.

- Phase 3 Operations client permission-readiness hardening:
  - Operations client now waits for `permissionsReady` before static catalog and list/dashboard loading, preventing pre-permission flashes and premature state resets.
  - Operations reload/list paths fail closed when no operation view permission is available and clear protected dashboard/form/payment state.
  - Protected filters, tabs, modals, and lists are withheld until the user has an operation view permission; the permission notice avoids flashing while permissions load.
  - Current scan reports no remaining server pages with API preloads before `/auth/me` and no remaining `usePermissions` clients without readiness handling.

- Phase 3 typed supplier page/client RBAC hardening:
  - Hotel and typed supplier server pages now read `/auth/me` before protected preloads and avoid loading supplier rows without `supplier.view`.
  - These pages render server permission notices and withhold protected supplier client workspaces when view access is missing.
  - Hotel and generic supplier clients now wait for permission readiness, clear server-provided rows when view access is missing, and fail-close reload/filter controls before API calls.
  - Hotel supplier required fields are visibly marked in the form, and typed supplier list contracts preserve the name-first column convention.

- Phase 3 FIT tours page/server RBAC hardening:
  - FIT Tours page now reads `/auth/me` before protected preloads, avoids loading tour rows without `tour.view`, and avoids loading supplier catalogs without `tour.manage`.
  - FIT Tours page renders a server permission notice and withholds the client workspace when `tour.view` is missing.
  - FIT Tours client now waits for permission readiness, clears server-provided rows when view access is missing, and disables reload/search controls without `tour.view`.

- Phase 3 tour guides page/client RBAC hardening:
  - Tour Guides page now reads `/auth/me` before loading guide rows, avoids server-side guide preloads without `guide.view`, and renders a server permission notice instead of protected client content when access is missing.
  - Tour Guides client now waits for permission readiness, clears server-provided rows when view access is missing, and fail-closes reload/detail handlers before API calls while preserving `guide.manage` mutation gates.

- Phase 3 operation vouchers page/client RBAC hardening:
  - Operation Vouchers page now reads `/auth/me` before loading voucher rows, avoids server-side voucher preloads without `operation.form.view`/`operation.form.manage`, and renders a server permission notice instead of protected client content when access is missing.
  - Operation Vouchers client now waits for permission readiness, clears server-provided rows when view access is missing, hides list/form content without view access, and fail-closes reload/detail/create handlers before API calls.
  - Existing `operation.form.manage` save gates and `operation.payment-request.create` payment gates remain in place.

- Phase 3 order type page/client RBAC hardening:
  - `/orders/[type]` now reads `/auth/me` before loading order rows, avoids server-side order preloads without `order.view`/`order.manage`, and renders a server permission notice instead of protected client content when access is missing.
  - Orders client now waits for permission readiness, clears server-provided rows when view access is missing, hides list/form content without view access, and fail-closes create/update/copy handlers with `order.manage` before API calls.
  - Dedicated lifecycle permissions remain separate: status update, settle, and unlock still use their dedicated action permissions.

- Phase 3 quote/quotation frontend RBAC hardening:
  - Legacy Quotations, Quote Tours, and Quote Combos server pages now read `/auth/me` before protected preloads, avoid loading quote data without view/manage access, and render server permission notices instead of protected client content when access is missing.
  - The quote clients now wait for permission readiness, clear server-provided rows when view access is missing, hide dashboard/list/form content without view access, and fail-close view/manage/approve handlers before API calls.
  - Quote Combos only preloads supplier catalogs for users with `quote.manage`, keeping supplier catalog data out of view-only sessions.

- Phase 3 supplier page permission hardening:
  - Supplier overview server page now reads `/auth/me`, gates category/supplier content with `supplier.view`, and hides category/supplier create/edit/delete actions and modals unless the user has `supplier.manage`.
  - Added `scripts/test-suppliers-server-page-permissions-contract.js` to guard the supplier overview RBAC contract.


- Phase 3 booking page permission hardening:
  - Booking server page now reads `/auth/me`, gates booking list/content with `booking.view`, and hides create/edit/status/delete actions and modals unless the user has `booking.manage`.
  - Added `scripts/test-bookings-server-page-permissions-contract.js` to guard the booking page RBAC contract.


- Phase 3 server-rendered tour pages permission hardening:
  - GIT Tour, LandTour, and Tour Programs pages now read `/auth/me` on the server, gate list/content with `tour.view`, and hide create/update/copy/delete itinerary/form actions unless the user has `tour.manage`.
  - Added shared server-side permission helpers and `scripts/test-tour-server-pages-permissions-contract.js` to guard these server-rendered RBAC contracts.


- Phase 3 FIT tour frontend permission hardening:
  - FIT tour client now mirrors backend RBAC with `tour.view` gating, `tour.manage` create/edit/wizard mutation guards, and `tour.export` export-button guards.
  - FIT tour wizard receives the manage-permission state so save, confirm, autosave, copy budget/operation, upload, and delete attachment actions fail closed before API calls when the user lacks manage permission.
  - Added `scripts/test-fit-tours-client-contract.js` to guard the FIT tour permission rendering and mutation/export gates.


- Phase 3 tour guide frontend permission and numeric validation hardening:
  - Tour Guides UI now mirrors backend RBAC with `guide.view` gating and `guide.manage` fail-closed create/edit/save actions.
  - Tour guide cost service NET/selling prices now reject negative values before API submission.

- Phase 3 orders numeric validation hardening:
  - Orders UI now mirrors backend non-negative numeric constraints for sales/operation rows, passenger counts, seats, paid amounts, and handover quantities; itinerary day numbers start at 1.
  - Orders UI contract now guards schema and input-level numeric bounds so invalid negative values are blocked before API submission.

- Phase 3 operation voucher numeric validation hardening:
  - Operation voucher detail rows now mirror backend numeric bounds in the web form: quantity must be positive, NET price non-negative, VAT 0..100, and payment input cannot be negative.
  - Operation voucher client contract now guards these frontend/backend validation boundaries.

- Phase 3 supplier list readability hardening:
  - Generic typed supplier lists now start with supplier name instead of a separate supplier-code-first column; supplier codes remain only as secondary traceability text under the name.
  - Supplier client contract now guards the generic and hotel supplier name-first list convention.

- Phase 1 remediation continued after business decisions:
  - Booking delete now uses retention-safe soft delete by setting `Booking.deletedAt`; list/detail/mutation/deleteGuard ignore soft-deleted rows, existing usage guards still block deletes for bookings with operation forms, vouchers, or allotment locks, and every soft delete writes an `AuditLog` entry with booking code/status metadata.
  - Browser auth bootstrap/login/change-password still set the HttpOnly `smarttour.auth.token` cookie, but public controller responses no longer expose `token` or `tokenType` in JSON.
  - Updated auth/security/guide regression scripts that represented the public API contract so they no longer require token JSON from login/bootstrap.
  - Verification passed: `scripts/test-bookings-service.sh`, `scripts/test-auth-token-extraction.sh`, `scripts/test-auth-cookie-session.sh`, `scripts/test-auth-session-flows.sh`, `scripts/test-security-module.sh`, `scripts/test-tour-guides-api.sh`, `scripts/test-high-a-data-access.sh`, `scripts/test-operation-vouchers-service.sh`, and `npx prisma validate --schema prisma/schema.prisma`.
- Phase 1 remediation start:
  - Saved the remediation execution order under `docs/superpowers/plans/2026-06-21-smarttour-remediation-order.md`.
  - Added tour-guide data-scope enforcement through linked order/tour schedules for list/detail/update/remove and guide file authorization. Scoped users now only see guides linked to in-scope operational records; unrestricted users keep global access.
  - Added a database uniqueness invariant for `OperationVoucherPayment.paymentVoucherId` with a Prisma migration after production duplicate audit returned no duplicates.
  - Made legacy quotation convert idempotent/concurrency-safe by locking the quotation row and returning the existing converted order on repeat convert calls.
  - Verification passed: `scripts/test-tour-guides-api.sh`, `scripts/test-high-a-data-access.sh`, `scripts/test-operation-vouchers-service.sh`, `npx prisma validate --schema prisma/schema.prisma`, and `git diff --check`.
- Broader table copy/name-first cleanup:
  - Customer list now starts with customer name instead of a separate code column, and customer page copy no longer labels the module as CRM.
  - Workspace cards were localized from English labels (`Schedule`, `Pending`, `Corporate`, `Outstanding`, `Month`, `Data`) to Vietnamese operational wording.
  - Workspace pending receipts and commission report order cells now prioritize names/titles, with generated codes kept as secondary traceability text.
  - Contracts were extended in UX, workspace, and localized-dropdown tests to prevent these code-first/English-label regressions.


- Finance table readability follow-up:
  - Updated finance list tables so receipt/payment/invoice first columns prioritize document names instead of hard-to-remember generated codes; codes remain secondary traceability text only when different from the name.
  - Finance receipt/payment/cashflow table enum cells now use a finance-specific label helper to avoid raw underscore enum codes being exposed in list views.
  - Added finance client contract assertions for name-first columns and localized finance table enum rendering.


- Finance and shared dropdown localization:
  - Expanded `apps/web/app/i18n.ts` so finance receipt/payment voucher types and common order/tour/service status enums render as Vietnamese labels through `viStatus()` instead of raw enum codes in forms, filters, and tables.
  - Extended `scripts/test-localized-dropdowns-contract.js` to guard finance voucher labels (`SUPPLIER_PAYMENT`, `CUSTOMER_REFUND`, `INTERNAL_EXPENSE`, etc.) and shared order/tour labels (`UPCOMING`, `RUNNING`, `FIT_TOUR`, `HOTEL_BOOKING`, etc.).
  - Reviewed remaining uppercase dropdown candidates; outstanding matches are either locally labeled options or non-UI/internal literals.


- Finance report UI snapshot labeling:
  - Updated `apps/web/app/reports/ReportsClient.tsx` so Finance Report order rows label paid values as evidence-based `Theo chung tu` amounts and expose a separate `Snapshot TourKit` column.
  - The UI now renders `financeSource` classification, showing `Snapshot TourKit` for historical import-only rows instead of presenting them like normal finance evidence.
  - Strengthened `scripts/test-reports-finance-hybrid-contract.sh` to require the snapshot/evidence labels and fields.

- Finance report TourKit snapshot handling:
  - Updated `ReportsService.finance()` so Finance Report paid/remaining metrics are based on approved finance evidence or cashflow rows, not raw `Order.paidAmount`/`paidCost` snapshots. The order snapshot values remain exposed as `snapshotPaidAmount` and `snapshotPaidCost` for traceability.
  - TourKit import-marker orders that have paid snapshots but no finance evidence are now classified as `financeSource: tourkit_import_snapshot` and do not create actionable reconciliation issues in Finance Report. Revenue/profit operational reports still use order snapshots as before.
  - Extended `scripts/smoke-reports-business-rules.sh` with an isolated TourKit snapshot order regression; the smoke now verifies Finance Report keeps paid totals at 0 for that snapshot while preserving the imported snapshot fields.

- Finance order paid snapshot audit:
  - Added `scripts/finance-order-snapshot-audit.js` and
    `scripts/test-finance-order-snapshot-audit.sh` to compare
    `Order.paidAmount`/`paidCost` against active approved finance receipts and
    payments, while classifying TourKit import-marker rows with no active docs
    as historical import snapshots instead of actionable drift.
  - Production audit reports 0 actionable receipt/payment mismatches. The only
    remaining rows are 9 TourKit import snapshots: 5 receipt-side paid snapshots
    and 4 payment-side paid snapshots with no active finance documents. These
    values match TourKit `Thuc thu/Thuc chi` import notes and were intentionally
    not reset or converted into synthetic finance documents.
  - `finance-order-snapshot-audit --mode=guard` is now suitable as a regression
    guard for new actionable snapshot/doc mismatches while tolerating documented
    historical import snapshots.

- Finance zero-amount approved import artifact cleanup:
  - Added `scripts/finance-zero-amount-audit.js` and
    `scripts/test-finance-zero-amount-audit.sh` to detect approved original
    finance receipts/payments with nonpositive amounts. The cleanup only
    soft-deletes actionable zero-amount documents that have no cashflow,
    ledger, reversal, operation-voucher payment, supplier-payment request, or
    invoice linkage; zero-amount documents with side effects are reported as
    blocked instead of modified.
  - Production audit found exactly one actionable document: approved supplier
    payment `_18332__NO.1` (`59cf81c4-a719-4004-b831-a292d10df38f`) with
    amount 0, no side effects/downstream links, and a real same order/supplier
    payment `_18359__NO.2` for 4,538,000 VND already covering the booking's
    paid cost. Backfill soft-deleted the zero-amount artifact and left order
    paid snapshots unchanged.
  - Post-cleanup `finance-zero-amount-audit` reports 0 issues and
    `finance-side-effect-audit --mode=guard` now reports 0 missing cashflow or
    ledger side effects.
  - Remaining finance/order reconciliation gap is only historical
    `order_gt_docs` paid snapshot data without active approved finance
    documents; no duplicate import, legacy cashflow, receipt-link, zero-amount,
    or missing-side-effect issues remain actionable from the current audits.

- Finance receipt-link repair for order reconciliation drift:
  - Added `scripts/finance-receipt-link-audit.js` and
    `scripts/test-finance-receipt-link-audit.sh` to detect approved receipts
    whose receipt code starts with booking A but whose `FinanceReceiptOrder`,
    receipt `tourId`, customer ledger, and cashflow still point to booking B.
    The matcher uses the longest canonical order-code prefix so booking codes
    containing underscores such as `BK_61` are handled safely.
  - Production dry-run found exactly 2 actionable receipts, both
    `S2-0626-NBI.012-51_3080_NO.1/NO.2`, linked to `LANDTOUR_92` while the
    receipt code and matching customer point to booking `S2-0626-NBI.012-51`.
    Backfill updated 2 receipts, 2 receipt-order rows, 2 cashflow rows, and 2
    customer-ledger rows without rewriting order paid snapshots.
  - Post-repair audits: receipt-link issues 0, duplicate imports 0, duplicate
    legacy cashflow 0, and finance side-effect audit still only has the known
    zero-amount payment `_18332__NO.1` anomaly.
  - Order reconciliation drift is now only historical snapshot drift where
    `Order.paidAmount`/`paidCost` is greater than active approved finance docs:
    5 receipt-side orders and 4 payment-side orders. No `docs_gt_order` drift
    remains after this repair. These historical paid snapshots need a business
    decision before creating missing historical documents or resetting order
    paid values.

- Finance duplicate import and legacy cashflow repair:
  - Added `scripts/finance-duplicate-import-audit.js` and
    `scripts/test-finance-duplicate-import-audit.sh` to detect duplicate
    imported finance documents by canonical document code. The cleanup keeps
    the earliest active document, soft-deletes later duplicate receipts or
    payments, and removes cashflow/customer-ledger/supplier-ledger side effects
    attached only to the duplicate documents. It groups payments by canonical
    voucher code, order, and amount so duplicate rows with a wrong supplier from
    the second import are still caught.
  - Production duplicate cleanup soft-deleted 3 duplicate receipts and 24
    duplicate payments, removing 54 duplicate cashflow rows, 3 duplicate
    customer-ledger rows, and 24 duplicate supplier-ledger rows. Duplicate
    import audit now reports 0 actionable duplicates.
  - Added `scripts/finance-legacy-cashflow-audit.js` and
    `scripts/test-finance-legacy-cashflow-audit.sh` to remove legacy importer
    cashflow rows (`FINANCE_RECEIPT` / `FINANCE_PAYMENT`) only when the same
    approved document already has the live-service cashflow row (`RECEIPT` /
    `PAYMENT`). Production cleanup removed 195 duplicate legacy receipt
    cashflow rows and 388 duplicate legacy payment cashflow rows; legacy
    duplicate audit now reports 0.
  - Order reconciliation drift after duplicate cleanup is reduced to historical
    import gaps: 7 receipt-side drifts and 4 payment-side drifts. Payment-side
    drifts are all `order_gt_docs` historical paid-cost values without active
    approved payment docs. The remaining `docs_gt_order` receipt drift is the
    known `LANDTOUR_92` / `S2-0626-NBI.012-51` mislink pattern and needs a
    separate targeted receipt-link repair.
  - Finance side-effect audit remains unchanged after cleanup except for the
    known zero-amount approved payment `_18332__NO.1`
    (`59cf81c4-a719-4004-b831-a292d10df38f`), which still has one missing
    payment cashflow and one missing supplier ledger by design because live
    posting rules reject zero/negative amounts.

- Finance side-effect audit/backfill tooling and production repair:
  - Added `scripts/finance-side-effect-audit.js` with `audit`, `guard`, and
    dry-run-by-default `backfill` modes to detect and repair approved finance
    receipts/payments that are missing cashflow or customer/supplier ledger
    side effects after import/backfill paths bypassed the live service posting
    helpers.
  - Added `scripts/test-finance-side-effect-audit.sh` covering missing receipt
    cashflow, payment cashflow, customer ledger, supplier ledger, company-level
    no-tour `OTHER` payment cashflow, dry-run behavior, idempotency, and guard
    behavior.
  - Production dry-run found 198 approved receipts missing receipt cashflow,
    413 approved payments missing payment cashflow, no missing customer ledger,
    and one missing supplier ledger. Backfill applied only positive-amount
    actionable rows: 198 receipt cashflow entries and 412 payment cashflow
    entries.
  - Production audit after backfill leaves one approved supplier payment
    `_18332__NO.1` (`id=59cf81c4-a719-4004-b831-a292d10df38f`) with amount 0;
    it still lacks payment cashflow and supplier ledger by design because the
    live finance posting helpers reject zero/negative amounts. This needs a
    business data decision rather than automatic side-effect creation.
  - `scripts/test-tour-type-apis.sh` was refreshed to assert the current
    validated reports `paymentStatus` mapping and frontend filter controls
    instead of a stale static literal.

- Finance company expense payment tour-link fix:
  - FinancePayment create/update/import/approve/cancel now allows company-level
    `INTERNAL_EXPENSE` and `OTHER` payment vouchers without a Tour, Order, or
    OperationVoucher link, so non-tour company expenses can be recorded.
  - Supplier/tour-linked payment types still require a valid Tour through the
    existing finance tour guard, and linked Order/OperationVoucher flows keep
    their reconciliation behavior.
  - Regression now covers creating, approving, cashflow-posting, cancelling,
    and cashflow-netting no-tour company expense payments while preserving the
    supplier-payment no-tour rejection.
  - VPS verification passed: `TEST_FINANCE_SERVICE_FLOWS_OK`.

- Pre-deploy review fixes for remaining High/Medium/Low items:
  - Operation voucher payment recording now locks the selected approved
    FinancePayment, rejects any existing OperationVoucherPayment usage for the
    same finance payment, and links an unlinked approved finance payment to the
    voucher before recording payment history.
  - Tour quote approve/reject now derives `approvedBy` from `request.user`; the
    client `approvedBy` field was removed from the approval DTO.
  - Reports endpoints now bind query params through `ReportQueryDto`, validating
    date strings and report enum-like filters before Prisma queries.
  - Credentialed CORS fallback is development-only, AppShell logout waits for
    backend logout before redirect, file authorization normalizes metadata URLs
    by object key, SmartLink repeated enable preserves secure tokens, and npm
    audit was cleaned through the lockfile.
  - VPS verification passed on 2026-06-13: `TEST_OPERATION_VOUCHERS_SERVICE_OK`,
    `TEST_HIGH_A_DATA_ACCESS_OK`, `TEST_AUTH_COOKIE_SESSION_OK`,
    `git diff --check`, `docker compose config --quiet`, `npm audit`, and
    `npm run verify:toolchain`.

- High C auth/session Phase 2 cleanup:
  - Next proxy now validates browser sessions by forwarding
    `smarttour.auth.token` as a Cookie header to `/api/auth/me`, not by
    converting it back to Authorization Bearer.
  - Browser smoke scripts no longer inject or assert
    `localStorage.smarttour.auth.token` or JS-created auth cookies. They use
    Playwright HttpOnly cookie setup for seeded sessions, and the login browser
    smoke checks the backend-set HttpOnly cookie plus refresh persistence.
  - Frontend auth cleanup now leaves cookie clearing to backend/proxy
    Set-Cookie responses; browser code no longer uses `document.cookie` for the
    auth token.
  - Auth/session regression now distinguishes browser cookie flow from CLI/API
    Bearer compatibility. Bearer extraction and token JSON remain because many
    smoke/API scripts still login via JSON token and call APIs with Bearer.
  - No schema migration, business module change, production deploy, or broad UI
    refactor was performed.
  - VPS verification passed on 2026-06-13:
    `TEST_AUTH_COOKIE_SESSION_OK`; `TEST_OPERATIONS_CONTROLLER_CONTRACT`
    reached only the existing supplierServices failure after the auth contract
    update.

- High C auth/session Phase 1 hardening:
  - Backend login, bootstrap, and change-password now set
    `smarttour.auth.token` as an HttpOnly, SameSite=Lax, path=/ session cookie
    with expiry aligned to the issued session. Logout is public so expired or
    invalid browser sessions can still receive a clear-cookie response; valid
    cookie/header sessions are revoked with the actor derived from the token.
  - Token extraction remains Bearer-compatible for CLI/scripts but now prefers
    the cookie so stale browser Bearer values cannot override the current
    HttpOnly session.
  - Frontend login/authFetch/logout/security/finance flows no longer read,
    store, or send `smarttour.auth.token` through localStorage, JS-created
    cookies, or Authorization Bearer headers. Legacy token cleanup remains
    best-effort only.
  - CORS now enables credentials and uses configured origin allowlists when
    present instead of wildcard origin behavior.
  - No schema migration, business module change, frontend deploy, or API deploy
    was performed.
  - VPS verification passed on 2026-06-13:
    `TEST_AUTH_COOKIE_SESSION_OK`, `TEST_AUTH_TOKEN_EXTRACTION_OK`,
    `TEST_AUTH_GUARD_BEHAVIOR_OK`, `TEST_AUTH_CONTROLLER_PERMISSIONS_OK`,
    `TEST_AUTH_SESSION_FLOWS_OK`, and `docker compose build web`.

- Hardened Commission Reports scoped mutations and payment integrity:
  - Approve, reject, revoke, and pay now receive the authenticated request user,
    derive audit actors server-side, lock each commission row, and re-read it
    through branch/department scope before updates.
  - List, summary, grouping, export, and explicit sync now keep the underlying
    order-to-commission sync inside the current user's branch/department scope.
  - Commission state transitions now reject invalid current states; paid
    commissions cannot be revoked.
  - Commission payments now reject invalid, zero/negative, and over-remaining
    amounts. Row locks plus in-transaction remaining checks prevent concurrent
    double payment.
  - VPS verification passed on 2026-06-13:
    `TEST_COMMISSION_REPORTS_SECURITY_OK`, `DATA_SCOPE_AUDIT_OK`,
    `TEST_LIST_VIEW_PERFORMANCE_OK`, `git diff --check`,
    `docker compose config --quiet`, and `docker compose build api`.

- Hardened Finance approval/status write boundary:
  - Receipt, payment, and invoice create/import flows now force safe `DRAFT`
    states and derive `createdBy` from the authenticated request user.
  - Ordinary create/update payloads strip approval, lifecycle, audit,
    deletion/lock, reversal, and client actor fields before mapping or audit
    logging; only approve/reject/cancel flows can change final-state fields.
  - Finance approval, rejection, cancellation, and manual-adjustment actors now
    come from the authenticated request user instead of request-body `actor`.
  - VPS verification passed on 2026-06-13:
    `TEST_FINANCE_SERVICE_FLOWS_OK`,
    `TEST_FINANCE_CONTROLLER_PERMISSIONS_OK`,
    `TEST_FINANCE_HELPER_CONTRACTS_OK`, `TEST_FINANCE_RULES_OK`,
    `git diff --check`, and `docker compose build api`.


- Hardened OperationsClient copy/source/UX contract:
  - Operations now loads the generic supplier endpoint instead of hotel-only
    suppliers; generic supplier list includes supplierServices so operation
    service/payment forms can select services from all supplier types.
  - OperationsClient visible copy now uses fully accented Vietnamese and avoids
    the NCC abbreviation in headings, metrics, table headers, modal labels,
    reconciliation details, and payment request actions.
  - Form/payment creation now validates booking, supplier, supplier service,
    selected operation form, selected cost, and amounts before submit; cancel
    form asks for an explicit reason; payment/finance actors are role-specific.
  - Money helpers now parse backend string amounts safely, failed POST notices
    include HTTP status, auth headers include Accept, and mutation success only
    reloads dashboard/lists instead of reloading static data every time.
  - VPS verification passed on 2026-06-11: `TEST_OPERATIONS_CONTROLLER_CONTRACT_OK`,
    `docker compose build api web`, api/web deploy, `SMOKE_OPERATIONS_BACKEND_OK`,
    and web /operations auth redirect 307.


- Hardened Operations form/payment request service behavior:
  - Operation form list search now covers booking code/customer name/phone,
    order/tour systemCode, tourCode, name, route, and notes while keeping typed
    status/id filters and the DTO take cap.
  - Form create/update/cancel flows now record clearer audit actor/reason
    context, block cancelling completed forms with Vietnamese messaging, parse
    replacement children before delete/create, and validate service confirmation
    status plus task dates before storage.
  - Supplier payment requests now use clearer actor/requestedBy audit data,
    block approving already-paid requests, validate finance payment method, and
    return the existing linked finance-payment detail on repeated
    create-finance-payment calls instead of creating duplicates.
  - VPS verification passed on 2026-06-11: `TEST_OPERATIONS_CONTROLLER_CONTRACT_OK`,
    `docker compose build api`, API deploy, and `SMOKE_OPERATIONS_BACKEND_OK`.


- Hardened Finance frontend UX and data rollback checks:
  - FinanceClient now uses fully accented Vietnamese tab/sidebar/status labels,
    branch-specific load error notices, distinct save/approve/reject/cancel
    feedback, guarded row actions, safer dirty-modal close behavior, clearer
    CSV/import/upload messages, and debt overdue summaries.
  - Finance CSV import endpoints now accept real multipart uploads with CSV-only
    filtering and 5 MB limits; browser smoke confirmed multipart reaches the
    import parser instead of falling through as a missing file.
  - Finance service regression now explicitly verifies receipt and invoice
    cancellation rollback when original ledger rows are missing, ensuring failed
    cancel attempts leave no reversal document, cashflow, ledger entry, or status
    mutation.
  - VPS verification passed on 2026-06-11: `TEST_FINANCE_SERVICE_FLOWS_OK`,
    `TEST_FINANCE_CONTROLLER_PERMISSIONS_OK`,
    `TEST_FINANCE_CLIENT_CONTRACT_OK`,
    `TEST_FINANCE_HELPER_CONTRACTS_OK`, `docker compose build api web`,
    api/web deploy, API auth smoke 401, web auth redirect 307, and Chrome
    desktop/mobile screenshots for `/finance`.


- Consolidated Finance auxiliary helpers into the live transaction flows:
  - FinanceService now delegates cashflow postings, customer/supplier ledger
    postings, order reconciliation, payment-voucher reconciliation, and CSV
    parsing/validation to the focused finance helper modules; duplicated private
    implementations were removed.
  - Finance order/customer/tour/receipt links now revalidate branch/department
    scope on create/update/import and again immediately before approve/cancel,
    preventing legacy or changed links from updating unrelated auxiliary rows.
  - Receipt/payment/invoice terminal transitions acquire PostgreSQL row locks
    before state checks, preventing concurrent approve/reject/cancel requests
    from creating duplicate reversals or postings.
  - Missing original ledger or payment reconciliation rows now abort and roll
    back cancellation instead of leaving partial cashflow/order/voucher side
    effects. Posting helpers reject zero/negative amounts at approval time.
  - Finance CSV imports now use the shared import helper, enforce a 5 MB limit,
    and check duplicate document codes inside the transaction.
  - VPS verification passed on 2026-06-11: `git diff --check`, API Docker build,
    `TEST_FINANCE_HELPER_CONTRACTS_OK`,
    `TEST_FINANCE_CONTROLLER_PERMISSIONS_OK`, `TEST_FINANCE_RULES_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API deploy, and unauthenticated finance
    endpoint smoke 401.


- Hardened Finance backend domain/final-state contract:
  - FinanceController now routes receipt, payment, invoice, ledger/debt, and
    cashflow endpoints through focused domain services instead of injecting the
    monolithic FinanceService directly.
  - Receipt/payment/invoice approve, reject, cancel, delete, and amount-edit
    paths now share Vietnamese final-state guards so approved/rejected/cancelled
    records cannot be transitioned or money-edited again.
  - Cancel flows still create reversal documents/ledger/cashflow adjustments,
    but a second cancel is now rejected instead of treated as idempotent.
  - Draft partial updates merge current receipt/payment/invoice data first and
    only replace receipt orders or invoice items when those arrays are included,
    preventing accidental reset of dates, totals, children, or amounts.
  - VPS verification passed on 2026-06-11: `git diff --check`,
    `docker compose build api`, `TEST_FINANCE_CONTROLLER_PERMISSIONS_OK`,
    `TEST_FINANCE_RULES_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`, and API deploy
    with `/api/finance/receipts` unauthenticated smoke 401. HTTP finance smoke
    scripts requiring `ADMIN_PASSWORD` were not run because the VPS env does
    not expose that variable.



- Locked Tour Guides data/business checks:
  - Frontend guideCode generation now uses an 8-character random suffix on top
    of the base36 timestamp; regression simulates 5,000 rapid generated codes
    and asserts no collisions plus the expected `HDV-<timestamp>-<random>`
    format.
  - Tour guide date behavior is regression-checked for card/document issue and
    expiry date-only fields, and schedule datetime-local values are parsed as
    Asia/Bangkok before storage.
  - Guide cost service rows remain an explicit price-book contract: netPrice,
    sellingPrice, currency, unit, and notes are stored/displayed without
    derived `amount` calculation.
  - Child row replacement is now covered with multiple cards, documents,
    price rows, and schedules followed by an update/delete pass that verifies
    the remaining row data, order, prices, and timezone conversion survive.
  - VPS verification passed on 2026-06-11: `git diff --check`,
    `docker compose build api web`, `TEST_TOUR_GUIDES_API_OK`,
    `TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK`, api/web deploy, web `/tour-guides`
    auth redirect 307, and API `/api/tour-guides` auth smoke 401.



- Hardened Tour Guides backend contract:
  - Controller permission behavior was rechecked: class-level `guide.view` covers
    list/detail and method-level `guide.manage` overrides it for create/update,
    delete, and file endpoints through the auth guard's `getAllAndOverride`.
  - Tour guide DTO validation now has Vietnamese messages for guideCode,
    fullName, phone, email, cards, documents, costServices, and schedules;
    empty nested rows and blank language/market/skill entries are compacted at
    the API boundary before service mapping.
  - TourGuidesService list search now matches guide root fields plus languages,
    markets, and skills with accent-insensitive Vietnamese matching while still
    validating status query values.
  - Regression now locks permission denied cases, duplicate guideCode/email/
    phone, detail edit response shape, child update preservation/clearing,
    empty row compaction, Vietnamese validation messages, and order-linked
    schedule status sync for CANCELLED and COMPLETED.
  - VPS verification passed on 2026-06-11: `git diff --check`, API Docker
    build, `TEST_TOUR_GUIDES_API_OK`, `TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK`,
    API deploy, and `/api/tour-guides` unauthenticated smoke 401.



- Hardened Tour Guides client and API copy:
  - Tour Guides visible labels now avoid unclear HDV abbreviations and use
    Vietnamese copy for guide code, contact info, language/market, profile
    sections, price book rows, schedules, loading, save, and API error states.
  - Client reload/detail/save requests now send auth headers, reload builds a
    sanitized `/api/tour-guides` search/status query, and the list has a status
    filter plus profile-row counts for cards/documents/prices/schedules.
  - Guide form mapping/submission remains row-filtered for cards, documents,
    costServices, schedules, languages, markets, and skills; row tables now use
    explicit select options for statuses/currency and keep numeric/date inputs.
  - TourGuidesService user-facing errors now use Vietnamese wording without
    HDV abbreviations for not-found, duplicate, date, status, and schedule
    validation messages.
  - VPS verification passed on 2026-06-11: `git diff --check`,
    `docker compose build api web`, `TEST_TOUR_GUIDES_API_OK`,
    `TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK`, api/web deploy, web `/tour-guides`
    auth redirect 307, and API `/api/tour-guides` auth smoke 401.



- Locked LandTour data/business alignment:
  - LandTour frontend list/status modal now displays and updates the common
    `workflowStep`, with localized labels matching the backend validator.
  - Regression now checks `productType = LANDTOUR`, LandTour workflow labels
    across UI/i18n/backend, copy-services sales+operation preservation,
    comboType/smartLinkCode/confirmationNote detail mapping, VI/EN terms via
    common `TourTerm`, search by systemCode/tourCode/name/route/customer and
    detail fields, and partial updates preserving customers/services/terms.
  - Dedicated LandTour PDF/print export is not present yet; current coverage
    locks the response/common-term contract that any future print/export flow
    should consume.
  - VPS verification passed on 2026-06-10: web Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, web deploy,
    LandTour web auth redirect 307, and LandTour API auth smoke 401.


- Hardened LandToursService business contract:
  - LandTour create/update now normalizes required identity fields, lifecycle
    status, paymentStatus, and workflowStep before common Tour root writes.
  - LandTour service/cost child payloads now validate supplier and supplier
    service links before replacement; service status strings map into
    `TourServiceStatus` for sales and operation rows.
  - LandTour remove now blocks tours with linked orders, bookings, operation
    rows, or finance documents; copy-services already requires an explicit
    non-target source and delegates cloning to TourCoreService.
  - LandTour customers no longer create fake fallback rows, and partial terms
    updates preserve the untouched VI/EN language row.
  - VPS verification passed on 2026-06-10: api Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API deploy,
    and LandTour API auth smoke 401.


- Hardened LandToursController route/query/copy contract:
  - LandTour list now uses `ListLandToursQueryDto` for trimmed search and
    normalized `TourStatus` validation with Vietnamese messages.
  - LandTour `copy-services` keeps `tour.manage` but now requires an explicit
    source tour different from the target, matching the safer GIT contract.
  - Regression now checks LandTour route permissions, response shapes used by
    the frontend list/detail flows, status query parsing, copy-services errors,
    and remove response behavior.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API deploy, and LandTour API auth smoke 401.


- Added focused GIT regression assertions for the requested test checklist:
  - list search/status, detail not-found, create/update/remove, copy-services,
    child mapping, DTO validation, Vietnamese error messages, and partial
    update preservation now have explicit runtime checks in
    `scripts/test-tour-type-apis.sh`.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK`.

- Continued GIT data/business contract verification:
  - GIT frontend workflow step options are now regression-checked against the
    backend validator and i18n labels; the page also exposes paymentStatus and
    invoiceStatus controls alongside lifecycle status.
  - GIT list now displays invoice status, while reports remain guarded for
    paymentStatus finance filtering.
  - Runtime regression now verifies branch/department/customerSource trimming,
    invoiceStatus create/update behavior, paymentStatus normalization, partial
    updates preserving children, and copy-services preserving source service
    supplier links/amount/VAT/status.
  - VPS verification passed on 2026-06-10: web Docker build,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, web deploy,
    and GIT web auth redirect smoke 307.


- Continued GIT frontend and security contract cleanup:
  - The current GIT frontend surface is a server-rendered list/create/status
    page, not a FIT-style autosave wizard; it now has clearer Vietnamese
    labels, workflow-step update controls, action feedback, summary counts,
    delete confirmation, and explicit copy-services source selection.
  - GIT create form no longer sends empty revenue/service child rows by
    default, keeping row creation tied to intentional input.
  - GIT DTO now caps child arrays at 100 rows and attachment metadata arrays at
    50 rows with Vietnamese validation messages, giving a module-level payload
    size guard for large arrays/attachments without adding a new rate-limit
    dependency.
  - Data-scope regression now covers GIT list/detail/create plus update,
    remove, and copy-services source/target branch enforcement.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, web Docker build, api/web deploy, GIT
    API auth smoke 401, and GIT web auth redirect smoke 307.


- Hardened GIT DTO validation contract:
  - `CreateGitTourDto` now trims and validates `systemCode`, `tourCode`,
    `name`, optional text fields, and date strings with Vietnamese validation
    messages and explicit max lengths.
  - `commissionRate` is bounded to 0-100 and `exchangeRate` must be positive
    and capped; blank optional dates are trimmed away instead of reaching the
    service parser.
  - Nested GIT arrays now compact empty rows before validation/mapping, and a
    `customers` array is supported as linked/customer data without replacing
    unrelated children on partial update.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `git diff --check`, API deploy, and
    `/api/git-tours?status=running` unauthenticated guard smoke returned 401
    with Vietnamese auth message.

- Continued GIT backend service hardening:
  - GIT remove now blocks tours with external dependencies such as linked
    orders, bookings, operation records, and finance documents while keeping
    draft-owned child rows soft-delete compatible.
  - GIT numeric parsing no longer silently coerces invalid service/detail
    numbers to zero, and service amount mapping now persists currency /
    exchangeRate and calculates sales/budget/operation amounts with
    exchangeRate before VAT.
  - Regression now covers invalid nested service numbers, operation amount
    with exchangeRate/VAT, copy-services preserving currency/exchangeRate, and
    remove blocking order-linked GIT tours.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API deploy, and GIT auth smoke.


- Continued GIT backend API contract lock:
  - `TEST_TOUR_TYPE_APIS_OK` now guards exact `git-tours` controller route
    surface: list/detail/create/PUT/PATCH/delete/copy-services, inherited
    `tour.view`, and `tour.manage` on write/copy/delete routes.
  - Runtime coverage now verifies `TourStatus` query parsing, view-only users
    can list/detail but cannot create/PUT/delete/copy-services, and create,
    detail, PUT update, list, and copy-services response shapes match frontend
    expectations.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK`.


- Continued GIT business/UI contract lock:
  - Confirmed backend GIT business coverage for workflowStep, shared
    payment/status/service enums, copy-services preservation, customer/agent
    mapping, list search fields, and partial update child preservation remains
    covered by `TEST_TOUR_TYPE_APIS_OK`.
  - GIT list UI now sends `search` / `status` query params to the backend,
    shows workflow step and payment status, includes shared `SETTLED` status,
    and removes unclear Vietnamese abbreviations from visible labels.
  - Regression now statically guards the GIT frontend list/query/workflow
    contract alongside backend tour-type API behavior.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK`, web
    Docker build/deploy, `/git-tours?search=test&status=running` redirect
    smoke, and `/api/git-tours?status=running` auth smoke.


- Continued GIT module business and regression coverage:
  - GIT create DTO now trims required identity fields, normalizes lifecycle and
    payment enum inputs, and returns Vietnamese validation messages for key
    identity and numeric fields.
  - Tour-type regression now covers missing/invalid GIT payloads, duplicate
    system codes, detail relation shape, search by systemCode/tourCode/customer
    name/operator owner, status and payment normalization, partial update child
    preservation, copy-services child preservation, and remove soft-delete
    behavior.
  - VPS verification passed on 2026-06-10: `TEST_TOUR_TYPE_APIS_OK` and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.


- Packaged Step 1/4 Tour schema cleanup for commit:
  - Re-verified the accumulated FIT/GIT/LandTour schema lock, DTO action
    split, child sync helpers, standardized logs, remove ownership, legacy
    decommission docs, and FE/BE mapping.
  - VPS verification passed on 2026-06-10: `git diff --check`,
    API Docker build via focused regressions, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`.

- Continued legacy decommission and FE/BE mapping lock:
  - Added schema comments marking FIT legacy child tables as compatibility
    snapshots: costs, budget/operation services, guides, survey questions,
    and attachments. `fit_handover_items` is explicitly FIT-owned until a
    common handover table exists.
  - Expanded `docs/tour-migration-notes.md` with `Legacy Table Decisions` and
    `FE/BE Mapping` sections, including which GIT/LandTour legacy columns are
    already read-only and which FIT legacy tables remain writable only through
    `FitTourLegacyCompatService`.
  - Locked decommission timing: GIT/LandTour snapshot columns can be removed
    after stable release/drift checks; FIT cost/service/guide/survey/attachment
    snapshots stay until common-table drift checks pass; FIT handover is not
    ready for read-only.
  - Regression guards now verify schema comments and mapping/decommission docs.

- Continued Step 4 log and flow normalization:
  - Added `TourCoreService.logAction()` to standardize Tour log metadata with
    actor, action, module, entity, entityId, and action-specific fields.
  - Common Tour, FIT, GIT, and LandTour create/update/copy/upload/remove/close
    flows now route logs through the standardized helper; GIT and LandTour
    copy-services now write explicit copy action logs.
  - Copy flows remain targeted: FIT copy budget/operation only replaces common
    service rows plus the corresponding legacy snapshot; GIT/LandTour copy
    services remain delegated to `TourCoreService.copyServicesFromTour()`.
  - Remove ownership remains on common `Tour`: FIT/GIT/LandTour remove actions
    soft-delete the common Tour root through `TourCoreService.softDelete()`;
    FIT only also marks its legacy workflow detail as cancelled.
  - VPS verification passed on 2026-06-09: `git diff --check`, API Docker
    build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_TOUR_TYPE_APIS_OK`.

- Continued Step 1 child sync/map/copy cleanup:
  - `TourCoreService` now centralizes common child replacement through
    `hasChanges()` and `replaceRows()`, keeping the sequence as changed group
    detection, `deleteMany`, then non-empty `createMany`.
  - `FitTourLegacyCompatService.syncChildren()` now uses the same pattern via
    `hasChanges()` / `replaceFitChildren()`; budget and operation legacy
    replacement share that helper too.
  - GIT and LandTour `replaceChildren()` now call focused
    `mapTourCustomers()` / `mapTourServices()` helpers instead of inline
    customer/service row construction.
  - Copy service actions remain delegated to `TourCoreService.copyServicesFromTour()`;
    regressions now guard against inline copy/service mapping returning.
  - VPS verification passed on 2026-06-09: `git diff --check`, API Docker
    build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_TOUR_TYPE_APIS_OK`.

- Continued Step 1 DTO contract cleanup:
  - Added module-specific required create field constants:
    FIT `quoteCode` / `tourCode` / `customerName`, GIT `systemCode` /
    `tourCode` / `name`, and LandTour `systemCode` / `tourCode` / `name`.
  - Added focused action DTOs for FIT export/copy/upload, GIT copy-services,
    and LandTour copy-services so action payload fields stay out of
    create/update aggregate DTO groups.
  - Extended FIT and tour-type regressions to verify field groups do not
    overlap, action fields are not part of aggregate DTO surfaces, and
    controllers use focused action DTOs.
  - VPS verification passed on 2026-06-09: `git diff --check`,
    API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and
    `TEST_TOUR_TYPE_APIS_OK`.

- Continued Step 1 common tour schema lock:
  - Documented the canonical common root fields for FIT, GIT, and LandTour in
    `docs/tour-migration-notes.md`, including identity, lifecycle, scope,
    dates, exchange, movement, and notes ownership on `Tour`.
  - Locked product detail ownership: FIT keeps workflow/FIT-only price,
    transport, handover, and survey-description fields during compatibility;
    GIT keeps only detail fields such as `holdCode` / `itinerarySummary` /
    commission fields; LandTour keeps only combo/smart-link/confirmation
    fields.
  - Locked common child ownership for `tourCustomer`, `tourService`,
    `tourRevenue`, `tourCost`, `tourGuide`, `tourTerm`, `tourAttachment`,
    `tourSurvey`, and `tourLog`; FIT `surveyDescription` and `handoverItems`
    remain explicit follow-up gaps because common tables do not yet have exact
    matching surfaces.

- Continued P2 FIT linked-customer data-scope cleanup:
  - `FitToursService.withCustomerSnapshot()` now resolves `customerId` through
    `branchDepartmentScopeWhere()` instead of `findUnique()`, so scoped users
    cannot create or update a FIT tour with a customer outside their data scope.
  - The customer link still feeds the common `TourCustomer.crmCustomerId` while
    preserving the current editable FIT customer-name snapshot behavior.
  - Data-scope regression now covers scoped FIT create/update customer links.
  - VPS verification passed on 2026-06-09: API Docker build,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`, API/web deploy,
    and `HEALTHCHECK_OK`.

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
- 2026-06-10 FIT workflow step gating:
  - FIT wizard keeps the approved order `PRICING -> TOUR_INFO -> BUDGET -> OPERATION -> HANDOVER -> SURVEY`; `DRAFT` remains the pre-confirm state and is not a visible wizard step.
  - Loading an existing FIT tour now opens the next actionable step after the last confirmed `workflowStatus`; completed/cancelled edge cases fall back to a bounded step.
  - Wizard step tabs and Previous/Next navigation now route through `goToStep()`, block unopened future steps, and show a Vietnamese reason when the user tries to jump ahead.
  - FIT root contract regression now checks UI/backend workflow order, guarded wizard navigation, and `confirmStep` rejection for skipped workflow steps.
- 2026-06-10 FIT autosave/submit/load hardening:
  - Autosave debounce is now 3000ms, refuses to create new tours, requires required identity fields, and ignores stale save results if the user has switched to another loaded tour.
  - `preparePayload()` normalizes key numbers, dates, booleans, text, child rows, and attachment metadata before sending to API.
  - `toFormDefaults()` no longer backfills saved/loaded tours with new-tour default child rows when API arrays are missing, reducing accidental overwrite risk on later step saves.
  - Submit/confirm use an invalid-form handler with Vietnamese status feedback instead of silently doing nothing.

- 2026-06-10 FIT copy/select tour hardening:
  - FIT wizard now clears stale copy-source state when loading another tour or resetting to a new tour.
  - Copy Budget requires the selected source tour to still exist in the loaded FIT tour list before POSTing; stale or same-target sources are blocked with Vietnamese status messages.
  - Copy Operation keeps the allowed current-tour fallback, but validates any selected external source before copying and clears stale source state after success/failure guards.
  - Loading a new blank tour now resets with `keepDirty: false` and refreshes the autosave signature so switching to create mode does not leave phantom dirty/copy state.

- 2026-06-10 GIT controller contract hardening:
  - `GitToursController` keeps `tour.view` for list/detail and `tour.manage` for create/update/patch/remove/copy-services.
  - Added `ListGitToursQueryDto` so list search is trimmed/capped and `status` is normalized/validated against `TourStatus` before service execution.
  - `copy-services` remains under `tour.manage`; no extra copy-specific permission was introduced because RBAC catalog/roles do not currently define a narrower GIT copy permission.

- 2026-06-10 GIT service hardening:
  - `GitToursService` now normalizes/validates create/update data before common root writes: uppercase `systemCode`/`tourCode`, required create fields, enum `status`/`paymentStatus`, and whitelisted GIT `workflowStep` values.
  - GIT customer mapping no longer creates a fake default customer row when `customerName` is missing; agents remain common `TourCustomer(customerType = AGENT)` rows.
  - GIT service/cost child updates validate supplier and supplier-service links before replacing children, map UI service status strings to `TourServiceStatus`, and keep partial updates from replacing untouched children.
  - GIT `copyServices()` now requires an explicit source tour different from the target and still delegates source lookup/copy replacement to `TourCoreService.copyServicesFromTour()`.

- 2026-06-10 LandTour regression hardening:
  - LandTour create/update now checks duplicate `systemCode` and type-scoped `tourCode` before common Tour writes, returning Vietnamese conflict messages.
  - `CreateLandTourDto` now has Vietnamese validation messages for required `systemCode`, `tourCode`, and `name`, plus localized Swagger example text.
  - `TEST_TOUR_TYPE_APIS_OK` now covers LandTour missing required fields, invalid number/date payloads, duplicate `systemCode`/`tourCode` on create and update, list/search/status, detail, create/update/remove, copy-services, child mapping, workflow/status/paymentStatus, and partial child preservation.

- 2026-06-11 LandTour frontend contract hardening:
  - The /landtours page now mirrors the GIT list contract: it reads search/status query params, passes them to GET /api/landtours, and exposes a search/status filter bar.
  - LandTour server actions now surface Vietnamese success/error state via redirect query, instead of silently revalidating after failed create/update/copy/delete calls.
  - Create payload now trims fields, maps route/itinerarySummary, normalizes numeric inputs, and only sends sales/operation service rows when the user entered real service data.
  - List rows now show payment status, workflow status, service/term counts, copy-services modal with explicit source tour, and delete confirmation modal.
  - TEST_TOUR_TYPE_APIS_OK has static guards for the LandTour frontend query/copy/delete/payment/payload contract.

- 2026-06-11 Finance controller permission/upload hardening:
  - Receipt/payment/invoice routes keep separate view/create/update/delete/approve/import/export permissions; reject and cancel intentionally share each entity's approve permission because they are final-state approval actions.
  - Customer and supplier debt reads now use dedicated `finance.debt.view`; migration `20260611150000_finance_debt_view_permission` grants it to every role that already had `finance.cashflow.view`, preserving existing access.
  - Finance upload endpoints now use shared configurable upload limits and blocked MIME/extension rules, document multipart Swagger contracts, reject missing files in Vietnamese, and translate oversized uploads to a clear 413 response.
  - Updated finance controller and file rollback regression coverage for the current FinanceService API.

- 2026-06-11 Operations controller contract hardening:
  - OperationsController now uses focused query DTOs for forms and supplier payment requests, with trimmed search, enum status validation, id filters, and a capped take value.
  - Permissions are locked to operation.form.view/manage and operation.payment-request view/create/approve; create-finance-payment also keeps finance.payment.create.
  - POST /operations/forms/:id/cancel is documented as the official cancel route; DELETE /operations/forms/:id remains a deprecated compatibility alias.
  - OperationsService now localizes remaining English operation/payment-request errors and keeps partial list query parsing out of raw string handling.
  - Creating a finance payment from a supplier payment request now guarantees a common Tour link: it reuses an existing form/booking/order tour or creates a minimal operation Tour, links Booking/OperationForm back to it, and uses globally unique OPT/PC code generation to avoid branch sequence collisions.
  - Verified on VPS: TEST_OPERATIONS_CONTROLLER_CONTRACT_OK, docker compose build api, API deploy, and SMOKE_OPERATIONS_BACKEND_OK.

- 2026-06-11 Operations dashboard/module hardening:
  - getDashboard() now uses full-day date bounds for the next-14-day departure window, typed Booking/Order/Tour enums, and a shared active OperationForm scope for overdue task and supplier confirmation metrics.
  - upcomingDepartures now counts upcoming/running orders plus standalone confirmed/operating bookings without an order, avoiding blind spots for booking-only flows.
  - operatingTours now counts common running Tours plus legacy running Orders that do not yet have a common Tour, avoiding duplicate counts when the common Tour exists.
  - lowMarginTours now ignores cancelled/settled/deleted orders and focuses on upcoming/running/completed orders with revenue and negative profit.
  - getModules() now returns structured module-card metadata with key, Vietnamese label, route, permission, metrics, order, and enabled flag; child tables operation-services/operation-costs are no longer exposed as standalone modules.
  - Verified on VPS: TEST_OPERATIONS_CONTROLLER_CONTRACT_OK, docker compose build api, API deploy, and SMOKE_OPERATIONS_BACKEND_OK.

- 2026-06-13 High A data-leak and authorization hardening:
  - Quotation SmartLink tokens now use 32 cryptographically random bytes, rotate whenever enabled, and reject legacy predictable token shapes.
  - Public quotation lookup uses an explicit public projection that excludes cost, margin, supplier, internal ownership/scope, audit, and unnecessary customer fields.
  - Finance/debt report routes and sensitive report exports now require `finance.cashflow.view` or `finance.debt.view` in addition to report permissions.
  - Generic file download/delete now verifies the parent-module permission, exact stored metadata URL, and parent entity data scope before accessing MinIO.
  - TourQuote list/detail/actions/writes now receive `request.user`, scope through the linked CRM customer, and require scoped creates to match a customer in the actor's branch/department. Customer-related quote reads apply the same TourQuote scope.
  - No schema migration, frontend change, auth token/localStorage change, operation-voucher change, commission-sync change, or deployment was performed.
  - Verified on VPS: `TEST_HIGH_A_DATA_ACCESS_OK`, `docker compose build api`, `TEST_ROUTE_PERMISSIONS_OK`, and `TEST_FILE_SERVICE_ERROR_FLOWS_OK`.

- 2026-06-13 High B finance workflow and audit actor hardening:
  - Commission report GET/list/summary/grouping/export paths are read-only; order synchronization remains available only through the explicit permission-protected sync endpoint/job path.
  - Creating an operation-voucher finance payment now leaves the voucher debt/status unchanged while the FinancePayment is `PENDING`, blocks duplicate active finance payments, and derives `createdBy` from `request.user`.
  - Operation-voucher settlement now requires a linked `APPROVED` FinancePayment. Finance approval/cancel transactions lock the voucher row, reject overpayment, create settlement once, and reverse it on cancel; rejected pending payments do not change debt.
  - Operations/customer/finance audit actors, `createdBy`, `requestedBy`, and `approvedBy` are derived from `request.user`; operation audit payloads strip client-supplied actor fields and AuditLog rows record `actorId`.
  - No database schema, frontend, or deployment change was made.
  - Verified on VPS: `TEST_HIGH_B_FINANCE_AUDIT_OK`, `TEST_COMMISSION_REPORTS_SECURITY_OK`, `TEST_OPERATION_VOUCHERS_SERVICE_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`, `docker compose build api`, and `git diff --check`.
  - Existing unrelated checks still fail before reaching this work: `test-operations-controller-contract.sh` on generic supplier `supplierServices`, and `test-customers-service.sh` on an outdated dangerous-MIME error-message expectation.

- 2026-06-13 Medium/Low review follow-up:
  - Added Docker-based toolchain verification because host node_modules remains broken for lint/prisma; no production dependency repair was attempted on host.
  - Web Docker build now requires explicit NEXT_PUBLIC_API_URL and no longer defaults to the stale quanly.dunientravel.com domain; missing build arg fails early.
  - Commission report query/action/pay requests now use focused DTO validation for enum/date/take/id/note/amount fields while keeping existing service guards.
  - Report order/tour filters now combine employee and search OR groups under AND so one filter no longer overwrites the other.
  - Commission/order CSV exports now require dedicated commission.export/order.export permissions, with RBAC role grants and security permission labels/catalog updated.
  - Supplier CSS cleanup removed duplicate scoped rules and fixed row detail indentation only; no UI redesign was performed.
  - Verified repeatedly on VPS with git diff --check, docker compose config --quiet, Docker api/web builds, scripts/verify-toolchain-docker.sh, TEST_ROUTE_PERMISSIONS_OK, and direct report filter contract check. npm audit still reports one high severity dependency advisory for follow-up.

- 2026-06-13 Reports query validation follow-up:
  - Reports controller query inputs use ReportQueryDto validation for enum/date/boolean/string filters; invalid dates are rejected with 400 before Prisma and report enum filters no longer use loose any casts.
  - Commission report groupBy/sortBy now use explicit enums, and grouping/:groupBy uses ParseEnumPipe so unsupported values return 400 instead of falling through to a default grouping.
  - No database schema, frontend, or deployment change was made.
  - Verified on VPS: TEST_COMMISSION_REPORTS_SECURITY_OK, TEST_HIGH_A_DATA_ACCESS_OK, npm run verify:toolchain, docker compose config --quiet, and git diff --check.

- 2026-06-13 Credentialed CORS runtime hardening:
  - CORS origin discovery/normalization now lives in runtime-env.ts and is shared by startup validation and Nest CORS setup.
  - Production and staging fail startup when no explicit CORS origin environment value is configured; permissive origin fallback remains development-only.
  - Existing SMARTTOUR_CORS_ORIGINS, CORS_ORIGINS, NEXT_PUBLIC_API_URL, SMARTTOUR_WEB_URL, and WEB_ORIGIN compatibility is preserved.
  - No database schema, frontend, or deployment change was made.
  - Verified on VPS: TEST_AUTH_GUARD_BEHAVIOR_OK, TEST_AUTH_COOKIE_SESSION_OK, npm run verify:toolchain, docker compose config --quiet, and git diff --check.

- 2026-06-13 Logout timeout follow-up:
  - AppShell logout now awaits the backend revoke/clear-cookie response for up to 3 seconds using AbortController, then deterministically clears local UI state and redirects.
  - File metadata authorization already normalizes relative, absolute, and legacy download URLs to object keys; no additional file-service change was required.
  - No database schema change.

- 2026-06-13 SmartLink lifecycle and dev audit follow-up:
  - Repeated enable while SmartLink is active preserves its valid token, while disabled-to-enabled transitions now issue a new random token; missing/legacy tokens are also replaced.
  - package-lock.json already pins esbuild 0.28.1 and lockfile audit reports zero vulnerabilities; host node_modules may still show stale esbuild 0.28.0 until npm ci, but Docker verification installs from the lockfile.
  - No database schema or frontend change.

- 2026-06-13 Report endpoint-specific query validation:
  - Order-backed report routes now use `OrderReportQueryDto`; debt reports use `DebtReportQueryDto`; Tour finance uses `TourReportQueryDto`; dynamic exports keep the shared DTO and receive service-level endpoint validation.
  - Incompatible type/status/paymentStatus/dateField filters now return 400 instead of being dropped, and invalid dateField values no longer fall back to `createdAt`.
  - Tour finance explicitly rejects the Order-only `costStatus` filter; debt reports only accept `documentDate`; supplier history rejects unsupported report filters. No database schema change.
  - ReportsClient sends `documentDate` for debt reports, filters Order/Tour query keys and enum values by tab, and no longer presents Order-only date/type/cost filters on Tour finance.
  - Added `TEST_REPORT_QUERY_VALIDATION_OK`; Docker toolchain verification, Prisma validate, route permission audit, and High-A data access regression all pass.

- 2026-06-13 SmartLink legacy migration guard:
  - Added `scripts/smartlink-legacy-audit.js` plus Docker-friendly wrapper `scripts/smartlink-legacy-audit.sh` with audit, guard, and backfill modes for active legacy/missing SmartLink tokens.
  - Production deploy and `verify:deploy` now run `--mode=guard` before build/deploy, blocking release when any active SmartLink token is not the 43-character secure format.
  - Backfill rotates only active legacy/missing tokens, keeps already-secure tokens and inactive legacy tokens unchanged by default, and writes old/new public URLs for customer resend planning.
  - Operational notes live in `docs/smartlink-legacy-migration.md`; current VPS audit reports zero active legacy SmartLinks.

- 2026-06-13 Operation voucher payment reconciliation follow-up:
  - OperationVoucher addPayment keeps the existing one FinancePayment to one OperationVoucher model; no allocation model or schema migration was introduced.
  - Approved FinancePayment.paymentAmount is now the server-authoritative settlement amount. Client paidAmount/paymentAmount is optional and, if supplied, must match the approved finance payment amount.
  - The transaction still locks the OperationVoucher and FinancePayment rows before checking reuse and writing settlement rows, preventing double-use while avoiding partial payment allocation semantics.

- 2026-06-13 Runtime CORS origin validation follow-up:
  - Browser CORS origins now come only from explicit frontend-origin env vars: SMARTTOUR_CORS_ORIGINS, CORS_ORIGINS, SMARTTOUR_WEB_URL, or WEB_ORIGIN.
  - NEXT_PUBLIC_API_URL is no longer treated as a backend CORS origin source because it may be an API base URL rather than the browser frontend origin.
  - CORS origin parsing now fails fast for invalid URL syntax, wildcard, unsupported protocols, credentials, path, query string, or fragment.

- 2026-06-19 Finance summary pagination audit:
  - Found a reporting correctness bug where cashflow, customer debt, and supplier debt summaries/grouped debt rows were computed from paginated `take` results instead of the full filtered dataset.
  - Fixed FinanceService to keep paginated rows/entries for table display while computing summaries and grouped debt rows from all matching scoped entries using the same filters.
  - Added finance service regression cases for `take: '1'` on cashflow, customer debt, and supplier debt so totals remain independent of pagination.
  - Verified on VPS: `TEST_FINANCE_SERVICE_FLOWS_OK`, `TEST_FINANCE_CLIENT_CONTRACT_OK`, `TEST_REPORTS_FINANCE_HYBRID_CONTRACT_OK`, and all finance production guard audits passed with only accepted TourKit import snapshots remaining.

- 2026-06-19 Finance date-filter audit:
  - Found that finance `to` date filters treated `YYYY-MM-DD` as midnight at the start of the day, so receipt/payment/invoice/cashflow/debt records later on the selected end date could be omitted.
  - Added service regressions for same-day date ranges on receipts, payments, invoices, customer debt, and supplier debt using timestamped records within the end date.
  - Updated FinanceService date filtering so date-only `to` values expand to 23:59:59.999 UTC while explicit timestamp filters remain exact.

- 2026-06-19 Finance debt filter/search audit:
  - Found the Finance web debt tab ignored the shared filter query while receipts/payments/invoices/cashflow used it, so date/search filters did not affect customer/supplier debt views.
  - Fixed FinanceClient to pass the shared query to customer and supplier debt endpoints.
  - Added backend debt search by customer name/phone/code and supplier name/phone/code so the shared search box actually filters debt rows.

- 2026-06-19 Finance tour-code linking audit:
  - Found the Finance web forms collected visible tour codes while the API only resolved tour links from internal `tourId`/`orderId`/voucher links, so manually created receipt/payment/invoice rows could fail tour-link validation from the UI.
  - Added FinanceService regressions proving receipts, payments, and invoices can resolve an exact Tour `tourCode`/`systemCode` into `tourId`.
  - Updated `resolveTourId` to accept `tourCode`, wired create/update/import flows to pass it, and added the missing payment form tour-code field.

- 2026-06-19 Finance supplier-payment party audit:
  - Found `SUPPLIER_PAYMENT` could be created with a tour link but without `supplierId` or `operationVoucherId`, allowing approved cash outflow without supplier ledger traceability.
  - Added a FinanceService guard requiring supplier payments to link either a supplier or an operation voucher; company expense voucher types such as `OTHER` remain allowed without a tour/supplier link.
  - Added a regression covering legacy draft supplier-payment approval with no party link so existing bad drafts remain blocked with the same business error.
  - Changed the standalone payment form default voucher type to `OTHER` because the form does not expose a supplier selector, and updated import regressions to include `supplierId` for supplier-payment CSV rows.

- 2026-06-19 Finance posted-document update audit:
  - Found approved finance receipts, payments, and invoices only blocked amount edits, while non-amount updates could still change posted document metadata/links without updating cashflow or ledger entries.
  - Added a shared final-state update guard so approved/rejected/cancelled finance documents cannot be edited through update APIs; corrections must use cancel/reversal flows.
  - Added service regressions proving approved receipts, payments, and invoices reject even note-only updates after posting.

- 2026-06-19 Finance query validation audit:
  - Found finance list/debt/cashflow service queries accepted invalid date and pagination values; invalid `from` could be silently ignored and invalid `to` could reach Prisma instead of returning a business 400.
  - Added service-level query guards so date filters must parse to valid dates and `take` must be a positive integer, covering receipts, payments, invoices, cashflow, customer debt, and supplier debt.
  - Added finance service regressions for invalid `from`, invalid `to`, zero `take`, and negative `take` across document, debt, and cashflow queries.

- 2026-06-19 Finance numeric input validation audit:
  - Found manual finance create/update paths could accept negative numeric values and coerce non-numeric values to zero, while CSV import already rejected those cases.
  - Hardened the shared finance decimal parser to reject NaN/non-finite and negative values for receipt/payment amounts and invoice item numeric fields, while preserving zero-value draft behavior.
  - Added service regressions for negative receipt/payment/invoice values and non-numeric receipt totals.

- 2026-06-19 Finance manual enum/date validation audit:
  - Found manual finance create/update paths relied on string casts for enums and silently dropped invalid write dates, while CSV import already returned business validation errors.
  - Added shared write-path enum and date guards for receipt/payment/invoice data builders so invalid receipt/payment/invoice types, payment methods, and write dates return 400 before Prisma.
  - Added service regressions for invalid receipt type, invalid payment method, and invalid invoice issued date.

- 2026-06-19 Finance receipt allocation audit:
  - Found receipt order allocations could differ from `receiptAmount`, causing cashflow/customer ledger to post one amount while booking paid revenue was reconciled by a different amount.
  - Added a receipt allocation guard requiring the sum of `orders[].amount` to equal `receiptAmount` whenever booking allocation rows are present.
  - Applied the guard to create, update, import, approve, and cancel paths so both new writes and legacy drafts cannot post mismatched booking reconciliation.

- 2026-06-19 Finance total amount consistency audit:
  - Found manual receipt/payment create and update paths accepted totals lower than the actual collected/paid amounts, while CSV import already rejected those inconsistent rows.
  - Added service-level guards so receipt total must be at least paidBefore plus receiptAmount, and payment total must be at least paymentAmount.
  - Added finance service regressions for invalid manual receipt and payment totals.
  - Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, `git diff --check`, and API Docker build.

- 2026-06-19 Tour nested numeric validation audit:
  - Found common Tour child mappers accepted negative numeric values in GIT/LandTour revenue, cost, and service rows because nested arrays are service-mapped `unknown[]` payloads and `TourCoreService.number()` only checked finite numbers.
  - Added a GIT API regression proving a negative budget service unit price is rejected with a Vietnamese 400 instead of creating a negative `budgetAmount` tour service.
  - Hardened the shared Tour numeric parser to reject negative values before child rows are persisted, covering common revenue/cost/service/attachment/order fields that flow through TourCoreService.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, TourKit order-to-tour sync, bookings service, operations service flows, `git diff --check`, and API Docker build. `test-fit-tour-root-contract.sh` still fails on a stale FilesService source assertion expecting old denied-list variable names while the current upload allowlist guard remains in place.

- 2026-06-19 Tour common delete dependency-guard audit:
  - Found the generic `DELETE /tours/:id` endpoint bypassed the dependency guard implemented by `DELETE /git-tours/:id` and `DELETE /landtours/:id`, allowing a GIT/LandTour with linked orders, bookings, operations, or finance documents to be soft-deleted through the common route.
  - Added a Tour type API regression proving a GIT tour linked to an Order is blocked through the common Tour delete route, not only the GIT-specific route.
  - Added a common ToursService removability guard that checks order links and operational/finance child counts before calling `TourCoreService.softDelete`.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, `TEST_TOURKIT_ORDERS_TOUR_SYNC_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build.

- 2026-06-19 Tour child zero-defaulting audit:
  - Found common Tour child mappers used truthy fallbacks like `row.quantity || 1` and `row.exchangeRate || 1`, so explicit zero values in GIT/LandTour service/revenue rows were treated as missing and silently converted to one.
  - Added a GIT API regression proving `quantity: 0` in a budget service is rejected instead of being persisted as quantity 1 with a positive budget amount.
  - Added shared TourCore helpers that default only blank values, preserve explicit numeric input, and require positive quantity/exchangeRate values while keeping unit prices non-negative.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, `TEST_TOURKIT_ORDERS_TOUR_SYNC_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build.

- 2026-06-19 Tour child unit-price alias audit:
  - Found common Tour service mappers still used truthy alias fallbacks such as `row.unitPrice || row.budgetUnitPrice`, so explicit zero unit prices could be ignored when an alias field was also present.
  - Added a GIT API regression proving a budget-service payload with `unitPrice: 0` and `budgetUnitPrice: 1000` preserves the explicit zero unit price and calculated zero budget amount.
  - Added a shared alias picker that falls back only when the primary value is blank/null, then applied it to sales, budget, and operation service unit-price aliases.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, `TEST_TOURKIT_ORDERS_TOUR_SYNC_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build.

- 2026-06-19 Tour child explicit zero-amount audit:
  - Found common Tour amount calculation ignored explicit `amount: 0` because `money()` treated only positive overrides as user-entered values and recalculated zero from quantity/unit price/VAT.
  - Added a GIT API regression proving a budget-service payload with `amount: 0` preserves the explicit zero budget amount instead of recalculating a positive amount from `unitPrice`.
  - Updated `TourCoreService.money()` to auto-calculate only when amount is blank/null; explicit numeric inputs, including zero, are parsed and preserved.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, `TEST_TOURKIT_ORDERS_TOUR_SYNC_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build.

- 2026-06-19 Tour child cost amount alias audit:
  - Found common Tour cost mapping used `row.amount || row.expectedAmount`, so explicit `amount: 0` cost rows could be overwritten by a legacy `expectedAmount` alias.
  - Added a GIT API regression proving a cost payload with `amount: 0` and `expectedAmount: 1000` preserves the explicit zero expected amount.
  - Updated `TourCoreService.mapCosts()` to use the shared alias picker and fall back only when `amount` is blank/null.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, `TEST_TOURKIT_ORDERS_TOUR_SYNC_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build.

- 2026-06-19 FIT upload contract audit unblock:
  - Found `test-fit-tour-root-contract.sh` still asserted old FilesService denied-list variable names even though production upload validation now uses allowlists `allowedExtensions` and `allowedMimeTypes` plus `assertAllowedUpload(file)` in the interceptor/service.
  - Updated the FIT root contract assertion to match the current allowlist-based upload guard, removing the stale residual failure that blocked FIT audit verification.
  - No production code or runtime behavior changed.
  - Verification passed: `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build.

- 2026-06-19 FIT explicit zero amount audit:
  - Found FIT money helpers still treated explicit `amount: 0` as blank because they only preserved positive overrides, so FIT common costs and budget services could be recalculated to positive amounts from quantity/unit price/VAT.
  - Added FIT root contract regressions proving zero common cost and zero budget service amounts are preserved in both legacy FIT rows and common Tour cost/service rows.
  - Updated FIT money helpers to auto-calculate only when amount is blank/null; explicit numeric inputs, including zero, are preserved while service-level validation continues rejecting negative values.

- 2026-06-19 FIT remove dependency-guard audit:
  - Found `FitToursService.remove()` called `TourCoreService.softDelete()` directly, bypassing the dependency guard used by the common Tour delete endpoint.
  - Added a FIT root contract regression proving an order-linked FIT tour cannot be removed through the FIT service path and the common Tour root remains undeleted.
  - Added a FIT removability guard that blocks delete when the common Tour root has linked orders, bookings, operation records, finance documents/cashflow entries, or legacy payment/receipt/expense rows.

- 2026-06-19 FIT child zero-multiplier validation audit:
  - Found FIT child validation allowed zero quantity/times/exchange-rate values while legacy mappers could use truthy defaults like `row.times || 1`, so explicit zero multipliers could either create impossible zero rows or be silently converted to one.
  - Added FIT root contract regressions proving zero `commonCosts[].times` and zero `budgetServices[].quantity` are rejected with Vietnamese business errors.
  - Added positive-number validation for FIT cost/service calculation drivers while keeping explicit zero money amounts and zero unit prices allowed where they are legitimate.

- 2026-06-19 FIT handover quantity validation audit:
  - Found FIT handover item validation allowed `quantity: 0` while the legacy mapper used `row.quantity || 1`, so explicit zero quantities could be silently converted into one handover item.
  - Added FIT root contract coverage proving zero handover item quantity is rejected with a Vietnamese business error.
  - Added positive-number validation for `handoverItems[].quantity` while keeping ordering fields unchanged.

- 2026-06-19 Finance invoice item quantity audit:
  - Found finance invoice item mapping used `this.decimal(row.quantity) || 1`, so explicit `quantity: 0` could be silently converted into one unit and inflate invoice totals.
  - Added a finance service regression proving zero invoice item quantity is rejected with a 400 instead of defaulting to one.
  - Updated invoice item mapping to default only missing quantity to one and reject provided quantities less than or equal to zero.

- 2026-06-19 Order exchange-rate validation audit:
  - Found order mapping used `dto.exchangeRate || 1`, so explicit `exchangeRate: 0` could be silently converted into one instead of rejected.
  - Added an order service regression proving zero exchange rate is rejected and no invalid order is persisted.
  - Updated order data mapping to default only missing exchange rates and require provided exchange rates to be finite positive numbers.

- 2026-06-19 Quote exchange-rate validation audit:
  - Found Tour Quote mapping used `dto.exchangeRate || 1`, so explicit `exchangeRate: 0` could be silently converted into one instead of rejected.
  - Added a High-A data access regression proving scoped tour quote creation rejects zero exchange rate.
  - Updated Tour Quote root mapping to require provided exchange rates to be finite positive numbers while preserving default behavior when the field is omitted.

- 2026-06-19 Quote combo positive-count validation audit:
  - Found combo quote sanitization used a clamp helper for `nightCount`/`paxCount`, so explicit zero values could be silently converted into one.
  - Added a High-A data access regression proving combo quote creation rejects zero `nightCount` instead of defaulting it.
  - Updated combo quote sanitization to default missing counts to one but reject provided non-positive counts with Vietnamese business errors.

- 2026-06-19 Quotation exchange-rate validation audit:
  - Found legacy quotation `positiveRate()` defaulted explicit zero/non-positive exchange rates back to one, matching the bug already fixed in Orders and Tour Quotes.
  - Added a High-A data access regression proving quotation creation rejects `exchangeRate: 0` instead of silently defaulting it.
  - Updated quotation exchange-rate parsing to default only missing values and reject provided non-positive or non-finite rates with a Vietnamese business error.

- 2026-06-19 Quotation item positive-count validation audit:
  - Found legacy quotation item sanitization allowed explicit zero `quantity`, `nightCount`, and `paxCount`, letting zero-value service lines distort quotation totals and later order conversion prices.
  - Added High-A data access regressions proving zero item quantity, night count, and pax count are rejected.
  - Updated quotation item sanitization to default missing counts to one but reject provided non-positive counts with Vietnamese business errors.


- 2026-06-19 Order child positive-count validation audit:
  - Found order child sync allowed explicit zero `salesItems.quantity`, `salesItems.serviceCount`, `operationItems.quantity`, and `handoverItems.quantity`, letting meaningful child rows persist as zero-value revenue/cost/allotment or invalid handover lines.
  - Added order service regressions proving those zero child counts are rejected, including hotel booking operation lines that previously skipped allotment locking silently.
  - Updated order child mappers to keep blank form rows ignored while rejecting non-positive counts on meaningful rows with Vietnamese business errors.


- 2026-06-19 Tour quote cost multiplier validation audit:
  - Found Tour Quote cost item sanitization accepted explicit zero `quantity`, `serviceCount`, `paxPerRoom`, and `exchangeRate`, allowing meaningful quote cost lines to collapse to zero or invalid multipliers.
  - Added quote smoke API regressions proving zero cost quantity, service count, and exchange rate are rejected with 400 responses.
  - Updated Tour Quote cost sanitization to default missing multipliers to one but reject provided non-positive values with Vietnamese business errors.
  - During smoke verification, found converted order child rows could be returned in nondeterministic DB order; fixed OrdersService detail/edit/copy includes to order sales and operation rows by `sortOrder`.


- 2026-06-19 Reports tour P&L zero fallback audit:
  - Found tour P&L cost helper still treated explicit zero actual costs as absent by using `actual > 0`, and treated explicit zero confirmed service costs as absent through truthy `confirmedAmount || budgetAmount` fallback.
  - Added Reports finance hybrid contract guards to fail on those fallback patterns and require presence-based fallback logic.
  - Updated tour cost aggregation to use expected/budget values only when actual/confirmed values are null or undefined, preserving explicit zero values.


- 2026-06-19 FIT root detail actual-zero fallback audit:
  - Found FIT root detail mapper used `actualAmount > 0 ? actualAmount : expectedAmount`, so explicit zero actual cost values displayed as expected costs in legacy-compatible cost groups.
  - Added FIT root contract coverage for a TourCost with `expectedAmount=1000` and explicit `actualAmount=0`, requiring detail `commonCosts[].amount` to remain zero.
  - Updated root cost mapping to fallback only when `actualAmount` is null or undefined.


- 2026-06-19 FIT legacy truthy fallback cleanup:
  - Found FIT legacy compatibility mappers still used truthy fallbacks (`row.times || 1`, `row.exchangeRate || 1`, `row.quantity || 1`) and the FIT root cost bridge used `row.exchangeRate || 1`, which could overwrite explicit zero compatibility values.
  - Added FIT root contract guards and direct mapper regressions proving explicit zero multipliers/quantities remain zero.
  - Replaced those fallbacks with nullish defaults so only missing values default to one.

- 2026-06-19 Upload dependency audit fix:
  - Fixed the high-severity upload DoS audit finding by overriding Nest's transitive `multer` dependency to `2.2.0` and the related Swagger `js-yaml` audit finding to `4.2.0`.
  - Kept the lockfile change scoped to the affected package entries instead of accepting `npm audit fix --force`, which proposed breaking Nest/Swagger downgrades.
  - Verification passed: `npm audit --omit=dev`, `./scripts/security-audit.sh`, and `docker compose build --no-cache api` with Docker install reporting `found 0 vulnerabilities`.

- 2026-06-22 Phase 2 order update status guard:
  - Started Phase 2 by blocking normal Order update payloads from mutating lifecycle `status`; status changes must go through the dedicated status action endpoint.
  - Added service and API regressions proving `PUT /orders/:type/:id` rejects `status` and leaves the existing status unchanged, while the lifecycle endpoint remains available.
  - Updated the Orders API regression to use the current HttpOnly cookie auth contract after Phase 1 removed public token JSON from login/bootstrap responses.

- 2026-06-22 Phase 2 order status transition matrix:
  - Added an explicit current-to-next Order status transition matrix by order type, replacing the previous target-only status allowlist.
  - The first guarded invalid transition is `DRAFT -> COMPLETED`; valid operational correction flows already covered by hotel/allotment tests remain allowed.
  - Verification passed: `scripts/test-order-service-flows.sh` and `scripts/test-orders-api.sh`.

- 2026-06-22 Phase 2 operation form status action guard:
  - Operation form normal updates now reject lifecycle `status` fields; status changes go through the dedicated `POST /operations/forms/:id/status` action route or the existing cancel action.
  - Added `OperationsService.changeFormStatus()` with current-to-next transition guards and audit logging, while keeping cancel reason handling in `cancelForm()`.
  - Verification passed: `scripts/test-operations-service-flows.sh`, `scripts/test-operations-controller-contract.sh`, `npx prisma validate --schema prisma/schema.prisma`, `git diff --check`, and API Docker build.

- 2026-06-22 Phase 2 quotation approved immutability:
  - Legacy quotation updates now reject approved quotations instead of silently changing approved commercial terms; converted quotations were already blocked.
  - Added High-A regression coverage proving approved quotation updates are rejected and stored route/item values remain unchanged.
  - Updated the quote/quotation smoke helper to authenticate through the current HttpOnly cookie contract while keeping token fallback compatibility.
  - Verification passed: `scripts/test-high-a-data-access.sh`, `bash scripts/smoke-quotes-quotations.sh`, `node scripts/test-quotations-client-contract.js`, `node scripts/test-quotes-backend-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `git diff --check`, and API Docker build.

- 2026-06-22 Phase 2 booking operation-form dependency hardening:
  - Tightened Booking status transitions so a confirmed booking cannot move to OPERATING merely because an operation form exists.
  - Booking OPERATING now requires the linked operation form to be IN_PROGRESS or DONE; PENDING forms still block operations and CANCELLED forms remain blocked.
  - Added booking service regression coverage proving pending operation forms reject OPERATING and in-progress operation forms allow the transition.
  - Verification passed: scripts/test-bookings-service.sh, scripts/test-bookings-controller-contract.sh, npx prisma validate --schema prisma/schema.prisma, git diff --check, and API Docker build.

- 2026-06-22 Phase 2 action permission hardening:
  - Split high-risk lifecycle/action permissions away from broad manage permissions for Orders: status updates now require order.status.update, settlement requires order.settle, and unlock requires order.unlock.
  - Split approval permissions for commercial/commission approvals: Tour Quote approve requires quote.approve, legacy Quotation approve requires quotation.approve, and Commission Report approve requires commission.approve.
  - Added an RBAC migration granting the new action permissions to super_admin; operational/sales manage roles no longer implicitly receive these sensitive actions through order.manage, quote.manage, quotation.manage, or commission.manage.
  - Strengthened controller/API/security contracts for order action permissions, quote/quotation approval decorators, and commission approve decorators.
  - Verification passed: scripts/test-orders-controller-permissions.sh, scripts/test-orders-api.sh, node scripts/test-quotes-backend-contract.js, scripts/test-commission-reports-security.sh, npx prisma validate --schema prisma/schema.prisma, git diff --check, and API Docker build.

- 2026-06-22 Phase 3 frontend lifecycle contract alignment:
  - Updated Orders UI so normal save strips root lifecycle status from PUT payloads; changed statuses now go through PATCH /orders/:type/:id/status.
  - Orders UI now renders sensitive lifecycle actions with the dedicated Phase 2 permissions: order.status.update, order.settle, and order.unlock.
  - Tour Quote save payload no longer spreads the whole form object, preventing lifecycle/status fields from leaking into normal PUT payloads.
  - Tour Quote and legacy Quotation approve buttons now use quote.approve and quotation.approve instead of broad manage permissions.
  - Verification passed: scripts/test-orders-ui-auth-contract.sh, node scripts/test-quote-tours-client-contract.js, node scripts/test-quotations-client-contract.js, node scripts/test-quotes-backend-contract.js, node scripts/test-web-server-api-base-contract.js, npm run build -w @smarttour/web, and git diff --check.

- 2026-06-22 Phase 3 frontend RBAC catalog and action confirmation hardening:
  - Added the Phase 2 action permissions to the Security role editor catalog and Vietnamese permission labels: order.status.update, order.settle, order.unlock, quote.approve, quotation.approve, and commission.approve.
  - Commission report approve controls now use commission.approve instead of broad commission.manage, matching the backend route permission.
  - Added confirmation prompts before high-impact frontend actions: order settlement/unlock, Tour Quote approve/convert, legacy Quotation approve/convert, and commission approve/reject/pay.
  - Added a Commission Reports client contract and strengthened Security/Orders/Quote/Quotation frontend contracts to guard these behaviors.
  - Verification passed: node scripts/test-role-permission-contract.js, scripts/test-security-ui-contract.sh, node scripts/test-commission-reports-client-contract.js, scripts/test-orders-ui-auth-contract.sh, node scripts/test-quote-tours-client-contract.js, node scripts/test-quotations-client-contract.js, node scripts/test-quotes-backend-contract.js, npm run build -w @smarttour/web, and git diff --check.

- 2026-06-22 Phase 3 commission reports list UX hardening:
  - Found Commission Reports client loaded list data without checking failed API responses, without a reload loading state, without a visible list-load error, without an empty table state, and without an explicit backend `take` limit.
  - Added frontend contract coverage for loading/error/empty-state handling, explicit `take=100`, and sync failure handling.
  - Updated the Commission Reports client to handle failed list/sync responses, clear stale rows on load failure, render loading/error/empty states, and disable sync during reload.

- 2026-06-22 Phase 3 finance list take/empty-state hardening:
  - Found the Finance client did not send an explicit backend `take` limit while finance list services support capped `take` queries.
  - Found the Cashflow table lacked an empty row, unlike receipts, payments, invoices, and debt tables.
  - Added contract coverage and updated the Finance client to send `take=100` and render a Cashflow empty state.

- 2026-06-22 Phase 3 operation vouchers frontend permission/payment hardening:
  - Found Operation Vouchers frontend actions did not render according to backend action permissions: create/update require `operation.form.manage`, and payment recording requires `operation.payment-request.create`.
  - Found list reload did not send the backend-supported `take` limit and payment recording posted without a consequence-aware confirmation.
  - Added a focused client contract and updated the client to show the permission notice, disable unauthorized create/save/payment controls, guard submit/payment handlers, send `take=100`, and confirm before recording supplier debt payment.

- 2026-06-22 Phase 3 operations workflow confirmation/list take hardening:
  - Found OperationsClient list filters did not send an explicit backend `take` limit while Operations DTOs support capped list sizes.
  - Found supplier payment request workflow actions and finance payment approval from the Operations screen could post immediately without a consequence-aware confirmation.
  - Extended the Operations controller/client contract and updated the client to send `take=100`, confirm submit/approve/reject/create-finance-payment actions, and confirm finance payment approval before posting.

- 2026-06-22 Phase 3 GIT/LandTour numeric validation hardening:
  - Found GIT and LandTour page server actions used a numeric helper that silently defaulted invalid numeric form input to 0 or 1.
  - Added a focused frontend contract for numeric validation on quantities, VAT, commission rate, and exchange rate.
  - Updated GIT/LandTour create actions so invalid numbers redirect with validation errors, quantities/exchange rates must be positive, and VAT/commission values stay in 0..100 instead of posting silently coerced data.

- 2026-06-22 Phase 3 reports RBAC hardening:
  - Found the Reports page fetched overview/revenue data before checking the current user's report.view permission.
  - Found the Reports client exposed finance, customer debt, supplier debt, and CSV export controls even though backend routes require finance.cashflow.view, finance.debt.view, and report.export.
  - Added a focused Reports permissions contract and updated the server page/client so report content, finance/debt tabs, finance subviews, and export actions fail closed by permission.

- 2026-06-22 Phase 3 order center RBAC hardening:
  - Found the server-rendered Order Center page fetched dashboard/order data before checking order.view, allowing unauthorized data preload into the page payload.
  - Found the Order Center export control only disabled via client permission state instead of being server-driven and fail-closed by the page permission contract.
  - Added a focused Order Center permissions contract and updated the page/client so order content requires order.view and CSV export requires order.export.

- 2026-06-22 Phase 3 workspace data permission hardening:
  - Found Workspace and CEO Overview server data helpers fetched reports, finance, order-center, operations, quotations, receipts, and payments before checking the current user's permissions.
  - Added a focused workspace data permissions contract and changed workspace-data to read /auth/me first, then only call each protected API group when the matching backend permission is present.
  - This keeps workspace summary pages fail-closed and prevents unauthorized dashboard/order/finance data preloads through the workspace route family.

- 2026-06-22 Phase 3 customers client RBAC hardening:
  - Found Customers client started list fetches before permission readiness and still rendered filters/metrics/list while customer.view was missing.
  - Found create/detail/file handlers relied mostly on disabled controls instead of failing closed by permission inside the handler.
  - Added a focused Customers client permissions contract and updated the client to wait for permissions, hide customer data without customer.view, and guard create/detail/upload/delete handlers.

- 2026-06-22 Phase 3 commission reports client RBAC hardening:
  - Found Commission Reports client loaded commission data before permission readiness and still rendered metrics/list content when commission.view was missing.
  - Found CSV export was a direct window.location action without checking commission.export, and sync/reject/pay handlers relied mainly on disabled controls.
  - Strengthened the Commission Reports client contract and updated the client to wait for permissions, hide data without commission.view, hide/fail-close CSV export without commission.export, and fail-close sync/reject/pay/approve handlers by their backend permissions.

- 2026-06-22 Phase 3 server API base hardening:
  - Found the server-rendered Tour Programs and Bookings pages still fell back to `http://localhost:4000` when `NEXT_PUBLIC_API_URL` was missing.
  - Updated both pages to use the server-side API base contract: prefer `SMARTTOUR_SERVER_API_URL`, default production SSR to Docker internal `http://api:4000`, and keep public API env only for development fallback.
  - Strengthened `scripts/test-web-server-api-base-contract.js` so Tour Programs and Bookings cannot regress to localhost/public-only SSR API calls.
  - Verification passed: `node scripts/test-web-server-api-base-contract.js`, `npm run build -w @smarttour/web`, `docker compose config --quiet`, and `git diff --check`.

- 2026-06-22 Phase 3 broad server API base hardening:
  - Found the same SSR API-base drift across other server-rendered pages: FIT/GIT/LandTour, Operations vouchers, Order Center, Orders, Quote/Quotation, Reports, Suppliers, Tour Guides, Tour Programs, and Bookings.
  - Added shared `apps/web/app/serverApiBase.ts` and moved server pages to `serverApiBase()` so SSR requests prefer `SMARTTOUR_SERVER_API_URL`, default production to Docker internal `http://api:4000`, and keep public API env only inside the shared helper.
  - Expanded `scripts/test-web-server-api-base-contract.js` to cover every server page with SSR API fetches and prevent direct `NEXT_PUBLIC_API_URL` reads in page code.
  - Verification passed: `node scripts/test-web-server-api-base-contract.js`, grep for direct page-level `NEXT_PUBLIC_API_URL` reads, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 auth stale login cleanup:
  - Found an unused root `apps/web/app/LoginClient.tsx` that duplicated the real `/login/LoginClient.tsx` but lacked the canonical safe redirect handling.
  - Removed the stale root login client and updated the auth cookie/session contract so `/login/LoginClient.tsx` is the only login client and must keep `safeNextPath`.
  - Verification passed: `bash scripts/test-auth-cookie-session.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 SSR list payload hardening:
  - Found production page smoke returning very large SSR HTML for Tour Programs and Suppliers because the pages loaded unbounded master-data lists.
  - Added bounded `take` query support to Tour Programs and common Suppliers list endpoints, defaulting to 100 and capping at 200.
  - Updated `/tour-programs` and `/suppliers` server pages to request `take=100`, reducing SSR payload risk while keeping operational lists usable.
  - Strengthened Tour Programs and Suppliers contracts so DTOs, services, and server pages keep bounded list behavior.
  - Verification passed: `bash scripts/test-tour-programs-service.sh`, `bash scripts/test-suppliers-common-contract.sh`, `node scripts/test-suppliers-server-page-permissions-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 GIT/LandTour SSR payload hardening:
  - Found GIT Tour and LandTour list APIs still had no bounded `take`, with LandTour previously producing multi-MB SSR HTML in page smoke.
  - Added bounded `take` query support to GIT Tour and LandTour list endpoints, defaulting to 100 and capping at 200.
  - Updated `/git-tours` and `/landtours` server page query builders to request `take=100` with existing search/status filters.
  - Strengthened `scripts/test-tour-type-apis.sh` so GIT/LandTour DTOs, controllers, and pages keep bounded list behavior.
  - Verification passed: `bash scripts/test-tour-type-apis.sh`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 FIT Tour SSR/client payload hardening:
  - Found FIT Tour list API still accepted raw `search/status` query values and had no bounded `take`, while the SSR page and client reload could request the full FIT list.
  - Added `ListFitToursQueryDto` with trimmed search, normalized workflow status, default `take=100`, and cap `take=200`.
  - Updated FIT controller/service to pass and apply the validated query object, and updated `/fit-tours` SSR/client reload paths to request `take=100`.
  - Strengthened FIT root/client contracts so bounded list behavior and the new controller/service boundary cannot regress.
  - Verification passed: `bash scripts/test-fit-tour-root-contract.sh`, `node scripts/test-fit-tours-client-contract.js`, `bash scripts/test-tour-type-apis.sh`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 bookings SSR tour-program preload hardening:
  - Found `/bookings` still preloaded tour-program master data without an explicit `take=100`, even though Tour Programs already supports bounded list queries.
  - Updated the bookings server page to request `/tour-programs?take=100` and strengthened the bookings server-page contract to guard the bounded master-list preload.
  - Verification passed: `node scripts/test-bookings-server-page-permissions-contract.js`, `node scripts/test-web-server-api-base-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 quote combo supplier catalog payload hardening:
  - Found Quote Combos SSR preloaded six supplier catalogs without explicit `take=100`, while hotel and typed supplier list DTOs/services did not accept/apply bounded `take`.
  - Added bounded `take` support to hotel and typed supplier list queries/services, sharing the existing default/cap of 100/200.
  - Updated Quote Combos supplier catalog preloads to request `take=100` for hotels, flights, landtour suppliers, attraction tickets, transport, and other suppliers.
  - Strengthened supplier hotel/typed and Quote Combos contracts so catalog preloads and backend list boundaries cannot regress to unbounded payloads.
  - Verification passed: `bash scripts/test-suppliers-hotel-contract.sh`, `bash scripts/test-suppliers-typed-contract.sh`, `node scripts/test-quote-combos-client-contract.js`, `bash scripts/test-suppliers-common-contract.sh`, `node scripts/test-quotes-backend-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 supplier SSR page payload hardening:
  - Found `/suppliers/hotels` and `/suppliers/[type]` server pages still preloaded hotel/typed supplier lists without explicit `take=100`.
  - Updated both supplier SSR pages to request bounded supplier lists and strengthened the supplier typed-page permissions contract to guard this.
  - Verification passed: `node scripts/test-suppliers-typed-page-permissions-contract.js`, `bash scripts/test-suppliers-hotel-contract.sh`, `bash scripts/test-suppliers-typed-contract.sh`, `node scripts/test-web-server-api-base-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Phase 3 quote list payload hardening:
  - Found Quote Tours and Quote Combos list APIs/controllers still accepted raw search values and returned unbounded list payloads.
  - Added `ListQuotesQueryDto` with bounded `take`, defaulting to 100 and capping at 200, then applied it to tour quote and combo quote list services.
  - Updated `/quotes/tours` and `/quotes/combos` SSR preloads plus client reloads to request `take=100`.
  - Strengthened backend and client contracts so quote list DTO/controller/service/page/client boundaries cannot regress to unbounded payloads.
  - Verification passed: `node scripts/test-quotes-backend-contract.js`, `node scripts/test-quote-tours-client-contract.js`, `node scripts/test-quote-combos-client-contract.js`, `node scripts/test-web-server-api-base-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.
