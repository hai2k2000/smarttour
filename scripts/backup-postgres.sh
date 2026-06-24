#!/usr/bin/env bash
set -euo pipefail
umask 077

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
POSTGRES_DB="${POSTGRES_DB:-smarttour}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups/postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"
POSTGRES_BACKUP_TIMEOUT="${POSTGRES_BACKUP_TIMEOUT:-30m}"
BACKUP_CHECKSUM_TIMEOUT="${BACKUP_CHECKSUM_TIMEOUT:-5m}"
BACKUP_COMPRESSION_TIMEOUT="${BACKUP_COMPRESSION_TIMEOUT:-30m}"
BACKUP_FILE_SCAN_TIMEOUT="${BACKUP_FILE_SCAN_TIMEOUT:-30s}"
BACKUP_CLEANUP_TIMEOUT="${BACKUP_CLEANUP_TIMEOUT:-5m}"
BACKUP_FILE_COMMAND_TIMEOUT="${BACKUP_FILE_COMMAND_TIMEOUT:-5m}"

run_postgres_backup_dump() {
  timeout "$POSTGRES_BACKUP_TIMEOUT" docker exec "$POSTGRES_CONTAINER" pg_dump "$@"
}

run_backup_checksum() {
  timeout "$BACKUP_CHECKSUM_TIMEOUT" sha256sum "$@"
}

run_backup_compression() {
  timeout "$BACKUP_COMPRESSION_TIMEOUT" gzip "$@"
}

run_backup_file_scan() {
  timeout "$BACKUP_FILE_SCAN_TIMEOUT" find "$@"
}

run_backup_cleanup() {
  timeout "$BACKUP_CLEANUP_TIMEOUT" rm "$@"
}

run_backup_file_command() {
  timeout "$BACKUP_FILE_COMMAND_TIMEOUT" "$@"
}

run_backup_file_command mkdir -p "$BACKUP_DIR"
run_backup_file_command chmod 700 "$BACKUP_DIR"
cd "$REPO_DIR"

timestamp="$(date +%Y%m%d%H%M%S)"
backup_file="$BACKUP_DIR/smarttour-$timestamp.sql.gz"
tmp_file="$backup_file.tmp"
checksum_file="$backup_file.sha256"

cleanup_tmp_backup() {
  run_backup_cleanup -f "$tmp_file"
}
trap cleanup_tmp_backup EXIT

run_postgres_backup_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | run_backup_compression -9 > "$tmp_file"

run_backup_file_command mv "$tmp_file" "$backup_file"
run_backup_checksum "$backup_file" > "$checksum_file"
run_backup_file_command chmod 600 "$backup_file" "$checksum_file"

run_backup_file_scan "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
run_backup_file_scan "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz.sha256' -mtime +"$KEEP_DAYS" -delete

echo "BACKUP_OK $backup_file"
run_backup_file_command cat "$checksum_file"
