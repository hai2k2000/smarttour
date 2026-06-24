#!/usr/bin/env bash
set -euo pipefail
umask 077

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
BACKUP_ROOT="${DISASTER_BACKUP_ROOT:-/var/backups/smarttour/disaster}"
KEEP_BACKUPS="${DISASTER_KEEP_BACKUPS:-4}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
POSTGRES_DB="${POSTGRES_DB:-smarttour}"
DISASTER_BACKUP_DOCKER_TIMEOUT="${DISASTER_BACKUP_DOCKER_TIMEOUT:-30m}"
DISASTER_BACKUP_COMPOSE_TIMEOUT="${DISASTER_BACKUP_COMPOSE_TIMEOUT:-10m}"
DISASTER_BACKUP_HOST_COMMAND_TIMEOUT="${DISASTER_BACKUP_HOST_COMMAND_TIMEOUT:-30s}"
DISASTER_BACKUP_ARCHIVE_TIMEOUT="${DISASTER_BACKUP_ARCHIVE_TIMEOUT:-60m}"
DISASTER_BACKUP_GIT_TIMEOUT="${DISASTER_BACKUP_GIT_TIMEOUT:-5m}"
REMOTE_TARGET="${DISASTER_BACKUP_REMOTE_TARGET:-}"
REMOTE_PORT="${DISASTER_BACKUP_REMOTE_PORT:-22}"
REMOTE_KEY="${DISASTER_BACKUP_REMOTE_KEY:-}"
REMOTE_CONNECT_TIMEOUT="${DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT:-10}"
REMOTE_SERVER_ALIVE_INTERVAL="${DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL:-15}"
REMOTE_SERVER_ALIVE_COUNT_MAX="${DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX:-2}"
REMOTE_SCP_TIMEOUT="${DISASTER_BACKUP_REMOTE_SCP_TIMEOUT:-60m}"
LOCK_FILE="${DISASTER_BACKUP_LOCK_FILE:-/run/lock/smarttour-disaster-backup.lock}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Disaster backup must run as root" >&2
  exit 1
fi

run_disaster_docker() {
  timeout "$DISASTER_BACKUP_DOCKER_TIMEOUT" docker "$@"
}

run_disaster_compose() {
  timeout "$DISASTER_BACKUP_COMPOSE_TIMEOUT" docker compose "$@"
}

run_disaster_host_command() {
  timeout "$DISASTER_BACKUP_HOST_COMMAND_TIMEOUT" "$@"
}

run_disaster_archive_command() {
  timeout "$DISASTER_BACKUP_ARCHIVE_TIMEOUT" "$@"
}

run_disaster_git() {
  timeout "$DISASTER_BACKUP_GIT_TIMEOUT" git "$@"
}

run_disaster_scp() {
  timeout "$REMOTE_SCP_TIMEOUT" scp "$@"
}

require_private_key_file() {
  local key_file="$1"
  if [[ ! -f "$key_file" ]]; then
    echo "DISASTER_BACKUP_ABORT remote key not found: $key_file" >&2
    exit 1
  fi

  local key_mode
  key_mode="$(stat -c '%a' "$key_file")"
  if [[ "$key_mode" != "600" ]]; then
    echo "DISASTER_BACKUP_ABORT remote key must be 600: $key_file mode=$key_mode" >&2
    exit 1
  fi
}

mkdir -p "$BACKUP_ROOT" "$(dirname "$LOCK_FILE")"
chmod 700 "$BACKUP_ROOT"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another SmartTour disaster backup is running" >&2
  exit 1
fi

cd "$REPO_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
name="smarttour-disaster-$timestamp"
work_dir="$BACKUP_ROOT/$name"
archive="$BACKUP_ROOT/$name.tar.gz"
services_stopped=0

mkdir -p "$work_dir"/{database,volumes,config,git}
chmod 700 "$work_dir"

restart_services() {
  if [[ "$services_stopped" == "1" ]]; then
    run_disaster_compose up -d
  fi
}
trap restart_services EXIT

echo "BACKUP_PHASE logical_database"
run_disaster_docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -Fc \
  --no-owner \
  --no-privileges \
  > "$work_dir/database/smarttour.dump"

run_disaster_docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | run_disaster_archive_command gzip -9 > "$work_dir/database/smarttour.sql.gz"

run_disaster_docker exec "$POSTGRES_CONTAINER" pg_dumpall \
  -U "$POSTGRES_USER" \
  --globals-only \
  > "$work_dir/database/postgres-globals.sql"

run_disaster_docker exec -i "$POSTGRES_CONTAINER" pg_restore -l \
  < "$work_dir/database/smarttour.dump" \
  > "$work_dir/database/smarttour.dump.list"

