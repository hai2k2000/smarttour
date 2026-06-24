# Progress

- Hardened PostgreSQL backup temporary file cleanup:
  - Added an exit trap to `scripts/backup-postgres.sh` so partial `smarttour-*.sql.gz.tmp` files are removed when backup creation fails before the final move.
  - Extended the backup artifact permission contract and backup/reinstall runbook so tmp cleanup is guarded alongside backup artifact mode checks.

- Hardened disaster backup checksum verification before sync:
  - `scripts/disaster-backup.sh` now runs `sha256sum -c "$archive.sha256"` after creating the disaster archive and before cleanup/offsite upload.
  - Extended the backup offsite contract and backup/reinstall runbook so disaster archive sync cannot upload an unverified archive/checksum pair.

- Hardened offsite backup SSH key permissions:
  - `scripts/sync-latest-backup.sh` and `scripts/disaster-backup.sh` now abort before SCP when the configured remote key is missing or not mode `600`.
  - Extended the backup offsite contract and backup/reinstall runbook so offsite sync key permissions are enforced by automation rather than only documented.

- Hardened offsite PostgreSQL backup sync checksum handling:
  - `scripts/sync-latest-backup.sh` now chmods the checksum file private and runs `sha256sum -c "$checksum"` before uploading backup artifacts.
  - Extended the backup offsite contract and backup/reinstall runbook so offsite sync cannot upload an unverified local dump/checksum pair.

- Hardened ops environment file permissions:
  - Added `/etc/default/smarttour-ops` mode/owner verification to `scripts/security-audit.sh`, emitting `OK_OPS_ENV_FILE` only for `600 root:root`.
  - Updated `scripts/install-ops-schedule.sh` to normalize the ops environment file owner/mode even when the file already exists.
  - Updated the security runbook and production readiness tracker so healthcheck/offsite backup configuration permissions are part of standard security evidence.

- Added live security audit coverage for backup permissions:
  - `scripts/security-audit.sh` now verifies PostgreSQL and disaster backup directories are `700 root:root` and backup artifacts/checksums are not group/world-readable.
  - `OK_BACKUP_PERMS` is now guarded by the security audit contract and documented in the security runbook and production readiness tracker.

- Hardened backup artifact permissions:
  - Added `umask 077` plus explicit `chmod 700` backup directory handling and `chmod 600` artifact/checksum handling to PostgreSQL and disaster backup scripts.
  - Added `scripts/test-backup-artifact-permissions-contract.js`, `npm run test:backup-artifact-permissions`, and CI/source-contract wiring.
  - Updated the backup/reinstall runbook and production readiness tracker with normalization commands for existing backup files.

- Hardened production `.env` file permissions:
  - Added `.env` mode/owner verification to `scripts/security-audit.sh`, emitting `OK_ENV_FILE` only for `600 root:root`.
  - Updated `scripts/install-security-hardening.sh` to normalize `/opt/smarttour/.env` to mode `600` when present.
  - Updated the security runbook and production readiness tracker so `.env` permissions are part of the standard security evidence.

- Hardened restore drill database target safety:
  - Added `DRILL_DB` validation to `scripts/restore-drill-postgres.sh` so protected production/system databases and unsafe names abort before any `dropdb` call.
  - Added `scripts/test-restore-drill-safety-contract.js`, `npm run test:restore-drill-safety`, and CI/source-contract wiring.
  - Updated the backup/reinstall runbook and production readiness tracker with the restore drill database-name guard.

- Hardened production rollback documentation:
  - Replaced the production rollback runbook's preview/deferred checkout flow with a named rollback branch flow that deploys through `scripts/deploy-production.sh`.
  - Added explicit `BAD_COMMIT`, `GOOD_COMMIT`, `ROLLBACK_BRANCH`, deploy trace expectation, migration status, dependency audit, healthcheck, and security audit steps.
  - Added `scripts/test-rollback-runbook-contract.js`, `npm run test:rollback-runbook`, and CI/source-contract wiring.

- Hardened production deploy traceability:
  - Added `DEPLOY_START` and `DEPLOY_REVISION` logs to expose the branch, starting commit, and post-sync target commit during production deploys.
  - Added ordered `DEPLOY_PHASE` logs for SmartLink guard, Prisma migrations, Docker build, Docker up, and healthcheck so failed deploy output identifies the blocked step.
  - Extended deploy contracts, the GitHub Actions runbook, and the production readiness tracker to keep the trace markers from regressing.

- Hardened production deploy migration execution:
  - Added `npx prisma migrate deploy` to `scripts/deploy-production.sh` after the SmartLink guard and before Docker build/up.
  - Added a deploy phase log line for Prisma migrations and extended deploy contracts/docs to prevent this step from being dropped.

- Hardened production deploy dirty override accountability:
  - Required `DEPLOY_DIRTY_REASON` whenever `ALLOW_DIRTY=true` is used on the server.
  - Logged the dirty deploy reason before continuing so emergency deploys leave operator intent in command output.
  - Extended deploy contracts and docs to keep this override guard from regressing.

- Hardened production deploy clean-worktree checks:
  - Added an untracked-file guard to `scripts/deploy-production.sh` so production deploy requires a fully clean VPS worktree by default.
  - Extended the GitHub Actions deploy contract and runbook to guard/document the untracked-file abort behavior.
  - Verified the guard with an isolated temporary git repository that aborts before deploy steps when `leftover.tmp` is untracked.

- Hardened production deploy input validation:
  - Added workflow validation for manual dispatch branch, repo path, site URL, and API URL before SSH starts.
  - Added server-side branch validation in `scripts/deploy-production.sh` before git commands run.
  - Extended the GitHub Actions contract/runbook and production readiness tracker with the validated-input deploy behavior.

- Hardened GitHub production deploy SSH behavior:
  - Added bounded `ssh-keyscan` and non-interactive SSH timeout/server-alive options to the manual production deploy workflow.
  - Extended the GitHub Actions contract and runbook so deploy SSH cannot regress to prompt-prone or long-hanging defaults.
  - Updated the production readiness tracker while keeping the remaining GitHub secrets/environment approval as a manual owner task.

- Hardened observability ops environment template:
  - Added contract coverage requiring `HEALTHCHECK_WEBHOOK_*` settings in the `/etc/default/smarttour-ops` template.
  - Added commented webhook URL, connect timeout, max time, and retry settings to `scripts/install-ops-schedule.sh`.
  - Updated observability docs and tracker so alert configuration remains visible after reinstall/setup.

- Hardened operations schedule documentation:
  - Replaced stale cron references in production readiness tracking with the actual systemd timers installed by `scripts/install-ops-schedule.sh`.
  - Added explicit timer names to backup/reinstall and security runbooks.
  - Added `scripts/test-ops-schedule-docs-contract.js`, `npm run test:ops-schedule-docs`, and CI coverage.

- Normalized the live file smoke command:
  - Added `npm run smoke:files` for `scripts/smoke-files.sh`.
  - Added `smoke:files` to `smoke:all` so deploy verification covers file upload/download/delete flows alongside other live smoke suites.
  - Added `scripts/test-smoke-files-command-contract.js`, `npm run test:smoke-files-command`, and CI coverage to keep package scripts aligned with the production readiness tracker.

- Hardened production security audit SSH permission coverage:
  - Added live checks for `/`, `/root/.ssh`, and `/root/.ssh/authorized_keys` ownership/mode to `scripts/security-audit.sh`.
  - Made `scripts/install-security-hardening.sh` normalize those permissions before reloading SSH hardening.
  - Added `scripts/test-security-audit-contract.js`, `npm run test:security-audit`, and CI coverage.
  - Updated the security runbook and production readiness tracker with the new `OK_ROOT_MODE`/`OK_SSH_PERMS` evidence.

- Hardened backup/restore offsite sync operations:
  - Added non-interactive SCP and bounded SSH timeout settings to PostgreSQL backup sync and full disaster archive sync paths.
  - Documented both off-VPS backup targets in the operations reinstall runbook and `/etc/default/smarttour-ops` template.
  - Added `scripts/test-backup-offsite-contract.js`, `npm run test:backup-offsite`, and CI coverage so backup sync hardening stays guarded.
  - Updated production readiness Backup/Restore Operations to `ready-for-manual` until the external storage target is chosen and manually validated.

- Hardened healthcheck webhook alerting:
  - Added bounded timeout/retry controls and a JSON-escaped structured `smarttour_healthcheck_failed` webhook payload to `scripts/healthcheck.sh`.
  - Added `docs/observability-alerting-runbook.md` and `scripts/test-observability-alerting-contract.js`.
  - Wired the observability alerting contract into `SmartTour CI` and updated production readiness Observability status to `ready-for-manual` until an external alert target is configured.
  - Verified webhook failure handling with an unreachable local webhook and normal `scripts/healthcheck.sh`.


- Wired GitHub Actions CI/CD scaffolding:
  - Added `SmartTour CI` for PR/push verification with lockfile install, audit, source contracts, typechecks, and API/Web Docker builds.
  - Added manual-only `SmartTour Production Deploy` workflow that uses SSH secrets and delegates deploy execution to `scripts/deploy-production.sh` on the VPS.
  - Added `docs/github-actions-runbook.md` and `scripts/test-github-actions-contract.js` so workflow triggers, deploy safety, secrets, and runbook coverage are guarded.
  - Updated production readiness CI/CD status to `ready-for-manual` until GitHub production environment approvals and secrets are configured.


- Completed remaining native XLSX export coverage:
  - Moved the dependency-free XLSX helper to common API code and added CSV-to-XLSX conversion for existing export outputs.
  - Added `format=xlsx` support for Finance invoices/cashflow, Reports, Commission Reports, Order Center, Customers, and FIT tour export while keeping CSV as the default.
  - Added `scripts/test-native-xlsx-export-contract.js` and expanded `scripts/smoke-exports.sh` for workbook MIME/ZIP magic checks across the remaining export families.
  - Added retry handling to `scripts/smoke-exports.sh` after repeated API restart-window curl resets during deploy verification.
  - Verified with native/finance XLSX contracts, finance helper and service flows, query DTO contract, `npm audit --omit=dev`, Docker API build/deploy, expanded export smoke, finance XLSX import endpoint smoke, and production healthcheck.
  - Updated production readiness Import/Export Files status to `ready-for-manual` for Excel/business validation.

## Done

- Hardened Finance XLSX import/export readiness:
  - Added native XLSX workbook generation/parsing for Finance receipt/payment flows without introducing external workbook dependencies.
  - Kept CSV as the default export format and added `format=xlsx` for receipt/payment exports.
  - Extended finance import to accept `.xlsx` files through the same row validation and transactional draft creation path as CSV/JSON rows.
  - Verified with `node scripts/test-finance-xlsx-contract.js`, `bash scripts/test-finance-helper-contracts.sh`, Docker API build/deploy, XLSX helper runtime round-trip, `bash scripts/smoke-exports.sh`, and an endpoint XLSX import parser smoke.

- Corrected the Phase 4 review remediation conclusion:
  - Updated `docs/code-review-2026-06-13.md` so the final conclusion matches the 2026-06-23 remediation status table.
  - The doc now separates completed code-review remediation from remaining production readiness/manual validation tracked in `docs/production-readiness-tracker.md`.
  - Verified the closure with `npm run verify:deploy` using a temporary smoke admin account, then confirmed that account was removed.

- Closed the Phase 4 review remediation status loop:
  - Re-ran the remaining Medium/Low regression coverage for SmartLink legacy tokens, runtime CORS origin validation, report query DTO validation, and Docker `npm ci` reproducibility.
  - Updated `docs/code-review-2026-06-13.md` with a 2026-06-23 remediation status table for every High/Medium/Low finding.
  - Verification passed: `bash scripts/test-smartlink-legacy-audit.sh`, `bash scripts/test-auth-guard-behavior.sh`, `bash scripts/test-report-query-validation.sh`, and `node scripts/test-dockerfile-npm-ci-contract.js`.

