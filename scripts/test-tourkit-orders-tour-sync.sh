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
      "Mã hệ thống": "TK-ORDER-TOUR-001",
      "Mã Tour": "TKTOUR001",
      "Ngày đặt Tour (Ngày tạo đơn)": "01/06/2026",
      "Lịch trình": "Tour GIT kiểm tra import",
      "Tên KH": "Khách GIT",
      "Loại hình": "GIT",
      "Loại Tour": "GIT",
      "Nhóm/Thị trường": "Nội địa",
      "SĐT": "0901000001",
      "Email": "git@example.test",
      "Ngày check in": "15/06/2026",
      "Ngày check Out": "18/06/2026",
      "Người lớn": 2,
      "Trẻ em": 1,
      "Trẻ nhỏ": 0,
      "Tổng thu": 3000000,
      "Thực thu": 1500000,
      "Tổng chi": 2000000,
      "Thực chi": 500000,
      "Còn nợ": 1500000,
      "Lợi nhuận": 1000000,
      "Người tạo": "tourkit-test",
      "Chi nhánh": "BR-TEST",
      "Phòng ban": "DEP-TEST",
      "Nhân viên Điều hành": "Ops Test",
      "Trạng thái": "Đang chạy"
    },
    {
      "Mã hệ thống": "TK-ORDER-TOUR-002",
      "Mã Tour": "TKTOUR002",
      "Ngày đặt Tour (Ngày tạo đơn)": "02/06/2026",
      "Lịch trình": "Landtour kiểm tra import",
      "Tên KH": "Khách Landtour",
      "Loại hình": "Landtour",
      "Loại Tour": "Landtour",
      "Nhóm/Thị trường": "Inbound",
      "SĐT": "0901000002",
      "Email": "landtour@example.test",
      "Ngày check in": "20/06/2026",
      "Ngày check Out": "21/06/2026",
      "Người lớn": 1,
      "Trẻ em": 0,
      "Trẻ nhỏ": 0,
      "Tổng thu": 1000000,
      "Thực thu": 1000000,
      "Tổng chi": 700000,
      "Thực chi": 700000,
      "Còn nợ": 0,
      "Lợi nhuận": 300000,
      "Người tạo": "tourkit-test",
      "Chi nhánh": "BR-TEST",
      "Phòng ban": "DEP-TEST",
      "Nhân viên Điều hành": "Ops Test",
      "Trạng thái": "Hoàn thành"
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
          name: 'Order GIT chưa có tour',
          customerName: 'Khách GIT',
          customerPhone: '0901000001',
          status: 'UPCOMING',
        },
        {
          systemCode: 'TK-ORDER-TOUR-002',
          type: 'LANDTOUR',
          name: 'Order Landtour chưa có tour',
          customerName: 'Khách Landtour',
          customerPhone: '0901000002',
          status: 'UPCOMING',
        },
        {
          systemCode: 'TK-ORDER-OUTSIDE',
          type: 'SINGLE_SERVICE',
          name: 'Order ngoài file phải được giữ nguyên',
          customerName: 'Khách ngoài file',
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
    const sourceOrders = await check.order.findMany({
      where: { systemCode: { in: ['TK-ORDER-TOUR-001', 'TK-ORDER-TOUR-002'] } },
      include: { tours: { include: { customers: true, revenues: true, costs: true, services: true } } },
      orderBy: { systemCode: 'asc' },
    });
    assert(sourceOrders.length === 2, 'source orders should remain present');
    for (const order of sourceOrders) {
      assert(order.tours.length === 1, `${order.systemCode} should have exactly one linked tour`);
      const tour = order.tours[0];
      assert(tour.systemCode === order.systemCode, `${order.systemCode} tour should keep source systemCode`);
      assert(tour.orderId === order.id, `${order.systemCode} tour should link back to order`);
      assert(tour.customers.length === 1, `${order.systemCode} should have imported tour customer`);
      assert(tour.revenues.length === 1, `${order.systemCode} should have imported tour revenue`);
      assert(tour.costs.length === 1, `${order.systemCode} should have imported tour cost`);
      assert(tour.services.length === 1, `${order.systemCode} should have imported tour service`);
    }
    assert(sourceOrders[0].tours[0].type === 'GIT', 'GIT order should map to TourType.GIT');
    assert(sourceOrders[1].tours[0].type === 'LANDTOUR', 'Landtour order should map to TourType.LANDTOUR');
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
