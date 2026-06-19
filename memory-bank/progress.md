# Progress

## Done

- Continued name-first and Vietnamese UI cleanup beyond Finance:
  - Customer table removed the first `Mã` column and now starts directly with the customer name.
  - Workspace page cards and quick actions use Vietnamese labels, and pending receipts show receipt/customer names before codes.
  - Commission report order cells now use the linked order name as the primary label and move order/tour codes to secondary text.
  - Added regression assertions to UX, workspace, and localized dropdown contracts.


- Improved finance table Vietnamese/readability:
  - Changed finance receipt, payment, and invoice list first columns from code-first to name-first display.
  - Added a table-safe finance label helper so voucher/source/payment method cells do not fall back to raw enum codes such as `SUPPLIER_PAYMENT`.
  - Expanded finance client contract coverage for the name-first table columns and localized finance enum cells.


- Fixed English/raw enum labels in finance and shared form dropdowns:
  - Added Vietnamese `viStatus()` mappings for finance receipt/payment types, common order statuses, quotation/order product types, service types, FIT workflow steps, and debt adjustment directions.
  - Strengthened localized-dropdown contract coverage so finance voucher dropdowns cannot regress to raw enum labels such as `SUPPLIER_PAYMENT` or `CUSTOMER_REFUND`.
  - Reran a broad uppercase-enum scan across app forms and confirmed the remaining candidates are already rendered with local Vietnamese labels or are internal literals.


- Clarified Finance Report UI for TourKit import snapshots:
  - Finance order rows now show evidence-based paid amounts as `Theo chung tu` and display imported paid snapshots separately under `Snapshot TourKit`.
  - Added contract coverage so the UI keeps rendering `financeSource`, `snapshotPaidAmount`, and `snapshotPaidCost` instead of hiding the distinction.

- Fixed Finance Report handling for historical TourKit paid snapshots:
  - Finance Report now computes paid/remaining amounts from finance evidence/cashflow instead of treating imported order paid snapshots as actual finance receipts/payments.
  - Historical TourKit snapshot rows keep `snapshotPaidAmount`/`snapshotPaidCost` and are tagged with `financeSource: tourkit_import_snapshot`, but they no longer inflate actionable reconciliation issue counts when no active finance documents exist.
  - Added smoke coverage with a snapshot-only order to prevent regressions.

- Added an order paid snapshot reconciliation guard:
  - Added finance order snapshot audit tooling plus regression coverage for
    actionable receipt/payment mismatches, balanced orders, and TourKit import
    snapshots with paid values but no active finance documents.
  - Production audit classifies the remaining reconciliation drift as 0
    actionable mismatches and 9 historical TourKit import snapshots (5 receipt
    side, 4 payment side). No order snapshots were reset and no synthetic
    finance documents were created.

- Cleaned the final approved zero-amount finance import artifact:
  - Added zero-amount audit/backfill tooling plus regression coverage for
    actionable zero documents, blocked zero documents with side effects,
    dry-run safety, and idempotent apply behavior.
  - Production cleanup soft-deleted approved payment `_18332__NO.1`
    (`59cf81c4-a719-4004-b831-a292d10df38f`), an amount-0 TourKit import
    artifact with no cashflow/ledger/downstream links. A real approved payment
    on the same order/supplier/date already covers the booking cost, so order
    paid snapshots were intentionally left unchanged.
  - Zero-amount audit now reports 0 issues, and finance side-effect guard now
    reports 0 missing receipt/payment cashflow or customer/supplier ledger
    side effects.

- Repaired the remaining actionable receipt-link reconciliation anomaly:
  - Added receipt-link audit/backfill tooling plus regression coverage for
    approved receipts whose document code identifies one booking while their
    receipt-order row and side effects point to another booking/tour.
  - Production repair moved the two approved receipts
    `S2-0626-NBI.012-51_3080_NO.1` and `S2-0626-NBI.012-51_3080_NO.2` from
    `LANDTOUR_92` to booking `S2-0626-NBI.012-51`, updating the receipt
    `tourId`, receipt-order rows, cashflow tour links, and customer-ledger
    order/tour links. Order paid snapshots were intentionally left unchanged.
  - Receipt-link audit now reports 0 issues. Duplicate-import and legacy
    cashflow audits remain at 0. Order reconciliation no longer has any
    `docs_gt_order` drift; remaining drift is historical `order_gt_docs`
    snapshot data without active approved finance documents.

- Repaired duplicate TourKit finance imports and duplicate cashflow reporting:
  - Added duplicate-import audit/backfill tooling with regression coverage for
    canonical-code duplicates, dry-run safety, idempotency, side-effect cleanup,
    and supplier-mismatch duplicates from the second import pass.
  - Production cleanup soft-deleted 3 duplicate finance receipts and 24
    duplicate finance payments while removing side effects attached to those
    duplicate rows only: 54 cashflow entries, 3 customer ledger entries, and 24
    supplier ledger entries.
  - Added legacy-cashflow audit/backfill tooling with regression coverage that
    deletes importer legacy cashflow only when a live-service cashflow row for
    the same approved document already exists, leaving legacy-only rows intact.
  - Production cleanup removed 195 duplicate legacy receipt cashflow rows and
    388 duplicate legacy payment cashflow rows, preventing finance cashflow
    reports from double-counting those imported approved documents.
  - Post-cleanup duplicate-import audit reports 0 duplicates, legacy-cashflow
    audit reports 0 duplicate legacy rows, and finance side-effect audit remains
    at only the known zero-amount approved payment anomaly.
  - Remaining order reconciliation drift is now narrowed to historical import
    gaps plus one `LANDTOUR_92` / `S2-0626-NBI.012-51` receipt-link anomaly for
    a separate targeted repair.

- Added Finance side-effect audit/backfill tooling and repaired production
  approved-document postings:
  - `scripts/finance-side-effect-audit.js` audits approved original finance
    receipts/payments for missing cashflow and customer/supplier ledger side
    effects, provides a failing `guard` mode, and keeps `backfill` dry-run by
    default unless `--apply` is passed.
  - `scripts/test-finance-side-effect-audit.sh` verifies missing side-effect
    detection, company-level no-tour `OTHER` payment cashflow backfill,
    dry-run safety, idempotent apply behavior, and guard pass/fail behavior.
  - Production dry-run found 198 receipt cashflow gaps, 413 payment cashflow
    gaps, no customer ledger gaps, and one supplier ledger gap. Applied
    backfill created 198 receipt cashflow entries and 412 payment cashflow
    entries.
  - Remaining production anomaly is approved supplier payment `_18332__NO.1`
    (`59cf81c4-a719-4004-b831-a292d10df38f`) with amount 0, leaving one payment
    cashflow and one supplier ledger gap intentionally unresolved because live
    finance posting rules reject zero/negative amounts.
  - Refreshed `scripts/test-tour-type-apis.sh` static contract for the current
    validated reports `paymentStatus` mapping and frontend filter controls.

- Fixed FinancePayment company expense vouchers without tour links:
  - `INTERNAL_EXPENSE` and `OTHER` phiếu chi can now be created, approved,
    posted to cashflow, cancelled, and reversed without a Tour/Order/
    OperationVoucher link.
  - Supplier/tour payment flows still require valid tour resolution, preserving
    operation voucher, supplier ledger, and order-cost reconciliation rules.
  - Verified on VPS with `TEST_FINANCE_SERVICE_FLOWS_OK`.

- Closed remaining pre-deploy review findings:
  - Blocked reuse of one approved FinancePayment across operation voucher
    payment histories without row locking and global usage checks.
  - Removed client-controlled tour quote approval actors.
  - Added reports query DTO validation, development-only permissive CORS
    fallback, awaited browser logout, normalized file metadata URL matching,
    stable SmartLink enable behavior, and lockfile audit cleanup.
  - Verified on VPS with targeted regression scripts plus Docker toolchain
    validation and npm audit.

- Completed High C auth/session Phase 2 cleanup:
  - Next proxy no longer turns the browser cookie into an Authorization Bearer
    header for `/auth/me`; it forwards the `smarttour.auth.token` cookie
    directly.
  - Browser smoke scripts now use backend-style HttpOnly cookie setup and no
    longer write/read session tokens through localStorage or document.cookie.
  - Frontend auth cleanup now relies on backend/proxy Set-Cookie clearing;
    browser app code no longer touches `document.cookie` for the auth token.
  - Browser login smoke checks that login sets an HttpOnly auth cookie and that
    a page refresh keeps the authenticated session.
  - Auth regression now explicitly separates browser cookie flow from CLI/API
    Bearer compatibility.
  - Token JSON is intentionally retained for now because CLI and API smoke
    scripts still consume it to run Bearer-authenticated requests.
  - No database schema change, business module change, production deploy, or
    broad UI refactor.

