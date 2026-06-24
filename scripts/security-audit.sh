#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
AUDIT_COMMAND_TIMEOUT="${AUDIT_COMMAND_TIMEOUT:-10s}"
AUDIT_FILE_SCAN_TIMEOUT="${AUDIT_FILE_SCAN_TIMEOUT:-30s}"
AUDIT_FILE_READ_TIMEOUT="${AUDIT_FILE_READ_TIMEOUT:-10s}"
NPM_AUDIT_TIMEOUT="${NPM_AUDIT_TIMEOUT:-120s}"

cd "$REPO_DIR"

failures=0

run_audit_command() {
  timeout "$AUDIT_COMMAND_TIMEOUT" "$@"
}

run_audit_file_scan() {
  timeout "$AUDIT_FILE_SCAN_TIMEOUT" find "$@"
}

run_audit_file_read() {
  timeout "$AUDIT_FILE_READ_TIMEOUT" "$@"
}

run_npm_audit() {
  timeout "$NPM_AUDIT_TIMEOUT" npm audit --omit=dev
}

require_env() {
  local key="$1"
  if ! run_audit_file_read grep -Eq "^${key}=.+" .env; then
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
  dir_mode="$(run_audit_file_read stat -c '%a %U:%G' "$dir")"
  if [[ "$dir_mode" != "700 root:root" ]]; then
    echo "FAIL_BACKUP_PERMS $label dir=$dir_mode expected=700 root:root"
    failures=$((failures + 1))
    return
  fi

  local exposed_file
  exposed_file="$(run_audit_file_scan "$dir" -maxdepth 1 -type f \( -name "$pattern" -o -name "$pattern.sha256" \) -perm /077 -print -quit)"
  if [[ -n "$exposed_file" ]]; then
    echo "FAIL_BACKUP_PERMS $label exposed=$exposed_file"
    failures=$((failures + 1))
  else
    echo "OK_BACKUP_PERMS $label artifacts private"
  fi
}

check_disaster_backup_staging_dirs() {
  local staging_dir
  staging_dir="$(run_audit_file_scan /var/backups/smarttour/disaster -maxdepth 1 -type d -name 'smarttour-disaster-*' -print -quit)"
  if [[ -n "$staging_dir" ]]; then
    echo "FAIL_DISASTER_STAGING expanded=$staging_dir"
    failures=$((failures + 1))
  else
    echo "OK_DISASTER_STAGING no expanded disaster backup staging directories"
  fi
}

require_env SMARTTOUR_AUTH_ENFORCE
require_env JWT_SECRET
require_env DATABASE_URL

if run_audit_file_read grep -Eq '^SMARTTOUR_AUTH_ENFORCE=true$' .env; then
  echo "OK_AUTH_ENFORCE true"
else
  echo "FAIL_AUTH_ENFORCE not true"
  failures=$((failures + 1))
fi

if run_audit_file_read grep -Eiq '=(123456|password|change[_-]?me(_before_deploy)?|secret|smarttour_dev_password|smarttour_dev_secret)$' .env; then
  echo "FAIL_ENV weak placeholder secret found"
  failures=$((failures + 1))
else
  echo "OK_ENV no obvious weak placeholder secret"
fi

env_file_mode="$(run_audit_file_read stat -c '%a %U:%G' .env)"
if [[ "$env_file_mode" == "600 root:root" ]]; then
  echo "OK_ENV_FILE .env=600 root:root"
else
  echo "FAIL_ENV_FILE .env=$env_file_mode expected=600 root:root"
  failures=$((failures + 1))
fi

ops_env_mode="$(run_audit_file_read stat -c '%a %U:%G' /etc/default/smarttour-ops)"
if [[ "$ops_env_mode" == "600 root:root" ]]; then
  echo "OK_OPS_ENV_FILE /etc/default/smarttour-ops=600 root:root"
else
  echo "FAIL_OPS_ENV_FILE /etc/default/smarttour-ops=$ops_env_mode expected=600 root:root"
  failures=$((failures + 1))
fi

