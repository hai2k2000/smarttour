#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_bookings_service_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_BOOKINGS_SERVICE_TEST missing POSTGRES_PASSWORD"
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
const { BookingsService } = require('./apps/api/dist/modules/bookings/bookings.service');
const {
  BOOKING_CODE_CONFLICT_MESSAGE,
  BOOKING_NOT_FOUND_MESSAGES,
} = require('./apps/api/dist/modules/bookings/booking-errors');
const { BOOKING_UPDATE_FIELDS } = require('./apps/api/dist/modules/bookings/dto/update-booking.dto');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function rejects(action, label, expectedMessage) {
  let rejected = false;
  let actualMessage = '';
  try {
    await action();
  } catch (error) {
    rejected = true;
    actualMessage = error?.message || '';
  }
  assert(rejected, label);
  if (expectedMessage) {
    assert(
      actualMessage === expectedMessage,
      `${label}: expected "${expectedMessage}", got "${actualMessage}"`,
    );
  }
}

function amount(value) {
  return Number(value || 0);
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function createTourProgram(prisma, run, suffix, durationDays = 3) {
  return prisma.tourProgram.create({
    data: {
      code: `${run}-TP-${suffix}`,
      name: `Bookings Service Tour Program ${suffix}`,
      route: 'Ha Noi - Ha Long',
      durationDays,
      itineraryDays: {
        create: Array.from({ length: durationDays }, (_, index) => ({
          dayNumber: index + 1,
          title: `Ngay ${index + 1}`,
        })),
      },
    },
  });
}

async function createLinkedData(prisma, run, suffix = 'MAIN') {
  const customer = await prisma.customer.create({
    data: {
      code: `${run}-CUS-${suffix}`,
      fullName: `Bookings Service Customer ${suffix}`,
      phone: '090' + String(Date.now()).slice(-7),
      email: `${run.toLowerCase()}-${suffix.toLowerCase()}@smarttour.local`,
      branch: 'BOOK-BR',
      department: 'BOOK-DEP',
    },
  });
  const order = await prisma.order.create({
    data: {
      type: 'FIT_TOUR',
      systemCode: `${run}-ORD-${suffix}`,
      name: `Bookings Service Order ${suffix}`,
      customerId: customer.id,
      branch: 'BOOK-BR',
      department: 'BOOK-DEP',
    },
  });
  const tour = await prisma.tour.create({
    data: {
      type: 'FIT',
      systemCode: `${run}-TOUR-SYS-${suffix}`,
      tourCode: `${run}-TOUR-${suffix}`,
      name: `Bookings Service Tour ${suffix}`,
      orderId: order.id,
      branch: 'BOOK-BR',
      department: 'BOOK-DEP',
    },
  });
  return { customer, order, tour };
}

async function createAllotmentSupplier(prisma, run) {
  const category = await prisma.supplierCategory.create({ data: { name: `${run}-Allotment Supplier Category` } });
  const supplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: `${run}-ALLOT-SUP`,
      name: 'Bookings Service Allotment Supplier',
      status: 'ACTIVE',
    },
  });
  const allotment = await prisma.supplierAllotment.create({
    data: {
      supplierId: supplier.id,
      serviceName: 'Bookings Service Allotment',
      allotmentQty: 5,
      lockedQty: 0,
      bookedQty: 0,
      status: 'ACTIVE',
    },
  });
  return { supplier, allotment };
}

function bookingDto(run, suffix, tourProgram, links, overrides = {}) {
  return {
    code: `${run}-BKG-${suffix}`,
    tourProgramId: tourProgram.id,
    customerId: links.customer.id,
    orderId: links.order.id,
    tourId: links.tour.id,
    customerName: links.customer.fullName,
    customerPhone: links.customer.phone,
    customerEmail: links.customer.email,
    paxCount: 2,
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    saleOwner: 'Sale Test',
    operatorOwner: 'Operator Test',
    totalSellPrice: 5000000,
    ...overrides,
  };
}

