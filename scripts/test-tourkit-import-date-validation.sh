#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tourkit_import_date_validation_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOURKIT_IMPORT_DATE_VALIDATION missing POSTGRES_PASSWORD"
  exit 1
fi

TMP_DIR="$(mktemp -d /tmp/tourkit-import-date-validation.XXXXXX)"
cleanup() {
  rm -rf "$TMP_DIR"
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -v "$TMP_DIR:/tmp/tourkit-import-date-validation" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && NODE_PATH=/app/node_modules node" <<'NODE'
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const tmpDir = '/tmp/tourkit-import-date-validation';

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function writeJson(name, payload) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
  return filePath;
}

function runImport(args) {
  return execFileSync(process.execPath, args, {
    cwd: '/app',
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: '/app/node_modules' },
  });
}

function expectInvalidDate(args, label) {
  try {
    runImport(args);
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');
    assert(/Invalid TourKit .* date/.test(output) && output.includes('31/02/2026'), `${label} failed for unexpected reason:\n${output}`);
    return;
  }
  throw new Error(`${label} should reject impossible calendar dates`);
}

async function seed() {
  const prisma = new PrismaClient();
  try {
    await prisma.role.upsert({
      where: { code: 'sales' },
      update: { name: 'Sales', status: 'ACTIVE' },
      create: { code: 'sales', name: 'Sales', status: 'ACTIVE' },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await seed();

  const bookingsFile = writeJson('bookings-bad-date.json', {
    sourceFile: 'tourkit-bookings-bad-date-test.xls',
    records: [{
      'Ma yeu cau': 'BKG-BAD-DATE',
      'Ma Code': 'LEGACY-BAD-DATE',
      Ten: 'Booking bad date',
      'Ten KH': 'Customer Bad Date',
      SDT: '0903000001',
      Email: 'booking-bad-date@example.test',
      'Ngay tao don': '01/06/2026',
      'Ngay check in': '31/02/2026',
      'Ngay check Out': '05/03/2026',
      'So luong': 1,
      'Tong thu': 1000000,
      'Thuc thu': 0,
      'Tong chi': 500000,
      'Thuc chi': 0,
    }],
  });
  expectInvalidDate(['/workspace/scripts/import-tourkit-bookings.js', `--file=${bookingsFile}`, '--dry-run'], 'TourKit bookings import');

  const ordersFile = writeJson('orders-bad-date.json', {
    sourceFile: 'tourkit-orders-bad-date-test.xls',
    rows: [{
      'Ma he thong': 'ORDER-BAD-DATE',
      'Ma Tour': 'TOUR-BAD-DATE',
      'Ngay dat Tour (Ngay tao don)': '01/06/2026',
      'Lich trinh': 'Order bad date',
      'Ten KH': 'Customer Bad Date',
      'Loai Tour': 'GIT',
      SDT: '0903000002',
      'Ngay check in': '31/02/2026',
      'Ngay check Out': '05/03/2026',
      'Nguoi lon': 1,
      'Tong thu': 1000000,
      'Thuc thu': 0,
      'Tong chi': 500000,
      'Thuc chi': 0,
      'Trang thai': 'Sap chay',
    }],
  });
  expectInvalidDate(['/workspace/scripts/import-tourkit-orders.js', `--file=${ordersFile}`, '--dry-run'], 'TourKit orders import');

  const customersFile = writeJson('customers-bad-date.json', {
    sourceFile: 'tourkit-customers-bad-date-test.xls',
    rows: [{
      'Ho va ten': 'Customer Bad Date',
      'Dien thoai': '0903000003',
      Email: 'customer-bad-date@example.test',
      'Ngay tao': '01/06/2026',
      'Ngay sinh': '31/02/2026',
      'Loai khach hang': 'Retail',
    }],
  });
  expectInvalidDate(['/workspace/scripts/import-tourkit-customers.js', `--file=${customersFile}`, '--dry-run'], 'TourKit customers import');

  const usersFile = writeJson('users-bad-date.json', {
    sourceFile: 'tourkit-users-bad-date-test.xls',
    records: [{
      'Ten Tai khoan': 'baddateuser',
      'Ho ten': 'Bad Date User',
      Email: 'baddateuser@example.test',
      'Phong ban': 'Marketing',
      'Ngay tao': '01/06/2026',
      'Ngay sinh': '31/02/2026',
    }],
  });
  expectInvalidDate(['/workspace/scripts/import-tourkit-users.js', `--file=${usersFile}`, '--dry-run'], 'TourKit users import');

  const receiptsFile = writeJson('finance-service-receipts-empty.json', { sheets: [{ rows: [] }] });
  const paymentsFile = writeJson('finance-service-payments-empty.json', { sheets: [{ rows: [] }] });
  const servicesFile = writeJson('finance-service-services-bad-date.json', {
    sheets: [{
      rows: [{
        ['M\u00e3 phi\u1ebfu']: 'PDV-BAD-DATE',
        ['M\u00e3 tour']: 'TOUR-BAD-DATE',
        ['M\u00e3 NCC']: 'NCC-BAD-DATE',
        ['Nh\u00e0 cung c\u1ea5p']: 'Supplier Bad Date',
        ['T\u00ean d\u1ecbch v\u1ee5']: 'Service bad date',
        ['Ng\u00e0y s\u1eed d\u1ee5ng']: '31/02/2026',
        ['Ng\u00e0y \u0111i']: '28/02/2026',
        ['Ng\u00e0y v\u1ec1']: '05/03/2026',
        ['T\u1ed5ng ti\u1ec1n chi']: '1000000',
        ['\u0110\u00e3 thanh to\u00e1n']: '0',
        ['Tr\u1ea1ng th\u00e1i']: 'Chua thanh toan',
      }],
    }],
  });
  expectInvalidDate([
    '/workspace/scripts/import-tourkit-finance-services.js',
    `--receipts=${receiptsFile}`,
    `--payments=${paymentsFile}`,
    `--services=${servicesFile}`,
    '--dry-run',
  ], 'TourKit finance services import');

  console.log('TEST_TOURKIT_IMPORT_DATE_VALIDATION_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
