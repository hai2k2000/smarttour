#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
SOURCE_FILE="${SOURCE_FILE:-AGENTS.md}"
OUT_DIR="${OUT_DIR:-/tmp/smarttour-files-smoke}"

mkdir -p "$OUT_DIR"
response="$OUT_DIR/upload.json"
download="$OUT_DIR/download"
object_key=""
fit_tour_id=""
fit_file_id=""
guide_id=""
guide_file_id=""
customer_id=""
customer_file_id=""
receipt_id=""
payment_id=""
invoice_id=""
invoice_file_id=""
receipt_import_id=""
payment_import_id=""
receipt_import_csv="$OUT_DIR/receipt-import.csv"
payment_import_csv="$OUT_DIR/payment-import.csv"
smoke_id="$(date +%s)-$$"
customer_phone="09${smoke_id//-/}"

cookie_jar="$(mktemp)"
login_body=$(curl -fsS -c "$cookie_jar" -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")
node -e 'const d=JSON.parse(process.argv[1] || "{}"); if (d.token !== undefined || d.accessToken !== undefined) process.exit(1)' "$login_body"
token=$(awk '$6 == "smarttour.auth.token" { value=$7 } END { print value }' "$cookie_jar")
test -n "$token"

cleanup() {
  if [[ -n "$receipt_id" || -n "$payment_id" || -n "$invoice_id" || -n "$receipt_import_id" || -n "$payment_import_id" ]]; then
    if [[ -n "$receipt_id" ]]; then
      curl -fsS -X DELETE \
        -H "Cookie: smarttour.auth.token=$token" \
        "$API_URL/finance/receipts/$receipt_id/file" >/dev/null || true
    fi
    if [[ -n "$payment_id" ]]; then
      curl -fsS -X DELETE \
        -H "Cookie: smarttour.auth.token=$token" \
        "$API_URL/finance/payments/$payment_id/file" >/dev/null || true
    fi
    if [[ -n "$invoice_file_id" ]]; then
      curl -fsS -X DELETE \
        -H "Cookie: smarttour.auth.token=$token" \
        "$API_URL/finance/invoices/$invoice_id/files/$invoice_file_id" >/dev/null || true
    fi
    docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "AuditLog" WHERE "entityId" IN ('$receipt_id', '$payment_id', '$invoice_id', '$receipt_import_id', '$payment_import_id');
DELETE FROM "FinanceReceiptOrder" WHERE "receiptId" = '$receipt_id';
DELETE FROM "FinanceReceiptOrder" WHERE "receiptId" = '$receipt_import_id';
DELETE FROM "FinanceReceipt" WHERE id = '$receipt_id';
DELETE FROM "FinanceReceipt" WHERE id = '$receipt_import_id';
DELETE FROM "FinancePayment" WHERE id = '$payment_id';
DELETE FROM "FinancePayment" WHERE id = '$payment_import_id';
DELETE FROM "FinanceInvoiceFile" WHERE "invoiceId" = '$invoice_id';
DELETE FROM "FinanceInvoiceItem" WHERE "invoiceId" = '$invoice_id';
DELETE FROM "FinanceInvoice" WHERE id = '$invoice_id';
SQL
  fi
  if [[ -n "$customer_id" ]]; then
    if [[ -n "$customer_file_id" ]]; then
      curl -fsS -X DELETE \
        -H "Cookie: smarttour.auth.token=$token" \
        "$API_URL/customers/$customer_id/files/$customer_file_id" >/dev/null || true
    fi
    curl -fsS -X DELETE \
      -H "Cookie: smarttour.auth.token=$token" \
      "$API_URL/customers/$customer_id" >/dev/null || true
  fi
  if [[ -n "$guide_id" ]]; then
    if [[ -n "$guide_file_id" ]]; then
      curl -fsS -X DELETE \
        -H "Cookie: smarttour.auth.token=$token" \
        "$API_URL/tour-guides/$guide_id/files/$guide_file_id" >/dev/null || true
    fi
    docker exec -i smarttour-postgres-1 psql -U smarttour -d smarttour >/dev/null <<SQL || true
DELETE FROM "GuideFile" WHERE "guideId" = '$guide_id';
DELETE FROM "GuideSchedule" WHERE "guideId" = '$guide_id';
DELETE FROM "GuideCostService" WHERE "guideId" = '$guide_id';
DELETE FROM "GuideDocument" WHERE "guideId" = '$guide_id';
DELETE FROM "GuideCard" WHERE "guideId" = '$guide_id';
DELETE FROM "GuideProfile" WHERE id = '$guide_id';
SQL
  fi
  if [[ -n "$fit_tour_id" ]]; then
    curl -fsS -X DELETE \
      -H "Cookie: smarttour.auth.token=$token" \
      "$API_URL/fit-tours/$fit_tour_id" >/dev/null || true
  fi
  if [[ -n "$object_key" ]]; then
    curl -fsS -X DELETE -G \
      -H "Cookie: smarttour.auth.token=$token" \
      --data-urlencode "key=$object_key" \
      "$API_URL/files" >/dev/null || true
  fi
  rm -f "$response" "$download" "$receipt_import_csv" "$payment_import_csv" "$cookie_jar"
}
trap cleanup EXIT

denied=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;filename=unsafe.svg;type=image/svg+xml" \
  -F 'scope=smoke' \
  "$API_URL/files/upload")
test "$denied" = "400"

fit_tour=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -H 'Content-Type: application/json' \
  --data "{\"quoteCode\":\"FIT-FILE-$smoke_id\",\"tourCode\":\"FIT-FILE-$smoke_id\",\"customerName\":\"FIT File Smoke\"}" \
  "$API_URL/fit-tours")
