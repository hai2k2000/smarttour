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

- FIT tour terminal workflow hardening:
  - Blocked non-idempotent data edits once a FIT tour reaches terminal COMPLETED or CANCELLED workflow status.
  - Added FIT root regression coverage for completed workflow edits and a source contract assertion for the terminal workflow guard.
  - Refreshed the FIT wizard UI contract to require authFetch for existing auth-aware load/copy/upload/delete calls instead of stale raw fetch literals.
  - Verification passed for FIT root/client/wizard contracts, data-scope module flows, API build/lint, diff-check, Docker API rebuild/restart, production healthcheck, and Docker build-cache prune.

- Booking terminal edit hardening:
  - Blocked data edits on Booking rows already in terminal COMPLETED or CANCELLED status while preserving empty update no-op behavior.
  - Added a service-flow regression for cancelled bookings and extended the booking status lock contract so update keeps the terminal guard after row locking.
  - Verification passed for booking lock/controller/service flows, API build/lint, diff-check, Docker API rebuild/restart, production healthcheck, and Docker build-cache prune.

- Customer merged terminal write hardening:
  - Blocked direct writes to customers marked MERGED or carrying mergedIntoId across update/remove/owner transfer/files/comments/care tasks/calls/opportunities and prevented merging an already merged source or target.
  - Added merged-customer terminal contract coverage and service-flow regressions; refreshed the data-scope contract to match scopedLegacyClaim legacy orphan-link behavior.
  - Verification passed for customer/data-scope/file-service contracts and flows, API build/lint, diff-check, Docker API rebuild/restart, production healthcheck, and Docker build-cache prune.

- Security hardening installer file command timeout hardening:
  - Hardened `scripts/install-security-hardening.sh` so root-level SSH/env permission and config install commands run through `SECURITY_INSTALL_FILE_COMMAND_TIMEOUT=10s`.
  - Extended `scripts/test-security-audit-contract.js`, the security runbook, and production readiness tracker so security installer file commands cannot regress to unbounded raw calls.

- Ops schedule installer file command timeout hardening:
  - Hardened `scripts/install-ops-schedule.sh` so root-level file install/permission/env creation commands run through `OPS_FILE_COMMAND_TIMEOUT=30s`.
  - Extended `scripts/test-ops-install-systemd-timeout-contract.js`, backup/security runbooks, and production readiness tracker so schedule refresh after reinstall cannot regress to unbounded installer file commands.

- Disaster backup file command timeout hardening:
  - Hardened `scripts/disaster-backup.sh` so backup root/staging directory creation/chmod, manifest write, archive chmod, and checksum output run through `DISASTER_BACKUP_FILE_COMMAND_TIMEOUT=5m`.
  - Extended `scripts/test-backup-artifact-permissions-contract.js`, the ops env template, backup/reinstall runbook, and production readiness tracker so weekly backup file commands cannot regress to unbounded raw calls.

- PostgreSQL backup file command timeout hardening:
  - Hardened `scripts/backup-postgres.sh` so backup directory creation/chmod, final artifact move, artifact chmod, and checksum output run through `BACKUP_FILE_COMMAND_TIMEOUT=5m`.
  - Extended `scripts/test-backup-artifact-permissions-contract.js`, the ops env template, backup/reinstall runbook, and production readiness tracker so daily backup artifact file commands cannot regress to unbounded raw calls.

- PostgreSQL backup tmp cleanup timeout hardening:
  - Hardened `scripts/backup-postgres.sh` so failed-backup temporary file cleanup runs through `BACKUP_CLEANUP_TIMEOUT=5m` instead of raw `rm`.
  - Extended `scripts/test-backup-artifact-permissions-contract.js`, the ops env template, backup/reinstall runbook, and production readiness tracker so temporary backup cleanup deletion remains bounded.

- Disaster backup cleanup timeout hardening:
  - Hardened `scripts/disaster-backup.sh` so guarded staging/archive cleanup deletion runs through `DISASTER_BACKUP_CLEANUP_TIMEOUT=5m` instead of raw `rm`.
  - Extended `scripts/test-backup-artifact-permissions-contract.js`, the ops env template, backup/reinstall runbook, and production readiness tracker so cleanup deletion cannot regress to an unbounded command.

- Backup offsite pre-sync creation timeout hardening:
  - Hardened `scripts/sync-latest-backup.sh` so optional `CREATE_BACKUP_FIRST=1` PostgreSQL backup creation is bounded by `BACKUP_CREATE_TIMEOUT=45m` before offsite sync continues.
  - Extended `scripts/test-backup-offsite-contract.js`, the ops env template, backup/reinstall runbook, and production readiness tracker so the pre-sync backup child process cannot regress to an unbounded call.

- PostgreSQL backup temporary file cleanup hardening:
  - Hardened `scripts/backup-postgres.sh` so partial `*.tmp` backup files are removed automatically on exit if backup creation fails before the final archive move.
  - Extended `scripts/test-backup-artifact-permissions-contract.js`, the backup/reinstall runbook, and production readiness tracker so temporary backup cleanup cannot regress silently.

- Disaster backup checksum verification hardening:
  - Hardened `scripts/disaster-backup.sh` so the generated disaster archive checksum is verified with `sha256sum -c "$archive.sha256"` before cleanup/offsite upload proceeds.
  - Extended `scripts/test-backup-offsite-contract.js`, the backup/reinstall runbook, and production readiness tracker so disaster archive sync cannot regress to uploading an unverified archive/checksum pair.

- Backup offsite SSH key permission hardening:
  - Hardened `scripts/sync-latest-backup.sh` and `scripts/disaster-backup.sh` so configured offsite SSH key files must exist and be mode `600` before SCP starts.
  - Extended `scripts/test-backup-offsite-contract.js`, the backup/reinstall runbook, and production readiness tracker so offsite backup sync cannot regress to using overly readable SSH keys.

- Backup offsite checksum verification hardening:
  - Hardened `scripts/sync-latest-backup.sh` so the latest PostgreSQL dump checksum is chmodded private and verified with `sha256sum -c` before any SCP upload.
  - Extended `scripts/test-backup-offsite-contract.js`, the backup/reinstall runbook, and production readiness tracker so offsite dump sync cannot regress to uploading an unverified local artifact.

- Ops environment file permission hardening:
  - Hardened `scripts/security-audit.sh` so `/etc/default/smarttour-ops` must be `600 root:root` and emits `OK_OPS_ENV_FILE`/`FAIL_OPS_ENV_FILE`.
  - Updated `scripts/install-ops-schedule.sh`, `scripts/test-security-audit-contract.js`, the security runbook, and production readiness tracker so healthcheck/offsite backup configuration cannot drift to group/world-readable permissions.

- Backup permission live audit hardening:
  - Extended `scripts/security-audit.sh` with `OK_BACKUP_PERMS` checks so PostgreSQL and disaster backup directories must be `700 root:root` and backup artifacts/checksums must not be group/world-readable.
  - Extended `scripts/test-security-audit-contract.js`, the security runbook, and the production readiness tracker so backup permission drift is caught during live security audits.

- Backup artifact permission hardening:
  - Hardened `scripts/backup-postgres.sh` and `scripts/disaster-backup.sh` so backup directories use mode `700` and generated backup/checksum artifacts use mode `600`.
  - Added `scripts/test-backup-artifact-permissions-contract.js`, exposed `npm run test:backup-artifact-permissions`, wired it into `SmartTour CI`, and documented artifact permission normalization in the backup/reinstall runbook and tracker.

- Production `.env` permission hardening:
  - Hardened `scripts/security-audit.sh` so the live production `.env` must be `600 root:root` and emits `OK_ENV_FILE`/`FAIL_ENV_FILE`.
  - Updated `scripts/install-security-hardening.sh`, `docs/security-hardening-runbook.md`, and the production readiness tracker so `.env` permissions are normalized and audited with SSH permission checks.

- Restore drill database safety hardening:
  - Hardened `scripts/restore-drill-postgres.sh` so `DRILL_DB` must be a throwaway identifier and cannot be `smarttour`, `postgres`, `template0`, or `template1`; unsafe values abort before any `dropdb` call.
  - Added `scripts/test-restore-drill-safety-contract.js`, exposed `npm run test:restore-drill-safety`, wired it into `SmartTour CI`, and documented the guard in the backup/reinstall runbook and production readiness tracker.

- Production rollback runbook hardening:
  - Reworked `docs/rollback-runbook.md` so production rollback records `BAD_COMMIT`, selects `GOOD_COMMIT`, creates/pushes a named `rollback/...` branch, and deploys through `scripts/deploy-production.sh` instead of the preview deploy path.
  - Added `scripts/test-rollback-runbook-contract.js`, exposed `npm run test:rollback-runbook`, and wired the contract into `SmartTour CI` and the GitHub Actions source contract.

- Production deploy traceability hardening:
  - Hardened `scripts/deploy-production.sh` so production deploy logs `DEPLOY_START` with the current commit, `DEPLOY_REVISION` after git sync, and ordered phase markers for SmartLink guard, Prisma migrations, Docker build/up, and healthcheck.
  - Extended `scripts/test-github-actions-contract.js`, `docs/github-actions-runbook.md`, and the production readiness tracker to keep deploy revision/phase logging documented and guarded.

- Production deploy Prisma migration hardening:
  - Hardened `scripts/deploy-production.sh` so production deploy logs `DEPLOY_PHASE prisma_migrate_deploy` and runs `npx prisma migrate deploy` after the SmartLink guard and before Docker build/up.
  - Extended `scripts/test-github-actions-contract.js`, `docs/github-actions-runbook.md`, and the production readiness tracker to guard/document the migration step.

- Production deploy dirty override reason hardening:
  - Hardened `scripts/deploy-production.sh` so `ALLOW_DIRTY=true` now requires `DEPLOY_DIRTY_REASON` and logs `DEPLOY_DIRTY_OVERRIDE reason=...` before continuing.
  - Extended `scripts/test-github-actions-contract.js`, `docs/github-actions-runbook.md`, and the production readiness tracker to guard/document the emergency override reason.

- Production deploy clean worktree hardening:
  - Hardened `scripts/deploy-production.sh` so production deploy aborts on untracked files in addition to tracked and staged changes, unless `ALLOW_DIRTY=true` is set explicitly on the server.
  - Extended `scripts/test-github-actions-contract.js` and `docs/github-actions-runbook.md` so the untracked-file guard remains documented and guarded.
  - Verified the untracked-file guard in an isolated temporary git repository because the live VPS branch intentionally still has old untracked files `=280` and `=520`.

- Production deploy input validation hardening:
  - Added a `Validate dispatch inputs` step to `.github/workflows/deploy-production.yml` so branch, repo path, site URL, and API URL are allowlist-checked before SSH starts.
  - Added server-side `BRANCH` validation in `scripts/deploy-production.sh` before git fetch/checkout/pull.
  - Extended `scripts/test-github-actions-contract.js` and `docs/github-actions-runbook.md` so unsafe deploy inputs cannot regress silently.

- GitHub production deploy SSH hardening:
  - Hardened `.github/workflows/deploy-production.yml` so `ssh-keyscan` uses a bounded timeout and the deploy SSH command uses `BatchMode=yes`, `ConnectTimeout=10`, `ServerAliveInterval=15`, and `ServerAliveCountMax=2`.
  - Extended `scripts/test-github-actions-contract.js` to guard the bounded/non-interactive SSH options and updated `docs/github-actions-runbook.md`.
  - `docs/production-readiness-tracker.md` now separates this completed deploy SSH hardening from the remaining manual GitHub secrets/environment approval task.

- Observability ops env template hardening:
  - Extended `scripts/test-observability-alerting-contract.js` so the `/etc/default/smarttour-ops` template must document `HEALTHCHECK_WEBHOOK_URL`, connect timeout, max time, and retry settings.
  - Updated `scripts/install-ops-schedule.sh` to include commented `HEALTHCHECK_WEBHOOK_*` settings when it creates `/etc/default/smarttour-ops`.
  - Updated the observability runbook and production readiness tracker so alerting configuration is discoverable after OS reinstall or schedule refresh.

- Operations schedule docs hardening:
  - Removed stale `/etc/cron.d/smarttour-*` references from production readiness tracking and aligned the docs with systemd timers installed by `scripts/install-ops-schedule.sh`.
  - Updated backup/reinstall and security runbooks to name `smarttour-healthcheck.timer`, `smarttour-nginx-host-report.timer`, `smarttour-postgres-backup.timer`, `smarttour-disaster-backup.timer`, and `smarttour-restore-drill.timer`.
  - Added `scripts/test-ops-schedule-docs-contract.js`, exposed `npm run test:ops-schedule-docs`, and wired the contract into `SmartTour CI`.

- File smoke command normalization:
  - Added `smoke:files` to `package.json` for `scripts/smoke-files.sh` and wired it into `smoke:all`, matching the production readiness tracker.
  - Added `scripts/test-smoke-files-command-contract.js`, exposed `npm run test:smoke-files-command`, and wired the contract into `SmartTour CI`.
  - Updated `docs/production-readiness-tracker.md` so the normalized smoke command list is guarded by the new contract.

- Production security audit hardening:
  - Hardened `scripts/security-audit.sh` to check `/` mode, `/root/.ssh` mode/owner, and `/root/.ssh/authorized_keys` mode/owner with explicit `OK_ROOT_MODE` and `OK_SSH_PERMS` output.
  - Updated `scripts/install-security-hardening.sh` to normalize `/`, `/root/.ssh`, and `authorized_keys` permissions before validating/reloading SSH hardening.
  - Added `scripts/test-security-audit-contract.js`, exposed `npm run test:security-audit`, and wired the contract into `SmartTour CI`.
  - Updated `docs/security-hardening-runbook.md` and `docs/production-readiness-tracker.md` so OS reinstall/security checks include SSH permission verification.

- Backup/restore offsite hardening:
  - Hardened `scripts/sync-latest-backup.sh` and `scripts/disaster-backup.sh` remote SCP paths with `BatchMode=yes`, configurable connect timeout, server-alive interval, and server-alive count max.
  - Added PostgreSQL dump and full disaster archive remote sync settings to the `/etc/default/smarttour-ops` template in `scripts/install-ops-schedule.sh`.
  - Updated `docs/operations-backup-reinstall.md` with off-VPS sync variables, key permission checks, `npm run ops:backup-sync`, and `npm run test:backup-offsite`.
  - Added `scripts/test-backup-offsite-contract.js`, exposed `npm run test:backup-offsite`, and wired the contract into `SmartTour CI`.
  - `docs/production-readiness-tracker.md` now marks Backup/Restore Operations as `ready-for-manual` pending selection/configuration of the external backup destination.

- Observability alerting hardening:
  - Hardened `scripts/healthcheck.sh` webhook failure notification with JSON-escaped structured `smarttour_healthcheck_failed` payloads, configurable connect timeout, max time, and retry count.
  - Added `docs/observability-alerting-runbook.md` for configuring `HEALTHCHECK_WEBHOOK_URL` and validating alert delivery through `/etc/default/smarttour-ops`.
  - Added `scripts/test-observability-alerting-contract.js` and wired it into `SmartTour CI` so alerting behavior stays guarded.
  - `docs/production-readiness-tracker.md` now marks Observability as `ready-for-manual` pending the external alert destination choice.
  - Verified webhook failure handling with an unreachable local webhook and normal `scripts/healthcheck.sh`.


- CI/CD GitHub Actions wiring:
  - Added `SmartTour CI` workflow for pull requests and pushes to `main`, `fix/**`, and `feature/**` branches.
  - CI uses Node 22, `npm ci`, Prisma generation, production dependency audit, source contracts, API/Web typechecks, and API/Web Docker image builds with CI-only Compose env values.
  - Added manual-only `SmartTour Production Deploy` workflow using SSH secrets and the existing server-side `scripts/deploy-production.sh`; it does not deploy on push or pull request.
  - Added `docs/github-actions-runbook.md` and `scripts/test-github-actions-contract.js` to guard workflow safety and document required GitHub secrets/environment approval.
  - `docs/production-readiness-tracker.md` now marks CI/CD and Deploy Standardization as `ready-for-manual` pending GitHub secrets and production environment configuration.


