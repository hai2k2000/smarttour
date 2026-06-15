#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
OUT_DIR="${OUT_DIR:-/tmp/smarttour-export-smoke}"

mkdir -p "$OUT_DIR"

token="$AUTH_TOKEN"
if [[ -z "$token" ]]; then
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    echo "Set AUTH_TOKEN or ADMIN_PASSWORD to run export smoke" >&2
    exit 1
  fi
  token=$(curl -fsS -X POST "$API_URL/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(d.token || d.accessToken || "")')
fi

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
  "commission-report:/commission-reports/export"
  "order-center:/order-center/export"
)

fit_tour_id=$(curl -fsS -H "Authorization: Bearer $token" "$API_URL/fit-tours" \
  | node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(0,"utf8")); const rows=Array.isArray(data)?data:(data.rows||[]); process.stdout.write(rows[0]?.id||"")')
if [[ -n "$fit_tour_id" ]]; then
  exports+=("fit-tour:/fit-tours/$fit_tour_id/export")
else
  echo "SKIP_EXPORT fit-tour no rows"
fi

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
    echo "FAIL_EXPORT_EMPTY_FILE $name"
    exit 1
  fi
  bom=$(od -An -tx1 -N3 "$file" | tr -d ' \n')
  if [[ "$bom" != "efbbbf" ]]; then
    echo "FAIL_EXPORT_BOM $name bom=$bom"
    exit 1
  fi
  if [[ $(wc -c < "$file") -gt 3 ]] && ! node - "$file" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
if (!text.startsWith('\uFEFF')) process.exit(1);
if (text.includes('\n') && !text.includes('\r\n')) process.exit(1);
const firstLine = text.replace(/^\uFEFF/, '').split('\r\n', 1)[0];
if (!firstLine) process.exit(1);
NODE
  then
    echo "FAIL_EXPORT_EXCEL_FORMAT $name"
    exit 1
  fi
  if file "$file" | grep -Eiq 'text|csv|empty'; then
    echo "OK_EXPORT_EXCEL $name $(wc -c < "$file" | tr -d ' ') bytes"
  else
    echo "FAIL_EXPORT_FORMAT $name"
    file "$file"
    exit 1
  fi
done

echo "SMOKE_EXPORTS_OK output=$OUT_DIR"
