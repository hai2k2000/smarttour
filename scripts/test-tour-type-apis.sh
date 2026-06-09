#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tour_type_api_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOUR_TYPE_APIS_TEST missing POSTGRES_PASSWORD"
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
  -e SMARTTOUR_ENV="development" \
  -e SMARTTOUR_AUTH_ENFORCE="true" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const crypto = require('crypto');
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./apps/api/dist/app.module');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const gitCreateDtoContract = require('./apps/api/dist/modules/git-tours/dto/create-git-tour.dto');
const gitUpdateDtoContract = require('./apps/api/dist/modules/git-tours/dto/update-git-tour.dto');
const landCreateDtoContract = require('./apps/api/dist/modules/landtours/dto/create-landtour.dto');
const landUpdateDtoContract = require('./apps/api/dist/modules/landtours/dto/update-landtour.dto');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function assertGroupedDtoContract(label, groups, createFields, updateFields) {
  const groupedFields = groups.flat();
  assert(groupedFields.length === new Set(groupedFields).size, `${label} DTO field groups should not overlap`);
  assert(JSON.stringify(groupedFields) === JSON.stringify(createFields), `${label} create fields should be exactly grouped fields`);
  assert(JSON.stringify(updateFields) === JSON.stringify(createFields), `${label} update should reuse the approved create/edit field surface`);
}

function assertTourTypeDtoContracts() {
  assertGroupedDtoContract(
    'GIT',
    [
      gitCreateDtoContract.GIT_TOUR_ROOT_FIELDS,
      gitCreateDtoContract.GIT_TOUR_LIFECYCLE_FIELDS,
      gitCreateDtoContract.GIT_TOUR_WORKFLOW_FIELDS,
      gitCreateDtoContract.GIT_TOUR_LINK_AND_CUSTOMER_FIELDS,
      gitCreateDtoContract.GIT_TOUR_DETAIL_FIELDS,
      gitCreateDtoContract.GIT_TOUR_CHILD_FIELDS,
    ],
    gitCreateDtoContract.GIT_TOUR_CREATE_FIELDS,
    gitUpdateDtoContract.GIT_TOUR_UPDATE_FIELDS,
  );
  assert(gitCreateDtoContract.GIT_TOUR_ROOT_FIELDS.includes('route'), 'GIT route should be a common Tour root field');
  assert(gitCreateDtoContract.GIT_TOUR_DETAIL_FIELDS.includes('itinerarySummary'), 'GIT itinerarySummary should remain a GIT detail field');
  assert(gitCreateDtoContract.GIT_TOUR_LINK_AND_CUSTOMER_FIELDS.includes('agentName'), 'GIT agentName should be grouped with linked/customer data');
  assert(!gitCreateDtoContract.GIT_TOUR_DETAIL_FIELDS.includes('agentName'), 'GIT agentName should not be classified as a pure detail field');
  assert(gitCreateDtoContract.GIT_TOUR_LIFECYCLE_FIELDS.includes('status'), 'GIT status should be grouped as lifecycle status');
  assert(!gitCreateDtoContract.GIT_TOUR_WORKFLOW_FIELDS.includes('status'), 'GIT workflow fields should not include lifecycle status');
  assert(gitCreateDtoContract.GIT_TOUR_WORKFLOW_FIELDS.includes('workflowStep'), 'GIT workflowStep should be grouped as workflow');
  assert(!gitCreateDtoContract.GIT_TOUR_LIFECYCLE_FIELDS.includes('workflowStep'), 'GIT lifecycle fields should not include workflowStep');
  assert(gitCreateDtoContract.GIT_TOUR_DATE_PATTERN.test('2026-06-15'), 'GIT date pattern should accept YYYY-MM-DD');
  assert(!gitCreateDtoContract.GIT_TOUR_DATE_PATTERN.test('2026-06-15T00:00:00.000Z'), 'GIT date pattern should reject ISO datetime payloads');

  assertGroupedDtoContract(
    'LandTour',
    [
      landCreateDtoContract.LANDTOUR_ROOT_FIELDS,
      landCreateDtoContract.LANDTOUR_LIFECYCLE_FIELDS,
      landCreateDtoContract.LANDTOUR_WORKFLOW_FIELDS,
      landCreateDtoContract.LANDTOUR_LINK_AND_CUSTOMER_FIELDS,
      landCreateDtoContract.LANDTOUR_LEGACY_ALIAS_FIELDS,
      landCreateDtoContract.LANDTOUR_DETAIL_FIELDS,
      landCreateDtoContract.LANDTOUR_CHILD_FIELDS,
    ],
    landCreateDtoContract.LANDTOUR_CREATE_FIELDS,
    landUpdateDtoContract.LANDTOUR_UPDATE_FIELDS,
  );
  assert(landCreateDtoContract.LANDTOUR_ROOT_FIELDS.includes('route'), 'LandTour route should be a common Tour root field');
  assert(landCreateDtoContract.LANDTOUR_LEGACY_ALIAS_FIELDS.includes('itinerarySummary'), 'LandTour itinerarySummary should only remain a legacy route alias');
  assert(!landCreateDtoContract.LANDTOUR_DETAIL_FIELDS.includes('itinerarySummary'), 'LandTour itinerarySummary should not be classified as detail data');
  assert(landCreateDtoContract.LANDTOUR_LIFECYCLE_FIELDS.includes('status'), 'LandTour status should be grouped as lifecycle status');
  assert(!landCreateDtoContract.LANDTOUR_WORKFLOW_FIELDS.includes('status'), 'LandTour workflow fields should not include lifecycle status');
  assert(landCreateDtoContract.LANDTOUR_WORKFLOW_FIELDS.includes('workflowStep'), 'LandTour workflowStep should be grouped as workflow');
  assert(!landCreateDtoContract.LANDTOUR_LIFECYCLE_FIELDS.includes('workflowStep'), 'LandTour lifecycle fields should not include workflowStep');
  assert(landCreateDtoContract.LANDTOUR_DATE_PATTERN.test('2026-06-15'), 'LandTour date pattern should accept YYYY-MM-DD');
  assert(!landCreateDtoContract.LANDTOUR_DATE_PATTERN.test('2026-06-15T00:00:00.000Z'), 'LandTour date pattern should reject ISO datetime payloads');
}

