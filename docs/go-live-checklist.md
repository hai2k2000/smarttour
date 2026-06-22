# SmartTour Go-Live Checklist

Run this in order before switching real users to SmartTour.

## 1. Freeze Window

- Announce deployment window.
- Stop manual edits in old Excel/workflow during final migration.
- Confirm one accountable approver for go-live.

## 2. Backup

```bash
cd /opt/smarttour
scripts/backup-postgres.sh
scripts/restore-drill-postgres.sh
BACKUP_REMOTE_TARGET='user@backup-host:/path' scripts/sync-latest-backup.sh
```

## 3. Deploy Verify

```bash
cd /opt/smarttour
export ADMIN_PASSWORD='current-admin-password'
npm run verify:deploy
```

## 4. Real Users

- Create named users for every staff member.
- Assign only one primary operational role unless there is a clear exception.
- Set branch and department for scoped users.
- Ask each role owner to login and verify route/action/data access.

## 5. Business Data Checks

- Create one real customer, quote, order, booking, operation form, voucher, receipt, payment, invoice.
- Compare totals against expected Excel/manual calculation.
- Export finance/report CSV and open in Excel.

## 6. Production Network

- Confirm public ports are only SSH `24700`, HTTP `80`, HTTPS `443`.
- Confirm SmartTour web/API/Postgres/Redis are localhost-bound.
- Confirm domain `https://aitour.io.vn` serves web and `/api`.

## 7. Monitoring

- Confirm `/etc/cron.d/smarttour-healthcheck`.
- Confirm `/etc/cron.d/smarttour-postgres-backup`.
- Configure `HEALTHCHECK_WEBHOOK_URL` if external alerts are available.

## 8. Rollback

- Record current commit: `git rev-parse --short HEAD`.
- Record latest backup path.
- If rollback is needed, use `docs/rollback-runbook.md`.

## 9. Sign-off

- Business lead signs off workflow.
- Accounting signs off finance/export.
- Admin signs off user/role/data scope.
- Technical owner signs off backup/restore/monitoring.