- Completed High C auth/session Phase 1:
  - Auth login/bootstrap/change-password issue the existing session token into a
    backend-set HttpOnly `smarttour.auth.token` cookie with SameSite=Lax,
    path=/, environment-aware Secure, and session-aligned expiry.
  - Logout is public so stale/expired browser sessions can still receive a
    clear-cookie response; valid cookie/header sessions are revoked with the
    audit actor derived from the token.
  - Auth token extraction still supports Bearer for scripts but prefers the
    cookie when both are present.
  - Frontend login/authFetch/logout/security/change-password/finance flows no
    longer read, store, or send `smarttour.auth.token` via localStorage,
    document.cookie token creation, or Authorization Bearer. Only best-effort
    legacy cleanup remains.
  - Added `scripts/test-auth-cookie-session.sh` and expanded auth
    token/guard regressions for cookie precedence and controller Set-Cookie /
    clear-cookie behavior.
  - No database schema change, business module change, frontend deploy, or API
    deploy.
  - Verified on VPS: `TEST_AUTH_COOKIE_SESSION_OK`,
    `TEST_AUTH_TOKEN_EXTRACTION_OK`, `TEST_AUTH_GUARD_BEHAVIOR_OK`,
    `TEST_AUTH_CONTROLLER_PERMISSIONS_OK`, `TEST_AUTH_SESSION_FLOWS_OK`, and
    `docker compose build web`.

- Hardened Commission Reports scope and payment integrity:
  - Approve/reject/revoke/pay controller actions now pass `request.user`; the
    service applies branch/department scope before every mutation and derives
    actors from the authenticated user.
  - Report reads and explicit sync pass the current user into order-to-commission
    synchronization so scoped users cannot create/update out-of-scope reports.
  - Mutations run in transactions with deterministic id ordering and
    `CommissionEntry` row locks. Pay validates resolved amount is positive and
    no greater than the locked row's `remainingAmount`.
  - Regression covers scoped list/summary/grouping/detail, out-of-scope
    mutations, invalid transitions, actor spoofing, overpayment, and concurrent
    double-payment prevention.
  - Verified on VPS with `TEST_COMMISSION_REPORTS_SECURITY_OK`,
    `DATA_SCOPE_AUDIT_OK`, `TEST_LIST_VIEW_PERFORMANCE_OK`,
    `git diff --check`, `docker compose config --quiet`, and
    `docker compose build api`.

- Hardened Finance approval/status write boundary:
  - Receipt, payment, and invoice create/import now force `DRAFT`, derive
    `createdBy` from the request user, and ignore client approval/status/audit
    fields.
  - Ordinary updates cannot change approval/lifecycle status; approve, reject,
    and cancel remain the only transition paths and derive their actors from
    the request user.
  - Finance service regression now covers spoofed create/update audit fields
    and server-derived approve/cancel actors for all three document types.
  - Verified on VPS with `TEST_FINANCE_SERVICE_FLOWS_OK`,
    `TEST_FINANCE_CONTROLLER_PERMISSIONS_OK`,
    `TEST_FINANCE_HELPER_CONTRACTS_OK`, `TEST_FINANCE_RULES_OK`,
    `git diff --check`, and `docker compose build api`.


- Hardened Operations frontend contract:
  - OperationsClient now uses generic supplier data with supplierServices,
    normalized Vietnamese copy, explicit form/payment validation, cancellation
    reason prompt, role-specific action actors, safer amount parsing, clearer
    fetch errors, and lighter post-mutation reloads.
  - Regression locks the generic supplier source, supplierServices include,
    visible copy, payment form/cost validation, cancel reason prompt, action
    actors, and safe money helpers.
  - Verified on VPS with `TEST_OPERATIONS_CONTROLLER_CONTRACT_OK`,
    `docker compose build api web`, api/web deploy,
    `SMOKE_OPERATIONS_BACKEND_OK`, and web /operations auth redirect 307.


- Hardened Operations form/payment request backend behavior:
  - Form search/filter and payment request flows now have stronger validation,
    Vietnamese error coverage for the touched paths, safer child replacement
    parsing, and audit records that include actor/reason context.
  - Repeated create-finance-payment calls for an already linked supplier payment
    request return the current detail instead of creating another finance
    payment; smoke coverage now asserts the same financePaymentId is reused.
  - Verified on VPS with `TEST_OPERATIONS_CONTROLLER_CONTRACT_OK`,
    `docker compose build api`, API deploy, and `SMOKE_OPERATIONS_BACKEND_OK`.


- Hardened Finance frontend/data verification:
  - FinanceClient now has clearer Vietnamese UI copy, branch-aware API load
    errors, action-specific notices, safer approve/reject/cancel confirmations,
    dirty modal protection, CSV/upload feedback, debt overdue summaries, and
    mobile layout hardening for the finance shell.
  - Multipart CSV import for receipts/payments is wired through FileInterceptor
    with CSV type checks and 5 MB limits; the client contract locks the import
    and label behavior.
  - Service-flow regression now covers receipt/payment/invoice amount formulas,
    remaining amounts, ledger balances, cashflow net, order/voucher reconcile,
    cancel reversal netting, failed cancel rollback without orphan side effects,
    and CSV mapping for amounts, dates, branch, and department.
  - Verified on VPS: `TEST_FINANCE_SERVICE_FLOWS_OK`,
    `TEST_FINANCE_CONTROLLER_PERMISSIONS_OK`,
    `TEST_FINANCE_CLIENT_CONTRACT_OK`,
    `TEST_FINANCE_HELPER_CONTRACTS_OK`, `docker compose build api web`,
    api/web deploy, API auth smoke 401, and web auth redirect 307.


- Consolidated Finance helper and rollback behavior:
  - Live receipt/payment/invoice flows now use finance cashflow, ledger,
    order-link, payment-reconciliation, final-state, and import helpers instead
    of keeping divergent private copies in FinanceService.
  - Link validation is scope-aware and repeated before terminal transitions;
    PostgreSQL row locks serialize approve/reject/cancel for each document.
  - Cancellation rolls back when original ledger/reconciliation data is
    missing, and regression verifies no reversal document, cashflow, ledger, or
    status mutation survives the failed transaction.
  - Import is transaction-bound, capped at 5 MB, and approval postings reject
    zero amounts.
  - Verified on VPS with API Docker build and all finance helper/controller/
    rules/service-flow regression suites, followed by API deploy and auth smoke
    401.


