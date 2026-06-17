#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tourkit_bookings_preserve_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOURKIT_BOOKINGS_PRESERVE missing POSTGRES_PASSWORD"
  exit 1
fi

TMP_JSON="$(mktemp /tmp/tourkit-bookings-preserve.XXXXXX.json)"
cleanup() {
  rm -f "$TMP_JSON"
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat > "$TMP_JSON" <<'JSON'
{
  "sourceFile": "tourkit-booking-ks-preserve-test.xls",
  "records": [
    {
      "Ma yeu cau": "BKG-HOTEL-NEW-001",
      "Ma Code": "LEGACY-HOTEL-001",
      "Ten": "Booking khach san moi",
      "Ten KH": "Khach Hotel Moi",
      "SDT": "0902000001",
      "Email": "hotel-new@example.test",
      "Ngay tao don": "01/06/2026",
      "Ngay check in": "20/06/2026",
      "Ngay check Out": "22/06/2026",
      "Nhom/Thi truong": "Khac",
      "Note": "Deluxe room",
      "So luong": 2,
      "Tong thu": 4000000,
      "Thuc thu": 1000000,
      "Tong chi": 2500000,
      "Thuc chi": 500000,
      "Loi nhuan": 1500000,
      "Con no": 3000000,
      "Nguoi tao": "tourkit-test",
      "CTV": "",
      "Nhan vien Dieu hanh": "Ops Test"
    }
  ]
}
JSON

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -v "$TMP_JSON:/tmp/tourkit-bookings.json:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && NODE_PATH=/app/node_modules node" <<'NODE'
const { execFileSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const existingProgram = await prisma.tourProgram.create({
      data: { code: 'EXISTING-TP', name: 'Existing tour program', route: 'Existing route', durationDays: 2 },
    });
    const existingCustomer = await prisma.customer.create({
      data: { code: 'EXISTING-CUS', fullName: 'Khach cu can giu', phone: '0902999999' },
    });
    const existingOrder = await prisma.order.create({
      data: {
        type: 'HOTEL_BOOKING',
        systemCode: 'EXISTING-HOTEL-ORDER',
        name: 'Existing hotel order',
        customerId: existingCustomer.id,
        customerName: existingCustomer.fullName,
        customerPhone: existingCustomer.phone,
      },
    });
    await prisma.booking.create({
      data: {
        code: 'EXISTING-BOOKING-KEEP',
        tourProgramId: existingProgram.id,
        orderId: existingOrder.id,
        customerId: existingCustomer.id,
        customerName: existingCustomer.fullName,
        customerPhone: existingCustomer.phone,
        paxCount: 1,
        startDate: new Date('2026-06-10T12:00:00.000Z'),
        endDate: new Date('2026-06-11T12:00:00.000Z'),
        status: 'CONFIRMED',
        totalSellPrice: 1000000,
      },
    });

    await prisma.customer.create({
      data: { code: 'NEW-CUS', fullName: 'Khach Hotel Moi', phone: '0902000001' },
    });
    await prisma.order.create({
      data: {
        type: 'HOTEL_BOOKING',
        systemCode: 'BKG-HOTEL-NEW-001',
        tourCode: 'LEGACY-HOTEL-001',
        name: 'Booking khach san moi order',
        customerName: 'Khach Hotel Moi',
        customerPhone: '0902000001',
        status: 'UPCOMING',
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  execFileSync(process.execPath, ['/workspace/scripts/import-tourkit-bookings.js', '--file=/tmp/tourkit-bookings.json', '--preserve-existing'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: '/app/node_modules' },
  });

  const check = new PrismaClient();
  try {
    const kept = await check.booking.findUnique({ where: { code: 'EXISTING-BOOKING-KEEP' } });
    assert(kept, 'preserve-existing import must keep bookings outside the incoming file');

    const imported = await check.booking.findUnique({
      where: { code: 'BKG-HOTEL-NEW-001' },
      include: { order: true, tourProgram: true },
    });
    assert(imported, 'incoming hotel booking should be imported');
    assert(imported.order?.systemCode === 'BKG-HOTEL-NEW-001', 'incoming hotel booking should link existing hotel order');
    assert(Number(imported.totalSellPrice) === 4000000, 'incoming hotel booking should keep revenue');
    assert(imported.paxCount === 2, 'incoming hotel booking should keep quantity as pax count');

    const bookingCount = await check.booking.count();
    assert(bookingCount === 2, `expected existing + imported booking, got ${bookingCount}`);
  } finally {
    await check.$disconnect();
  }

  console.log('TEST_TOURKIT_BOOKINGS_PRESERVE_EXISTING_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
