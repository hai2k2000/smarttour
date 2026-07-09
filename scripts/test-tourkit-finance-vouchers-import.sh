#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tourkit_finance_vouchers_import_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOURKIT_FINANCE_VOUCHERS_IMPORT missing POSTGRES_PASSWORD"
  exit 1
fi

TMP_RECEIPTS="$(mktemp /tmp/tourkit-receipts.XXXXXX.json)"
TMP_PAYMENTS="$(mktemp /tmp/tourkit-payments.XXXXXX.json)"
cleanup() {
  rm -f "$TMP_RECEIPTS" "$TMP_PAYMENTS"
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat > "$TMP_RECEIPTS" <<'JSON'
{
  "sourceFile": "phieuthu.xls",
  "sheet": "Sheet1",
  "records": [
    {
      "STT": 1,
      "Tên Phiếu thu": "Thu tiền khách test",
      "Mã Phiếu thu": "PT_TEST_001",
      "Mã tour": "ORDER-FIN-001",
      "Mã giữ chỗ": "BKG-FIN-001",
      "Ngày thanh toán": "17/06/2026",
      "Số tiền thu": "1,000,000",
      "Người đóng": "Khách test",
      "Số điện thoại": "090 123 4567",
      "Nhân viên phụ trách": "Kế toán A",
      "Lý do": "Thu tiền tour",
      "Trạng thái duyệt": "Đã duyệt",
      "Loại phiếu thu": "Thu khách lẻ",
      "Phương thức thanh toán": "Chuyển khoản Techcombank"
    },
    {
      "STT": 2,
      "Tên Phiếu thu": "Thu chờ duyệt",
      "Mã Phiếu thu": "PT_TEST_002",
      "Mã tour": "ORDER-FIN-001",
      "Mã giữ chỗ": "BKG-FIN-001",
      "Ngày thanh toán": "18/06/2026",
      "Số tiền thu": "500,000",
      "Người đóng": "Khách test",
      "Số điện thoại": "0901234567",
      "Nhân viên phụ trách": "Kế toán A",
      "Lý do": "Thu bổ sung",
      "Trạng thái duyệt": "Chờ duyệt",
      "Loại phiếu thu": "Thu đặt cọc",
      "Phương thức thanh toán": "Tiền mặt"
    }
  ]
}
JSON

cat > "$TMP_PAYMENTS" <<'JSON'
{
  "sourceFile": "phieu chi.xls",
  "sheet": "Sheet1",
  "records": [
    {
      "STT": 1,
      "Số chứng từ": "PC_TEST_001",
      "Tên phiếu chi": "Chi nhà cung cấp test",
      "Mã tour": "ORDER-FIN-001",
      "Mã giữ chỗ": "BKG-FIN-001",
      "Ngày chứng từ": "16/06/2026",
      "Ngày thanh toán": "17/06/2026",
      "Người nhận": "Nhà cung cấp test",
      "SĐT": "098 765 4321",
      "Số tiền": "700,000",
      "Lý do": "Thanh toán dịch vụ",
      "Người phụ trách": "Điều hành A",
      "Trạng thái duyệt": "Đã duyệt",
      "Tên TK": "CONG TY TEST",
      "Số tài khoản": "123456789",
      "Ngân hàng": "VCB",
      "Đối tác": "Đối tác test",
      "Nhà cung cấp": "Nhà cung cấp test",
      "Loại phiếu chi": "Chi nhà cung cấp",
      "Phương thức thanh toán": "Chuyển khoản"
    },
    {
      "STT": 2,
      "Số chứng từ": "PC_TEST_002",
      "Tên phiếu chi": "Chi chờ duyệt",
      "Mã tour": "ORDER-FIN-001",
      "Mã giữ chỗ": "BKG-FIN-001",
      "Ngày chứng từ": "18/06/2026",
      "Ngày thanh toán": "18/06/2026",
      "Người nhận": "Nhà cung cấp test",
      "SĐT": "0987654321",
      "Số tiền": "300,000",
      "Lý do": "Thanh toán còn lại",
      "Người phụ trách": "Điều hành A",
      "Trạng thái duyệt": "Chờ duyệt",
      "Tên TK": "",
      "Số tài khoản": "",
      "Ngân hàng": "",
      "Đối tác": "",
      "Nhà cung cấp": "Nhà cung cấp test",
      "Loại phiếu chi": "Chi nhà cung cấp",
      "Phương thức thanh toán": "Tiền mặt"
    }
  ]
}
JSON

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -v "$TMP_RECEIPTS:/tmp/tourkit-receipts.json:ro" \
  -v "$TMP_PAYMENTS:/tmp/tourkit-payments.json:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && NODE_PATH=/app/node_modules node" <<'NODE'
const { execFileSync } = require('child_process');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function amount(value) {
  return Number(value || 0);
}

async function seed() {
  const prisma = new PrismaClient();
  try {
    const category = await prisma.supplierCategory.create({ data: { name: 'Chi phí khác' } });
    const supplier = await prisma.supplier.create({
      data: {
        categoryId: category.id,
        supplierCode: 'SUP-FIN-001',
        name: 'Nhà cung cấp test',
        phone: '0987654321',
        status: 'ACTIVE',
      },
    });
    const customer = await prisma.customer.create({
      data: {
        code: 'CUS-FIN-001',
        fullName: 'Khách test',
        phone: '0901234567',
        branch: 'Chi Nhánh Tổng',
        department: 'Kế toán',
      },
    });
    const order = await prisma.order.create({
      data: {
        type: 'SINGLE_SERVICE',
        systemCode: 'ORDER-FIN-001',
        tourCode: 'ORDER-FIN-001',
        holdCode: 'BKG-FIN-001',
        name: 'Đơn hàng tài chính test',
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        totalRevenue: 1500000,
        remainingRevenue: 1500000,
        totalCost: 1000000,
        remainingCost: 1000000,
        branch: 'Chi Nhánh Tổng',
        department: 'Điều hành',
      },
    });
    await prisma.tour.create({
      data: {
        type: 'FIT',
        systemCode: 'TOUR-FIN-001',
        tourCode: 'ORDER-FIN-001',
        name: 'Tour tài chính test',
        orderId: order.id,
        branch: 'Chi Nhánh Tổng',
        department: 'Điều hành',
      },
    });
    assert(supplier.id && order.id, 'seed should create supplier and order');
  } finally {
    await prisma.$disconnect();
  }
}

function runImportFiles(receiptsPath, paymentsPath, args = [], stdio = 'inherit') {
  execFileSync(process.execPath, [
    '/workspace/scripts/import-tourkit-finance-vouchers.js',
    `--receipts=${receiptsPath}`,
    `--payments=${paymentsPath}`,
    ...args,
  ], {
    stdio,
    env: { ...process.env, NODE_PATH: '/app/node_modules' },
  });
}

function runImport(args = []) {
  runImportFiles('/tmp/tourkit-receipts.json', '/tmp/tourkit-payments.json', args);
}

function expectImportFailure(action, label) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(label);
}