- Production readiness native XLSX export completion:
  - Promoted the XLSX helper into `apps/api/src/common/xlsx-workbook.ts` and added CSV-to-XLSX workbook conversion without external workbook dependencies.
  - Added `format=xlsx` support for the remaining CSV export families: Finance invoices/cashflow, Reports, Commission Reports, Order Center, Customers, and FIT tour export.
  - Extended `scripts/smoke-exports.sh` and added `scripts/test-native-xlsx-export-contract.js` so native XLSX export coverage checks MIME type and ZIP magic across the export set.
  - Hardened `scripts/smoke-exports.sh` with curl retry handling so API restart windows do not false-fail export verification.
  - Verification passed with native/finance XLSX contracts, finance helper and service flows, query DTO contract, `npm audit --omit=dev`, Docker API build/deploy, expanded export smoke, finance XLSX import endpoint smoke, and production healthcheck.
  - `docs/production-readiness-tracker.md` now marks Import/Export Files as `ready-for-manual`, pending business Excel validation of real files.

- Production readiness import/export XLSX hardening:
  - Added dependency-free native XLSX workbook support for Finance receipt/payment import and export.
  - CSV remains the default export format; `/finance/receipts/export?format=xlsx` and `/finance/payments/export?format=xlsx` return workbook responses with XLSX MIME type and ZIP magic.
  - Finance receipt/payment import now accepts `.xlsx` uploads and parses the first worksheet into the existing validated import row pipeline.
  - Added `scripts/test-finance-xlsx-contract.js`, extended `scripts/test-finance-helper-contracts.sh`, and extended `scripts/smoke-exports.sh` with XLSX export checks.
  - Verification covered the new source contract, helper runtime round-trip, endpoint XLSX export smoke, endpoint XLSX import parser smoke, Docker API build/deploy, and existing finance helper contracts.

- Phase 4 review remediation documentation consistency:
  - Fixed the stale conclusion in `docs/code-review-2026-06-13.md` so it no longer contradicts the 2026-06-23 remediation status table.
  - The review doc now preserves the original 2026-06-13 findings while stating that all High/Medium/Low findings have remediation evidence, with production/manual readiness tracked separately.
  - Ran `npm run verify:deploy` on the VPS with a temporary smoke admin account because the local `.env` has no real `ADMIN_PASSWORD`; the account was cleaned up after the run and the full deploy verification passed.

- Phase 4 review remediation status closure:
  - Re-verified the remaining Medium/Low review items after the High fixes: SmartLink legacy audit/backfill guard, runtime CORS origin validation, report query DTO validation, and Docker `npm ci` reproducibility.
  - Updated `docs/code-review-2026-06-13.md` with a 2026-06-23 remediation status table mapping every High/Medium/Low finding to its fix evidence and regression commands.
  - Verification covered `scripts/test-smartlink-legacy-audit.sh`, `scripts/test-auth-guard-behavior.sh`, `scripts/test-report-query-validation.sh`, and `scripts/test-dockerfile-npm-ci-contract.js`.

- Phase 4 QuoteCombo data-scope hardening:
  - Added `branch` and `department` fields plus indexes to `QuoteCombo`, with migration `20260623192000_quote_combo_data_scope` backfilling from creator user metadata when possible.
  - QuoteCombo controller routes now pass `request.user` into list/detail/write/action service calls.
  - QuoteCombo list/detail/update/delete/recalculate/create-quote/create-order paths now apply branch/department scope for scoped users, while create persists the creator branch/department.
  - Updated quotes backend contract and quotations smoke coverage so scoped users can manage their own combo quotes but cannot list/detail/update/action combo quotes from another branch/department.

- Phase 4 quotation workflow trust hardening:
  - Removed client-writable quotation workflow fields from create/update/action DTO contracts: direct `status`, direct `smartLinkEnabled`, and client-supplied `actor`.
  - Quotation create now explicitly starts as `DRAFT` with SmartLink disabled, while update no longer writes workflow state through `toData()`.
  - Submit/approve/reject/convert audit logs now derive actor from `request.user` instead of trusting request body actor values.
  - Updated quotes backend contract and quotations smoke coverage so direct workflow fields cannot change state and actor spoofing does not enter quotation workflow logs.

- Phase 4 commission sync workflow hardening:
  - `CommissionReportsService.syncFromOrders()` now only updates existing commission entries that are still `PENDING` and `UNPAID`.
  - Approved, partially paid, paid, rejected, or revoked commission entries are no longer overwritten by order resync, preventing financial/audit drift after workflow actions.
  - Extended `scripts/test-commission-reports-security.sh` with a regression case that verifies pending/unpaid rows can resync while approved/partial rows keep their commission, paid, and remaining amounts.
  - Verification covered the red/green commission security regression and Docker API build.

- Phase 4 Docker build reproducibility hardening:
  - Switched API and Web production Docker dependency installs from `npm install` to `npm ci`.
  - Added `scripts/test-dockerfile-npm-ci-contract.js` to keep production Dockerfiles lockfile-driven and prevent regressions back to non-reproducible installs.
  - Verified the contract red/green, then built both API and Web Docker images successfully with `npm ci`.

- Phase 4 reports CSV helper extraction:
  - Extracted pure report CSV formatting from `ReportsService` into `apps/api/src/modules/reports/report-csv.ts`.
  - `ReportsService.exportCsv()` now delegates to `toReportCsv`, keeping report business orchestration separate from low-level CSV escaping/BOM formatting.
  - Added `scripts/test-reports-csv-helper-contract.js` to guard the helper extraction and prevent the private CSV methods from returning to the oversized service.
  - Verification covered the CSV helper contract, reports finance hybrid contract, report query validation, reports business-rules smoke, Docker API build/deploy, error/OpenAPI/correlation runtime smokes, and production healthcheck.

- Phase 4 correlation runtime smoke hardening:
  - Added `scripts/smoke-correlation-id.sh` and `scripts/test-correlation-id-smoke-contract.js`.
  - The smoke verifies safe incoming `x-correlation-id` values are echoed, unsafe values are replaced, missing values are generated, and the request log contains the correlation ID without sensitive field names.
  - The log probe uses `/auth/login` validation failure because guard-level `/auth/me` responses confirm middleware/header behavior but do not pass through the request logging interceptor.
  - The smoke retries `/auth/me` probes so it remains stable immediately after `docker compose up -d api`.
  - Verification covered the full Phase 4 contract set, correlation/error/OpenAPI runtime smokes, Docker API build/deploy, and production healthcheck.

- Phase 4 runtime smoke coverage hardening:
  - Upgraded `scripts/smoke-swagger-action-status.js` to derive expected OpenAPI routes from `scripts/test-action-endpoint-status-contract.js` instead of a narrow manual route list.
  - The Swagger action smoke now parses controller prefixes and method decorators, including files with multiple controller classes, and validates all guarded action endpoints expose `200` and not `201` in `/docs-json`.
  - Added `scripts/smoke-error-response-shape.js` and `scripts/test-error-response-smoke-contract.js` to validate runtime 401 and validation 400 error responses include the standardized fields and `x-correlation-id`.
  - Verification covered the full Phase 4 contract set, both runtime smokes, Docker API build/deploy, and production healthcheck.

- Phase 4 auth action/OpenAPI status hardening:
  - Extended the action status-code contract to cover Auth session actions: login, logout, and change-password.
  - Added explicit `@HttpCode(200)` to those endpoints so Swagger/runtime docs no longer expose Nest default `201` for session actions.
  - Added reusable `scripts/smoke-swagger-action-status.js` plus `scripts/test-swagger-action-status-smoke-contract.js` so OpenAPI action status smoke can be rerun after deploys.
  - The Swagger smoke script now retries and validates HTTP status/content-type before parsing JSON, avoiding false failures during API restart windows.
  - Verification covered source contracts, Docker API build/deploy, Swagger action-status smoke, data-scope verification, and production healthcheck.

- Phase 4 action/DTO/healthcheck completion:
  - Extended the action status-code contract to cover operation-voucher payment actions, tour close, FIT export/confirm/copy actions, and GIT/Land copy-services actions.
  - Added explicit `@HttpCode(200)` to those action/export endpoints so Swagger/runtime docs no longer expose Nest default `201` for non-create workflows.
  - Added `QuotationSmartLinkDto` and updated `QuotationsController.smartLink` to use an explicit body DTO instead of raw `@Body('enabled')`.
  - Added `scripts/test-quotations-smartlink-dto-contract.js` and `scripts/test-healthcheck-log-filter-contract.js`.
  - Updated `scripts/healthcheck.sh` log scanning to ignore expected structured 4xx `request_failed` entries from validation/RBAC smoke flows while still catching 5xx/error signatures.
  - Verification covered Phase 4 contracts, Docker API build/deploy, data-scope verification, Swagger action-status smoke, and production healthcheck.

- Phase 4 Files controller contract hardening:
  - Added `FileUploadBodyDto` and `FileObjectKeyQueryDto` for file upload scope, download key, and delete key inputs.
  - `FilesController` no longer uses raw `@Body('scope')`, raw `@Query('key')`, or `response: any`; file download response is typed with Node `ServerResponse`.
  - Added `scripts/test-files-controller-contract.js` to guard the Files controller DTO and response typing contract.
  - Verification covered the new Files controller contract and Docker API build.

- Phase 4 query/controller contract hardening:
  - Added explicit `ListToursQueryDto` and `CloseTourDto`; `ToursController` now uses DTOs for list query and close action body instead of raw `@Query('...')` parameters or inline body types.
  - Added explicit query DTOs for Customers, Finance, and Order Center list/export/dashboard/debt/cashflow/activity endpoints, removing the remaining controller-level `@Query() Record<string, string>` usage.
  - Added source contracts `scripts/test-tours-dto-contract.js` and `scripts/test-query-dto-contract.js` to guard the new DTO controller contracts.
  - Re-audited controllers after the change; no API controller still uses `Record<string, unknown>` body types, inline object body DTOs, or `@Query() Record<string, string>`.
  - Finance already has route-level wrapper services around the large finance service. Further Suppliers/Reports/Operations service splitting remains deferred unless a smaller, strongly covered extraction target is identified.

- Phase 4 performance index hardening:
  - Added `scripts/test-prisma-index-contract.js` to guard composite Prisma indexes for high-volume list/search/report paths.
  - Added migration `20260623170000_phase4_performance_indexes` and deployed it on the VPS database.
  - Index coverage now targets active order/booking/voucher lists, finance receipt/payment/invoice/cashflow lists and reports, customer CRM/profile rows, debt ledger grouping/list rows, operation forms/tasks/costs/payment requests, suppliers, quotations, and legacy tour quotes.
  - Verification covered the index contract, Prisma schema validation, and successful Prisma migration deploy.
  - Oversized service splits and generated API client work are deferred for now: the Phase 4 plan only permits service splitting where behavior is already strongly protected, and DTO contracts are still stabilizing across modules.

- Phase 4 logging/correlation hardening:
  - Added correlation ID middleware that accepts a safe `x-correlation-id` value or generates a UUID, stores it on the request, and mirrors it on the response header.
  - Added a global request logging interceptor that emits structured JSON log entries for completion/failure with event, correlationId, method, path, statusCode, durationMs, and errorName only.
  - The logging interceptor does not read or log request bodies, request headers, credentials, cookies, passwords, tokens, or secrets.
  - Verification covered the logging/correlation source contract and Docker API build.

- Phase 4 error response standardization:
  - Added a global `HttpErrorResponseFilter` so API `HttpException` responses include stable `statusCode`, `message`, `messages`, `error`, `code`, `path`, `method`, and `timestamp` fields.
  - Validation exceptions now include `messages` and `code: VALIDATION_ERROR` while preserving the existing `message` payload for compatibility.
  - The filter does not log request bodies or sensitive fields, and keeps runtime response shaping separate from business services.
  - Verification covered the new error response source contract and Docker API build.

- Phase 4 Customers DTO hardening:
  - Added explicit Customers body DTO classes for type/tag/campaign config writes, bulk tag/update, import rows, customer create/update, merge/transfer-owner, comments, care tasks, call logs, and opportunities.
  - Customers controller no longer exposes `Record<string, unknown>` request bodies; nested customer contacts/tasks/comments/calls/opportunities/import rows remain passed through to existing CustomersService validators.
  - Added a source contract guarding DTO usage plus customer status, common customer kind, care-task status, boolean, array, and scalar validation primitives.
  - Verification covered the new Customers DTO contract, Customers service flow script, Customers API flow script, and the API build.

- Phase 4 Finance DTO hardening:
  - Added explicit Finance body DTO classes for receipt/payment/invoice create-update, CSV import payloads, approve/reject/cancel action payloads, and customer/supplier debt adjustments.
  - Finance controller no longer exposes `Record<string, unknown>` request bodies; flexible amount/date/nested row parsing remains in FinanceService so existing frontend/import workflows keep their current formats.
  - Added a source contract guarding DTO usage plus receipt/payment/invoice/payment-method/debt-direction enum whitelists.
  - Verification covered the new Finance DTO contract, Finance controller permission contract, Finance helper contracts, Finance service flow script, action endpoint status contract, and the API build.

- Phase 4 Operations DTO hardening:
  - Added explicit Operations body DTO classes for operation form create/update/status/cancel, supplier payment request create/update/actions, and create-finance-payment actions.
  - Operations controller no longer exposes `Record<string, unknown>` request bodies; nested service/task/cost/payment-item arrays remain passed through to the existing OperationsService validators.
  - Added a source contract guarding DTO usage, status/payment-method enum whitelists, scalar string limits, and nested array pass-through.
  - Verification covered the new Operations DTO contract, action endpoint status contract, Operations controller contract, Operations service flow script, and the API build.

- Phase 4 Auth DTO hardening:
  - Added explicit Auth controller DTO classes for bootstrap, login, change-password, user management, and role management request bodies.
  - Auth controller no longer exposes high-risk `Record<string, unknown>` body signatures while AuthService keeps its existing normalization, audit, scope, and password-policy behavior.
  - Added a source contract guarding Auth DTO usage and validation primitives for strings, arrays, role/user statuses, password lengths, and email fields.
  - Verification covered the new Auth DTO contract, Auth controller permission contract, Auth cookie/session contract, Auth session and service flow scripts, and the API build.

- Phase 4 action endpoint status-code hardening:
  - Added a source contract that requires high-risk workflow/action endpoints to declare explicit `@HttpCode(200)` instead of relying on Nest defaults, especially POST action routes that otherwise return 201.
  - Standardized action/status endpoints across bookings, operations, suppliers, orders, quotes, quotations, commission reports, and finance approve/reject/cancel flows.
  - Refreshed the Operations controller contract after Phase 3 supplier-service deterministic ordering moved from an inline `{ createdAt: 'asc' }` include to `SUPPLIER_SERVICE_ORDER_BY`.
  - Verification covered the new status-code contract, operations/suppliers/finance/bookings/quotes controller contracts, and the API build.

- Phase 3 final verification hardening:
  - Data-scope verification now tracks the current bounded list signatures for tour guides and tour programs, and module-flow tests call GIT/Land/FIT list services through their DTO query contracts.
  - Added an idempotent system-role restore migration so empty/drifted databases regain the baseline `super_admin`, `sales`, `operation`, and `accounting` roles plus current RBAC/data-scope permissions.
  - Finance customer/supplier debt grouped rows still use database `groupBy` for balances, then compute aging from ledger entries for the selected bounded rows so overdue buckets remain accurate.
  - Supplier service includes now order service rows deterministically by created time, SKU, and id, preventing unstable typed-supplier service row ordering.
  - Verification covered data-scope/RBAC, self-seeding Phase 3 smokes, admin-required workflow/file/UI smokes with a temporary admin user, API Docker rebuild/restart, and export smoke.