function assertCommonToursServiceUsesTourCore() {
  const fs = require('fs');
  const source = fs.readFileSync('/workspace/apps/api/src/modules/tours/tours.service.ts', 'utf8');
  assert(source.includes('tourCore.createRoot'), 'Common ToursService should create root rows through TourCoreService.createRoot');
  assert(source.includes('tourCore.updateRoot'), 'Common ToursService should update root rows through TourCoreService.updateRoot');
  assert(!/tx\.tour\.create\s*\(/.test(source), 'Common ToursService should not create Tour root directly');
  assert(!/tx\.tour\.update\s*\(/.test(source), 'Common ToursService should not update Tour root directly');
  assert(!/tourCore\.toTourData\s*\(/.test(source), 'Common ToursService should not map root data directly');
  assert(!/tourCore\.ensureDateRange\s*\(/.test(source), 'Common ToursService should not validate create date ranges outside createRoot');
  assert(!/tourCore\.ensureUpdatedDateRange\s*\(/.test(source), 'Common ToursService should not validate update date ranges outside updateRoot');
  assert(!/private\s+toTourData\s*\(/.test(source), 'Common ToursService should not keep a duplicate private toTourData mapper');
  assert(!/private\s+optionalDate\s*\(/.test(source), 'Common ToursService should not keep a private date parser');
  assert(!/private\s+requiredText\s*\(/.test(source), 'Common ToursService should not keep duplicate root requiredText validation');
  assert(!/private\s+number\s*\(/.test(source), 'Common ToursService should not keep duplicate root number parsing');
  assert(!/private\s+async\s+ensureOrder\s*\(/.test(source), 'Common ToursService should not keep duplicate order link validation');
}

function assertTourRootOrchestrationBoundaries() {
  const fs = require('fs');
  const services = [
    ['GIT', '/workspace/apps/api/src/modules/git-tours/git-tours.service.ts'],
    ['LandTour', '/workspace/apps/api/src/modules/landtours/landtours.service.ts'],
  ];
  for (const [label, file] of services) {
    const source = fs.readFileSync(file, 'utf8');
    assert(source.includes('tourCore.createRoot'), `${label} should create common Tour root through TourCoreService.createRoot`);
    assert(source.includes('tourCore.updateRoot'), `${label} should update common Tour root through TourCoreService.updateRoot`);
    assert(source.includes('tourCore.cloneServicesForCopy'), `${label} copyServices should use TourCoreService.cloneServicesForCopy`);
    assert(source.includes('tourCore.replaceServicesAndSuppliers'), `${label} copyServices should refresh common services and derived suppliers through TourCoreService.replaceServicesAndSuppliers`);
    assert(source.includes('tourCore.replaceCommonChildren'), `${label} should sync common child groups through TourCoreService.replaceCommonChildren`);
    for (const helper of ['replaceCustomers', 'replaceRevenues', 'replaceCosts', 'replaceGuides', 'replaceAttachments', 'replaceSurveys', 'replaceTerms']) {
      assert(!new RegExp(`tourCore\\.${helper}\\s*\\(`).test(source), `${label} should not call ${helper} directly from module service`);
    }
    assert(!/tourCore\.replaceServices\s*\(/.test(source), `${label} should not call replaceServices directly from module service`);
    assert(!/tourCore\.replaceSuppliers\s*\(/.test(source), `${label} should not call replaceSuppliers directly from module service`);
    assert(!/tx\.tour\.create\s*\(/.test(source), `${label} should not create Tour root directly in module service`);
    assert(!/tx\.tour\.update\s*\(/.test(source), `${label} should not update Tour root directly in module service`);
    assert(!/source\.services\.map\(\(service\)/.test(source), `${label} should not inline common TourService copy mapping`);
  }
}

async function jsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  assertTourTypeDtoContracts();
  assertCommonToursServiceUsesTourCore();
  assertTourRootOrchestrationBoundaries();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const prisma = app.get(PrismaService);
  const run = 'TTA-' + Date.now();
  const token = `tour-type-api-test.${crypto.randomBytes(24).toString('base64url')}`;
  const role = await prisma.role.create({
    data: {
      code: `${run.toLowerCase()}-role`,
      name: 'Tour Type API Test Role',
      permissions: { create: [{ permission: '*' }] },
    },
  });
  const user = await prisma.user.create({
    data: {
      username: `${run.toLowerCase()}-user`,
      email: `${run.toLowerCase()}@smarttour.local`,
      name: 'Tour Type API Test User',
      passwordHash: 'not-used',
      roles: { create: { roleId: role.id } },
    },
  });
  await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: `Bearer ${token}` };

  async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
    return { status: response.status, body: await jsonResponse(response) };
  }

  async function expect(path, options, status, label) {
    const response = await api(path, options);
    assert(response.status === status, `${label}: expected ${status}, got ${response.status} ${JSON.stringify(response.body)}`);
    return response.body;
  }

  await expect(
    '/api/tours',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'FIT',
        systemCode: `${run}-BAD-RANGE-SYS`,
        tourCode: `${run}-BAD-RANGE-TOUR`,
        name: 'Tour type API common bad range',
        startDate: '2026-07-05',
        endDate: '2026-07-04',
      }),
    },
    400,
    'common tour should reject startDate after endDate on create',
  );

  const commonTour = await expect(
    '/api/tours',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'FIT',
        systemCode: `${run}-SYS`,
        tourCode: `${run}-TOUR`,
        name: 'Tour type API common tour',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
      }),
    },
    201,
    'create common tour',
  );
  assert(commonTour.id, 'common tour create should return id');
  await expect(
    `/api/tours/${commonTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ startDate: '2026-07-04' }) },
    400,
    'common tour partial update should reject startDate after current endDate',
  );
  const patchedCommonTour = await expect(
    `/api/tours/${commonTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch common tour',
  );
  assert(patchedCommonTour.status === 'RUNNING', 'common tour PATCH should update status');
  const workflowPatchedCommonTour = await expect(
    `/api/tours/${commonTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'COMMON_REVIEW' }) },
    200,
    'patch common tour workflow step',
  );
  assert(workflowPatchedCommonTour.workflowStep === 'COMMON_REVIEW', 'common tour PATCH should update workflowStep');
  assert(workflowPatchedCommonTour.status === 'RUNNING', 'common tour workflowStep PATCH should not change lifecycle status');
  await expect('/api/tours?type=fit', {}, 200, 'common tours lowercase type query');
  await expect('/api/tours?status=running', {}, 200, 'common tours lowercase status query');
  await expect('/api/tours?type=WRONG', {}, 400, 'common tours invalid type query');
  await expect('/api/tours?status=WRONG', {}, 400, 'common tours invalid status query');

  const fitTour = await expect(
    '/api/fit-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        quoteCode: `${run}-FIT-Q`,
        tourCode: `${run}-FIT`,
        customerName: 'Tour type API FIT customer',
        adultCount: 1,
      }),
    },
    201,
    'create FIT tour',
  );
  assert(fitTour.id, 'FIT create should return id');
  const patchedFitTour = await expect(
    `/api/fit-tours/${fitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStatus: 'PRICING' }) },
    200,
    'patch FIT tour',
  );
  assert(patchedFitTour.workflowStatus === 'PRICING', 'FIT PATCH should update workflowStatus');
  await expect('/api/fit-tours?status=pricing', {}, 200, 'FIT lowercase workflow status query');
  await expect('/api/fit-tours?status=WRONG', {}, 400, 'FIT invalid workflow status query');

  await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-DATE-SYS`,
        tourCode: `${run}-GIT-BAD-DATE`,
        name: 'Tour type API GIT bad date',
        startDate: '2026-06-15T00:00:00.000Z',
      }),
    },
    400,
    'GIT should reject ISO datetime startDate',
  );
  await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-RANGE-SYS`,
        tourCode: `${run}-GIT-BAD-RANGE`,
        name: 'Tour type API GIT bad range',
        startDate: '2026-08-05',
        endDate: '2026-08-04',
      }),
    },
    400,
    'GIT should reject startDate after endDate on create',
  );

  const gitTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-SYS`,
        tourCode: `${run}-GIT`,
        name: 'Tour type API GIT tour',
        route: 'Tour type API GIT common route',
        itinerarySummary: 'Tour type API GIT detail itinerary',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        budgetServices: [{ serviceType: 'GIT_HOTEL', description: 'GIT copied budget service', quantity: 2, unitPrice: 1000, amount: 2000 }],
      }),
    },
    201,
    'create GIT tour',
  );
  assert(gitTour.id, 'GIT create should return id');
  assert(gitTour.route === 'Tour type API GIT common route', 'GIT root route should use the common route field');
  assert(gitTour.gitTour.itinerarySummary === 'Tour type API GIT detail itinerary', 'GIT detail should keep itinerarySummary separate from root route');
  await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ endDate: '2026-07-31' }) },
    400,
    'GIT partial update should reject endDate before current startDate',
  );
  const patchedGitTour = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch GIT tour',
  );
  assert(patchedGitTour.status === 'RUNNING', 'GIT PATCH should update lifecycle status');
  const workflowPatchedGitTour = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'GIT_COSTING' }) },
    200,
    'patch GIT workflow step',
  );
  assert(workflowPatchedGitTour.workflowStep === 'GIT_COSTING', 'GIT PATCH should update workflowStep');
  assert(workflowPatchedGitTour.status === 'RUNNING', 'GIT workflowStep PATCH should not change lifecycle status');
  const gitCopyTarget = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-COPY-SYS`,
        tourCode: `${run}-GIT-COPY`,
        name: 'Tour type API GIT copy target',
      }),
    },
    201,
    'create GIT copy target',
  );
  const copiedGitServices = await expect(
    `/api/git-tours/${gitCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({ sourceTourId: gitTour.id }) },
    201,
    'copy GIT services',
  );
  assert(copiedGitServices.services.length === 1, 'GIT copy-services should copy common TourService rows');
  assert(copiedGitServices.services[0].serviceType === 'GIT_HOTEL', 'GIT copy-services should preserve serviceType through TourCore clone helper');
  await expect('/api/git-tours?status=running', {}, 200, 'GIT lowercase status query');
  await expect('/api/git-tours?status=WRONG', {}, 400, 'GIT invalid status query');

  await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-BAD-DATE-SYS`,
        tourCode: `${run}-LAND-BAD-DATE`,
        name: 'Tour type API LandTour bad date',
        startDate: '2026-02-30',
      }),
    },
    400,
    'LandTour should reject non-existent calendar dates',
  );
  await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-BAD-RANGE-SYS`,
        tourCode: `${run}-LAND-BAD-RANGE`,
        name: 'Tour type API LandTour bad range',
        startDate: '2026-09-02',
        endDate: '2026-09-01',
      }),
    },
    400,
    'LandTour should reject startDate after endDate on create',
  );

  const landTour = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-SYS`,
        tourCode: `${run}-LAND`,
        name: 'Tour type API LandTour',
        route: 'Tour type API LandTour common route',
        itinerarySummary: 'Tour type API LandTour legacy itinerary alias',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        salesServices: [{ serviceType: 'LAND_CAR', description: 'LandTour copied sales service', quantity: 1, unitPrice: 1500, amount: 1500 }],
      }),
    },
    201,
    'create LandTour',
  );
  assert(landTour.id, 'LandTour create should return id');
  assert(landTour.route === 'Tour type API LandTour common route', 'LandTour root route should prefer the common route field over itinerarySummary alias');
  assert(String(landTour.startDate).startsWith('2026-09-01') && String(landTour.endDate).startsWith('2026-09-01'), 'LandTour should allow equal startDate/endDate for one-day tours');
  const patchedLandTour = await expect(
    `/api/landtours/${landTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch LandTour',
  );
  assert(patchedLandTour.status === 'RUNNING', 'LandTour PATCH should update status');
  const workflowPatchedLandTour = await expect(
    `/api/landtours/${landTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'LANDTOUR_COSTING' }) },
    200,
    'patch LandTour workflow step',
  );
  assert(workflowPatchedLandTour.workflowStep === 'LANDTOUR_COSTING', 'LandTour PATCH should update workflowStep');
  assert(workflowPatchedLandTour.status === 'RUNNING', 'LandTour workflowStep PATCH should not change lifecycle status');
  const landCopyTarget = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-COPY-SYS`,
        tourCode: `${run}-LAND-COPY`,
        name: 'Tour type API LandTour copy target',
      }),
    },
    201,
    'create LandTour copy target',
  );
  const copiedLandServices = await expect(
    `/api/landtours/${landCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({ sourceTourId: landTour.id }) },
    201,
    'copy LandTour services',
  );
  assert(copiedLandServices.services.length === 1, 'LandTour copy-services should copy common TourService rows');
  assert(copiedLandServices.services[0].serviceType === 'LAND_CAR', 'LandTour copy-services should preserve serviceType through TourCore clone helper');
  await expect('/api/landtours?status=running', {}, 200, 'LandTour lowercase status query');
  await expect('/api/landtours?status=WRONG', {}, 400, 'LandTour invalid status query');

  await app.close();
  console.log('TEST_TOUR_TYPE_APIS_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