- Hardened Finance backend domain/final-state behavior:
  - Finance domain wrapper services are now the controller-facing boundary for
    receipts, payments, invoices, ledger/debt, and cashflow while FinanceService
    remains the shared core implementation.
  - Shared final-state guards block duplicate approve/reject/cancel, deletion
    of terminal records, and amount edits after approval/rejection/cancel.
  - Receipt/payment/invoice partial updates preserve existing financial fields,
    dates, receipt orders, and invoice items unless the payload explicitly
    changes the relevant money/child arrays.
  - Regression now locks controller domain-service injection, finance rules,
    service flows, double-transition rejection, reversal side effects, and
    partial-update preservation.
  - Verified on VPS: `git diff --check`, `docker compose build api`,
    `TEST_FINANCE_CONTROLLER_PERMISSIONS_OK`, `TEST_FINANCE_RULES_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API deploy, and finance API auth smoke 401.



- Locked Tour Guides data/business checks:
  - Guide code generation now uses a longer random suffix and regression checks
    rapid consecutive generation for uniqueness and format.
  - Regression verifies issue/expiry date-only fields, Asia/Bangkok schedule
    parsing, explicit price-book storage without derived amount, and child row
    add/update/delete persistence for cards, documents, costs, and schedules.
  - Verified on VPS: `git diff --check`, `docker compose build api web`,
    `TEST_TOUR_GUIDES_API_OK`, `TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK`, api/web
    deploy, web auth redirect 307, and API auth smoke 401.



- Hardened Tour Guides backend contract:
  - `CreateTourGuideDto` / `UpdateTourGuideDto` now trim and compact language,
    market, skill, card, document, cost service, and schedule payloads with
    Vietnamese validation messages for key root and child fields.
  - Tour guide list search now covers root fields plus languages, markets, and
    skills with accent-insensitive matching; status query validation remains
    explicit.
  - Regression covers list/detail/create/update permissions, duplicate
    code/email/phone, edit detail relation shape, child row preserve/replace/
    clear behavior, empty child row compaction, Vietnamese validation messages,
    and linked order schedule status sync.
  - Verified on VPS: `git diff --check`, API Docker build,
    `TEST_TOUR_GUIDES_API_OK`, `TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK`, API
    deploy, and API auth smoke 401.



- Hardened Tour Guides client/API contract:
  - `TourGuidesClient` now uses fully accented Vietnamese labels, clearer list
    columns, loading/error states, auth-aware reload/detail/save calls, status
    filtering, and safer row controls for guide cards, documents, price-book
    services, and schedules.
  - `TourGuidesService` validation/conflict/not-found messages now use
    Vietnamese wording without ambiguous HDV abbreviations.
  - Regression now locks the Tour Guides API flow plus the client copy/query/
    auth/row-control contract with `TEST_TOUR_GUIDES_API_OK` and
    `TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK`.
  - Verified on VPS: `git diff --check`, `docker compose build api web`,
    Tour Guides regression, api/web deploy, web auth redirect 307, and API auth
    smoke 401.



- Locked LandTour data/business checks:
  - Frontend LandTour now exposes workflowStep in the list and status modal,
    with i18n labels for all backend-supported LandTour workflow steps.
  - Regression verifies `productType = LANDTOUR`, copy-services sales/operation
    preservation, terms VI/EN mapping through common `TourTerm`, detail fields
    (`guideName`, `comboType`, `smartLinkCode`, `confirmationNote`), search
    coverage, and partial update preservation for customers/services/terms.
  - No dedicated LandTour PDF/print flow exists yet; the tested response/common
    terms contract is the stable input for that future exporter.
  - Verified on VPS: web Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, web deploy, LandTour web auth redirect
    307, and LandTour API auth smoke 401.


- Hardened LandTour service behavior:
  - `LandToursService` now has a `prepareLandTourDto` boundary for uppercase
    codes, required Vietnamese errors, status/payment normalization, and
    workflow-step validation.
  - Supplier links are validated before replacing LandTour sales/operation/cost
    children; service statuses, bookingCode, notes, explicit amount, VAT, and
    exchangeRate are regression-covered.
  - Remove is blocked for LandTours with external order/booking/operation/finance
    dependencies; customer mapping avoids fake fallback data; partial VI/EN term
    updates preserve the untouched language.
  - Verified on VPS: api Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API deploy, and LandTour API auth smoke
    401.


- Hardened LandTour controller contract:
  - Added `ListLandToursQueryDto` so list search/status are parsed through a
    focused DTO instead of raw query strings.
  - `copy-services` now rejects missing or same-source payloads with Vietnamese
    messages while staying behind `tour.manage`.
  - Regression covers LandTour `tour.view`/`tour.manage` permissions, list/detail
    response shape, create/update/remove, copy-services, and status query
    normalization.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API deploy, and LandTour API auth smoke 401.


- Added GIT test coverage for API/business contracts:
  - Runtime tests now assert Vietnamese messages for invalid DTO payloads,
    invalid status/workflow, duplicate systemCode, missing detail, copy-services
    source errors, blocked remove, and soft-deleted detail lookup.
  - Existing GIT runtime coverage for list search/status, detail, create/update,
    remove, copy-services, child mapping, and partial update preservation is now
    locked with stricter assertions.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`.

- Locked GIT data/business checks:
  - Workflow steps are aligned across backend validator, frontend options, and
    Vietnamese labels.
  - GIT list/update UI now includes paymentStatus and invoiceStatus, with
    paymentStatus still covered by finance/report filtering.
  - Regression covers copy-services supplier/source preservation, partial
    update child preservation, invoiceStatus create/update, and trimmed
    branch/department/customerSource root fields.
  - Verified on VPS: web Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, web deploy, and GIT web auth redirect
    smoke.


- Locked GIT frontend route/security behavior:
  - `apps/web/app/git-tours/page.tsx` now exposes workflow update, guarded
    copy-services, delete confirmation, action success/error state, and list
    summary metrics while keeping autosave absent until a real GIT client
    wizard exists.
  - `CreateGitTourDto` caps oversized GIT child payloads and attachment
    metadata arrays with explicit exported limits and Vietnamese messages.
  - Regressions guard `tour.view`/`tour.manage` route contracts, GIT frontend
    action surface, oversized child array rejection, and branch/department
    scope for GIT update/remove/copy-services.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, web Docker build, api/web deploy, API
    auth smoke, and web login redirect smoke.


- Hardened GIT DTO validation contract:
  - `CreateGitTourDto` now has Vietnamese messages and clearer rules for
    required identity fields, optional text fields, date strings,
    `commissionRate`, and `exchangeRate`.
  - Empty nested rows are compacted for customers, revenues, services,
    attachments, guides, costs, and survey questions before service mapping;
    explicit `customers` array rows now map into common `TourCustomer` records.
  - Regression covers invalid code/rate/child-array payloads, blank optional
    dates, customers-array mapping, and empty child rows not creating common
    records.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `git diff --check`, API deploy, and GIT
    unauthenticated guard smoke.

- Hardened GIT backend service business rules:
  - `GitToursService.remove()` now rejects delete attempts when a GIT tour has
    external order/booking/operation/finance dependencies, while owned draft
    children remain covered by common Tour soft delete.
  - `GitToursService.number()` now throws Vietnamese validation errors instead
    of coercing invalid numeric input to zero.
  - `TourCoreService` service mappers now store `currency` / `exchangeRate`
    and calculate sales/budget/operation service amounts with exchangeRate
    before VAT; copy-services preserves those fields.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API deploy, and
    `/api/git-tours?status=running` auth smoke.


- Locked GIT backend API controller contract:
  - Regression now verifies route/method surface for `GET /git-tours`,
    `GET /git-tours/:id`, `POST /git-tours`, `PUT /git-tours/:id`,
    `PATCH /git-tours/:id`, `DELETE /git-tours/:id`, and
    `POST /git-tours/:id/copy-services`.
  - Runtime checks cover `tour.view` versus `tour.manage`, `TourStatus` query
    normalization/validation, copy-services body behavior, and list/detail/
    create/update/copy response shapes consumed by the frontend.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`.


- Locked GIT business data checks through backend regression and frontend list contract:
  - Backend regression covers GIT workflowStep, paymentStatus/TourStatus/
    TourServiceStatus normalization, copy-services supplier/service/amount/VAT/
    status preservation, customer/agent mapping, search by systemCode/tourCode/
    customer/operator, and partial update child preservation.
  - Frontend GIT list now exposes search/status filters, sends the same query
    contract to the API, displays workflow/payment status, localizes GIT
    workflow labels, and avoids unclear visible abbreviations.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, web Docker build/deploy, web
    redirect smoke for `/git-tours?search=test&status=running`, and API auth
    smoke for `/api/git-tours?status=running`.


- Expanded GIT module business coverage:
  - GIT create DTO now trims `systemCode`, `tourCode`, and `name`, normalizes
    `status` / `paymentStatus`, and uses Vietnamese messages for required
    identity and numeric validation failures.
  - Added HTTP regression coverage for list search/status, detail relations,
    create/update/remove, duplicate `systemCode`, revenue/service/customer
    child mapping, workflow/status/paymentStatus, missing field and numeric
    validation, partial update preservation, and copy-services supplier/service
    amount/VAT/status preservation for budget and operation rows.
  - Verified on VPS: `TEST_TOUR_TYPE_APIS_OK` and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.


- Packaged Step 1/4 Tour schema cleanup for commit:
  - Re-verified the accumulated schema/DTO/sync/log/legacy-docs changes for
    FIT, GIT, LandTour, and common Tour core.
  - Verified on VPS: `git diff --check`, API Docker build via focused
    regressions, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`.

- Continued legacy decommission and FE/BE mapping lock:
  - FIT legacy child models now carry schema comments identifying snapshot
    ownership and canonical common tables, while `fit_handover_items` remains
    explicitly FIT-owned until a common handover table exists.
  - `docs/tour-migration-notes.md` now documents legacy table decisions,
    read-only status, decommission timing, and FE/BE mapping for FIT, GIT, and
    LandTour response surfaces.
  - Regression guards verify the schema comments and docs sections stay in
    place.

- Continued Step 4 log and flow normalization:
  - `TourCoreService.logAction()` now owns the common log metadata format.
  - Common Tour, FIT, GIT, and LandTour create/update/copy/upload/remove/close
    flows use the standardized logging path; GIT/LandTour copy-services now
    write copy action logs.
  - Copy flows stay focused on the target child groups instead of reusing full
    update aggregates, and remove flows soft-delete the common Tour owner
    rather than hard-deleting product detail rows.
  - Verified on VPS: `git diff --check`, API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_TOUR_TYPE_APIS_OK`.

- Continued Step 1 child sync/map/copy cleanup:
  - Common Tour child replacement now uses a shared `TourCoreService`
    `hasChanges()` / `replaceRows()` pattern.
  - FIT legacy child sync now uses a matching `hasChanges()` /
    `replaceFitChildren()` helper instead of inline per-table delete/create
    blocks.
  - GIT and LandTour child row mapping for customers/services is split into
    focused helpers, and copy-service actions remain behind
    `TourCoreService.copyServicesFromTour()`.
  - Verified on VPS: `git diff --check`, API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_TOUR_TYPE_APIS_OK`.