- Phase 3 finance CSV export completeness hardening:
  - Finance receipt, payment, invoice, and cashflow CSV exports now query matching scoped rows directly instead of exporting from capped list payloads (`take: 1000`/`2000`).
  - Export filters and branch/department scope continue to reuse the same where builders as list endpoints, while list endpoints remain bounded for UI payload safety.
  - Finance helper contracts now guard export methods against regressing to capped list/cashflow payload reuse.

- Phase 3 revenue/profit grouped row accuracy hardening:
  - Revenue and profit report grouped rows now use scoped database order `groupBy` aggregates instead of grouping the capped 1000-order display list.
  - The shared order grouped-row helper now supports date, employee, agency, branch, department, market, and type groups; date groups are aggregated from DB grouped date rows into day keys.
  - Report query validation and reports business-rules smoke now guard revenue/profit grouped rows across all supported group keys.

- Phase 3 business/employee grouped report accuracy hardening:
  - Business summary `revenueByType`, `revenueByBranch`, and `profitByEmployee` now use scoped database order `groupBy` helpers instead of grouping the capped 1000-order display list.
  - Employee performance rows now use database grouped employee aggregates, while preserving average order value, after-commission profit, and paid-ratio calculations.
  - Finance report summary now overrides paid/remaining order snapshot fields with approved finance evidence totals, so TourKit imported paid snapshots do not inflate `paidAmount` or `paidCost`.
  - Report query validation contract and business-rules smoke now guard these paths.

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

- 2026-06-24 production backup hardening follow-up:
  - Found old expanded disaster backup staging directories under `/var/backups/smarttour/disaster` after archive creation, leaving config and backup data on disk longer than required.
  - Extended the backup artifact permissions contract first; RED failed because `scripts/disaster-backup.sh` did not remove `$work_dir`.
  - Updated disaster backups to verify `sha256sum -c "$archive.sha256"` before deleting the staging directory, then continue archive retention/offsite sync from the sealed archive artifacts.
  - Updated operations backup/reinstall docs and the production readiness tracker to record that disaster backup staging directories are removed after archive checksum verification.

- 2026-06-24 production security audit follow-up:
  - Found the live security audit checked private disaster archive artifacts but did not fail if expanded disaster backup staging directories reappeared.
  - Extended the security audit source contract first; RED failed because `scripts/security-audit.sh` lacked `check_disaster_backup_staging_dirs()`.
  - Added `OK_DISASTER_STAGING` / `FAIL_DISASTER_STAGING` audit coverage so production security checks assert there are no expanded `smarttour-disaster-*` staging directories under `/var/backups/smarttour/disaster`.

- 2026-06-24 production healthcheck backup follow-up:
  - Found `scripts/healthcheck.sh` verified the latest daily PostgreSQL dump age/checksum but did not verify disaster backup archive freshness/checksum.
  - Added a dedicated healthcheck backup contract first; RED failed because `DISASTER_BACKUP_DIR` and `OK_DISASTER_BACKUP` coverage were missing.
  - Updated healthcheck to verify the latest disaster backup archive under `/var/backups/smarttour/disaster`, fail on missing/stale/checksum-invalid archives, and default `DISASTER_BACKUP_MAX_AGE_HOURS` to 192.

- 2026-06-24 production healthcheck restore-drill follow-up:
  - Found `smarttour-restore-drill.timer` was enabled and the restore drill log contained `RESTORE_DRILL_OK`, but `scripts/healthcheck.sh` did not alert if the weekly restore drill became stale or failed.
  - Added a dedicated healthcheck restore-drill contract first; RED failed because `RESTORE_DRILL_LOG` / `OK_RESTORE_DRILL` coverage was missing.
  - Updated healthcheck to require the restore drill log, `RESTORE_DRILL_OK` marker, recent log age, and `smarttour-restore-drill.service` result `success`, defaulting `RESTORE_DRILL_MAX_AGE_HOURS` to 192.

- 2026-06-24 production ops log rotation follow-up:
  - Found SmartTour systemd services append operational logs under `/var/log/smarttour/*.log`, but the VPS had no `/etc/logrotate.d/smarttour` configuration.
  - Added an ops logrotate contract first; RED failed because `deploy/logrotate/smarttour` was missing.
  - Added a SmartTour logrotate config for `/var/log/smarttour/*.log`, installed it through `scripts/install-ops-schedule.sh`, and added `OK_LOGROTATE` / `FAIL_LOGROTATE` coverage to the live security audit.

- 2026-06-24 production ops log permission follow-up:
  - Found existing SmartTour operational logs and host security reports under `/var/log/smarttour` were `644` inside `755` directories, making them world-readable.
  - Added an ops log permissions contract first; RED failed because `scripts/install-ops-schedule.sh` still created `/var/log/smarttour` as `0755`.
  - Updated schedule installation, host report generation, and security audit coverage so SmartTour ops logs/reports are kept in `750` directories with `0640` files and audited via `OK_OPS_LOG_PERMS`.

- 2026-06-24 production ops service umask follow-up:
  - Found SmartTour ops systemd services still had the default `UMask=0022`, so newly recreated append logs could become world-readable even after log permission normalization.
  - Extended the ops log permissions contract first; RED failed because `deploy/systemd/smarttour-healthcheck.service` lacked `UMask=0027`.
  - Added `UMask=0027` to every SmartTour ops service and added `OK_OPS_SERVICE_UMASK` / `FAIL_OPS_SERVICE_UMASK` coverage to the live security audit.

- 2026-06-24 production healthcheck HTTP timeout follow-up:
  - Found `scripts/healthcheck.sh` bounded webhook alert delivery but route probes in `check_http()` still called curl without explicit connect/total timeouts.
  - Added a dedicated healthcheck HTTP timeout contract first; RED failed because `HTTP_CONNECT_TIMEOUT` coverage was missing.
  - Updated route probes to use configurable `HTTP_CONNECT_TIMEOUT`, `HTTP_MAX_TIME`, `HTTP_ATTEMPTS`, and `HTTP_RETRY_DELAY` values so slow endpoints cannot hang the health timer.

- 2026-06-24 production healthcheck Docker timeout follow-up:
  - Found healthcheck Docker/container probes used raw `docker inspect`, `docker logs`, `docker compose exec`, `docker exec`, and `docker ps` calls after HTTP probes were bounded.
  - Added a dedicated healthcheck Docker timeout contract first; RED failed because `DOCKER_CHECK_TIMEOUT` coverage was missing.
  - Updated healthcheck Docker/container probes to run through a configurable `DOCKER_CHECK_TIMEOUT=10s` wrapper and fail explicitly if log or port scans cannot return.
  - Updated the live `/etc/default/smarttour-ops` with `DOCKER_CHECK_TIMEOUT=10s` while preserving `600 root:root`, then verified healthcheck with the environment file sourced.

- 2026-06-24 production healthcheck systemd timeout follow-up:
  - Found healthcheck systemd probes still used raw `systemctl --failed` and `systemctl show`; `systemctl --failed` was hidden behind `|| true`, so systemd/DBus failures could become `OK_SYSTEMD`.
  - Added a dedicated healthcheck systemd timeout contract first; RED failed because `SYSTEMD_CHECK_TIMEOUT` coverage was missing.
  - Updated failed-unit and restore-drill result checks to use configurable `SYSTEMD_CHECK_TIMEOUT=10s`, with `FAIL_SYSTEMD unavailable` when failed-unit inspection cannot return.
  - Updated the live `/etc/default/smarttour-ops` with `SYSTEMD_CHECK_TIMEOUT=10s` while preserving `600 root:root`, then verified healthcheck with the environment file sourced.

- 2026-06-24 production security audit timeout follow-up:
  - Found `scripts/security-audit.sh` still used raw Docker, sshd, systemctl, and npm audit commands; Docker port inspection could degrade to `WARN_PORTS` instead of failing when Docker was unavailable.
  - Extended the existing security audit contract first; RED failed because `AUDIT_COMMAND_TIMEOUT` coverage was missing.
  - Updated the live audit to bound external probes with `AUDIT_COMMAND_TIMEOUT=10s` and `NPM_AUDIT_TIMEOUT=120s`, fail Docker/sshd/npm-audit unavailability explicitly, and keep systemd timer/umask checks bounded.

- 2026-06-24 production ops schedule installer timeout follow-up:
  - Found `scripts/install-ops-schedule.sh` still called `systemctl daemon-reload`, `enable --now`, and `list-timers` directly, so reinstall/setup could hang on systemd/DBus issues.
  - Added a dedicated ops installer systemd timeout contract first; RED failed because `OPS_SYSTEMD_TIMEOUT` coverage was missing.
  - Updated the installer to run systemd operations through `OPS_SYSTEMD_TIMEOUT=30s` and documented the setting in ops/security runbooks and the readiness tracker.

- 2026-06-24 production PostgreSQL backup timeout follow-up:
  - Found `scripts/backup-postgres.sh` still ran `docker exec ... pg_dump` directly, so a stuck Docker or dump process could hang the daily backup timer.
  - Extended the backup artifact contract first; RED failed because `POSTGRES_BACKUP_TIMEOUT` coverage was missing.
  - Updated daily PostgreSQL backups to run `pg_dump` through `POSTGRES_BACKUP_TIMEOUT=30m`, and documented the setting in the ops env template, backup runbook, and readiness tracker.
  - Updated the live `/etc/default/smarttour-ops` with `POSTGRES_BACKUP_TIMEOUT=30m` while preserving `600 root:root`, then verified timeout cleanup and a successful temporary backup run.

- 2026-06-24 production restore-drill timeout follow-up:
  - Found `scripts/restore-drill-postgres.sh` still used raw `docker exec` for `dropdb`, `createdb`, and `psql`, so a stuck restore command could hang the weekly restore-drill timer.
  - Extended the restore-drill safety contract first; RED failed because `RESTORE_DRILL_COMMAND_TIMEOUT` coverage was missing.
  - Updated restore drill PostgreSQL commands to run through `RESTORE_DRILL_COMMAND_TIMEOUT=30m`, and documented the setting in the ops env template, backup runbook, and readiness tracker.
  - Updated the live `/etc/default/smarttour-ops` with `RESTORE_DRILL_COMMAND_TIMEOUT=30m` while preserving `600 root:root`, then verified a fake Docker timeout probe and a successful live restore drill with a throwaway database.

- 2026-06-24 production disaster-backup timeout follow-up:
  - Found `scripts/disaster-backup.sh` still used raw Docker and Compose commands for logical dumps, Docker inventory, volume inspection, and Compose stop/start, so a stuck Docker/Compose call could hang the weekly disaster backup timer.
  - Extended the backup artifact permissions contract first; RED failed because `DISASTER_BACKUP_DOCKER_TIMEOUT` coverage was missing.
  - Updated disaster backup Docker commands to run through `DISASTER_BACKUP_DOCKER_TIMEOUT=30m` and Compose stop/start commands through `DISASTER_BACKUP_COMPOSE_TIMEOUT=10m`.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; fake Docker and Compose timeout probes confirmed stuck commands fail fast.

- 2026-06-24 production Nginx host-report timeout follow-up:
  - Found `scripts/nginx-host-report.sh` still called `docker logs` directly, and its `grep ... || true` pipeline could hide a stuck or unavailable Docker log read.
  - Extended the ops log permissions contract first; RED failed because `HOST_REPORT_DOCKER_TIMEOUT` coverage and a `docker_logs_unavailable` abort path were missing.
  - Updated the host report to collect Docker logs through `HOST_REPORT_DOCKER_TIMEOUT=10s`, abort explicitly with `NGINX_HOST_REPORT_ABORT docker_logs_unavailable` when logs cannot be read, and only tolerate an empty host grep result after Docker succeeds.
  - Updated the ops env template, security runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; fake Docker timeout and live report-dir probes confirmed fast aborts and private report files.

- 2026-06-24 production deploy Docker timeout follow-up:
  - Found `scripts/deploy-production.sh` still ran `docker compose build api web` and `docker compose up -d api web nginx` directly, so a stuck Docker build or service start could hang a manual production deploy.
  - Extended the GitHub Actions/deploy contract first; RED failed because `DEPLOY_DOCKER_BUILD_TIMEOUT` coverage was missing.
  - Updated production deploy to run Docker build through `DEPLOY_DOCKER_BUILD_TIMEOUT=45m` and Docker up through `DEPLOY_DOCKER_UP_TIMEOUT=10m`, while preserving existing phase logs and SmartLink guard ordering.
  - Updated the GitHub Actions runbook, production readiness tracker, and SmartLink source assertion; fake clean-repo deploy probes confirmed stuck build/up phases fail fast with timeout status `124`.

- 2026-06-24 production security hardening installer timeout follow-up:
  - Found `scripts/install-security-hardening.sh` still ran `sshd`, `systemctl reload ssh/sshd`, and `docker compose exec nginx` directly, so a post-reinstall hardening run could hang during SSH or Nginx validation/reload.
  - Extended the security audit contract first; RED failed because `SECURITY_INSTALL_COMMAND_TIMEOUT` coverage was missing.
  - Updated the hardening installer to run SSH validation/effective-config output, SSH reload, and Nginx test/reload commands through `SECURITY_INSTALL_COMMAND_TIMEOUT=10s`.
  - Updated the security runbook and production readiness tracker; verification used source contract and syntax checks without running the live installer to avoid unnecessary SSH/Nginx reloads during the remediation session.

- 2026-06-24 production deploy Prisma migration timeout follow-up:
  - Found `scripts/deploy-production.sh` still ran `npx prisma migrate deploy` directly, so a stuck Prisma migration process could hang a manual production deploy before Docker build/up.
  - Extended the GitHub Actions/deploy contract first; RED failed because `DEPLOY_PRISMA_MIGRATE_TIMEOUT` coverage was missing.
  - Updated production deploy to run Prisma migrations through `DEPLOY_PRISMA_MIGRATE_TIMEOUT=10m`, preserving the existing `DEPLOY_PHASE prisma_migrate_deploy` marker and deploy phase ordering.
  - Updated the GitHub Actions runbook and production readiness tracker; a fake clean-repo deploy probe confirmed a stuck Prisma migration fails fast with timeout status `124`.

- 2026-06-24 production SmartLink guard Docker fallback timeout follow-up:
  - Found `scripts/smartlink-legacy-audit.sh` falls back to raw `docker compose run` when local `node_modules` are unavailable, so the production deploy SmartLink guard could hang before Prisma migrations.
  - Extended the GitHub Actions/deploy contract first; RED failed because `SMARTLINK_AUDIT_DOCKER_TIMEOUT` coverage was missing.
  - Updated the SmartLink wrapper to run Docker fallback through `SMARTLINK_AUDIT_DOCKER_TIMEOUT=10m` while preserving the existing fast local Node path.
  - Updated the GitHub Actions runbook, SmartLink migration runbook, and production readiness tracker; a fake no-node/Docker-hang probe confirmed the fallback fails fast with timeout status `124`.

- 2026-06-24 production deploy Git sync timeout follow-up:
  - Found `scripts/deploy-production.sh` still ran `git fetch`, `git checkout`, and `git pull --ff-only` directly when `RUN_GIT_PULL=true`, so a stuck remote Git/network operation could hang deploy before SmartLink guard.
  - Extended the GitHub Actions/deploy contract first; RED failed because `DEPLOY_GIT_TIMEOUT` coverage was missing.
  - Updated production deploy to run Git sync commands through `DEPLOY_GIT_TIMEOUT=5m`, while leaving local worktree guard commands unchanged.
  - Updated the GitHub Actions runbook and production readiness tracker; a fake clean-repo deploy probe confirmed a stuck `git fetch` fails fast with timeout status `124`.

