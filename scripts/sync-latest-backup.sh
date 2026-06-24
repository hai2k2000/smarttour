#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups/postgres}"
BACKUP_REMOTE_TARGET="${BACKUP_REMOTE_TARGET:?Set BACKUP_REMOTE_TARGET, for example user@backup-host:/srv/smarttour}"
BACKUP_REMOTE_PORT="${BACKUP_REMOTE_PORT:-22}"
BACKUP_REMOTE_KEY="${BACKUP_REMOTE_KEY:-}"
BACKUP_REMOTE_CONNECT_TIMEOUT="${BACKUP_REMOTE_CONNECT_TIMEOUT:-10}"
BACKUP_REMOTE_SERVER_ALIVE_INTERVAL="${BACKUP_REMOTE_SERVER_ALIVE_INTERVAL:-15}"
BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX="${BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX:-2}"
BACKUP_REMOTE_SCP_TIMEOUT="${BACKUP_REMOTE_SCP_TIMEOUT:-30m}"
BACKUP_CHECKSUM_TIMEOUT="${BACKUP_CHECKSUM_TIMEOUT:-5m}"
BACKUP_FILE_SCAN_TIMEOUT="${BACKUP_FILE_SCAN_TIMEOUT:-30s}"
BACKUP_FILE_READ_TIMEOUT="${BACKUP_FILE_READ_TIMEOUT:-10s}"
BACKUP_TEXT_FILTER_TIMEOUT="${BACKUP_TEXT_FILTER_TIMEOUT:-10s}"
CREATE_BACKUP_FIRST="${CREATE_BACKUP_FIRST:-1}"

cd "$REPO_DIR"

run_backup_scp() {
  timeout "$BACKUP_REMOTE_SCP_TIMEOUT" scp "$@"
}

run_backup_checksum() {
  timeout "$BACKUP_CHECKSUM_TIMEOUT" sha256sum "$@"
}

run_backup_file_scan() {
  timeout "$BACKUP_FILE_SCAN_TIMEOUT" find "$@"
}

run_backup_file_read() {
  timeout "$BACKUP_FILE_READ_TIMEOUT" "$@"
}

run_backup_text_filter() {
  timeout "$BACKUP_TEXT_FILTER_TIMEOUT" "$@"
}

require_private_key_file() {
  local key_file="$1"
  if [[ ! -f "$key_file" ]]; then
    echo "BACKUP_SYNC_ABORT remote key not found: $key_file" >&2
    exit 1
  fi

  local key_mode
  key_mode="$(run_backup_file_read stat -c '%a' "$key_file")"
  if [[ "$key_mode" != "600" ]]; then
    echo "BACKUP_SYNC_ABORT remote key must be 600: $key_file mode=$key_mode" >&2
    exit 1
  fi
}

if [[ "$CREATE_BACKUP_FIRST" == "1" ]]; then
  scripts/backup-postgres.sh >/tmp/smarttour-last-backup.log
fi

latest="$(run_backup_file_scan "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz' | run_backup_text_filter sort | run_backup_text_filter tail -1)"
if [[ -z "$latest" || ! -f "$latest" ]]; then
  echo "No backup found in $BACKUP_DIR" >&2
  exit 1
fi

checksum="$latest.sha256"
if [[ ! -f "$checksum" ]]; then
  run_backup_checksum "$latest" > "$checksum"
fi
chmod 600 "$checksum"
run_backup_checksum -c "$checksum"

scp_args=(-P "$BACKUP_REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout="$BACKUP_REMOTE_CONNECT_TIMEOUT" -o ServerAliveInterval="$BACKUP_REMOTE_SERVER_ALIVE_INTERVAL" -o ServerAliveCountMax="$BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX")
if [[ -n "$BACKUP_REMOTE_KEY" ]]; then
  require_private_key_file "$BACKUP_REMOTE_KEY"
  scp_args+=(-i "$BACKUP_REMOTE_KEY")
fi

run_backup_scp "${scp_args[@]}" "$latest" "$checksum" "$BACKUP_REMOTE_TARGET/"

echo "BACKUP_SYNC_OK $latest -> $BACKUP_REMOTE_TARGET"
