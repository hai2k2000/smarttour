#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-https://quanly.dunientravel.com}"
API_URL="${API_URL:-http://127.0.0.1:4000/api}"
REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"

failures=0

check_http() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"
  local code
  code=$(curl -ksS -o /dev/null -w '%{http_code}' "$url" || true)
  if [[ "$code" != "$expected" ]]; then
    echo "FAIL_HTTP $name expected=$expected actual=$code url=$url"
    failures=$((failures + 1))
  else
    echo "OK_HTTP $name $code"
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

check_container smarttour-web-preview
check_container smarttour-api-1
check_container smarttour-postgres-1
check_container smarttour-redis-1

check_http site "$SITE_URL/"
check_http login "$SITE_URL/login"
check_http api_login_bad "$API_URL/auth/login" 404

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

if docker logs --since "${LOG_WINDOW:-10m}" smarttour-web-preview 2>&1 | grep -Eiq 'error|exception|failed'; then
  echo "FAIL_LOG web has recent error signature"
  failures=$((failures + 1))
else
  echo "OK_LOG web"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "HEALTHCHECK_FAILED failures=$failures"
  exit 1
fi

echo "HEALTHCHECK_OK"