- 2026-06-24 production SmartLink guard local Node timeout follow-up:
  - Found `scripts/smartlink-legacy-audit.sh` now bounded Docker fallback but still executed the preferred local Node audit path with raw `exec node`, so a stuck Prisma/DB audit could hang deploy before Prisma migrations.
  - Extended the GitHub Actions/deploy contract first; RED failed because `SMARTLINK_AUDIT_NODE_TIMEOUT` coverage was missing.
  - Updated the SmartLink wrapper to run local Prisma-client detection and the local audit command through `SMARTLINK_AUDIT_NODE_TIMEOUT=10m`, while keeping the existing Docker fallback.
  - Updated the GitHub Actions runbook, SmartLink migration runbook, and production readiness tracker; a fake local-node hang probe confirmed the local path fails fast with timeout status `124`.

- 2026-06-24 preview deploy timeout follow-up:
  - Found `scripts/deploy-preview.sh` still ran raw `npm run build`, `docker compose build/up`, `docker rm`, and `docker run`, so a stuck local build or Docker operation could hang preview deploys.
  - Added a dedicated deploy-preview timeout contract first; RED failed because `PREVIEW_NPM_BUILD_TIMEOUT` coverage was missing.
  - Updated preview deploy to run npm builds through `PREVIEW_NPM_BUILD_TIMEOUT=20m`, Docker image builds through `PREVIEW_DOCKER_BUILD_TIMEOUT=30m`, and Docker rm/up/run commands through `PREVIEW_DOCKER_COMMAND_TIMEOUT=5m`.
  - Wired the contract into package scripts and CI, updated ops/readiness docs, and verified fake timeout probes for npm build, Docker build, and Docker run paths.

- 2026-06-24 offsite backup SCP timeout follow-up:
  - Found daily PostgreSQL backup sync and disaster archive sync used non-interactive SCP with connect/server-alive settings but no total command timeout, so a stuck transfer could still hang an offsite backup job.
  - Extended the backup offsite contract first; RED failed because `BACKUP_REMOTE_SCP_TIMEOUT` coverage was missing.
  - Updated daily backup sync to run SCP through `BACKUP_REMOTE_SCP_TIMEOUT=30m` and disaster archive sync through `DISASTER_BACKUP_REMOTE_SCP_TIMEOUT=60m`.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; fake SCP timeout probes confirmed both upload paths fail fast with status `124`.

- 2026-06-24 disaster backup host inventory timeout follow-up:
  - Found `scripts/disaster-backup.sh` still ran host inventory commands (`hostnamectl`, `ip`, `df`, `systemctl`, `crontab`) directly while building the disaster archive, so a stuck DBus/network utility could hang the weekly backup timer.
  - Extended the backup artifact contract first; RED failed because `DISASTER_BACKUP_HOST_COMMAND_TIMEOUT` coverage was missing.
  - Updated host inventory collection to run through `DISASTER_BACKUP_HOST_COMMAND_TIMEOUT=30s`, preserving the existing optional/non-fatal behavior for best-effort host snapshots.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake host-command timeout probe confirmed the backup fails fast with status `124`.

- 2026-06-24 disaster backup archive timeout follow-up:
  - Found `scripts/disaster-backup.sh` still ran local archive/checksum commands directly, including volume `tar` while the Compose stack is stopped. A stuck archive step could therefore keep production down until manual intervention.
  - Extended the backup artifact permissions contract first; RED failed because `DISASTER_BACKUP_ARCHIVE_TIMEOUT` coverage was missing.
  - Updated disaster backup archive creation, volume/config tar commands, archive checksum creation/verification, and SHA256 manifest generation to run through `DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m`.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake volume archive timeout probe confirmed the script exits with status 124 and the restart trap runs `docker compose up -d`.

- 2026-06-24 healthcheck backup checksum timeout follow-up:
  - Found `scripts/healthcheck.sh` still verified PostgreSQL and disaster backup SHA256 files with raw `sha256sum -c`, so a large or stuck archive read could hang the healthcheck timer.
  - Extended the healthcheck backup contract first; RED failed because `CHECKSUM_CHECK_TIMEOUT` coverage was missing.
  - Updated backup checksum verification to run through `CHECKSUM_CHECK_TIMEOUT=5m`, preserving existing `OK_BACKUP` / `OK_DISASTER_BACKUP` and checksum-failure behavior.
  - Updated the ops env template, observability runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake checksum wrapper probe confirmed stuck checksum commands return timeout status 124.

- 2026-06-24 backup checksum command timeout follow-up:
  - Found daily backup, backup sync, and restore-drill scripts still used raw `sha256sum` for checksum creation/verification, so stuck disk reads could hang scheduled backup/sync/restore jobs.
  - Extended backup artifact, offsite backup, and restore-drill safety contracts first; RED failed because `BACKUP_CHECKSUM_TIMEOUT` coverage was missing.
  - Updated `scripts/backup-postgres.sh`, `scripts/sync-latest-backup.sh`, and `scripts/restore-drill-postgres.sh` to run checksum work through `BACKUP_CHECKSUM_TIMEOUT=5m`.
  - Updated ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; fake timeout probes confirmed daily backup checksum and sync checksum return status 124, and restore-drill checksum timeout still triggers cleanup dropdb.

- 2026-06-24 disaster backup Git timeout follow-up:
  - Found `scripts/disaster-backup.sh` still ran Git metadata and bundle commands directly while building the weekly disaster archive. A stuck `git bundle create --all` could hang the disaster backup before the volume-consistency phase.
  - Extended the backup artifact permissions contract first; RED failed because `DISASTER_BACKUP_GIT_TIMEOUT` coverage was missing.
  - Updated disaster backup Git status, commit, remote, bundle, and manifest commit lookup to run through `DISASTER_BACKUP_GIT_TIMEOUT=5m`.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake Git bundle timeout probe confirmed status 124 and verified Compose stop is not reached when Git bundle hangs.

- 2026-06-24 production deploy local Git timeout follow-up:
  - Found `scripts/deploy-production.sh` still used raw local Git commands for dirty-worktree guards, untracked-file detection, and commit markers. A stuck local Git/index operation could hang a manual production deploy before the bounded remote Git sync.
  - Extended the GitHub Actions/deploy contract first; RED failed because bounded local Git guard coverage was missing.
  - Added `DEPLOY_LOCAL_GIT_TIMEOUT=30s` and `run_deploy_local_git`, then routed local dirty/staged/untracked checks and start/target/final commit markers through the bounded wrapper.
  - Updated the GitHub Actions runbook and production readiness tracker; a fake local Git timeout probe confirmed deploy aborts quickly at the dirty-worktree guard before SmartLink, Prisma, or Docker phases.

- 2026-06-24 backup gzip timeout follow-up:
  - Found backup and restore paths still used raw `gzip` for daily dump compression, disaster SQL compression, and restore-drill decompression. Stuck compression/decompression could hang scheduled backup or restore-drill jobs.
  - Extended backup artifact and restore-drill contracts first; RED failed because `BACKUP_COMPRESSION_TIMEOUT` coverage was missing.
  - Added `BACKUP_COMPRESSION_TIMEOUT=30m` wrappers for daily backup compression and restore-drill decompression, and routed disaster SQL gzip through the existing `DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m` wrapper.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; fake gzip timeout probes confirmed daily backup, disaster backup, and restore-drill paths return status 124, with restore cleanup still running.

- 2026-06-24 healthcheck backup file-scan timeout follow-up:
  - Found `scripts/healthcheck.sh` still used raw `find` pipelines to discover latest PostgreSQL and disaster backup artifacts. A stuck backup directory scan could hang the healthcheck timer before checksum verification.
  - Extended the healthcheck backup contract first; RED failed because `HEALTHCHECK_FILE_SCAN_TIMEOUT` coverage was missing.
  - Added `HEALTHCHECK_FILE_SCAN_TIMEOUT=30s` and `run_healthcheck_file_scan`, then routed PostgreSQL and disaster backup file discovery through the bounded wrapper.
  - Updated the ops env template, observability runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake file-scan wrapper probe confirmed stuck `find` returns timeout status 124.

- 2026-06-24 backup script file-scan timeout follow-up:
  - Found daily backup retention cleanup, backup sync latest-file discovery, and restore-drill latest-backup discovery still used raw `find`. Stuck backup directory scans could hang scheduled backup/sync/restore operations.
  - Extended backup artifact, offsite backup, and restore-drill contracts first; RED failed because `BACKUP_FILE_SCAN_TIMEOUT` coverage was missing.
  - Added `BACKUP_FILE_SCAN_TIMEOUT=30s` wrappers to `scripts/backup-postgres.sh`, `scripts/sync-latest-backup.sh`, and `scripts/restore-drill-postgres.sh`.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; fake timeout probes confirmed backup retention, sync discovery, and restore discovery return status 124 without SCP.

- 2026-06-24 security audit file-scan timeout follow-up:
  - Found `scripts/security-audit.sh` still used raw `find` for backup artifact permission scans, expanded disaster staging detection, and ops log/report permission scans. A stuck filesystem scan could hang the live security audit.
  - Extended the security audit contract first; RED failed because `AUDIT_FILE_SCAN_TIMEOUT` coverage was missing.
  - Added `AUDIT_FILE_SCAN_TIMEOUT=30s` and `run_audit_file_scan`, then routed backup, disaster staging, ops log, and host-report file scans through the bounded wrapper.
  - Updated the ops env template, security runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake file-scan wrapper probe confirmed stuck `find` returns timeout status 124.

- 2026-06-24 disaster backup file-scan timeout follow-up:
  - Found `scripts/disaster-backup.sh` still used raw `find` for disaster staging checksum manifest discovery and old archive retention cleanup. A stuck disaster backup directory scan could hang the weekly backup timer.
  - Extended the backup artifact permissions contract first; RED failed because `DISASTER_BACKUP_FILE_SCAN_TIMEOUT` coverage was missing.
  - Added `DISASTER_BACKUP_FILE_SCAN_TIMEOUT=30s` and `run_disaster_file_scan`, then routed staging manifest discovery and retention cleanup through the bounded wrapper.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake file-scan wrapper probe confirmed stuck `find` returns timeout status 124.

- 2026-06-24 Nginx host report file-scan timeout follow-up:
  - Found `scripts/nginx-host-report.sh` still used raw `find` for old host-report retention cleanup. A stuck security report directory scan could hang the daily host-report timer after writing the latest report.
  - Extended the ops log permissions contract first; RED failed because `HOST_REPORT_FILE_SCAN_TIMEOUT` coverage was missing.
  - Added `HOST_REPORT_FILE_SCAN_TIMEOUT=30s` and `run_host_report_file_scan`, then routed report retention cleanup through the bounded wrapper.
  - Updated the ops env template, security hardening runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake file-scan wrapper probe confirmed stuck `find` returns timeout status 124.

- 2026-06-24 healthcheck alert payload timeout follow-up:
  - Found `scripts/healthcheck.sh` still built webhook alert payloads with raw `hostname` and `node -e`. A stuck hostname lookup or local Node invocation could hang the healthcheck timer before the already-bounded webhook curl.
  - Extended the observability alerting contract first; RED failed because `HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT` coverage was missing.
  - Added `HEALTHCHECK_ALERT_PAYLOAD_TIMEOUT=5s` and `run_alert_payload_command`, then routed alert host lookup and JSON payload generation through the bounded wrapper.
  - Updated the ops env template, observability alerting runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake alert-payload wrapper probe confirmed stuck `node` returns timeout status 124.

- 2026-06-24 ops installer file-scan timeout follow-up:
  - Found `scripts/install-ops-schedule.sh` still used raw `find` to normalize existing SmartTour log and host-report file permissions. A stuck log directory scan could hang the installer before timer installation.
  - Extended the ops log permissions and ops installer timeout contracts first; RED failed because `OPS_FILE_SCAN_TIMEOUT` coverage was missing.
  - Added `OPS_FILE_SCAN_TIMEOUT=30s` and `run_ops_file_scan`, then routed log/report permission normalization scans through the bounded wrapper.
  - Updated backup/security runbooks, the production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake file-scan wrapper probe confirmed stuck `find` returns timeout status 124.

- 2026-06-24 healthcheck restore-drill file-read timeout follow-up:
  - Found `scripts/healthcheck.sh` still used raw `grep` and `stat` against `/var/log/smarttour/restore-drill.log`. A stuck log read could hang the healthcheck timer after backup checks.
  - Extended the healthcheck restore-drill contract first; RED failed because `HEALTHCHECK_FILE_READ_TIMEOUT` coverage was missing.
  - Added `HEALTHCHECK_FILE_READ_TIMEOUT=10s` and `run_healthcheck_file_read`, then routed restore-drill marker and mtime reads through the bounded wrapper.
  - Updated the ops env template, observability runbook, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake file-read wrapper probe confirmed stuck `grep` returns timeout status 124.

- 2026-06-24 security audit file-read timeout follow-up:
  - Found `scripts/security-audit.sh` still used raw `grep` and `stat` for `.env`, logrotate, Nginx config, SSH permissions, root mode, and backup/log directory mode checks. A stuck config or metadata read could hang the live security audit.
  - Extended the security audit contract first; RED failed because `AUDIT_FILE_READ_TIMEOUT` coverage was missing.
  - Added `AUDIT_FILE_READ_TIMEOUT=10s` and `run_audit_file_read`, then routed audit config reads, permission metadata reads, and in-memory grep checks through the bounded wrapper.
  - Updated the ops env template, security hardening runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake file-read wrapper probe confirmed stuck `grep` returns timeout status 124.

- 2026-06-24 healthcheck text-filter timeout follow-up:
  - Found `scripts/healthcheck.sh` still used raw `grep` filters over Docker inspect/exec/log output, systemd output, API/Web logs, and Docker port output. Stuck or oversized collected output could hang the healthcheck timer after bounded command collection.
  - Extended the healthcheck Docker timeout contract first; RED failed because `HEALTHCHECK_TEXT_FILTER_TIMEOUT` coverage was missing.
  - Added `HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s` and `run_healthcheck_text_filter`, then routed healthcheck grep filters through the bounded wrapper.
  - Updated the ops env template, observability runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake text-filter wrapper probe confirmed stuck `grep` returns timeout status 124.

- 2026-06-24 healthcheck host-command timeout follow-up:
  - Found `scripts/healthcheck.sh` still used raw host-local commands for root mode, disk usage, and failure-host lookup. A stuck `stat`, `df`, or `hostname` call could hang the healthcheck timer outside Docker/systemd wrappers.
  - Added a new healthcheck host timeout contract first and wired it into package scripts, CI source contracts, and the GitHub Actions contract; RED failed because `HEALTHCHECK_HOST_COMMAND_TIMEOUT` coverage was missing.
  - Added `HEALTHCHECK_HOST_COMMAND_TIMEOUT=10s` and `run_healthcheck_host_command`, then routed root mode, disk usage, and failure-host lookup through the bounded wrapper.
  - Updated the ops env template, observability runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake host-command wrapper probe confirmed stuck `stat` returns timeout status 124.

- 2026-06-24 Nginx host report text timeout follow-up:
  - Found `scripts/nginx-host-report.sh` still used raw `grep`, `cut`, `sed`, `sort`, `uniq`, `head`, `tail`, and `wc` while processing bounded Docker logs. A stuck or oversized log processing pipeline could hang the daily host-report timer.
  - Extended the ops log permissions contract first; RED failed because `HOST_REPORT_TEXT_TIMEOUT` coverage was missing.
  - Added `HOST_REPORT_TEXT_TIMEOUT=10s` and `run_host_report_text`, then routed host-report parsing and summary pipelines through the bounded wrapper.
  - Updated the ops env template, security hardening runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake text wrapper probe confirmed stuck `grep` returns timeout status 124.

- 2026-06-24 healthcheck backup ordering timeout follow-up:
  - Found `scripts/healthcheck.sh` used bounded `find` for latest PostgreSQL/disaster backup discovery but still used raw `sort -n | tail -1` to select the newest artifact.
  - Extended the healthcheck backup contract first; RED failed because backup discovery ordering did not route through `run_healthcheck_text_filter`.
  - Routed both PostgreSQL and disaster backup discovery ordering through `HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s`.
  - Updated observability/readiness docs; this reuses the existing live `HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s` setting.

