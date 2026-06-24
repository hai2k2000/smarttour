# SmartTour Rollback Runbook

Use this only after deciding that hotfixing is riskier than rollback. Keep one operator at the terminal and one reviewer watching the incident notes.

## 1. Capture Current State

Record the failing revision before changing code or data.

```bash
cd /opt/smarttour
BAD_COMMIT="$(git rev-parse --short HEAD)"
echo "BAD_COMMIT=$BAD_COMMIT"
scripts/backup-postgres.sh
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
```

## 2. Choose the Known Good Revision

Pick a known good commit from `git log --oneline`. Prefer the last production commit with passing deploy verification.

```bash
cd /opt/smarttour
git fetch origin main --tags
git log --oneline --decorate -20
GOOD_COMMIT=replace-with-known-good-sha
ROLLBACK_BRANCH=rollback/incident-YYYYMMDD-HHMM
```

## 3. Deploy the Rollback Branch

Do not deploy production rollback with the preview script or a detached checkout. Create a named rollback branch, push it, and let the production deploy script perform the same guarded deploy path as normal releases.

```bash
cd /opt/smarttour
git switch -C "$ROLLBACK_BRANCH" "$GOOD_COMMIT"
git push origin "$ROLLBACK_BRANCH"
BRANCH="$ROLLBACK_BRANCH" scripts/deploy-production.sh
```

Expected deploy output includes `DEPLOY_START`, `DEPLOY_REVISION`, ordered `DEPLOY_PHASE ...` lines, and `DEPLOY_PRODUCTION_OK`.

## 4. Database Restore

Restore only if the issue is data/migration related and the business accepts data loss after the backup timestamp.

```bash
cd /opt/smarttour
scripts/restore-drill-postgres.sh backups/postgres/smarttour-YYYYMMDDHHMMSS.sql.gz
gzip -dc backups/postgres/smarttour-YYYYMMDDHHMMSS.sql.gz | docker exec -i smarttour-postgres-1 psql -v ON_ERROR_STOP=1 -U smarttour -d smarttour
```

## 5. Verify

Run the minimum production checks even if the deploy script healthcheck passed.

```bash
cd /opt/smarttour
npx prisma migrate status
npm audit --omit=dev
scripts/healthcheck.sh
scripts/security-audit.sh
```

If a temporary admin password is available, also run:

```bash
cd /opt/smarttour
export ADMIN_PASSWORD='current-admin-password'
npm run verify:deploy
```

## 6. Communicate

- Confirm rollback timestamp.
- Confirm `BAD_COMMIT` and `GOOD_COMMIT`.
- Confirm rollback branch name.
- Confirm data backup used, or state that no database restore was performed.
- List any transactions that must be re-entered.
