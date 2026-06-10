#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tour_programs_service_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOUR_PROGRAMS_SERVICE_TEST missing POSTGRES_PASSWORD"
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
const fs = require('fs');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const {
  TourProgramsController,
  TourItineraryDaysController,
} = require('./apps/api/dist/modules/tour-programs/tour-programs.controller');
const { TourProgramsService } = require('./apps/api/dist/modules/tour-programs/tour-programs.service');
const { PERMISSIONS_KEY } = require('./apps/api/dist/modules/auth/permissions.decorator');
const {
  CreateTourProgramDto,
  TOUR_PROGRAM_DURATION_DAYS_MAX,
} = require('./apps/api/dist/modules/tour-programs/dto/create-tour-program.dto');
const { CreateItineraryDayDto } = require('./apps/api/dist/modules/tour-programs/dto/create-itinerary-day.dto');
const { UpdateTourProgramDto } = require('./apps/api/dist/modules/tour-programs/dto/update-tour-program.dto');
const { validationExceptionFactory } = require('./apps/api/dist/validation-exception.factory');

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

async function rejectMessage(action, label) {
  try {
    await action();
  } catch (error) {
    const response = typeof error?.getResponse === 'function' ? error.getResponse() : undefined;
    if (typeof response === 'string') return response;
    if (Array.isArray(response?.message)) return response.message.join(', ');
    return response?.message || error?.message || '';
  }
  throw new Error(label);
}

function validationMessages(errors) {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...validationMessages(error.children ?? []),
  ]);
}

function permissions(target, methodName) {
  const metadataTarget = methodName ? target.prototype[methodName] : target;
  return Reflect.getMetadata(PERMISSIONS_KEY, metadataTarget) ?? [];
}

async function validateDto(DtoClass, payload) {
  const instance = plainToInstance(DtoClass, payload);
  const errors = await validate(instance);
  return { instance, errors, messages: validationMessages(errors) };
}

async function createCompleteProgram(service, run, suffix, durationDays = 2) {
  const program = await service.create({
    code: `${run}-TP-${suffix}`,
    name: `Tour Programs Service ${suffix}`,
    route: 'Ha Noi - Ha Long',
    durationDays,
    description: `Description ${suffix}`,
  });
  for (let index = 1; index <= durationDays; index += 1) {
    await service.createItineraryDay(program.id, {
      dayNumber: index,
      title: `Day ${index}`,
      description: `Itinerary day ${index}`,
    });
  }
  return service.detail(program.id);
}

