#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-https://aitour.io.vn}"
API_URL="${API_URL:-https://aitour.io.vn/api}"
REPO_DIR="${REPO_DIR:-/opt/smarttour}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups/postgres}"
DISASTER_BACKUP_DIR="${DISASTER_BACKUP_DIR:-/var/backups/smarttour/disaster}"
RESTORE_DRILL_LOG="${RESTORE_DRILL_LOG:-/var/log/smarttour/restore-drill.log}"
RESTORE_DRILL_SERVICE="${RESTORE_DRILL_SERVICE:-smarttour-restore-drill.service}"
DOCKER_CHECK_TIMEOUT="${DOCKER_CHECK_TIMEOUT:-10s}"
SYSTEMD_CHECK_TIMEOUT="${SYSTEMD_CHECK_TIMEOUT:-10s}"

cd "$REPO_DIR"

failures=0

run_docker_check() {
  timeout "$DOCKER_CHECK_TIMEOUT" "$@"
}

run_systemd_check() {
  timeout "$SYSTEMD_CHECK_TIMEOUT" systemctl "$@"
}

notify_failure() {
  local message="$1"
  if [[ -n "${HEALTHCHECK_WEBHOOK_URL:-}" ]]; then
    local webhook_connect_timeout="${HEALTHCHECK_WEBHOOK_CONNECT_TIMEOUT:-5}"
    local webhook_max_time="${HEALTHCHECK_WEBHOOK_MAX_TIME:-10}"
    local webhook_retries="${HEALTHCHECK_WEBHOOK_RETRIES:-2}"
    local payload
    payload="$(SMARTTOUR_ALERT_HOST="$(hostname)" SMARTTOUR_ALERT_MESSAGE="$message" node -e 'process.stdout.write(JSON.stringify({ event: "smarttour_healthcheck_failed", host: process.env.SMARTTOUR_ALERT_HOST, message: process.env.SMARTTOUR_ALERT_MESSAGE }))')"
    curl -fsS \
      --connect-timeout "$webhook_connect_timeout" \
      --max-time "$webhook_max_time" \
      --retry "$webhook_retries" \
      -X POST "$HEALTHCHECK_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      --data "$payload" >/dev/null || true
  fi
}


check_http() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"
  local attempts="${HTTP_ATTEMPTS:-6}"
  local delay="${HTTP_RETRY_DELAY:-3}"
  local connect_timeout="${HTTP_CONNECT_TIMEOUT:-5}"
  local max_time="${HTTP_MAX_TIME:-10}"
  local code
  for attempt in $(seq 1 "$attempts"); do
    code=$(curl -ksS \
      --connect-timeout "$connect_timeout" \
      --max-time "$max_time" \
      -o /dev/null \
      -w '%{http_code}' \
      "$url" || true)
    if [[ "$code" == "$expected" ]]; then
      echo "OK_HTTP $name $code"
      return
    fi
    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$delay"
    fi
  done
  if [[ "$code" != "$expected" ]]; then
    echo "FAIL_HTTP $name expected=$expected actual=$code url=$url"
    failures=$((failures + 1))
  fi
}

check_container() {
  local name="$1"
  if run_docker_check docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null | grep -qx true; then
    echo "OK_CONTAINER $name"
  else
    echo "FAIL_CONTAINER $name"
    failures=$((failures + 1))
  fi
}

recent_logs_for_scan() {
  local name="$1"
  local raw_logs
  if ! raw_logs="$(run_docker_check docker logs --since "${LOG_WINDOW:-10m}" "$name" 2>&1)"; then
    return 1
  fi
  printf '%s\n' "$raw_logs" \
    | grep -Ev "Content-Type doesn't match Reply body|ExceptionFilter for non-JSON responses" \
    | grep -Ev '"event":"request_failed".*"statusCode":4[0-9][0-9]' \
    || true
}

check_container smarttour-web-1
check_container smarttour-api-1
check_container smarttour-nginx-1
check_container smarttour-postgres-1
check_container smarttour-redis-1
check_container smarttour-minio-1
check_container smarttour-n8n-1