- Hardened Phase 4 QuoteCombo data scope:
  - Added `branch` and `department` ownership fields plus indexes to `QuoteCombo`, with migration `20260623192000_quote_combo_data_scope`.
  - Passed `request.user` through QuoteCombo controller routes and applied branch/department scope in list/detail/write/action service paths.
  - Persisted creator branch/department on new combo quotes so scoped users can only access matching combo quote data.
  - Extended quotes backend contract and quotations smoke coverage for scoped QuoteCombo isolation across list, detail, update, recalculate, create-quote, and create-order paths.

- Hardened Phase 4 quotation workflow trust boundaries:
  - Removed direct `status`, direct `smartLinkEnabled`, and client-supplied `actor` from quotation create/update/action DTO contracts.
  - Forced quotation creation to `DRAFT` with SmartLink disabled and removed workflow-state writes from create/update `toData()`.
  - Changed submit/approve/reject/convert logs to derive actor from `request.user`.
  - Updated quotes backend contract and quotations smoke coverage for ignored workflow fields and actor-spoof prevention.

- Hardened Phase 4 commission sync workflow safety:
  - Limited `CommissionReportsService.syncFromOrders()` updates to existing commission entries that remain `PENDING` and `UNPAID`.
  - Preserved approved/partial/paid/rejected/revoked commission entries during order resync so paid amounts, remaining amounts, and audit workflow state are not overwritten.
  - Extended `scripts/test-commission-reports-security.sh` to prove pending unpaid rows still resync while approved partially paid rows stay unchanged.
  - Verified with the commission security regression red/green and Docker API build.

- Hardened Phase 4 Docker build reproducibility:
  - Replaced `npm install` with `npm ci` in both API and Web production Dockerfiles.
  - Added `scripts/test-dockerfile-npm-ci-contract.js` so Dockerfiles must stay lockfile-driven and cannot regress to `npm install`.
  - Verified the contract red/green and rebuilt both API and Web Docker images successfully with `npm ci`.

- Extracted the Phase 4 reports CSV helper:
  - Moved pure report CSV escaping/BOM formatting into `apps/api/src/modules/reports/report-csv.ts`.
  - Updated `ReportsService.exportCsv()` to delegate to `toReportCsv`, reducing low-level helper code inside the oversized reports service without changing export behavior.
  - Added `scripts/test-reports-csv-helper-contract.js` to guard the extraction and the absence of private CSV helper methods on `ReportsService`.
  - Verified with the CSV helper contract, reports finance hybrid contract, report query validation, reports business-rules smoke, Docker API build/deploy, error/OpenAPI/correlation runtime smokes, and production healthcheck.

- Hardened Phase 4 correlation runtime smoke coverage:
  - Added `scripts/smoke-correlation-id.sh` plus `scripts/test-correlation-id-smoke-contract.js`.
  - Verified live `x-correlation-id` behavior for safe, unsafe, and missing incoming IDs.
  - Verified a validation failure request writes a structured `request_failed` log line with the safe correlation ID and without sensitive field names.
  - Added retry handling for the smoke's `/auth/me` probes so deploy restart windows do not create false 502 failures.
  - Verified with Phase 4 contracts, correlation/error/OpenAPI runtime smokes, Docker API build/deploy, and production healthcheck.

- Hardened Phase 4 runtime smoke coverage:
  - Upgraded `scripts/smoke-swagger-action-status.js` so it reads `scripts/test-action-endpoint-status-contract.js`, resolves controller routes from source, and validates every guarded action endpoint in OpenAPI.
  - Added parser coverage for multi-controller files such as suppliers, preventing smoke false positives from using the wrong controller prefix.
  - Added `scripts/smoke-error-response-shape.js` plus `scripts/test-error-response-smoke-contract.js` to verify live 401 and validation 400 response shape, correlation IDs, stable codes, path/method/timestamp fields, and no obvious secret/token leakage.
  - Verified with Phase 4 contracts, OpenAPI action smoke, error response smoke, Docker API build/deploy, and production healthcheck.

- Hardened Auth session action status codes and OpenAPI smoke coverage:
  - Added Auth login, logout, and change-password to `scripts/test-action-endpoint-status-contract.js`.
  - Added explicit `@HttpCode(200)` to those Auth session endpoints while leaving create/bootstrap resource semantics untouched.
  - Added reusable `scripts/smoke-swagger-action-status.js` and `scripts/test-swagger-action-status-smoke-contract.js`; the smoke validates action endpoints expose `200` and not `201` in `/docs-json`.
  - Made the Swagger smoke retry and validate JSON content-type/status before parsing so deploy restart windows are handled cleanly.
  - Verified with source contracts, Docker API build/deploy, Swagger smoke, data-scope verification, and production healthcheck.

- Completed another Phase 4 action/DTO/healthcheck pass:
  - Extended `scripts/test-action-endpoint-status-contract.js` to guard operation-voucher payment actions, tour close, FIT export/confirm/copy actions, and GIT/Land copy-services actions.
  - Added explicit `@HttpCode(200)` to those action/export endpoints, keeping create/import/upload resource endpoints on their default create semantics.
  - Added `QuotationSmartLinkDto` plus `scripts/test-quotations-smartlink-dto-contract.js`; `QuotationsController.smartLink` no longer uses raw `@Body('enabled')`.
  - Added `scripts/test-healthcheck-log-filter-contract.js` and filtered expected structured 4xx `request_failed` logs in `scripts/healthcheck.sh` so validation/RBAC smoke runs do not fail healthcheck while 5xx/error logs still surface.
  - Verified with Phase 4 contracts, Docker API build/deploy, data-scope verification, Swagger action-status smoke, and production healthcheck.

- Hardened Files controller DTO contracts:
  - Added `FileUploadBodyDto` and `FileObjectKeyQueryDto` for upload scope, download key, and delete key inputs.
  - Replaced raw `@Body('scope')` and `@Query('key')` usage in `FilesController`.
  - Replaced `response: any` with Node `ServerResponse` for file downloads without adding Express type dependencies.
  - Added `scripts/test-files-controller-contract.js`; verified with the contract and Docker API build.

- Hardened remaining Phase 4 controller query/body contracts:
  - Added `ListToursQueryDto` and `CloseTourDto`; Tours list and close endpoints no longer use raw query parameters or inline body types.
  - Added Customers, Finance, and Order Center query DTOs and updated those controllers to remove the remaining `@Query() Record<string, string>` signatures.
  - Added `scripts/test-tours-dto-contract.js` and `scripts/test-query-dto-contract.js` to guard the controller contract hardening.
  - Confirmed controller audit is clean for `Record<string, unknown>` bodies, inline object body DTOs, and loose query record signatures.
  - Kept larger Suppliers/Reports/Operations service splitting deferred because Phase 4 only allows service splits where behavior is already tightly protected and the extraction target is genuinely small.

- Hardened Phase 4 database indexes for high-volume paths:
  - Added `scripts/test-prisma-index-contract.js` to require composite indexes that match current list/search/report query patterns.
  - Added and deployed migration `20260623170000_phase4_performance_indexes`.
  - Covered active order/booking/voucher lists, finance documents and cashflow, customer CRM/profile rows, customer/supplier ledgers, operation forms/tasks/costs/payment requests, suppliers, quotations, and tour quotes.
  - Verified with the index contract, Prisma schema validation, and Prisma migration deploy.
  - Deferred oversized service splits and generated API client work because Phase 4 requires protected behavior before refactors, and DTO contracts are still stabilizing beyond the currently hardened controllers.

- Added safe structured logging and correlation IDs for Phase 4:
  - Added `apps/api/src/correlation-id.middleware.ts` and `apps/api/src/request-logging.interceptor.ts`, registered globally in `main.ts`.
  - Responses now carry `x-correlation-id`, and API request logs are structured without request body/header/credential data.
  - Added `scripts/test-logging-correlation-contract.js` to guard registration and no-sensitive-field logging behavior.
  - Verified with the logging/correlation contract and Docker API build.

- Standardized API error response shape for Phase 4:
  - Added `apps/api/src/http-error-response.filter.ts` and registered it globally in `main.ts`.
  - Extended `validation-exception.factory.ts` with `messages` and `code: VALIDATION_ERROR` while preserving the existing `message` field.
  - Added `scripts/test-error-response-contract.js` to guard the response shape and no-secret/no-body-logging behavior.
  - Verified with the error response contract and Docker API build.

- Hardened Customers controller DTO contracts for Phase 4:
  - Added `apps/api/src/modules/customers/dto/customer-body.dto.ts` and `scripts/test-customers-dto-contract.js`.
  - Replaced Customers controller `Record<string, unknown>` request bodies across config, bulk, import, customer profile, merge/owner, comment, care, call, and opportunity endpoints.
  - Preserved existing CustomersService validation for required create fields, nested rows, data-scope writes, imports, merge side effects, and linked business data.
  - Verified with Customers DTO contract, Customers service flows, Customers API flows, and the API build.

- Hardened Finance controller DTO contracts for Phase 4:
  - Added `apps/api/src/modules/finance/dto/finance-body.dto.ts` and `scripts/test-finance-dto-contract.js`.
  - Replaced Finance controller `Record<string, unknown>` request bodies for receipt/payment/invoice writes, imports, workflow actions, and debt adjustments.
  - Preserved existing FinanceService parsing and business validation for amount allocation, linked tours/orders, final-state locks, imports, cashflow, and ledger side effects.
  - Verified with Finance DTO/controller/helper contracts, Finance service flows, action endpoint status contract, and the API build.

- Hardened Operations controller DTO contracts for Phase 4:
  - Added `apps/api/src/modules/operations/dto/operation-body.dto.ts` and `scripts/test-operations-dto-contract.js`.
  - Replaced Operations controller `Record<string, unknown>` request bodies with explicit DTO classes while keeping existing service-level validation for nested rows.
  - Covered operation form, supplier payment request, payment request action, and finance-payment action bodies.
  - Verified with Operations DTO/controller/status contracts, Operations service flows, and the API build.

- Hardened Auth controller DTO contracts for Phase 4:
  - Added `apps/api/src/modules/auth/dto/auth.dto.ts` and `scripts/test-auth-dto-contract.js`.
  - Replaced Auth controller `Record<string, unknown>` request bodies with explicit DTO classes for login/bootstrap/session password change and user/role management.
  - Preserved existing AuthService validation, scope enforcement, auditing, and session behavior.
  - Verified with Auth DTO/controller/cookie/session/service contracts and the API build.

- Started Phase 4 action endpoint status-code hardening:
  - Added `scripts/test-action-endpoint-status-contract.js` to guard explicit `@HttpCode(200)` on action/status endpoints.
  - Added explicit 200 responses to action endpoints in bookings, operations, suppliers, orders, quotes, quotations, commission reports, and finance workflow controllers.
  - Updated the Operations controller contract to recognize the existing `SUPPLIER_SERVICE_ORDER_BY` deterministic supplier-service ordering.
  - Verified with focused controller contracts and the API build.

- Completed Phase 3 final verification hardening:
  - Updated data-scope audit/module-flow fixtures after bounded DTO list signatures replaced older string-search service calls.
  - Added migration `20260623140000_restore_system_roles` to restore baseline system roles and RBAC/data-scope permissions when a database has drifted to empty roles after earlier migrations.
  - Restored due-date aging accuracy for finance customer/supplier debt grouped rows while preserving database grouped balance calculations and bounded row payloads.
  - Made supplier service row ordering deterministic across create/detail/list responses by ordering service includes by `createdAt`, `sku`, and `id`.
  - Verified with data-scope/RBAC, supplier, finance, self-seeding Phase 3 smoke, admin-required workflow/file/UI smoke, API Docker deploy, and export smoke.