- 2026-06-24 backup sync/restore ordering timeout follow-up:
  - Found `scripts/sync-latest-backup.sh` and `scripts/restore-drill-postgres.sh` used bounded `find` for latest backup discovery but still used raw `sort | tail -1`.
  - Extended the backup offsite and restore-drill safety contracts first; RED failed because `BACKUP_TEXT_FILTER_TIMEOUT` coverage was missing.
  - Added `BACKUP_TEXT_FILTER_TIMEOUT=10s`, `run_backup_text_filter`, and `run_restore_drill_text_filter`, then routed latest-backup ordering through the bounded wrappers.
  - Updated the ops env template, backup runbook, production readiness tracker, and live `/etc/default/smarttour-ops` while preserving `600 root:root`; a fake text-filter wrapper probe confirmed stuck `sort` returns timeout status 124.

- 2026-06-24 disaster backup text/manifest timeout follow-up:
  - Found `scripts/disaster-backup.sh` still used raw `sort -z` for SHA256 manifest ordering, raw `sort/tail/cut` for old archive retention selection, and raw `hostname`/`stat` in the disaster manifest.
  - Extended the backup artifact permissions contract first; RED failed because `DISASTER_BACKUP_TEXT_FILTER_TIMEOUT` coverage was missing.
  - Added `DISASTER_BACKUP_TEXT_FILTER_TIMEOUT=10s` and `run_disaster_text_filter`, routed manifest and retention ordering through the bounded wrapper, and routed manifest hostname/root mode through `run_disaster_host_command`.
  - Updated the ops env template, backup runbook, and production readiness tracker; live `/etc/default/smarttour-ops` now sets the same setting while preserving `600 root:root`, and a fake `sort` timeout probe returned status 124.

- 2026-06-24 backup remote key mode file-read timeout follow-up:
  - Found `scripts/sync-latest-backup.sh` and `scripts/disaster-backup.sh` still read remote SSH key mode with raw `stat -c '%a' "$key_file"` before offsite SCP.
  - Extended `npm run test:backup-offsite` and `npm run test:backup-artifact-permissions` first; RED failed because `BACKUP_FILE_READ_TIMEOUT` and `DISASTER_BACKUP_FILE_READ_TIMEOUT` coverage was missing.
  - Added bounded key-mode file-read wrappers for daily backup sync and disaster backup sync, plus docs/env template/readiness coverage.
  - Live `/etc/default/smarttour-ops` now sets both settings while preserving `600 root:root`, and fake `stat` timeout probes verified status 124 without running real backup or SCP jobs.

- 2026-06-24 security installer text-filter timeout follow-up:
  - Found `scripts/install-security-hardening.sh` still piped bounded `sshd -T` output into raw `grep -E` for effective SSH config display.
  - Extended `npm run test:security-audit` first; RED failed because `SECURITY_INSTALL_TEXT_FILTER_TIMEOUT` coverage was missing.
  - Added `SECURITY_INSTALL_TEXT_FILTER_TIMEOUT=10s` and `run_security_install_text_filter` for the effective-config grep, plus security runbook/readiness coverage.
  - A fake `grep` timeout probe verified status 124 without running the real security installer or reloading SSH/Nginx.

- 2026-06-24 production deploy script phase timeout follow-up:
  - Found `scripts/deploy-production.sh` still invoked the SmartLink guard and post-deploy healthcheck scripts directly at the deploy layer.
  - Extended `node scripts/test-github-actions-contract.js` first; RED failed because `DEPLOY_SMARTLINK_GUARD_TIMEOUT` and `DEPLOY_HEALTHCHECK_TIMEOUT` coverage was missing.
  - Added `DEPLOY_SMARTLINK_GUARD_TIMEOUT=10m`, `DEPLOY_HEALTHCHECK_TIMEOUT=5m`, `run_deploy_smartlink_guard`, and `run_deploy_healthcheck`, preserving the existing deploy phase order.
  - Verification used source contracts, shell syntax, and fake timeout probes only; real `scripts/deploy-production.sh` remains intentionally unrun.

- 2026-06-24 ops systemd unit timeout follow-up:
  - Found healthcheck, host-report, and PostgreSQL backup service units lacked explicit `TimeoutStartSec`, while disaster backup and restore drill service unit limits were shorter than some bounded script work.
  - Extended `npm run test:ops-log-permissions` first; RED failed because `smarttour-healthcheck.service` lacked `TimeoutStartSec=2min`.
  - Added explicit outer systemd timeouts: 2 minutes for healthcheck and host report, 45 minutes for PostgreSQL backup and restore drill, and 90 minutes for disaster backup.
  - Docs/readiness were updated; live systemd units were reinstalled/daemon-reloaded and now report 2min for healthcheck/host-report, 45min for PostgreSQL backup/restore-drill, and 1h 30min for disaster backup.

- 2026-06-24 ops systemd timeout alignment follow-up:
  - Found the first unit-level timeout pass was still too tight: healthcheck had `TimeoutStartSec=2min` while checksum verification can run for `CHECKSUM_CHECK_TIMEOUT=5m`, and restore/disaster jobs can legitimately run several bounded phases sequentially.
  - Extended the ops log permissions contract first; RED failed because `smarttour-healthcheck.service` did not include `TimeoutStartSec=10min`.
  - Raised outer service limits to 10 minutes for healthcheck, 120 minutes for restore drill, and 6 hours for disaster backup, leaving host report at 2 minutes and PostgreSQL backup at 45 minutes.
  - Live systemd units were reinstalled/daemon-reloaded and now report 10min for healthcheck, 2min for host report, 45min for PostgreSQL backup, 6h for disaster backup, and 2h for restore drill.

- 2026-06-24 disaster backup cleanup guard follow-up:
  - Found `scripts/disaster-backup.sh` still used direct recursive cleanup for the expanded staging directory and old archive staging directories.
  - Extended the backup artifact permissions contract first; RED failed because `BACKUP_ROOT` normalization and cleanup guard coverage was missing.
  - Added backup root validation plus guarded `safe_remove_disaster_path` / `safe_remove_disaster_archive` helpers so cleanup only removes `smarttour-disaster-*` paths under `DISASTER_BACKUP_ROOT`.
  - Verification used source contracts, shell syntax, and fake guard probes only; real disaster backup remains intentionally unrun.

- 2026-06-24 disaster backup cleanup basename guard follow-up:
  - Tightened the cleanup guard after noticing the initial full-path wildcard check was broader than necessary for a root-run script.
  - Extended the backup artifact permissions contract first; RED failed because cleanup helpers did not split `target_dir` and `target_base`.
  - Updated cleanup helpers to require `target_dir == BACKUP_ROOT` and `target_base` matching `smarttour-disaster-*`, so nested/traversal-style strings cannot pass the guard.
  - Verification used source contracts, shell syntax, and fake guard probes only; real disaster backup remains intentionally unrun.

- 2026-06-24 Phase 1 code-review remediation:
  - Started execution of `docs/superpowers/plans/2026-06-24-code-review-remediation-phases.md` on branch `fix/phase-1-remediation`.
  - Auth login hardening now returns one sanitized `401` message (`Thông tin đăng nhập không hợp lệ`) for missing users and wrong passwords, verifies passwords before exposing locked/inactive account states, and throttles repeated invalid attempts by IP plus normalized identifier.
  - Finance reject audit now has explicit `rejectedBy`/`rejectedAt` fields on receipts, payments, and invoices; reject paths derive the actor from the request user and no longer write approval audit fields.
  - Legacy `NOT VALID` constraints were audited with 0 FK/check violations, then validated through migration `20260624194500_validate_legacy_constraints`; finance reject audit columns were deployed through migration `20260624193000_finance_reject_audit_fields`.
  - Added focused contracts: `scripts/test-auth-login-security-contract.js`, `scripts/test-finance-reject-audit-contract.js`, and `scripts/test-db-constraint-validation-contract.js`; updated existing auth/finance service flow scripts for the new expectations.

- 2026-06-25 Phase 2 code-review remediation:
  - Continued execution of `docs/superpowers/plans/2026-06-24-code-review-remediation-phases.md` on branch `fix/phase-1-remediation`.
  - Supplier read endpoints now pass `request.user` into service reads; supplier financial fields are omitted unless the user has `*` or `finance.payment.view`.
  - Public quotation SmartLinks now require enabled links, `APPROVED` status, and a future `expiredDate`; invalid/disabled/expired/non-approved links return the same generic 404.
  - Finance query DTO now validates approval/type/payment-method query enums with `@IsIn`.
  - Generic `/files/upload` now authorizes known entity scopes before MinIO writes, preventing arbitrary/orphan scope uploads.
  - Added focused contracts for supplier sensitive fields, SmartLink expiry/status, finance query validation, and file upload scope authorization; updated supplier source contracts for request-user plumbing.

- 2026-06-25 Phase 3 code-review remediation:
  - Continued `docs/superpowers/plans/2026-06-24-code-review-remediation-phases.md` on branch `fix/phase-1-remediation` after Phase 1-2 commits.
  - Global HTTP error filtering now catches unknown/non-HTTP exceptions, maps Prisma `P2002`/`P2025` to sanitized database error codes, returns a generic Vietnamese 500 message for unexpected failures, and includes `correlationId` in the response body.
  - Request logging now records failed requests through `Logger.error` with `errorCode`, `errorStack`, `correlationId`, method/path/status/duration, while continuing to avoid request body/header/credential fields.
  - Login UI now maps 429 to a retry-later message, keeps 401 generic, and only falls back to structured validation messages instead of blindly displaying raw backend `message`.
  - Supplier common/typed/hotel UIs now hide tax/bank/debt/price-policy financial fields unless `finance.payment.view` is present and avoid sending hidden financial fields back in create/update payloads.
  - Added Phase 3 source contracts for error/logging behavior, auth login UI, and supplier UI permission gating; updated existing error/logging/supplier contracts for the new response shape and gated payload helpers.

- 2026-06-25 Phase 4 code-review remediation:
  - Continued `docs/superpowers/plans/2026-06-24-code-review-remediation-phases.md` on branch `fix/phase-1-remediation` after Phase 3 commit `29ddea8`.
  - Extracted shared query validation helpers into `apps/api/src/modules/query-validation.ts`; finance and report query DTOs now reuse the helper-backed trim/uppercase/enum utilities while preserving existing enum contracts.
  - Extracted supplier financial projection into `apps/api/src/modules/suppliers/supplier-projection.ts`, keeping `finance.payment.view` masking behavior out of the large supplier service.
  - Refactored `FilesService.assertObjectAccess()` to use a root dispatch map while preserving customer/supplier/guide/FIT/finance authorization behavior.
  - Added `scripts/audit-orphan-files.js`, a dry-run-first MinIO orphan object audit that prints object key, inferred root/entity, reason, size, and lastModified; deletion requires explicit `--delete`.
  - Updated ops/readiness docs with the orphan audit workflow and warning not to automate deletion.

- 2026-06-25 Phase 4 file smoke follow-up:
  - Created/reset the live `admin` account (`admin@smarttour.local`) with the existing `super_admin` role so authenticated file smoke tests can run.
  - Ran `npm run smoke:files` against the live local API with the new admin credential; the smoke completed with `SMOKE_FILES_OK`.
  - The credential itself is intentionally not stored in repo or Memory Bank; rotate/change it after handoff.

- 2026-06-25 Profile page follow-up:
  - Added `/profile` as a dedicated account profile page reachable from the top-right account menu item `Thông tin người dùng`.
  - The page loads `/api/auth/me`, shows account/role/data-scope details, and provides an inline change-password form using `/api/auth/change-password` with current/new/confirm password fields.
  - Added `scripts/test-profile-page-contract.js` to guard the route, dropdown link, password form, and scoped profile styles.


- 2026-06-25 Review finding fixes follow-up:
  - Executed `docs/superpowers/plans/2026-06-25-review-finding-fixes.md` on branch `fix/phase-1-remediation` for targeted backend/API/database review findings after the four remediation phases.
  - Finance invoice type inputs now align with Prisma `FinanceInvoiceType` (`VAT`, `NO_VAT`, `ADJUSTMENT`, `REPLACEMENT`).
  - Auth management user listing now uses a management serializer that omits profile identity/bank PII, while `/auth/me` still returns the current user's own profile fields for the profile page.
  - Supplier payment request update/delete/submit now use `operation.payment-request.manage`; RBAC migration and frontend permission registry were updated for the new permission.
  - Order-center query DTO/service now validate payment/cost status enums and reject invalid date strings before Prisma filtering.
  - Supplier file upload/delete now passes request-user context to service lookups; customer update now requires `replaceNestedCollections: true` before replacing nested contacts/tags/care/comment/call/opportunity collections.
  - Supplier smoke manage-role seed now includes `finance.payment.view` so preservation assertions can inspect intentionally sensitive supplier fields.
  - `npm run smoke:files` was rerun with a temporary `ADMIN_PASSWORD` environment variable and completed with `SMOKE_FILES_OK`; the credential was not stored.


- 2026-06-25 Review fixes deploy follow-up:
  - During `npx prisma migrate deploy`, migration `20260625120000_operation_payment_request_manage_permission` initially failed because it inserted `RolePermission.roleId` from role code (`super_admin`/`operation`) instead of the live role IDs (`role_super_admin`/`role_operation`).
  - Fixed the migration to join `Role` by `code` and insert `r.id`; marked the failed migration attempt rolled back with Prisma and reapplied successfully.
  - Updated RBAC contract coverage for the migration shape and updated operations smoke seed so the request-create smoke session has `operation.payment-request.manage` before testing submit.
  - Rebuilt Docker images for API/Web, restarted `api`, `web`, and `nginx`, and verified health/smoke checks after deploy.

- 2026-06-25 Module-by-module review fix sweep follow-up:
  - Ran the full review-fix test list by module after the earlier remediation phases: DB/RBAC/data scope, Auth/Security, Operations, Suppliers, Finance, Customers, Orders/Bookings, Quotes/Quotations, Tours/Programs/Guides, Reports/Commission, Files/Storage, UI/Profile, and Observability/Ops.
  - Fixed `scripts/smoke-operations-ui.js` to default `API_URL` to the local API (`http://127.0.0.1:4000/api`) while proxying browser requests from the production API base, avoiding nginx API rate-limit false negatives in long UI smoke runs; added `scripts/test-operations-ui-smoke-contract.js`.
  - Corrected executable bits for shell smoke/contract scripts that are invoked directly: `scripts/test-suppliers-hotel-contract.sh` and `scripts/smoke-quotes-quotations.sh`.
  - Aligned order action status semantics: order copy creates a new order and returns 201; settle/unlock and tour copy-services actions remain 200. Updated contracts/smokes accordingly.
  - Updated quotation smoke coverage for the Phase 2 SmartLink rule: draft SmartLinks return 404 publicly, approved enabled SmartLinks load public-safe fields, and client-supplied workflow fields remain ignored.
  - Added query enum uppercase transforms for common tour list `type` and `status`, preserving lowercase query compatibility while invalid enum values still return 400.
  - Refreshed stale source contracts for FIT export headers, file upload authorization, report CSV helper BOM/CRLF coverage, and security-audit logrotate timeout wrappers.
  - Verification passed module-by-module plus final health/security checks. Admin password was only passed through temporary environment variables and was not stored.

- 2026-06-25 Healthcheck log-scan false-positive follow-up:
  - Fresh post-sweep `scripts/healthcheck.sh` failed only on `FAIL_LOG api has recent error signature` while all containers, HTTP, DB, Redis, backup, restore-drill, and security checks were healthy.
  - Root cause was a successful structured request log whose test-data path contained `BKG-ERROR-...`; the existing scan already ignored structured 4xx `request_failed` logs but still grepped `error|exception|failed` inside successful request paths.
  - Extended `scripts/test-healthcheck-log-filter-contract.js` first, observed RED, then updated `recent_logs_for_scan()` to ignore structured `"event":"request_completed"` lines while still keeping 5xx/unstructured error signatures visible.
  - Verification passed: `node scripts/test-healthcheck-log-filter-contract.js` and `bash scripts/healthcheck.sh`.