logrotate_conf_mode="$(run_audit_file_read stat -c '%a %U:%G' /etc/logrotate.d/smarttour 2>/dev/null || true)"
if [[ "$logrotate_conf_mode" == "644 root:root" ]] \
  && run_audit_file_read grep -Eq '^/var/log/smarttour/\*\.log' /etc/logrotate.d/smarttour \
  && run_audit_file_read grep -Eq '^[[:space:]]*copytruncate$' /etc/logrotate.d/smarttour \
  && run_audit_file_read grep -Eq '^[[:space:]]*rotate 14$' /etc/logrotate.d/smarttour; then
  echo "OK_LOGROTATE /etc/logrotate.d/smarttour=644 root:root"
else
  echo "FAIL_LOGROTATE /etc/logrotate.d/smarttour=$logrotate_conf_mode expected=644 root:root with smarttour log rotation"
  failures=$((failures + 1))
fi

ops_log_dir_mode="$(run_audit_file_read stat -c '%a %U:%G' /var/log/smarttour)"
ops_security_log_dir_mode="$(run_audit_file_read stat -c '%a %U:%G' /var/log/smarttour/security)"
exposed_ops_log="$(run_audit_file_scan /var/log/smarttour -maxdepth 1 -type f -name '*.log' -perm /037 -print -quit)"
exposed_security_report="$(run_audit_file_scan /var/log/smarttour/security -maxdepth 1 -type f -name 'nginx-host-report-*.txt' -perm /037 -print -quit)"
if [[ "$ops_log_dir_mode" == "750 root:root" ]] \
  && [[ "$ops_security_log_dir_mode" == "750 root:root" ]] \
  && [[ -z "$exposed_ops_log" ]] \
  && [[ -z "$exposed_security_report" ]]; then
  echo "OK_OPS_LOG_PERMS /var/log/smarttour private"
else
  echo "FAIL_OPS_LOG_PERMS dir=$ops_log_dir_mode security_dir=$ops_security_log_dir_mode exposed_log=${exposed_ops_log:-none} exposed_report=${exposed_security_report:-none}"
  failures=$((failures + 1))
fi

ops_service_umask_failures=()
for ops_service in \
  smarttour-healthcheck.service \
  smarttour-nginx-host-report.service \
  smarttour-postgres-backup.service \
  smarttour-disaster-backup.service \
  smarttour-restore-drill.service; do
  ops_service_umask="$(run_audit_command systemctl show "$ops_service" -p UMask --value 2>/dev/null || true)"
  if [[ "$ops_service_umask" != "0027" ]]; then
    ops_service_umask_failures+=("$ops_service=$ops_service_umask")
  fi
done
if [[ "${#ops_service_umask_failures[@]}" -eq 0 ]]; then
  echo "OK_OPS_SERVICE_UMASK SmartTour ops services UMask=0027"
else
  echo "FAIL_OPS_SERVICE_UMASK ${ops_service_umask_failures[*]}"
  failures=$((failures + 1))
fi

check_private_backup_artifacts postgres "$REPO_DIR/backups/postgres" '*.sql.gz'
check_private_backup_artifacts disaster /var/backups/smarttour/disaster '*.tar.gz'
check_disaster_backup_staging_dirs

if ! ports_output="$(run_audit_command docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null)"; then
  echo "FAIL_PORTS docker_unavailable"
  failures=$((failures + 1))
elif printf '%s\n' "$ports_output" | run_audit_file_read grep -Eq 'smarttour-(web-preview|web-1|api-1|postgres-1|redis-1|minio-1|n8n-1).*0\.0\.0\.0'; then
  echo "FAIL_PORTS internal SmartTour containers are published on all interfaces"
  failures=$((failures + 1))
elif printf '%s\n' "$ports_output" | run_audit_file_read grep -Eq 'smarttour-(web-preview|web-1|api-1|postgres-1|redis-1|minio-1|n8n-1).*127\.0\.0\.1'; then
  echo "OK_PORTS SmartTour host ports bound to localhost"
else
  echo "WARN_PORTS SmartTour publish state could not be confirmed"
fi

if ! sshd_effective="$(run_audit_command sshd -T 2>/dev/null)"; then
  echo "FAIL_SSH sshd_config_unavailable"
  failures=$((failures + 1))