check_http site "$SITE_URL/" 307
check_http login "$SITE_URL/login" 200
check_http api_requires_auth "$API_URL/auth/me" 401
check_http minio_live "http://127.0.0.1:9000/minio/health/live" 200

if run_docker_check docker compose exec -T api printenv SMARTTOUR_AUTH_ENFORCE | grep -qx true; then
  echo "OK_AUTH_ENFORCE true"
else
  echo "FAIL_AUTH_ENFORCE not true"
  failures=$((failures + 1))
fi

if run_docker_check docker exec smarttour-postgres-1 pg_isready -U smarttour -d smarttour >/dev/null; then
  echo "OK_POSTGRES pg_isready"
else
  echo "FAIL_POSTGRES pg_isready"
  failures=$((failures + 1))
fi

if run_docker_check docker exec smarttour-redis-1 redis-cli ping | grep -qx PONG; then
  echo "OK_REDIS ping"
else
  echo "FAIL_REDIS ping"
  failures=$((failures + 1))
fi

root_mode="$(stat -c '%a' /)"
if [[ "$root_mode" == "755" ]]; then
  echo "OK_ROOT_MODE /=$root_mode"
else
  echo "FAIL_ROOT_MODE expected=755 actual=$root_mode"
  failures=$((failures + 1))
fi

systemd_failed_units_available=false
if ! failed_units_output="$(run_systemd_check --failed --no-legend --plain 2>/dev/null)"; then
  echo "FAIL_SYSTEMD unavailable"
  failures=$((failures + 1))
else
  systemd_failed_units_available=true
  critical_failed_units="$(printf '%s\n' "$failed_units_output" \
    | awk '{print $1}' \
    | grep -E '^(dbus|polkit|systemd-networkd|systemd-resolved|networkd-dispatcher|docker|ssh)\.(service|socket)$' \
    || true)"
fi
if [[ "${critical_failed_units:-}" != "" ]]; then
  echo "FAIL_SYSTEMD critical_failed=$(echo "$critical_failed_units" | paste -sd, -)"
  failures=$((failures + 1))
elif [[ "$systemd_failed_units_available" == "true" ]]; then
  echo "OK_SYSTEMD no critical failed units"
fi

disk_use=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [[ "$disk_use" -ge "${DISK_WARN_PERCENT:-85}" ]]; then
  echo "FAIL_DISK root=${disk_use}%"
  failures=$((failures + 1))
else
  echo "OK_DISK root=${disk_use}%"
fi

latest_backup="$(find "$BACKUP_DIR" -type f -name 'smarttour-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 || true)"
if [[ -z "$latest_backup" ]]; then
  echo "FAIL_BACKUP no PostgreSQL backup in $BACKUP_DIR"
  failures=$((failures + 1))
else
  latest_backup_epoch="${latest_backup%% *}"
  latest_backup_file="${latest_backup#* }"
  backup_age_hours=$(( ($(date +%s) - ${latest_backup_epoch%.*}) / 3600 ))
  if [[ "$backup_age_hours" -gt "${BACKUP_MAX_AGE_HOURS:-30}" ]]; then
    echo "FAIL_BACKUP stale age=${backup_age_hours}h file=$latest_backup_file"
    failures=$((failures + 1))
  elif [[ -f "$latest_backup_file.sha256" ]] && sha256sum -c "$latest_backup_file.sha256" >/dev/null 2>&1; then
    echo "OK_BACKUP age=${backup_age_hours}h checksum=valid file=$latest_backup_file"
  else
    echo "FAIL_BACKUP checksum missing_or_invalid file=$latest_backup_file"
    failures=$((failures + 1))
  fi
fi

latest_disaster_backup="$(find "$DISASTER_BACKUP_DIR" -maxdepth 1 -type f -name 'smarttour-disaster-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 || true)"
if [[ -z "$latest_disaster_backup" ]]; then
  echo "FAIL_DISASTER_BACKUP no disaster backup in $DISASTER_BACKUP_DIR"
  failures=$((failures + 1))
