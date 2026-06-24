#!/usr/bin/env bash
set -euo pipefail

NGINX_CONTAINER="${NGINX_CONTAINER:-smarttour-nginx-1}"
OFFICIAL_HOST="${OFFICIAL_HOST:-aitour.io.vn}"
REPORT_HOURS="${REPORT_HOURS:-24}"
REPORT_DIR="${REPORT_DIR:-/var/log/smarttour/security}"
KEEP_DAYS="${SECURITY_REPORT_KEEP_DAYS:-30}"
HOST_REPORT_DOCKER_TIMEOUT="${HOST_REPORT_DOCKER_TIMEOUT:-10s}"

run_host_report_docker() {
  timeout "$HOST_REPORT_DOCKER_TIMEOUT" docker "$@"
}

timestamp="$(date +%Y%m%d-%H%M%S)"
report="$REPORT_DIR/nginx-host-report-$timestamp.txt"
latest="$REPORT_DIR/nginx-host-report-latest.txt"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

install -d -m 0750 "$REPORT_DIR"

if ! raw_logs="$(run_host_report_docker logs --since "${REPORT_HOURS}h" "$NGINX_CONTAINER" 2>&1)"; then
  echo "NGINX_HOST_REPORT_ABORT docker_logs_unavailable" >&2
  echo "$raw_logs" >&2
  exit 1
fi

printf '%s\n' "$raw_logs" | grep -F '|host=' > "$tmp" || true

{
  echo "SMARTTOUR_NGINX_HOST_REPORT"
  echo "generated_at=$(date --iso-8601=seconds)"
  echo "container=$NGINX_CONTAINER"
  echo "official_host=$OFFICIAL_HOST"
  echo "window_hours=$REPORT_HOURS"
  echo "parsed_requests=$(wc -l < "$tmp")"

  echo
  echo "TOP_HOSTS"
  cut -d'|' -f2 "$tmp" | sed 's/^host=//' | sort | uniq -c | sort -nr | head -30

  echo
  echo "TOP_UNKNOWN_HOSTS"
  grep -Fv "|host=${OFFICIAL_HOST}|" "$tmp" \
    | cut -d'|' -f2 | sed 's/^host=//' | sort | uniq -c | sort -nr | head -30 || true

  echo
  echo "TOP_CLIENT_IPS"
  cut -d'|' -f1 "$tmp" | sort | uniq -c | sort -nr | head -30

  echo
  echo "TOP_STATUS_CODES"
  cut -d'|' -f5 "$tmp" | sed 's/^status=//' | sort | uniq -c | sort -nr

  echo
  echo "RECENT_UNKNOWN_REQUESTS"
  grep -Fv "|host=${OFFICIAL_HOST}|" "$tmp" | tail -20 || true
} | tee "$report"
chmod 0640 "$report"

cp "$report" "$latest"
chmod 0640 "$latest"
find "$REPORT_DIR" -maxdepth 1 -type f -name 'nginx-host-report-*.txt' -mtime "+$KEEP_DAYS" -delete

echo "NGINX_HOST_REPORT_OK report=$report"
