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
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { TourProgramsService } = require('./apps/api/dist/modules/tour-programs/tour-programs.service');

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
  const dtoSource = fs.readFileSync('/workspace/apps/api/src/modules/tour-programs/dto/create-tour-program.dto.ts', 'utf8');
  const serviceSource = fs.readFileSync('/workspace/apps/api/src/modules/tour-programs/tour-programs.service.ts', 'utf8');
  const schemaSource = fs.readFileSync('/workspace/prisma/schema.prisma', 'utf8');
  const webPageSource = fs.readFileSync('/workspace/apps/web/app/tour-programs/page.tsx', 'utf8');

  assert(/model TourProgram[\s\S]*code\s+String\s+@unique/.test(schemaSource), 'TourProgram code should be unique in Prisma schema');
  assert(dtoSource.includes('TOUR_PROGRAM_DURATION_DAYS_MAX = 60'), 'DTO should define max durationDays');
  assert(dtoSource.includes('trim().toUpperCase()'), 'DTO should normalize code to uppercase');
  assert(dtoSource.includes('Mã chương trình tour phải là chuỗi ký tự'), 'DTO validation messages should be Vietnamese');
  assert(dtoSource.includes('Hạ Long 3 ngày 2 đêm'), 'DTO Swagger examples should use Vietnamese accents');
  assert(dtoSource.includes('Cho phép mô tả nhiều dòng.'), 'DTO should document multiline description support');
  assert(serviceSource.includes('TOUR_PROGRAM_DURATION_DAYS_MAX'), 'service should reuse DTO duration max');
  assert(webPageSource.includes('const MAX_DURATION_DAYS = 60'), 'frontend should use the API durationDays max');
  assert(webPageSource.includes('maxLength={MAX_CODE_LENGTH}'), 'frontend should cap code length');

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
  assert((await service.list('Tour Programs Service Main')).some((row) => row.id === created.id), 'list search should match name');
  assert((await service.list('Ha Long')).some((row) => row.id === created.id), 'list search should match route');

  const detail = await service.detail(created.id);
  assert(detail.itineraryDays.length === 2, 'detail should include itinerary days');
  assert(detail.bookings.length === 0, 'detail should include bookings relation');
  await rejects(() => service.detail('missing-tour-program-id'), 'detail should reject missing tour program');

  const updated = await service.update(created.id, {
    name: 'Tour Programs Service Main Updated',
    route: 'Ha Noi - Ha Long - Ninh Binh',
    durationDays: 2,
    description: 'Updated description',
  });
  assert(updated.name === 'Tour Programs Service Main Updated', 'update should persist name');
  assert(updated.route === 'Ha Noi - Ha Long - Ninh Binh', 'update should persist route');
  assert(updated.durationDays === 2, 'update should allow durationDays that still covers existing itinerary');
  await rejects(
    () => service.createItineraryDay(created.id, { dayNumber: 3, title: 'Outside updated duration' }),
    'createItineraryDay should use updated durationDays',
  );
  await rejects(
    () => service.update(created.id, { durationDays: 1 }),
    'update should reject durationDays smaller than existing itinerary max day',
  );
  await rejects(
    () => service.remove(created.id),
    'delete should reject tour program with itinerary days',
  );

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
  assert((await service.detail(linkedProgram.id)).bookings.some((row) => row.id === booking.id), 'detail should include linked booking');
  await rejects(
    () => service.update(linkedProgram.id, { durationDays: 3 }),
    'update should reject durationDays change when tour program has bookings',
  );
  await rejects(
    () => service.remove(linkedProgram.id),
    'delete should reject tour program with linked booking',
  );
  await service.update(linkedProgram.id, { name: 'Linked Program Renamed' });
  const bookingAfterTourRename = await prisma.booking.findUnique({ where: { id: booking.id }, select: { tourProgramId: true } });
  assert(bookingAfterTourRename.tourProgramId === linkedProgram.id, 'updating non-duration fields should not orphan linked bookings');

  const deletable = await service.create({
    code: `${run}-DELETE`,
    name: 'Tour Program To Delete',
    durationDays: 1,
  });
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
