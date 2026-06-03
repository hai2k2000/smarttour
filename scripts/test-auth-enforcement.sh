#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
API_URL="${API_URL:-https://aitour.io.vn/api}"

cd "$REPO_DIR"

code=$(curl -ksS -o /dev/null -w '%{http_code}' "$API_URL/auth/users" || true)
if [[ "$code" != "401" ]]; then
  echo "FAIL_AUTH_USERS_UNAUTH expected=401 actual=$code"
  exit 1
fi

code=$(curl -ksS -o /dev/null -w '%{http_code}' "$API_URL/auth/me" || true)
if [[ "$code" != "401" ]]; then
  echo "FAIL_AUTH_ME_UNAUTH expected=401 actual=$code"
  exit 1
fi

for path in customers finance/receipts orders/fit-tours files/download; do
  code=$(curl -ksS -o /dev/null -w '%{http_code}' "$API_URL/$path" || true)
  if [[ "$code" != "401" ]]; then
    echo "FAIL_SENSITIVE_ROUTE_UNAUTH path=$path expected=401 actual=$code"
    exit 1
  fi
done

if docker compose exec -T api printenv SMARTTOUR_AUTH_ENFORCE | grep -qx true; then
  echo "OK_AUTH_ENFORCE_ENV true"
else
  echo "FAIL_AUTH_ENFORCE_ENV not true"
  exit 1
fi

echo "TEST_AUTH_ENFORCEMENT_OK"
