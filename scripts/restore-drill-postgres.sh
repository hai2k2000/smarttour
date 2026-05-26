#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups/postgres}"
DRILL_DB="${DRILL_DB:-smarttour_restore_drill_$(date +%Y%m%d%H%M%S)}"
KEEP_RESTORE_DRILL_DB="${KEEP_RESTORE_DRILL_DB:-0}"

cd "$REPO_DIR"

backup_file="${1:-}"
if [[ -z "$backup_file" ]]; then
  backup_file="$(find "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz' | sort | tail -1)"
fi

if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "No backup file found" >&2
  exit 1
fi

cleanup() {
  if [[ "$KEEP_RESTORE_DRILL_DB" != "1" ]]; then
    docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$DRILL_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -f "$backup_file.sha256" ]]; then
  sha256sum -c "$backup_file.sha256"
fi

docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$DRILL_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$DRILL_DB"

gzip -dc "$backup_file" | docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DRILL_DB" >/dev/null

docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "_prisma_migrations") = 0 THEN
    RAISE EXCEPTION 'missing migrations';
  END IF;
END $$;
SELECT 'MIGRATIONS_OK ' || COUNT(*) FROM "_prisma_migrations";
SELECT 'USERS ' || COUNT(*) FROM "User";
SELECT 'ROLES ' || COUNT(*) FROM "Role";
SELECT 'ROLE_PERMISSIONS ' || COUNT(*) FROM "RolePermission";
SQL

echo "RESTORE_DRILL_OK $backup_file -> $DRILL_DB"