else
  if run_audit_file_read grep -Eq '^passwordauthentication no$' <<< "$sshd_effective"; then
    echo "OK_SSH password authentication disabled"
  else
    echo "FAIL_SSH password authentication is enabled"
    failures=$((failures + 1))
  fi

  if run_audit_file_read grep -Eq '^permitrootlogin (without-password|prohibit-password)$' <<< "$sshd_effective"; then
    echo "OK_SSH root login restricted to public key"
  else
    echo "FAIL_SSH root login is not restricted to public key"
    failures=$((failures + 1))
  fi
fi

root_mode="$(run_audit_file_read stat -c '%a %U:%G' /)"
if [[ "$root_mode" == "755 root:root" ]]; then
  echo "OK_ROOT_MODE /=755 root:root"
else
  echo "FAIL_ROOT_MODE /=$root_mode expected=755 root:root"
  failures=$((failures + 1))
fi

root_ssh_mode="$(run_audit_file_read stat -c '%a %U:%G' /root/.ssh)"
if [[ "$root_ssh_mode" == "700 root:root" ]]; then
  echo "OK_SSH_PERMS /root/.ssh=700 root:root"
else
  echo "FAIL_SSH_PERMS /root/.ssh=$root_ssh_mode expected=700 root:root"
  failures=$((failures + 1))
fi

authorized_keys_mode="$(run_audit_file_read stat -c '%a %U:%G' /root/.ssh/authorized_keys)"
if [[ "$authorized_keys_mode" == "600 root:root" ]]; then
  echo "OK_SSH_PERMS authorized_keys=600 root:root"
else
  echo "FAIL_SSH_PERMS authorized_keys=$authorized_keys_mode expected=600 root:root"
  failures=$((failures + 1))
fi

if run_audit_file_read grep -Eq 'listen 80 default_server' deploy/nginx/default.conf \
  && run_audit_file_read grep -Eq 'ssl_reject_handshake on' deploy/nginx/default.conf; then
  echo "OK_NGINX unknown hosts rejected"
else
  echo "FAIL_NGINX default unknown-host rejection missing"
  failures=$((failures + 1))
fi

if run_audit_file_read grep -Eq 'limit_req zone=smarttour_login' deploy/nginx/default.conf \
  && run_audit_file_read grep -Eq 'limit_req zone=smarttour_api' deploy/nginx/default.conf; then
  echo "OK_NGINX login and API rate limits configured"
else
  echo "FAIL_NGINX expected rate limits missing"
  failures=$((failures + 1))
fi

if run_audit_command systemctl is-enabled smarttour-postgres-backup.timer >/dev/null 2>&1; then
  echo "OK_BACKUP_TIMER enabled"
else
  echo "FAIL_BACKUP_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if run_audit_command systemctl is-enabled smarttour-healthcheck.timer >/dev/null 2>&1; then
  echo "OK_HEALTH_TIMER enabled"
else
  echo "FAIL_HEALTH_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if run_audit_command systemctl is-enabled smarttour-nginx-host-report.timer >/dev/null 2>&1; then
  echo "OK_HOST_REPORT_TIMER enabled"
else
  echo "FAIL_HOST_REPORT_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if run_audit_command systemctl is-enabled smarttour-disaster-backup.timer >/dev/null 2>&1; then
  echo "OK_DISASTER_BACKUP_TIMER enabled"
else
  echo "FAIL_DISASTER_BACKUP_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if run_audit_command systemctl is-enabled smarttour-restore-drill.timer >/dev/null 2>&1; then
  echo "OK_RESTORE_DRILL_TIMER enabled"
else
  echo "FAIL_RESTORE_DRILL_TIMER missing_or_disabled"
  failures=$((failures + 1))
fi

if ! run_npm_audit; then
  echo "FAIL_NPM_AUDIT failed_or_timed_out"
  failures=$((failures + 1))
fi

if [[ "$failures" -gt 0 ]]; then
  echo "SECURITY_AUDIT_FAILED failures=$failures"
  exit 1
fi

echo "SECURITY_AUDIT_OK"
