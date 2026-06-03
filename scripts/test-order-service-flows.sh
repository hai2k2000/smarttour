#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_order_service_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_ORDER_SERVICE_TEST missing POSTGRES_PASSWORD"
  exit 1
fi

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

cleanup() {
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { OrdersService } = require('./apps/api/dist/modules/orders/orders.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function rejects(action, label) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

function money(value) {
  return Number(value);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new OrdersService(prisma);
  const run = 'ORDER-SVC-' + Date.now();

  const customer = await prisma.customer.create({
    data: {
      code: run + '-CUS',
      fullName: 'Order Service Customer',
      phone: '0900000000',
      email: run.toLowerCase() + '@smarttour.local',
      branch: 'BR-ORD',
      department: 'DEP-ORD',
    },
  });

  const category = await prisma.supplierCategory.create({ data: { name: run + '-HOTEL-CATEGORY' } });
  const supplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: run + '-SUP',
      name: 'Order Service Hotel',
      status: 'ACTIVE',
    },
  });
  const hotelService = await prisma.supplierService.create({
    data: {
      supplierId: supplier.id,
      sku: run + '-ROOM',
      serviceName: 'Deluxe Room',
      quantity: 5,
      netPrice: 700000,
      sellingPrice: 1000000,
      status: 'ACTIVE',
    },
  });
  const allotment = await prisma.supplierAllotment.create({
    data: {
      supplierId: supplier.id,
      serviceId: hotelService.id,
      sku: run + '-ALLOT',
      serviceName: 'Deluxe Room Allotment',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      allotmentQty: 5,
      status: 'ACTIVE',
    },
  });

  const created = await service.create('single-services', {
    systemCode: run + '-ORD',
    name: 'Order Service Flow',
    customerId: customer.id,
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    salesItems: [{ description: 'Revenue', quantity: 2, serviceCount: 1, unitPrice: 1000000, vat: 10 }],
    operationItems: [{ serviceType: 'OTHER', quantity: 2, netPrice: 350000, vat: 0, status: 'WAITING' }],
    members: [{ fullName: 'Nguyen Van A', phone: '0900000001' }],
    itineraries: [{ dayNo: 1, title: 'Start', content: 'Start trip' }],
    handoverItems: [{ itemName: 'Voucher', quantity: 1 }],
    surveyQuestions: [{ question: 'Chat luong?' }],
    terms: [{ language: 'VI', terms: 'Dieu khoan' }],
  });
  assert(created.customerName === customer.fullName && created.customerPhone === customer.phone, 'create should apply customer snapshot');
  assert(created.members.length === 1 && created.salesItems.length === 1 && created.operationItems.length === 1, 'create should sync children');
  assert(money(created.totalRevenue) === 2200000 && money(created.totalCost) === 700000 && money(created.profit) === 1500000, 'create should calculate totals');

  const updated = await service.update('single-services', created.id, {
    name: 'Order Service Flow Updated',
    salesItems: [{ description: 'Updated revenue', quantity: 1, serviceCount: 1, unitPrice: 3000000, vat: 0 }],
    operationItems: [{ serviceType: 'OTHER', quantity: 1, netPrice: 1200000, vat: 0, status: 'WAITING' }],
    members: [{ fullName: 'Nguyen Van B' }, { fullName: 'Nguyen Van C' }],
  });
  assert(updated.name === 'Order Service Flow Updated', 'update should change order fields');
  assert(updated.members.length === 2 && money(updated.totalRevenue) === 3000000 && money(updated.totalCost) === 1200000, 'update should replace children and totals');

  const copied = await service.copy('single-services', created.id);
  assert(copied.id !== created.id && copied.systemCode.startsWith(created.systemCode + '-COPY-'), 'copy should create a new order');
  assert(copied.status === updated.status && !copied.settledAt, 'copy should not carry settlement lock');
  assert(copied.members.length === updated.members.length, 'copy should include child rows');

  const settled = await service.settle('single-services', created.id);
  assert(settled.status === 'SETTLED' && settled.settledAt, 'settle should mark order settled');
  await rejects(() => service.update('single-services', created.id, { name: 'Blocked' }), 'settled order update should be blocked');
  await rejects(() => service.remove('single-services', created.id), 'settled order delete should be blocked');
  await rejects(() => service.updateStatus('single-services', created.id, 'CANCELLED'), 'settled order status change should be blocked');
  const unlocked = await service.unlock('single-services', created.id, { actor: 'order-test', reason: 'test unlock' });
  assert(unlocked.status === 'COMPLETED' && !unlocked.settledAt, 'unlock should clear settlement and set completed');
  const afterUnlock = await service.update('single-services', created.id, { name: 'Editable After Unlock' });
  assert(afterUnlock.name === 'Editable After Unlock', 'unlocked order should be editable again');

  const hotel = await service.create('hotel-bookings', {
    systemCode: run + '-HOTEL',
    name: 'Hotel Booking Flow',
    customerId: customer.id,
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    salesItems: [{ description: 'Hotel revenue', quantity: 2, serviceCount: 1, unitPrice: 1500000, vat: 0 }],
    operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 2, netPrice: 700000, vat: 0, status: 'WAITING' }],
  });
  let lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 2 && lockedAllotment.bookedQty === 0, 'hotel create should lock allotment');

  await service.updateStatus('hotel-bookings', hotel.id, 'COMPLETED');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 2, 'hotel completed should confirm allotment');

  await service.updateStatus('hotel-bookings', hotel.id, 'CANCELLED');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel cancelled should release allotment');

  const hotelUpdate = await service.create('hotel-bookings', {
    systemCode: run + '-HOTEL-UPD',
    name: 'Hotel Booking Update Release',
    customerId: customer.id,
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 1, netPrice: 700000, vat: 0, status: 'WAITING' }],
  });
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 1, 'hotel update fixture should lock one room');
  await service.update('hotel-bookings', hotelUpdate.id, {
    operationItems: [{ serviceType: 'OTHER', quantity: 1, netPrice: 100000, vat: 0, status: 'WAITING' }],
  });
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0, 'hotel update without allotment service should release old lock');

  await prisma.$disconnect();
  console.log('TEST_ORDER_SERVICE_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