fit_tour_id=$(jq -r '.id // empty' <<<"$fit_tour")
common_tour_id=$(jq -r '.tourId // empty' <<<"$fit_tour")
test -n "$fit_tour_id"
test -n "$common_tour_id"

fit_file=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;type=text/plain" \
  -F 'step=PRICING' \
  "$API_URL/fit-tours/$fit_tour_id/files")
fit_file_id=$(jq -r '.id // empty' <<<"$fit_file")
fit_file_url=$(jq -r '.fileUrl // empty' <<<"$fit_file")
test -n "$fit_file_id"
test -n "$fit_file_url"

curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/fit-tours/$fit_tour_id" \
  | jq -e --arg id "$fit_file_id" '.attachments[] | select(.id == $id and .step == "PRICING")' >/dev/null
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/tours/$common_tour_id" \
  | jq -e --arg url "$fit_file_url" '.attachments[] | select(.fileUrl == $url)' >/dev/null
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "${API_URL%/api}$fit_file_url" > "$download"
cmp -s "$SOURCE_FILE" "$download"

curl -fsS -X DELETE \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/fit-tours/$fit_tour_id/files/$fit_file_id" >/dev/null
deleted_download=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: smarttour.auth.token=$token" \
  "${API_URL%/api}$fit_file_url")
test "$deleted_download" = "404"
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/fit-tours/$fit_tour_id" \
  | jq -e --arg id "$fit_file_id" 'all(.attachments[]; .id != $id)' >/dev/null
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/tours/$common_tour_id" \
  | jq -e --arg url "$fit_file_url" 'all(.attachments[]; .fileUrl != $url)' >/dev/null

guide=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -H 'Content-Type: application/json' \
  --data "{\"guideCode\":\"HDV-FILE-$smoke_id\",\"fullName\":\"HDV File Smoke\",\"phone\":\"0901234567\"}" \
  "$API_URL/tour-guides")
guide_id=$(jq -r '.id // empty' <<<"$guide")
test -n "$guide_id"

guide_file=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;type=text/plain" \
  "$API_URL/tour-guides/$guide_id/files")
guide_file_id=$(jq -r '.id // empty' <<<"$guide_file")
guide_file_url=$(jq -r '.fileUrl // empty' <<<"$guide_file")
test -n "$guide_file_id"
test -n "$guide_file_url"

curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/tour-guides/$guide_id" \
  | jq -e --arg id "$guide_file_id" '.files[] | select(.id == $id)' >/dev/null
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "${API_URL%/api}$guide_file_url" > "$download"
cmp -s "$SOURCE_FILE" "$download"