else
  latest_disaster_backup_epoch="${latest_disaster_backup%% *}"
  latest_disaster_backup_file="${latest_disaster_backup#* }"
  disaster_backup_age_hours=$(( ($(date +%s) - ${latest_disaster_backup_epoch%.*}) / 3600 ))
  if [[ "$disaster_backup_age_hours" -gt "${DISASTER_BACKUP_MAX_AGE_HOURS:-192}" ]]; then
    echo "FAIL_DISASTER_BACKUP stale age=${disaster_backup_age_hours}h file=$latest_disaster_backup_file"
    failures=$((failures + 1))
  elif [[ -f "$latest_disaster_backup_file.sha256" ]] && sha256sum -c "$latest_disaster_backup_file.sha256" >/dev/null 2>&1; then
    echo "OK_DISASTER_BACKUP age=${disaster_backup_age_hours}h checksum=valid file=$latest_disaster_backup_file"
  else
    echo "FAIL_DISASTER_BACKUP checksum missing_or_invalid file=$latest_disaster_backup_file"
    failures=$((failures + 1))
  fi
fi

if [[ ! -f "$RESTORE_DRILL_LOG" ]]; then
  echo "FAIL_RESTORE_DRILL missing_log log=$RESTORE_DRILL_LOG"
  failures=$((failures + 1))
elif ! grep -Fq 'RESTORE_DRILL_OK' "$RESTORE_DRILL_LOG"; then
  echo "FAIL_RESTORE_DRILL missing_success_marker log=$RESTORE_DRILL_LOG"
  failures=$((failures + 1))
else
  restore_drill_epoch="$(stat -c '%Y' "$RESTORE_DRILL_LOG")"
  restore_drill_age_hours=$(( ($(date +%s) - restore_drill_epoch) / 3600 ))
  restore_drill_result="$(run_systemd_check show "$RESTORE_DRILL_SERVICE" -p Result --value 2>/dev/null || true)"
  if [[ "$restore_drill_age_hours" -gt "${RESTORE_DRILL_MAX_AGE_HOURS:-192}" ]]; then
    echo "FAIL_RESTORE_DRILL stale age=${restore_drill_age_hours}h log=$RESTORE_DRILL_LOG"
    failures=$((failures + 1))
  elif [[ "$restore_drill_result" != "success" ]]; then
    echo "FAIL_RESTORE_DRILL result=${restore_drill_result:-unknown} service=$RESTORE_DRILL_SERVICE"
    failures=$((failures + 1))
  else
    echo "OK_RESTORE_DRILL age=${restore_drill_age_hours}h result=success log=$RESTORE_DRILL_LOG"
  fi
fi

if ! api_logs="$(recent_logs_for_scan smarttour-api-1)"; then
  echo "FAIL_LOG api unavailable"
  failures=$((failures + 1))
elif printf '%s\n' "$api_logs" | grep -Eiq 'error|exception|failed'; then
  echo "FAIL_LOG api has recent error signature"
  failures=$((failures + 1))
else
  echo "OK_LOG api"
fi

if ! web_logs="$(recent_logs_for_scan smarttour-web-1)"; then
  echo "FAIL_LOG web unavailable"
  failures=$((failures + 1))
elif printf '%s\n' "$web_logs" | grep -Eiq 'error|exception|failed'; then
  echo "FAIL_LOG web has recent error signature"
  failures=$((failures + 1))
else
  echo "OK_LOG web"
fi

if ! ports_output="$(run_docker_check docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null)"; then
  echo "FAIL_PORTS docker_ps_unavailable"
  failures=$((failures + 1))
elif printf '%s\n' "$ports_output" | grep -E 'smarttour-(api-1|postgres-1|redis-1|minio-1|n8n-1).*0\.0\.0\.0'; then
  echo "FAIL_PORTS internal SmartTour service exposes host ports on all interfaces"
  failures=$((failures + 1))
else
  echo "OK_PORTS internal services are localhost-bound"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "HEALTHCHECK_FAILED failures=$failures"
  notify_failure "SmartTour healthcheck failed on $(hostname): failures=$failures"
  exit 1
fi

echo "HEALTHCHECK_OK"