- Continued Step 1 DTO contract cleanup:
  - FIT, GIT, and LandTour DTOs now expose explicit required create field
    constants alongside root/link/workflow/detail/child grouping constants.
  - Added focused action DTOs for export/copy/upload helper routes so action
    payload fields do not live in the create/update aggregate surface.
  - Regression guards now verify required fields, action field separation, and
    controller action DTO usage.
  - Verified on VPS: `git diff --check`, API Docker build,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_TOUR_TYPE_APIS_OK`.

- Continued Step 1 common tour schema lock:
  - Added a locked common schema section to `docs/tour-migration-notes.md` for
    the shared `Tour` root fields used by FIT, GIT, and LandTour.
  - Classified product detail-only fields versus compatibility aliases and
    legacy snapshots for FIT, GIT, and LandTour.
  - Chốt common child ownership for `tourCustomer`, `tourService`,
    `tourRevenue`, `tourCost`, `tourGuide`, `tourTerm`, `tourAttachment`,
    `tourSurvey`, and `tourLog`, with FIT handover/survey-description gaps
    called out for the next cleanup pass.

- Continued P2 FIT linked-customer data-scope cleanup:
  - FIT `customerId` links are now checked with branch/department data scope
    before snapshot/connect, matching the scoped-link behavior already used by
    bookings and other sensitive modules.
  - Branch-scoped users can link in-scope customers and are rejected when
    creating/updating FIT tours with an out-of-scope customer id.
  - Regression in `scripts/test-data-scope-module-flows.sh` locks the scoped
    create/update customer-link behavior and common `TourCustomer` link.
  - Verified on VPS: API Docker build, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT changed-field child sync and attachment ownership cleanup:
  - `FitToursService.syncTourCoreFromFit()` now passes only changed common child
    groups to `TourCoreService.replaceCommonChildren()` during updates, while
    create still initializes every common child group.
  - FIT attachment metadata is protected from step autosave/full update payloads;
    only the multipart upload flow appends uploaded files after create/import.
  - Backend DTO step fields and frontend step payload fields both exclude
    `attachments` from PRICING autosave.
  - Regression verifies attachment tamper payloads through step save and full
    update do not overwrite uploaded common or legacy attachment metadata.
  - Verified on VPS: API/web Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT export CSV workflow:
  - FIT exports now use a real CSV service path backed by scoped FIT detail and
    the common Tour root id.
  - Added authenticated `GET /api/fit-tours/:id/export` for direct downloads
    while retaining the existing POST export route for compatibility.
  - FIT list actions now include a CSV download button using the new endpoint.
  - Regression verifies export endpoint/static frontend contracts and runtime
    CSV content for common tour root data, budget services, and attachments.
  - Verified on VPS: API/web Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT attachment upload workflow:
  - Added real multipart FIT attachment upload using the existing `FilesService`
    and object storage path `fit-tours/:fitTourId/:workflowStep`.
  - Common `TourAttachment` is now the canonical uploaded file metadata source;
    legacy `FitAttachment` is still written as a compatibility snapshot.
  - FIT wizard file selection now uploads files instead of only appending local
    metadata, then reloads the saved FIT detail so common attachment rows win on
    reads.
  - Regression verifies static upload boundaries and runtime creation of both
    common and legacy attachment metadata with a mocked file service.
  - Verified on VPS: API/web Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT draft/confirm flow separation:
  - Split step persistence into draft save and explicit confirm endpoints.
  - Draft step saves are step-scoped and do not advance workflow; confirm step
    saves reuse the same step field boundary and then advance workflow only by
    the permitted next step.
  - FIT wizard buttons now separate `Lưu nháp` from `Xác nhận bước`, while
    autosave continues to write draft payloads only.
  - Regression verifies static endpoint/frontend contracts plus runtime behavior
    where `saveStep()` does not advance TOUR_INFO/BUDGET but `confirmStep()`
    does.
  - Verified on VPS: API/web Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT wizard step-save contract cleanup:
  - FIT DTOs now declare `FIT_TOUR_STEP_FIELDS` for pricing, tour info,
    budget, operation, handover, and survey step payload boundaries.
  - Added `PATCH /api/fit-tours/:id/steps/:step` and service orchestration that
    filters writes to the active step, prevents workflow regression, and keeps
    wrong-step child arrays from mutating the aggregate.
  - FIT wizard autosave/manual save now sends step-scoped PATCH payloads for
    existing records while new records still use the full create payload.
  - Regression covers static endpoint/frontend contracts and runtime wrong-step
    payload filtering for TOUR_INFO, PRICING, and BUDGET saves.
  - Verified on VPS: API/web Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API/web deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT root-boundary cleanup and LandTour term ownership cleanup:
  - FIT root writes now go through `TourCoreService.createRoot()` /
    `updateRoot()`, keeping order/date-range/root mapping behind the common
    Tour boundary.
  - FIT validation and legacy compatibility fallback text no longer contain
    mojibake strings; regressions guard the root boundary and text fallback.
  - LandTour `termsVi` / `termsEn` now live in common `tour_terms`, with legacy
    detail columns treated as read-only snapshots and response overlay kept for
    current clients.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`,
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API deploy, and `HEALTHCHECK_OK`.

- Continued FIT legacy read-side cleanup:
  - FIT detail/list now prefer common `Tour` root child data for service, guide,
    attachment, and survey response fields while preserving the existing FIT
    response shape consumed by the wizard.
  - Budget/operation service rows are mapped back from common `TourService`
    rows, so stale legacy `fit_budget_services` / `fit_operation_services`
    no longer drive FIT detail or copy source data when common rows exist.
  - FIT list counts for budget/operation services are overlaid from common
    Tour services when available.
  - Regression now intentionally stales legacy FIT service rows and verifies
    detail/copy read from the common Tour root.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and
    `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Tightened P1 finance tour linkage and FIT date contracts:
  - Finance receipts, payments, invoices, approvals, cancellations, and CSV
    imports now require a resolvable common `tourId` and validate linked
    customer/order/supplier/voucher/receipt consistency before writes.
  - Finance file cleanup now removes stored objects through `removeIfPresent()`
    and supports both current download URLs and legacy `/files/...` URLs.
  - Finance reversal rows now preserve branch/department/order/voucher links and
    receipt order allocations so reports and ledgers stay scoped.
  - FIT DTOs now use an explicit `YYYY-MM-DD` date contract, and FIT
    service/legacy compatibility parsing validates real calendar dates with UTC
    date-only construction instead of direct `new Date(text)`.
  - Verified on VPS: API Docker build, `TEST_FINANCE_SERVICE_FLOWS_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_TOUR_TYPE_APIS_OK`, and
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`.