curl -fsS -X DELETE \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/tour-guides/$guide_id/files/$guide_file_id" >/dev/null
deleted_download=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: smarttour.auth.token=$token" \
  "${API_URL%/api}$guide_file_url")
test "$deleted_download" = "404"
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/tour-guides/$guide_id" \
  | jq -e --arg id "$guide_file_id" 'all(.files[]; .id != $id)' >/dev/null
guide_file_id=""

customer=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -H 'Content-Type: application/json' \
  --data "{\"code\":\"CUS-FILE-$smoke_id\",\"fullName\":\"Customer File Smoke\",\"phone\":\"$customer_phone\"}" \
  "$API_URL/customers")
customer_id=$(jq -r '.id // empty' <<<"$customer")
test -n "$customer_id"

customer_file=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;type=text/plain" \
  "$API_URL/customers/$customer_id/files")
customer_file_id=$(jq -r '.id // empty' <<<"$customer_file")
customer_file_url=$(jq -r '.fileUrl // empty' <<<"$customer_file")
test -n "$customer_file_id"
test -n "$customer_file_url"

curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/customers/$customer_id" \
  | jq -e --arg id "$customer_file_id" '.files[] | select(.id == $id)' >/dev/null
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "${API_URL%/api}$customer_file_url" > "$download"
cmp -s "$SOURCE_FILE" "$download"

curl -fsS -X DELETE \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/customers/$customer_id/files/$customer_file_id" >/dev/null
deleted_download=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: smarttour.auth.token=$token" \
  "${API_URL%/api}$customer_file_url")
test "$deleted_download" = "404"
curl -fsS \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/customers/$customer_id" \
  | jq -e --arg id "$customer_file_id" 'all(.files[]; .id != $id)' >/dev/null
customer_file_id=""

customer_delete_file=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;type=text/plain" \
  "$API_URL/customers/$customer_id/files")
customer_delete_file_url=$(jq -r '.fileUrl // empty' <<<"$customer_delete_file")
test -n "$customer_delete_file_url"
curl -fsS -X DELETE \
  -H "Cookie: smarttour.auth.token=$token" \
  "$API_URL/customers/$customer_id" >/dev/null
deleted_download=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: smarttour.auth.token=$token" \
  "${API_URL%/api}$customer_delete_file_url")
test "$deleted_download" = "404"
customer_id=""

receipt=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -H 'Content-Type: application/json' \
  --data '{"receiptName":"File Smoke Receipt","totalAmount":1,"receiptAmount":1}' \
  "$API_URL/finance/receipts")
receipt_id=$(jq -r '.id // empty' <<<"$receipt")
test -n "$receipt_id"
receipt_file=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;type=text/plain" \
  "$API_URL/finance/receipts/$receipt_id/file")
receipt_file_url=$(jq -r '.attachmentUrl // empty' <<<"$receipt_file")
test -n "$receipt_file_url"
curl -fsS -H "Cookie: smarttour.auth.token=$token" "${API_URL%/api}$receipt_file_url" > "$download"
cmp -s "$SOURCE_FILE" "$download"
curl -fsS -X DELETE -H "Cookie: smarttour.auth.token=$token" "$API_URL/finance/receipts/$receipt_id/file" >/dev/null
deleted_download=$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: smarttour.auth.token=$token" "${API_URL%/api}$receipt_file_url")
test "$deleted_download" = "404"
curl -fsS -H "Cookie: smarttour.auth.token=$token" "$API_URL/finance/receipts/$receipt_id" | jq -e '.attachmentUrl == null' >/dev/null

payment=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -H 'Content-Type: application/json' \
  --data '{"voucherName":"File Smoke Payment","totalAmount":1,"paymentAmount":1}' \
  "$API_URL/finance/payments")
payment_id=$(jq -r '.id // empty' <<<"$payment")
test -n "$payment_id"
payment_file=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;type=text/plain" \
  "$API_URL/finance/payments/$payment_id/file")
