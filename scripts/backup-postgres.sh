#!/usr/bin/env bash
set -euo pipefail
umask 077

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
POSTGRES_DB="${POSTGRES_DB:-smarttour}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups/postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$REPO_DIR"

timestamp="$(date +%Y%m%d%H%M%S)"
backup_file="$BACKUP_DIR/smarttour-$timestamp.sql.gz"
tmp_file="$backup_file.tmp"
checksum_file="$backup_file.sha256"

cleanup_tmp_backup() {
  rm -f "$tmp_file"
}
trap cleanup_tmp_backup EXIT

docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | gzip -9 > "$tmp_file"

mv "$tmp_file" "$backup_file"
sha256sum "$backup_file" > "$checksum_file"
chmod 600 "$backup_file" "$checksum_file"

find "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz.sha256' -mtime +"$KEEP_DAYS" -delete

echo "BACKUP_OK $backup_file"
cat "$checksum_file"
