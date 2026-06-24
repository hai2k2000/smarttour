# SmartTour Production Readiness Tracker

## Status Legend

- `done`: implemented and verified by automated checks.
- `ready-for-manual`: automated coverage exists; business team must validate real workflow/data.
- `open`: still needs implementation or external decision.

## 1. Real Workflow Testing

Status: `done`

Automated coverage:

- `npm run smoke:business`
- `npm run smoke:finance`
- `npm run smoke:ui:browser`
- `npm run smoke:ui:interactions`

Manual owner task: execute `docs/qa-workflow-checklist.md` with real team data.

## 2. UX/UI Practical Review

Status: `ready-for-manual`

Automated coverage validates route render, basic browser navigation, tabs, search, and safe form controls.

Manual owner task: check screen sizes, table density, long Vietnamese content, Excel export opening, and repeated user workflows.

## 3. Deeper Data Scope

Status: `ready-for-manual`

Automated coverage validates core branch/department scope for RBAC, customer/quotation, finance, operations, vouchers, reports.

Manual owner task: validate dashboards and aggregate reports with production-like data in multiple branches/departments.

Completed implementation: Finance debt APIs now return grouped customer/supplier balances with aging buckets and trace entries. Permission-protected manual ledger adjustments are available for accounting and super-admin roles.
Completed implementation: Finance payment approval now reconciles linked supplier payment requests and operation vouchers idempotently; pending Finance vouchers no longer mark operational records as paid.
Completed implementation: Operations, Operation Vouchers, and Finance screens now expose linked reconciliation states and lifecycle-aware actions. Finance cancellation reopens operational balances, reverses linked Order totals, and is covered by cancellation/idempotency smoke tests.

## 4. Real Users and Roles

Status: `ready-for-manual`

Automated coverage creates temporary users for `sales`, `operation`, and `accounting`.

Manual owner task: create named users for the real team and confirm menu/action/data access.

## 5. Import/Export Files

Status: `ready-for-manual`

Automated coverage validates CSV endpoints respond with Excel-safe CSV and native XLSX endpoints respond with workbook MIME/ZIP magic for the covered export families.

Completed implementation: Finance receipt/payment CSV import now parses multipart files or JSON rows, validates rows, and writes drafts transactionally. Supplier, FIT, tour guide, Customer, Finance receipt/payment attachments, and Finance invoice multi-file documents use private MinIO storage.
Completed implementation: Finance receipt/payment import/export now supports native `.xlsx` workbooks without adding `exceljs`/`xlsx` dependencies. CSV remains the default export format, while `?format=xlsx` returns a native workbook for finance receipt/payment exports.
Completed implementation: The remaining CSV export families now support dependency-free native `.xlsx` responses through `?format=xlsx`: Finance invoices/cashflow, Reports, Commission Reports, Order Center, Customers, and FIT tour export when data exists. Existing CSV exports remain the default response format.

Manual owner task: open exports in Excel and confirm encoding, money, and date formatting.

## 6. Backup/Restore Operations

Status: `ready-for-manual`

Automated backup and restore drill:

- `scripts/backup-postgres.sh`
- `scripts/restore-drill-postgres.sh`
- `scripts/install-ops-schedule.sh`
- `smarttour-postgres-backup.timer`
- `smarttour-disaster-backup.timer`
- `smarttour-restore-drill.timer`

Open decision: choose off-VPS backup storage target.

Tooling is ready:

- `scripts/sync-latest-backup.sh`
- `npm run ops:backup-sync`
- `scripts/disaster-backup.sh`
- `npm run test:backup-offsite`

The offsite copy scripts use non-interactive SCP with bounded SSH timeouts.
The offsite copy scripts abort when a configured remote SSH key is missing or
not mode `600`.
The daily dump and disaster archive sync paths verify local SHA256 checksums
before upload.
Restore drills reject protected production/system database names before any
`dropdb` call, and `npm run test:restore-drill-safety` guards the contract.
Restore-drill PostgreSQL commands are bounded by
`RESTORE_DRILL_COMMAND_TIMEOUT=30m` so a stuck Docker or restore query fails the
timer instead of hanging it indefinitely.
PostgreSQL and disaster backup artifacts are created private (`600`) under
private backup directories (`700`), guarded by
`npm run test:backup-artifact-permissions`.
PostgreSQL backup temporary files are removed automatically on backup failure.
Daily PostgreSQL dump execution is bounded by `POSTGRES_BACKUP_TIMEOUT=30m`
so a stuck Docker or `pg_dump` process fails the backup timer instead of
hanging it indefinitely.
Full disaster backup Docker commands are bounded by
`DISASTER_BACKUP_DOCKER_TIMEOUT=30m`, and Compose stop/start commands are
bounded by `DISASTER_BACKUP_COMPOSE_TIMEOUT=10m`, so a stuck Docker/Compose
operation fails the weekly timer instead of hanging it indefinitely.
Disaster backup staging directories are removed after archive checksum verification.
Manual owner task: choose and configure the off-VPS backup storage target,
then run `npm run ops:backup-sync` and one disaster archive sync.