- Hardened finance CSV export completeness:
  - Finance receipt, payment, invoice, and cashflow exports now query all matching scoped rows directly instead of reusing capped list payloads.
  - Preserved the existing filters, sort order, and data-scope behavior for exported rows.
  - Strengthened finance helper contracts so CSV exports cannot regress to `take: 1000`/`2000` list-based truncation.

- Hardened revenue/profit grouped report rows:
  - Revenue and profit rows now use scoped database order `groupBy` aggregates instead of capped order-list grouping.
  - The shared order grouped-row helper now covers all supported report groups, including date fields, agency, department, market, employee, branch, and type.
  - Strengthened report query validation and reran reports business-rules smoke across every revenue group key.

- Hardened business and employee grouped report rows:
  - Business summary grouped rows for type, branch, and employee now come from scoped database order `groupBy` aggregates instead of capped order rows.
  - Employee performance rows now use database grouped employee aggregates and keep derived average/order paid-ratio fields.
  - Finance report paid/remaining summary fields now use approved finance evidence totals instead of imported order paid snapshots.
  - Strengthened report query validation and reran the reports business-rules smoke covering TourKit snapshot handling.

- Hardened reports debt grouped row accuracy:
  - Customer-debt and supplier-debt report rows now calculate grouped balances with scoped database ledger `groupBy` queries instead of capped ledger-entry payload reductions.
  - Rows still expose the fields used by reports/workspace/finance views, with exact grouped balances and bounded display code enrichment.
  - Strengthened report query validation coverage so debt report rows cannot regress to grouping capped `entries`.

- Hardened hybrid finance report order summary accuracy:
  - Replaced finance summary order financial totals from capped grouped display rows with scoped database order aggregates.
  - Replaced finance summary `orderCount` from `orderRows.length` with a scoped database count.
  - Strengthened report query validation coverage so finance summary order metrics cannot regress to capped `grouped.summary` or `orderRows.length`.

- Hardened hybrid finance report order-filter correctness:
  - Receipt, payment, and cashflow report queries now apply order-only filters through linked order relations instead of relying on `orderIds` from capped display orders.
  - Finance summaries and cashflow charts keep database count/groupBy behavior while respecting filters such as order type, order status, payment status, and cost status.
  - Strengthened report query validation coverage with captured Prisma `where` assertions so finance document filters cannot regress to capped-order scoping.

- Hardened report overview charts:
  - Overview `byType` and `byMonth` chart rows now use scoped database order `groupBy` aggregates instead of capped display orders.
  - Overview metrics no longer load capped order rows for summary/count/chart calculations.
  - Strengthened report query validation coverage so these overview charts cannot regress to bounded-row `groupOrders(orders, ...)`.

- Hardened hybrid finance report monthly cashflow chart:
  - `cashflowByMonth` now uses scoped database `groupBy` over cashflow payment date and entry type instead of capped cashflow display rows.
  - Cashflow row payloads remain bounded, while monthly chart totals reflect the aggregated matching dataset.
  - Strengthened report query validation coverage so the chart cannot regress to `cashflowByMonth(cashflowRows)`.

- Hardened revenue/profit report summaries:
  - Revenue and profit endpoints now return summary totals from scoped database order aggregates instead of the capped `groupOrders()` order list.
  - Group rows stay bounded for payload safety, while summary totals use the full matching dataset with the same normalized group date field.
  - Strengthened report query validation coverage so these summaries cannot regress to capped-row group summaries.

- Hardened report overview customer and supplier-debt counts:
  - Overview `totalCustomers` now uses scoped database order grouping for the existing phone/email/name/order-id identity rules instead of capped display orders.
  - Overview `supplierDebtCount` now uses scoped supplier ledger groupBy balance sums instead of capped supplier-debt rows.
  - Strengthened report query validation coverage so these overview counts cannot regress to bounded-row calculations.

- Hardened hybrid finance report summaries:
  - Receipt/payment counts and cashflow totals now use scoped database `count` and cashflow `groupBy` queries instead of capped report display rows.
  - Finance report row payloads stay bounded, but summary totals now reflect the full scoped matching dataset.
  - Strengthened report query validation coverage so finance summaries cannot regress to `cashflowSummary(cashflowRows)` or capped row counts.

- Hardened finance debt grouped row payloads:
  - Customer and supplier debt grouped rows now use scoped database ledger `groupBy` helpers instead of loading every matching ledger entry into the API process.
  - The detailed ledger `entries` payload stays bounded by `take`, and grouped rows are capped after balance sorting.
  - Strengthened finance helper contracts so debt rows cannot regress to full-ledger `summaryEntries` loads.

- Hardened reports debt summary accuracy:
  - Customer-debt and supplier-debt report summaries now use scoped database ledger groupBy helpers instead of deriving totals from capped report rows.
  - Strengthened report query validation coverage so debt summaries cannot regress to capped-row summary helpers.

- Hardened customer debt summary accuracy:
  - Customer profile debt totals now use scoped database order aggregates instead of reducing the capped related-order row set.
  - Strengthened customer service coverage so debt summaries cannot regress to bounded-row reductions.

- Hardened finance debt summary payloads:
  - Customer and supplier debt summary totals now use scoped database aggregate/count helpers instead of reducing full ledger row sets.
  - Strengthened finance helper contracts so debt summaries cannot regress to full-row summary reductions.

- Hardened report overview count accuracy:
  - Overview counts for total orders, unpaid revenue orders, unpaid cost orders, and settled orders now use scoped database counts instead of the capped display row set.
  - Strengthened report query validation coverage so overview counts cannot regress to `orders.length` or bounded-row filters.

- Hardened order report summary accuracy:
  - Business summary and employee performance report totals now use scoped database order aggregates instead of summing the capped display row set.
  - Strengthened report query validation coverage so these summaries cannot regress to `summary(orders)` from bounded report rows.

- Hardened commission report summary/grouping payloads:
  - Replaced commission report list/summary/grouping full-row loads with scoped database `aggregate` and `groupBy` helpers.
  - Strengthened commission report contracts so summary and grouping cannot regress to loading all matching commission entries into the API process.

- Hardened finance cashflow summary payload:
  - Replaced cashflow summary full-row loads with scoped database `groupBy` amount sums by entry type and payment method.
  - Strengthened finance helper contracts so cashflow summaries cannot regress to loading all matching cashflow rows into the API process.

- Hardened finance list summary payloads:
  - Replaced receipt, payment, and invoice summary full-row loads with scoped database `count` and `_sum` aggregate helpers.
  - Strengthened finance helper contracts so list summaries cannot regress to loading all matching finance rows into the API process.

- Hardened quotation dashboard payload:
  - Replaced the legacy quotation dashboard's full-quotation `findMany`/in-memory reduction with scoped database `count` and `_sum` aggregate queries.
  - Strengthened quote backend coverage so quotation dashboard metrics cannot regress to loading all matching quotations into the API process.

- Hardened Order Center dashboard payload:
  - Replaced the dashboard's full-order `findMany`/in-memory reduction with scoped database `count` and `_sum` aggregate queries.
  - Strengthened the Order Center contract so dashboard metrics cannot regress to loading all matching orders into the API process.

- Hardened Operations supplier catalog payload:
  - Updated Operations static catalog loading to request `/api/suppliers?take=100` while preserving the generic supplier source required by operation forms/payment requests.
  - Strengthened the Operations contract so supplier catalog loading cannot regress to an implicit unbounded/default request or hotel-only supplier source.

- Hardened FIT supplier catalog preload:
  - Updated `/fit-tours` SSR supplier preload to request `/suppliers?take=100` for manage users.
  - Added FIT contract coverage so supplier catalog preloads stay explicitly bounded.

- Hardened operation-voucher SSR list payload:
  - Updated `/operation-vouchers` SSR preload to request `take=100`, aligning the first render with the already bounded client reload/backend list behavior.
  - Added contract coverage so the page cannot regress to an unbounded operation-voucher preload.

- Hardened Order Center list payloads:
  - Updated `/order-center` SSR preload to request compact bounded rows with `compact=true&take=100`.
  - Updated Order Center client reload to keep dashboard queries separate while always bounding/compacting the list request.
  - Added contract assertions for the bounded/compact Order Center SSR and client list calls.

- Hardened typed order list payloads:
  - Added a validated bounded query DTO for `/api/orders/:type` and made the service apply a defensive `take` default/cap.
  - Preserved existing service test callers that pass search as a string while routing controller requests through the DTO.
  - Updated `/orders/[type]` SSR preload and client reload to request `take=100`, with contract coverage for the backend and web list calls.

- Hardened tour-guide list payloads:
  - Added a validated bounded query DTO for `/api/tour-guides` and made the service apply a defensive default/cap.
  - Preserved Vietnamese accent-insensitive guide search with a bounded scan before filtering/slicing results.
  - Updated `/tour-guides` SSR preload and client reload to request `take=100`, with contract coverage for the backend and web list calls.

- Hardened legacy quotation list payloads:
  - Added a validated bounded query DTO for `/api/quotations` and made the service apply a defensive `take` default/cap.
  - Updated `/quotations` SSR preload and client reload to request `take=100`.
  - Added contract assertions for the bounded quotation backend and web list calls.

- Aligned file/upload smoke coverage with current API contracts:
  - `smoke-files.sh` now uses an allowed generated text fixture, current FIT attachment endpoints, and finance documents that satisfy hardened tour-link rules.
  - Re-ran the remaining admin-live smoke group with temporary admin credentials: `SMOKE_EXPORTS_OK`, `SMOKE_FILES_OK`, `SMOKE_OPERATIONS_BACKEND_OK`, `SMOKE_QUOTES_QUOTATIONS_OK`, and `SMOKE_UI_PAGES_OK`.
  - Verified no temporary admin users/roles remained and healthcheck stayed green.


- Aligned admin-live smoke scripts with current finance/tour workflow contracts:
  - `smoke-finance-cancellations.sh` and `smoke-finance-reports.sh` now create valid linked tours for tour-payment, supplier-payment, and invoice flows.
  - `smoke-business-workflows.sh` now adds the required tour-program itinerary day before booking creation and uses the current operation-voucher finance payment lifecycle.
  - Verified live with temporary admin credentials: `SMOKE_FINANCE_CANCELLATIONS_OK`, `SMOKE_FINANCE_REPORTS_OK`, and `SMOKE_BUSINESS_OK`; temporary admin users/roles were cleaned up afterward.


- Refreshed customer service file-upload regression coverage:
  - Split customer file validation assertions into extension rejection, MIME rejection, size metadata mismatch, and actual oversized file cases to match the shared file service.
  - Re-ran the remaining deep service/API tests after the customer regression fix; no runtime application code changed in this pass.

- Aligned core workflow smoke with order lifecycle permissions:
  - Updated `smoke-core-business-workflows.sh` so order paid values are edited separately from status transitions.
  - Verified the corrected smoke against the live API and continued non-admin smoke coverage across reports, UX/export, suppliers, and TourKit imports.
  - Admin-password live smokes remain gated by `ADMIN_PASSWORD`; no runtime application code changed in this pass.

- Cleaned hotel allotment dashboard status bucketing:
  - Made the dashboard derive status buckets from explicit sellable state so stop-sell or sold-out inventory cannot be counted as active/COD-locked.
  - Refreshed hotel supplier UI and allotment contracts after the required-field indicator cleanup, including Playwright label lookups without manual `*` markers.
  - Re-ran the full hotel supplier suite plus focused backend, RBAC, finance audit, supplier, quote, and UI contracts before redeploying the API.

- Standardized hotel supplier required-field indicators:
  - Removed manual `*` markers from hotel supplier core field labels and dynamic service/allotment row labels.
  - Updated hotel supplier contract coverage to require native `required` attributes, Vietnamese validation messages, and no legacy manual required stars.
  - Regenerated the Prisma client on the VPS after TypeScript verification exposed stale generated Booking types for the existing `deletedAt` schema field.