echo "BACKUP_PHASE git_and_config"
run_disaster_git status --short --branch > "$work_dir/git/status.txt"
run_disaster_git rev-parse HEAD > "$work_dir/git/commit.txt"
run_disaster_git remote -v > "$work_dir/git/remotes.txt"
run_disaster_git bundle create "$work_dir/git/smarttour.bundle" --all

config_paths=(
  AGENTS.md
  docker-compose.yml
  .env
  .env.example
  .env.production.example
  package.json
  package-lock.json
  deploy
  docs
  memory-bank
  prisma
  scripts
)
existing_config_paths=()
for path in "${config_paths[@]}"; do
  if [[ -e "$path" ]]; then
    existing_config_paths+=("$path")
  fi
done
run_disaster_archive_command tar -czf "$work_dir/config/smarttour-config.tar.gz" "${existing_config_paths[@]}"

run_disaster_archive_command tar --ignore-failed-read -czf "$work_dir/config/server-config.tar.gz" \
  /etc/ssh \
  /etc/netplan \
  /etc/cloud \
  /etc/docker \
  /etc/nginx \
  /etc/letsencrypt \
  /etc/default/smarttour-ops \
  /etc/systemd/system/smarttour-*.service \
  /etc/systemd/system/smarttour-*.timer \
  /root/.ssh \
  /var/spool/cron 2>/dev/null || true

run_disaster_host_command hostnamectl > "$work_dir/config/hostnamectl.txt" 2>&1 || true
run_disaster_host_command ip addr > "$work_dir/config/ip-addresses.txt"
run_disaster_host_command ip route > "$work_dir/config/ip-routes.txt"
run_disaster_host_command df -hT > "$work_dir/config/disk.txt"
run_disaster_docker ps -a > "$work_dir/config/docker-containers.txt"
run_disaster_docker image ls > "$work_dir/config/docker-images.txt"
run_disaster_docker volume ls > "$work_dir/config/docker-volumes.txt"
run_disaster_host_command systemctl --failed --no-pager > "$work_dir/config/systemd-failed.txt" || true
run_disaster_host_command crontab -l > "$work_dir/config/root-crontab.txt" 2>/dev/null || true

echo "BACKUP_PHASE consistent_volumes"
run_disaster_compose stop
services_stopped=1

for volume in \
  smarttour_smarttour_postgres \
  smarttour_smarttour_minio \
  smarttour_smarttour_n8n
do
  mountpoint="$(run_disaster_docker volume inspect "$volume" --format '{{.Mountpoint}}')"
  if [[ -z "$mountpoint" || "$mountpoint" == "/" || ! -d "$mountpoint" ]]; then
    echo "Invalid mountpoint for $volume: $mountpoint" >&2
    exit 1
  fi
  run_disaster_archive_command tar -czf "$work_dir/volumes/$volume.tar.gz" -C "$mountpoint" .
done

run_disaster_compose up -d
services_stopped=0

cat > "$work_dir/MANIFEST.txt" <<EOF
timestamp=$timestamp
hostname=$(hostname)
repo_commit=$(run_disaster_git rev-parse HEAD)
root_mode=$(stat -c '%a %U:%G' /)
archive=$archive
EOF

find "$work_dir" -type f ! -name SHA256SUMS -print0 \
  | sort -z \
  | run_disaster_archive_command xargs -0 sha256sum \
  > "$work_dir/SHA256SUMS"

run_disaster_archive_command tar -czf "$archive" -C "$BACKUP_ROOT" "$name"
run_disaster_archive_command sha256sum "$archive" > "$archive.sha256"
chmod 600 "$archive" "$archive.sha256"
run_disaster_archive_command sha256sum -c "$archive.sha256"
rm -rf "$work_dir"

mapfile -t old_archives < <(
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'smarttour-disaster-*.tar.gz' \
    -printf '%T@ %p\n' \
    | sort -nr \
    | tail -n "+$((KEEP_BACKUPS + 1))" \
    | cut -d' ' -f2-
)
for old_archive in "${old_archives[@]}"; do
  rm -f "$old_archive" "$old_archive.sha256"
  rm -rf "${old_archive%.tar.gz}"
done

if [[ -n "$REMOTE_TARGET" ]]; then
  scp_args=(-P "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout="$REMOTE_CONNECT_TIMEOUT" -o ServerAliveInterval="$REMOTE_SERVER_ALIVE_INTERVAL" -o ServerAliveCountMax="$REMOTE_SERVER_ALIVE_COUNT_MAX")
  if [[ -n "$REMOTE_KEY" ]]; then
    require_private_key_file "$REMOTE_KEY"
    scp_args+=(-i "$REMOTE_KEY")
  fi
  run_disaster_scp "${scp_args[@]}" "$archive" "$archive.sha256" "$REMOTE_TARGET/"
  echo "DISASTER_BACKUP_SYNC_OK $REMOTE_TARGET"
fi

echo "DISASTER_BACKUP_OK $archive"
cat "$archive.sha256"
