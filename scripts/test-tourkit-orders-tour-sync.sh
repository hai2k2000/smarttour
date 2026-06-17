#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tourkit_orders_tour_sync_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOURKIT_ORDERS_TOUR_SYNC missing POSTGRES_PASSWORD"
  exit 1
fi

TMP_JSON="$(mktemp /tmp/tourkit-orders-tour-sync.XXXXXX.json)"
cleanup() {
  rm -f "$TMP_JSON"
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat > "$TMP_JSON" <<'JSON'
{
  "sourceFile": "tourkit-orders-tour-sync-test.xls",
  "rows": [
    {
      "Ma he thong": "TK-ORDER-TOUR-001",
      "Ma Tour": "TKTOUR001",
      "Ngay dat Tour (Ngay tao don)": "01/06/2026",
      "Lich trinh": "Tour GIT kiem tra import",
      "Ten KH": "Khach GIT",
      "Loai hinh": "GIT",
      "Loai Tour": "GIT",
      "Nhom/Thi truong": "Noi dia",
      "SDT": "0901000001",
      "Email": "git@example.test",
      "Ngay check in": "15/06/2026",
      "Ngay check Out": "18/06/2026",
      "Nguoi lon": 2,
      "Tre em": 1,
      "Tre nho": 0,
      "Tong thu": 3000000,
      "Thuc thu": 1500000,
      "Tong chi": 2000000,
      "Thuc chi": 500000,
      "Con no": 1500000,
      "Loi nhuan": 1000000,
      "Nguoi tao": "tourkit-test",
      "Chi nhanh": "BR-TEST",
      "Phong ban": "DEP-TEST",
      "Nhan vien Dieu hanh": "Ops Test",
      "Trang thai": "Dang chay"
    },
    {
      "Ma he thong": "TK-ORDER-TOUR-002",
      "Ma Tour": "TKTOUR002",
      "Ngay dat Tour (Ngay tao don)": "02/06/2026",
      "Lich trinh": "Landtour kiem tra import",
      "Ten KH": "Khach Landtour",
      "Loai hinh": "Landtour",
      "Loai Tour": "Landtour",
      "Nhom/Thi truong": "Inbound",
      "SDT": "0901000002",
      "Email": "landtour@example.test",
      "Ngay check in": "20/06/2026",
      "Ngay check Out": "21/06/2026",
      "Nguoi lon": 1,
      "Tre em": 0,
      "Tre nho": 0,
      "Tong thu": 1000000,
      "Thuc thu": 1000000,
      "Tong chi": 700000,
      "Thuc chi": 700000,
      "Con no": 0,
      "Loi nhuan": 300000,
      "Nguoi tao": "tourkit-test",
      "Chi nhanh": "BR-TEST",
      "Phong ban": "DEP-TEST",
      "Nhan vien Dieu hanh": "Ops Test",
      "Trang thai": "Hoan thanh"
    },
    {
      "Ma he thong": "TK-ORDER-NO-PHONE",
      "Ma Tour": "TKNOPHONE",
      "Ngay dat Tour (Ngay tao don)": "03/06/2026",
      "Lich trinh": "Tour co khach nhung thieu so dien thoai",
      "Ten KH": "Khach khong co so",
      "Loai hinh": "GIT",
      "Loai Tour": "GIT",
      "Nhom/Thi truong": "Noi dia",
      "SDT": "",
      "Email": "",
      "Ngay check in": "22/06/2026",
      "Ngay check Out": "23/06/2026",
      "Nguoi lon": 3,
      "Tre em": 0,
      "Tre nho": 0,
      "Tong thu": 4500000,
      "Thuc thu": 0,
      "Tong chi": 3000000,
      "Thuc chi": 0,
      "Con no": 4500000,
      "Loi nhuan": 1500000,
      "Nguoi tao": "tourkit-test",
      "Chi nhanh": "BR-TEST",
      "Phong ban": "DEP-TEST",
      "Nhan vien Dieu hanh": "Ops Test",
      "Trang thai": "Sap chay"
    },
    {
      "Ma he thong": "TK-ORDER-NO-CUSTOMER",
      "Ma Tour": "TKNOCUSTOMER",
      "Ngay dat Tour (Ngay tao don)": "04/06/2026",
      "Lich trinh": "Tour thieu ten khach va so dien thoai",
      "Ten KH": "",
      "Loai hinh": "FIT",
      "Loai Tour": "FIT",
      "Nhom/Thi truong": "Noi dia",
      "SDT": "",
      "Email": "",
      "Ngay check in": "24/06/2026",
      "Ngay check Out": "25/06/2026",
      "Nguoi lon": 2,
      "Tre em": 0,
      "Tre nho": 0,
      "Tong thu": 2500000,
      "Thuc thu": 500000,
      "Tong chi": 1500000,
      "Thuc chi": 0,
      "Con no": 2000000,
      "Loi nhuan": 1000000,
      "Nguoi tao": "tourkit-test",
      "Chi nhanh": "BR-TEST",
      "Phong ban": "DEP-TEST",
      "Nhan vien Dieu hanh": "Ops Test",
      "Trang thai": "Dang chay"
    }
  ]
}
JSON

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -v "$TMP_JSON:/tmp/tourkit-orders.json:ro" \
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
    await prisma.order.createMany({
      data: [
        {
          systemCode: 'TK-ORDER-TOUR-001',
          type: 'GIT_COMBO',
          name: 'Order GIT without tour',
          customerName: 'Khach GIT',
          customerPhone: '0901000001',
          status: 'UPCOMING',
        },
        {
          systemCode: 'TK-ORDER-TOUR-002',
          type: 'LANDTOUR',
          name: 'Order Landtour without tour',
          customerName: 'Khach Landtour',
          customerPhone: '0901000002',
          status: 'UPCOMING',
        },
        {
          systemCode: 'TK-ORDER-NO-PHONE',
          type: 'GIT_COMBO',
          name: 'Order with customer name but no phone',
          customerName: 'Khach khong co so',
          customerPhone: null,
          status: 'UPCOMING',
        },
        {
          systemCode: 'TK-ORDER-NO-CUSTOMER',
          type: 'GIT_COMBO',
          name: 'Order without customer name or phone',
          customerName: 'Khach seed placeholder',
          customerPhone: null,
          status: 'UPCOMING',
        },
        {
          systemCode: 'TK-ORDER-OUTSIDE',
          type: 'SINGLE_SERVICE',
          name: 'Order outside file should stay active',
          customerName: 'Khach ngoai file',
          customerPhone: '0901000099',
          status: 'UPCOMING',
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }

  execFileSync(process.execPath, ['/workspace/scripts/import-tourkit-orders.js', '--file=/tmp/tourkit-orders.json', '--sync-tours-only'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: '/app/node_modules' },
  });

  const check = new PrismaClient();
  try {
    const expectedCodes = ['TK-ORDER-TOUR-001', 'TK-ORDER-TOUR-002', 'TK-ORDER-NO-PHONE', 'TK-ORDER-NO-CUSTOMER'];
    const sourceOrders = await check.order.findMany({
      where: { systemCode: { in: expectedCodes } },
      include: { tours: { include: { customers: true, revenues: true, costs: true, services: true } } },
    });
    assert(sourceOrders.length === expectedCodes.length, 'source orders should remain present');
    const byCode = new Map(sourceOrders.map((order) => [order.systemCode, order]));
    for (const code of expectedCodes) {
      const order = byCode.get(code);
      assert(order, `${code} should exist`);
      assert(order.tours.length === 1, `${code} should have exactly one linked tour`);
      const tour = order.tours[0];
      assert(tour.systemCode === order.systemCode, `${code} tour should keep source systemCode`);
      assert(tour.orderId === order.id, `${code} tour should link back to order`);
      assert(tour.customers.length === 1, `${code} should have imported tour customer`);
      assert(tour.revenues.length === 1, `${code} should have imported tour revenue`);
      assert(tour.costs.length === 1, `${code} should have imported tour cost`);
      assert(tour.services.length === 1, `${code} should have imported tour service`);
    }
    assert(byCode.get('TK-ORDER-TOUR-001').tours[0].type === 'GIT', 'GIT order should map to TourType.GIT');
    assert(byCode.get('TK-ORDER-TOUR-002').tours[0].type === 'LANDTOUR', 'Landtour order should map to TourType.LANDTOUR');

    const noPhoneCustomer = byCode.get('TK-ORDER-NO-PHONE').tours[0].customers[0];
    assert(noPhoneCustomer.name === 'Khach khong co so', 'row without phone should keep customer name');
    assert(noPhoneCustomer.phone === null, 'row without phone should keep tour customer phone empty');
    assert(noPhoneCustomer.crmCustomerId === null, 'row without phone should not link a CRM customer');

    const noCustomer = byCode.get('TK-ORDER-NO-CUSTOMER').tours[0].customers[0];
    assert(noCustomer.name.includes('TK-ORDER-NO-CUSTOMER'), 'row without customer name should get traceable fallback name');
    assert(noCustomer.phone === null, 'row without customer name and phone should keep phone empty');
    assert(noCustomer.crmCustomerId === null, 'row without customer name and phone should not create CRM customer link');

    const customerCount = await check.customer.count();
    assert(customerCount === 2, 'only rows with phone should create CRM customers');

    const outsideOrder = await check.order.findUnique({ where: { systemCode: 'TK-ORDER-OUTSIDE' } });
    assert(outsideOrder && outsideOrder.deletedAt === null, 'sync-tours-only should not soft-delete orders outside the file');
  } finally {
    await check.$disconnect();
  }

  console.log('TEST_TOURKIT_ORDERS_TOUR_SYNC_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
