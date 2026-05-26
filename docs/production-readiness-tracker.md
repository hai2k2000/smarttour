# SmartTour Production Readiness Tracker

## Status Legend

- `done`: implemented and verified by automated checks.
- `ready-for-manual`: automated coverage exists; business team must validate real workflow/data.
- `open`: still needs implementation or external decision.

## 1. Real Workflow Testing

Status: `ready-for-manual`

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

## 4. Real Users and Roles

Status: `ready-for-manual`

Automated coverage creates temporary users for `sales`, `operation`, and `accounting`.

Manual owner task: create named users for the real team and confirm menu/action/data access.

## 5. Import/Export Files

Status: `ready-for-manual`

Automated coverage validates CSV endpoints respond and include expected smoke data.

Manual owner task: open exports in Excel and confirm encoding, money, and date formatting.

## 6. Backup/Restore Operations

Status: `done`

Automated backup and restore drill:

- `scripts/backup-postgres.sh`
- `scripts/restore-drill-postgres.sh`
- `/etc/cron.d/smarttour-postgres-backup`

Open decision: choose off-VPS backup storage target.

## 7. CI/CD and Deploy Standardization

Status: `done`

Deploy script:

- `scripts/deploy-preview.sh`

Open decision: whether to wire this into GitHub Actions.

## 8. Observability

Status: `done`

Health script:

- `scripts/healthcheck.sh`

Open decision: external alerting target for failures.

## 9. Production Security

Status: `ready-for-manual`

Automated audit:

- `scripts/security-audit.sh`

Open decision: whether DB/Redis host ports must stay publicly exposed for external tools.

## 10. Technical Cleanup

Status: `done`

Smoke commands are normalized in `package.json`:

- `npm run smoke:all`
- `npm run verify:deploy`