- Normalized common Tour DTO date contract:
  - `CreateTourDto` now uses an explicit `YYYY-MM-DD` regex for root date
    fields instead of `IsDateString()`.
  - Tour-type tests guard the common date pattern and rejected ISO datetime
    payloads for `/api/tours`.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Moved common Tour root writes fully behind TourCore:
  - Common `ToursService` create/update now delegate to
    `TourCoreService.createRoot()` / `updateRoot()` instead of directly calling
    `tx.tour.create()` / `tx.tour.update()` or `toTourData()`.
  - Response shape remains stable by fetching the full include payload after
    the shared root write and log operation.
  - Tour-type tests statically guard the common root write boundary.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Removed duplicate common Tour root mapping from ToursService:
  - Common `ToursService` now relies on `TourCoreService.toTourData()` and the
    shared range helpers instead of keeping a stale private root mapper.
  - Static tour-type tests guard against duplicate root mapping/date parsing
    returning to common `ToursService`.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Normalized Tour date range validation:
  - Tour core now rejects `startDate > endDate` for root create/update writes
    and checks partial updates against existing stored dates.
  - Common ToursService now uses the shared range helpers in addition to
    GIT/LandTour root orchestration.
  - Tour-type regression covers invalid create ranges, invalid partial update
    ranges, and one-day equal start/end dates.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Normalized Tour date validation:
  - Tour core date parsing now requires `YYYY-MM-DD` and rejects non-existent
    calendar dates without timezone drift from JavaScript `Date` parsing.
  - GIT and LandTour DTOs expose explicit date-only regex contracts for
    booking, payment due, start, and end dates.
  - Tour-type tests cover DTO date patterns, rejected ISO datetimes, and
    rejected invalid calendar dates.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Standardized GIT/LandTour DTO field contracts:
  - GIT and LandTour DTOs now export grouped create/update field contracts for
    common root fields, lifecycle status, workflow step, linked/customer data,
    product detail fields, legacy aliases, and child collections.
  - Tour-type tests lock route/itinerary ownership and keep lifecycle
    `status` separate from `workflowStep`.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Centralized common Tour child replacement orchestration:
  - `TourCoreService.replaceCommonChildren()` now owns the replace sequence for
    common customers, revenues, costs, services/suppliers, guides,
    attachments, surveys, and terms.
  - FIT, GIT, and LandTour prepare child payloads and delegate common child
    persistence to Tour core rather than calling individual replace helpers.
  - Static regression tests guard the new boundary for FIT, GIT, and LandTour.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Centralized common service/supplier sync in TourCore:
  - `TourCoreService.replaceServicesAndSuppliers()` now owns the paired
    replacement of `tour_services` and derived `tour_suppliers`.
  - FIT, GIT, and LandTour delegate service/supplier sync to the shared helper.
  - Regression tests guard against product modules calling `replaceServices()`
    or `replaceSuppliers()` directly.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Standardized GIT/LandTour copy-services mapping through TourCore:
  - `TourCoreService.cloneServicesForCopy()` now owns the common
    `tour_services` clone row shape.
  - GIT and LandTour copy actions use the shared helper and no longer inline
    common service mapping.
  - Tour-type API tests cover static boundaries and runtime copy-services for
    both modules.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Began P1 by separating common route from itinerary summary:
  - `CreateGitTourDto` and `CreateLandTourDto` now accept `route` for the
    common `Tour.route` field.
  - GIT/LandTour services prefer `route` for root sync and only fall back to
    `itinerarySummary` for backward compatibility with older clients.
  - GIT detail still owns `itinerarySummary`; LandTour treats
    `itinerarySummary` as a legacy alias because its detail table has no such
    field.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Standardized GIT and LandTour root writes through TourCore:
  - `TourCoreService.createRoot()` now owns common Tour root creation, matching
    the existing `updateRoot()` path.
  - GIT and LandTour create/update transactions now use the shared root
    boundary, then write type-specific detail rows and child collections.
  - Tour-type API tests include static guards against direct root create/update
    calls inside GIT/LandTour services.
  - Verified on VPS: API Docker build, `TEST_TOUR_TYPE_APIS_OK`,
    `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Separated common Tour lifecycle status from workflow-step updates:
  - Generic `workflowStep` writes no longer reset `Tour.status` to
    `UPCOMING`; only modules with an explicit workflow-to-status mapper may
    derive lifecycle status from workflow.
  - FIT declares `allowStatusInput: false` and `allowWorkflowStepInput: false`
    at the Tour core boundary while retaining its `workflowStatus` mapper.
  - Common Tour, GIT, and LandTour tests now assert workflow-step patches
    preserve lifecycle status.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Clarified the FIT DTO contract around the common Tour root:
  - FIT create/update fields are grouped into root, link/customer, workflow,
    FIT detail, and child collection surfaces.
  - `status` and `workflowStep` are no longer accepted DTO fields for FIT and
    are stripped at the service boundary before syncing the common Tour root.
  - Regression coverage locks the DTO field groups and verifies common
    `Tour.status` / `Tour.workflowStep` are derived from FIT workflow rules.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Standardized FIT orchestration helpers:
  - Public FIT create/update/remove/copy methods now delegate to aggregate
    helpers instead of carrying transaction internals inline.
  - Added helper boundaries for create/update preparation, Tour root creation,
    legacy detail writes, action logging, actor resolution, and duplicate-code
    conflicts.
  - Test coverage now locks both the legacy compatibility boundary and the
    orchestration helper boundary.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Isolated FIT legacy child writes behind the compatibility layer:
  - `FitTourLegacyCompatService` now owns legacy child create/sync/copy writes
    and row-shape mapping for FIT common costs, budget services, operation
    services, guides, handover items, survey questions, and attachments.
  - `FitToursService` delegates legacy persistence to compat helpers after
    syncing the common `Tour` root/common children.
  - Added a static test guard so `FitToursService` cannot directly write
    legacy FIT child delegates again.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Continued FIT Tour-root read-side normalization:
  - FIT list/detail now use common `Tour` / `TourCustomer` values as the
    response source for common fields while preserving the existing list
    summary shape.
  - FIT list search now includes common Tour root codes/name and common
    TourCustomer name/phone so stale legacy common fields do not hide rows.
  - Added regression coverage that intentionally stales legacy FIT common
    fields and verifies list/detail still read/search from the common root.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Started the FIT Tour-root P0 refactor from `tour-backend-issues.md`:
  - Confirmed schema already has the common `Tour` root, common child tables,
    and separate `TourStatus` / `FitTourWorkflowStatus` enums.
  - FIT create/update now writes/syncs the common `Tour` root and common child
    rows before writing the legacy FIT detail/child rows.
  - FIT compatibility writes are isolated behind clearer helpers:
    `syncTourRootFromFit`, `syncTourCoreFromFit`, and
    `syncLegacyFitChildren`.
  - `copyBudget()` and `copyOperation()` now keep common `tour_services` and
    derived `tour_suppliers` in sync with legacy FIT copied rows.
  - FIT remove now soft-deletes the common `Tour` root before cancelling the
    legacy FIT workflow detail.
  - Added `scripts/test-fit-tour-root-contract.sh` for FIT create/update,
    copy-budget, copy-operation, and remove behavior against the common
    `Tour` aggregate.
  - Verified on VPS: API Docker build, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`,
    `TEST_TOUR_TYPE_APIS_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

- Hardened Booking DTO and API contract:
  - Added explicit list query DTO validation for search/status/tour-program
    filters and `take`/`skip` bounds.
  - Added a Booking controller contract audit covering route order, methods,
    permissions, and `PATCH` partial-update semantics.
  - Update DTO now preserves omitted fields, rejects `null` for non-nullable
    booking-core fields, allows clearing nullable links/contact/owner fields,
    and keeps status changes isolated to the status endpoint.
  - Response-shape regression tests now lock lightweight list payloads and the
    detail payload used by API consumers.
  - Operational dependencies now lock structural/snapshot fields for operation
    forms, operation vouchers, and allotment locks while allowing owner
    reassignment.
  - Verified on VPS: API Docker build, `TEST_BOOKINGS_CONTROLLER_CONTRACT_OK`,
    `TEST_ROUTE_PERMISSIONS_OK`, `TEST_BOOKINGS_SERVICE_OK`,
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API redeploy, and `HEALTHCHECK_OK`.

- Standardized Booking input normalization:
  - The active Booking web form now applies the backend code contract before
    submission and exposes matching HTML min/max/pattern constraints.
  - Booking code normalization remains trim plus uppercase; spaces,
    diacritics, and unsupported punctuation are rejected.
  - Confirmed DTO/service limits for customer name, owners, phone, and email.
  - Named and documented the intentional `0` default for a missing draft
    `totalSellPrice`; the web form may leave it blank and lets the API own the
    default.
  - Tests cover DTO normalization and an omitted draft price.
  - Verified on VPS: API/web Docker builds and
    `TEST_BOOKINGS_SERVICE_OK`.

- Expanded the Booking authorization test matrix:
  - Covered branch-only, department-only, combined, missing-value, no-scope,
    and unrestricted users.
  - Covered Customer-only, Order-only, Tour-only, cross-relation, and
    no-relation Bookings for list and detail reads.
  - Confirmed combined scope requires one linked row to match both values.
  - Confirmed all explicitly supplied write links must pass scope checks.
  - No production logic change was needed.
  - Verified on VPS: `BOOKING_SCOPE_OK`, `TEST_AUTH_DATA_SCOPE_OK`, and
    `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.

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

