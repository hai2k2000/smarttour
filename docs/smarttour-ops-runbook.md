# SmartTour Ops Runbook

## Current Services

- Repo: `/opt/smarttour`
- Domain: `https://quanly.dunientravel.com`
- Web: `smarttour-web-preview`, host port `3001`
- API: `smarttour-api-1`, host port `4000`
- Postgres: `smarttour-postgres-1`, host port `5433`
- Redis: `smarttour-redis-1`, host port `6380`

## Admin

- Email: `admin@smarttour.local`
- Password was rotated after initial handoff. Keep it out of git and export it when running authenticated smoke scripts:

```bash
export ADMIN_PASSWORD='current-admin-password'
```

## Backup

Create a compressed timestamped database backup with checksum and retention:

```bash
cd /opt/smarttour
scripts/backup-postgres.sh
```

Default backup path: `/opt/smarttour/backups/postgres`.

Default retention: 14 days. Override with `KEEP_DAYS=30 scripts/backup-postgres.sh`.

Automated daily backup is installed through cron:

```bash
cat /etc/cron.d/smarttour-postgres-backup
```

Healthcheck is installed through cron:

```bash
cat /etc/cron.d/smarttour-healthcheck
tail -100 /var/log/smarttour-healthcheck.log
```

Copy the latest backup off the VPS:

```bash
scp -P 24700 -i C:\Users\hai2k\.ssh\id_ed25519_booking_server root@103.75.185.200:/opt/smarttour/backups/postgres/smarttour-YYYYMMDDHHMMSS.sql.gz .
```

## Restore

Run a restore drill into a temporary database without touching production:

```bash
cd /opt/smarttour
scripts/restore-drill-postgres.sh
```

Restore into the production database only after a confirmed backup and downtime window:

```bash
cd /opt/smarttour
gzip -dc backups/postgres/smarttour-YYYYMMDDHHMMSS.sql.gz | docker exec -i smarttour-postgres-1 psql -v ON_ERROR_STOP=1 -U smarttour -d smarttour
npx prisma migrate status
```

## Deploy

Build and restart API:

```bash
cd /opt/smarttour
npm run build --workspace @smarttour/api
docker compose build api
docker rm -f smarttour-api-1 || true
docker compose up -d api
```

Build and restart web preview:

```bash
cd /opt/smarttour
npm run build --workspace @smarttour/web
docker compose build web
docker rm -f smarttour-web-preview || true
docker run -d --name smarttour-web-preview --env-file .env -e NEXT_PUBLIC_API_URL=http://103.75.185.200:4000 -p 3001:3000 smarttour-web:latest
```

## Verification

```bash
cd /opt/smarttour
export ADMIN_PASSWORD='current-admin-password'
npx prisma migrate status
npm audit --omit=dev
npm run smoke:all
npm run ops:health
npm run ops:security
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep smarttour
docker logs --since 5m smarttour-api-1 2>&1 | grep -Ei 'error|exception|failed' || true
docker logs --since 5m smarttour-web-preview 2>&1 | grep -Ei 'error|exception|failed' || true
```

Expected:

- Prisma reports database schema up to date.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- RBAC smoke script ends with `SMOKE_RBAC_OK`.
- Business smoke script ends with `SMOKE_BUSINESS_OK`.
- Finance/report smoke script ends with `SMOKE_FINANCE_REPORTS_OK`.
- UI route smoke script ends with `SMOKE_UI_PAGES_OK`.
- Browser UI smoke script ends with `SMOKE_UI_BROWSER_OK`.
- Browser interaction smoke script ends with `SMOKE_UI_INTERACTIONS_OK`.
- Export smoke script ends with `SMOKE_EXPORTS_OK`.
- Healthcheck ends with `HEALTHCHECK_OK`.
- Security audit ends with `SECURITY_AUDIT_OK`.
- Only SmartTour web, api, postgres, redis containers are running.

## Readiness

Use these tracking docs before go-live:

- `docs/production-readiness-tracker.md`
- `docs/qa-workflow-checklist.md`

## Deploy Script

For a one-command preview deploy:

```bash
cd /opt/smarttour
scripts/deploy-preview.sh
```

## Production Network Notes

- Postgres host port `5433` is bound to `127.0.0.1`.
- Redis host port `6380` is bound to `127.0.0.1`.
- API port `4000` and web preview port `3001` remain public because the current frontend and domain setup use them.