- 2026-06-25 Docker cache maintenance follow-up:
  - Added daily Docker cache maintenance via `scripts/docker-cache-maintenance.sh` and `smarttour-docker-cache-maintenance.timer` to prune BuildKit cache older than 24h and unused images older than 72h without touching volumes.
  - Added `scripts/test-docker-cache-maintenance-contract.js` to guard the maintenance script, systemd unit/timer, installer wiring, package script, CI contract, and docs.

- 2026-06-25 Business logic review fix follow-up:
  - Tightened quotation workflow guards so pending-approval quotations are no longer editable, SmartLink publishing is limited to approved non-expired quotations, and duplicate convert/order-code races return a business conflict.
  - Tightened operation form mutation paths so DONE/CANCELLED forms reject updates and status transitions run under a row lock before transition checks.
  - Tightened operation-voucher payment reconciliation so approved FinancePayment links must match the voucher supplier/order/tour and generated finance payments derive branch/department scope from the voucher context.
  - Tightened order lifecycle maps so COMPLETED/CANCELLED orders cannot be reopened through the generic status endpoint.
  - Added `scripts/test-business-logic-guard-contract.js` and aligned the order service flow expectations with terminal order states.
  - Follow-up nuance: SmartLink status/expiry guards apply when enabling; disabling remains available after the quotation passes normal scoped lookup.
  - VPS follow-up verification after SmartLink disable nuance passed: Prisma generate, API build/lint, business-logic/quotes/SmartLink/concurrency contracts, order/operations/operation-voucher service flows, `git diff --check`, and `scripts/healthcheck.sh`.
  - Local verification passed: `npm run prisma:generate`, `npm run build --workspace @smarttour/api`, `npm run lint --workspace @smarttour/api`, `node scripts/test-business-logic-guard-contract.js`, `node scripts/test-quotes-backend-contract.js`, `node scripts/test-quotations-smartlink-expiry-contract.js`, `node scripts/test-phase1-operation-payment-request-concurrency-contract.js`, and `git diff --check`.
  - Docker-backed service flow scripts were not run locally because Docker Desktop is not running; direct Git Bash execution with `REPO_DIR` override reached repo setup, then requires Docker/Postgres containers.


- 2026-06-25 SmartTour performance follow-up:
  - Investigated reported slowness on the VPS: public login/root/auth probes were fast, resources were healthy, but API logs showed authenticated bursts around order-center, quotations, customers, and repeated `/api/auth/me` calls.
  - Reduced client permission-request burst by making `usePermissions()` reuse stored auth data immediately, dedupe concurrent `/api/auth/me` refreshes, and revalidate in the background with a short cache TTL.
  - Reduced dashboard DB query fan-out for default order-center and quotation dashboards by using DB-side aggregate queries; existing Prisma count/aggregate fallback remains for complex scoped/filter cases.
  - Added `scripts/test-performance-guard-contract.js` to guard permission dedupe and dashboard aggregate behavior.
  - Rebuilt/restarted API and web containers on the VPS and verified `HEALTHCHECK_OK`; post-deploy public timings remained sub-200ms and raw dashboard aggregate benchmarks were ~0-2ms after warm-up.


- 2026-07-07 Request logging severity follow-up:
  - During VPS readiness log review, structured 400/404 smoke-test responses were found in the API log at Nest `ERROR` level even though they were expected validation/RBAC/client errors.
  - Updated `RequestLoggingInterceptor` so `request_failed` entries with status 400-499 are logged with `Logger.warn`, while 5xx/unexpected failures continue to use `Logger.error` and the existing correlation/error-code/stack gating behavior is preserved.
  - Updated `scripts/test-logging-correlation-contract.js` to guard the 4xx severity split.

- 2026-07-08 Finance report performance follow-up:
  - Reduced `/api/reports/finance` service work by using lightweight Prisma `select` projections for finance order/receipt/payment/cashflow detail queries instead of hydrating full related entities.
  - Split standalone customer/supplier debt reports from the finance-screen debt detail path so public debt report endpoints keep their 1000-row cap while the finance screen builds only `FINANCE_REPORT_DETAIL_LIMIT` detail rows.
  - Updated performance/query-validation contracts to guard lightweight finance selects, finance detail caps, and the helper split.
  - Container-image service profiling improved `/reports/finance` direct warm runs from roughly 545ms before selector work to roughly 226-256ms after the final changes; response payload remains about 839KB because the frontend contract still returns the same capped detail arrays.

- 2026-07-08 Finance report lazy-view follow-up:
  - Added optional `financeView` query support for `/api/reports/finance` so the frontend can load finance detail tabs independently while preserving the legacy full payload when `financeView` is omitted.
  - Supported views are `overview`, `orders`, `receipts`, `payments`, `customer-debt`, `supplier-debt`, `reconciliation`, and `all`; CSV export continues to use the full finance payload.
  - Updated the Reports UI to request only the active finance sub-view, merge sub-view responses into existing report state, and keep filter/reset/tab reload behavior aligned with the selected view.
  - Live VPS timings after container deploy: legacy full payload remains about 839KB and ~254-265ms warm; `overview` is ~1.6KB/~57ms, and detail views are materially smaller/faster than the full response.
  - Verification passed before commit: performance guard, finance hybrid contract, report permissions/query-validation contracts, API/Web lint and builds, Docker API/Web rebuild, and `scripts/healthcheck.sh`.

- 2026-07-08 Finance sub-view request trim follow-up:
  - Found one remaining frontend request fan-out after finance lazy-view deployment: switching a finance sub-view still refetched `/api/reports/overview` even though only the finance detail view changed.
  - Updated `ReportsClient` so `reason === 'finance-view'` skips the global overview request, preserves the existing overview state, and fetches only the selected finance sub-view.
  - Added contract coverage in `scripts/test-performance-guard-contract.js`; RED confirmed the missing `shouldLoadOverview` guard before the frontend fix, then GREEN passed after the scoped change.
  - Rebuilt/restarted the web deployment path on the VPS; Docker Compose also recreated API due service dependencies, and post-deploy `scripts/healthcheck.sh` passed.

- 2026-07-08 Order-center limit alias follow-up:
  - Live probe showed the real order-center page path is healthy (`compact=true&take=100` around 66KB/22ms), but conventional `limit=20` queries were ignored and returned the default order-center row count/payload.
  - Added `limit` as a bounded alias for `take` on the order-center list query, with `take` remaining the priority when both are supplied.
  - Added RED/GREEN coverage in `scripts/test-order-center-query-contract.js` and verified API query DTO contracts plus API lint/build before deploy.
  - Rebuilt/restarted API on the VPS; post-deploy probe confirmed `limit=20` returns 20 compact rows (~13KB) and `take` still wins over `limit` when both are present.

- 2026-07-08 List limit alias follow-up:
  - Live limit audit found several list endpoints accepted `take` but ignored conventional `limit`, causing `limit=20` callers to receive default larger payloads: suppliers hotels/restaurants, operation vouchers, bookings, customers, and finance receipts/payments.
  - Added validated `limit` aliases while preserving existing `take` behavior and priority when both parameters are present.
  - Added `scripts/test-list-limit-alias-contract.js`; RED confirmed missing aliases before the fix, then GREEN passed after the scoped DTO/service/controller updates.
  - Rebuilt/restarted API on the VPS. Post-deploy live probe confirmed `limit=20` returns 20 rows for the affected endpoints, and `take=5&limit=20` still returns 5 rows.

- 2026-07-08 Pagination offset alias follow-up:
  - Live pagination probe found `offset=1` was ignored on bookings and operation-vouchers, returning the first row while `skip=1` returned the second row.
  - Added `offset` as an alias for `skip` with `skip` remaining the priority when both are present; customer list now also applies the already-declared `skip`/`offset` pagination instead of only limiting rows.
  - Extended `scripts/test-list-limit-alias-contract.js`; RED confirmed missing offset aliases before the fix, then GREEN passed after DTO/controller/service updates.
  - Rebuilt/restarted API on the VPS. Post-deploy live probe confirmed `offset=1` matches `skip=1` for bookings, operation vouchers, and customers.

- 2026-07-08 Workspace performance follow-up:
  - Reduced workspace dashboard finance payload by replacing the legacy full /api/reports/finance call with financeView=customer-debt, which still carries finance base summary plus the customer-debt rows used by the page.
  - Bounded workspace receipt/payment widget fetches to take=20 and take=10 instead of the finance module default rows.
  - Added performance/permission contract coverage for the lighter workspace calls.

- 2026-07-08 Finance report debt permission follow-up:
  - Found a remaining debt-permission gap in the lazy finance report flow: non-debt finance views could still carry customer/supplier debt balances in summary for users with finance.cashflow.view but without finance.debt.view.
  - Tightened /api/reports/finance query handling so omitted legacy full payload, all, customer-debt, and supplier-debt require finance.debt.view in addition to the existing report/cashflow permissions.
  - Added service-level gating in financeBase so overview/orders/receipts/payments/reconciliation skip customer/supplier debt summary queries unless the user has finance.debt.view; balances fall back to 0 when debt is not permitted.
  - Workspace data now loads the customer-debt finance card only when both finance.cashflow.view and finance.debt.view are present.
  - Verification/deploy passed on the VPS: report/workspace/performance contracts, report query validation, API/Web lint and builds, Docker API/Web rebuild, healthcheck, builder prune, and post-prune healthcheck.

- 2026-07-08 Customer debt permission follow-up:
  - Found a second debt-permission leak outside reports: customer dashboard/detail exposed customer debt aggregates to users with customer.view/customer.manage but without finance.debt.view, and /api/customers/:id/debts only required customer.view.
  - Tightened /api/customers/:id/debts to require both customer.view and finance.debt.view.
  - Customer dashboard and customer detail now keep normal CRM visibility but zero/skip debt payloads unless the user has finance.debt.view; direct debt payload remains available to permitted users.
  - Customers UI now hides dashboard/detail debt widgets without finance.debt.view.
  - Verification/deploy passed on the VPS: new customer debt permission contract, customer client permissions, role/route permission contracts, customer DTO/service/API tests, API/Web lint and builds, Docker API/Web rebuild, healthcheck, builder prune to 0B build cache, and post-prune healthcheck.

- 2026-07-08 Reports overview debt-count permission follow-up:
  - Found another aggregate debt leak in /api/reports/overview: supplierDebtCount was computed and returned for users with report.view even without finance.debt.view.
  - Reports overview now skips supplier debt count computation unless the user has finance.debt.view; unauthorized payloads receive 0 for that aggregate.
  - Reports UI hides the supplier debt count metric unless canViewDebtReports is true.
  - Verification/deploy passed on the VPS: reports permission/performance/finance-hybrid/query-validation contracts, workspace contracts, API/Web lint and builds, Docker API/Web rebuild, healthcheck, builder prune to 0B build cache, and post-prune healthcheck.

- 2026-07-08 Supplier sensitive-search permission follow-up:
  - Found a supplier sensitive-field side channel: responses masked tax/bank/debt/price fields without finance.payment.view, but list search still matched taxCode and hotel bank fields for supplier.view users.
  - Supplier common/typed/hotel search now only includes sensitive supplier fields when canViewSupplierFinancialFields(user) is true; public supplier search fields remain unchanged.
  - Extended supplier sensitive-field contract to inspect generated Prisma where clauses for view-only versus finance.payment.view users.
  - Refreshed stale supplier bounded-take contracts to the existing take ?? limit behavior from the list-limit alias work.
  - Verification/deploy passed on the VPS: supplier sensitive/common/hotel/typed/UI contracts, supplier smoke, API/Web lint and builds, Docker API rebuild, healthcheck, builder prune to 0B build cache, and post-prune healthcheck.

- 2026-07-08 CSV export formula-injection follow-up:
  - Found a spreadsheet formula injection risk in CSV exports: finance, customer, commission, report, order-center, and FIT tour CSV writers only quoted cells, so user-controlled values beginning with =, +, -, @, tab, or CR could be interpreted as formulas by spreadsheet apps.
  - Added a shared CSV export helper that consistently quotes cells and prefixes risky spreadsheet formula cells with an apostrophe while preserving Date/object serialization behavior needed by existing exports.
  - Moved the affected CSV exports to the shared helper: finance receipts/payments/invoices/cashflow, customers, commission reports, reports, order center, and FIT tour exports.
  - Added `scripts/test-csv-export-formula-guard-contract.js`; RED confirmed the vulnerable finance CSV output and local quote-only helpers, then GREEN passed after the shared helper change.
  - Verification passed on the VPS before deploy: API build, CSV formula guard contract, finance/native XLSX export contracts, finance helper contracts, API lint/typecheck, and git diff check.
  - Post-deploy API Docker rebuild and healthcheck passed; Docker builder cache was pruned back to 0B. `scripts/smoke-exports.sh` requires AUTH_TOKEN or ADMIN_PASSWORD and was not run in this session because no credential was available.

- 2026-07-08 Reports supplier-history scoped access follow-up:
  - Found that reports supplier history applied the generic branch/department helper directly to OperationVoucher even though OperationVoucher has no branch/department columns.
  - Added relation-based OperationVoucher scoping through linked order, tour, or booking.customer so branch/department-scoped users do not hit invalid Prisma filters and cannot see unrelated vouchers.
  - Refreshed the reports CSV helper contract to match the shared CSV export helper introduced for formula-injection protection.
  - Verification/deploy passed on the VPS: report query validation, report permission/finance-hybrid/CSV contracts, CSV formula guard, API build/lint, Docker API rebuild, healthcheck, and docker builder prune to 0B build cache.

- 2026-07-08 Quotations date validation follow-up:
  - Found that quotation date fields accepted impossible date-only values such as 2026-02-31 because the service delegated to JavaScript Date parsing, which can roll dates forward instead of rejecting them.
  - Added strict calendar-date validation for YYYY-MM-DD/ISO-date-prefix quotation fields before Date construction, preserving valid Date/ISO inputs while rejecting impossible calendar days.
  - Added `scripts/test-quotations-date-validation-contract.js` to guard invalid created/expired/departure/return/expected-payment dates before create transaction work starts.
  - Verification passed on the VPS: quotation date contract, quotes backend contract, SmartLink expiry/DTO/client contracts, business logic guard contract, API build/lint, and git diff check.

- 2026-07-08 Tour guide upload policy follow-up:
  - Found that tour guide file upload was the only normal file endpoint still using a raw FileInterceptor with a hard-coded 10 MB limit instead of the shared upload policy.
  - Tour guide uploads now use fileUploadInterceptorOptions(), so max upload size, MIME/extension filtering, and early interceptor rejection stay aligned with the rest of the file endpoints.
  - Extended scripts/test-files-controller-contract.js to guard against reintroducing the raw tour-guide upload interceptor.
  - Verification passed on the VPS: files controller contract, API build/lint, upload scope contract, file service error/core flows, finance attachment contracts, supplier file contract, and git diff check.

- 2026-07-08 Supplier financial write permission follow-up:
  - Found that supplier list/detail masked tax/bank/debt/price fields without finance.payment.view, but supplier mutation responses still returned raw sensitive fields and sensitive write payloads could be submitted by supplier.manage-only users.
  - Supplier common, hotel, and typed mutation controllers now pass request.user into service methods.
  - Supplier mutation services now reject submitted supplier financial fields without finance.payment.view and mask supplier mutation responses using the same projection as list/detail.
  - Extended supplier sensitive/controller/typed contracts to cover mutation response masking, ForbiddenException on forbidden sensitive writes, and request.user delegation.
  - Verification passed on the VPS: API build/lint, supplier sensitive/controller/typed/common/hotel/DTO/generic/i18n/file/client/UI contracts, route/role/security/data-access contracts, and git diff check.