## 7. CI/CD and Deploy Standardization

Status: `ready-for-manual`

Deploy tooling:

- `scripts/deploy-preview.sh`
- `scripts/deploy-production.sh`
- `.github/workflows/smarttour-ci.yml`
- `.github/workflows/deploy-production.yml`

Completed implementation: GitHub Actions now has PR/push CI for lockfile install, audit, source contracts, typechecks, and API/Web Docker builds. Production deploy is available only through manual `workflow_dispatch` and runs the server-side `scripts/deploy-production.sh` over SSH.
Completed implementation: production deploy SSH setup now uses bounded `ssh-keyscan` and non-interactive SSH with connect/server-alive timeouts.
Completed implementation: production deploy validates manual dispatch inputs and server-side branch names before SSH/git deploy commands run.
Completed implementation: production deploy Git fetch/checkout/pull sync is bounded by `DEPLOY_GIT_TIMEOUT=5m`, guarded by `node scripts/test-github-actions-contract.js`.
Completed implementation: production deploy aborts on tracked, staged, or untracked VPS worktree changes unless an operator explicitly uses `ALLOW_DIRTY=true` on the server.
Completed implementation: emergency dirty deploy override requires `DEPLOY_DIRTY_REASON` and logs the reason before continuing.
Completed implementation: production deploy runs `npx prisma migrate deploy` after the SmartLink guard and before Docker image build/up.
Completed implementation: SmartLink legacy deploy guard local Node path and Docker fallback are bounded by `SMARTLINK_AUDIT_NODE_TIMEOUT=10m` and `SMARTLINK_AUDIT_DOCKER_TIMEOUT=10m`, guarded by `node scripts/test-github-actions-contract.js`.
Completed implementation: production deploy Prisma migration is bounded by `DEPLOY_PRISMA_MIGRATE_TIMEOUT=10m`, guarded by `node scripts/test-github-actions-contract.js`.
Completed implementation: production deploy logs the starting commit, post-sync revision, and ordered phase markers for SmartLink guard, Prisma migrations, Docker build/up, and healthcheck.
Completed implementation: production deploy Docker build/up phases are bounded by `DEPLOY_DOCKER_BUILD_TIMEOUT=45m` and `DEPLOY_DOCKER_UP_TIMEOUT=10m`, guarded by `node scripts/test-github-actions-contract.js`.
Completed implementation: rollback runbook is guarded by a source contract so production rollback uses a named rollback branch, `scripts/deploy-production.sh`, and post-rollback migration/audit/health verification.

Manual owner task: configure the GitHub `production` environment approval gate and required secrets documented in `docs/github-actions-runbook.md`.

## 8. Observability

Status: `ready-for-manual`

Health tooling:

- `scripts/healthcheck.sh`
- `scripts/install-ops-schedule.sh`
- `smarttour-healthcheck.timer`
- `smarttour-nginx-host-report.timer`
- `systemctl list-timers --all`
- `HEALTHCHECK_WEBHOOK_URL` for webhook alerts
- `docs/observability-alerting-runbook.md`

