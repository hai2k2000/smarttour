#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
SYSTEMD_SOURCE="$REPO_DIR/deploy/systemd"
SYSTEMD_TARGET="/etc/systemd/system"
OPS_ENV="/etc/default/smarttour-ops"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Schedule installer must run as root" >&2
  exit 1
fi

install -d -m 0755 /var/log/smarttour
install -d -m 0755 /var/log/smarttour/security
install -d -m 0700 /var/backups/smarttour/disaster

if [[ ! -f "$OPS_ENV" ]]; then
  cat > "$OPS_ENV" <<'EOF'
REPO_DIR=/opt/smarttour
SITE_URL=https://aitour.io.vn
API_URL=https://aitour.io.vn/api
BACKUP_MAX_AGE_HOURS=30
KEEP_DAYS=14
DISASTER_KEEP_BACKUPS=4
# Set these to sync full disaster archives to another machine.
# DISASTER_BACKUP_REMOTE_TARGET=backup-user@backup-host:/srv/backups/smarttour
# DISASTER_BACKUP_REMOTE_PORT=22
# DISASTER_BACKUP_REMOTE_KEY=/root/.ssh/id_ed25519_backup
EOF
  chmod 600 "$OPS_ENV"
fi

for unit in "$SYSTEMD_SOURCE"/smarttour-*.service "$SYSTEMD_SOURCE"/smarttour-*.timer; do
  install -m 0644 "$unit" "$SYSTEMD_TARGET/$(basename "$unit")"
done

chmod +x \
  "$REPO_DIR/scripts/backup-postgres.sh" \
  "$REPO_DIR/scripts/disaster-backup.sh" \
  "$REPO_DIR/scripts/healthcheck.sh" \
  "$REPO_DIR/scripts/nginx-host-report.sh" \
  "$REPO_DIR/scripts/restore-drill-postgres.sh"

systemctl daemon-reload
systemctl enable --now \
  smarttour-healthcheck.timer \
  smarttour-nginx-host-report.timer \
  smarttour-postgres-backup.timer \
  smarttour-disaster-backup.timer \
  smarttour-restore-drill.timer

systemctl list-timers --all --no-pager 'smarttour-*'
echo "OPS_SCHEDULE_INSTALL_OK"
