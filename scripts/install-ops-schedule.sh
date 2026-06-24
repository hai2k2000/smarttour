#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
SYSTEMD_SOURCE="$REPO_DIR/deploy/systemd"
SYSTEMD_TARGET="/etc/systemd/system"
OPS_ENV="/etc/default/smarttour-ops"
OPS_SYSTEMD_TIMEOUT="${OPS_SYSTEMD_TIMEOUT:-30s}"

run_ops_systemctl() {
  timeout "$OPS_SYSTEMD_TIMEOUT" systemctl "$@"
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Schedule installer must run as root" >&2
  exit 1
fi

install -d -m 0750 /var/log/smarttour
install -d -m 0750 /var/log/smarttour/security
chown root:root /var/log/smarttour /var/log/smarttour/security
find /var/log/smarttour -maxdepth 1 -type f -name '*.log' -exec chown root:root {} +
find /var/log/smarttour -maxdepth 1 -type f -name '*.log' -exec chmod 0640 {} +
find /var/log/smarttour/security -maxdepth 1 -type f -name 'nginx-host-report-*.txt' -exec chown root:root {} +
find /var/log/smarttour/security -maxdepth 1 -type f -name 'nginx-host-report-*.txt' -exec chmod 0640 {} +
install -d -m 0700 /var/backups/smarttour/disaster
install -d -m 0755 /etc/logrotate.d
install -m 0644 "$REPO_DIR/deploy/logrotate/smarttour" /etc/logrotate.d/smarttour

if [[ ! -f "$OPS_ENV" ]]; then
  cat > "$OPS_ENV" <<'EOF'
REPO_DIR=/opt/smarttour
SITE_URL=https://aitour.io.vn
API_URL=https://aitour.io.vn/api
BACKUP_MAX_AGE_HOURS=30
DISASTER_BACKUP_MAX_AGE_HOURS=192
RESTORE_DRILL_MAX_AGE_HOURS=192
KEEP_DAYS=14
DISASTER_KEEP_BACKUPS=4
# Set this to bound the daily PostgreSQL dump command.
# POSTGRES_BACKUP_TIMEOUT=30m
# Set this to bound restore-drill PostgreSQL commands.
# RESTORE_DRILL_COMMAND_TIMEOUT=30m
# Set these to bound full disaster backup Docker/Compose commands.
# DISASTER_BACKUP_DOCKER_TIMEOUT=30m
# DISASTER_BACKUP_COMPOSE_TIMEOUT=10m
# Set these to send healthcheck failure alerts to an external destination.
# HEALTHCHECK_WEBHOOK_URL=https://example-alert-endpoint.invalid/smarttour
# HEALTHCHECK_WEBHOOK_CONNECT_TIMEOUT=5
# HEALTHCHECK_WEBHOOK_MAX_TIME=10
# HEALTHCHECK_WEBHOOK_RETRIES=2
# Set these to bound healthcheck HTTP route probes.
# HTTP_CONNECT_TIMEOUT=5
# HTTP_MAX_TIME=10
# HTTP_ATTEMPTS=6
# HTTP_RETRY_DELAY=3
# Set this to bound Docker/container probes in the healthcheck.
# DOCKER_CHECK_TIMEOUT=10s
# Set this to bound systemd probes in the healthcheck.
# SYSTEMD_CHECK_TIMEOUT=10s
# Set this to bound systemd operations in this installer.
# OPS_SYSTEMD_TIMEOUT=30s
# Set these to sync daily PostgreSQL dumps to another machine.
# BACKUP_REMOTE_TARGET=backup-user@backup-host:/srv/backups/smarttour/postgres
# BACKUP_REMOTE_PORT=22
# BACKUP_REMOTE_KEY=/root/.ssh/id_ed25519_backup
# BACKUP_REMOTE_CONNECT_TIMEOUT=10
# BACKUP_REMOTE_SERVER_ALIVE_INTERVAL=15
# BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX=2
# Set these to sync full disaster archives to another machine.
# DISASTER_BACKUP_REMOTE_TARGET=backup-user@backup-host:/srv/backups/smarttour
# DISASTER_BACKUP_REMOTE_PORT=22
# DISASTER_BACKUP_REMOTE_KEY=/root/.ssh/id_ed25519_backup
# DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT=10
# DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL=15
# DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX=2
EOF
  chmod 600 "$OPS_ENV"
fi
chown root:root "$OPS_ENV"
chmod 600 "$OPS_ENV"

for unit in "$SYSTEMD_SOURCE"/smarttour-*.service "$SYSTEMD_SOURCE"/smarttour-*.timer; do
  install -m 0644 "$unit" "$SYSTEMD_TARGET/$(basename "$unit")"
done

chmod +x \
  "$REPO_DIR/scripts/backup-postgres.sh" \
  "$REPO_DIR/scripts/disaster-backup.sh" \
  "$REPO_DIR/scripts/healthcheck.sh" \
  "$REPO_DIR/scripts/nginx-host-report.sh" \
  "$REPO_DIR/scripts/restore-drill-postgres.sh"

run_ops_systemctl daemon-reload
run_ops_systemctl enable --now \
  smarttour-healthcheck.timer \
  smarttour-nginx-host-report.timer \
  smarttour-postgres-backup.timer \
  smarttour-disaster-backup.timer \
  smarttour-restore-drill.timer

run_ops_systemctl list-timers --all --no-pager 'smarttour-*'
echo "OPS_SCHEDULE_INSTALL_OK"
