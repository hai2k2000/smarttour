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
    paidAmount: 500000,
    paidCost: 200000,
    salesItems: [{ description: 'Revenue', quantity: 2, serviceCount: 1, unitPrice: 1000000, vat: 10 }],
    operationItems: [{ serviceType: 'OTHER', quantity: 2, netPrice: 350000, vat: 0, status: 'WAITING' }],
    guides: [{ guideName: 'Guide A', phone: '0900000099' }],
    members: [{ fullName: 'Nguyen Van A', phone: '0900000001' }],
    itineraries: [{ dayNo: 1, title: 'Start', content: 'Start trip' }],
    handoverItems: [{ itemName: 'Voucher', quantity: 1 }],
    surveyQuestions: [{ question: 'Chat luong?' }],
    terms: [{ language: 'VI', terms: 'Dieu khoan' }],
  });
  assert(created.customerName === customer.fullName && created.customerPhone === customer.phone, 'create should apply customer snapshot');
  assert(created.type === 'SINGLE_SERVICE', 'single-services should create SINGLE_SERVICE orders');
  assert(created.customerEmail === customer.email, 'create should fill blank customer snapshot fields');
  assert(created.guides.length === 1 && created.members.length === 1 && created.salesItems.length === 1 && created.operationItems.length === 1, 'create should sync children');
  assert(money(created.totalRevenue) === 2200000 && money(created.totalCost) === 700000 && money(created.profit) === 1500000, 'create should calculate totals');
  assert(money(created.paidAmount) === 500000 && money(created.remainingRevenue) === 1700000, 'create should calculate paid and remaining revenue');
  assert(money(created.paidCost) === 200000 && money(created.remainingCost) === 500000, 'create should calculate paid and remaining cost');
  const createLog = await prisma.orderLog.findFirst({ where: { orderId: created.id, action: 'CREATE' } });
  assert(createLog?.newValue?.systemCode === run + '-ORD' && createLog.newValue.customerId === customer.id, 'create should write core create log payload');
  assert(createLog.newValue.childCounts.salesItems === 1 && createLog.newValue.childCounts.operationItems === 1, 'create log should summarize child counts');
  assert(createLog.newValue.totals.totalRevenue === 2200000 && createLog.newValue.totals.totalCost === 700000, 'create log should include calculated totals');
  assert(!createLog.newValue.salesItems && !createLog.newValue.operationItems && !createLog.newValue.customerEmail && !createLog.newValue.customerPhone, 'create log should not store full child rows or sensitive customer fields');
  const listRows = await service.list('single-services', run);
  assert(listRows.some((row) => row.id === created.id), 'list should include created order');
  assert(!Object.prototype.hasOwnProperty.call(listRows[0], 'customer'), 'list select should not include deep customer object');
  assert((await service.list('single-services', created.systemCode)).some((row) => row.id === created.id), 'list search should match system code');
  assert((await service.list('single-services', 'Service Flow')).some((row) => row.id === created.id), 'list search should match order name');
  assert((await service.list('single-services', customer.phone)).some((row) => row.id === created.id), 'list search should match customer phone snapshot');
  assert((await service.list('fit-tours', created.systemCode)).length === 0, 'list should filter by order type');
  const createdDetail = await service.detail('single-services', created.id);
  assert(createdDetail.id === created.id && createdDetail.guides.length === 1 && createdDetail.members.length === 1 && createdDetail.salesItems.length === 1 && createdDetail.operationItems.length === 1, 'detail should include full order children');
  await rejects(() => service.detail('fit-tours', created.id), 'detail should reject an order requested through the wrong type');
  await prisma.customer.update({
    where: { id: customer.id },
    data: { fullName: 'Customer Changed Later', phone: '0988888888', email: 'changed-later@smarttour.local' },
  });
  const afterCustomerChange = await service.detail('single-services', created.id);
  assert(afterCustomerChange.customerName === created.customerName && afterCustomerChange.customerPhone === created.customerPhone && afterCustomerChange.customerEmail === created.customerEmail, 'customer changes should not mutate existing order snapshot');

  const typeFixtures = [
    ['fit-tours', 'FIT', 'FIT_TOUR'],
    ['git-combos', 'GIT', 'GIT_COMBO'],
    ['landtours', 'LAND', 'LANDTOUR'],
    ['flight-orders', 'FLT', 'FLIGHT_ORDER'],
    ['services', 'SVCALIAS', 'SINGLE_SERVICE'],
  ];
  for (const [typePath, suffix, expectedType] of typeFixtures) {
    const row = await service.create(typePath, {
      systemCode: `${run}-${suffix}`,
      name: `Order ${suffix}`,
      customerId: customer.id,
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      salesItems: [{ description: suffix, quantity: 1, serviceCount: 1, unitPrice: 1000, vat: 0 }],
      operationItems: [{ serviceType: 'OTHER', quantity: 1, netPrice: 400, vat: 0, status: 'WAITING' }],
    });
    assert(row.systemCode === `${run}-${suffix}` && row.type === expectedType && money(row.profit) === 600, `create should work for ${typePath}`);
  }
  await rejects(() => service.create('single-services', {
    systemCode: run + '-BAD-DATE',
    name: 'Bad date order',
    startDate: '2026-10-20',
    endDate: '2026-10-19',
  }), 'create should reject end date before start date');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-BAD-PAYMENT-DATE',
    name: 'Bad payment date order',
    bookingDate: '2026-10-20',
    paymentDate: '2026-10-19',
  }), 'create should reject payment date before booking date');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-INVALID-DATE',
    name: 'Invalid date order',
    startDate: 'not-a-date',
  }), 'create should reject an invalid date value');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-INVALID-ISO-DATE',
    name: 'Invalid ISO date order',
    startDate: '2026-02-31T00:00:00.000Z',
  }), 'create should reject an impossible ISO date value');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-BAD-RATE',
    name: 'Bad exchange rate order',
    exchangeRate: 0,
  }), 'create should reject zero exchangeRate instead of defaulting it to one');
  assert(await prisma.order.count({ where: { systemCode: { in: [run + '-BAD-DATE', run + '-BAD-PAYMENT-DATE', run + '-INVALID-DATE', run + '-INVALID-ISO-DATE', run + '-BAD-RATE'] } } }) === 0, 'invalid create inputs should not persist orders');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-BAD-SALES-QTY',
    name: 'Bad sales quantity order',
    salesItems: [{ description: 'Bad sales quantity', quantity: 0, serviceCount: 1, unitPrice: 100000, vat: 0 }],
  }), 'create should reject zero sales item quantity instead of storing a zero revenue line');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-BAD-SALES-COUNT',
    name: 'Bad sales service count order',
    salesItems: [{ description: 'Bad sales service count', quantity: 1, serviceCount: 0, unitPrice: 100000, vat: 0 }],
  }), 'create should reject zero sales service count instead of storing a zero revenue line');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-BAD-OP-QTY',
    name: 'Bad operation quantity order',
    operationItems: [{ serviceType: 'OTHER', quantity: 0, netPrice: 100000, vat: 0, status: 'WAITING' }],
  }), 'create should reject zero operation item quantity instead of storing a zero cost line');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-BAD-HANDOVER-QTY',
    name: 'Bad handover quantity order',
    handoverItems: [{ itemName: 'Voucher', quantity: 0 }],
  }), 'create should reject zero handover item quantity instead of storing an invalid handover line');
  const explicitCustomerSnapshot = await service.create('single-services', {
    systemCode: run + '-CUS-OVERRIDE',
    name: 'Customer Override',
    customerId: customer.id,
    customerName: 'Custom Customer Name',
    customerPhone: '0999999999',
    customerEmail: 'custom@example.test',
  });
  assert(explicitCustomerSnapshot.customerName === 'Custom Customer Name' && explicitCustomerSnapshot.customerPhone === '0999999999' && explicitCustomerSnapshot.customerEmail === 'custom@example.test', 'customer snapshot should not overwrite explicit customer fields');
  await rejects(() => service.create('single-services', {
    systemCode: run + '-CREATE-SETTLED',
    name: 'Create Settled',
    status: 'SETTLED',
    customerId: customer.id,
    salesItems: [{ description: 'settled', quantity: 1, serviceCount: 1, unitPrice: 100, vat: 0 }],
  }), 'create should reject SETTLED status; use settle action endpoint');
  assert(await prisma.order.count({ where: { systemCode: run + '-CREATE-SETTLED' } }) === 0, 'rejected create SETTLED should not persist orders');

  const partial = await service.update('single-services', created.id, { note: 'Partial update should not touch children' });
  await rejects(() => service.update('single-services', created.id, { status: 'CANCELLED' }), 'normal update should reject status changes; use lifecycle action endpoint');
  const afterRejectedStatusUpdate = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
  assert(afterRejectedStatusUpdate.status === created.status, 'rejected normal update should not mutate order status');
  assert(partial.customerName === created.customerName && partial.customerPhone === created.customerPhone, 'partial update should preserve customer snapshot');
  assert(partial.salesItems[0].id === created.salesItems[0].id, 'partial update should preserve sales item id');
  assert(partial.operationItems[0].id === created.operationItems[0].id, 'partial update should preserve operation item id');
  assert(partial.members[0].id === created.members[0].id, 'partial update should preserve member id');
  await rejects(() => service.update('single-services', created.id, { startDate: '2026-11-10', endDate: '2026-11-09' }), 'update should reject end date before start date');
  await rejects(() => service.update('single-services', created.id, { startDate: '2026-12-31' }), 'update should reject start date after current end date');
  await rejects(() => service.update('single-services', created.id, { endDate: '2026-01-01' }), 'update should reject end date before current start date');
  await rejects(() => service.update('single-services', created.id, { closeDeadline: 'not-a-date' }), 'update should reject an invalid date value');
  await rejects(() => service.update('single-services', created.id, { operationItems: [{ serviceType: 'OTHER', serviceDate: 'not-a-date', quantity: 1, netPrice: 1000 }] }), 'update should reject invalid nested operation serviceDate');
  const emptyUpdate = await service.update('single-services', created.id, {});
  assert(emptyUpdate.id === created.id && emptyUpdate.salesItems[0].id === created.salesItems[0].id && emptyUpdate.members[0].id === created.members[0].id, 'empty partial update should preserve order and children');
  const blankChildPayload = await service.update('single-services', created.id, { members: [{ fullName: '   ' }], salesItems: [{ description: '   ', unitPrice: 0 }], operationItems: [{ serviceType: '   ', netPrice: 0 }] });
  assert(blankChildPayload.members.length === partial.members.length, 'blank member row should not delete existing members');
  assert(blankChildPayload.salesItems.length === partial.salesItems.length, 'blank sales row should not replace existing sales items');
  assert(blankChildPayload.operationItems.length === partial.operationItems.length, 'blank operation row should not replace existing operation items');

  const updated = await service.update('single-services', created.id, {
    name: 'Order Service Flow Updated',
    salesItems: [{ id: partial.salesItems[0].id, description: 'Updated revenue', quantity: 1, serviceCount: 1, unitPrice: 3000000, vat: 0 }],
    operationItems: [{ id: partial.operationItems[0].id, serviceType: 'OTHER', quantity: 1, netPrice: 1200000, vat: 0, status: 'WAITING' }],
    guides: [{ id: partial.guides[0].id, guideName: 'Guide B', phone: '0900000088' }, { guideName: 'Guide C' }],
    members: [{ id: partial.members[0].id, fullName: 'Nguyen Van B' }, { fullName: 'Nguyen Van C' }],
    itineraries: [{ id: partial.itineraries[0].id, dayNo: 1, title: 'Updated start', content: 'Updated trip' }, { dayNo: 2, title: 'Finish', content: 'Finish trip' }],
    handoverItems: [{ id: partial.handoverItems[0].id, itemName: 'Updated voucher', quantity: 2 }],
    surveyQuestions: [{ id: partial.surveyQuestions[0].id, question: 'Chat luong cap nhat?' }],
    terms: [{ id: partial.terms[0].id, language: 'VI', terms: 'Dieu khoan cap nhat' }],
  });
  assert(updated.name === 'Order Service Flow Updated', 'update should change order fields');
  assert(updated.members.length === 2 && money(updated.totalRevenue) === 3000000 && money(updated.totalCost) === 1200000 && money(updated.profit) === 1800000, 'update should replace children and totals');
  assert(money(updated.paidAmount) === 500000 && money(updated.remainingRevenue) === 2500000, 'update should preserve paid amount and recalculate remaining revenue');
  assert(money(updated.paidCost) === 200000 && money(updated.remainingCost) === 1000000, 'update should preserve paid cost and recalculate remaining cost');
  assert(updated.salesItems[0].id === partial.salesItems[0].id, 'update should preserve existing sales item id');
  assert(updated.operationItems[0].id === partial.operationItems[0].id, 'update should preserve existing operation item id');
  assert(updated.members.some((item) => item.id === partial.members[0].id && item.fullName === 'Nguyen Van B'), 'update should preserve existing member id');
  assert(updated.guides.length === 2 && updated.guides.some((item) => item.id === partial.guides[0].id && item.guideName === 'Guide B'), 'update should sync guide children');
  assert(updated.itineraries.length === 2 && updated.itineraries.some((item) => item.id === partial.itineraries[0].id && item.title === 'Updated start'), 'update should sync itinerary children');
  assert(updated.handoverItems[0].id === partial.handoverItems[0].id && money(updated.handoverItems[0].quantity) === 2, 'update should sync handover children');
  assert(updated.surveyQuestions[0].id === partial.surveyQuestions[0].id && updated.terms[0].id === partial.terms[0].id, 'update should sync survey and term children');
  const updateLog = await prisma.orderLog.findFirst({ where: { orderId: created.id, action: 'UPDATE' }, orderBy: { createdAt: 'desc' } });
  assert(updateLog?.oldValue?.systemCode === created.systemCode && updateLog.oldValue.childCounts.salesItems >= 1, 'update log should include compact old summary');
  assert(updateLog.newValue.childCounts.salesItems === 1 && updateLog.newValue.childCounts.members === 2, 'update log should include compact new child counts');
  assert(!updateLog.newValue.salesItems && !updateLog.newValue.members && !updateLog.newValue.customerEmail, 'update log should not store full child rows or sensitive customer fields');

  const copied = await service.copy('single-services', created.id);
  assert(copied.id !== created.id && copied.systemCode.startsWith(created.systemCode + '-COPY-'), 'copy should create a new order');
  assert(copied.status === 'UPCOMING' && !copied.settledAt, 'copy should reset lifecycle status and not carry settlement lock');
  assert(!copied.holdCode && !copied.paymentDate && !copied.createdBy, 'copy should not carry stale hold/payment/creator fields');
  assert(copied.customerName === created.customerName && copied.customerPhone === created.customerPhone && copied.customerEmail === created.customerEmail, 'copy should preserve the source order customer snapshot');
  assert(copied.guides.length === updated.guides.length && copied.members.length === updated.members.length && copied.itineraries.length === updated.itineraries.length && copied.handoverItems.length === updated.handoverItems.length && copied.surveyQuestions.length === updated.surveyQuestions.length && copied.terms.length === updated.terms.length, 'copy should include all child row groups');
  assert(money(copied.totalRevenue) === money(updated.totalRevenue) && money(copied.totalCost) === money(updated.totalCost) && money(copied.profit) === money(updated.profit), 'copy should recalculate clean totals from copied child rows');
  assert(money(copied.paidAmount) === 0 && money(copied.paidCost) === 0 && money(copied.remainingRevenue) === money(copied.totalRevenue) && money(copied.remainingCost) === money(copied.totalCost), 'copy should reset paid values and remaining amounts');
  assert(copied.salesItems[0].id !== updated.salesItems[0].id && copied.operationItems[0].id !== updated.operationItems[0].id, 'copy should create independent child rows');
  await rejects(() => service.update('single-services', created.id, { members: [{ id: copied.members[0].id, fullName: 'Cross Order Member' }] }), 'foreign child row id should be rejected');

  const statusSettled = await service.updateStatus('single-services', copied.id, 'SETTLED');
  assert(statusSettled.status === 'SETTLED' && statusSettled.settledAt, 'updateStatus SETTLED should set settledAt');
  await rejects(() => service.update('single-services', copied.id, { name: 'Blocked By Status Settle' }), 'status-settled order update should be blocked');
  const unlockUser = {
    id: run + '-UNLOCK-USER',
    email: 'unlock-user@example.test',
    username: 'unlock-user',
    name: 'Unlock User',
    branch: null,
    department: null,
    roles: [{ role: { status: 'ACTIVE', permissions: [{ permission: '*' }] } }],
  };
  await rejects(() => service.unlock('single-services', copied.id, { actor: 'spoofed-user', reason: '' }, unlockUser), 'unlock should require reason');
  const statusUnlocked = await service.unlock('single-services', copied.id, { actor: 'spoofed-user', reason: 'test status unlock' }, unlockUser);
  assert(statusUnlocked.status === 'COMPLETED' && !statusUnlocked.settledAt, 'unlock should clear status-settled orders');
  const statusUnlockLog = await prisma.orderLog.findFirst({ where: { orderId: copied.id, action: 'UNLOCK_SETTLEMENT' }, orderBy: { createdAt: 'desc' } });
  assert(statusUnlockLog?.userId === unlockUser.id, 'unlock log should use authenticated user id instead of client supplied actor');

  const draftOrder = await service.create('single-services', {
    systemCode: run + '-DRAFT-STATUS',
    name: 'Draft Status Guard',
    customerId: customer.id,
    status: 'DRAFT',
  });
  await rejects(() => service.updateStatus('single-services', draftOrder.id, 'COMPLETED'), 'draft orders should reject direct transition to completed');
  const afterInvalidDraftTransition = await prisma.order.findUniqueOrThrow({ where: { id: draftOrder.id } });
  assert(afterInvalidDraftTransition.status === 'DRAFT', 'invalid draft transition should not mutate status');
  const draftUpcoming = await service.updateStatus('single-services', draftOrder.id, 'UPCOMING');
  assert(draftUpcoming.status === 'UPCOMING', 'draft orders should allow transition to upcoming');

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

  const settleStartedAt = Date.now();
  const settled = await service.settle('single-services', created.id);
  assert(settled.status === 'SETTLED' && settled.settledAt, 'settle should mark order settled');
  assert(new Date(settled.settledAt).getTime() >= settleStartedAt, 'settle should set settledAt at settlement time');
  const settledAgain = await service.settle('single-services', created.id);
  assert(new Date(settledAgain.settledAt).getTime() === new Date(settled.settledAt).getTime(), 'settle should be idempotent and preserve settledAt');
  await rejects(() => service.update('single-services', created.id, { name: 'Blocked' }), 'settled order update should be blocked');
  await rejects(() => service.remove('single-services', created.id), 'settled order delete should be blocked');
  await rejects(() => service.updateStatus('single-services', created.id, 'CANCELLED'), 'settled order status change should be blocked');
  const unlocked = await service.unlock('single-services', created.id, { actor: 'spoofed-user', reason: 'test unlock' }, unlockUser);
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
  assert(hotel.type === 'HOTEL_BOOKING', 'hotel-bookings should create HOTEL_BOOKING orders');
  let lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 2 && lockedAllotment.bookedQty === 0, 'hotel create should lock allotment');
  let activeHotelAllocation = await prisma.supplierAllotmentAllocation.findFirst({ where: { orderId: hotel.id, createdBy: 'ORDER_AUTO', status: 'LOCKED' } });
  assert(activeHotelAllocation?.quantity === 2 && activeHotelAllocation.orderOperationItemId === hotel.operationItems[0].id, 'hotel create should link the lock to the correct operation item');

  const hotelCopy = await service.copy('hotel-bookings', hotel.id);
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 4 && lockedAllotment.bookedQty === 0, 'hotel copy should create an independent allotment lock');
  activeHotelAllocation = await prisma.supplierAllotmentAllocation.findFirst({ where: { orderId: hotelCopy.id, createdBy: 'ORDER_AUTO', status: 'LOCKED' } });
  assert(activeHotelAllocation?.quantity === 2 && activeHotelAllocation.orderOperationItemId === hotelCopy.operationItems[0].id && hotelCopy.operationItems[0].id !== hotel.operationItems[0].id, 'hotel copy lock should link to the copied operation item');
  await service.remove('hotel-bookings', hotelCopy.id);
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 2 && lockedAllotment.bookedQty === 0, 'removing hotel copy should release only its allotment lock');

  await service.updateStatus('hotel-bookings', hotel.id, 'COMPLETED');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 2, 'hotel completed should confirm allotment');
  activeHotelAllocation = await prisma.supplierAllotmentAllocation.findFirst({ where: { orderId: hotel.id, createdBy: 'ORDER_AUTO', status: 'CONFIRMED' } });
  assert(activeHotelAllocation?.quantity === 2, 'hotel completed should mark its allocation confirmed');

  await rejects(() => service.updateStatus('hotel-bookings', hotel.id, 'UPCOMING'), 'completed hotel booking should not be reopened through generic status changes');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 2, 'rejected hotel downgrade should keep booked allotment confirmed');
  await service.remove('hotel-bookings', hotel.id);
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel remove should release confirmed allotment');

  const hotelCancel = await service.create('hotel-bookings', {
    systemCode: run + '-HOTEL-CANCEL',
    name: 'Hotel Booking Cancel Flow',
    customerId: customer.id,
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 2, netPrice: 700000, vat: 0, status: 'WAITING' }],
  });
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 2 && lockedAllotment.bookedQty === 0, 'hotel cancel fixture should lock allotment');

  await service.updateStatus('hotel-bookings', hotelCancel.id, 'CANCELLED');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 0, 'hotel cancelled should release allotment');
  const releasedHotelAllocation = await prisma.supplierAllotmentAllocation.findFirst({ where: { orderId: hotelCancel.id, createdBy: 'ORDER_AUTO', status: 'RELEASED' }, orderBy: { releasedAt: 'desc' } });
  assert(releasedHotelAllocation?.releasedAt, 'hotel cancelled should mark its allocation released');

  await rejects(() => service.updateStatus('hotel-bookings', hotelCancel.id, 'UPCOMING'), 'cancelled hotel booking should not be reopened through generic status changes');

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
  await service.unlock('hotel-bookings', hotelSettle.id, { actor: 'spoofed-user', reason: 'test hotel unlock' }, unlockUser);
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
  activeHotelAllocation = await prisma.supplierAllotmentAllocation.findFirst({ where: { orderId: hotelUpdate.id, createdBy: 'ORDER_AUTO', status: 'CONFIRMED' }, orderBy: { createdAt: 'desc' } });
  assert(activeHotelAllocation?.quantity === 2 && activeHotelAllocation.orderOperationItemId === hotelUpdateChanged.operationItems[0].id, 'hotel update should link replacement allocation to the preserved operation item');
  await rejects(() => service.updateStatus('hotel-bookings', hotelUpdate.id, 'UPCOMING'), 'completed hotel update fixture should not downgrade through generic status changes');
  lockedAllotment = await prisma.supplierAllotment.findUniqueOrThrow({ where: { id: allotment.id } });
  assert(lockedAllotment.lockedQty === 0 && lockedAllotment.bookedQty === 2, 'rejected hotel update downgrade should keep booked rooms confirmed');
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

  await rejects(() => service.create('hotel-bookings', {
    systemCode: run + '-HOTEL-ZERO-QTY',
    name: 'Hotel Zero Quantity Rejected',
    customerId: customer.id,
    startDate: '2026-10-10',
    operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, serviceDate: '2026-10-10', quantity: 0, netPrice: 700000, vat: 0, status: 'WAITING' }],
  }), 'hotel booking should reject zero quantity lines instead of silently skipping allotment locks');

  await prisma.$disconnect();
  console.log('TEST_ORDER_SERVICE_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
