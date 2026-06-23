#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://aitour.io.vn/api}"
LOG_WINDOW="${LOG_WINDOW:-2m}"
HTTP_ATTEMPTS="${HTTP_ATTEMPTS:-6}"
HTTP_RETRY_DELAY="${HTTP_RETRY_DELAY:-3}"
safe_id="smoke-correlation-$(date +%s)-$$"
unsafe_id="unsafe id with spaces"
generated_id=""

fail() {
  echo "FAIL_CORRELATION $1"
  exit 1
}

header_value() {
  local file="$1"
  awk 'BEGIN{IGNORECASE=1} /^x-correlation-id:/ {gsub("\r",""); print $2; exit}' "$file"
}

probe_auth_me() {
  local header_file="$1"
  shift
  local code
  for attempt in $(seq 1 "$HTTP_ATTEMPTS"); do
    code="$(curl -ksS -o /tmp/smarttour-correlation-body.json -D "$header_file" -w '%{http_code}' "$@" "$API_URL/auth/me" || true)"
    if [[ "$code" == "401" ]]; then
      return
    fi
    if [[ "$attempt" -lt "$HTTP_ATTEMPTS" ]]; then
      sleep "$HTTP_RETRY_DELAY"
    fi
  done
  fail "expected /auth/me 401 got $code"
}

probe_auth_me /tmp/smarttour-correlation-safe.headers -H "x-correlation-id: $safe_id"
safe_response_id="$(header_value /tmp/smarttour-correlation-safe.headers)"
[[ "$safe_response_id" == "$safe_id" ]] || fail "safe incoming correlation id was not echoed"

probe_auth_me /tmp/smarttour-correlation-unsafe.headers -H "x-correlation-id: $unsafe_id"
unsafe_response_id="$(header_value /tmp/smarttour-correlation-unsafe.headers)"
[[ -n "$unsafe_response_id" ]] || fail "unsafe request did not receive generated correlation id"
[[ "$unsafe_response_id" != "$unsafe_id" ]] || fail "unsafe incoming correlation id was echoed"
printf '%s\n' "$unsafe_response_id" | grep -E '^[a-zA-Z0-9._:-]+$' >/dev/null || fail "generated replacement id has unsafe characters"

probe_auth_me /tmp/smarttour-correlation-generated.headers
generated_id="$(header_value /tmp/smarttour-correlation-generated.headers)"
[[ -n "$generated_id" ]] || fail "missing generated x-correlation-id"
printf '%s\n' "$generated_id" | grep -E '^[a-zA-Z0-9._:-]+$' >/dev/null || fail "generated_id has unsafe characters"

login_code="$(curl -ksS -o /tmp/smarttour-correlation-login-body.json -D /tmp/smarttour-correlation-login.headers -w '%{http_code}' \
  -H "x-correlation-id: $safe_id" \
  -H 'content-type: application/json' \
  --data '{}' \
  "$API_URL/auth/login" || true)"
[[ "$login_code" == "400" ]] || fail "expected /auth/login validation 400 got $login_code"
login_response_id="$(header_value /tmp/smarttour-correlation-login.headers)"
[[ "$login_response_id" == "$safe_id" ]] || fail "login validation did not echo safe correlation id"

sleep 1
log_line="$(docker logs --since "$LOG_WINDOW" smarttour-api-1 2>&1 | grep "$safe_id" | grep 'request_failed' | tail -1 || true)"
[[ -n "$log_line" ]] || fail "request_failed log line with safe correlation id was not found"
printf '%s\n' "$log_line" | grep -E '"path":"\/api\/auth\/login"' >/dev/null || fail "correlation log line missing auth/login path"
if printf '%s\n' "$log_line" | grep -Eiq 'authorization|cookie|password|token|secret'; then
  fail "correlation log line contains sensitive field name"
fi

echo "SMOKE_CORRELATION_ID_OK"