- Continued FIT common-root cost cleanup.
- FIT common/hotel/private pricing rows now write tagged common `TourCost.costType` values so the common Tour root preserves both cost group and service type.
- FIT detail now prefers tagged common `TourCost` rows over stale legacy FIT cost tables for `commonCosts`, `hotelCosts`, and `privateCosts`.
- FIT list cost counts now come from tagged common `TourCost` rows when available while keeping the nested Tour root payload hidden.
- Updated FIT root contract regression to stale legacy cost rows and verify common `TourCost` wins.
- Verified on VPS: API Docker build/deploy, `HEALTHCHECK_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P1 common tour copy boundary cleanup.
- Added `TourCoreService.copyServices()` so common service clone and service/supplier replacement are owned by the Tour core boundary.
- Updated GIT and LandTour `copyServices()` actions to delegate to `tourCore.copyServices()` instead of coordinating clone and replace helpers directly.
- Added FIT regression coverage for `copyBudget()` fallback from pricing-only common `TourCost` rows when legacy FIT cost rows are stale.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P1 copy-service source boundary cleanup.
- Added `TourCoreService.copyServicesFromTour()` so source Tour lookup, type filtering, data-scope filtering, clone, and service/supplier replacement are owned by Tour core.
- Updated GIT and LandTour `copyServices()` actions to only validate the target then delegate source lookup/copy orchestration to Tour core.
- Updated tour-type regression to guard against product modules querying source Tour services directly for copy actions.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Started P2 backend cleanup after P1 pass.
- Fixed mojibake Vietnamese messages in `TourCoreService`, `GitToursService`, and FIT required-field validation.
- Restored Vietnamese accents for FIT default handover items and survey questions in both FIT service and legacy compatibility service.
- Added regression guards for mojibake Tour/FIT messages and FIT default handover/survey text.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 service cleanup for FIT defaults.
- Added shared `fit-tour-defaults.ts` for FIT default handover items and survey questions.
- Removed duplicated default handover/survey constants from the main FIT service and legacy compatibility service, and fixed accented fallback text for legacy handover/survey rows.
- Updated FIT root contract regression to require shared defaults and reject duplicated default constants in service files.
- Verified on VPS: `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 FIT copy orchestration cleanup.
- Changed FIT copy-budget/copy-operation to update only common `tour_services` and derived suppliers through `TourCoreService.replaceServicesAndSuppliers`, avoiding a full `syncTourCoreFromFit()` pass for copy actions.
- Updated `mapTourServices()` to return common `TourService` create rows directly, and fixed remaining FIT validation/workflow messages with proper Vietnamese accents.
- Extended FIT root contract regression to reject full common-child sync in copy actions, preserve copied budget rows after copy-operation, and catch mojibake validation messages.
- Verified on VPS: `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 field ownership and legacy-read-only cleanup.
- Documented the common Tour root vs product extension ownership matrix in `docs/tour-migration-notes.md`.
- Marked legacy `GitTourDetail.branch`, `department`, and `customerSource` schema fields as read-only snapshots whose canonical values live on `Tour`.
- Extended tour-type regression guards so GIT/LandTour DTO detail groups and detail mappers cannot reintroduce common root fields.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, and `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 GIT link/customer ownership cleanup.
- Stopped writing `agentName` into `GitTourDetail`; GIT agents now live in common `tour_customers` rows with `customerType = AGENT`.
- Added a response overlay so existing GIT API/UI consumers still receive `gitTour.agentName`, derived from the common agent customer row.
- Marked legacy `GitTourDetail.agentName` as a read-only snapshot in schema comments and migration notes.
- Extended tour-type regression to verify legacy detail `agentName` stays null, the common AGENT customer row is written, list search finds the agent, and list responses keep the primary customer focused.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued P2 LandTour guide ownership cleanup.
- Stopped writing `guideName` into `LandTourDetail`; LandTour guides now live in common `tour_guides` rows with `guideType = LANDTOUR`.
- Added a response overlay so existing LandTour API/UI consumers still receive `landTour.guideName`, derived from the common guide row.
- Reclassified `guideName` into LandTour child/common guide DTO fields and marked legacy `LandTourDetail.guideName` as a read-only snapshot in schema comments and migration notes.
- Extended tour-type regression to verify legacy detail `guideName` stays null, the common LANDTOUR guide row is written, list search finds the guide, and list responses do not expose guide payload just for overlay.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build/deploy, and `HEALTHCHECK_OK`.

- Continued FIT workflow hardening.
- `FitTourWizard` now treats `DRAFT` as the pre-confirm state and opens only the next actionable visible step from `workflowStatus`.
- Step tabs and Previous/Next buttons now use guarded navigation so users cannot jump ahead to unopened workflow steps; blocked attempts show a Vietnamese reason in the wizard status text.
- Added FIT root contract guards for approved workflow order, guarded wizard navigation, and `confirmStep` skip rejection.
- Verified on VPS: `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `docker compose build web`, deployed `web`, and healthchecked `/fit-tours` plus authenticated API route behavior.

- Continued FIT autosave/submit/load hardening.
- Increased FIT autosave debounce to 3000ms and added loaded-tour guards so stale autosave results do not update the wizard after switching tours.
- Normalized save payload number/date/boolean/text/child-row/attachment fields in `preparePayload()`.
- Changed `toFormDefaults()` so saved tours with missing child arrays do not receive new-tour default rows that could later overwrite real data.
- Added invalid-submit feedback for draft save and confirm actions, plus regression guards in `TEST_FIT_TOUR_ROOT_CONTRACT_OK`.
- Verified on VPS: `docker compose build web`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, deployed `web`, and healthchecked `/fit-tours` / `/api/fit-tours`.


- Continued FIT copy/select tour hardening.
- `copyBudget()` now validates that the selected source tour exists in the current FIT dropdown list, rejects stale/same-target sources, and sends the resolved source id only after confirmation.
- `copyOperation()` keeps current-tour budget as the explicit empty-source fallback, but validates selected external sources and clears stale source state after copy/load/reset.
- Loading/resetting a FIT tour now clears copy-source selection and resets blank-tour defaults with a clean autosave signature.
- Verified on VPS: `npm run test:fit-wizard`, `TEST_FIT_TOUR_ROOT_CONTRACT_OK`, `docker compose build web`, deployed `web`, and healthchecked `/fit-tours` plus `/api/fit-tours` auth behavior.


- Hardened `GitToursController` list/query contract.
- Added `ListGitToursQueryDto` for trimmed search, max search length, and Vietnamese `TourStatus` validation/normalization, replacing raw `@Query('status')` handling in the controller.
- Locked controller permissions in regression tests: `tour.view` for list/detail and `tour.manage` for create/update/patch/remove/copy-services; `copy-services` remains a target-tour sub-resource using focused `GitTourCopyServicesDto`.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_ROUTE_PERMISSIONS_OK`, API deploy, and `/api/git-tours?status=running` auth behavior.


- Hardened `GitToursService` data and child-flow contract.
- Added GIT-side normalization/validation for required fields, uppercase codes, lifecycle/payment enums, and workflow steps before calling common `TourCoreService` root writes.
- Expanded GIT list search to include common `route` and GIT detail `holdCode`/`itinerarySummary` while keeping status filtering through validated `TourStatus`.
- Removed fake default GIT customer creation, added supplier/supplier-service validation before child replacement, mapped UI service status strings to `TourServiceStatus`, and made `copyServices()` require an explicit source tour different from the target.
- Verified on VPS: `TEST_TOUR_TYPE_APIS_OK`, `TEST_DATA_SCOPE_MODULE_FLOWS_OK`, API deploy, and `/api/git-tours?status=running` auth behavior.


- Hardened LandTour validation/regression coverage.
- Added service-level duplicate guards for LandTour `systemCode` and `tourCode` on create/update with Vietnamese conflict messages.
- Localized required LandTour DTO messages for `systemCode`, `tourCode`, and `name`, and refreshed the Swagger create example.
- Expanded `scripts/test-tour-type-apis.sh` to cover LandTour list search/status, detail, create/update/remove, copy-services, duplicate codes, customers/services/terms mapping, workflow/status/paymentStatus, and missing/invalid field payloads.
- Verified on VPS: `docker compose build api`, `TEST_TOUR_TYPE_APIS_OK`, and `TEST_DATA_SCOPE_MODULE_FLOWS_OK`.


- Hardened LandTour frontend list/action contract.
- The /landtours page now has search/status filters wired to backend query params, summary metrics for service/term rows, visible payment/workflow status, explicit copy-services modal, and delete confirmation modal.
- LandTour create action now trims/parses form fields and only sends service child arrays when sales/operation service input is present, avoiding empty child rows from default form values.
- LandTour actions now redirect with success/error state so backend Vietnamese messages are visible on create/update/copy/delete failure.
- Extended scripts/test-tour-type-apis.sh static guards for the LandTour frontend contract.
- Verified on VPS: docker compose build web, TEST_TOUR_TYPE_APIS_OK, deployed web, and /landtours auth redirect smoke returned 307 to /login?next=/landtours.

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

- 2026-06-13 Completed High A data-leak and authorization hardening:
  - Replaced predictable quotation SmartLink values with rotating 32-byte random base64url tokens and made the public endpoint return only a cost-safe public projection.
  - Added dedicated cashflow/debt permissions to finance/debt reports and their sensitive CSV exports.
  - Added metadata, parent permission, and branch/department checks to generic file download/delete.
  - Added customer-backed branch/department scope to TourQuote list/detail/create/update/delete/approve/reject/convert and to customer-related TourQuote reads.
  - Added `scripts/test-high-a-data-access.sh` and updated affected quote/report/file smoke expectations.
  - No database schema change and no deployment.
  - Verified: `TEST_HIGH_A_DATA_ACCESS_OK`, API Docker build, `TEST_ROUTE_PERMISSIONS_OK`, and `TEST_FILE_SERVICE_ERROR_FLOWS_OK`.

