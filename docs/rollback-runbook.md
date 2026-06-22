# SmartTour Rollback Runbook

Use this only after deciding that hotfixing is riskier than rollback.

## 1. Capture Current State

```bash
cd /opt/smarttour
git rev-parse --short HEAD
scripts/backup-postgres.sh
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
```

## 2. Code Rollback

Pick a known good commit from `git log --oneline`.

```bash
cd /opt/smarttour
git switch main
git pull --ff-only || true
git checkout GOOD_COMMIT
NEXT_PUBLIC_API_URL=https://aitour.io.vn scripts/deploy-preview.sh
```

## 3. Database Restore

Restore only if the issue is data/migration related and the business accepts data loss after the backup timestamp.

```bash
cd /opt/smarttour
scripts/restore-drill-postgres.sh backups/postgres/smarttour-YYYYMMDDHHMMSS.sql.gz
gzip -dc backups/postgres/smarttour-YYYYMMDDHHMMSS.sql.gz | docker exec -i smarttour-postgres-1 psql -v ON_ERROR_STOP=1 -U smarttour -d smarttour
```

## 4. Verify

```bash
cd /opt/smarttour
export ADMIN_PASSWORD='current-admin-password'
npm run verify:deploy
```

## 5. Communicate

- Confirm rollback timestamp.
- Confirm data backup used.
- List any transactions that must be re-entered.
