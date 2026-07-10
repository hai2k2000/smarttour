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
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const {
  BOOKING_CODE_CONFLICT_MESSAGE,
  BOOKING_NOT_FOUND_MESSAGES,
  bookingNotFoundMessage,
} = require('./apps/api/dist/modules/bookings/booking-errors');
const {
  BOOKING_CODE_MAX_LENGTH,
  BOOKING_CODE_MIN_LENGTH,
  BOOKING_CORE_FIELDS,
  BOOKING_CREATE_FIELDS,
  BOOKING_CROSS_REFERENCE_FIELDS,
  BOOKING_DEFAULT_TOTAL_SELL_PRICE,
  CreateBookingDto,
} = require('./apps/api/dist/modules/bookings/dto/create-booking.dto');
const {
  ListBookingsQueryDto,
} = require('./apps/api/dist/modules/bookings/dto/list-bookings-query.dto');
const {
  BOOKING_CLEARABLE_UPDATE_FIELDS,
  BOOKING_NON_NULLABLE_UPDATE_FIELDS,
  BOOKING_OPERATIONAL_EDITABLE_FIELDS,
  BOOKING_OPERATIONAL_LOCKED_FIELDS,
  BOOKING_UPDATE_FIELDS,
  UpdateBookingDto,
  UpdateBookingStatusDto,
} = require('./apps/api/dist/modules/bookings/dto/update-booking.dto');

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

function sortedKeys(value) {
  return Object.keys(value || {}).sort();
}

