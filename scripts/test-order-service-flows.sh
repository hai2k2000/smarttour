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
    customerName: '   ',
    customerPhone: '   ',
    customerEmail: '   ',
    customerAddress: '   ',
    customerType: '   ',
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
  assert(created.customerEmail === customer.email, 'create should fill blank customer snapshot fields');
  assert(created.members.length === 1 && created.salesItems.length === 1 && created.operationItems.length === 1, 'create should sync children');
  assert(money(created.totalRevenue) === 2200000 && money(created.totalCost) === 700000 && money(created.profit) === 1500000, 'create should calculate totals');
  const createLog = await prisma.orderLog.findFirst({ where: { orderId: created.id, action: 'CREATE' } });
  assert(createLog?.newValue?.systemCode === run + '-ORD' && createLog.newValue.customerId === customer.id, 'create should write full create log payload');
  const listRows = await service.list('single-services', run);
  assert(listRows.some((row) => row.id === created.id), 'list should include created order');
  assert(!Object.prototype.hasOwnProperty.call(listRows[0], 'customer'), 'list select should not include deep customer object');

  const typeFixtures = [
    ['fit-tours', 'FIT'],
    ['git-combos', 'GIT'],
    ['landtours', 'LAND'],
    ['flight-orders', 'FLT'],
    ['services', 'SVCALIAS'],
  ];
  for (const [typePath, suffix] of typeFixtures) {
    const row = await service.create(typePath, {
      systemCode: `${run}-${suffix}`,
      name: `Order ${suffix}`,
      customerId: customer.id,
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      salesItems: [{ description: suffix, quantity: 1, serviceCount: 1, unitPrice: 1000, vat: 0 }],
      operationItems: [{ serviceType: 'OTHER', quantity: 1, netPrice: 400, vat: 0, status: 'WAITING' }],
    });
    assert(row.systemCode === `${run}-${suffix}` && money(row.profit) === 600, `create should work for ${typePath}`);
  }
  const explicitCustomerSnapshot = await service.create('single-services', {
    systemCode: run + '-CUS-OVERRIDE',
    name: 'Customer Override',
    customerId: customer.id,
    customerName: 'Custom Customer Name',
    customerPhone: '0999999999',
    customerEmail: 'custom@example.test',
  });
  assert(explicitCustomerSnapshot.customerName === 'Custom Customer Name' && explicitCustomerSnapshot.customerPhone === '0999999999' && explicitCustomerSnapshot.customerEmail === 'custom@example.test', 'customer snapshot should not overwrite explicit customer fields');
  const createdSettled = await service.create('single-services', {
    systemCode: run + '-CREATE-SETTLED',
    name: 'Create Settled',
    status: 'SETTLED',
    customerId: customer.id,
    salesItems: [{ description: 'settled', quantity: 1, serviceCount: 1, unitPrice: 100, vat: 0 }],
  });
  assert(createdSettled.status === 'SETTLED' && createdSettled.settledAt, 'create SETTLED should set settledAt');

  const partial = await service.update('single-services', created.id, { note: 'Partial update should not touch children' });
  assert(partial.salesItems[0].id === created.salesItems[0].id, 'partial update should preserve sales item id');
  assert(partial.operationItems[0].id === created.operationItems[0].id, 'partial update should preserve operation item id');
  assert(partial.members[0].id === created.members[0].id, 'partial update should preserve member id');
  const blankChildPayload = await service.update('single-services', created.id, { members: [{ fullName: '   ' }], salesItems: [{ description: '   ', unitPrice: 0 }], operationItems: [{ serviceType: '   ', netPrice: 0 }] });
  assert(blankChildPayload.members.length === partial.members.length, 'blank member row should not delete existing members');
  assert(blankChildPayload.salesItems.length === partial.salesItems.length, 'blank sales row should not replace existing sales items');
  assert(blankChildPayload.operationItems.length === partial.operationItems.length, 'blank operation row should not replace existing operation items');

  const updated = await service.update('single-services', created.id, {
    name: 'Order Service Flow Updated',
    salesItems: [{ id: partial.salesItems[0].id, description: 'Updated revenue', quantity: 1, serviceCount: 1, unitPrice: 3000000, vat: 0 }],
    operationItems: [{ id: partial.operationItems[0].id, serviceType: 'OTHER', quantity: 1, netPrice: 1200000, vat: 0, status: 'WAITING' }],
    members: [{ id: partial.members[0].id, fullName: 'Nguyen Van B' }, { fullName: 'Nguyen Van C' }],
  });
  assert(updated.name === 'Order Service Flow Updated', 'update should change order fields');
  assert(updated.members.length === 2 && money(updated.totalRevenue) === 3000000 && money(updated.totalCost) === 1200000, 'update should replace children and totals');
  assert(updated.salesItems[0].id === partial.salesItems[0].id, 'update should preserve existing sales item id');
  assert(updated.operationItems[0].id === partial.operationItems[0].id, 'update should preserve existing operation item id');
  assert(updated.members.some((item) => item.id === partial.members[0].id && item.fullName === 'Nguyen Van B'), 'update should preserve existing member id');

  const copied = await service.copy('single-services', created.id);
  assert(copied.id !== created.id && copied.systemCode.startsWith(created.systemCode + '-COPY-'), 'copy should create a new order');
  assert(copied.status === updated.status && !copied.settledAt, 'copy should not carry settlement lock');
  assert(copied.members.length === updated.members.length, 'copy should include child rows');
  assert(copied.salesItems[0].id !== updated.salesItems[0].id && copied.operationItems[0].id !== updated.operationItems[0].id, 'copy should create independent child rows');
  await rejects(() => service.update('single-services', created.id, { members: [{ id: copied.members[0].id, fullName: 'Cross Order Member' }] }), 'foreign child row id should be rejected');

  const statusSettled = await service.updateStatus('single-services', copied.id, 'SETTLED');
  assert(statusSettled.status === 'SETTLED' && statusSettled.settledAt, 'updateStatus SETTLED should set settledAt');
  await rejects(() => service.update('single-services', copied.id, { name: 'Blocked By Status Settle' }), 'status-settled order update should be blocked');
  await rejects(() => service.unlock('single-services', copied.id, { actor: '', reason: 'missing actor' }), 'unlock should require actor');
  await rejects(() => service.unlock('single-services', copied.id, { actor: 'order-test', reason: '' }), 'unlock should require reason');
  const statusUnlocked = await service.unlock('single-services', copied.id, { actor: 'order-test', reason: 'test status unlock' });
  assert(statusUnlocked.status === 'COMPLETED' && !statusUnlocked.settledAt, 'unlock should clear status-settled orders');

  const flight = await service.create('flight-orders', {
    systemCode: run + '-FLIGHT-STATUS',
    name: 'Flight Status Guard',
    customerId: customer.id,
  });
  await rejects(() => service.updateStatus('flight-orders', flight.id, 'RUNNING'), 'flight orders should reject unsupported RUNNING status');
  const flightCompleted = await service.updateStatus('flights', flight.id, 'COMPLETED');
  assert(flightCompleted.status === 'COMPLETED', 'flight alias should resolve and allow completed status');
  const cancelledForSettle = await service.create('single-services', {
    systemCode: run + '-CANCEL-SETTLE',
    name: 'Cancelled Cannot Settle',
    customerId: customer.id,
  });
  await service.updateStatus('single-services', cancelledForSettle.id, 'CANCELLED');
  await rejects(() => service.settle('single-services', cancelledForSettle.id), 'cancelled order should not be settled');

  const settled = await service.settle('single-services', created.id);
  assert(settled.status === 'SETTLED' && settled.settledAt, 'settle should mark order settled');
  await rejects(() => service.update('single-services', created.id, { name: 'Blocked' }), 'settled order update should be blocked');
  await rejects(() => service.remove('single-services', created.id), 'settled order delete should be blocked');
  await rejects(() => service.updateStatus('single-services', created.id, 'CANCELLED'), 'settled order status change should be blocked');
  const unlocked = await service.unlock('single-services', created.id, { actor: 'order-test', reason: 'test unlock' });
  assert(unlocked.status === 'COMPLETED' && !unlocked.settledAt, 'unlock should clear settlement and set completed');
  const afterUnlock = await service.update('single-services', created.id, { name: 'Editable After Unlock' });
  assert(afterUnlock.name === 'Editable After Unlock', 'unlocked order should be editable again');
  const removed = await service.remove('single-services', created.id);
  assert(removed.deletedAt, 'remove should soft delete editable order');
  await rejects(() => service.detail('single-services', created.id), 'removed order should be hidden from detail');

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

  await service.updateStatus('hotel-bookings', hotel.id, 'UPCOMING');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 2 && lockedAllotment.bookedQty === 0, 'hotel downgrade should move booked allotment back to locked');

  await service.updateStatus('hotel-bookings', hotel.id, 'RUNNING');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 2, 'hotel running should confirm allotment');

  await service.updateStatus('hotel-bookings', hotel.id, 'CANCELLED');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel cancelled should release allotment');

  await service.updateStatus('hotel-bookings', hotel.id, 'UPCOMING');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 2 && lockedAllotment.bookedQty === 0, 'hotel reactivation should lock allotment again');
  await service.remove('hotel-bookings', hotel.id);
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel remove should release locked allotment');

  const hotelSettle = await service.create('hotel-bookings', {
    systemCode: run + '-HOTEL-SETTLE',
    name: 'Hotel Booking Settle Flow',
    customerId: customer.id,
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 1, netPrice: 700000, vat: 0, status: 'WAITING' }],
  });
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 1 && lockedAllotment.bookedQty === 0, 'hotel settle fixture should lock one room');
  const settledHotel = await service.settle('hotel-bookings', hotelSettle.id);
  assert(settledHotel.status === 'SETTLED' && settledHotel.settledAt, 'hotel settle should mark settlement');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 1, 'hotel settle should confirm allotment');
  await service.unlock('hotel-bookings', hotelSettle.id, { actor: 'order-test', reason: 'test hotel unlock' });
  await service.remove('hotel-bookings', hotelSettle.id);
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel remove after unlock should release confirmed allotment');

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
  await service.updateStatus('hotel-bookings', hotelUpdate.id, 'COMPLETED');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 1, 'hotel update fixture should confirm one room');
  const hotelUpdateChanged = await service.update('hotel-bookings', hotelUpdate.id, {
    operationItems: [{ id: hotelUpdate.operationItems[0].id, serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 2, netPrice: 700000, vat: 0, status: 'WAITING' }],
  });
  assert(hotelUpdateChanged.operationItems[0].id === hotelUpdate.operationItems[0].id, 'hotel update should preserve operation item id');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 2, 'completed hotel update should keep allotment booked, not locked');
  await service.updateStatus('hotel-bookings', hotelUpdate.id, 'UPCOMING');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 2 && lockedAllotment.bookedQty === 0, 'hotel update downgrade should move booked rooms back to locked');
  await service.update('hotel-bookings', hotelUpdate.id, {
    operationItems: [{ id: hotelUpdateChanged.operationItems[0].id, serviceType: 'OTHER', quantity: 1, netPrice: 100000, vat: 0, status: 'WAITING' }],
  });
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel update without allotment service should release old lock');

  const hotelOtherService = await service.create('hotel-bookings', {
    systemCode: run + '-HOTEL-OTHER-SVC',
    name: 'Hotel Other Service No Lock',
    customerId: customer.id,
    startDate: '2026-10-10',
    operationItems: [{ serviceType: 'OTHER', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 3, netPrice: 100000, vat: 0, status: 'WAITING' }],
  });
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel booking should not auto-lock non-hotel operation lines');
  await service.remove('hotel-bookings', hotelOtherService.id);

  const hotelZeroQty = await service.create('hotel-bookings', {
    systemCode: run + '-HOTEL-ZERO-QTY',
    name: 'Hotel Zero Quantity No Lock',
    customerId: customer.id,
    startDate: '2026-10-10',
    operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 0, netPrice: 700000, vat: 0, status: 'WAITING' }],
  });
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel booking should not auto-lock zero quantity lines');
  await service.remove('hotel-bookings', hotelZeroQty.id);

  await prisma.$disconnect();
  console.log('TEST_ORDER_SERVICE_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