payment_file_url=$(jq -r '.attachmentUrl // empty' <<<"$payment_file")
test -n "$payment_file_url"
curl -fsS -H "Cookie: smarttour.auth.token=$token" "${API_URL%/api}$payment_file_url" > "$download"
cmp -s "$SOURCE_FILE" "$download"
curl -fsS -X DELETE -H "Cookie: smarttour.auth.token=$token" "$API_URL/finance/payments/$payment_id/file" >/dev/null
deleted_download=$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: smarttour.auth.token=$token" "${API_URL%/api}$payment_file_url")
test "$deleted_download" = "404"
curl -fsS -H "Cookie: smarttour.auth.token=$token" "$API_URL/finance/payments/$payment_id" | jq -e '.attachmentUrl == null' >/dev/null

invoice=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -H 'Content-Type: application/json' \
  --data '{"customerName":"File Smoke Invoice","items":[{"itemName":"File Smoke Service","quantity":1,"unitPrice":1,"taxRate":10}]}' \
  "$API_URL/finance/invoices")
invoice_id=$(jq -r '.id // empty' <<<"$invoice")
test -n "$invoice_id"
invoice_file=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$SOURCE_FILE;type=text/plain" \
  "$API_URL/finance/invoices/$invoice_id/files")
invoice_file_id=$(jq -r '.id // empty' <<<"$invoice_file")
invoice_file_url=$(jq -r '.fileUrl // empty' <<<"$invoice_file")
test -n "$invoice_file_id"
test -n "$invoice_file_url"
curl -fsS -H "Cookie: smarttour.auth.token=$token" "$API_URL/finance/invoices/$invoice_id" | jq -e --arg id "$invoice_file_id" '.files[] | select(.id == $id)' >/dev/null
curl -fsS -H "Cookie: smarttour.auth.token=$token" "${API_URL%/api}$invoice_file_url" > "$download"
cmp -s "$SOURCE_FILE" "$download"
curl -fsS -X DELETE -H "Cookie: smarttour.auth.token=$token" "$API_URL/finance/invoices/$invoice_id/files/$invoice_file_id" >/dev/null
deleted_download=$(curl -sS -o /dev/null -w '%{http_code}' -H "Cookie: smarttour.auth.token=$token" "${API_URL%/api}$invoice_file_url")
test "$deleted_download" = "404"
curl -fsS -H "Cookie: smarttour.auth.token=$token" "$API_URL/finance/invoices/$invoice_id" | jq -e --arg id "$invoice_file_id" 'all(.files[]; .id != $id)' >/dev/null
invoice_file_id=""

printf 'receiptName,receiptType,paymentMethod,payerName,totalAmount,paidBefore,receiptAmount\nFile Smoke Imported Receipt,TOUR_PAYMENT,BANK_TRANSFER,CSV Smoke,3,1,2\n' > "$receipt_import_csv"
receipt_import=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$receipt_import_csv;type=text/csv" \
  "$API_URL/finance/receipts/import")
jq -e '.type == "receipts" and .imported == 1' <<<"$receipt_import" >/dev/null
receipt_import_id=$(jq -r '.rows[0].id // empty' <<<"$receipt_import")
test -n "$receipt_import_id"

printf 'voucherName,voucherType,paymentMethod,receiverName,totalAmount,paymentAmount\nFile Smoke Imported Payment,SUPPLIER_PAYMENT,BANK_TRANSFER,CSV Smoke,2,2\n' > "$payment_import_csv"
payment_import=$(curl -fsS -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$payment_import_csv;type=text/csv" \
  "$API_URL/finance/payments/import")
jq -e '.type == "payments" and .imported == 1' <<<"$payment_import" >/dev/null
payment_import_id=$(jq -r '.rows[0].id // empty' <<<"$payment_import")
test -n "$payment_import_id"

printf 'receiptName,receiptAmount\nInvalid CSV Receipt,0\n' > "$receipt_import_csv"
invalid_import=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: smarttour.auth.token=$token" \
  -F "file=@$receipt_import_csv;type=text/csv" \
  "$API_URL/finance/receipts/import")
test "$invalid_import" = "400"

echo "SMOKE_FILES_OK"