Completed implementation: ops schedule installation now installs `/etc/logrotate.d/smarttour` for `/var/log/smarttour/*.log`, guarded by `npm run test:ops-logrotate`.
Completed implementation: ops schedule installation now normalizes SmartTour operational log/report directories to `750` and files to `0640`, guarded by `npm run test:ops-log-permissions`.
Completed implementation: ops schedule installation bounds systemd reload/enable/list-timer operations with `OPS_SYSTEMD_TIMEOUT=30s`, guarded by `npm run test:ops-install-systemd-timeout`.
Completed implementation: SmartTour ops systemd services set `UMask=0027` so recreated logs remain private, guarded by `npm run test:ops-log-permissions`.
Completed implementation: Nginx host report Docker log collection is bounded by `HOST_REPORT_DOCKER_TIMEOUT=10s`, guarded by `npm run test:ops-log-permissions`.
Completed implementation: healthcheck HTTP route probes use bounded `HTTP_CONNECT_TIMEOUT`, `HTTP_MAX_TIME`, `HTTP_ATTEMPTS`, and `HTTP_RETRY_DELAY` settings, guarded by `npm run test:healthcheck-http-timeout`.
Completed implementation: healthcheck Docker/container probes use bounded `DOCKER_CHECK_TIMEOUT` so inspect, logs, exec, compose exec, and port scans cannot hang the health timer, guarded by `npm run test:healthcheck-docker-timeout`.
Completed implementation: healthcheck systemd probes use bounded `SYSTEMD_CHECK_TIMEOUT` so failed-unit and restore-drill result checks cannot hide or hang on systemd/DBus issues, guarded by `npm run test:healthcheck-systemd-timeout`.
Completed implementation: healthcheck failure alerts now use a structured webhook payload with bounded connect timeout, total timeout, and retry settings so alert delivery cannot hang the health timer.
Completed implementation: `/etc/default/smarttour-ops` template now includes commented `HEALTHCHECK_WEBHOOK_*` settings so reinstall/setup keeps alerting configuration discoverable.
Completed implementation: healthcheck now verifies the latest disaster backup archive age and checksum with `OK_DISASTER_BACKUP`, using `DISASTER_BACKUP_MAX_AGE_HOURS=192` by default.
Completed implementation: healthcheck now verifies the latest restore drill log age, `RESTORE_DRILL_OK` marker, and systemd result with `OK_RESTORE_DRILL`, using `RESTORE_DRILL_MAX_AGE_HOURS=192` by default.

Manual owner task: choose the external alert destination and configure `HEALTHCHECK_WEBHOOK_URL` plus timeout/retry settings in `/etc/default/smarttour-ops`.

## 9. Production Security

Status: `ready-for-manual`

Automated audit:

- `scripts/security-audit.sh`
- `scripts/test-security-audit-contract.js`

Completed hardening:

- Postgres and Redis host ports are bound to `127.0.0.1`.
- Obvious development placeholder secrets were removed from `.env`.
- MinIO ports `9000/9001` are bound to `127.0.0.1`.
- MinIO health and stronger placeholder-secret detection are included in the automated audits.
- The production `.env` file is checked for `600 root:root` permissions with
  `OK_ENV_FILE`.
- `/etc/default/smarttour-ops` is checked for `600 root:root` permissions with
  `OK_OPS_ENV_FILE`.
- `/etc/logrotate.d/smarttour` is checked for `644 root:root` permissions and
  expected SmartTour log rotation settings with `OK_LOGROTATE`.
- `/var/log/smarttour` operational logs and host security reports are checked
  for private directory/file permissions with `OK_OPS_LOG_PERMS`.
- SmartTour ops systemd services are checked for `UMask=0027` with
  `OK_OPS_SERVICE_UMASK`.
- PostgreSQL and disaster backup artifact permissions are checked in the live
  security audit with `OK_BACKUP_PERMS`.
- Expanded disaster backup staging directories are checked in the live security
  audit with `OK_DISASTER_STAGING`.
- Security audit external probes are bounded by `AUDIT_COMMAND_TIMEOUT` and
  `NPM_AUDIT_TIMEOUT`; Docker, sshd, systemd, and npm-audit failures are treated
  as audit failures instead of being hidden or left to hang.
- The security hardening installer bounds SSH validation/reload and Nginx reload
  commands with `SECURITY_INSTALL_COMMAND_TIMEOUT=10s`.

Completed hardening:

- API port `4000` is bound to `127.0.0.1`.
- Web preview port `3001` is bound to `127.0.0.1`.
- Public traffic enters through nginx on HTTPS.
- The security audit now checks `OK_ROOT_MODE` and `OK_SSH_PERMS` for `/`,
  `/root/.ssh`, and `/root/.ssh/authorized_keys`; the hardening installer
  normalizes those permissions after OS reinstall.

## 10. Technical Cleanup

Status: `done`

Smoke commands are normalized in `package.json`:

- `npm run smoke:all`
- `npm run smoke:files`
- `npm run verify:deploy`
- `scripts/test-smoke-files-command-contract.js`
