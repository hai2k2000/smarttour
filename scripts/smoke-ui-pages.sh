#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
SITE_URL="${SITE_URL:-https://quanly.dunientravel.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
OUT_DIR="${OUT_DIR:-/tmp/smarttour-ui-smoke}"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.html
cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar"' EXIT

login_body=$(curl -fsS -c "$cookie_jar" -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
node -e 'const d=JSON.parse(process.argv[1] || "{}"); if (d.token !== undefined || d.accessToken !== undefined) process.exit(1)' "$login_body"
token=$(awk '$6 == "smarttour.auth.token" { value=$7 } END { print value }' "$cookie_jar")
test -n "$token"

paths=(
  "/"
  "/security"
  "/customers"
  "/orders/fit-tours"
  "/finance"
  "/operations"
  "/operation-vouchers"
  "/order-center"
  "/quotes/tours"
  "/quotes/combos"
  "/quotations"
  "/suppliers"
  "/suppliers/hotels"
  "/suppliers/restaurants"
  "/bookings"
  "/tour-programs"
  "/reports"
  "/tour-guides"
  "/commission-reports"
  "/fit-tours"
  "/git-tours"
  "/landtours"
)

failures=0
for path in "${paths[@]}"; do
  safe=$(printf '%s' "$path" | sed 's#^/##; s#[/?&=]#_#g; s#^$#home#')
  file="$OUT_DIR/$safe.html"
  code=$(curl -ksS -L -o "$file" -w '%{http_code}' \
    -H "Cookie: smarttour.auth.token=$token" \
    -H 'Accept: text/html' \
    "$SITE_URL$path")
  bytes=$(wc -c < "$file" | tr -d ' ')
  if [[ "$code" != "200" ]]; then
    echo "FAIL $code $path"
    failures=$((failures + 1))
    continue
  fi
  if [[ "$bytes" -lt 500 ]]; then
    echo "FAIL SMALL_HTML $bytes $path"
    failures=$((failures + 1))
    continue
  fi
  if grep -Eiq 'Application error|Internal Server Error|Unhandled Runtime Error|NEXT_NOT_FOUND|NEXT_REDIRECT|Cannot read properties|TypeError:|ReferenceError:' "$file"; then
    echo "FAIL ERROR_SIGNATURE $path"
    failures=$((failures + 1))
    continue
  fi
  echo "200 UI $path $bytes bytes"
done

if [[ "$failures" -gt 0 ]]; then
  echo "SMOKE_UI_FAILED failures=$failures output=$OUT_DIR" >&2
  exit 1
fi

echo "SMOKE_UI_PAGES_OK output=$OUT_DIR"