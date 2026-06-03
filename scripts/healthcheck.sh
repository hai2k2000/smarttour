#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-https://aitour.io.vn}"
API_URL="${API_URL:-https://aitour.io.vn/api}"
REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"

failures=0

notify_failure() {
  local message="$1"
  if [[ -n "${HEALTHCHECK_WEBHOOK_URL:-}" ]]; then
    curl -fsS -X POST "$HEALTHCHECK_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      --data "{\"text\":\"$message\"}" >/dev/null || true
  fi
}

check_http() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"
  local attempts="${HTTP_ATTEMPTS:-6}"
  local delay="${HTTP_RETRY_DELAY:-3}"
  local code
  for attempt in $(seq 1 "$attempts"); do
    code=$(curl -ksS -o /dev/null -w '%{http_code}' "$url" || true)
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
  if docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null | grep -qx true; then
    echo "OK_CONTAINER $name"
  else
    echo "FAIL_CONTAINER $name"
    failures=$((failures + 1))
  fi
}

check_container smarttour-web-1
check_container smarttour-api-1
check_container smarttour-nginx-1
check_container smarttour-postgres-1
check_container smarttour-redis-1
check_container smarttour-minio-1

check_http site "$SITE_URL/" 307
check_http login "$SITE_URL/login" 200
check_http api_requires_auth "$API_URL/auth/me" 401
check_http minio_live "http://127.0.0.1:9000/minio/health/live" 200

if docker compose exec -T api printenv SMARTTOUR_AUTH_ENFORCE | grep -qx true; then
  echo "OK_AUTH_ENFORCE true"
else
  echo "FAIL_AUTH_ENFORCE not true"
  failures=$((failures + 1))
fi

docker exec smarttour-postgres-1 pg_isready -U smarttour -d smarttour >/dev/null && echo "OK_POSTGRES pg_isready" || { echo "FAIL_POSTGRES pg_isready"; failures=$((failures + 1)); }
docker exec smarttour-redis-1 redis-cli ping | grep -qx PONG && echo "OK_REDIS ping" || { echo "FAIL_REDIS ping"; failures=$((failures + 1)); }

disk_use=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [[ "$disk_use" -ge "${DISK_WARN_PERCENT:-85}" ]]; then
  echo "FAIL_DISK root=${disk_use}%"
  failures=$((failures + 1))
else
  echo "OK_DISK root=${disk_use}%"
fi

if docker logs --since "${LOG_WINDOW:-10m}" smarttour-api-1 2>&1 | grep -Eiq 'error|exception|failed'; then
  echo "FAIL_LOG api has recent error signature"
  failures=$((failures + 1))
else
  echo "OK_LOG api"
fi

if docker logs --since "${LOG_WINDOW:-10m}" smarttour-web-1 2>&1 | grep -Eiq 'error|exception|failed'; then
  echo "FAIL_LOG web has recent error signature"
  failures=$((failures + 1))
else
  echo "OK_LOG web"
fi

if docker ps --format '{{.Names}} {{.Ports}}' | grep -E 'smarttour-(api-1|postgres-1|redis-1|minio-1|n8n-1).*0\.0\.0\.0'; then
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