- Hardened Operations client permission readiness:
  - `OperationsClient` now waits for permission readiness before loading static booking/supplier catalogs or dashboard/forms/payment-request lists.
  - Operations protected UI is hidden without operation view access, reload/list paths fail closed, and create/reload actions stay disabled until permissions are ready.
  - Extended operations contract coverage and confirmed the repo-wide scans for server preloads and client permission readiness are clean.

- Hardened typed supplier pages and clients:
  - `/suppliers/hotels` and `/suppliers/[type]` now read the current session first, gate supplier preloads behind `supplier.view`, and show server-side permission notices instead of protected content when access is missing.
  - Hotel and generic supplier clients wait for permission readiness, clear initial rows without view access, and disable reload/filter controls before protected API calls.
  - Added `scripts/test-suppliers-typed-page-permissions-contract.js` and refreshed supplier contracts for name-first typed supplier tables and visible required hotel fields.

- Hardened FIT Tours page/client RBAC:
  - Server page reads the current session first, gates FIT tour preloads behind `tour.view`, and gates supplier catalog preloads behind `tour.manage`.
  - Server page now renders a permission notice instead of protected FIT workspace content when view access is missing.
  - Client waits for permission readiness, clears any server-provided rows without view access, and fail-closes reload/search controls before API calls.
  - Strengthened FIT contracts to guard server preload gating and the current wizard mutation-disabled contract.

- Continued Phase 1 remediation from the saved review plan:
  - Booking delete has been converted from hard delete to soft delete with `Booking.deletedAt`, active-row filters on list/detail/mutations/deleteGuard, retained dependency guards, and `AuditLog` tracing for soft-delete actions.
  - Auth bootstrap/login/change-password public responses no longer return `token` or `tokenType`; controllers still issue the existing HttpOnly auth cookie for browser sessions.
  - Public API/security regression scripts now assert token JSON is absent and use cookie-derived sessions where needed.
- Started Phase 1 remediation from the saved review plan:
  - Tour-guide APIs and guide file authorization now enforce branch/department data scope via linked schedule order/tour records.
  - Operation voucher payment history now has a database uniqueness invariant on `paymentVoucherId` to prevent the same approved finance payment from being recorded twice.
  - Quotation convert now locks the quotation row and is idempotent for repeated/concurrent convert requests.
  - Added regression coverage in tour guide API, High-A data access, and operation voucher service tests.
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

- 2026-06-19 Completed quote exchange-rate validation:
  - Tour Quote create/update mapping now rejects explicit zero/non-positive exchange rates instead of defaulting them to one.
  - Added High-A data access coverage for the zero exchange-rate guard.

- 2026-06-19 Completed quote combo positive-count validation:
  - Combo quote items now reject explicit zero/non-positive night and pax counts instead of silently clamping them to one.
  - Added High-A data access coverage for zero combo night count.

- 2026-06-19 Completed quotation exchange-rate validation:
  - Legacy quotation create/update now rejects explicit zero/non-positive exchange rates instead of treating them as one.
  - Added High-A data access coverage for the zero quotation exchange-rate guard.

- 2026-06-19 Completed quotation item positive-count validation:
  - Legacy quotation service lines now reject explicit zero/non-positive quantity, night count, and pax count instead of storing invalid zero lines.
  - Added High-A data access coverage for all three zero-count guards.


- 2026-06-19 Completed order child positive-count validation:
  - Orders now reject explicit zero/non-positive sales quantity, sales service count, operation quantity, and handover quantity for meaningful rows.
  - Hotel booking zero-quantity operation lines are rejected instead of being saved without allotment locks.
  - Added order service regression coverage for the invalid child row guards.


- 2026-06-19 Completed Tour Quote cost multiplier validation:
  - Tour Quote cost rows now reject explicit zero/non-positive quantity, service count, pax-per-room, and exchange rate instead of storing collapsed zero-cost multipliers.
  - Quote smoke coverage now guards zero quantity/service count/exchange rate API behavior.
  - Order detail/edit/copy responses now return sales and operation child rows sorted by `sortOrder`, preventing converted quote/order lines from appearing in unstable order.


- 2026-06-19 Completed Reports tour P&L zero fallback fix:
  - Tour P&L report helpers now honor explicit zero `actualAmount` and `confirmedAmount` instead of falling back to expected/budget amounts.
  - Reports finance hybrid contract now guards against reintroducing `actual > 0` and truthy `confirmedAmount || budgetAmount` fallbacks.


- 2026-06-19 Completed FIT root detail actual-zero fallback fix:
  - FIT detail cost groups now preserve explicit zero actual amounts instead of falling back to expected amounts.
  - FIT root contract now guards the explicit-zero actual amount behavior.


- 2026-06-19 Completed FIT legacy truthy fallback cleanup:
  - Legacy FIT common/hotel/handover mappers now preserve explicit zero times, exchange rate, and quantity values rather than defaulting them to one.
  - FIT root cost bridge now preserves explicit zero exchange rates through nullish fallback.
  - FIT root contract now guards against reintroducing these truthy fallback patterns.

- 2026-06-19 Completed upload dependency audit fix:
  - Added npm overrides for transitive `multer@2.2.0` and `js-yaml@4.2.0` to clear upload/Swagger DoS audit findings without breaking Nest/Swagger major versions.
  - Updated `package-lock.json` with the patched resolved packages and verified `npm audit --omit=dev` now reports zero vulnerabilities.
  - Verification passed: `./scripts/security-audit.sh` and `docker compose build --no-cache api`.

- 2026-06-22 Completed Phase 2 order update status guard:
  - Orders normal update now rejects lifecycle `status` fields instead of silently bypassing action services.
  - Regression coverage added in order service flows and Orders API contract; the API test now authenticates with the backend-issued session cookie.
  - Verification passed: `scripts/test-order-service-flows.sh`, `scripts/test-orders-api.sh`, `npx prisma validate --schema prisma/schema.prisma`, and `git diff --check`.

- 2026-06-22 Completed Phase 2 order status transition matrix:
  - Order lifecycle status changes now validate the current status and target status per order type instead of only checking whether the target status exists for that type.
  - Added regression coverage proving draft orders cannot jump directly to completed and that invalid transitions leave the stored status unchanged.
  - Verification passed: `scripts/test-order-service-flows.sh` and `scripts/test-orders-api.sh`.

- 2026-06-22 Completed Phase 2 operation form status action guard:
  - Operation form `updateForm` no longer mutates lifecycle status; status updates are routed through `changeFormStatus` and `POST /operations/forms/:id/status`.
  - The action service validates transitions, blocks cancellation through the generic status route, and writes STATUS audit entries.
  - Verification passed: `scripts/test-operations-service-flows.sh`, `scripts/test-operations-controller-contract.sh`, `npx prisma validate --schema prisma/schema.prisma`, `git diff --check`, and API Docker build.

- 2026-06-22 Completed Phase 2 quotation approved immutability:
  - Legacy quotations in `APPROVED` status are no longer editable through normal update; material edits must happen before approval or through a future revision workflow.
  - Regression coverage now guards approved quotation immutability and conversion idempotency remains covered.
  - Verification passed: `scripts/test-high-a-data-access.sh`, `bash scripts/smoke-quotes-quotations.sh`, `node scripts/test-quotations-client-contract.js`, `node scripts/test-quotes-backend-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `git diff --check`, and API Docker build.

- 2026-06-22 Completed Phase 2 booking operation-form dependency hardening:
  - Booking status changes to OPERATING now require a linked operation form that is already IN_PROGRESS or DONE, not just present and non-cancelled.
  - Regression coverage guards the pending-operation-form rejection and the valid in-progress transition path.
  - Verification passed: scripts/test-bookings-service.sh, scripts/test-bookings-controller-contract.sh, npx prisma validate --schema prisma/schema.prisma, git diff --check, and API Docker build.

- 2026-06-22 Completed Phase 2 action permission hardening:
  - Orders lifecycle status, settlement, and unlock endpoints now require dedicated permissions instead of order.manage.
  - Quote, legacy quotation, and commission approval endpoints now require dedicated approve permissions instead of broad manage permissions.
  - Added migration 20260622153000_order_action_permissions to grant the new action permissions to super_admin and added regression coverage for the controller/API contracts.
  - Verification passed: scripts/test-orders-controller-permissions.sh, scripts/test-orders-api.sh, node scripts/test-quotes-backend-contract.js, scripts/test-commission-reports-security.sh, npx prisma validate --schema prisma/schema.prisma, git diff --check, and API Docker build.

- 2026-06-22 Completed Phase 3 frontend lifecycle contract alignment:
  - Orders UI now sends normal edits without lifecycle status and calls the dedicated status endpoint only when status changes.
  - Orders settlement/unlock/status controls and quote/quotation approval controls now honor the dedicated action permissions introduced in Phase 2.
  - Tour Quote update payloads are explicitly whitelisted instead of spreading full form data into PUT requests.
  - Verification passed: scripts/test-orders-ui-auth-contract.sh, node scripts/test-quote-tours-client-contract.js, node scripts/test-quotations-client-contract.js, node scripts/test-quotes-backend-contract.js, node scripts/test-web-server-api-base-contract.js, npm run build -w @smarttour/web, and git diff --check.

- 2026-06-22 Completed Phase 3 frontend RBAC catalog and action confirmation hardening:
  - Security role editing now exposes and labels the dedicated action permissions introduced in Phase 2.
  - Commission approval UI now honors commission.approve, and sensitive order/quote/quotation/commission actions require user confirmation before posting.
  - Added regression coverage for commission client permissions/confirmations and strengthened existing frontend contracts.
  - Verification passed: node scripts/test-role-permission-contract.js, scripts/test-security-ui-contract.sh, node scripts/test-commission-reports-client-contract.js, scripts/test-orders-ui-auth-contract.sh, node scripts/test-quote-tours-client-contract.js, node scripts/test-quotations-client-contract.js, node scripts/test-quotes-backend-contract.js, npm run build -w @smarttour/web, and git diff --check.

- 2026-06-22 Completed Phase 3 commission reports list UX hardening:
  - Commission Reports list now sends an explicit `take=100`, checks list API failures, shows loading/error/empty states, and handles sync API failures instead of silently reloading stale data.
  - Added contract coverage in `scripts/test-commission-reports-client-contract.js` for the new list UX and API-contract behavior.
  - Verification passed: `node scripts/test-commission-reports-client-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 finance list take/empty-state hardening:
  - Finance list queries now include `take=100`, aligning the frontend with backend list limits across receipt, payment, invoice, cashflow, and debt loads.
  - Cashflow now renders an empty table row when no approved cashflow entries match the filters.
  - Verification passed: `scripts/test-finance-client-contract.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 operation vouchers frontend permission/payment hardening:
  - Operation Vouchers create/save controls now require `operation.form.manage`; payment input/action requires `operation.payment-request.create`; handlers also fail closed when permission is missing.
  - Reload now requests `take=100`, and recording a payment requires explicit confirmation before posting the money movement.
  - Verification passed: `node scripts/test-operation-vouchers-client-contract.js`, `node scripts/test-required-fields-ui-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 operations workflow confirmation/list take hardening:
  - Operations list queries now include `take=100` for both operation forms and supplier payment requests.
  - Supplier payment request submit/approve/reject/create-finance-payment actions and finance payment approval now require confirmation before posting.
  - Verification passed: `scripts/test-operations-controller-contract.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 GIT/LandTour numeric validation hardening:
  - GIT and LandTour create actions no longer silently fallback invalid numeric inputs; they validate quantity, VAT, commission rate, and exchange rate before posting to the API.
  - Added `scripts/test-tour-pages-number-validation-contract.js` to guard against reintroducing invalid-number fallback behavior.
  - Verification passed: `node scripts/test-tour-pages-number-validation-contract.js`, `scripts/test-tour-type-apis.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 supplier list name-first cleanup:
  - Generic supplier tables now use a name-first primary column and keep supplier code as secondary traceability text, matching the previously established table readability convention.
  - Strengthened supplier client contract so generic supplier lists cannot regress to a separate code-first column, while hotel supplier lists remain name-first.
  - Verification passed: `bash scripts/test-suppliers-client-contract.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 operation voucher numeric validation hardening:
  - Operation voucher frontend validation now matches backend bounds for service detail quantity, NET price, VAT percentage, and payment amount input constraints.
  - Strengthened `scripts/test-operation-vouchers-client-contract.js` so the UI cannot regress to accepting zero quantity, negative prices, VAT over 100%, or negative payment input.
  - Verification passed: `node scripts/test-operation-vouchers-client-contract.js`, `node scripts/test-required-fields-ui-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 orders numeric validation hardening:
  - Orders frontend validation now matches backend minimum bounds for sales items, operation items, itinerary days, handover quantities, passenger/seat counts, and paid receipt/cost snapshots.
  - Dynamic order table number inputs now expose min constraints, including day number minimum 1, while root passenger/seat/paid amount inputs expose non-negative minimums.
  - Strengthened `scripts/test-orders-ui-auth-contract.sh` to guard these frontend/backend validation boundaries.
  - Verification passed: `bash scripts/test-orders-ui-auth-contract.sh`, `node scripts/test-required-fields-ui-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 tour guide frontend permission and numeric validation hardening:
  - Tour Guides client now uses `PermissionNotice`/`usePermissions`, hides content without `guide.view`, and disables/fail-closes create/edit/save actions without `guide.manage`.
  - Tour guide cost service NET and selling prices now match backend non-negative validation in the frontend schema and number inputs.
  - Added `scripts/test-tour-guides-client-contract.js` to guard Tour Guides permission rendering and numeric validation boundaries.
  - Verification passed: `node scripts/test-tour-guides-client-contract.js`, `node scripts/test-required-fields-ui-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- Phase 3 FIT tour RBAC frontend hardening completed: list content is gated by `tour.view`, create/edit and wizard mutations are gated by `tour.manage`, export is gated by `tour.export`, and `scripts/test-fit-tours-client-contract.js` covers these contracts.