async function main() {
  const mainSource = fs.readFileSync('/workspace/apps/api/src/main.ts', 'utf8');
  const authGuardSource = fs.readFileSync('/workspace/apps/api/src/modules/auth/auth.guard.ts', 'utf8');
  const controllerSource = fs.readFileSync('/workspace/apps/api/src/modules/tour-programs/tour-programs.controller.ts', 'utf8');
  const dtoSource = fs.readFileSync('/workspace/apps/api/src/modules/tour-programs/dto/create-tour-program.dto.ts', 'utf8');
  const itineraryDtoSource = fs.readFileSync('/workspace/apps/api/src/modules/tour-programs/dto/create-itinerary-day.dto.ts', 'utf8');
  const serviceSource = fs.readFileSync('/workspace/apps/api/src/modules/tour-programs/tour-programs.service.ts', 'utf8');
  const schemaSource = fs.readFileSync('/workspace/prisma/schema.prisma', 'utf8');
  const webPageSource = fs.readFileSync('/workspace/apps/web/app/tour-programs/page.tsx', 'utf8');

  assert(mainSource.includes('exceptionFactory: validationExceptionFactory'), 'global ValidationPipe should use Vietnamese exceptionFactory');
  assert(authGuardSource.includes('getAllAndOverride<string[]>'), 'permission guard should let method permissions override controller permissions');
  assert(controllerSource.includes("BadRequestException('Từ khóa tìm kiếm phải là chuỗi ký tự')"), 'tour programs controller should reject non-string search query');
  for (const englishMessage of ['Tour program not found', 'Tour program code already exists', 'Itinerary day not found']) {
    assert(!serviceSource.includes(englishMessage), `tour programs service should not contain English message: ${englishMessage}`);
  }
  assert(/model TourProgram[\s\S]*code\s+String\s+@unique/.test(schemaSource), 'TourProgram code should be unique in Prisma schema');
  assert(/model TourProgram[\s\S]*route\s+String\?/.test(schemaSource), 'TourProgram route should stay optional in Prisma schema');
  assert(/model TourProgram[\s\S]*description\s+String\?/.test(schemaSource), 'TourProgram description should stay nullable in Prisma schema');
  assert(dtoSource.includes('TOUR_PROGRAM_DURATION_DAYS_MAX = 60'), 'DTO should define max durationDays');
  assert(dtoSource.includes('trim().toUpperCase()'), 'DTO should normalize code to uppercase');
  assert(dtoSource.includes('Mã chương trình tour phải là chuỗi ký tự'), 'DTO validation messages should be Vietnamese');
  assert(dtoSource.includes('Hạ Long 3 ngày 2 đêm'), 'DTO Swagger examples should use Vietnamese accents');
  assert(dtoSource.includes('Hà Nội - Hạ Long - Ninh Bình'), 'DTO route example should use Vietnamese accents');
  assert(!dtoSource.includes('Ha Long 3 ngay 2 dem'), 'DTO should not use unaccented Vietnamese tour name examples');
  assert(!dtoSource.includes('Ha Noi - Ha Long - Ninh Binh'), 'DTO should not use unaccented Vietnamese route examples');
  assert(dtoSource.includes('Tên tour mẫu hiển thị cho booking'), 'DTO name should document business usage');
  assert(dtoSource.includes('Tuyến điểm tóm tắt theo thứ tự hành trình'), 'DTO route should document business usage');
  assert(dtoSource.includes('các ngày lịch trình không được vượt quá giá trị này'), 'DTO durationDays should document itinerary constraint');
  assert(dtoSource.includes('Cho phép mô tả nhiều dòng.'), 'DTO should document multiline description support');
  assert(itineraryDtoSource.includes('Hà Nội - Hạ Long'), 'itinerary day DTO Swagger examples should use Vietnamese accents');
  assert(itineraryDtoSource.includes('Số thứ tự ngày hành trình phải là số nguyên hợp lệ'), 'itinerary day DTO validation messages should be Vietnamese');
  assert(!itineraryDtoSource.includes('Ha Noi - Ha Long'), 'itinerary day DTO should not use unaccented Vietnamese examples');
  assert(serviceSource.includes('TOUR_PROGRAM_DURATION_DAYS_MAX'), 'service should reuse DTO duration max');
  assert(serviceSource.includes('TOUR_ITINERARY_TITLE_MAX_LENGTH'), 'service should reuse itinerary title max from DTO');
  assert(serviceSource.includes("validatePositiveInt(dto.durationDays, 'Số ngày', this.maxDurationDays)"), 'service should validate durationDays to prevent DTO bypass');
  assert(serviceSource.includes("...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {})"), 'toTourProgramData should only update submitted code and normalize uppercase');
  assert(serviceSource.includes("...(dto.route !== undefined ? { route: this.optionalText(dto.route) } : {})"), 'toTourProgramData should only update submitted route');
  assert(serviceSource.includes("...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {})"), 'toTourProgramData should only update submitted description');
  assert(serviceSource.includes('return trimmed ? trimmed : null;'), 'optionalText should store blank optional text as null');
  assert(serviceSource.includes('booking liên quan'), 'remove booking conflict message should be explicit Vietnamese');
  assert(serviceSource.includes('ngày hành trình'), 'remove itinerary conflict message should be explicit Vietnamese');
  assert(serviceSource.includes('dịch vụ điều hành liên quan'), 'remove itinerary day service conflict message should be explicit Vietnamese');
  assert(serviceSource.includes('itineraryDays: { orderBy: { dayNumber:'), 'list should include itineraryDays ordered by dayNumber for frontend preview');
  assert(serviceSource.includes('_count: { select: { bookings: true } }'), 'list/detail should expose booking count for frontend guards');
  assert(serviceSource.includes("orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }]"), 'list should keep newest-updated ordering with code tie-breaker');
  assert(!serviceSource.includes('bookings: { orderBy: { startDate:'), 'detail should not return booking list when frontend only needs booking count');
  assert(webPageSource.includes('const MAX_DURATION_DAYS = 60'), 'frontend should use the API durationDays max');
  assert(webPageSource.includes("code: requiredText(formData, 'code', 'Mã tour', 2).toUpperCase()"), 'frontend should normalize tour program code to uppercase before submit');
  assert(webPageSource.includes('maxLength={MAX_CODE_LENGTH}'), 'frontend should cap code length');
  assert(/<input name="route"[^>]*maxLength=\{MAX_ROUTE_LENGTH\}[^>]*\/>/.test(webPageSource), 'frontend route input should stay optional and length-limited');
  assert(!webPageSource.includes('bookings?.length'), 'frontend should rely on _count.bookings instead of detail booking rows');
  assert(webPageSource.includes('function itineraryIsFull'), 'frontend should detect full itinerary programs');
  assert(webPageSource.includes('Tour mẫu này đã đủ'), 'frontend should show Vietnamese full-itinerary message');
  assert(webPageSource.includes('disabled={itineraryIsFull(tour)}'), 'frontend should disable full itinerary options');
  assert(webPageSource.includes('function tourProgramDeleteReason'), 'frontend should build delete block reasons without zero-count noise');
  assert(webPageSource.includes('Tour mẫu này đang có {blockReason}'), 'frontend delete confirmation should use a clear Vietnamese block reason');

  const customValidationResponse = validationExceptionFactory([{
    property: 'durationDays',
    constraints: { isInt: 'Số ngày phải là số nguyên hợp lệ' },
  }]).getResponse();
  assert(customValidationResponse.message.includes('Số ngày phải là số nguyên hợp lệ'), 'validation factory should keep custom Vietnamese messages');

  const defaultValidationResponse = validationExceptionFactory([{
    property: 'durationDays',
    constraints: { isInt: 'durationDays must be an integer number' },
  }]).getResponse();
  assert(defaultValidationResponse.message.includes('durationDays phải là số nguyên hợp lệ'), 'validation factory should translate default isInt message');
  assert(!defaultValidationResponse.message.some((message) => message.includes('must be')), 'validation factory should not return English default messages');

  const whitelistValidationResponse = validationExceptionFactory([{
    property: 'unexpectedField',
    constraints: { whitelistValidation: 'property unexpectedField should not exist' },
  }]).getResponse();
  assert(whitelistValidationResponse.message.includes('unexpectedField không được phép gửi lên'), 'validation factory should translate whitelist messages');

  assert(permissions(TourProgramsController).includes('tour.view'), 'tour programs controller should require tour.view by default');
  assert(permissions(TourProgramsController, 'list').length === 0, 'list should use default tour.view permission');
  assert(permissions(TourProgramsController, 'detail').length === 0, 'detail should use default tour.view permission');
  assert(permissions(TourProgramsController, 'create').includes('tour.manage'), 'create should require tour.manage');
  assert(permissions(TourProgramsController, 'update').includes('tour.manage'), 'update should require tour.manage');
  assert(permissions(TourProgramsController, 'remove').includes('tour.manage'), 'remove should require tour.manage');
  assert(permissions(TourProgramsController, 'createItineraryDay').includes('tour.manage'), 'create itinerary day should require tour.manage');
  assert(permissions(TourItineraryDaysController).includes('tour.view'), 'tour itinerary days controller should keep tour.view default');
  assert(permissions(TourItineraryDaysController, 'update').includes('tour.manage'), 'update itinerary day should require tour.manage');
  assert(permissions(TourItineraryDaysController, 'remove').includes('tour.manage'), 'remove itinerary day should require tour.manage');

  let controllerSearchValue = 'not-called';
  const controller = new TourProgramsController({
    list: (search) => {
      controllerSearchValue = search;
      return [];
    },
  });
  await controller.list('  Hạ Long  ');
  assert(controllerSearchValue === 'Hạ Long', 'controller list should trim search before passing it to service');
  await rejects(() => controller.list(['Hạ Long']), 'controller list should reject array search query');

  const validCreateDto = await validateDto(CreateTourProgramDto, {
    code: ' hl-3n2d ',
    name: ' Hạ Long 3 ngày 2 đêm ',
    durationDays: '3',
  });
  assert(validCreateDto.errors.length === 0, 'CreateTourProgramDto should accept valid code, name and durationDays');
  assert(validCreateDto.instance.code === 'HL-3N2D', 'CreateTourProgramDto should trim and uppercase code');
  assert(validCreateDto.instance.name === 'Hạ Long 3 ngày 2 đêm', 'CreateTourProgramDto should trim name');
  assert(validCreateDto.instance.durationDays === 3, 'CreateTourProgramDto should transform durationDays to number');

  const missingCreateDto = await validateDto(CreateTourProgramDto, {});
  assert(missingCreateDto.messages.some((message) => message.includes('Mã chương trình tour')), 'CreateTourProgramDto should reject missing code');
  assert(missingCreateDto.messages.some((message) => message.includes('Tên chương trình tour')), 'CreateTourProgramDto should reject missing name');
  assert(missingCreateDto.messages.some((message) => message.includes('Số ngày')), 'CreateTourProgramDto should reject missing durationDays');
  assert(!missingCreateDto.messages.some((message) => /must|should|property/.test(message)), 'CreateTourProgramDto missing-field messages should be Vietnamese');

  for (const durationDays of [0, -1]) {
    const invalidDurationDto = await validateDto(CreateTourProgramDto, {
      code: 'HL-INVALID',
      name: 'Tour sai số ngày',
      durationDays,
    });
    assert(invalidDurationDto.messages.includes('Số ngày phải lớn hơn hoặc bằng 1'), `CreateTourProgramDto should reject durationDays=${durationDays}`);
  }

  const tooLongDurationDto = await validateDto(CreateTourProgramDto, {
    code: 'HL-TOO-LONG',
    name: 'Tour quá dài',
    durationDays: TOUR_PROGRAM_DURATION_DAYS_MAX + 1,
  });
  assert(tooLongDurationDto.messages.includes(`Số ngày không được vượt quá ${TOUR_PROGRAM_DURATION_DAYS_MAX}`), 'CreateTourProgramDto should reject durationDays above maximum');

  const partialUpdateDto = await validateDto(UpdateTourProgramDto, {
    name: ' Chỉ sửa tên tour ',
  });
  assert(partialUpdateDto.errors.length === 0, 'UpdateTourProgramDto should accept partial payload');
  assert(partialUpdateDto.instance.name === 'Chỉ sửa tên tour', 'UpdateTourProgramDto should transform submitted partial fields');

  const invalidPartialUpdateDto = await validateDto(UpdateTourProgramDto, {
    durationDays: 0,
  });
  assert(invalidPartialUpdateDto.messages.includes('Số ngày phải lớn hơn hoặc bằng 1'), 'UpdateTourProgramDto should validate submitted partial durationDays');

  const validItineraryDayDto = await validateDto(CreateItineraryDayDto, {
    dayNumber: '1',
    title: ' Hà Nội - Hạ Long ',
    description: ' Khởi hành từ Hà Nội. ',
  });
  assert(validItineraryDayDto.errors.length === 0, 'CreateItineraryDayDto should accept valid dayNumber, title and description');
  assert(validItineraryDayDto.instance.dayNumber === 1, 'CreateItineraryDayDto should transform dayNumber to number');
  assert(validItineraryDayDto.instance.title === 'Hà Nội - Hạ Long', 'CreateItineraryDayDto should trim title');
  assert(validItineraryDayDto.instance.description === 'Khởi hành từ Hà Nội.', 'CreateItineraryDayDto should trim description');

  const missingItineraryDayDto = await validateDto(CreateItineraryDayDto, {});
  assert(missingItineraryDayDto.messages.some((message) => message.includes('Số thứ tự ngày hành trình')), 'CreateItineraryDayDto should reject missing dayNumber');
  assert(missingItineraryDayDto.messages.some((message) => message.includes('Tiêu đề ngày hành trình')), 'CreateItineraryDayDto should reject missing title');
  assert(!missingItineraryDayDto.messages.some((message) => /must|should|property/.test(message)), 'CreateItineraryDayDto missing-field messages should be Vietnamese');

  const invalidItineraryDayDto = await validateDto(CreateItineraryDayDto, {
    dayNumber: 0,
    title: 'HN',
  });
  assert(invalidItineraryDayDto.messages.includes('Số thứ tự ngày hành trình phải lớn hơn hoặc bằng 1'), 'CreateItineraryDayDto should reject dayNumber below 1');

  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new TourProgramsService(prisma);
  const run = 'TP-SVC-' + Date.now();

  assert((await service.list()).length === 0, 'list should start empty in isolated test database');

  await rejects(
    () => service.create({ code: ' ', name: 'Valid Tour Program', durationDays: 1 }),
    'create should reject blank code',
  );
  await rejects(
    () => service.create({ code: `${run}-BAD-NAME`, name: ' ', durationDays: 1 }),
    'create should reject blank name',
  );
  await rejects(
    () => service.create({ code: `${run}-BAD-DURATION`, name: 'Bad Duration', durationDays: 0 }),
    'create should reject durationDays below 1',
  );
  await rejects(
    () => service.create({ code: `${run}-BAD-DURATION-2`, name: 'Bad Duration', durationDays: 1.5 }),
    'create should reject non-integer durationDays',
  );
  await rejects(
    () => service.create({ code: `${run}-BAD-DURATION-3`, name: 'Bad Duration', durationDays: 61 }),
    'create should reject durationDays above maximum',
  );
  await rejects(
    () => service.create({ code: 'X'.repeat(51), name: 'Code Too Long', durationDays: 1 }),
    'create should reject code above maximum length',
  );
  await rejects(
    () => service.create({ code: `${run}-LONG-NAME`, name: 'N'.repeat(251), durationDays: 1 }),
    'create should reject name above maximum length',
  );
  await rejects(
    () => service.create({ code: `${run}-LONG-ROUTE`, name: 'Route Too Long', route: 'R'.repeat(251), durationDays: 1 }),
    'create should reject route above maximum length',
  );
  await rejects(
    () => service.create({ code: `${run}-LONG-DESC`, name: 'Description Too Long', durationDays: 1, description: 'D'.repeat(2001) }),
    'create should reject description above maximum length',
  );

  const created = await service.create({
    code: `${run}-main`,
    name: 'Tour Programs Service Main',
    route: 'Ha Noi - Ha Long',
    durationDays: 3,
    description: 'Main tour program',
  });
  assert(created.code === `${run}-MAIN`, 'create should normalize code to uppercase');
  assert(created.name === 'Tour Programs Service Main', 'create should persist name');
  assert(created.route === 'Ha Noi - Ha Long' && created.durationDays === 3, 'create should persist route and durationDays');
  assert(Array.isArray(created.itineraryDays) && created.itineraryDays.length === 0, 'create should include itineraryDays');

  const trimmed = await service.create({
    code: ` ${run}-trim `,
    name: ' Tour mẫu có dấu ',
    route: ' Hà Nội - Huế ',
    durationDays: 2,
    description: ' Dòng 1\nDòng 2 ',
  });
  assert(trimmed.code === `${run}-TRIM`, 'create should trim and uppercase code');
  assert(trimmed.name === 'Tour mẫu có dấu', 'create should trim Vietnamese tour name');
  assert(trimmed.route === 'Hà Nội - Huế', 'create should trim route');
  assert(trimmed.description === 'Dòng 1\nDòng 2', 'create should trim description and allow newline');

  await rejects(
    () => service.create({ code: `${run}-MAIN`, name: 'Duplicate Code', durationDays: 1 }),
    'create should reject duplicate code',
  );
  const duplicateCreateMessage = await rejectMessage(
    () => service.create({ code: `${run}-MAIN`, name: 'Duplicate Code', durationDays: 1 }),
    'create should reject duplicate code with Vietnamese message',
  );
  assert(duplicateCreateMessage === 'Mã chương trình tour đã tồn tại', 'create duplicate code message should be Vietnamese');

  const dayOne = await service.createItineraryDay(created.id, {
    dayNumber: 1,
    title: 'Ha Noi - Ha Long',
    description: 'Start from Ha Noi',
  });
  assert(dayOne.dayNumber === 1 && dayOne.title === 'Ha Noi - Ha Long', 'createItineraryDay should persist day one');
  const dayTwo = await service.createItineraryDay(created.id, {
    dayNumber: 2,
    title: 'Ha Long',
    description: 'Cruise day',
  });
  assert(dayTwo.dayNumber === 2, 'createItineraryDay should persist day two');
  await rejects(
    () => service.createItineraryDay(created.id, { dayNumber: 1, title: 'Duplicate day' }),
    'createItineraryDay should reject duplicate dayNumber in the same tour',
  );
  const duplicateDayMessage = await rejectMessage(
    () => service.createItineraryDay(created.id, { dayNumber: 1, title: 'Duplicate day' }),
    'createItineraryDay should reject duplicate dayNumber with Vietnamese message',
  );
  assert(duplicateDayMessage === 'Số thứ tự ngày hành trình đã tồn tại trong chương trình tour này', 'duplicate itinerary day message should be Vietnamese');
  await rejects(
    () => service.createItineraryDay(created.id, { dayNumber: 4, title: 'Outside duration' }),
    'createItineraryDay should reject dayNumber greater than durationDays',
  );
  await rejects(
    () => service.createItineraryDay(created.id, { dayNumber: 3, title: ' ' }),
    'createItineraryDay should reject blank title',
  );

  const listed = await service.list(run);
  const listedCreated = listed.find((row) => row.id === created.id);
  assert(listedCreated, 'list should include created tour program');
  assert(listedCreated._count.bookings === 0, 'list should return _count.bookings');
  assert(listedCreated.itineraryDays.length === 2, 'list should return itineraryDays used by frontend');
  assert(listedCreated.itineraryDays[0].dayNumber === 1 && listedCreated.itineraryDays[1].dayNumber === 2, 'list itineraryDays should be ordered by dayNumber');
  assert(listedCreated.itineraryDays[0].description === 'Start from Ha Noi', 'list itineraryDays should include description');
  assert((await service.list('Cruise')).length === 0, 'list search should not match itinerary titles');
  assert((await service.list(`${run}-MAIN`)).some((row) => row.id === created.id), 'list search should match code');
  assert((await service.list('Tour Programs Service Main')).some((row) => row.id === created.id), 'list search should match name');
  assert((await service.list('Ha Long')).some((row) => row.id === created.id), 'list search should match route');
  await rejects(
    () => service.list('X'.repeat(81)),
    'list search should reject overly long search text',
  );

  const detail = await service.detail(created.id);
  assert(detail.itineraryDays.length === 2, 'detail should include itinerary days');
  assert(detail._count.bookings === 0, 'detail should include _count.bookings');
  assert(!('bookings' in detail), 'detail should not include booking rows when frontend only needs booking count');
  const missingDetailMessage = await rejectMessage(
    () => service.detail('missing-tour-program-id'),
    'detail should reject missing tour program with Vietnamese message',
  );
  assert(missingDetailMessage === 'Không tìm thấy chương trình tour', 'detail missing tour program message should be Vietnamese');

  const updated = await service.update(created.id, {
    name: 'Tour Programs Service Main Updated',
    route: 'Ha Noi - Ha Long - Ninh Binh',
    durationDays: 2,
    description: 'Updated description',
  });
  assert(updated.name === 'Tour Programs Service Main Updated', 'update should persist name');
  assert(updated.route === 'Ha Noi - Ha Long - Ninh Binh', 'update should persist route');
  assert(updated.durationDays === 2, 'update should allow durationDays that still covers existing itinerary');

  const partialUpdated = await service.update(created.id, {
    name: 'Tour Programs Service Partial Updated',
  });
  assert(partialUpdated.name === 'Tour Programs Service Partial Updated', 'partial update should update submitted field');
  assert(partialUpdated.code === `${run}-MAIN`, 'partial update should keep omitted code');
  assert(partialUpdated.route === 'Ha Noi - Ha Long - Ninh Binh', 'partial update should keep omitted route');
  assert(partialUpdated.durationDays === 2, 'partial update should keep omitted durationDays');
  assert(partialUpdated.description === 'Updated description', 'partial update should keep omitted description');

  const codeUpdated = await service.update(created.id, { code: `${run}-renamed` });
  assert(codeUpdated.code === `${run}-RENAMED`, 'update should normalize submitted code to uppercase');
  assert(codeUpdated.name === 'Tour Programs Service Partial Updated', 'code-only update should keep omitted name');

  const optionalTextCleared = await service.update(created.id, {
    route: '   ',
    description: '   ',
  });
  assert(optionalTextCleared.route === null, 'optionalText should clear blank route to null');
  assert(optionalTextCleared.description === null, 'optionalText should clear blank description to null');
  assert(optionalTextCleared.name === 'Tour Programs Service Partial Updated', 'blank optional text update should keep omitted required fields');

  await rejects(
    () => service.updateItineraryDay(dayTwo.id, { dayNumber: 0 }),
    'updateItineraryDay should reject dayNumber below 1',
  );
  await rejects(
    () => service.updateItineraryDay(dayTwo.id, { title: ' ' }),
    'updateItineraryDay should reject blank title after trim',
  );
  await rejects(
    () => service.updateItineraryDay(dayTwo.id, { dayNumber: 1 }),
    'updateItineraryDay should reject duplicate dayNumber in the same tour',
  );
  const updatedDayTwo = await service.updateItineraryDay(dayTwo.id, {
    title: ' Hạ Long cập nhật ',
    description: ' ',
  });
  assert(updatedDayTwo.title === 'Hạ Long cập nhật', 'updateItineraryDay should trim title');
  assert(updatedDayTwo.description === null, 'updateItineraryDay should store blank description as null');
  const missingItineraryMessage = await rejectMessage(
    () => service.updateItineraryDay('missing-itinerary-day-id', { title: 'Không tồn tại' }),
    'updateItineraryDay should reject missing itinerary day with Vietnamese message',
  );
  assert(missingItineraryMessage === 'Không tìm thấy ngày hành trình', 'ensureItineraryDay message should be Vietnamese');

  await rejects(
    () => service.createItineraryDay(created.id, { dayNumber: 3, title: 'Outside updated duration' }),
    'createItineraryDay should use updated durationDays',
  );
  await rejects(
    () => service.update(created.id, { durationDays: 1 }),
    'update should reject durationDays smaller than existing itinerary max day',
  );
  const itineraryRemoveMessage = await rejectMessage(
    () => service.remove(created.id),
    'delete should reject tour program with itinerary days',
  );
  assert(itineraryRemoveMessage === 'Không thể xóa chương trình tour vì còn 2 ngày hành trình', 'remove itinerary conflict message should include related count');

  const directDuplicateProgram = await prisma.tourProgram.create({
    data: {
      code: `${run}-DIRECT`,
      name: 'Direct Duplicate Program',
      durationDays: 1,
      itineraryDays: { create: { dayNumber: 1, title: 'Day 1' } },
    },
  });
  await rejects(
    () => prisma.tourItineraryDay.create({
      data: { tourProgramId: directDuplicateProgram.id, dayNumber: 1, title: 'Duplicate from direct prisma write' },
    }),
    'database unique index should reject duplicate dayNumber in the same tour',
  );
  await rejects(
    () => service.update(created.id, { code: `${run}-DIRECT` }),
    'update should reject code conflict',
  );
  const duplicateUpdateMessage = await rejectMessage(
    () => service.update(created.id, { code: `${run}-DIRECT` }),
    'update should reject code conflict with Vietnamese message',
  );
  assert(duplicateUpdateMessage === 'Mã chương trình tour đã tồn tại', 'update duplicate code message should be Vietnamese');

  const linkedProgram = await createCompleteProgram(service, run, 'LINKED', 2);
  const booking = await prisma.booking.create({
    data: {
      code: `${run}-BOOKING`,
      tourProgramId: linkedProgram.id,
      customerName: 'Linked Booking Customer',
      paxCount: 2,
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-02T00:00:00.000Z'),
    },
  });
  const linkedListRow = (await service.list(`${run}-TP-LINKED`)).find((row) => row.id === linkedProgram.id);
  assert(linkedListRow._count.bookings === 1, 'list should count linked bookings');
  assert((await service.detail(linkedProgram.id))._count.bookings === 1, 'detail should count linked bookings without returning booking rows');
  const operationForm = await prisma.operationForm.create({
    data: {
      bookingId: booking.id,
      notes: 'Tour program service test operation form',
    },
  });
  const linkedOperationDay = linkedProgram.itineraryDays[0];
  await prisma.operationService.create({
    data: {
      operationFormId: operationForm.id,
      itineraryDayId: linkedOperationDay.id,
      serviceType: 'TEST',
      serviceName: 'Linked itinerary service',
    },
  });
  const itineraryServiceRemoveMessage = await rejectMessage(
    () => service.removeItineraryDay(linkedOperationDay.id),
    'removeItineraryDay should reject itinerary day linked to operation services',
  );
  assert(itineraryServiceRemoveMessage === 'Không thể xóa ngày hành trình vì đang có 1 dịch vụ điều hành liên quan', 'removeItineraryDay service conflict message should include related count');
  await rejects(
    () => service.update(linkedProgram.id, { durationDays: 3 }),
    'update should reject durationDays change when tour program has bookings',
  );
  const bookingRemoveMessage = await rejectMessage(
    () => service.remove(linkedProgram.id),
    'delete should reject tour program with linked booking',
  );
  assert(bookingRemoveMessage === 'Không thể xóa chương trình tour vì đang có 1 booking liên quan', 'remove booking conflict message should include related count');
  await service.update(linkedProgram.id, { name: 'Linked Program Renamed' });
  const bookingAfterTourRename = await prisma.booking.findUnique({ where: { id: booking.id }, select: { tourProgramId: true } });
  assert(bookingAfterTourRename.tourProgramId === linkedProgram.id, 'updating non-duration fields should not orphan linked bookings');

  const deletable = await service.create({
    code: `${run}-DELETE`,
    name: 'Tour Program To Delete',
    durationDays: 1,
  });
  assert(deletable.route === null && deletable.description === null, 'route and description should be optional when creating a tour program');
  await service.remove(deletable.id);
  await rejects(() => service.detail(deletable.id), 'delete should remove tour program without dependencies');

  await prisma.$disconnect();
  console.log('TEST_TOUR_PROGRAMS_SERVICE_OK');
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
NODE
