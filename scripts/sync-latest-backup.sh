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
CREATE_BACKUP_FIRST="${CREATE_BACKUP_FIRST:-1}"

cd "$REPO_DIR"

if [[ "$CREATE_BACKUP_FIRST" == "1" ]]; then
  scripts/backup-postgres.sh >/tmp/smarttour-last-backup.log
fi

latest="$(find "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz' | sort | tail -1)"
if [[ -z "$latest" || ! -f "$latest" ]]; then
  echo "No backup found in $BACKUP_DIR" >&2
  exit 1
fi

checksum="$latest.sha256"
if [[ ! -f "$checksum" ]]; then
  sha256sum "$latest" > "$checksum"
fi
chmod 600 "$checksum"
sha256sum -c "$checksum"

scp_args=(-P "$BACKUP_REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout="$BACKUP_REMOTE_CONNECT_TIMEOUT" -o ServerAliveInterval="$BACKUP_REMOTE_SERVER_ALIVE_INTERVAL" -o ServerAliveCountMax="$BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX")
if [[ -n "$BACKUP_REMOTE_KEY" ]]; then
  scp_args+=(-i "$BACKUP_REMOTE_KEY")
fi

scp "${scp_args[@]}" "$latest" "$checksum" "$BACKUP_REMOTE_TARGET/"

echo "BACKUP_SYNC_OK $latest -> $BACKUP_REMOTE_TARGET"