- Phase 3 server-rendered tour page RBAC hardening completed: GIT Tour, LandTour, and Tour Programs now gate content with `tour.view`, hide mutation/action forms behind `tour.manage`, and are covered by `scripts/test-tour-server-pages-permissions-contract.js`.

- Phase 3 booking page RBAC hardening completed: the server-rendered booking page now gates content with `booking.view`, hides mutation/status/delete forms behind `booking.manage`, and is covered by `scripts/test-bookings-server-page-permissions-contract.js`.

- Phase 3 supplier overview RBAC hardening completed: the server-rendered supplier page now gates content with `supplier.view`, hides mutation forms behind `supplier.manage`, and is covered by `scripts/test-suppliers-server-page-permissions-contract.js`.

- 2026-06-22 Completed Phase 3 reports RBAC hardening:
  - Reports server page now reads /auth/me first, gates report content behind report.view, and avoids loading report data when report.view is missing.
  - Reports client now hides/blocks finance reports without finance.cashflow.view, debt reports without finance.debt.view, and CSV export without report.export.
  - Added scripts/test-reports-permissions-contract.js to guard the server/client RBAC contract.
  - Verification passed: node scripts/test-reports-permissions-contract.js, bash scripts/test-reports-finance-hybrid-contract.sh, npm run build -w @smarttour/web, and git diff --check.

- 2026-06-22 Completed Phase 3 order center RBAC hardening:
  - Order Center server page now reads /auth/me first, gates dashboard/list content behind order.view, and avoids loading order data when order.view is missing.
  - Order Center client now receives canExportOrders from the server page, hides the CSV export button without order.export, and fail-closes the export handler.
  - Added scripts/test-order-center-permissions-contract.js to guard the Order Center RBAC contract.
  - Verification passed: node scripts/test-order-center-permissions-contract.js, bash scripts/test-orders-ui-auth-contract.sh, npm run build -w @smarttour/web, and git diff --check.

- 2026-06-22 Completed Phase 3 workspace data permission hardening:
  - Workspace data now reads /auth/me before protected dashboard fetches and gates report, finance, order, operation, quotation, receipt, and payment data by their backend permissions.
  - Workspace Overview now gates report/product/market/order/operation data before calling the underlying APIs.
  - Added scripts/test-workspace-data-permissions-contract.js to guard the workspace data RBAC contract.
  - Verification passed: node scripts/test-workspace-data-permissions-contract.js, bash scripts/test-workspace-pages-contract.sh, node scripts/test-web-server-api-base-contract.js, npm run build -w @smarttour/web, and git diff --check.

- 2026-06-22 Completed Phase 3 customers client RBAC hardening:
  - Customers client now waits for permissions before loading CRM data, clears stale customer rows/metrics when customer.view is unavailable, and hides customer data content behind customer.view.
  - Create customer and customer file upload/delete actions now fail closed inside their handlers with customer.manage; detail viewing fail-closes with customer.view.
  - Added scripts/test-customers-client-permissions-contract.js to guard the Customers frontend RBAC contract.
  - Verification passed: node scripts/test-customers-client-permissions-contract.js, node scripts/test-required-fields-ui-contract.js, npm run build -w @smarttour/web, and git diff --check. scripts/test-customers-api.sh was attempted but stopped before customer assertions because its auth setup received 401 while creating roles.

- 2026-06-22 Completed Phase 3 commission reports client RBAC hardening:
  - Commission Reports now waits for permissions before loading, clears commission data when commission.view is unavailable, and hides metrics/filter/list content behind commission.view.
  - CSV export now requires commission.view + commission.export; sync/reject/pay require commission.manage; approve requires commission.approve inside handlers as well as buttons.
  - Strengthened scripts/test-commission-reports-client-contract.js to guard the client RBAC contract.
  - Verification passed: node scripts/test-commission-reports-client-contract.js, bash scripts/test-commission-reports-security.sh, npm run build -w @smarttour/web, and git diff --check.
- 2026-06-22 Completed Phase 3 quote/quotation frontend RBAC hardening:
  - Legacy Quotations, Quote Tours, and Quote Combos now gate server-side initial data loads through `/auth/me` and hide protected client content when quote/quotation view access is missing.
  - Client handlers now wait for permission readiness, clear stale SSR data when access is missing, and fail-close create/update/convert/approve actions before API calls.
  - Quote Combos supplier catalogs are preloaded only for `quote.manage` users.
  - Verification passed: `node scripts/test-quotations-client-contract.js`, `node scripts/test-quote-tours-client-contract.js`, `node scripts/test-quote-combos-client-contract.js`, `node scripts/test-quotes-backend-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.
- 2026-06-22 Completed Phase 3 order type page/client RBAC hardening:
  - `/orders/[type]` now gates server-side initial order loads through `/auth/me` and hides protected client content when order view/manage access is missing.
  - Orders client now waits for permission readiness, clears stale SSR rows without view access, and fail-closes create/update/copy actions with `order.manage` before API calls while preserving dedicated status/settle/unlock permissions.
  - Verification passed: `bash scripts/test-orders-ui-auth-contract.sh`, `bash scripts/test-orders-controller-permissions.sh`, `bash scripts/test-orders-api.sh`, `node scripts/test-order-center-permissions-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.
- 2026-06-22 Completed Phase 3 operation vouchers page/client RBAC hardening:
  - Operation Vouchers now gates server-side initial voucher loads through `/auth/me` and hides protected client content when operation form view/manage access is missing.
  - Client handlers now wait for permission readiness, clear stale SSR rows without view access, and fail-close reload/detail/create actions before API calls while preserving manage/payment permission gates.
  - Verification passed: `node scripts/test-operation-vouchers-client-contract.js`, `node scripts/test-required-fields-ui-contract.js`, `bash scripts/test-operations-controller-contract.sh`, `bash scripts/test-operation-vouchers-service.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.
- 2026-06-22 Completed Phase 3 tour guides page/client RBAC hardening:
  - Tour Guides now gates server-side initial guide loads through `/auth/me` and hides protected client content when `guide.view` is missing.
  - Client handlers now wait for permission readiness, clear stale SSR rows without view access, and fail-close reload/detail actions before API calls while preserving `guide.manage` save/create gates.
  - Verification passed: `node scripts/test-tour-guides-client-contract.js`, `node scripts/test-required-fields-ui-contract.js`, `bash scripts/test-tour-guides-api.sh`, `bash scripts/test-high-a-data-access.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 backend/data-scope verification hardening follow-up:
  - Updated API/data-scope/customer and smoke verification scripts to use the HttpOnly `smarttour.auth.token` cookie instead of stale `token`/`accessToken` JSON response fields, while asserting public auth responses stay token-free.
  - Added accounting `commission.approve` to RBAC contracts and a production migration so accounting can pass the dedicated commission approval guard without broadening unrelated operation/sales permissions.
  - Applied migration `20260622165000_accounting_commission_approve_permission` on the VPS database.
  - Verification passed: `scripts/test-customers-api.sh`, `scripts/test-data-scope-api-flows.sh`, `node scripts/test-role-permission-contract.js`, `bash scripts/verify-data-scope.sh`.

- 2026-06-22 Completed Phase 3 backend critical audit/logging hardening:
  - Fixed OperationsService audit logging so operation and supplier-payment-request audit rows keep `request.user.id` as `AuditLog.actorId`, matching the finance audit traceability contract.
  - Updated backend audit contracts to recognize valid shorthand Nest providers and the current tour-program detail contract that exposes booking count instead of booking rows.
  - Updated file upload core contract so `.env`/extensionless dotfiles are rejected by the upload whitelist.
  - Verification passed: `bash scripts/test-high-b-finance-audit.sh`, `bash scripts/test-operations-service-flows.sh`, `bash scripts/test-files-service-core.sh`, `bash scripts/test-backend-critical-flows.sh`.

- Phase 3 browser smoke hardening follow-up:
  - Browser smoke defaults now target the active SmartTour production domain `https://aitour.io.vn` instead of stale `quanly.dunientravel.com`, which resolves to a different host and old bundle.
  - Browser page smoke now waits for rendered body text before asserting route content, avoiding false failures during Next hydration/data load.
  - Interaction smoke was aligned with current Finance, Operations, Security, and global-search UI selectors, using stable test ids/classes where available.
  - Operations UI smoke now targets the active domain, accepts the current confirmation dialogs for payment-request actions, resets/selects reconciliation rows deterministically, and mocks `/api/auth/me` for the view-only client-permission scenario.
  - Verified with full browser route smoke, UI interaction smoke, and operations UI smoke using temporary admin users cleaned up afterward.

- Phase 3 active-domain cleanup follow-up:
  - Remaining executable smoke defaults and current runbooks were aligned to the active SmartTour production host `https://aitour.io.vn` instead of stale `https://quanly.dunientravel.com`.
  - Updated business, finance report, UI page, quotes/quotations, and deploy-preview defaults plus go-live/rollback/ops runbooks.
  - UI page smoke no longer treats Next internal redirect/notFound payload markers as runtime error signatures; browser smoke remains the runtime route safety net.
  - Verification passed for bash syntax, stale-domain grep, business smoke, finance report smoke, UI page smoke, and quotes/quotations smoke with temporary admin cleanup.

