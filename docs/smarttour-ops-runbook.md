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
- Current temporary password: `123456`
- Change this after handoff in `/security`.

## Backup

Create a timestamped database backup:

```bash
cd /opt/smarttour
mkdir -p backups
docker exec smarttour-postgres-1 pg_dump -U smarttour -d smarttour --clean --if-exists > "backups/smarttour-$(date +%Y%m%d%H%M%S).sql"
```

Copy the latest backup off the VPS:

```bash
scp -P 24700 -i C:\Users\hai2k\.ssh\id_ed25519_booking_server root@103.75.185.200:/opt/smarttour/backups/smarttour-YYYYMMDDHHMMSS.sql .
```

## Restore

Restore into the running Postgres container:

```bash
cd /opt/smarttour
docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour < backups/smarttour-YYYYMMDDHHMMSS.sql
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
npx prisma migrate status
npm audit --omit=dev
scripts/smoke-rbac-workflows.sh
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep smarttour
docker logs --since 5m smarttour-api-1 2>&1 | grep -Ei 'error|exception|failed' || true
docker logs --since 5m smarttour-web-preview 2>&1 | grep -Ei 'error|exception|failed' || true
```

Expected:

- Prisma reports database schema up to date.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- RBAC smoke script ends with `SMOKE_RBAC_OK`.
- Only SmartTour web, api, postgres, redis containers are running.
