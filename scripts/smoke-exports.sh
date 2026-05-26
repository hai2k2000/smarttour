#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
OUT_DIR="${OUT_DIR:-/tmp/smarttour-export-smoke}"

mkdir -p "$OUT_DIR"

token=$(curl -fsS -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(d.token || d.accessToken || "")')

test -n "$token"

exports=(
  "finance-receipts:/finance/receipts/export"
  "finance-payments:/finance/payments/export"
  "finance-invoices:/finance/invoices/export"
  "finance-cashflow:/finance/cashflow/export"
  "report-customer-debt:/reports/export/customer-debt"
  "report-supplier-debt:/reports/export/supplier-debt"
  "report-finance:/reports/export/finance"
  "report-employees:/reports/export/employees"
  "report-profit:/reports/export/profit"
)

for item in "${exports[@]}"; do
  name="${item%%:*}"
  path="${item#*:}"
  file="$OUT_DIR/$name.csv"
  code=$(curl -fsS -o "$file" -w '%{http_code}' -H "Authorization: Bearer $token" "$API_URL$path")
  if [[ "$code" != "200" ]]; then
    echo "FAIL_EXPORT $name http=$code"
    exit 1
  fi
  if [[ ! -s "$file" ]]; then
    echo "OK_EXPORT_EMPTY $name"
  elif file "$file" | grep -Eiq 'text|csv|empty'; then
    echo "OK_EXPORT $name $(wc -c < "$file" | tr -d ' ') bytes"
  else
    echo "FAIL_EXPORT_FORMAT $name"
    file "$file"
    exit 1
  fi
done

echo "SMOKE_EXPORTS_OK output=$OUT_DIR"