- 2026-06-22 Completed Phase 3 server API base hardening:
  - Tour Programs and Bookings server-rendered pages now use `SMARTTOUR_SERVER_API_URL`/Docker internal `http://api:4000` for SSR requests and mutations instead of falling back to `localhost:4000`.
  - Expanded `scripts/test-web-server-api-base-contract.js` to cover these pages and prevent public-only/localhost SSR API regressions.
  - Verification passed: `node scripts/test-web-server-api-base-contract.js`, `npm run build -w @smarttour/web`, `docker compose config --quiet`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 broad server API base hardening:
  - Added shared `apps/web/app/serverApiBase.ts` and moved all server-rendered pages with SSR API fetches to `serverApiBase()`.
  - Covered FIT/GIT/LandTour, Operations vouchers, Order Center, Orders, Quote/Quotation, Reports, Suppliers, Tour Guides, Tour Programs, and Bookings so page code no longer reads `NEXT_PUBLIC_API_URL` directly.
  - Expanded `scripts/test-web-server-api-base-contract.js` to guard the complete SSR page list.
  - Verification passed: `node scripts/test-web-server-api-base-contract.js`, grep for direct page-level `NEXT_PUBLIC_API_URL` reads, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 auth stale login cleanup:
  - Removed unused `apps/web/app/LoginClient.tsx`, leaving `/login/LoginClient.tsx` as the canonical login client with `safeNextPath` redirect sanitization.
  - Updated `scripts/test-auth-cookie-session.sh` to fail if the stale root login client returns and to assert the canonical login client keeps safe next-path handling.
  - Verification passed: `bash scripts/test-auth-cookie-session.sh`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 SSR list payload hardening:
  - Tour Programs and common Suppliers list APIs now accept bounded `take`, default to 100 rows, and cap requests at 200 rows.
  - `/tour-programs` and `/suppliers` server pages now request `take=100` instead of embedding unbounded master-data lists into SSR HTML.
  - Expanded Tour Programs and Suppliers contracts to guard bounded list DTO/service/page behavior.
  - Verification passed: `bash scripts/test-tour-programs-service.sh`, `bash scripts/test-suppliers-common-contract.sh`, `node scripts/test-suppliers-server-page-permissions-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 GIT/LandTour SSR payload hardening:
  - GIT Tour and LandTour list APIs now accept bounded `take`, default to 100 rows, and cap requests at 200 rows.
  - `/git-tours` and `/landtours` server pages now include `take=100` in their list query builders while preserving search/status filters.
  - Expanded `scripts/test-tour-type-apis.sh` to guard bounded list DTO/controller/page behavior for both tour types.
  - Verification passed: `bash scripts/test-tour-type-apis.sh`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 FIT Tour SSR/client payload hardening:
  - FIT Tour list API now uses `ListFitToursQueryDto`, accepts bounded `take`, defaults to 100 rows, and caps requests at 200 rows.
  - `/fit-tours` server preload and client reload now include `take=100` while preserving search/workflow filters.
  - Expanded FIT root/client contracts to guard bounded list DTO/controller/service/page behavior.
  - Verification passed: `bash scripts/test-fit-tour-root-contract.sh`, `node scripts/test-fit-tours-client-contract.js`, `bash scripts/test-tour-type-apis.sh`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 bookings SSR tour-program preload hardening:
  - `/bookings` now preloads tour-program master data with `/tour-programs?take=100` instead of relying on an implicit/default list size.
  - Expanded `scripts/test-bookings-server-page-permissions-contract.js` to guard the bounded tour-program preload.
  - Verification passed: `node scripts/test-bookings-server-page-permissions-contract.js`, `node scripts/test-web-server-api-base-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 quote combo supplier catalog payload hardening:
  - Hotel and typed supplier list APIs now accept bounded `take`, default to 100 rows, and cap at 200 rows through the existing supplier list limit helper.
  - `/quotes/combos` now preloads each supplier catalog with `take=100` instead of requesting unbounded hotel/typed supplier lists.
  - Expanded supplier hotel/typed and Quote Combos contracts to guard bounded catalog preload behavior.
  - Verification passed: `bash scripts/test-suppliers-hotel-contract.sh`, `bash scripts/test-suppliers-typed-contract.sh`, `node scripts/test-quote-combos-client-contract.js`, `bash scripts/test-suppliers-common-contract.sh`, `node scripts/test-quotes-backend-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 supplier SSR page payload hardening:
  - `/suppliers/hotels` now preloads `/suppliers/hotels?take=100`.
  - `/suppliers/[type]` now preloads `/suppliers/${type}?take=100`.
  - Expanded `scripts/test-suppliers-typed-page-permissions-contract.js` to guard bounded hotel/typed supplier page preloads.
  - Verification passed: `node scripts/test-suppliers-typed-page-permissions-contract.js`, `bash scripts/test-suppliers-hotel-contract.sh`, `bash scripts/test-suppliers-typed-contract.sh`, `node scripts/test-web-server-api-base-contract.js`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-22 Completed Phase 3 quote list payload hardening:
  - Quote Tours and Quote Combos list APIs now use `ListQuotesQueryDto`, accept bounded `take`, default to 100 rows, and cap at 200 rows.
  - `/quotes/tours` and `/quotes/combos` server preloads and client reloads now include `take=100`.
  - Expanded backend and client quote contracts to guard bounded list behavior.
  - Verification passed: `node scripts/test-quotes-backend-contract.js`, `node scripts/test-quote-tours-client-contract.js`, `node scripts/test-quote-combos-client-contract.js`, `node scripts/test-web-server-api-base-contract.js`, `npx prisma validate --schema prisma/schema.prisma`, `npm run build -w @smarttour/api`, `npm run build -w @smarttour/web`, and `git diff --check`.

- 2026-06-24 Completed production disaster backup staging cleanup hardening:
  - Disaster backup now removes the expanded `$work_dir` only after the archive checksum has been generated and verified with `sha256sum -c "$archive.sha256"`.
  - The backup artifact permissions contract now guards checksum-before-cleanup ordering, cleanup before offsite sync, and the documented operations expectation.
  - Existing leftover disaster staging directories under `/var/backups/smarttour/disaster` were removed after GREEN verification, leaving only the private archive and checksum artifacts.

- 2026-06-24 Completed production security audit disaster staging coverage:
  - `scripts/security-audit.sh` now emits `OK_DISASTER_STAGING` when no expanded disaster backup staging directories remain and `FAIL_DISASTER_STAGING` if a `smarttour-disaster-*` directory reappears under `/var/backups/smarttour/disaster`.
  - `scripts/test-security-audit-contract.js`, the security hardening runbook, and the production readiness tracker now guard and document the new live audit marker.
  - A live failure probe with a temporary `smarttour-disaster-audit-probe` directory confirmed the audit fails on expanded staging and returns to OK after cleanup.

- 2026-06-24 Completed production healthcheck disaster backup freshness coverage:
  - `scripts/healthcheck.sh` now checks the latest `smarttour-disaster-*.tar.gz` archive age and checksum, emitting `OK_DISASTER_BACKUP` or `FAIL_DISASTER_BACKUP`.
  - `/etc/default/smarttour-ops` template now includes `DISASTER_BACKUP_MAX_AGE_HOURS=192` so weekly disaster backups alert when older than eight days.
  - `scripts/test-healthcheck-backup-contract.js`, `package.json`, observability docs, and the production readiness tracker now guard and document the disaster backup healthcheck contract.
  - The live `/etc/default/smarttour-ops` file was updated with `DISASTER_BACKUP_MAX_AGE_HOURS=192` and preserved as `600 root:root`; a temporary stale archive probe confirmed the healthcheck fails on stale disaster backups and returns to OK after cleanup.

- 2026-06-24 Completed production healthcheck restore-drill freshness coverage:
  - `scripts/healthcheck.sh` now checks `/var/log/smarttour/restore-drill.log` for a recent `RESTORE_DRILL_OK` marker and confirms `smarttour-restore-drill.service` last result is `success`, emitting `OK_RESTORE_DRILL` or `FAIL_RESTORE_DRILL`.
  - `/etc/default/smarttour-ops` template now includes `RESTORE_DRILL_MAX_AGE_HOURS=192` so weekly restore drills alert when older than eight days.
  - `scripts/test-healthcheck-restore-drill-contract.js`, `package.json`, observability docs, backup/reinstall docs, and the production readiness tracker now guard and document the restore drill healthcheck contract.
  - The live `/etc/default/smarttour-ops` file was updated with `RESTORE_DRILL_MAX_AGE_HOURS=192` and preserved as `600 root:root`; a temporary log-without-success-marker probe confirmed the healthcheck fails on missing `RESTORE_DRILL_OK` and returns to OK after cleanup.

- 2026-06-24 Completed production ops log rotation hardening:
  - Added `deploy/logrotate/smarttour` for `/var/log/smarttour/*.log` with daily rotation, 14 retained rotations, compression, copytruncate, and private `0640 root root` recreated logs.
  - `scripts/install-ops-schedule.sh` now installs `/etc/logrotate.d/smarttour`; `scripts/security-audit.sh` emits `OK_LOGROTATE` or `FAIL_LOGROTATE` for mode/owner and expected rotation settings.
  - `scripts/test-ops-logrotate-contract.js`, `package.json`, CI source contracts, backup/reinstall docs, security docs, and the production readiness tracker now guard and document the ops logrotate contract.
  - The live `/etc/logrotate.d/smarttour` file was installed as `644 root:root`; `logrotate -d` parsed the SmartTour log pattern, and a temporary bad-config probe confirmed the security audit fails with `FAIL_LOGROTATE` and returns to `OK_LOGROTATE` after restore.

- 2026-06-24 Completed production ops log permission hardening:
  - `scripts/install-ops-schedule.sh` now normalizes `/var/log/smarttour` and `/var/log/smarttour/security` to `750 root:root`, with SmartTour `.log` and `nginx-host-report-*.txt` files set to `0640 root:root`.
  - `scripts/nginx-host-report.sh` now creates the report directory as `0750` and writes current/latest report files as `0640`.
  - `scripts/security-audit.sh` now emits `OK_OPS_LOG_PERMS` or `FAIL_OPS_LOG_PERMS`, and `scripts/test-ops-log-permissions-contract.js`, CI, docs, and Memory Bank guard/document the contract.
  - Live logs/reports were normalized to `640 root:root`, directories to `750 root:root`; a host report probe created new `0640` report files, and a temporary `0644` log probe confirmed the audit fails with `FAIL_OPS_LOG_PERMS` and returns to OK after restore.

- 2026-06-24 Completed production ops service umask hardening:
  - SmartTour ops systemd services now set `UMask=0027` so newly created append logs remain private after reinstall, cleanup, or log recreation.
  - `scripts/security-audit.sh` now emits `OK_OPS_SERVICE_UMASK` or `FAIL_OPS_SERVICE_UMASK`, and the ops log permissions contract/docs/tracker guard the expected service umask.
  - Live systemd units were reinstalled and daemon-reloaded; `systemctl show` now reports `0027` for healthcheck, host report, PostgreSQL backup, disaster backup, and restore drill services.

- 2026-06-24 Completed production healthcheck HTTP timeout hardening:
  - `scripts/healthcheck.sh` now passes `--connect-timeout "$HTTP_CONNECT_TIMEOUT"` and `--max-time "$HTTP_MAX_TIME"` to route-probe curl calls, with existing bounded attempts and retry delay.
  - `/etc/default/smarttour-ops` template, observability docs, production readiness tracker, CI source contracts, and `scripts/test-healthcheck-http-timeout-contract.js` now guard/document the HTTP route probe timeout settings.
  - A live failure probe with `HTTP_ATTEMPTS=1`, `HTTP_CONNECT_TIMEOUT=1`, `HTTP_MAX_TIME=2`, and closed localhost URLs confirmed route checks fail quickly with `FAIL_HTTP`, and the normal healthcheck returns to `HEALTHCHECK_OK`.

- 2026-06-24 Completed production healthcheck Docker timeout hardening:
  - `scripts/healthcheck.sh` now runs Docker/container probes through `run_docker_check`, bounded by `DOCKER_CHECK_TIMEOUT=10s`.
  - Container state, auth env, PostgreSQL readiness, Redis ping, recent log scans, and internal port scans now fail explicitly if the Docker command cannot return inside the timeout.
  - `/etc/default/smarttour-ops` template, observability docs, production readiness tracker, CI source contracts, and `scripts/test-healthcheck-docker-timeout-contract.js` now guard/document the Docker probe timeout settings.
  - The live `/etc/default/smarttour-ops` file now sets `DOCKER_CHECK_TIMEOUT=10s` and remains `600 root:root`; healthcheck was verified with that environment file sourced.

- 2026-06-24 Completed production healthcheck systemd timeout hardening:
  - `scripts/healthcheck.sh` now runs systemd probes through `run_systemd_check`, bounded by `SYSTEMD_CHECK_TIMEOUT=10s`.
  - Failed-unit inspection now emits `FAIL_SYSTEMD unavailable` if `systemctl --failed` cannot return, instead of treating unavailable systemd status as OK.
  - Restore drill service result lookup is now bounded by the same systemd timeout.
  - `/etc/default/smarttour-ops` template, observability docs, production readiness tracker, CI source contracts, and `scripts/test-healthcheck-systemd-timeout-contract.js` now guard/document the systemd probe timeout settings.
  - The live `/etc/default/smarttour-ops` file now sets `SYSTEMD_CHECK_TIMEOUT=10s` and remains `600 root:root`; healthcheck was verified with that environment file sourced.

- 2026-06-24 Completed production security audit timeout hardening:
  - `scripts/security-audit.sh` now bounds Docker, sshd, systemd, and npm audit probes with `AUDIT_COMMAND_TIMEOUT=10s` and `NPM_AUDIT_TIMEOUT=120s`.
  - Docker port inspection now emits `FAIL_PORTS docker_unavailable` if Docker cannot be queried, instead of downgrading to a warning.
  - sshd effective-config inspection now emits `FAIL_SSH sshd_config_unavailable` if `sshd -T` cannot return, and npm audit failures/timeouts emit `FAIL_NPM_AUDIT failed_or_timed_out`.
  - The existing `npm run test:security-audit` contract, security runbook, and production readiness tracker now guard/document the audit timeout settings.

- 2026-06-24 Completed production ops schedule installer timeout hardening:
  - `scripts/install-ops-schedule.sh` now runs systemd reload, timer enablement, and timer listing through `run_ops_systemctl`, bounded by `OPS_SYSTEMD_TIMEOUT=30s`.
  - The `/etc/default/smarttour-ops` template documents `OPS_SYSTEMD_TIMEOUT=30s` for reinstall/setup runs.
  - `scripts/test-ops-install-systemd-timeout-contract.js`, CI source contracts, backup/security runbooks, and the production readiness tracker now guard/document the installer systemd timeout contract.

- 2026-06-24 Completed production PostgreSQL backup timeout hardening:
  - `scripts/backup-postgres.sh` now runs daily `pg_dump` through `run_postgres_backup_dump`, bounded by `POSTGRES_BACKUP_TIMEOUT=30m`.
  - The temporary backup cleanup trap remains installed before dumping starts, so timeout/failure still removes the `.tmp` artifact.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:backup-artifact-permissions` now guard/document the PostgreSQL backup timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `POSTGRES_BACKUP_TIMEOUT=30m` and remains `600 root:root`; a fake Docker timeout probe confirmed `.tmp` cleanup, and a successful temporary backup produced private artifacts.

- 2026-06-24 Completed production restore-drill timeout hardening:
  - `scripts/restore-drill-postgres.sh` now runs restore-drill Docker/PostgreSQL commands through `run_restore_drill_docker`, bounded by `RESTORE_DRILL_COMMAND_TIMEOUT=30m`.
  - The protected database-name guard still runs before any drop/create/restore command.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:restore-drill-safety` now guard/document the restore-drill command timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `RESTORE_DRILL_COMMAND_TIMEOUT=30m` and remains `600 root:root`; a fake Docker timeout probe failed fast, and a live restore drill succeeded with a throwaway database.

- 2026-06-24 Completed production disaster-backup timeout hardening:
  - `scripts/disaster-backup.sh` now runs logical dump, dump listing, Docker inventory, and volume inspection commands through `run_disaster_docker`, bounded by `DISASTER_BACKUP_DOCKER_TIMEOUT=30m`.
  - Compose stop/start and the restart trap now run through `run_disaster_compose`, bounded by `DISASTER_BACKUP_COMPOSE_TIMEOUT=10m`.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:backup-artifact-permissions` now guard/document the disaster backup timeout settings.
  - The live `/etc/default/smarttour-ops` file now sets `DISASTER_BACKUP_DOCKER_TIMEOUT=30m` and `DISASTER_BACKUP_COMPOSE_TIMEOUT=10m` while remaining `600 root:root`; fake Docker and Compose timeout probes failed fast.

- 2026-06-24 Completed production Nginx host-report timeout hardening:
  - `scripts/nginx-host-report.sh` now reads Docker logs through `run_host_report_docker`, bounded by `HOST_REPORT_DOCKER_TIMEOUT=10s`.
  - Docker log read failures/timeouts now abort with `NGINX_HOST_REPORT_ABORT docker_logs_unavailable` instead of being hidden by the host-line grep fallback.
  - `/etc/default/smarttour-ops` template, security runbook, production readiness tracker, and `npm run test:ops-log-permissions` now guard/document the host-report Docker timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `HOST_REPORT_DOCKER_TIMEOUT=10s` while remaining `600 root:root`; fake Docker timeout and live report-dir probes verified fast aborts and private report files.

- 2026-06-24 Completed production deploy Docker timeout hardening:
  - `scripts/deploy-production.sh` now runs the Docker build phase through `run_deploy_compose_build`, bounded by `DEPLOY_DOCKER_BUILD_TIMEOUT=45m`.
  - The Docker up phase now runs through `run_deploy_compose_up`, bounded by `DEPLOY_DOCKER_UP_TIMEOUT=10m`.
  - The existing deploy phase markers and SmartLink guard-before-build ordering are preserved and guarded by `node scripts/test-github-actions-contract.js` plus the SmartLink source assertion.
  - Fake clean-repo deploy probes verified stuck Docker build/up phases fail fast with timeout status `124` without touching the production stack.

- 2026-06-24 Completed production security hardening installer timeout hardening:
  - `scripts/install-security-hardening.sh` now runs SSH validation, SSH reload, Nginx config test/reload, and SSH effective-config output through `run_security_install_command`, bounded by `SECURITY_INSTALL_COMMAND_TIMEOUT=10s`.
  - The installer still normalizes `/`, `/root/.ssh`, `authorized_keys`, and `.env` permissions before reloading services.
  - `npm run test:security-audit`, the security runbook, and the production readiness tracker now guard/document the installer timeout setting.
  - Verification used source contract and syntax checks without running the live installer, avoiding unnecessary SSH/Nginx reloads during the remediation session.

- 2026-06-24 Completed production deploy Prisma migration timeout hardening:
  - `scripts/deploy-production.sh` now runs `prisma migrate deploy` through `run_deploy_prisma`, bounded by `DEPLOY_PRISMA_MIGRATE_TIMEOUT=10m`.
  - The existing `DEPLOY_PHASE prisma_migrate_deploy` marker and deploy phase ordering are preserved and guarded by `node scripts/test-github-actions-contract.js`.
  - The GitHub Actions runbook and production readiness tracker now document the migration timeout setting.
  - A fake clean-repo deploy probe verified a stuck Prisma migration fails fast with timeout status `124` without touching the production stack.

- 2026-06-24 Completed production SmartLink guard Docker fallback timeout hardening:
  - `scripts/smartlink-legacy-audit.sh` now runs its Docker fallback through `run_smartlink_docker`, bounded by `SMARTLINK_AUDIT_DOCKER_TIMEOUT=10m`.
  - The wrapper still prefers the local Node path when `@prisma/client` is available, so normal production deploy guard behavior stays fast.
  - `node scripts/test-github-actions-contract.js`, the GitHub Actions runbook, SmartLink migration runbook, and production readiness tracker now guard/document the fallback timeout.
  - A fake no-node/Docker-hang probe verified the fallback fails fast with timeout status `124`.

- 2026-06-24 Completed production deploy Git sync timeout hardening:
  - `scripts/deploy-production.sh` now runs `git fetch`, `git checkout`, and `git pull --ff-only` through `run_deploy_git`, bounded by `DEPLOY_GIT_TIMEOUT=5m`.
  - Local dirty-worktree guard commands still run before sync, preserving the existing deploy safety behavior.
  - `node scripts/test-github-actions-contract.js`, the GitHub Actions runbook, and production readiness tracker now guard/document the Git sync timeout setting.
  - A fake clean-repo deploy probe verified a stuck `git fetch` fails fast with timeout status `124` before SmartLink guard.

- 2026-06-24 Completed production SmartLink guard local Node timeout hardening:
  - `scripts/smartlink-legacy-audit.sh` now runs local Prisma-client detection and the local audit command through `run_smartlink_node`, bounded by `SMARTLINK_AUDIT_NODE_TIMEOUT=10m`.
  - The existing Docker fallback remains bounded by `SMARTLINK_AUDIT_DOCKER_TIMEOUT=10m`.
  - `node scripts/test-github-actions-contract.js`, the GitHub Actions runbook, SmartLink migration runbook, and production readiness tracker now guard/document both SmartLink guard timeout paths.
  - A fake local-node hang probe verified the preferred local Node path fails fast with timeout status `124`.

- 2026-06-24 Completed preview deploy timeout hardening:
  - `scripts/deploy-preview.sh` now runs API/Web npm builds through `run_preview_npm`, bounded by `PREVIEW_NPM_BUILD_TIMEOUT=20m`.
  - Docker image builds now run through `run_preview_compose_build`, bounded by `PREVIEW_DOCKER_BUILD_TIMEOUT=30m`.
  - Docker rm, compose up, and web preview run commands now run through bounded Docker command wrappers with `PREVIEW_DOCKER_COMMAND_TIMEOUT=5m`.
  - `node scripts/test-deploy-preview-timeout-contract.js` is exposed in `package.json`, wired into CI source contracts, documented in the ops/readiness runbooks, and verified with fake timeout probes for npm build, Docker build, and Docker run paths.

- 2026-06-24 Completed offsite backup SCP timeout hardening:
  - `scripts/sync-latest-backup.sh` now uploads daily backup artifacts through `run_backup_scp`, bounded by `BACKUP_REMOTE_SCP_TIMEOUT=30m`.
  - `scripts/disaster-backup.sh` now uploads disaster archive artifacts through `run_disaster_scp`, bounded by `DISASTER_BACKUP_REMOTE_SCP_TIMEOUT=60m`.
  - The existing checksum-before-upload and remote key mode guards remain in place before SCP starts.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:backup-offsite` now guard/document total SCP transfer timeouts.
  - The live `/etc/default/smarttour-ops` file now sets both SCP timeout values while remaining `600 root:root`; fake SCP timeout probes verified both upload paths fail fast with status `124`.

- 2026-06-24 Completed disaster backup host inventory timeout hardening:
  - `scripts/disaster-backup.sh` now runs host inventory commands through `run_disaster_host_command`, bounded by `DISASTER_BACKUP_HOST_COMMAND_TIMEOUT=30s`.
  - Host inventory coverage includes `hostnamectl`, `ip addr`, `ip route`, `df -hT`, `systemctl --failed`, and `crontab -l`.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:backup-artifact-permissions` now guard/document the host inventory timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `DISASTER_BACKUP_HOST_COMMAND_TIMEOUT=30s` while remaining `600 root:root`; a fake host-command timeout probe verified the backup fails fast with status `124`.

- 2026-06-24 Completed disaster backup archive timeout hardening:
  - `scripts/disaster-backup.sh` now runs config tar, server-config tar, raw volume tar, final archive tar, archive checksum generation/verification, and SHA256 manifest hashing through `run_disaster_archive_command`, bounded by `DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m`.
  - This specifically bounds volume archive work after `docker compose stop`, so a stuck local archive command exits and lets the existing restart trap bring the Compose stack back up.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:backup-artifact-permissions` now guard/document the archive timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m` while remaining `600 root:root`; a fake volume-tar timeout probe verified status 124 and `docker compose up -d` restart-trap execution.

- 2026-06-24 Completed healthcheck backup checksum timeout hardening:
  - `scripts/healthcheck.sh` now runs PostgreSQL and disaster backup checksum verification through `run_checksum_check`, bounded by `CHECKSUM_CHECK_TIMEOUT=5m`.
  - Existing healthcheck semantics are preserved: valid checksums still emit `OK_BACKUP` / `OK_DISASTER_BACKUP`, while missing, invalid, or timed-out checksum verification emits the existing checksum failure messages.
  - `/etc/default/smarttour-ops` template, observability runbook, production readiness tracker, and `npm run test:healthcheck-backup` now guard/document the checksum timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `CHECKSUM_CHECK_TIMEOUT=5m` while remaining `600 root:root`; a fake checksum wrapper probe verified timeout status 124.

- 2026-06-24 Completed backup checksum command timeout hardening:
  - Daily PostgreSQL backup checksum creation, latest-backup sync checksum creation/verification, and restore-drill pre-restore checksum verification now run through bounded checksum wrappers using `BACKUP_CHECKSUM_TIMEOUT=5m`.
  - The sync script still verifies checksums before SCP, and restore-drill still validates the backup checksum before any restore command; a checksum timeout exits with status 124.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, `npm run test:backup-artifact-permissions`, `npm run test:backup-offsite`, and `npm run test:restore-drill-safety` now guard/document the checksum timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `BACKUP_CHECKSUM_TIMEOUT=5m` while remaining `600 root:root`; fake timeout probes covered daily backup checksum, sync checksum before SCP, and restore-drill cleanup on checksum timeout.

- 2026-06-24 Completed disaster backup Git timeout hardening:
  - `scripts/disaster-backup.sh` now runs Git status, commit lookup, remote listing, bundle creation, and manifest commit lookup through `run_disaster_git`, bounded by `DISASTER_BACKUP_GIT_TIMEOUT=5m`.
  - The bounded Git bundle step runs before `docker compose stop`, so a stuck Git archive operation fails without entering the raw-volume consistency window.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:backup-artifact-permissions` now guard/document the Git timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `DISASTER_BACKUP_GIT_TIMEOUT=5m` while remaining `600 root:root`; a fake Git bundle timeout probe verified status 124 and no Compose stop.

- 2026-06-24 Completed production deploy local Git timeout hardening:
  - `scripts/deploy-production.sh` now bounds local Git dirty-worktree checks, staged checks, untracked-file detection, and commit marker lookups with `DEPLOY_LOCAL_GIT_TIMEOUT=30s`.
  - Remote Git fetch/checkout/pull remains bounded separately by `DEPLOY_GIT_TIMEOUT=5m`.
  - `node scripts/test-github-actions-contract.js`, the GitHub Actions runbook, and the production readiness tracker now guard/document the local Git timeout setting.
  - A fake deploy probe with a stuck local `git diff` confirmed the deploy aborts before SmartLink, Prisma migration, or Docker phases.

- 2026-06-24 Completed backup gzip timeout hardening:
  - `scripts/backup-postgres.sh` now bounds daily gzip compression through `BACKUP_COMPRESSION_TIMEOUT=30m`.
  - `scripts/disaster-backup.sh` now routes disaster SQL gzip compression through `run_disaster_archive_command`, bounded by `DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m`.
  - `scripts/restore-drill-postgres.sh` now bounds backup decompression through `BACKUP_COMPRESSION_TIMEOUT=30m`, while cleanup still drops the throwaway drill database on timeout.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, `npm run test:backup-artifact-permissions`, and `npm run test:restore-drill-safety` now guard/document compression timeout behavior; live env remains `600 root:root`.

- 2026-06-24 Completed healthcheck backup file-scan timeout hardening:
  - `scripts/healthcheck.sh` now bounds latest PostgreSQL backup and latest disaster archive discovery through `run_healthcheck_file_scan`, using `HEALTHCHECK_FILE_SCAN_TIMEOUT=30s`.
  - Existing healthcheck semantics are preserved: if discovery fails or times out, the healthcheck reports the existing missing-backup failure paths instead of hanging the timer.
  - `/etc/default/smarttour-ops` template, observability runbook, production readiness tracker, and `npm run test:healthcheck-backup` now guard/document the file-scan timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `HEALTHCHECK_FILE_SCAN_TIMEOUT=30s` while remaining `600 root:root`; a fake wrapper probe verified timeout status 124.

- 2026-06-24 Completed backup script file-scan timeout hardening:
  - Daily backup retention cleanup now uses `run_backup_file_scan`, bounded by `BACKUP_FILE_SCAN_TIMEOUT=30s`.
  - Latest backup discovery for offsite sync and restore-drill now uses bounded file-scan wrappers before checksum, SCP, or restore work starts.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, `npm run test:backup-artifact-permissions`, `npm run test:backup-offsite`, and `npm run test:restore-drill-safety` now guard/document the file-scan timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `BACKUP_FILE_SCAN_TIMEOUT=30s` while remaining `600 root:root`; fake timeout probes verified status 124 for backup retention, sync discovery, and restore discovery.

- 2026-06-24 Completed security audit file-scan timeout hardening:
  - `scripts/security-audit.sh` now bounds backup artifact, disaster staging, ops log, and security report file scans with `AUDIT_FILE_SCAN_TIMEOUT=30s`.
  - Docker, sshd, systemd, and npm audit probes remain bounded separately by the existing audit timeouts.
  - `/etc/default/smarttour-ops` template, security runbook, production readiness tracker, and `npm run test:security-audit` now guard/document the file-scan timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `AUDIT_FILE_SCAN_TIMEOUT=30s` while remaining `600 root:root`; a fake wrapper probe verified timeout status 124.

- 2026-06-24 Completed disaster backup file-scan timeout hardening:
  - `scripts/disaster-backup.sh` now bounds disaster staging checksum manifest discovery and old archive retention cleanup with `DISASTER_BACKUP_FILE_SCAN_TIMEOUT=30s`.
  - Existing disaster archive/checksum work remains bounded separately by `DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m`.
  - `/etc/default/smarttour-ops` template, backup runbook, production readiness tracker, and `npm run test:backup-artifact-permissions` now guard/document the file-scan timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `DISASTER_BACKUP_FILE_SCAN_TIMEOUT=30s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `find` returns status 124.

- 2026-06-24 Completed Nginx host report file-scan timeout hardening:
  - `scripts/nginx-host-report.sh` now bounds old report retention cleanup with `HOST_REPORT_FILE_SCAN_TIMEOUT=30s`.
  - Docker log collection remains bounded separately by `HOST_REPORT_DOCKER_TIMEOUT=10s`.
  - `/etc/default/smarttour-ops` template, security hardening runbook, production readiness tracker, and `npm run test:ops-log-permissions` now guard/document the file-scan timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `HOST_REPORT_FILE_SCAN_TIMEOUT=30s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `find` returns status 124.

- 2026-06-24 Completed healthcheck alert payload timeout hardening:
  - `scripts/healthcheck.sh` now bounds webhook alert hostname lookup and JSON payload generation with `HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT=5s`.
  - Webhook delivery remains bounded separately by `HEALTHCHECK_WEBHOOK_CONNECT_TIMEOUT`, `HEALTHCHECK_WEBHOOK_MAX_TIME`, and `HEALTHCHECK_WEBHOOK_RETRIES`.
  - `/etc/default/smarttour-ops` template, observability alerting runbook, production readiness tracker, and `npm run test:observability-alerting` now guard/document the payload timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT=5s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `node` returns status 124.

- 2026-06-24 Completed ops installer file-scan timeout hardening:
  - `scripts/install-ops-schedule.sh` now bounds SmartTour log and host-report permission normalization scans with `OPS_FILE_SCAN_TIMEOUT=30s`.
  - Systemd reload/enable/list-timer operations remain bounded separately by `OPS_SYSTEMD_TIMEOUT=30s`.
  - Backup/security runbooks, production readiness tracker, `npm run test:ops-log-permissions`, and `npm run test:ops-install-systemd-timeout` now guard/document the file-scan timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `OPS_FILE_SCAN_TIMEOUT=30s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `find` returns status 124.

- 2026-06-24 Completed healthcheck restore-drill file-read timeout hardening:
  - `scripts/healthcheck.sh` now bounds restore-drill log marker and mtime reads with `HEALTHCHECK_FILE_READ_TIMEOUT=10s`.
  - Restore-drill service result checks remain bounded separately by `SYSTEMD_CHECK_TIMEOUT=10s`.
  - The ops env template, observability runbook, backup runbook, production readiness tracker, and `npm run test:healthcheck-restore-drill` now guard/document the file-read timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `HEALTHCHECK_FILE_READ_TIMEOUT=10s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `grep` returns status 124.

- 2026-06-24 Completed security audit file-read timeout hardening:
  - `scripts/security-audit.sh` now bounds config/permission reads with `AUDIT_FILE_READ_TIMEOUT=10s`.
  - Coverage includes `.env` checks, logrotate and Nginx config greps, SSH/root permission metadata, backup/log directory mode checks, and bounded grep checks over previously collected command output.
  - The ops env template, security hardening runbook, production readiness tracker, and `npm run test:security-audit` now guard/document the file-read timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `AUDIT_FILE_READ_TIMEOUT=10s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `grep` returns status 124.

- 2026-06-24 Completed healthcheck text-filter timeout hardening:
  - `scripts/healthcheck.sh` now bounds grep filters over collected Docker, log, port, and systemd output with `HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s`.
  - Docker collection remains bounded separately by `DOCKER_CHECK_TIMEOUT=10s`, and restore-drill log reads remain bounded by `HEALTHCHECK_FILE_READ_TIMEOUT=10s`.
  - The ops env template, observability runbook, production readiness tracker, and `npm run test:healthcheck-docker-timeout` now guard/document the text-filter timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `grep` returns status 124.

- 2026-06-24 Completed healthcheck host-command timeout hardening:
  - `scripts/healthcheck.sh` now bounds root mode, disk usage, and failure-host lookup commands with `HEALTHCHECK_HOST_COMMAND_TIMEOUT=10s`.
  - Docker, systemd, checksum, file scan, file read, text filter, and alert payload work remain bounded by their dedicated healthcheck timeout wrappers.
  - `npm run test:healthcheck-host-timeout` is exposed in `package.json`, wired into CI source contracts, and guarded by `scripts/test-github-actions-contract.js`.
  - The ops env template, observability runbook, and production readiness tracker now document the host-command timeout setting; the live `/etc/default/smarttour-ops` file now sets `HEALTHCHECK_HOST_COMMAND_TIMEOUT=10s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `stat` returns status 124.

- 2026-06-24 Completed Nginx host report text timeout hardening:
  - `scripts/nginx-host-report.sh` now bounds parsing and summary text processing with `HOST_REPORT_TEXT_TIMEOUT=10s`.
  - Docker log collection and report retention cleanup remain bounded separately by `HOST_REPORT_DOCKER_TIMEOUT=10s` and `HOST_REPORT_FILE_SCAN_TIMEOUT=30s`.
  - The ops env template, security hardening runbook, production readiness tracker, and `npm run test:ops-log-permissions` now guard/document the text timeout setting.
  - The live `/etc/default/smarttour-ops` file now sets `HOST_REPORT_TEXT_TIMEOUT=10s` while remaining `600 root:root`; a fake wrapper probe verified a stuck `grep` returns status 124.

- 2026-06-24 Completed healthcheck backup ordering timeout hardening:
  - `scripts/healthcheck.sh` now routes latest PostgreSQL and disaster backup discovery ordering through `run_healthcheck_text_filter`.
  - Backup directory scans remain bounded by `HEALTHCHECK_FILE_SCAN_TIMEOUT=30s`; ordering uses the existing `HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s`.
  - Observability/readiness docs and `npm run test:healthcheck-backup` now guard/document bounded backup discovery ordering.