- 2026-06-13 Completed High B finance workflow and audit actor hardening:
  - Removed commission synchronization writes from all GET/report/export paths while keeping explicit protected sync.
  - Moved operation-voucher paid amount/status updates to approved FinancePayment reconciliation; pending/rejected payments leave debt unchanged and cancel reverses approved settlement.
  - Required approved linked FinancePayments for operation-voucher settlement, added row locking/overpayment guards, and blocked duplicate active payment vouchers.
  - Derived finance/operations/customer audit actors and audit fields from `request.user`, recorded AuditLog `actorId`, and stripped spoofable actor fields from operation audit payloads.
  - Added `scripts/test-high-b-finance-audit.sh` and expanded finance/commission/operation-voucher/customer regression coverage.
  - No schema/frontend/deploy changes.
  - Verified: `TEST_HIGH_B_FINANCE_AUDIT_OK`, `TEST_COMMISSION_REPORTS_SECURITY_OK`, `TEST_OPERATION_VOUCHERS_SERVICE_OK`, `TEST_FINANCE_SERVICE_FLOWS_OK`, API Docker build, and `git diff --check`.
  - Unrelated pre-existing failures remain in operations controller contract supplier-service expectation and customer file MIME-message expectation.

- 2026-06-13 Completed Medium/Low priority pass:
  - Added `npm run verify:toolchain` via `scripts/verify-toolchain-docker.sh` to run npm ci, workspace lint/typecheck, and prisma validate inside Docker while host toolchain remains unsafe to mutate.
  - Removed stale web API URL defaults from Dockerfile/compose and required NEXT_PUBLIC_API_URL for web build/runtime; missing build arg is verified to fail before Next build.
  - Added commission report DTO validation and removed loose commission enum casts from report filters.
  - Fixed reports employee/search filter composition by nesting the employee OR and search OR inside AND groups for order and tour reports.
  - Added commission.export/order.export enforcement, migration `20260613103000_export_permissions`, role grants, security permission catalog labels, and route audit coverage for public logout.
  - Cleaned duplicate Supplier CSS at the end of globals.css and fixed a row-detail indentation-only diff.
  - Verification passed: `docker compose build api web`, `docker compose build api`, `docker compose build web`, `scripts/verify-toolchain-docker.sh`, `scripts/test-route-permissions.sh`, direct compiled ReportsService employee/search contract check, `docker compose config --quiet`, and `git diff --check`.
  - Remaining risk: npm audit during Docker verification still reports one high severity advisory; broader raw Record/as any DTO cleanup remains outside this narrow pass.

- 2026-06-13 Completed reports query validation follow-up:
  - Added focused ReportQueryDto validation across report queries/exports and guarded direct date parsing with BadRequestException before Prisma.
  - Replaced commission groupBy/sortBy free-form strings with explicit enums and validated grouping path params with ParseEnumPipe.
  - Expanded commission security regression coverage for invalid query/path grouping and sorting values.
  - No schema/frontend/deploy changes.
  - Verification passed: TEST_COMMISSION_REPORTS_SECURITY_OK, TEST_HIGH_A_DATA_ACCESS_OK, npm run verify:toolchain, docker compose config --quiet, and git diff --check.

- 2026-06-13 Completed credentialed CORS runtime hardening:
  - Centralized configured CORS origins in runtime-env.ts.
  - Production/staging now fail fast without an explicit origin while development keeps the local permissive fallback.
  - Added regression coverage for missing production/staging origins and valid configured origin startup.
  - No schema/frontend/deploy changes.
  - Verification passed: TEST_AUTH_GUARD_BEHAVIOR_OK, TEST_AUTH_COOKIE_SESSION_OK, npm run verify:toolchain, docker compose config --quiet, and git diff --check.

- 2026-06-13 Completed logout timeout follow-up:
  - Added a 3-second AbortController timeout around the awaited logout request and regression checks for signal/timer cleanup.
  - Confirmed legacy absolute file metadata URLs are already authorized by normalized object key matching and covered by TEST_HIGH_A_DATA_ACCESS_OK.

- 2026-06-13 Completed SmartLink lifecycle and dev audit follow-up:
  - Added regression coverage proving repeated enable preserves an active link and re-enable after disable rotates it.
  - Confirmed package-lock esbuild 0.28.1 and npm lockfile audit with zero vulnerabilities; no dependency change was needed.

- 2026-06-13 Completed report endpoint-specific query validation:
  - Split report query validation into Order, debt, and Tour DTOs while preserving a shared DTO for dynamic export dispatch.
  - Added service-level guards so direct/internal calls and dynamic exports reject incompatible enum/dateField filters with 400 before Prisma; supplier history also rejects unsupported report filters.
  - Added regression coverage for Order/Tour-only types, date fields, invalid statuses, Tour costStatus, debt documentDate, supplier-history ignored filters, and dynamic exports.
  - Updated ReportsClient query construction and controls so finance uses Tour-compatible filters and debt uses `documentDate`.
  - No schema change.
  - Verification passed: `TEST_REPORT_QUERY_VALIDATION_OK`, `TEST_HIGH_A_DATA_ACCESS_OK`, `TEST_ROUTE_PERMISSIONS_OK`, `scripts/verify-toolchain-docker.sh`, Prisma validate, `docker compose config --quiet`, and `git diff --check`.

- 2026-06-13 Completed SmartLink legacy migration guard:
  - Added audit/backfill/guard tooling for active SmartLink tokens that predate the secure 43-character token format.
  - `scripts/deploy-production.sh` and `verify:deploy` now block before deploy if any active SmartLink still has a legacy or missing token.
  - Backfill produces a resend report with old/new public URLs; operators must resend new URLs for rotated quotations.
  - No schema/API/frontend behavior change.
  - Verification passed: `TEST_SMARTLINK_LEGACY_AUDIT_OK`, production DB SmartLink audit/guard with zero active legacy rows, Docker toolchain verification, Prisma validate, API/web build, `docker compose config --quiet`, and `git diff --check`.

- 2026-06-13 Completed operation voucher payment reconciliation follow-up:
  - addPayment now treats approved FinancePayment.paymentAmount as authoritative, rejects mismatched client amounts, and can derive paidAmount when the client omits amount.
  - Payment reconciliation still requires an approved finance payment, checks remaining voucher debt using the authoritative amount, and leaves FinancePayment unlinked if reconciliation is rejected.
  - Added regression coverage for partial use of a 100 payment as 60, server-derived amount, oversized approved payment versus voucher debt, and reuse rejection.
  - No schema/frontend change.
  - Verification passed: `TEST_OPERATION_VOUCHERS_SERVICE_OK`.

- 2026-06-13 Completed runtime CORS origin validation follow-up:
  - Removed NEXT_PUBLIC_API_URL from backend CORS origin discovery and required explicit frontend-origin env vars for production/staging.
  - CORS origin validation now rejects invalid syntax, wildcard, non-http(s), credentials, path, query string, and fragment values before startup.
  - Expanded auth guard/runtime config regression coverage for invalid origins, wildcard rejection, valid origin normalization, and NEXT_PUBLIC_API_URL-only production rejection.
  - No schema/frontend change.
  - Verification passed: `TEST_AUTH_GUARD_BEHAVIOR_OK`, `npm run verify:toolchain`, `docker compose config --quiet`, `git diff --check`, and reviewer check.

- 2026-06-19 Completed finance summary pagination fix:
  - Cashflow totals and by-method summary now use all matching rows, not only the currently returned page.
  - Customer/supplier debt summaries and grouped balance rows now use all matching ledger entries, while detailed `entries` still obey `take` for pagination.
  - Added regression coverage proving `take: '1'` limits returned rows/entries without truncating totals or grouped balances.
  - Verification passed: `TEST_FINANCE_SERVICE_FLOWS_OK`, `TEST_FINANCE_CLIENT_CONTRACT_OK`, `TEST_REPORTS_FINANCE_HYBRID_CONTRACT_OK`, finance guard audits, API Docker build, and `git diff --check`.

- 2026-06-19 Completed finance end-date filter fix:
  - Finance list/date filters now include records throughout the selected `to` date for receipt, payment, invoice, cashflow, customer debt, and supplier debt queries.
  - Added regression coverage for timestamped finance records filtered with same-day `from`/`to` date-only inputs.
  - Verification passed: finance service/client/report tests, report query validation, finance guard audits, API Docker build, and `git diff --check`.

- 2026-06-19 Completed finance debt filter/search fix:
  - Customer/supplier debt endpoints now support the finance `search` query on party name, phone, and code.
  - The Finance debt tab now sends the same filter query as the other finance tabs, so date/search filters apply consistently.
  - Added service and client contract regressions for debt filtering/search behavior. Verification passed: finance service/client/report tests, report query validation, finance guard audits, API/web Docker build, and `git diff --check`.