function scopedUser(scope, branch = null, department = null) {
  const permissions = Array.isArray(scope) ? scope : [scope];
  return {
    id: 'booking-scope-user',
    branch,
    department,
    roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

async function validationMessages(DtoClass, payload) {
  const errors = await validate(plainToInstance(DtoClass, payload));
  return errors.flatMap((error) => Object.values(error.constraints || {}));
}

async function assertValidationMessage(DtoClass, payload, expectedMessage, label) {
  const messages = await validationMessages(DtoClass, payload);
  assert(messages.includes(expectedMessage), `${label}: expected "${expectedMessage}", got "${messages.join('; ')}"`);
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

async function createLinkedData(prisma, run, suffix = 'MAIN', branch = 'BOOK-BR', department = 'BOOK-DEP') {
  const customer = await prisma.customer.create({
    data: {
      code: `${run}-CUS-${suffix}`,
      fullName: `Bookings Service Customer ${suffix}`,
      phone: '090' + String(Date.now()).slice(-7),
      email: `${run.toLowerCase()}-${suffix.toLowerCase()}@smarttour.local`,
      branch,
      department,
    },
  });
  const order = await prisma.order.create({
    data: {
      type: 'FIT_TOUR',
      systemCode: `${run}-ORD-${suffix}`,
      name: `Bookings Service Order ${suffix}`,
      customerId: customer.id,
      branch,
      department,
    },
  });
  const tour = await prisma.tour.create({
    data: {
      type: 'FIT',
      systemCode: `${run}-TOUR-SYS-${suffix}`,
      tourCode: `${run}-TOUR-${suffix}`,
      name: `Bookings Service Tour ${suffix}`,
      orderId: order.id,
      branch,
      department,
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
  const expectedCoreFields = [
    'code',
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
  const expectedCrossReferenceFields = [
    'tourProgramId',
    'customerId',
    'orderId',
    'tourId',
  ];
  const expectedCreateFields = [
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
    JSON.stringify(BOOKING_CORE_FIELDS) === JSON.stringify(expectedCoreFields),
    'CreateBookingDto should declare booking-core fields separately',
  );
  assert(
    JSON.stringify(BOOKING_CROSS_REFERENCE_FIELDS) === JSON.stringify(expectedCrossReferenceFields),
    'CreateBookingDto should declare cross-reference fields separately',
  );
  assert(
    JSON.stringify(BOOKING_CREATE_FIELDS) === JSON.stringify(expectedCreateFields),
    'CreateBookingDto should expose the approved create field order',
  );
  assert(
    JSON.stringify(BOOKING_UPDATE_FIELDS) === JSON.stringify(expectedCreateFields),
    'UpdateBookingDto should only expose the approved booking update fields',
  );
  assert(
    JSON.stringify([...BOOKING_NON_NULLABLE_UPDATE_FIELDS, ...BOOKING_CLEARABLE_UPDATE_FIELDS].sort()) ===
      JSON.stringify([...expectedCreateFields].sort()),
    'booking update nullability groups should cover every approved update field',
  );
  assert(
    JSON.stringify(BOOKING_OPERATIONAL_EDITABLE_FIELDS) === JSON.stringify(['saleOwner', 'operatorOwner']),
    'owner assignments stay classified as editable for non-form operational dependencies',
  );
  assert(
    JSON.stringify([...BOOKING_OPERATIONAL_LOCKED_FIELDS, ...BOOKING_OPERATIONAL_EDITABLE_FIELDS].sort()) ===
      JSON.stringify([...expectedCreateFields].sort()),
    'operational edit policy should classify every approved update field',
  );
  const groupedFields = new Set([...BOOKING_CORE_FIELDS, ...BOOKING_CROSS_REFERENCE_FIELDS]);
  assert(groupedFields.size === BOOKING_CORE_FIELDS.length + BOOKING_CROSS_REFERENCE_FIELDS.length, 'booking field groups should not overlap');
  assert(BOOKING_CREATE_FIELDS.every((field) => groupedFields.has(field)), 'all create fields should be classified as core or cross-reference');
  assert(groupedFields.size === BOOKING_CREATE_FIELDS.length, 'field groups should cover every create field');
  assert(!BOOKING_UPDATE_FIELDS.includes('status'), 'UpdateBookingDto should not expose status; use UpdateBookingStatusDto');
  assert(!BOOKING_UPDATE_FIELDS.includes('operationForm'), 'UpdateBookingDto should not expose operationForm');
  assert(!BOOKING_UPDATE_FIELDS.includes('operationFormId'), 'UpdateBookingDto should not expose operationFormId');
  assert(BOOKING_CODE_CONFLICT_MESSAGE === 'Mã booking đã tồn tại', 'booking code conflict message should be Vietnamese');
  assert(BOOKING_CODE_MIN_LENGTH === 2 && BOOKING_CODE_MAX_LENGTH === 64, 'booking code length contract should remain 2-64 characters');
  assert(BOOKING_DEFAULT_TOTAL_SELL_PRICE === 0, 'draft booking price should default to zero');
  assert(
    JSON.stringify(sortedKeys(BOOKING_NOT_FOUND_MESSAGES)) === JSON.stringify(['booking', 'customer', 'order', 'tour', 'tourProgram']),
    'booking not-found message map should cover only reviewed linked entities',
  );
  assert(BOOKING_NOT_FOUND_MESSAGES.booking === 'Không tìm thấy booking', 'booking not-found message should use sentence case');
  assert(
    BOOKING_NOT_FOUND_MESSAGES.tourProgram === 'Không tìm thấy chương trình tour',
    'tour program not-found message should be Vietnamese',
  );
  assert(BOOKING_NOT_FOUND_MESSAGES.customer === 'Không tìm thấy khách hàng', 'customer not-found message should be Vietnamese');
  assert(BOOKING_NOT_FOUND_MESSAGES.order === 'Không tìm thấy đơn hàng', 'order not-found message should use sentence case');
  assert(BOOKING_NOT_FOUND_MESSAGES.tour === 'Không tìm thấy tour', 'tour not-found message should be Vietnamese');
  for (const entity of sortedKeys(BOOKING_NOT_FOUND_MESSAGES)) {
    assert(bookingNotFoundMessage(entity) === BOOKING_NOT_FOUND_MESSAGES[entity], 'bookingNotFoundMessage should return canonical message for ' + entity);
  }

  const validDtoPayload = {
    code: 'BK-DTO-VALID',
    tourProgramId: 'tour-program-id',
    customerName: 'Khách hàng DTO',
    paxCount: 2,
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    totalSellPrice: 1000,
  };
  assert((await validationMessages(CreateBookingDto, validDtoPayload)).length === 0, 'CreateBookingDto should accept a valid payload');
  assert(
    (await validationMessages(CreateBookingDto, { ...validDtoPayload, totalSellPrice: undefined })).length === 0,
    'CreateBookingDto should allow draft booking without totalSellPrice',
  );
  const normalizedDto = plainToInstance(CreateBookingDto, {
    ...validDtoPayload,
    code: '  bk-dto-normalized  ',
    customerName: '  Khách hàng DTO  ',
    customerEmail: '  CUSTOMER@EXAMPLE.COM  ',
  });
  assert(normalizedDto.code === 'BK-DTO-NORMALIZED', 'CreateBookingDto should trim and uppercase booking code');
  assert(normalizedDto.customerName === 'Khách hàng DTO', 'CreateBookingDto should trim customer name');
  assert(normalizedDto.customerEmail === 'customer@example.com', 'CreateBookingDto should trim and lowercase customer email');
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, code: 'MÃ BOOKING' },
    'Mã booking chỉ được dùng chữ cái không dấu, số, dấu gạch ngang hoặc gạch dưới, không có khoảng trắng',
    'CreateBookingDto should localize booking code validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, tourProgramId: '' },
    'Tour mẫu không được để trống',
    'CreateBookingDto should localize tour program validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, customerName: 'Khách <xấu>' },
    'Tên khách/đoàn không được chứa ký tự điều khiển hoặc dấu < >',
    'CreateBookingDto should localize customer name validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, customerPhone: '------' },
    'Điện thoại khách phải có 6-15 chữ số và chỉ được dùng số, khoảng trắng, + ( ) . -',
    'CreateBookingDto should localize customer phone validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, customerEmail: 'email-khong-hop-le' },
    'Email khách không hợp lệ',
    'CreateBookingDto should localize customer email validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, paxCount: 2.5 },
    'Số khách phải là số nguyên',
    'CreateBookingDto should reject fractional pax',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, paxCount: 0 },
    'Số khách phải lớn hơn 0',
    'CreateBookingDto should localize pax validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, startDate: '2026-10-01T00:00:00Z' },
    'Ngày khởi hành phải có định dạng YYYY-MM-DD',
    'CreateBookingDto should enforce date-only startDate',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, endDate: '03/10/2026' },
    'Ngày kết thúc phải có định dạng YYYY-MM-DD',
    'CreateBookingDto should enforce date-only endDate',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, saleOwner: 'S' },
    'Sale phụ trách phải có ít nhất 2 ký tự',
    'CreateBookingDto should localize sale owner validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, operatorOwner: 'O' },
    'Điều hành phụ trách phải có ít nhất 2 ký tự',
    'CreateBookingDto should localize operator owner validation',
  );
  await assertValidationMessage(
    CreateBookingDto,
    { ...validDtoPayload, totalSellPrice: 'không-phải-số' },
    'Giá bán tổng phải là số hợp lệ',
    'CreateBookingDto should localize total sell price validation',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { paxCount: null },
    'Số khách phải là số nguyên',
    'UpdateBookingDto should reject null for non-nullable paxCount',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { totalSellPrice: null },
    'Giá bán tổng phải là số hợp lệ',
    'UpdateBookingDto should reject null for non-nullable totalSellPrice',
  );
  assert(
    (await validationMessages(UpdateBookingDto, {
      customerId: null,
      orderId: null,
      tourId: null,
      customerPhone: null,
      customerEmail: null,
      saleOwner: null,
      operatorOwner: null,
    })).length === 0,
    'UpdateBookingDto should allow clearing nullable links, contacts, and owners',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { endDate: '2026/10/03' },
    'Ngày kết thúc phải có định dạng YYYY-MM-DD',
    'UpdateBookingDto should inherit localized date-only validation',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { customerName: 'Khách <xấu>' },
    'Tên khách/đoàn không được chứa ký tự điều khiển hoặc dấu < >',
    'UpdateBookingDto should keep customerName text validation tight',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { customerPhone: '------' },
    'Điện thoại khách phải có 6-15 chữ số và chỉ được dùng số, khoảng trắng, + ( ) . -',
    'UpdateBookingDto should keep customerPhone validation tight',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { customerEmail: 'email-khong-hop-le' },
    'Email khách không hợp lệ',
    'UpdateBookingDto should keep customerEmail validation tight',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { saleOwner: '<Sale>' },
    'Sale phụ trách không được chứa ký tự điều khiển hoặc dấu < >',
    'UpdateBookingDto should keep saleOwner text validation tight',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { operatorOwner: 'O' },
    'Điều hành phụ trách phải có ít nhất 2 ký tự',
    'UpdateBookingDto should keep operatorOwner length validation tight',
  );
  const normalizedStatusDto = plainToInstance(UpdateBookingStatusDto, { status: ' confirmed ' });
  assert(normalizedStatusDto.status === 'CONFIRMED', 'UpdateBookingStatusDto should trim and uppercase status only for status endpoint');
  assert(JSON.stringify(sortedKeys(normalizedStatusDto)) === JSON.stringify(['status']), 'UpdateBookingStatusDto should only expose status');
  await assertValidationMessage(
    UpdateBookingStatusDto,
    { status: 'UNKNOWN' },
    'Trạng thái booking không hợp lệ',
    'UpdateBookingStatusDto should localize enum validation',
  );
  await assertValidationMessage(
    UpdateBookingDto,
    { status: 'CANCELLED' },
    'Dùng PATCH /api/bookings/:id/status để cập nhật trạng thái booking',
    'UpdateBookingDto should reject status changes through the general update contract',
  );
  const normalizedListQuery = plainToInstance(ListBookingsQueryDto, {
    search: '  booking dto  ',
    status: ' draft ',
    tourProgramId: '  tour-program-id  ',
    take: '50',
    skip: '10',
  });
  assert(
    normalizedListQuery.search === 'booking dto' &&
      normalizedListQuery.status === 'DRAFT' &&
      normalizedListQuery.tourProgramId === 'tour-program-id' &&
      normalizedListQuery.take === 50 &&
      normalizedListQuery.skip === 10,
    'ListBookingsQueryDto should normalize search, filters, and paging',
  );
  assert((await validationMessages(ListBookingsQueryDto, normalizedListQuery)).length === 0, 'ListBookingsQueryDto should accept normalized query values');
  await assertValidationMessage(
    ListBookingsQueryDto,
    { take: '501' },
    'Số booking mỗi trang không được vượt quá 500',
    'ListBookingsQueryDto should localize paging validation',
  );

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
    () => service.create(bookingDto(run, 'EMPTY-TP', { id: '' }, links)),
    'create should reject empty tourProgramId',
    'Tour mẫu không được để trống',
  );
  const incompleteTourProgram = await prisma.tourProgram.create({
    data: {
      code: `${run}-TP-INCOMPLETE`,
      name: 'Bookings Service Incomplete Tour Program',
      route: 'Ha Noi - Ha Long',
      durationDays: 3,
      itineraryDays: { create: [{ dayNumber: 1, title: 'Ngay 1' }] },
    },
  });
  await rejects(
    () => service.create(bookingDto(run, 'BAD-ITINERARY', incompleteTourProgram, links)),
    'create should reject tourProgram without a complete itinerary',
    'Tour mẫu chưa đủ lịch trình: thiếu ngày 2, 3',
  );
  await rejects(
    () => service.create({ ...bookingDto(run, 'BAD-CROSS-ENTITY', tourProgram, links), customer: { id: links.customer.id }, operationFormId: 'not-a-booking-field' }),
    'create should reject cross-entity payload fields',
    'Trường không thuộc dữ liệu booking được phép tạo: customer, operationFormId',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-DATE-RANGE', tourProgram, links, { startDate: '2026-10-03', endDate: '2026-10-01' })),
    'create should reject endDate before startDate',
    'Ngày khởi hành phải trước hoặc bằng ngày kết thúc',
  );
  await rejects(
    () => service.create(bookingDto(run, 'EMPTY-START-DATE', tourProgram, links, { startDate: '' })),
    'create should reject empty startDate',
    'Ngày khởi hành không được để trống',
  );
  await rejects(
    () => service.create(bookingDto(run, 'NULL-END-DATE', tourProgram, links, { endDate: null })),
    'create should reject null endDate',
    'Ngày kết thúc không được để trống',
  );
  await rejects(
    () => service.create(bookingDto(run, 'DATETIME-START-DATE', tourProgram, links, { startDate: '2026-10-01T00:00:00Z' })),
    'create should reject datetime startDate',
    'Ngày khởi hành phải có định dạng YYYY-MM-DD',
  );
  await rejects(
    () => service.create(bookingDto(run, 'INVALID-END-DATE', tourProgram, links, { endDate: '2026-02-30' })),
    'create should reject a non-existent calendar date',
    'Ngày kết thúc không hợp lệ',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-DURATION', tourProgram, links, { startDate: '2026-10-01', endDate: '2026-10-02' })),
    'create should reject date range that does not match tour program duration',
    'Khoảng ngày booking phải đúng 3 ngày theo tour mẫu, hiện đang là 2 ngày',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-PAX-ZERO', tourProgram, links, { paxCount: 0 })),
    'create should reject paxCount zero',
    'Số khách phải là số nguyên lớn hơn 0',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-PAX-NEGATIVE', tourProgram, links, { paxCount: -2 })),
    'create should reject negative paxCount',
    'Số khách phải là số nguyên lớn hơn 0',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-MONEY', tourProgram, links, { totalSellPrice: -1 })),
    'create should reject negative totalSellPrice',
    'Giá bán tổng không được âm',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-MONEY-TEXT', tourProgram, links, { totalSellPrice: 'khong-phai-so' })),
    'create should reject non-numeric totalSellPrice',
    'Giá bán tổng phải là số hợp lệ',
  );
  const independentPrice = await service.create(bookingDto(run, 'INDEPENDENT-PRICE', tourProgram, links, {
    totalSellPrice: 1234567,
    startDate: '2026-09-09',
    endDate: '2026-09-11',
  }));
  assert(
    amount(independentPrice.totalSellPrice) === 1234567,
    'booking totalSellPrice should remain an independent booking snapshot because tourProgram has no canonical pricing field',
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
    () => service.create(bookingDto(run, 'BAD-NAME-SHORT', tourProgram, links, { customerName: 'A' })),
    'create should reject customerName shorter than 2 characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-NAME-UNSAFE', tourProgram, links, { customerName: 'Khach <script>' })),
    'create should reject unsafe customerName characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-PHONE', tourProgram, links, { customerPhone: '123' })),
    'create should reject invalid customerPhone',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-PHONE-NO-DIGITS', tourProgram, links, { customerPhone: '------' })),
    'create should reject customerPhone without enough digits',
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
    () => service.create(bookingDto(run, 'BAD-SALE-OWNER-SHORT', tourProgram, links, { saleOwner: 'S' })),
    'create should reject saleOwner shorter than 2 characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-SALE-OWNER-UNSAFE', tourProgram, links, { saleOwner: '<Sale>' })),
    'create should reject unsafe saleOwner characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-OPERATOR-OWNER-LONG', tourProgram, links, { operatorOwner: 'x'.repeat(121) })),
    'create should reject operatorOwner longer than 120 characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-OPERATOR-OWNER-SHORT', tourProgram, links, { operatorOwner: 'O' })),
    'create should reject operatorOwner shorter than 2 characters',
  );
  await rejects(
    () => service.create(bookingDto(run, 'BAD-OPERATOR-OWNER-UNSAFE', tourProgram, links, { operatorOwner: '<Operator>' })),
    'create should reject unsafe operatorOwner characters',
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
  const replacementTourProgram = await createTourProgram(prisma, run, 'REPLACEMENT', 3);
  const relinkBooking = await service.create(bookingDto(run, 'RELINK', tourProgram, links, {
    startDate: '2026-10-12',
    endDate: '2026-10-14',
  }));
  const relinked = await service.update(relinkBooking.id, { tourProgramId: replacementTourProgram.id });
  assert(
    relinked.tourProgramId === replacementTourProgram.id && relinked.tourProgram?.id === replacementTourProgram.id,
    'update should relink booking to a valid tourProgram with matching duration',
  );

  const listed = await service.list(run);
  assert(listed.some((row) => row.id === created.id), 'list should include created booking');
  assert((await service.list('Bookings Service Customer')).some((row) => row.id === created.id), 'list search should match customerName');
  assert((await service.list('  bookings   service   customer  ')).some((row) => row.id === created.id), 'list search should trim, collapse spaces, and match case-insensitively');
  assert((await service.list(links.customer.phone)).some((row) => row.id === created.id), 'list search should match customerPhone');
  assert((await service.list(links.customer.email)).some((row) => row.id === created.id), 'list search should match customerEmail');
  assert((await service.list('Operator Test')).some((row) => row.id === created.id), 'list search should match operatorOwner');
  assert((await service.list(tourProgram.code)).some((row) => row.id === created.id), 'list search should match tourProgram code');
  assert((await service.list('Ha Long')).some((row) => row.id === created.id), 'list search should match tourProgram route');
  assert((await service.list('x', undefined, undefined, undefined, 500)).some((row) => row.id === created.id), 'one-character list search should skip expensive contains filters');
  assert((await service.list(undefined, 'DRAFT')).some((row) => row.id === created.id), 'list status filter should match DRAFT');
  assert((await service.list(undefined, undefined, tourProgram.id)).some((row) => row.id === created.id), 'list tourProgramId filter should match created booking');
  assert((await service.list(undefined, undefined, replacementTourProgram.id)).some((row) => row.id === relinked.id), 'list tourProgramId filter should match relinked booking');
  const firstListedPage = await service.list(run, undefined, undefined, undefined, 1, 0);
  const secondListedPage = await service.list(run, undefined, undefined, undefined, 1, 1);
  assert(firstListedPage.length === 1 && secondListedPage.length === 1, 'list should honor take and skip paging');
  assert(firstListedPage[0].id !== secondListedPage[0].id, 'list paging should advance to a different booking row');
  const listedCreated = listed.find((row) => row.id === created.id);
  assert(listedCreated?.tourProgram?.code === tourProgram.code, 'list should include tourProgram summary used by frontend');
  assert(
    JSON.stringify(sortedKeys(listedCreated)) === JSON.stringify([
      'code',
      'customerName',
      'endDate',
      'id',
      'operationForm',
      'operatorOwner',
      'paxCount',
      'saleOwner',
      'startDate',
      'status',
      'totalSellPrice',
      'tourProgram',
    ]),
    'list response shape should remain a stable frontend summary',
  );
  assert(
    JSON.stringify(sortedKeys(listedCreated.tourProgram)) === JSON.stringify(['code', 'id', 'name']),
    'list tourProgram response should remain summary-only',
  );
  assert(!('customerId' in listedCreated) && !('customerPhone' in listedCreated) && !('createdAt' in listedCreated), 'list should omit booking detail-only fields');
  assert(!('durationDays' in listedCreated.tourProgram) && !('itineraryDays' in listedCreated.tourProgram), 'list should omit tour program detail fields');
  assert(listed.find((row) => row.id === created.id)?.operationForm === null, 'list should include operationForm field used by frontend');
  await rejects(() => service.list(undefined, 'NOT_A_STATUS'), 'list should reject invalid status filter');
  await rejects(() => service.list(undefined, undefined, undefined, undefined, 0), 'list should reject take below one');
  await rejects(() => service.list(undefined, undefined, undefined, undefined, 501), 'list should reject take above maximum');
  await rejects(() => service.list(undefined, undefined, undefined, undefined, 10, -1), 'list should reject negative skip');

  const otherScopeLinks = await createLinkedData(prisma, run, 'OTHER-SCOPE', 'OTHER-BR', 'OTHER-DEP');
  const otherScopeBooking = await service.create(bookingDto(run, 'OTHER-SCOPE', tourProgram, otherScopeLinks, { startDate: '2026-10-08', endDate: '2026-10-10' }));
  const branchUser = scopedUser('data.scope.branch', 'BOOK-BR');
  const departmentUser = scopedUser('data.scope.department', null, 'BOOK-DEP');
  const branchDepartmentUser = scopedUser(['data.scope.branch', 'data.scope.department'], 'BOOK-BR', 'BOOK-DEP');
  const mismatchedScopeUser = scopedUser(['data.scope.branch', 'data.scope.department'], 'BOOK-BR', 'OTHER-DEP');
  assert((await service.list(run, undefined, undefined, branchUser, 500)).some((row) => row.id === created.id), 'branch scoped list should include in-scope booking');
  assert((await service.list(run, undefined, undefined, branchUser, 500)).every((row) => row.id !== otherScopeBooking.id), 'branch scoped list should hide out-of-scope booking');
  assert((await service.list(run, undefined, undefined, departmentUser, 500)).some((row) => row.id === created.id), 'department scoped list should include in-scope booking');
  assert((await service.list(run, undefined, undefined, branchDepartmentUser, 500)).some((row) => row.id === created.id), 'branch and department scoped list should include matching booking');
  assert((await service.list(run, undefined, undefined, mismatchedScopeUser, 500)).every((row) => row.id !== created.id), 'branch and department scoped list should require both dimensions');
  await rejects(() => service.detail(otherScopeBooking.id, branchUser), 'branch scoped detail should reject out-of-scope booking', BOOKING_NOT_FOUND_MESSAGES.booking);
  await rejects(() => service.detail(created.id, mismatchedScopeUser), 'mismatched branch and department detail should reject booking', BOOKING_NOT_FOUND_MESSAGES.booking);

  const detail = await service.detail(created.id);
  assert(detail.id === created.id, 'detail should load booking');
  assert(
    JSON.stringify(sortedKeys(detail)) === JSON.stringify([
      'allotmentLocks',
      'code',
      'createdAt',
      'customer',
      'customerEmail',
      'customerId',
      'customerName',
      'customerPhone',
      'endDate',
      'id',
      'operationForm',
      'operationVouchers',
      'operatorOwner',
      'order',
      'orderId',
      'paxCount',
      'saleOwner',
      'startDate',
      'status',
      'totalSellPrice',
      'tour',
      'tourId',
      'tourProgram',
      'tourProgramId',
      'updatedAt',
    ]),
    'detail response shape should remain stable for API consumers',
  );
  assert(detail.tourProgram?.durationDays === 3 && detail.tourProgram.itineraryDays.length === 3, 'detail should include tourProgram and itinerary');
  assert(Array.isArray(detail.operationVouchers) && Array.isArray(detail.allotmentLocks), 'detail should include operation dependencies');
  assert(!detail.operationForm || (!('tasks' in detail.operationForm) && !('services' in detail.operationForm) && !('costs' in detail.operationForm)), 'detail should not include operation form child arrays');
  const initialDeleteGuard = await service.deleteGuard(created.id);
  assert(initialDeleteGuard.canDelete && initialDeleteGuard.operationForms === 0 && initialDeleteGuard.operationVouchers === 0 && initialDeleteGuard.allotmentLocks === 0, 'delete guard should return lightweight zero dependency counts');

  const beforeEmptyUpdate = await service.detail(created.id);
  const emptyUpdated = await service.update(created.id, {});
  assert(
    emptyUpdated.code === beforeEmptyUpdate.code &&
      emptyUpdated.customerName === beforeEmptyUpdate.customerName &&
      emptyUpdated.paxCount === beforeEmptyUpdate.paxCount &&
      amount(emptyUpdated.totalSellPrice) === amount(beforeEmptyUpdate.totalSellPrice),
    'empty partial update should preserve existing booking data',
  );
  await rejects(
    () => service.update(created.id, { paxCount: null }),
    'direct service update should reject null paxCount',
    'Số khách không được là null',
  );
  await rejects(
    () => service.update(created.id, { totalSellPrice: null }),
    'direct service update should reject null totalSellPrice',
    'Giá bán tổng không được là null',
  );

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
  await rejects(
    () => service.update(created.id, { startDate: '' }),
    'update should reject empty startDate instead of falling back to the current value',
    'Ngày khởi hành không được để trống',
  );
  await rejects(
    () => service.update(created.id, { endDate: null }),
    'update should reject null endDate instead of falling back to the current value',
    'Ngày kết thúc không được là null',
  );
  await rejects(
    () => service.update(created.id, { startDate: '2026/10/02' }),
    'update should reject non-ISO date-only format',
    'Ngày khởi hành phải có định dạng YYYY-MM-DD',
  );
  await rejects(
    () => service.update(created.id, { paxCount: 0 }),
    'update should reject paxCount zero',
    'Số khách phải là số nguyên lớn hơn 0',
  );
  await rejects(
    () => service.update(created.id, { paxCount: -1 }),
    'update should reject negative paxCount',
    'Số khách phải là số nguyên lớn hơn 0',
  );
  await rejects(
    () => service.update(created.id, { totalSellPrice: -1 }),
    'update should reject negative totalSellPrice',
    'Giá bán tổng không được âm',
  );
  await rejects(
    () => service.update(created.id, { totalSellPrice: 'khong-phai-so' }),
    'update should reject non-numeric totalSellPrice',
    'Giá bán tổng phải là số hợp lệ',
  );
  await rejects(() => service.update(created.id, { customerName: 'B' }), 'update should reject customerName shorter than 2 characters');
  await rejects(() => service.update(created.id, { customerName: 'Khach <bad>' }), 'update should reject unsafe customerName characters');
  await rejects(() => service.update(created.id, { customerPhone: '------' }), 'update should reject customerPhone without enough digits');
  await rejects(() => service.update(created.id, { customerEmail: 'bad <bad>@smarttour.local' }), 'update should reject unsafe customerEmail');
  await rejects(() => service.update(created.id, { saleOwner: 'S' }), 'update should reject saleOwner shorter than 2 characters');
  await rejects(() => service.update(created.id, { operatorOwner: '<Operator>' }), 'update should reject unsafe operatorOwner characters');
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
  await rejects(
    () => service.update(created.id, { operationForm: { id: 'not-a-booking-field' }, tour: { id: links.tour.id } }),
    'update should reject cross-entity payload fields',
    'Trường không thuộc dữ liệu booking được phép cập nhật: operationForm, tour',
  );

  const oneDayTourProgram = await createTourProgram(prisma, run, 'ONE-DAY', 1);
  const oneDayBooking = await service.create(
    bookingDto(run, 'ONE-DAY', oneDayTourProgram, links, {
      startDate: '2026-10-20',
      endDate: '2026-10-20',
    }),
  );
  assert(
    dateOnly(oneDayBooking.startDate) === '2026-10-20' && dateOnly(oneDayBooking.endDate) === '2026-10-20',
    'create should allow equal startDate/endDate for a one-day tour without timezone drift',
  );

  await rejects(
    () => service.updateStatus(created.id, 'UNKNOWN'),
    'updateStatus should reject status outside the booking workflow enum',
    'Trạng thái booking không hợp lệ: UNKNOWN',
  );
  const confirmed = await service.updateStatus(created.id, 'confirmed');
  assert(confirmed.status === 'CONFIRMED', 'updateStatus should move DRAFT to CONFIRMED');
  assert((await service.list(undefined, 'CONFIRMED', undefined, undefined, 500)).some((row) => row.id === created.id), 'list status filter should include booking after status update');
  await rejects(() => service.updateStatus(created.id, 'DRAFT'), 'updateStatus should reject invalid backward transition');
  await rejects(() => service.updateStatus(created.id, 'COMPLETED'), 'updateStatus should reject skipping directly from CONFIRMED to COMPLETED');
  await rejects(() => service.updateStatus(created.id, 'OPERATING'), 'updateStatus should reject OPERATING before operationForm exists');

  const cancelledTerminalBooking = await service.create(bookingDto(run, 'CANCELLED-TERMINAL', tourProgram, links, {
    orderId: undefined,
    tourId: undefined,
    startDate: '2026-10-24',
    endDate: '2026-10-26',
  }));
  await service.updateStatus(cancelledTerminalBooking.id, 'CANCELLED');
  await rejects(
    () => service.update(cancelledTerminalBooking.id, { customerName: 'Edited cancelled booking' }),
    'update should reject editing a cancelled terminal booking',
  );
  assert(
    (await prisma.booking.findUnique({ where: { id: cancelledTerminalBooking.id } }))?.customerName !== 'Edited cancelled booking',
    'rejected cancelled booking update should preserve customer snapshot',
  );

  const deletable = await service.create(bookingDto(run, 'DELETE', tourProgram, links, {
    orderId: undefined,
    tourId: undefined,
    startDate: '2026-11-01',
    endDate: '2026-11-03',
  }));
  await service.remove(deletable.id);
  const softDeleted = await prisma.booking.findUnique({ where: { id: deletable.id }, select: { id: true, deletedAt: true } });
  assert(softDeleted?.id === deletable.id, 'delete should retain the booking row for audit/history');
  assert(softDeleted.deletedAt instanceof Date, 'delete should mark deletedAt instead of hard deleting the booking');
  await rejects(() => service.detail(deletable.id), 'delete should hide soft-deleted booking from detail');
  assert(!(await service.list(run, undefined, undefined, undefined, 500)).some((row) => row.id === deletable.id), 'list should exclude soft-deleted bookings');
  const softDeleteAudit = await prisma.auditLog.findFirst({
    where: { entity: 'Booking', entityId: deletable.id, action: 'SOFT_DELETE' },
    select: { id: true, metadata: true },
  });
  assert(softDeleteAudit?.id, 'delete should write a booking soft-delete audit log');
  assert(softDeleteAudit.metadata?.code === deletable.code, 'soft-delete audit should include booking code metadata');

  const linkedDeletable = await service.create(bookingDto(run, 'DELETE-LINKED', tourProgram, links, {
    startDate: '2026-11-05',
    endDate: '2026-11-07',
  }));
  await service.remove(linkedDeletable.id);
  const linkedSoftDeleted = await prisma.booking.findUnique({ where: { id: linkedDeletable.id }, select: { id: true, deletedAt: true } });
  assert(linkedSoftDeleted?.deletedAt instanceof Date, 'delete should soft-delete linked booking when no operation data exists');
  await rejects(() => service.detail(linkedDeletable.id), 'delete should hide linked soft-deleted booking from detail');
  assert((await prisma.customer.findUnique({ where: { id: links.customer.id } }))?.id === links.customer.id, 'delete should preserve linked customer');
  assert((await prisma.order.findUnique({ where: { id: links.order.id } }))?.id === links.order.id, 'delete should preserve linked order');
  assert((await prisma.tour.findUnique({ where: { id: links.tour.id } }))?.id === links.tour.id, 'delete should preserve linked tour');

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
  const voucherDeleteGuard = await service.deleteGuard(voucherLockedBooking.id);
  assert(!voucherDeleteGuard.canDelete && voucherDeleteGuard.operationVouchers === 1, 'delete guard should count operation vouchers');
  await rejects(
    () => service.update(voucherLockedBooking.id, { customerId: null }),
    'update should reject linked customer changes after an operation voucher exists',
  );
  await rejects(
    () => service.update(voucherLockedBooking.id, { customerName: 'Blocked after voucher' }),
    'update should reject customer snapshot changes after an operation voucher exists',
  );
  await rejects(
    () => service.remove(voucherLockedBooking.id),
    'delete should reject booking with operationVouchers',
    'Không thể xóa booking vì đang có 1 phiếu dịch vụ điều hành.',
  );
  assert((await prisma.booking.findUnique({ where: { id: voucherLockedBooking.id } }))?.id === voucherLockedBooking.id, 'failed voucher-guarded delete should preserve booking');
  assert((await prisma.operationVoucher.findFirst({ where: { bookingId: voucherLockedBooking.id } }))?.bookingId === voucherLockedBooking.id, 'failed delete should preserve operation voucher link');

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
  const allotmentDeleteGuard = await service.deleteGuard(allotmentLockedBooking.id);
  assert(!allotmentDeleteGuard.canDelete && allotmentDeleteGuard.allotmentLocks === 1, 'delete guard should count allotment locks');
  await rejects(
    () => service.update(allotmentLockedBooking.id, { tourId: null }),
    'update should reject linked tour changes after an allotment lock exists',
  );
  await rejects(
    () => service.update(allotmentLockedBooking.id, { totalSellPrice: 8000000 }),
    'update should reject price changes after an allotment lock exists',
  );
  await rejects(
    () => service.remove(allotmentLockedBooking.id),
    'delete should reject booking with allotmentLocks',
    'Không thể xóa booking vì đang có 1 khóa allotment.',
  );
  assert((await prisma.booking.findUnique({ where: { id: allotmentLockedBooking.id } }))?.id === allotmentLockedBooking.id, 'failed allotment-guarded delete should preserve booking');
  assert((await prisma.supplierAllotmentAllocation.findFirst({ where: { bookingId: allotmentLockedBooking.id } }))?.bookingId === allotmentLockedBooking.id, 'failed delete should preserve allotment link');

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
  const operationFormDeleteGuard = await service.deleteGuard(created.id);
  assert(!operationFormDeleteGuard.canDelete && operationFormDeleteGuard.operationForms === 1, 'delete guard should count operation forms');
  assert((await service.list(run)).find((row) => row.id === created.id)?.operationForm?.id === operationForm.id, 'list should include operationForm after it is created');
  const emptyAfterOperationForm = await service.update(created.id, {});
  assert(emptyAfterOperationForm.id === created.id, 'empty update should remain a no-op after operationForm exists');
  await rejects(
    () => service.update(created.id, { customerName: 'Blocked customer edit' }),
    'update should reject customerName change after operationForm exists',
    'Booking đã có phiếu điều hành, không thể chỉnh sửa booking.',
  );
  await rejects(
    () => service.update(created.id, { paxCount: 5 }),
    'update should reject paxCount change after operationForm exists',
    'Booking đã có phiếu điều hành, không thể chỉnh sửa booking.',
  );
  await rejects(
    () => service.update(created.id, { startDate: '2026-10-03', endDate: '2026-10-05' }),
    'update should reject date change after operationForm exists',
    'Booking đã có phiếu điều hành, không thể chỉnh sửa booking.',
  );
  await rejects(
    () => service.update(created.id, { totalSellPrice: 9000000 }),
    'update should reject totalSellPrice change after operationForm exists',
    'Booking đã có phiếu điều hành, không thể chỉnh sửa booking.',
  );
  await rejects(
    () => service.update(created.id, { orderId: null }),
    'update should reject linked order changes after operationForm exists',
    'Booking đã có phiếu điều hành, không thể chỉnh sửa booking.',
  );
  await rejects(
    () => service.update(created.id, { saleOwner: 'Sale Reassigned', operatorOwner: 'Operator Reassigned' }),
    'update should reject owner assignment changes after operationForm exists',
    'Booking đã có phiếu điều hành, không thể chỉnh sửa booking.',
  );
  await rejects(
    () => service.remove(created.id),
    'delete should reject booking with operationForm',
    'Không thể xóa booking vì đang có 1 phiếu điều hành.',
  );
  assert((await prisma.booking.findUnique({ where: { id: created.id } }))?.id === created.id, 'failed operation-form-guarded delete should preserve booking');
  assert((await prisma.operationForm.findUnique({ where: { bookingId: created.id } }))?.bookingId === created.id, 'failed delete should preserve operation form link');

  await rejects(
    () => service.updateStatus(created.id, 'OPERATING'),
    'updateStatus should reject OPERATING while operationForm is still pending',
  );
  await prisma.operationForm.update({ where: { id: operationForm.id }, data: { status: 'IN_PROGRESS' } });
  const operating = await service.updateStatus(created.id, 'OPERATING');
  assert(operating.status === 'OPERATING', 'updateStatus should allow CONFIRMED to OPERATING after operationForm is in progress');
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
