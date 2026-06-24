#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups/postgres}"
DRILL_DB="${DRILL_DB:-smarttour_restore_drill_$(date +%Y%m%d%H%M%S)}"
KEEP_RESTORE_DRILL_DB="${KEEP_RESTORE_DRILL_DB:-0}"
RESTORE_DRILL_COMMAND_TIMEOUT="${RESTORE_DRILL_COMMAND_TIMEOUT:-30m}"
PROTECTED_RESTORE_DRILL_DBS=(smarttour postgres template0 template1)

cd "$REPO_DIR"

run_restore_drill_docker() {
  timeout "$RESTORE_DRILL_COMMAND_TIMEOUT" docker exec "$@"
}

validate_drill_db_name() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo "RESTORE_DRILL_ABORT unsafe DRILL_DB: $value" >&2
    exit 1
  fi

  if [[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "RESTORE_DRILL_ABORT unsafe DRILL_DB: $value" >&2
    exit 1
  fi

  local protected_db
  for protected_db in "${PROTECTED_RESTORE_DRILL_DBS[@]}"; do
    if [[ "$value" == "$protected_db" ]]; then
      echo "RESTORE_DRILL_ABORT unsafe DRILL_DB: $value" >&2
      exit 1
    fi
  done
}

validate_drill_db_name "$DRILL_DB"

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
    run_restore_drill_docker "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$DRILL_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -f "$backup_file.sha256" ]]; then
  sha256sum -c "$backup_file.sha256"
fi

run_restore_drill_docker "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$DRILL_DB" >/dev/null 2>&1 || true
run_restore_drill_docker "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$DRILL_DB"

gzip -dc "$backup_file" | run_restore_drill_docker -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DRILL_DB" >/dev/null

run_restore_drill_docker -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 <<'SQL'
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