- 2026-06-19 Completed finance tour-code linking fix:
  - Finance create/update/import paths now resolve visible tour codes to canonical Tour IDs where relevant.
  - Receipt and invoice forms continue using tour code, and the payment form now includes a tour-code field so API validation can succeed without exposing UUIDs.
  - Added service and client contract regressions for tour-code linking behavior. Verification passed: finance service/client/report tests, report query validation, finance guard audits, API/web Docker build, and `git diff --check`.

- 2026-06-19 Completed supplier-payment party validation fix:
  - Supplier-payment vouchers now must link a supplier or operation voucher before creation/update/import can proceed, preventing approved cash outflows that have no supplier ledger party.
  - The general payment form now defaults to `OTHER` instead of `SUPPLIER_PAYMENT`, preserving company expense use cases that are not tied to a tour or supplier.
  - Added/updated service and client contract regressions, including CSV import fixtures with explicit `supplierId` for supplier payments and a legacy draft approval guard case. Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, `git diff --check`, and API/web Docker build.

- 2026-06-19 Completed posted finance document update lock:
  - Finance receipt/payment/invoice update APIs now reject all edits once a document is approved, rejected, or cancelled, preventing document fields from drifting away from already-posted cashflow and ledger entries.
  - Added regression coverage for approved receipt, payment, and invoice note-only updates, alongside existing amount-change guards.
  - Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, and `git diff --check`.

- 2026-06-19 Completed finance query validation hardening:
  - Finance document, cashflow, customer debt, and supplier debt queries now reject invalid date filters with 400 instead of ignoring them or letting invalid Date values reach Prisma.
  - Finance query pagination now requires positive integer `take` values and still caps valid requests at 2000 rows.
  - Regression coverage was added for invalid date and pagination inputs. Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, `git diff --check`, and API Docker build.

- 2026-06-19 Completed finance numeric input validation hardening:
  - Manual finance receipt, payment, and invoice paths now reject negative and non-numeric numeric values instead of storing negative money or silently converting invalid input to zero.
  - Zero-value draft documents remain allowed, with posting still blocked by existing cashflow/ledger guards.
  - Regression coverage was added for negative receipt/payment/invoice values and non-numeric receipt totals. Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, `git diff --check`, and API Docker build.

- 2026-06-19 Completed finance manual enum/date validation hardening:
  - Manual finance receipt/payment/invoice writes now validate enum fields and write dates before persistence, preventing Prisma validation errors and silent date drops.
  - Added focused regressions for invalid receipt type, invalid payment method, and invalid invoice date. Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, `git diff --check`, and API Docker build.

- 2026-06-19 Completed finance receipt allocation validation:
  - Receipt booking allocation rows now must sum to the receipt amount before create/update/import/approve/cancel can proceed, preventing booking revenue reconciliation from diverging from cashflow and customer ledger postings.
  - Added a regression for mismatched receipt allocation versus `receiptAmount`. Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, `git diff --check`, and API Docker build.

- 2026-06-19 Completed finance total amount consistency validation:
  - Manual receipt writes now reject `totalAmount` values below `paidBefore + receiptAmount`, preventing documents that report less total debt/revenue than the amount already collected.
  - Manual payment writes now reject `totalAmount` values below `paymentAmount`, aligning manual paths with import validation and preserving coherent voucher totals.
  - Added focused regressions for invalid receipt/payment totals. Verification passed: finance service/client/helper/rule/permission/report tests, finance guard audits, `git diff --check`, and API Docker build.

- 2026-06-19 Completed Tour nested numeric validation hardening:
  - Common Tour child mappers now reject negative numeric values instead of storing negative service/revenue/cost amounts through GIT/LandTour payloads.
  - Added a Tour type API regression for a negative GIT budget service unit price, covering the service-level path that DTO validation cannot inspect because child arrays are `unknown[]`.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, `TEST_TOURKIT_ORDERS_TOUR_SYNC_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build. Known residual: `test-fit-tour-root-contract.sh` currently fails on an outdated FilesService source-name assertion, not on the Tour numeric change.

- 2026-06-19 Completed common Tour delete dependency guard:
  - The generic Tour delete endpoint now blocks soft-delete when a tour has a linked order, booking, operation voucher/form, finance document/cashflow entry, or legacy payment/receipt/expense relation.
  - Added regression coverage for the previous bypass where a GIT tour linked to an Order was blocked by `/git-tours/:id` but could still be cancelled/deleted through `/tours/:id`.
  - Verification passed: `TEST_TOUR_TYPE_APIS_OK`, `TEST_TOURKIT_ORDERS_TOUR_SYNC_OK`, `TEST_BOOKINGS_SERVICE_OK`, `TEST_OPERATIONS_SERVICE_FLOWS_OK`, `git diff --check`, and API Docker build.

- 2026-06-19 Completed Tour child zero-defaulting validation:
  - Common Tour service/revenue mappers no longer convert explicit `0` quantity or exchange-rate inputs into default `1` values.
  - Quantity and exchange-rate fields that drive Tour child amount calculations now require values greater than zero when supplied, preventing silent positive revenue/cost generation from zero input.
  - Added regression coverage for the previous GIT budget-service `quantity: 0` bypass. Verification passed: Tour type API, TourKit order-to-tour sync, bookings service, operations service flows, `git diff --check`, and API Docker build.

- 2026-06-19 Completed Tour child unit-price alias preservation:
  - Common Tour service mappers now preserve explicit zero unit-price inputs instead of falling through to legacy alias fields.
  - Added regression coverage for GIT budget services where `unitPrice: 0` previously could be overwritten by `budgetUnitPrice` and create a positive amount.
  - Verification passed: Tour type API, TourKit order-to-tour sync, bookings service, operations service flows, `git diff --check`, and API Docker build.

- 2026-06-19 Completed Tour child explicit zero-amount preservation:
  - Common Tour revenue/service amount mappers now preserve explicit `amount: 0` overrides instead of recalculating positive amounts from unit price formulas.
  - Added regression coverage for GIT budget services where a zero amount override previously produced a positive `budgetAmount`.
  - Verification passed: Tour type API, TourKit order-to-tour sync, bookings service, operations service flows, `git diff --check`, and API Docker build.

- 2026-06-19 Completed Tour child cost amount alias preservation:
  - Common Tour cost rows now preserve explicit `amount: 0` instead of falling through to `expectedAmount` aliases.
  - Added regression coverage for GIT cost rows where zero amount input previously became a positive expected cost when an alias was present.
  - Verification passed: Tour type API, TourKit order-to-tour sync, bookings service, operations service flows, `git diff --check`, and API Docker build.

- 2026-06-19 Completed FIT upload contract audit unblock:
  - Updated the FIT root contract test to check the current FilesService upload allowlist guard instead of obsolete denied-list variable names.
  - This was a test-only change; production upload filtering already used `allowedExtensions`, `allowedMimeTypes`, and `assertAllowedUpload(file)`.
  - Verification passed: FIT root contract, Tour type API, bookings service, operations service flows, `git diff --check`, and API Docker build.

- 2026-06-19 Completed FIT explicit zero amount preservation:
  - FIT common cost and budget service mappers now preserve explicit `amount: 0` instead of recalculating a positive amount from formula fields.
  - Added root contract coverage to verify zero amounts remain consistent in FIT detail rows and common TourCost/TourService sync rows.

- 2026-06-19 Completed FIT remove dependency guard:
  - FIT-specific remove now blocks soft-delete when the linked common Tour has order, booking, operation, finance, or legacy payment dependencies, closing the bypass around the common Tour delete guard.
  - Added FIT root contract coverage for an order-linked FIT tour removal attempt.

- 2026-06-19 Completed FIT child zero-multiplier validation:
  - FIT cost/service child rows now reject zero values for calculation drivers such as quantity, pax-per-room, times, exchange-rate, and service quantity instead of silently defaulting or persisting impossible rows.
  - Added FIT root contract coverage for zero cost multipliers and zero budget service quantities.

- 2026-06-19 Completed FIT handover quantity validation:
  - FIT handover items now reject zero quantities instead of defaulting explicit zero input to one.
  - Added FIT root contract coverage for the handover quantity guard.

- 2026-06-19 Completed finance invoice quantity validation:
  - Manual finance invoices now reject item `quantity: 0` instead of treating it as quantity one.
  - Added finance service coverage for the zero-quantity invoice item guard.

- 2026-06-19 Completed order exchange-rate validation:
  - Order create/update mapping now rejects explicit zero/non-positive exchange rates instead of defaulting them to one.
  - Added order service coverage for the zero exchange-rate guard.
