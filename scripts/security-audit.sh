#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

failures=0

require_env() {
  local key="$1"
  if ! grep -Eq "^${key}=.+" .env; then
    echo "FAIL_ENV missing $key"
    failures=$((failures + 1))
  else
    echo "OK_ENV $key"
  fi
}

check_private_backup_artifacts() {
  local label="$1"
  local dir="$2"
  local pattern="$3"
  local dir_mode
  dir_mode="$(stat -c '%a %U:%G' "$dir")"
  if [[ "$dir_mode" != "700 root:root" ]]; then
    echo "FAIL_BACKUP_PERMS $label dir=$dir_mode expected=700 root:root"
    failures=$((failures + 1))
    return
  fi

  local exposed_file
  exposed_file="$(find "$dir" -maxdepth 1 -type f \( -name "$pattern" -o -name "$pattern.sha256" \) -perm /077 -print -quit)"
  if [[ -n "$exposed_file" ]]; then
    echo "FAIL_BACKUP_PERMS $label exposed=$exposed_file"
    failures=$((failures + 1))
  else
    echo "OK_BACKUP_PERMS $label artifacts private"
  fi
}

require_env SMARTTOUR_AUTH_ENFORCE
require_env JWT_SECRET
require_env DATABASE_URL

if grep -Eq '^SMARTTOUR_AUTH_ENFORCE=true$' .env; then
  echo "OK_AUTH_ENFORCE true"
else
  echo "FAIL_AUTH_ENFORCE not true"
  failures=$((failures + 1))
fi

if grep -Eiq '=(123456|password|change[_-]?me(_before_deploy)?|secret|smarttour_dev_password|smarttour_dev_secret)$' .env; then
  echo "FAIL_ENV weak placeholder secret found"
  failures=$((failures + 1))
else
  echo "OK_ENV no obvious weak placeholder secret"
fi

env_file_mode="$(stat -c '%a %U:%G' .env)"
if [[ "$env_file_mode" == "600 root:root" ]]; then
  echo "OK_ENV_FILE .env=600 root:root"
else
  echo "FAIL_ENV_FILE .env=$env_file_mode expected=600 root:root"
  failures=$((failures + 1))
fi

check_private_backup_artifacts postgres "$REPO_DIR/backups/postgres" '*.sql.gz'
check_private_backup_artifacts disaster /var/backups/smarttour/disaster '*.tar.gz'

if docker ps --format '{{.Names}} {{.Ports}}' | grep -Eq 'smarttour-(web-preview|web-1|api-1|postgres-1|redis-1|minio-1|n8n-1).*0\.0\.0\.0'; then
  echo "FAIL_PORTS internal SmartTour containers are published on all interfaces"
  failures=$((failures + 1))
elif docker ps --format '{{.Names}} {{.Ports}}' | grep -Eq 'smarttour-(web-preview|web-1|api-1|postgres-1|redis-1|minio-1|n8n-1).*127\.0\.0\.1'; then
  echo "OK_PORTS SmartTour host ports bound to localhost"
else
  echo "WARN_PORTS SmartTour publish state could not be confirmed"
fi

sshd_effective="$(sshd -T)"

if grep -Eq '^passwordauthentication no$' <<< "$sshd_effective"; then
  echo "OK_SSH password authentication disabled"
else
  echo "FAIL_SSH password authentication is enabled"
  failures=$((failures + 1))
fi

if grep -Eq '^permitrootlogin (without-password|prohibit-password)$' <<< "$sshd_effective"; then
  echo "OK_SSH root login restricted to public key"
else
  echo "FAIL_SSH root login is not restricted to public key"
  failures=$((failures + 1))
fi

root_mode="$(stat -c '%a %U:%G' /)"
if [[ "$root_mode" == "755 root:root" ]]; then
  echo "OK_ROOT_MODE /=755 root:root"
else
  echo "FAIL_ROOT_MODE /=$root_mode expected=755 root:root"
  failures=$((failures + 1))
fi

root_ssh_mode="$(stat -c '%a %U:%G' /root/.ssh)"
if [[ "$root_ssh_mode" == "700 root:root" ]]; then
  echo "OK_SSH_PERMS /root/.ssh=700 root:root"
else
  echo "FAIL_SSH_PERMS /root/.ssh=$root_ssh_mode expected=700 root:root"
  failures=$((failures + 1))
fi

authorized_keys_mode="$(stat -c '%a %U:%G' /root/.ssh/authorized_keys)"
if [[ "$authorized_keys_mode" == "600 root:root" ]]; then
  echo "OK_SSH_PERMS authorized_keys=600 root:root"
else
  echo "FAIL_SSH_PERMS authorized_keys=$authorized_keys_mode expected=600 root:root"
  failures=$((failures + 1))
fi

if grep -Eq 'listen 80 default_server' deploy/nginx/default.conf \
  && grep -Eq 'ssl_reject_handshake on' deploy/nginx/default.conf; then
  echo "OK_NGINX unknown hosts rejected"
else
  echo "FAIL_NGINX default unknown-host rejection missing"
  failures=$((failures + 1))
fi

if grep -Eq 'limit_req zone=smarttour_login' deploy/nginx/default.conf \
  && grep -Eq 'limit_req zone=smarttour_api' deploy/nginx/default.conf; then
  echo "OK_NGINX login and API rate limits configured"
else
  echo "FAIL_NGINX expected rate limits missing"
  failures=$((failures + 1))
fi

if systemctl is-enabled smarttour-postgres-backup.timer >/dev/null 2>&1; then
  echo "OK_BACKUP_TIMER enabled"
else
  echo "FAIL_BACKUP_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if systemctl is-enabled smarttour-healthcheck.timer >/dev/null 2>&1; then
  echo "OK_HEALTH_TIMER enabled"
else
  echo "FAIL_HEALTH_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if systemctl is-enabled smarttour-nginx-host-report.timer >/dev/null 2>&1; then
  echo "OK_HOST_REPORT_TIMER enabled"
else
  echo "FAIL_HOST_REPORT_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if systemctl is-enabled smarttour-disaster-backup.timer >/dev/null 2>&1; then
  echo "OK_DISASTER_BACKUP_TIMER enabled"
else
  echo "FAIL_DISASTER_BACKUP_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if systemctl is-enabled smarttour-restore-drill.timer >/dev/null 2>&1; then
  echo "OK_RESTORE_DRILL_TIMER enabled"
else
  echo "FAIL_RESTORE_DRILL_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

npm audit --omit=dev

if [[ "$failures" -gt 0 ]]; then
  echo "SECURITY_AUDIT_FAILED failures=$failures"
  exit 1
fi

echo "SECURITY_AUDIT_OK"
