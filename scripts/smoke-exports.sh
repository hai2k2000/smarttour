#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@smarttour.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
OUT_DIR="${OUT_DIR:-/tmp/smarttour-export-smoke}"

mkdir -p "$OUT_DIR"

curl_with_retry() {
  local attempt
  for attempt in {1..20}; do
    if curl "$@"; then
      return 0
    fi
    sleep 1
  done
  curl "$@"
}

token="$AUTH_TOKEN"
if [[ -z "$token" ]]; then
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    echo "Set AUTH_TOKEN or ADMIN_PASSWORD to run export smoke" >&2
    exit 1
  fi
  cookie_jar="$(mktemp)"
  trap 'rm -f "$cookie_jar"' EXIT
  login_body=$(curl_with_retry -fsS -c "$cookie_jar" -X POST "$API_URL/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
  node -e 'const d=JSON.parse(process.argv[1] || "{}"); if (d.token !== undefined || d.accessToken !== undefined) process.exit(1)' "$login_body"
  token=$(awk '$6 == "smarttour.auth.token" { value=$7 } END { print value }' "$cookie_jar")
fi

test -n "$token"

exports=(
  "finance-receipts:/finance/receipts/export"
  "finance-payments:/finance/payments/export"
  "finance-invoices:/finance/invoices/export"
  "finance-cashflow:/finance/cashflow/export"
  "customers:/customers/export"
  "suppliers:/suppliers/export"
  "suppliers-hotels:/suppliers/hotels/export"
  "suppliers-restaurants:/suppliers/restaurants/export"
  "report-customer-debt:/reports/export/customer-debt"
  "report-supplier-debt:/reports/export/supplier-debt"
  "report-finance:/reports/export/finance"
  "report-employees:/reports/export/employees"
  "report-profit:/reports/export/profit"
  "commission-report:/commission-reports/export"
  "order-center:/order-center/export"
)

fit_tour_id=$(curl_with_retry -fsS -H "Cookie: smarttour.auth.token=$token" "$API_URL/fit-tours" \
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
  code=$(curl_with_retry -fsS -o "$file" -w '%{http_code}' -H "Cookie: smarttour.auth.token=$token" "$API_URL$path")
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

xlsx_exports=(
  "finance-receipts-xlsx:/finance/receipts/export?format=xlsx"
  "finance-payments-xlsx:/finance/payments/export?format=xlsx"
  "finance-invoices-xlsx:/finance/invoices/export?format=xlsx"
  "finance-cashflow-xlsx:/finance/cashflow/export?format=xlsx"
  "customers-xlsx:/customers/export?format=xlsx"
  "suppliers-xlsx:/suppliers/export?format=xlsx"
  "suppliers-hotels-xlsx:/suppliers/hotels/export?format=xlsx"
  "suppliers-restaurants-xlsx:/suppliers/restaurants/export?format=xlsx"
  "report-customer-debt-xlsx:/reports/export/customer-debt?format=xlsx"
  "report-supplier-debt-xlsx:/reports/export/supplier-debt?format=xlsx"
  "report-finance-xlsx:/reports/export/finance?format=xlsx"
  "report-employees-xlsx:/reports/export/employees?format=xlsx"
  "report-profit-xlsx:/reports/export/profit?format=xlsx"
  "commission-report-xlsx:/commission-reports/export?format=xlsx"
  "order-center-xlsx:/order-center/export?format=xlsx"
)

if [[ -n "${fit_tour_id:-}" ]]; then
  xlsx_exports+=("fit-tour-xlsx:/fit-tours/$fit_tour_id/export?format=xlsx")
fi

for item in "${xlsx_exports[@]}"; do
  name="${item%%:*}"
  path="${item#*:}"
  file="$OUT_DIR/$name.xlsx"
  headers="$OUT_DIR/$name.headers"
  code=$(curl_with_retry -fsS -D "$headers" -o "$file" -w '%{http_code}' -H "Cookie: smarttour.auth.token=$token" "$API_URL$path")
  if [[ "$code" != "200" ]]; then
    echo "FAIL_EXPORT_XLSX $name http=$code"
    exit 1
  fi
  if [[ ! -s "$file" ]]; then
    echo "FAIL_EXPORT_XLSX_EMPTY_FILE $name"
    exit 1
  fi
  if ! grep -iq 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' "$headers"; then
    echo "FAIL_EXPORT_XLSX_CONTENT_TYPE $name"
    cat "$headers"
    exit 1
  fi
  magic=$(od -An -tx1 -N4 "$file" | tr -d ' \n')
  if [[ "$magic" != "504b0304" ]]; then
    echo "FAIL_EXPORT_XLSX_MAGIC $name magic=$magic"
    exit 1
  fi
  echo "OK_EXPORT_XLSX $name $(wc -c < "$file" | tr -d ' ') bytes"
done

echo "SMOKE_EXPORTS_OK output=$OUT_DIR"
