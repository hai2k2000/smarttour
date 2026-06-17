#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tourkit_guides_import_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOURKIT_GUIDES_IMPORT missing POSTGRES_PASSWORD"
  exit 1
fi

TMP_JSON="$(mktemp /tmp/tourkit-guides-import.XXXXXX.json)"
cleanup() {
  rm -f "$TMP_JSON"
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat > "$TMP_JSON" <<'JSON'
{
  "sourceFile": "HDv.xls",
  "sheet": "NCC",
  "records": [
    {
      "STT": 14,
      "Mã NCC": "HDV_14",
      "Tên NCC": "Đào Thanh Tùng",
      "Số điện thoại": "000",
      "Email": "",
      "ClassHotel": "",
      "Tên dự án": "",
      "Số lượng": 19,
      "Đã bán": 1,
      "Còn lại": 18,
      "Tổng mua": 6000000,
      "Đã trả": 5400000,
      "Còn nợ": 600000,
      "Tình trạng": "Hoạt động"
    },
    {
      "STT": 13,
      "Mã NCC": "HDV_13",
      "Tên NCC": "Đặng Thị Tâm",
      "Số điện thoại": "000",
      "Email": "",
      "ClassHotel": "",
      "Tên dự án": "",
      "Số lượng": 4,
      "Đã bán": 0,
      "Còn lại": 4,
      "Tổng mua": 1200000,
      "Đã trả": 0,
      "Còn nợ": 1200000,
      "Tình trạng": "Tạm dừng"
    },
    {
      "STT": 12,
      "Mã NCC": "HDV_12",
      "Tên NCC": "Trần Minh Hiếu",
      "Số điện thoại": "096 222 0504",
      "Email": "hieu@example.test",
      "ClassHotel": "",
      "Tên dự án": "HDV miền Bắc",
      "Số lượng": 5,
      "Đã bán": 2,
      "Còn lại": 3,
      "Tổng mua": 2500000,
      "Đã trả": 1000000,
      "Còn nợ": 1500000,
      "Tình trạng": "Hoạt động"
    },
    {
      "STT": 11,
      "Mã NCC": "HDV_DUP_PHONE",
      "Tên NCC": "Trần Minh Hiếu 2",
      "Số điện thoại": "0962 220 504",
      "Email": "",
      "ClassHotel": "",
      "Tên dự án": "",
      "Số lượng": 1,
      "Đã bán": 0,
      "Còn lại": 1,
      "Tổng mua": 100000,
      "Đã trả": 0,
      "Còn nợ": 100000,
      "Tình trạng": "Hoạt động"
    }
  ]
}
JSON

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -v "$TMP_JSON:/tmp/tourkit-guides.json:ro" \
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
    await prisma.guideProfile.create({
      data: {
        guideCode: 'KEEP_EXISTING_GUIDE',
        fullName: 'Hồ sơ hướng dẫn viên cần giữ',
        phone: '0909999999',
        status: 'ACTIVE',
        guideType: 'Local',
        languages: ['VI'],
        markets: ['Nội địa'],
        skills: ['Existing'],
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  execFileSync(process.execPath, ['/workspace/scripts/import-tourkit-guides.js', '--file=/tmp/tourkit-guides.json', '--dry-run'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: '/app/node_modules' },
  });

  const dryRunCheck = new PrismaClient();
  try {
    const dryRunCount = await dryRunCheck.guideProfile.count();
    assert(dryRunCount === 1, `dry-run must not mutate GuideProfile, got ${dryRunCount}`);
  } finally {
    await dryRunCheck.$disconnect();
  }

  for (let i = 0; i < 2; i += 1) {
    execFileSync(process.execPath, ['/workspace/scripts/import-tourkit-guides.js', '--file=/tmp/tourkit-guides.json'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: '/app/node_modules' },
    });
  }

  const check = new PrismaClient();
  try {
    const guides = await check.guideProfile.findMany({ include: { costServices: true }, orderBy: { guideCode: 'asc' } });
    assert(guides.length === 5, `expected kept guide + 4 imported guides after repeated import, got ${guides.length}`);
    assert(guides.some((guide) => guide.guideCode === 'KEEP_EXISTING_GUIDE'), 'import must preserve guides outside the incoming file');

    const h14 = guides.find((guide) => guide.guideCode === 'HDV_14');
    const h13 = guides.find((guide) => guide.guideCode === 'HDV_13');
    const h12 = guides.find((guide) => guide.guideCode === 'HDV_12');
    const duplicatedPhone = guides.find((guide) => guide.guideCode === 'HDV_DUP_PHONE');
    assert(h14 && h13 && h12 && duplicatedPhone, 'all incoming HDV rows should be imported');

    assert(h14.phone !== '000' && h13.phone !== '000', 'invalid TourKit phone 000 should be replaced with valid placeholders');
    assert(h14.phone !== h13.phone, 'placeholder phones should be unique per guide');
    assert(/^[0-9+().\-\s]{6,32}$/.test(h14.phone), `placeholder phone should satisfy guide validation, got ${h14.phone}`);
    assert(h12.phone === '0962220504', `real phone should be normalized, got ${h12.phone}`);
    assert(duplicatedPhone.phone !== '0962220504', 'later duplicate real phones should use a placeholder');
    assert(duplicatedPhone.comment.includes('Số điện thoại gốc TourKit: 0962 220 504'), 'later duplicate phone comment should preserve original real phone');
    assert(h13.status === 'INACTIVE', `Tạm dừng should map to INACTIVE, got ${h13.status}`);
    assert(h14.status === 'ACTIVE', `Hoạt động should map to ACTIVE, got ${h14.status}`);
    assert(h14.comment.includes('Số điện thoại gốc TourKit: 000'), 'comment should preserve original invalid phone for audit');
    assert(h12.comment.includes('Tên dự án TourKit: HDV miền Bắc'), 'comment should preserve project/class metadata');
    assert(h14.costServices.length === 1, 'imported guide should have one cost service row');
    assert(h14.costServices[0].serviceName === 'Chi phí hướng dẫn viên TourKit', 'cost service should use a stable service name');
    assert(Number(h14.costServices[0].netPrice) === 6000000, 'cost service net price should come from Tổng mua');
    assert(Number(h14.costServices[0].sellingPrice) === 6000000, 'cost service selling price should come from Tổng mua for display consistency');
    assert(h14.costServices[0].note.includes('Đã trả TourKit: 5.400.000 VND'), 'cost service note should keep paid amount');
  } finally {
    await check.$disconnect();
  }

  console.log('TEST_TOURKIT_GUIDES_IMPORT_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