- 2026-07-08 Finance debt adjustment link-integrity follow-up:
  - Found manual customer/supplier debt adjustments only scoped linked order/tour but did not verify the linked entity belonged to the adjusted customer/supplier.
  - Customer debt adjustments now reject order links for another customer and require tour links to relate through the tour order or TourCustomer CRM link.
  - Supplier debt adjustments now reject order/tour links unless the supplier is present through order operation/sales items, operation vouchers, tour suppliers/services, or tour costs.
  - Extended `scripts/test-finance-service-flows.sh` with mismatched customer/order and supplier/order RED cases.
  - Verification/deploy passed on the VPS: finance service flow, API build/lint, finance DTO/controller/rules/side-effect contracts, Docker API rebuild, HEALTHCHECK_OK, and docker builder prune to 0B build cache.

- 2026-07-08 Quote combo data-scope follow-up:
  - Found `createComboQuote` accepted users with `quote.manage` but without any data-scope permission, creating branch/department-tagged combo rows through raw `user.branch`/`user.department` instead of the shared write-scope helper.
  - Quote combo creation now uses `applyWriteDataScope`, so users without `data.scope.*`/`data.scope.all` are rejected and branch/department values are injected only for the actual granted scope.
  - Added a RED/GREEN high-a data-access contract for no-scope combo creation and refreshed static quote/data-scope contracts.
  - Verification passed on the VPS: high-a data access, API build/lint, quotes backend contract, data-scope audit, route permissions, security audit, and git diff check.

- 2026-07-08 Order customer snapshot data-scope follow-up:
  - Found scoped order create/update could link and snapshot an out-of-scope CRM customer because OrderCustomerSnapshotService used an unscoped Customer findUnique.
  - Added high-a RED/GREEN coverage for scoped order customer links and changed order customer snapshot lookup to apply branch/department data scope with request.user.


- 2026-07-08 Customer auto-link data-scope follow-up:
  - Found that branch-scoped customer create/update could auto-link orphan business rows outside the user's scope when matching phone/email/name, because linkExistingData did not receive request.user.
  - Customer auto-link now scopes direct branch/department models (orders, quotations, finance receipts) before assigning customerId, while preserving legacy linking for orphan rows without scope metadata.
  - Added RED/GREEN coverage in scripts/test-customers-service.sh for an out-of-scope orphan order that must remain unlinked.


- 2026-07-08 Supplier allotment override data-scope follow-up:
  - Found that branch/department-scoped users could call supplier allotment override, changing global inventory without an order/booking/tour link to enforce data scope.
  - Allotment override now requires unrestricted data scope (`data.scope.all` or `*`); scoped lock/confirm/release behavior remains link-scoped through order/booking/tour allocations.
  - Added RED/GREEN coverage in `scripts/test-data-scope-module-flows.sh` for scoped override rejection.


- 2026-07-08 Auth profile date validation follow-up:
  - Found auth profile `dateOfBirth` accepted impossible date-only values because `Date.UTC` rolled invalid calendar days forward.
  - Auth date parsing now validates YYYY-MM-DD and DD/MM/YYYY style inputs by round-tripping year/month/day before persisting.
  - Added RED/GREEN coverage in `scripts/test-auth-service-flows.sh` for invalid `dateOfBirth` rejection.


- 2026-07-09 Reports date validation follow-up:
  - Found reports date filters accepted impossible calendar values such as 2026-02-31 because JavaScript Date parsing rolled them forward before DB filtering.
  - ReportsService now validates the YYYY-MM-DD calendar prefix before Date construction and preserves local start/end-of-day behavior for valid date-only filters.
  - Added RED/GREEN coverage in scripts/test-report-query-validation.sh for invalid report date rejection before Prisma query work.
  - Verification passed on the VPS: report query validation, reports CSV helper, finance-hybrid and permission contracts, reports business smoke, CSV formula guard, native XLSX export contract, API build/lint, and git diff check.


- 2026-07-09 Order-center date validation follow-up:
  - Found order-center date filters used JavaScript Date parsing after DTO validation, so impossible calendar values could roll forward before filtering orders.
  - OrderCenterService now validates the YYYY-MM-DD calendar prefix with UTC round-trip checks before Date construction while preserving existing filter boundary behavior.
  - Extended scripts/test-order-center-query-contract.js to guard calendar rollover protection in queryDate().
  - Verification passed on the VPS: order-center query/permission contracts, list limit alias, performance guard, API build/lint, and git diff check.


- 2026-07-09 Finance query date validation follow-up:
  - Found finance query filters accepted impossible calendar dates such as 2026-02-31 because queryDate() relied on JavaScript Date parsing, which can roll invalid dates forward.
  - FinanceService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction, covering receipts, payments, invoices, cashflow, and debt reports through the shared helper.
  - Added RED/GREEN coverage in scripts/test-finance-service-flows.sh for customer debt invalid calendar from-date rejection.
  - Verification passed on the VPS: finance service flows, finance query/controller/DTO/rules/side-effect/high-B contracts, CSV formula guard, native XLSX export contract, API build/lint, and git diff check.


- 2026-07-09 Commission report date validation follow-up:
  - Found commission report from/to filters accepted impossible calendar dates because the service date helper used JavaScript Date parsing and previously ignored invalid values.
  - CommissionReportsService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip and rejects invalid report dates with BadRequestException before querying.
  - Added RED/GREEN coverage in scripts/test-commission-reports-security.sh for invalid calendar from-date rejection.
  - Verification passed on the VPS: commission reports security/client contracts, CSV formula guard, native XLSX export contract, route permission audit/test, API build/lint, and git diff check.


- 2026-07-09 Customers date validation follow-up:
  - Found customer date parsing accepted impossible calendar dates such as 2026-02-31 for dateOfBirth and customer created-date filters because the shared helper relied on JavaScript Date parsing.
  - CustomersService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction.
  - Added RED/GREEN coverage in scripts/test-customers-service.sh for invalid customer dateOfBirth rejection.
  - Verification passed on the VPS: customers service/API/DTO contracts, customer permission/debt contracts, CSV formula guard, API build/lint, and git diff check.

- 2026-07-09 Operation voucher ISO date validation follow-up:
  - Found operation voucher serviceDate/paymentDate accepted impossible ISO calendar dates because parseDate only round-tripped date-only input.
  - OperationVouchersService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction.
  - Added RED/GREEN coverage in scripts/test-operation-vouchers-service.sh for invalid ISO serviceDate/paymentDate rejection.
  - Verification/deploy passed on the VPS: operation vouchers service, operation vouchers client/auth contracts, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-09 Operations ISO date validation follow-up:
  - Found operation form task dueDate and supplier payment request paymentDate accepted impossible ISO calendar dates because OperationsService.date() relied on JavaScript Date parsing.
  - OperationsService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction.
  - Added RED/GREEN coverage in scripts/test-operations-service-flows.sh for invalid ISO dueDate/paymentDate rejection.
  - Verification/deploy passed on the VPS: operations service flows, operations controller contract, operation payment request concurrency contract, business logic guard contract, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-09 Quotes ISO date validation follow-up:
  - Found quote tour dates and quote combo item checkIn accepted impossible ISO calendar dates because QuotesService.dateValue() relied on JavaScript Date parsing.
  - QuotesService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction.
  - Added RED/GREEN API smoke coverage in scripts/smoke-quotes-quotations.sh for invalid ISO tour bookingDate and combo checkIn rejection.
  - Verification/deploy passed on the VPS: smoke quotes/quotations, quotes backend/test-coverage contracts, quote tour/combo client contracts, quotation SmartLink expiry contract, API build/lint, git diff check, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-09 Suppliers ISO date/datetime validation follow-up:
  - Found supplier typed metadata datetime fields and contact birthday accepted impossible ISO calendar dates because validation relied on JavaScript Date parsing.
  - SuppliersService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip for datetime metadata and optional contact dates before Date construction.
  - Added RED/GREEN smoke coverage in scripts/smoke-suppliers.sh for invalid ISO depositDeadline and contact birthday rejection; smoke error output now includes supplierCode/name context for failed supplier requests.
  - Verification/deploy passed on the VPS: smoke suppliers, supplier common/controller/helper/i18n/hotel/typed/DTO/client/file/generic contracts, API build/lint, git diff check, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-09 Order mapper ISO date validation follow-up:
  - Found order root/nested dates accepted impossible ISO calendar dates because order-data-mapper parseOrderDate() relied on JavaScript Date parsing.
  - parseOrderDate() now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction.
  - Added RED/GREEN coverage in scripts/test-order-service-flows.sh for invalid ISO startDate rejection and non-persistence.
  - Verification/deploy passed on the VPS: order service flows, business logic guard, order-center query/permission contracts, data-scope module flows, tour type APIs, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-09 Finance write-date ISO validation follow-up:
  - Found finance write DTO dates such as invoice issuedDate accepted impossible ISO calendar dates because FinanceService.date() relied on JavaScript Date parsing.
  - FinanceService.date() now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction while preserving valid ISO datetime inputs.
  - Added RED/GREEN coverage in scripts/test-finance-service-flows.sh for invalid ISO invoice issuedDate rejection.
  - Verification/deploy passed on the VPS: finance service flows, finance query/controller/DTO/rules/audit/export/file contracts, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.


- 2026-07-09 Tour guides ISO/date validation follow-up:
  - Found guide birthday/date-only and schedule datetime-local inputs accepted impossible calendar dates because TourGuidesService date helpers relied on JavaScript Date rollover.
  - TourGuidesService now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before Date construction for guide profile, card/document, and schedule dates.
  - Added RED/GREEN coverage in scripts/test-tour-guides-api.sh for invalid birthday and schedule calendar dates.
  - Verification/deploy passed on the VPS: tour guides API/client contracts, data-scope module flows, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.


- 2026-07-09 Finance import date validation follow-up:
  - Found finance import row helpers accepted impossible calendar payment/document/transfer dates because importDate() only used JavaScript Date parsing.
  - finance-import importDate() now validates YYYY-MM-DD/ISO date prefixes with a UTC round-trip before accepting import row dates, adding defense before FinanceService write validation.
  - Added RED/GREEN coverage in scripts/test-finance-service-flows.sh for direct receipt/payment import-row helper rejection and CSV import rejection of impossible paymentDate.
  - Verification/deploy passed on the VPS: finance service flows, finance helper/controller/XLSX/query contracts, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.


- 2026-07-09 TourKit finance voucher import date validation follow-up:
  - Found TourKit finance voucher import accepted impossible DMY/YMD dates such as 31/02/2026 because parseDate() used Date.UTC without calendar round-trip validation.
  - scripts/import-tourkit-finance-vouchers.js now validates parsed day/month/year before creating UTC-noon dates, preventing silent rollover in imported receipt/payment voucher data.
  - Added RED/GREEN coverage in scripts/test-tourkit-finance-vouchers-import.sh for bad receipt payment-date rejection before normal dry-run/import/idempotency assertions.
  - Verification passed on the VPS: TourKit finance vouchers import test, import script syntax check, finance helper contract, API build/lint, git diff check, HEALTHCHECK_OK, and docker builder prune to 0B.


- 2026-07-09 TourKit operation form import date validation follow-up:
  - Found TourKit operation form import accepted impossible DMY/YMD dates such as 31/02/2026 because parseDate() used Date.UTC without calendar round-trip validation.
  - scripts/import-tourkit-operation-forms.js now validates parsed day/month/year before creating UTC-noon dates, preventing silent rollover in imported operation services/vouchers.
  - Added RED/GREEN coverage in scripts/test-tourkit-operation-forms-import.sh for bad service-date rejection before normal dry-run/import/idempotency assertions.
  - Verification passed on the VPS: TourKit operation forms import test, import script syntax check, operations service flows, business logic guard contract, API build/lint, git diff check, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-09 TourKit remaining import date validation follow-up:
  - Found TourKit bookings/orders/customers/users/finance-services imports still accepted impossible DMY/YMD dates such as 31/02/2026 because their parseDate() helpers relied on Date.UTC or JavaScript Date parsing without calendar round-trip validation.
  - Added UTC-noon round-trip validation to those remaining TourKit import scripts; finance-services now validates receipt/payment/service date fields before audit/dry-run as well as during write paths.
  - Added RED/GREEN coverage in scripts/test-tourkit-import-date-validation.sh for bad date rejection across the five remaining import scripts.
  - Verification passed on the VPS: node --check for changed import scripts, TourKit import date validation contract, TourKit bookings preserve-existing test, TourKit orders tour-sync test, finance-services dry-run against real import payloads, API build/lint, and git diff check.

- 2026-07-09 Auth ISO dateOfBirth validation follow-up:
  - Found AuthService user profile dateOfBirth still accepted impossible ISO datetime values such as 2026-02-31T00:00:00.000Z because optionalDate() only round-tripped date-only YYYY-MM-DD before falling back to JavaScript Date parsing.
  - AuthService optionalDate() now validates YYYY-MM-DD prefixes followed by either end-of-string or T, covering ISO datetime user payloads before Date construction.
  - Added RED/GREEN coverage in scripts/test-auth-service-flows.sh for impossible ISO dateOfBirth rejection.
  - Verification passed on the VPS: auth service flows, auth DTO contract, smoke RBAC workflows, API build/lint, and git diff check.

- 2026-07-09 Common tour lifecycle follow-up:
  - Found common Tour PATCH could reopen a CANCELLED tour back to RUNNING, and the close endpoint could complete a cancelled tour because ToursService only loaded the row before applying lifecycle writes.
  - ToursService now rejects status changes out of CANCELLED and rejects close on CANCELLED tours, keeping cancelled tours terminal.
  - Added RED/GREEN coverage in scripts/test-tour-type-apis.sh for common tour cancel, blocked reopen, and blocked close after cancellation.
  - Verification passed on the VPS: Tour type API suite, API build/lint, and git diff check.

- 2026-07-09 Typed tour lifecycle follow-up:
  - Found GIT and LandTour typed endpoints could reopen a common Tour from CANCELLED back to RUNNING because TourCoreService.updateRoot did not enforce the lifecycle rule used by the generic ToursService endpoint.
  - TourCoreService.updateRoot now rejects status changes out of CANCELLED before updating the shared Tour root, so typed tour modules inherit the same terminal cancellation behavior.
  - Added RED/GREEN coverage in scripts/test-tour-type-apis.sh for GIT and LandTour cancel-then-reopen attempts through typed endpoints.
  - Verification/deploy passed on the VPS: tour type API suite, route permissions, phase4 cleanup contract, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-09 Operation voucher active finance payment guard follow-up:
  - Found operation vouchers could still be edited/deleted after createPaymentVoucher created an active FinancePayment in PENDING state because assertEditable only checked paid operation voucher history.
  - OperationVouchersService now blocks update/delete while linked non-deleted FinancePayment rows are DRAFT, PENDING, or APPROVED, preventing stale pending payment amount/scope from drifting away from the source voucher.
  - Added RED/GREEN coverage in scripts/test-operation-vouchers-service.sh for update/delete rejection when an active finance payment exists.
  - Verification passed on the VPS: operation vouchers service, operation voucher client/auth contracts, business logic guard contract, API build/lint, and git diff check.

- 2026-07-10 Tour lifecycle terminal-status follow-up:
  - Found common Tour PATCH could reopen COMPLETED tours to RUNNING and SETTLED tour roots could be pulled back by generic close/update or typed module updates.
  - Tour lifecycle checks now live in shared TourCore helpers so generic ToursService, GIT/LandTour typed endpoints, and workflow-derived FIT root updates enforce COMPLETED -> SETTLED only, CANCELLED terminal, and SETTLED terminal.
  - Added RED/GREEN API contract coverage in scripts/test-tour-type-apis.sh for common Tour, FIT cross-endpoint root settlement, GIT, and LandTour terminal lifecycle behavior.
  - Verification/deploy passed on the VPS: tour type API suite, FIT root contract, business logic guard, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Finance soft-delete action follow-up:
  - Found soft-deleted draft FinanceReceipt/FinancePayment rows could still be approved because approve/reject/cancel action lookups used scoped id filters without deletedAt: null.
  - Finance receipt/payment approve, reject, and cancel action reads now require deletedAt: null, matching detail/list behavior and preventing postings/ledger side effects on deleted documents.
  - Added RED/GREEN coverage in scripts/test-finance-service-flows.sh for deleted receipt/payment approve rejection.
  - Verification passed on the VPS: finance service flows, finance rules/helper/controller/reject-audit/write-allowlist contracts, API build/lint.


