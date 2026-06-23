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

Status: `open`

Automated coverage validates CSV endpoints respond and include expected smoke data.

Completed implementation: Finance receipt/payment CSV import now parses multipart files or JSON rows, validates rows, and writes drafts transactionally. Supplier, FIT, tour guide, Customer, Finance receipt/payment attachments, and Finance invoice multi-file documents use private MinIO storage.
Completed implementation: Finance receipt/payment import/export now supports native `.xlsx` workbooks without adding `exceljs`/`xlsx` dependencies. CSV remains the default export format, while `?format=xlsx` returns a native workbook for finance receipt/payment exports.

Open implementation: native XLSX workbook import/export remains open for the remaining export families beyond finance receipt/payment. `exceljs@4.4.0` was evaluated and removed because its transitive dependency tree introduced moderate audit findings.

Manual owner task: open exports in Excel and confirm encoding, money, and date formatting.

## 6. Backup/Restore Operations

Status: `done`

Automated backup and restore drill:

- `scripts/backup-postgres.sh`
- `scripts/restore-drill-postgres.sh`
- `/etc/cron.d/smarttour-postgres-backup`

Open decision: choose off-VPS backup storage target.

Tooling is ready:

- `scripts/sync-latest-backup.sh`
- `npm run ops:backup-sync`

## 7. CI/CD and Deploy Standardization

Status: `done`

Deploy script:

- `scripts/deploy-preview.sh`

Open decision: whether to wire this into GitHub Actions.

## 8. Observability

Status: `done`

Health script:

- `scripts/healthcheck.sh`
- `/etc/cron.d/smarttour-healthcheck`

Open decision: external alerting target for failures.

Tooling is ready:

- `HEALTHCHECK_WEBHOOK_URL` for webhook alerts.

## 9. Production Security

Status: `ready-for-manual`

Automated audit:

- `scripts/security-audit.sh`

Completed hardening:

- Postgres and Redis host ports are bound to `127.0.0.1`.
- Obvious development placeholder secrets were removed from `.env`.
- MinIO ports `9000/9001` are bound to `127.0.0.1`.
- MinIO health and stronger placeholder-secret detection are included in the automated audits.

Completed hardening:

- API port `4000` is bound to `127.0.0.1`.
- Web preview port `3001` is bound to `127.0.0.1`.
- Public traffic enters through nginx on HTTPS.

## 10. Technical Cleanup

Status: `done`

Smoke commands are normalized in `package.json`:

- `npm run smoke:all`
- `npm run smoke:files`
- `npm run verify:deploy`
