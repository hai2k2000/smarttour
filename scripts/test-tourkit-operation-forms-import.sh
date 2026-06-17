#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tourkit_operation_forms_import_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOURKIT_OPERATION_FORMS_IMPORT missing POSTGRES_PASSWORD"
  exit 1
fi

TMP_JSON="$(mktemp /tmp/tourkit-operation-forms.XXXXXX.json)"
cleanup() {
  rm -f "$TMP_JSON"
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat > "$TMP_JSON" <<'JSON'
{
  "sourceFile": "phieudieuhanh.xls",
  "sheet": "Sheet1",
  "records": [
    {
      "STT": 1,
      "Mã phiếu": "PDV_TEST_001",
      "Mã NCC": "NCC62",
      "Nhà cung cấp": "Đất Việt",
      "Tên dịch vụ": "Landtour miền Bắc",
      "Ngày sử dụng": "12/08/2026",
      "Tổng tiền chi": "1,000,000",
      "Đã thanh toán": "400,000",
      "Còn thiếu": "600,000",
      "Phiếu chi tương ứng": "400,000|PC_TEST_001__No.1",
      "Mã tour": "BKG-OP-001",
      "Tên tour": "Tour đã có booking",
      "Người tạo tour": "Điều hành A",
      "Ngày tạo tour": "01/06/2026",
      "Ngày đi": "12/08/2026",
      "Ngày về": "14/08/2026",
      "Trạng thái": "Đặt cọc"
    },
    {
      "STT": null,
      "Mã phiếu": null,
      "Mã NCC": null,
      "Nhà cung cấp": null,
      "Tên dịch vụ": "Phụ thu phòng đơn",
      "Ngày sử dụng": "13/08/2026",
      "Tổng tiền chi": null,
      "Đã thanh toán": null,
      "Còn thiếu": null,
      "Phiếu chi tương ứng": null,
      "Mã tour": null,
      "Tên tour": null,
      "Người tạo tour": null,
      "Ngày tạo tour": null,
      "Ngày đi": null,
      "Ngày về": null,
      "Trạng thái": null
    },
    {
      "STT": 2,
      "Mã phiếu": "PDV_TEST_002",
      "Mã NCC": "NCC62",
      "Nhà cung cấp": "Đất Việt",
      "Tên dịch vụ": "Vé tham quan",
      "Ngày sử dụng": "13/08/2026",
      "Tổng tiền chi": "2,000,000",
      "Đã thanh toán": "0",
      "Còn thiếu": "2,000,000",
      "Phiếu chi tương ứng": "",
      "Mã tour": "BKG-OP-001",
      "Tên tour": "Tour đã có booking",
      "Người tạo tour": "Điều hành A",
      "Ngày tạo tour": "01/06/2026",
      "Ngày đi": "12/08/2026",
      "Ngày về": "14/08/2026",
      "Trạng thái": "Chưa thanh toán"
    },
    {
      "STT": 3,
      "Mã phiếu": "PDV_TEST_003",
      "Mã NCC": "NCC62",
      "Nhà cung cấp": "Đất Việt",
      "Tên dịch vụ": "Khách sạn",
      "Ngày sử dụng": "",
      "Tổng tiền chi": "3,000,000",
      "Đã thanh toán": "3,000,000",
      "Còn thiếu": "0",
      "Phiếu chi tương ứng": "3,000,000|PC_TEST_003__No.1",
      "Mã tour": "ORDER-OP-002",
      "Tên tour": "Tour chỉ có đơn hàng",
      "Người tạo tour": "Điều hành B",
      "Ngày tạo tour": "02/06/2026",
      "Ngày đi": "15/08/2026",
      "Ngày về": "16/08/2026",
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
  -v "$TMP_JSON:/tmp/tourkit-operation-forms.json:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && NODE_PATH=/app/node_modules node" <<'NODE'
const { execFileSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function seed() {
  const prisma = new PrismaClient();
  try {
    const category = await prisma.supplierCategory.create({ data: { name: 'Landtour' } });
    const supplier = await prisma.supplier.create({ data: { categoryId: category.id, supplierCode: 'NCC62', name: 'Đất Việt', phone: '0900000000' } });
    const program = await prisma.tourProgram.create({ data: { code: 'TP-OP-001', name: 'Tour đã có booking', route: 'BKG-OP-001', durationDays: 3 } });
    const booking = await prisma.booking.create({
      data: {
        code: 'BKG-OP-001',
        tourProgramId: program.id,
        customerName: 'Khách điều hành',
        customerPhone: '0901000000',
        paxCount: 2,
        startDate: new Date('2026-08-12T12:00:00.000Z'),
        endDate: new Date('2026-08-14T12:00:00.000Z'),
        status: 'CONFIRMED',
      },
    });
    const form = await prisma.operationForm.create({ data: { bookingId: booking.id, status: 'PENDING', notes: 'Manual form should keep rows' } });
    await prisma.operationService.create({
      data: {
        operationFormId: form.id,
        supplierId: supplier.id,
        serviceType: 'OTHER',
        serviceName: 'Manual service',
        confirmationStatus: 'WAITING',
        expectedCost: 123,
        actualCost: 123,
        notes: 'manual row',
      },
    });
    await prisma.operationCost.create({
      data: {
        operationFormId: form.id,
        costName: 'Manual cost',
        expectedAmount: 123,
        actualAmount: 123,
        notes: 'manual row',
      },
    });
    await prisma.order.create({
      data: {
        type: 'GIT_COMBO',
        systemCode: 'ORDER-OP-002',
        tourCode: 'ORDER-OP-002',
        name: 'Tour chỉ có đơn hàng',
        customerName: 'Khách từ order',
        customerPhone: '0902000000',
        startDate: new Date('2026-08-15T12:00:00.000Z'),
        endDate: new Date('2026-08-16T12:00:00.000Z'),
        quantity: 4,
        status: 'UPCOMING',
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await seed();

  execFileSync(process.execPath, ['/workspace/scripts/import-tourkit-operation-forms.js', '--file=/tmp/tourkit-operation-forms.json', '--dry-run'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: '/app/node_modules' },
  });
  let prisma = new PrismaClient();
  try {
    assert(await prisma.operationVoucher.count() === 0, 'dry-run must not create operation vouchers');
    assert(await prisma.operationForm.count() === 1, 'dry-run must not create operation forms');
  } finally {
    await prisma.$disconnect();
  }

  for (let i = 0; i < 2; i += 1) {
    execFileSync(process.execPath, ['/workspace/scripts/import-tourkit-operation-forms.js', '--file=/tmp/tourkit-operation-forms.json'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: '/app/node_modules' },
    });
  }

  prisma = new PrismaClient();
  try {
    const forms = await prisma.operationForm.findMany({
      include: { booking: true, services: true, costs: true },
      orderBy: { createdAt: 'asc' },
    });
    assert(forms.length === 2, `expected existing booking form + order placeholder form, got ${forms.length}`);
    const existingForm = forms.find((form) => form.booking.code === 'BKG-OP-001');
    const placeholderForm = forms.find((form) => form.booking.code === 'ORDER-OP-002');
    assert(existingForm, 'existing booking should have operation form');
    assert(placeholderForm, 'order-only row should create placeholder booking and operation form');
    assert(existingForm.services.some((item) => item.serviceName === 'Manual service'), 'manual service row must be preserved');
    assert(existingForm.costs.some((item) => item.costName === 'Manual cost'), 'manual cost row must be preserved');
    assert(existingForm.services.filter((item) => item.notes?.includes('TOURKIT_OPERATION_IMPORT_2026_06_17')).length === 2, 'existing form should have two imported services without duplicates');
    assert(existingForm.costs.filter((item) => item.notes?.includes('TOURKIT_OPERATION_IMPORT_2026_06_17')).length === 2, 'existing form should have two imported costs without duplicates');
    assert(existingForm.services.some((item) => item.notes?.includes('Phụ thu phòng đơn')), 'continuation service line should be preserved in notes');
    assert(placeholderForm.booking.orderId, 'placeholder booking should link the matched order');
    assert(placeholderForm.status === 'DONE', `fully paid group should map to DONE, got ${placeholderForm.status}`);

    const vouchers = await prisma.operationVoucher.findMany({ include: { details: true, supplier: true, booking: true }, orderBy: { voucherCode: 'asc' } });
    assert(vouchers.length === 3, `expected three vouchers, got ${vouchers.length}`);
    const partial = vouchers.find((item) => item.voucherCode === 'PDV_TEST_001');
    const pending = vouchers.find((item) => item.voucherCode === 'PDV_TEST_002');
    const paid = vouchers.find((item) => item.voucherCode === 'PDV_TEST_003');
    assert(partial && pending && paid, 'all PDV vouchers should be imported');
    assert(partial.status === 'PARTIAL' && Number(partial.totalAmount) === 1000000 && Number(partial.paidAmount) === 400000 && Number(partial.remainAmount) === 600000, 'partial voucher should keep totals');
    assert(pending.status === 'PENDING' && Number(pending.paidAmount) === 0, 'unpaid voucher should map to PENDING');
    assert(paid.status === 'PAID' && Number(paid.remainAmount) === 0, 'paid voucher should map to PAID');
    assert(partial.details.length === 1 && Number(partial.details[0].amount) === 1000000, 'voucher detail should be recreated from total cost');
    assert(partial.supplier?.supplierCode === 'NCC62', 'voucher should link supplier by code');
    assert(partial.booking?.code === 'BKG-OP-001', 'voucher should link booking');
  } finally {
    await prisma.$disconnect();
  }

  console.log('TEST_TOURKIT_OPERATION_FORMS_IMPORT_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