async function main() {
  await seed();

  fs.writeFileSync('/tmp/tourkit-bad-receipts.json', JSON.stringify({
    records: [{
      ['T\u00ean Phi\u1ebfu thu']: 'Thu ngay loi',
      ['M\u00e3 Phi\u1ebfu thu']: 'PT_BAD_DATE',
      ['M\u00e3 tour']: 'ORDER-FIN-001',
      ['M\u00e3 gi\u1eef ch\u1ed7']: 'BKG-FIN-001',
      ['Ng\u00e0y thanh to\u00e1n']: '31/02/2026',
      ['S\u1ed1 ti\u1ec1n thu']: '1,000',
      ['Ng\u01b0\u1eddi \u0111\u00f3ng']: 'Khach test',
      ['S\u1ed1 \u0111i\u1ec7n tho\u1ea1i']: '0901234567',
      ['Tr\u1ea1ng th\u00e1i duy\u1ec7t']: 'Cho duyet',
    }],
  }), 'utf8');
  expectImportFailure(
    () => runImportFiles('/tmp/tourkit-bad-receipts.json', '/tmp/tourkit-payments.json', [], 'pipe'),
    'TourKit finance voucher import should reject impossible receipt payment dates',
  );

  runImport(['--dry-run']);
  let prisma = new PrismaClient();
  try {
    assert(await prisma.financeReceipt.count() === 0, 'dry-run must not create receipts');
    assert(await prisma.financePayment.count() === 0, 'dry-run must not create payments');
    assert(await prisma.financeCashflowEntry.count() === 0, 'dry-run must not create cashflow rows');
  } finally {
    await prisma.$disconnect();
  }

  for (let i = 0; i < 2; i += 1) {
    runImport();
  }

  prisma = new PrismaClient();
  try {
    const receipts = await prisma.financeReceipt.findMany({ include: { orders: true, cashflowEntries: true, customerLedger: true }, orderBy: { receiptCode: 'asc' } });
    const payments = await prisma.financePayment.findMany({ include: { cashflowEntries: true, supplierLedger: true, supplier: true, order: true, tour: true }, orderBy: { voucherCode: 'asc' } });
    assert(receipts.length === 2, `expected two imported receipts after rerun, got ${receipts.length}`);
    assert(payments.length === 2, `expected two imported payments after rerun, got ${payments.length}`);

    const approvedReceipt = receipts.find((row) => row.receiptCode === 'PT_TEST_001');
    const pendingReceipt = receipts.find((row) => row.receiptCode === 'PT_TEST_002');
    assert(approvedReceipt && pendingReceipt, 'both receipt rows should exist');
    assert(approvedReceipt.approvalStatus === 'APPROVED', `approved receipt status mismatch: ${approvedReceipt.approvalStatus}`);
    assert(pendingReceipt.approvalStatus === 'PENDING', `pending receipt status mismatch: ${pendingReceipt.approvalStatus}`);
    assert(approvedReceipt.receiptType === 'TOUR_PAYMENT', `khach le receipt should map to TOUR_PAYMENT, got ${approvedReceipt.receiptType}`);
    assert(pendingReceipt.receiptType === 'DEPOSIT', `dat coc receipt should map to DEPOSIT, got ${pendingReceipt.receiptType}`);
    assert(amount(approvedReceipt.receiptAmount) === 1000000, 'receipt amount should parse thousands separators');
    assert(approvedReceipt.paymentMethod === 'BANK_TRANSFER', `bank transfer receipt method mismatch: ${approvedReceipt.paymentMethod}`);
    assert(pendingReceipt.paymentMethod === 'CASH', `cash receipt method mismatch: ${pendingReceipt.paymentMethod}`);
    assert(approvedReceipt.orders.length === 1 && approvedReceipt.orders[0].orderCode === 'ORDER-FIN-001', 'receipt should link matched order by tour/hold code');
    assert(approvedReceipt.cashflowEntries.length === 1 && amount(approvedReceipt.cashflowEntries[0].amount) === 1000000, 'approved receipt should create one cashflow entry');
    assert(approvedReceipt.customerLedger.length === 1 && amount(approvedReceipt.customerLedger[0].creditAmount) === 1000000, 'approved receipt should create one customer ledger credit');
    assert(pendingReceipt.cashflowEntries.length === 0 && pendingReceipt.customerLedger.length === 0, 'pending receipt must not create cashflow or ledger');

    const approvedPayment = payments.find((row) => row.voucherCode === 'PC_TEST_001');
    const pendingPayment = payments.find((row) => row.voucherCode === 'PC_TEST_002');
    assert(approvedPayment && pendingPayment, 'both payment rows should exist');
    assert(approvedPayment.approvalStatus === 'APPROVED', `approved payment status mismatch: ${approvedPayment.approvalStatus}`);
    assert(pendingPayment.approvalStatus === 'PENDING', `pending payment status mismatch: ${pendingPayment.approvalStatus}`);
    assert(approvedPayment.voucherType === 'SUPPLIER_PAYMENT', `supplier payment type mismatch: ${approvedPayment.voucherType}`);
    assert(amount(approvedPayment.paymentAmount) === 700000, 'payment amount should parse thousands separators');
    assert(approvedPayment.paymentMethod === 'BANK_TRANSFER', `bank transfer payment method mismatch: ${approvedPayment.paymentMethod}`);
    assert(pendingPayment.paymentMethod === 'CASH', `cash payment method mismatch: ${pendingPayment.paymentMethod}`);
    assert(approvedPayment.supplier?.name === 'Nhà cung cấp test', 'payment should link supplier by source supplier name');
    assert(approvedPayment.order?.systemCode === 'ORDER-FIN-001', 'payment should link matched order');
    assert(approvedPayment.tour?.tourCode === 'ORDER-FIN-001', 'payment should link matched tour');
    assert(approvedPayment.cashflowEntries.length === 1 && amount(approvedPayment.cashflowEntries[0].amount) === 700000, 'approved payment should create one cashflow entry');
    assert(approvedPayment.supplierLedger.length === 1 && amount(approvedPayment.supplierLedger[0].debitAmount) === 700000, 'approved payment should create one supplier ledger debit');
    assert(pendingPayment.cashflowEntries.length === 0 && pendingPayment.supplierLedger.length === 0, 'pending payment must not create cashflow or ledger');

    const receiptCashflowCount = await prisma.financeCashflowEntry.count({ where: { sourceType: 'FINANCE_RECEIPT' } });
    const paymentCashflowCount = await prisma.financeCashflowEntry.count({ where: { sourceType: 'FINANCE_PAYMENT' } });
    assert(receiptCashflowCount === 1, `rerun should keep one receipt cashflow, got ${receiptCashflowCount}`);
    assert(paymentCashflowCount === 1, `rerun should keep one payment cashflow, got ${paymentCashflowCount}`);
  } finally {
    await prisma.$disconnect();
  }

  console.log('TEST_TOURKIT_FINANCE_VOUCHERS_IMPORT_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