- 2026-07-10 Operations cancel concurrency follow-up:
  - Found OperationForm cancel still checked terminal status and active supplier payment requests before opening the write transaction, unlike status changes that already lock the row.
  - OperationsService.cancelForm now locks the OperationForm row with FOR UPDATE, re-reads the scoped form inside the transaction, and checks active supplier payment requests through the same transaction client before writing CANCELLED.
  - Added RED/GREEN coverage in scripts/test-phase1-operation-payment-request-concurrency-contract.js for cancel row locking and transactional blocking-request checks.
  - Verification passed on the VPS: operation payment request concurrency contract, business logic guard contract, operations service flows, API build/lint.


- 2026-07-10 Supplier payment request concurrency follow-up:
  - Found SupplierPaymentRequest update/delete/submit/reject/approve/create-finance-payment flows could read scope/status before the transaction and then write without locking the request row.
  - OperationsService now locks SupplierPaymentRequest rows with FOR UPDATE and re-reads scoped request data inside the transaction before status checks, item replacement, deletion, ledger posting, or finance-payment linking.
  - Expanded scripts/test-phase1-operation-payment-request-concurrency-contract.js with RED/GREEN coverage for request row locking and scoped in-transaction re-reads.
  - Verification passed on the VPS: operation payment request concurrency contract, operations service flows, business logic guard contract, API build/lint.


- 2026-07-10 Operation voucher write-lock follow-up:
  - Found OperationVouchersService.update/remove checked editability from a pre-transaction detail snapshot, so active finance payments or payment history could race in before the write.
  - Operation voucher update/delete now lock the voucher row with FOR UPDATE, re-read scoped voucher state inside the transaction, and run assertEditable after the lock before changing voucher data or soft-deleting.
  - resolveLinks and ensureLinksScoped can now use the transaction client for update write flows.
  - Added RED/GREEN coverage in scripts/test-business-logic-guard-contract.js for operation voucher update/delete row locking.
  - Verification passed on the VPS: business logic guard contract, operation vouchers service flow/schema test, operation vouchers client/auth contracts, API build/lint.


- 2026-07-10 Quotation write-lock follow-up:
  - Found QuotationsService update/remove/submit/approve/reject/smartLink read quotation status before writing without locking the row, while convert already used FOR UPDATE.
  - Quotation write/status flows now lock the Quotation row with FOR UPDATE, re-read scoped quotation state inside the transaction, and write status logs through the same transaction client.
  - Updated SmartLink expiry contract test to mock the new transaction path.
  - Found quote smoke auth could prefer SMARTTOUR_BOOTSTRAP_KEY from .env over an already seeded ADMIN_PASSWORD and fail before fallback login; smoke now uses bootstrap only when ADMIN_PASSWORD is absent.
  - Added RED/GREEN coverage in scripts/test-quotes-backend-contract.js for quotation write/status row locking and quote smoke admin fallback behavior.
  - Verification passed on the VPS: API build/lint, quotes backend contract, quotation SmartLink expiry/date contracts, and scripts/smoke-quotes-quotations.sh.


- 2026-07-10 Booking write-lock follow-up:
  - Found BookingsService.update/remove checked operationForm/usage guards from a pre-write snapshot, so operation forms, operation vouchers, or allotment locks could race in before the booking write/delete.
  - Booking update/delete now lock the Booking row with FOR UPDATE, re-read scoped mutation state inside the transaction, and resolve linked references plus usage checks through the same transaction client.
  - Updated booking status lock contract to cover update/remove write-lock behavior; also made the SmartLink guard contract whitespace-insensitive after the quotation transaction follow-up.
  - Verification passed on the VPS: booking status lock contract, bookings service flow, business logic guard, quotes backend contract, quotation SmartLink expiry contract, API build/lint, and git diff check.
  - Deploy verification passed on the VPS: Docker API rebuild/restart, HEALTHCHECK_OK, docker builder prune to 0B; smoke-business-workflows skipped because ADMIN_PASSWORD is not set in .env.


- 2026-07-10 Customer MERGED status and legacy link follow-up:
  - Found Customer create/update allowed direct status MERGED, bypassing the merge endpoint that sets mergedIntoId and transfers related business rows.
  - CustomerBodyDto now exposes only ACTIVE/INACTIVE for create/update bodies; CustomersService rejects direct MERGED status while merge() remains the only path that marks a source customer MERGED.
  - While verifying the customer service flow, the existing orphan legacy link assertions exposed that scoped customer creation could not claim unlinked TourQuote/Booking/FitTour/FinanceInvoice rows because the scope helpers required relations that are null on orphan rows.
  - linkExistingData now still scopes rows that already have order/tour/customer/receipt relations, but can claim fully orphan legacy rows by matching phone/email/name inside the create/update transaction.
  - Verification passed on the VPS: customer DTO contract, customer service flow, customer API flow, API build/lint, and git diff check.
  - Deploy verification passed on the VPS: Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Supplier allotment row-lock follow-up:
  - Found supplier deactivate/delete and hotel allotment lock flows did not share a supplier row lock, so a manual/order allotment allocation could race with supplier INACTIVE/soft-delete and leave active allocations on an inactive/deleted supplier.
  - SuppliersService now locks the Supplier row with FOR UPDATE before status transitions, hotel deactivation guards, manual allotment locks, and soft-delete usage checks.
  - Order hotel auto-lock now filters active suppliers and locks the owning Supplier row before reserving SupplierAllotment inventory.
  - Added RED/GREEN coverage in scripts/test-business-logic-guard-contract.js and updated supplier contracts to expect locked.status transition checks.
  - Verification/deploy passed on the VPS: business logic guard, supplier common/typed/generic/hotel suites, order service flow, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Auth management write-lock follow-up:
  - Found AuthService.updateUser and updateRole used pre-transaction User/Role snapshots for scope, permission, system-role, and super_admin guards before writing management changes.
  - updateUser now locks and re-reads the target User row with FOR UPDATE inside the transaction before manageability/scope/role checks and role replacement.
  - updateRole now locks and re-reads the target Role row with FOR UPDATE inside the transaction before system-role, super_admin wildcard, and permission mutation checks.
  - Added RED/GREEN coverage in scripts/test-auth-management-write-lock-contract.js for auth management row locking and in-transaction re-read behavior.
  - Verification/deploy passed on the VPS: auth management write-lock contract, auth DTO/controller contracts, auth service flows, auth management data, security module, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Finance draft write-lock follow-up:
  - Found FinanceReceipt/FinancePayment/FinanceInvoice draft update/delete paths checked status from a pre-transaction detail snapshot before writing, so approve/reject/cancel/delete could race in before the draft write.
  - Finance receipt/payment/invoice update/delete now lock the row with FOR UPDATE, re-read scoped state inside the transaction, and run final-state guards before updating data, unlinking supplier payment requests, or soft-deleting.
  - Added RED/GREEN coverage in scripts/test-finance-write-lock-contract.js for in-transaction row locking and scoped re-read behavior on all six draft write paths.
  - Verification/deploy passed on the VPS: finance write-lock contract, finance helper contract, finance service flows, finance DTO/controller contracts, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Finance attachment write-lock follow-up:
  - Found finance receipt/payment/invoice attachment upload/delete paths checked final-state guards from a pre-write snapshot and then changed attachment metadata/file rows without locking the finance document.
  - Attachment metadata writes now lock the owning finance row with FOR UPDATE, re-read scoped state inside the transaction, and run final-state guards before updating receipt/payment attachment metadata or creating/deleting invoice file rows.
  - Updated attachment/file error-flow contracts to cover transaction-client writes while preserving object cleanup and rollback behavior.
  - Verification/deploy passed on the VPS: finance attachment write-lock contract, phase1/phase2 attachment contracts, finance draft write-lock contract, finance service flows, file-service error flows, finance DTO/controller contracts, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Tour program structure write-lock follow-up:
  - Found TourProgramsService structural writes checked booking/itinerary/service counts before writes without locking the TourProgram row, and createItineraryDay did not block structural changes when the tour program already had bookings.
  - Tour program update/remove and itinerary create/update/remove now run inside transactions, lock the owning TourProgram row with FOR UPDATE, and re-check structural guards before duration changes, deletes, day-number changes, or itinerary creation.
  - Added RED/GREEN coverage in scripts/test-tour-programs-write-lock-contract.js and scripts/test-tour-programs-service.sh for locked structural writes and createItineraryDay booking conflicts.
  - Verification/deploy passed on the VPS: tour programs write-lock contract, tour programs service flow, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Tour terminal data-edit guard follow-up:
  - Found TourCore only guarded terminal lifecycle changes when status was present, so completed/cancelled/settled tours could still receive non-status data edits through common Tour updates; typed GIT/LandTour detail fields had the same gap.
  - TourCore now rejects non-status data edits when the current Tour status is COMPLETED, CANCELLED, or SETTLED, while still allowing status-only COMPLETED -> SETTLED settlement.
  - Follow-up RED exposed scoped users were blocked from status-only settlement because applyWriteDataScope stamps branch/department into the update payload; TourCore and typed/FIT callers now pass the original client-requested fields into terminal guards so server-applied scope fields do not count as data edits.
  - Verification/deploy passed on the VPS: scripts/test-tour-type-apis.sh, node scripts/test-business-logic-guard-contract.js, scripts/test-data-scope-module-flows.sh, scripts/test-fit-tour-root-contract.sh, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Commission sync write-lock follow-up:
  - Found CommissionReportsService.syncFromOrders read existing CommissionEntry status/paymentStatus before updating without a transaction or row lock, while approve/pay/reject/revoke already coordinate through FOR UPDATE.
  - Existing commission sync updates now run inside a transaction, lock the CommissionEntry row by orderId with FOR UPDATE, re-read it inside data scope, and re-check PENDING/UNPAID before recalculating commissionAmount/remainingAmount.
  - syncData centralizes commission row calculation so both create and locked update paths use the same formula while update remainingAmount is based on the locked paidAmount.
  - Verification/deploy passed on the VPS: scripts/test-commission-reports-security.sh, node scripts/test-commission-reports-client-contract.js, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Supplier file data-scope follow-up:
  - Found FilesService supplier upload/download/delete parent lookups checked supplier.manage/supplier.view permissions but did not apply branch/department data scope, unlike customer, guide, fit-tour, and finance file handlers.
  - Supplier file upload scope and supplier file access now use branchDepartmentScopeWhere on Supplier parent lookups, so scoped users cannot upload/access/delete files for suppliers outside their data scope or without required scope values.
  - Expanded scripts/test-file-upload-scope-contract.js with RED/GREEN source and behavior coverage for supplier file data-scope enforcement.
  - Verification/deploy passed on the VPS: file upload scope contract, files controller contract, files service core, file service error flows, suppliers file contract, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Supplier file scope regression correction:
  - Review found the previous supplier file data-scope follow-up injected branchDepartmentScopeWhere<Prisma.SupplierWhereInput> into generic FilesService supplier parent lookups. Supplier has no branch/department columns, so scoped users could hit Prisma runtime validation errors on /files upload/download/delete for supplier files.
  - FilesService supplier parent/file lookups now use Supplier id + deletedAt only; supplier files remain protected by supplier.view/supplier.manage permissions and metadata ownership checks.
  - scripts/test-file-upload-scope-contract.js now asserts supplier file lookups never inject branch/department fields and covers scoped supplier upload with/without a user branch value.
  - Verification/deploy passed on the VPS: file upload scope contract, files controller contract, files service core, file service error flows, suppliers file contract, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Legacy quotes write-lock follow-up:
  - Found legacy QuotesService tour quote and combo quote write/status paths checked status from a pre-write snapshot or unblocked transaction read before update/delete/status changes.
  - TourQuote update/delete/approve/reject/convert now lock the TourQuote row with FOR UPDATE, re-read scoped state inside the transaction, and run status guards after the lock.
  - QuoteCombo update/delete/create-quote/create-order/recalculate now lock the QuoteCombo row with FOR UPDATE, re-read scoped state inside the transaction, and run status guards after the lock.
  - Expanded scripts/test-quotes-backend-contract.js with RED/GREEN coverage for legacy quote row-lock helpers and in-transaction re-read usage.
  - Verification/deploy passed on the VPS: quotes backend/client/coverage contracts, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Finance order snapshot row-lock follow-up:
  - Found finance receipt/payment approval and cancellation side effects recomputed Order paidAmount/paidCost from an unlocked Order snapshot.
  - Concurrent approvals/cancellations for the same order could lose one update and leave order payment/cost snapshots inconsistent with approved finance documents.
  - finance-order-links now locks the Order row with SELECT ... FOR UPDATE before reading and recomputing receipt/payment snapshots in applyOrderReceipt/applyOrderPayment.
  - Expanded scripts/test-finance-write-lock-contract.js with RED/GREEN coverage for the shared Order row lock and lock-before-read order.
  - Verification/deploy passed on the VPS: finance write-lock contract, finance attachment write-lock contract, finance helper contracts, finance service flows, business logic guard, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Operation voucher payment lock-order follow-up:
  - Found OperationVouchersService.addPayment locked OperationVoucher before FinancePayment, while FinanceService approve/cancel payment locks FinancePayment before reconciling OperationVoucher.
  - Concurrent manual voucher payment recording and finance approval/cancellation could deadlock due to inverted lock order.
  - addPayment now locks FinancePayment through lockFinancePaymentForVoucherRecording before locking/re-reading the OperationVoucher row, matching finance reconciliation lock order.
  - Expanded scripts/test-business-logic-guard-contract.js with RED/GREEN coverage for FinancePayment -> OperationVoucher lock ordering.
  - Verification/deploy passed on the VPS: business logic guard, operation voucher service/schema/client contracts, finance service flows, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Orders write/lifecycle row-lock follow-up:
  - Found OrdersService update/remove/updateStatus/settle/unlock loaded mutable order state before the transaction and then ran lifecycle guards/actions from that stale snapshot.
  - Concurrent settlement/status/delete/update actions could edit an already settled order or leave status/settledAt inconsistent.
  - OrdersService now locks the Order row with SELECT ... FOR UPDATE and re-reads through branch/department data scope inside the transaction before lifecycle guards, totals recalculation, allotment release/resync, status changes, settlement, or unlock.
  - Added scripts/test-orders-write-lock-contract.js with RED/GREEN coverage for lockOrderForWrite and all five write/lifecycle paths avoiding pre-transaction mutable reads.
  - Verification/deploy passed on the VPS: orders write-lock contract, order service flows, action endpoint contract, business logic guard, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.

- 2026-07-10 Customer interaction write-lock follow-up:
  - Found customer interaction writes transferOwner/addComment/addCareTask/addCallLog/addOpportunity/updateCareTask checked getWritableCustomer before writing and several wrote child/timeline/customer rows outside one transaction.
  - A concurrent merge could make the customer terminal between the pre-check and write, and partial child/timeline writes could leave customer activity state inconsistent.
  - Added lockWritableCustomerForWrite to lock the Customer row with SELECT ... FOR UPDATE, re-read through data scope, and reject MERGED/mergedIntoId customers inside the write transaction.
  - Customer interaction writes now run in one transaction and call the lock helper before mutating owner, comments, care tasks, call logs, opportunities, latestComment, or timeline rows.
  - Verification/deploy passed on the VPS: customers merged terminal contract, customers DTO contract, customers service/API flows, API build/lint, git diff check, Docker API rebuild/restart, HEALTHCHECK_OK, and docker builder prune to 0B.