async function main() {
  const expectedUpdateFields = [
    'code',
    'tourProgramId',
    'customerId',
    'orderId',
    'tourId',
    'customerName',
    'customerPhone',
    'customerEmail',
    'paxCount',
    'startDate',
    'endDate',
    'saleOwner',
    'operatorOwner',
    'totalSellPrice',
  ];
  assert(
    JSON.stringify(BOOKING_UPDATE_FIELDS) === JSON.stringify(expectedUpdateFields),
    'UpdateBookingDto should only expose the approved booking update fields',
  );
  assert(!BOOKING_UPDATE_FIELDS.includes('status'), 'UpdateBookingDto should not expose status; use UpdateBookingStatusDto');

  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new BookingsService(prisma);
  const run = 'BOOK-SVC-' + Date.now();
  const links = await createLinkedData(prisma, run);
  const tourProgram = await createTourProgram(prisma, run, 'MAIN', 3);

  await rejects(
    () => service.detail('missing-booking-id'),
    'detail should reject missing booking',
    BOOKING_NOT_FOUND_MESSAGES.booking,
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-TP', { id: 'missing-tour-program-id' }, links)),
    'create should reject missing tourProgramId',
    BOOKING_NOT_FOUND_MESSAGES.tourProgram,
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-DATE-RANGE', tourProgram, links, { startDate: '2026-10-03', endDate: '2026-10-01' })),
    'create should reject endDate before startDate',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-DURATION', tourProgram, links, { startDate: '2026-10-01', endDate: '2026-10-02' })),
    'create should reject date range that does not match tour program duration',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-PAX-ZERO', tourProgram, links, { paxCount: 0 })),
    'create should reject paxCount zero',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-PAX-NEGATIVE', tourProgram, links, { paxCount: -2 })),
    'create should reject negative paxCount',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-MONEY', tourProgram, links, { totalSellPrice: -1 })),
    'create should reject negative totalSellPrice',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-CODE-SPACE', tourProgram, links, { code: `${run} BAD CODE` })),
    'create should reject booking code with spaces',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-CODE-ACCENT', tourProgram, links, { code: `${run}-Á` })),
    'create should reject booking code with non-ascii characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-NAME-LONG', tourProgram, links, { customerName: 'x'.repeat(181) })),
    'create should reject customerName longer than 180 characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-PHONE', tourProgram, links, { customerPhone: '123' })),
    'create should reject invalid customerPhone',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-EMAIL', tourProgram, links, { customerEmail: 'bad-email' })),
    'create should reject invalid customerEmail',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-SALE-OWNER-LONG', tourProgram, links, { saleOwner: 'x'.repeat(121) })),
    'create should reject saleOwner longer than 120 characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-OPERATOR-OWNER-LONG', tourProgram, links, { operatorOwner: 'x'.repeat(121) })),
    'create should reject operatorOwner longer than 120 characters',
  );

  const normalized = await service.create(bookingDto(run, 'NORMALIZED', tourProgram, links, {
    code: ` ${run.toLowerCase()}-bkg-normalized `,
    customerName: '  Bookings Service Customer Normalized  ',
    customerPhone: '  +84 912 345 678  ',
    customerEmail: '  CUSTOMER.NORMALIZED@SMARTTOUR.LOCAL  ',
    saleOwner: '  Sale Normalized  ',
    operatorOwner: '  Operator Normalized  ',
    totalSellPrice: undefined,
    startDate: '2026-09-01',
    endDate: '2026-09-03',
  }));
  assert(normalized.code === `${run}-BKG-NORMALIZED`, 'create should trim and uppercase booking code');
  assert(normalized.customerName === 'Bookings Service Customer Normalized', 'create should trim customerName');
  assert(normalized.customerPhone === '+84 912 345 678', 'create should trim customerPhone');
  assert(normalized.customerEmail === 'customer.normalized@smarttour.local', 'create should trim and lowercase customerEmail');
  assert(normalized.saleOwner === 'Sale Normalized' && normalized.operatorOwner === 'Operator Normalized', 'create should trim owner fields');
  assert(amount(normalized.totalSellPrice) === 0, 'create should default missing totalSellPrice to zero');
  await rejects(
    () => service.create(bookingDto(run, 'DUPLICATE-CREATE', tourProgram, links, {
      code: ` ${run.toLowerCase()}-bkg-normalized `,
      startDate: '2026-09-05',
      endDate: '2026-09-07',
    })),
    'create should reject duplicate booking code after normalization',
    BOOKING_CODE_CONFLICT_MESSAGE,
  );

  const created = await service.create(bookingDto(run, '001', tourProgram, links));
  assert(created.code === `${run}-BKG-001`, 'create should persist booking code');
  assert(created.tourProgramId === tourProgram.id && created.tourProgram?.id === tourProgram.id, 'create should link tourProgram');
  assert(created.customerId === links.customer.id && created.orderId === links.order.id && created.tourId === links.tour.id, 'create should persist linked customer/order/tour');
  assert(created.paxCount === 2 && amount(created.totalSellPrice) === 5000000, 'create should persist paxCount and totalSellPrice');
  assert(dateOnly(created.startDate) === '2026-10-01' && dateOnly(created.endDate) === '2026-10-03', 'create should persist startDate/endDate');
  assert(created.operationForm === null, 'create response should include empty operationForm');
  const codeUpdated = await service.update(created.id, { code: ` ${run.toLowerCase()}-bkg-updated ` });
  assert(codeUpdated.code === `${run}-BKG-UPDATED`, 'update should trim and uppercase booking code');
  const duplicateUpdateSource = await service.create(bookingDto(run, 'DUPLICATE-UPDATE', tourProgram, links, {
    startDate: '2026-10-05',
    endDate: '2026-10-07',
  }));
  await rejects(
    () => service.update(duplicateUpdateSource.id, { code: ` ${run.toLowerCase()}-bkg-updated ` }),
    'update should reject duplicate booking code after normalization',
    BOOKING_CODE_CONFLICT_MESSAGE,
  );

  const listed = await service.list(run);
  assert(listed.some((row) => row.id === created.id), 'list should include created booking');
  assert((await service.list('Bookings Service Customer')).some((row) => row.id === created.id), 'list search should match customerName');
  assert((await service.list(links.customer.phone)).some((row) => row.id === created.id), 'list search should match customerPhone');
  assert((await service.list(links.customer.email)).some((row) => row.id === created.id), 'list search should match customerEmail');
  assert((await service.list('Operator Test')).some((row) => row.id === created.id), 'list search should match operatorOwner');
  assert((await service.list(tourProgram.code)).some((row) => row.id === created.id), 'list search should match tourProgram code');
  assert((await service.list('Ha Long')).some((row) => row.id === created.id), 'list search should match tourProgram route');
  assert((await service.list(undefined, 'DRAFT')).some((row) => row.id === created.id), 'list status filter should match DRAFT');
  assert((await service.list(undefined, undefined, tourProgram.id)).some((row) => row.id === created.id), 'list tourProgramId filter should match created booking');
  assert(listed.find((row) => row.id === created.id)?.tourProgram?.durationDays === 3, 'list should include tourProgram fields used by frontend');
  assert(listed.find((row) => row.id === created.id)?.operationForm === null, 'list should include operationForm field used by frontend');
  await rejects(() => service.list(undefined, 'NOT_A_STATUS'), 'list should reject invalid status filter');

  const detail = await service.detail(created.id);
  assert(detail.id === created.id, 'detail should load booking');
  assert(detail.tourProgram?.durationDays === 3 && detail.tourProgram.itineraryDays.length === 3, 'detail should include tourProgram and itinerary');
  assert(Array.isArray(detail.operationVouchers) && Array.isArray(detail.allotmentLocks), 'detail should include operation dependencies');

  const updated = await service.update(created.id, {
    customerName: 'Bookings Service Customer Updated',
    paxCount: 4,
    startDate: '2026-10-02',
    endDate: '2026-10-04',
    totalSellPrice: 7000000,
    operatorOwner: 'Operator Updated',
  });
  assert(updated.customerName === 'Bookings Service Customer Updated', 'update should persist customerName');
  assert(updated.paxCount === 4 && amount(updated.totalSellPrice) === 7000000, 'update should persist paxCount and totalSellPrice');
  assert(dateOnly(updated.startDate) === '2026-10-02' && dateOnly(updated.endDate) === '2026-10-04', 'update should persist valid date range');
  await rejects(
    () => service.update(created.id, { startDate: '2026-10-02', endDate: '2026-10-03' }),
    'update should reject duration mismatch',
  );
  await rejects(
    () => service.update(created.id, { startDate: '2026-10-06', endDate: '2026-10-04' }),
    'update should reject endDate before startDate',
  );
  await rejects(() => service.update(created.id, { paxCount: 0 }), 'update should reject paxCount zero');
  await rejects(() => service.update(created.id, { totalSellPrice: -1 }), 'update should reject negative totalSellPrice');
  await rejects(
    () => service.update(created.id, { tourProgramId: 'missing-tour-program-id' }),
    'update should reject missing tourProgramId',
    BOOKING_NOT_FOUND_MESSAGES.tourProgram,
  );
  await rejects(
    () => service.update(created.id, { customerId: 'missing-customer-id' }),
    'update should reject missing customerId',
    BOOKING_NOT_FOUND_MESSAGES.customer,
  );
  await rejects(
    () => service.update(created.id, { orderId: 'missing-order-id' }),
    'update should reject missing orderId',
    BOOKING_NOT_FOUND_MESSAGES.order,
  );
  await rejects(
    () => service.update(created.id, { tourId: 'missing-tour-id' }),
    'update should reject missing tourId',
    BOOKING_NOT_FOUND_MESSAGES.tour,
  );
  await rejects(() => service.update(created.id, { startDate: '2026-10-06' }), 'update should reject startDate after current endDate');
  await rejects(() => service.update(created.id, { endDate: '2026-10-01' }), 'update should reject endDate before current startDate');
  await rejects(() => service.update(created.id, { status: 'CANCELLED' }), 'general update should reject status changes');

  const confirmed = await service.updateStatus(created.id, 'confirmed');
  assert(confirmed.status === 'CONFIRMED', 'updateStatus should move DRAFT to CONFIRMED');
  await rejects(() => service.updateStatus(created.id, 'DRAFT'), 'updateStatus should reject invalid backward transition');
  await rejects(() => service.updateStatus(created.id, 'OPERATING'), 'updateStatus should reject OPERATING before operationForm exists');

  const deletable = await service.create(bookingDto(run, 'DELETE', tourProgram, links, {
    orderId: undefined,
    tourId: undefined,
    startDate: '2026-11-01',
    endDate: '2026-11-03',
  }));
  await service.remove(deletable.id);
  await rejects(() => service.detail(deletable.id), 'delete should remove booking without important dependencies');

  const linkedDeletable = await service.create(bookingDto(run, 'DELETE-LINKED', tourProgram, links, {
    startDate: '2026-11-05',
    endDate: '2026-11-07',
  }));
  await service.remove(linkedDeletable.id);
  await rejects(() => service.detail(linkedDeletable.id), 'delete should allow linked booking when no operation data exists');

  const voucherLockedBooking = await service.create(bookingDto(run, 'DELETE-VOUCHER', tourProgram, links, {
    startDate: '2026-11-09',
    endDate: '2026-11-11',
  }));
  await prisma.operationVoucher.create({
    data: {
      voucherCode: `${run}-VCH-DELETE`,
      bookingId: voucherLockedBooking.id,
      serviceType: 'HOTEL',
      serviceName: 'Bookings Service Voucher Lock',
      serviceDate: new Date('2026-11-10'),
      totalAmount: 1000,
      remainAmount: 1000,
      status: 'PENDING',
    },
  });
  const voucherLockedDetail = await service.detail(voucherLockedBooking.id);
  assert(voucherLockedDetail.operationVouchers.length === 1, 'detail should expose operation voucher dependencies');
  await rejects(() => service.remove(voucherLockedBooking.id), 'delete should reject booking with operationVouchers');

  const allotmentLockedBooking = await service.create(bookingDto(run, 'DELETE-ALLOTMENT', tourProgram, links, {
    startDate: '2026-11-13',
    endDate: '2026-11-15',
  }));
  const { supplier: allotmentSupplier, allotment } = await createAllotmentSupplier(prisma, run);
  await prisma.supplierAllotmentAllocation.create({
    data: {
      allotmentId: allotment.id,
      supplierId: allotmentSupplier.id,
      bookingId: allotmentLockedBooking.id,
      quantity: 1,
      status: 'LOCKED',
      lockedAt: new Date('2026-11-01'),
    },
  });
  const allotmentLockedDetail = await service.detail(allotmentLockedBooking.id);
  assert(allotmentLockedDetail.allotmentLocks.length === 1, 'detail should expose allotment lock dependencies');
  await rejects(() => service.remove(allotmentLockedBooking.id), 'delete should reject booking with allotmentLocks');

  const operationForm = await prisma.operationForm.create({
    data: {
      bookingId: created.id,
      orderId: links.order.id,
      tourId: links.tour.id,
      status: 'PENDING',
      notes: run + '-operation-form',
    },
  });
  const afterOperationForm = await service.detail(created.id);
  assert(afterOperationForm.operationForm?.id === operationForm.id, 'detail should include operationForm after it is created');
  assert((await service.list(run)).find((row) => row.id === created.id)?.operationForm?.id === operationForm.id, 'list should include operationForm after it is created');
  await rejects(() => service.update(created.id, { customerName: 'Blocked customer edit' }), 'update should reject customerName change after operationForm exists');
  await rejects(() => service.update(created.id, { paxCount: 5 }), 'update should reject paxCount change after operationForm exists');
  await rejects(() => service.update(created.id, { startDate: '2026-10-03', endDate: '2026-10-05' }), 'update should reject date change after operationForm exists');
  await rejects(() => service.update(created.id, { totalSellPrice: 9000000 }), 'update should reject totalSellPrice change after operationForm exists');
  await rejects(() => service.remove(created.id), 'delete should reject booking with operationForm');

  const operating = await service.updateStatus(created.id, 'OPERATING');
  assert(operating.status === 'OPERATING', 'updateStatus should allow CONFIRMED to OPERATING after operationForm exists');
  const completed = await service.updateStatus(created.id, 'COMPLETED');
  assert(completed.status === 'COMPLETED', 'updateStatus should allow OPERATING to COMPLETED');
  await rejects(() => service.updateStatus(created.id, 'CANCELLED'), 'updateStatus should reject changing final COMPLETED status');

  const cancelledFormBooking = await service.create(bookingDto(run, 'CANCELLED-FORM', tourProgram, links, {
    startDate: '2026-12-01',
    endDate: '2026-12-03',
  }));
  await service.updateStatus(cancelledFormBooking.id, 'CONFIRMED');
  await prisma.operationForm.create({
    data: {
      bookingId: cancelledFormBooking.id,
      orderId: links.order.id,
      tourId: links.tour.id,
      status: 'CANCELLED',
      notes: run + '-cancelled-operation-form',
    },
  });
  await rejects(
    () => service.updateStatus(cancelledFormBooking.id, 'OPERATING'),
    'updateStatus should reject OPERATING when operationForm is cancelled',
  );

  await prisma.$disconnect();
  console.log('TEST_BOOKINGS_SERVICE_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
