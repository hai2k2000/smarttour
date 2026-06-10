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
const tourCreateDtoContract = require('./apps/api/dist/modules/tours/dto/create-tour.dto');
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
  assert(tourCreateDtoContract.TOUR_DATE_PATTERN.test('2026-06-15'), 'Common Tour date pattern should accept YYYY-MM-DD');
  assert(!tourCreateDtoContract.TOUR_DATE_PATTERN.test('2026-06-15T00:00:00.000Z'), 'Common Tour date pattern should reject ISO datetime payloads');

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
  assert(JSON.stringify(gitCreateDtoContract.GIT_TOUR_REQUIRED_CREATE_FIELDS) === JSON.stringify(['systemCode', 'tourCode', 'name']), 'GIT required create fields should be explicit and module-specific');
  assert(gitCreateDtoContract.GIT_TOUR_ACTION_FIELDS.includes('sourceTourId'), 'GIT action fields should include copy-service sourceTourId');
  for (const field of gitCreateDtoContract.GIT_TOUR_ACTION_FIELDS) {
    assert(!gitCreateDtoContract.GIT_TOUR_CREATE_FIELDS.includes(field), `GIT action field ${field} should not be part of create/update aggregate fields`);
  }
  assert(gitCreateDtoContract.GIT_TOUR_LIFECYCLE_FIELDS.includes('status'), 'GIT status should be grouped as lifecycle status');
  assert(!gitCreateDtoContract.GIT_TOUR_WORKFLOW_FIELDS.includes('status'), 'GIT workflow fields should not include lifecycle status');
  assert(gitCreateDtoContract.GIT_TOUR_WORKFLOW_FIELDS.includes('workflowStep'), 'GIT workflowStep should be grouped as workflow');
  assert(!gitCreateDtoContract.GIT_TOUR_LIFECYCLE_FIELDS.includes('workflowStep'), 'GIT lifecycle fields should not include workflowStep');
  assert(gitCreateDtoContract.GIT_TOUR_DATE_PATTERN.test('2026-06-15'), 'GIT date pattern should accept YYYY-MM-DD');
  assert(!gitCreateDtoContract.GIT_TOUR_DATE_PATTERN.test('2026-06-15T00:00:00.000Z'), 'GIT date pattern should reject ISO datetime payloads');
  for (const field of ['branch', 'department', 'customerSource', 'operatorOwner', 'bookingDate', 'paymentDueDate', 'startDate', 'endDate', 'paymentStatus', 'route', 'notes']) {
    assert(gitCreateDtoContract.GIT_TOUR_ROOT_FIELDS.includes(field), `GIT ${field} should be owned by common Tour root`);
    assert(!gitCreateDtoContract.GIT_TOUR_DETAIL_FIELDS.includes(field), `GIT ${field} should not be classified as detail data`);
  }

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
  assert(landCreateDtoContract.LANDTOUR_CHILD_FIELDS.includes('guideName'), 'LandTour guideName should be grouped with common guide child data');
  assert(!landCreateDtoContract.LANDTOUR_DETAIL_FIELDS.includes('guideName'), 'LandTour guideName should not be classified as detail data');
  assert(landCreateDtoContract.LANDTOUR_CHILD_FIELDS.includes('termsVi') && landCreateDtoContract.LANDTOUR_CHILD_FIELDS.includes('termsEn'), 'LandTour terms should be grouped with common TourTerm child data');
  assert(!landCreateDtoContract.LANDTOUR_DETAIL_FIELDS.includes('termsVi') && !landCreateDtoContract.LANDTOUR_DETAIL_FIELDS.includes('termsEn'), 'LandTour terms should not be classified as detail data');
  assert(JSON.stringify(landCreateDtoContract.LANDTOUR_REQUIRED_CREATE_FIELDS) === JSON.stringify(['systemCode', 'tourCode', 'name']), 'LandTour required create fields should be explicit and module-specific');
  assert(landCreateDtoContract.LANDTOUR_ACTION_FIELDS.includes('sourceTourId'), 'LandTour action fields should include copy-service sourceTourId');
  for (const field of landCreateDtoContract.LANDTOUR_ACTION_FIELDS) {
    assert(!landCreateDtoContract.LANDTOUR_CREATE_FIELDS.includes(field), `LandTour action field ${field} should not be part of create/update aggregate fields`);
  }
  assert(landCreateDtoContract.LANDTOUR_LIFECYCLE_FIELDS.includes('status'), 'LandTour status should be grouped as lifecycle status');
  assert(!landCreateDtoContract.LANDTOUR_WORKFLOW_FIELDS.includes('status'), 'LandTour workflow fields should not include lifecycle status');
  assert(landCreateDtoContract.LANDTOUR_WORKFLOW_FIELDS.includes('workflowStep'), 'LandTour workflowStep should be grouped as workflow');
  assert(!landCreateDtoContract.LANDTOUR_LIFECYCLE_FIELDS.includes('workflowStep'), 'LandTour lifecycle fields should not include workflowStep');
  assert(landCreateDtoContract.LANDTOUR_DATE_PATTERN.test('2026-06-15'), 'LandTour date pattern should accept YYYY-MM-DD');
  assert(!landCreateDtoContract.LANDTOUR_DATE_PATTERN.test('2026-06-15T00:00:00.000Z'), 'LandTour date pattern should reject ISO datetime payloads');
  for (const field of ['branch', 'department', 'customerSource', 'operatorOwner', 'bookingDate', 'paymentDueDate', 'startDate', 'endDate', 'paymentStatus', 'route', 'notes']) {
    assert(landCreateDtoContract.LANDTOUR_ROOT_FIELDS.includes(field), `LandTour ${field} should be owned by common Tour root`);
    assert(!landCreateDtoContract.LANDTOUR_DETAIL_FIELDS.includes(field), `LandTour ${field} should not be classified as detail data`);
  }
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
  const coreSource = fs.readFileSync('/workspace/apps/api/src/modules/tours/tour-core.service.ts', 'utf8');
  assert(coreSource.includes('async copyServicesFromTour'), 'TourCoreService should own source lookup for common service copy');
  assert(coreSource.includes('async copyServices'), 'TourCoreService should own common service copy orchestration');
  assert(coreSource.includes('cloneServicesForCopy'), 'TourCoreService should keep service clone mapping behind the copy boundary');
  assert(coreSource.includes('replaceServicesAndSuppliers'), 'TourCoreService.copyServices should refresh services and derived suppliers together');
  assert(coreSource.includes('async logAction') && coreSource.includes('module: options.module') && coreSource.includes('entityId: options.entityId || tourId'), 'TourCoreService should own standardized Tour log metadata formatting');
  assert(coreSource.includes("logAction(tx, tourId, 'DELETE_TOUR'") || coreSource.includes("logAction(tx, tourId, 'DELETE_TOUR'"), 'TourCoreService.softDelete should log through standardized logAction');
  assert(coreSource.includes('private hasChanges') && coreSource.includes('private async replaceRows'), 'TourCoreService should centralize common child sync as hasChanges -> deleteMany -> createMany');
  const replaceCommonChildrenBlock = coreSource.slice(coreSource.indexOf('async replaceCommonChildren'), coreSource.indexOf('async replaceRevenues'));
  assert(replaceCommonChildrenBlock.includes('hasChanges'), 'TourCoreService.replaceCommonChildren should use hasChanges before replacing child groups');
  assert(!replaceCommonChildrenBlock.includes('.deleteMany') && !replaceCommonChildrenBlock.includes('.createMany'), 'TourCoreService.replaceCommonChildren should not inline deleteMany/createMany');
  assert(!coreSource.includes('Kh?ng t?m th?y'), 'TourCoreService should not contain mojibake Vietnamese messages');
  assert(coreSource.includes('Kh\u00f4ng t\u00ecm th\u1ea5y tour ngu\u1ed3n'), 'TourCoreService should keep copy source error message in Vietnamese');
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
  const actionDtoChecks = [
    ['GIT', '/workspace/apps/api/src/modules/git-tours/git-tours.controller.ts', '/workspace/apps/api/src/modules/git-tours/dto/git-tour-action.dto.ts', 'GitTourCopyServicesDto'],
    ['LandTour', '/workspace/apps/api/src/modules/landtours/landtours.controller.ts', '/workspace/apps/api/src/modules/landtours/dto/landtour-action.dto.ts', 'LandTourCopyServicesDto'],
  ];
  for (const [label, controllerFile, dtoFile, dtoName] of actionDtoChecks) {
    const controllerSource = fs.readFileSync(controllerFile, 'utf8');
    const actionDtoSource = fs.readFileSync(dtoFile, 'utf8');
    assert(controllerSource.includes(dtoName), `${label} copy-services action should use a focused action DTO`);
    assert(actionDtoSource.includes(`class ${dtoName}`) && actionDtoSource.includes('sourceTourId'), `${label} focused action DTO should own sourceTourId`);
  }
  for (const [label, file] of services) {
    const source = fs.readFileSync(file, 'utf8');
    assert(source.includes('tourCore.createRoot'), `${label} should create common Tour root through TourCoreService.createRoot`);
    assert(source.includes('tourCore.updateRoot'), `${label} should update common Tour root through TourCoreService.updateRoot`);
    assert(source.includes('tourCore.copyServicesFromTour'), `${label} copyServices should delegate source lookup and copy orchestration to TourCoreService.copyServicesFromTour`);
    assert(source.includes('private mapTourCustomers') && source.includes('private mapTourServices'), `${label} should keep child mapping in focused helpers`);
    assert(source.includes('logAction') && source.includes(label === 'GIT' ? 'logGitTourAction' : 'logLandTourAction'), `${label} should log create/update/copy through standardized TourCoreService.logAction`);
    assert(source.includes(label === 'GIT' ? 'COPY_GIT_SERVICES' : 'COPY_LANDTOUR_SERVICES'), `${label} copyServices should write a copy action log`);
    assert(source.includes('tourCore.softDelete') && !/tx\.(gitTourDetail|landTourDetail)\.delete/.test(source), `${label} remove should soft-delete the common Tour owner and not delete detail directly`);
    assert(!source.includes('tourCore.copyServices(tx'), `${label} copyServices should not call the lower-level copy helper directly from module service`);
    assert(!source.includes('tourCore.cloneServicesForCopy'), `${label} copyServices should not call the clone helper directly from module service`);
    assert(!source.includes('tourCore.replaceServicesAndSuppliers(tx, targetTourId'), `${label} copyServices should not refresh target services directly from module service`);
    assert(!/prisma\.tour\.findFirst\(\{ where: this\.tourCore\.scopeWhere\(\{ id: sourceTourId/.test(source), `${label} copyServices should not query source Tour services directly from module service`);
    assert(source.includes('tourCore.replaceCommonChildren'), `${label} should sync common child groups through TourCoreService.replaceCommonChildren`);
    for (const helper of ['replaceCustomers', 'replaceRevenues', 'replaceCosts', 'replaceGuides', 'replaceAttachments', 'replaceSurveys', 'replaceTerms']) {
      assert(!new RegExp(`tourCore\\.${helper}\\s*\\(`).test(source), `${label} should not call ${helper} directly from module service`);
    }
    assert(!/tourCore\.replaceServices\s*\(/.test(source), `${label} should not call replaceServices directly from module service`);
    assert(!/tourCore\.replaceSuppliers\s*\(/.test(source), `${label} should not call replaceSuppliers directly from module service`);
    assert(!/tx\.tour\.create\s*\(/.test(source), `${label} should not create Tour root directly in module service`);
    assert(!/tx\.tour\.update\s*\(/.test(source), `${label} should not update Tour root directly in module service`);
    assert(!/source\.services\.map\(\(service\)/.test(source), `${label} should not inline common TourService copy mapping`);
    const replaceChildrenBlock = source.slice(source.indexOf('private async replaceChildren'), source.indexOf('private mapTourCustomers'));
    assert(replaceChildrenBlock.includes('mapTourCustomers') && replaceChildrenBlock.includes('mapTourServices'), `${label} replaceChildren should call focused child mappers`);
    assert(!replaceChildrenBlock.includes('...this.tourCore.mapBudgetServices') && !replaceChildrenBlock.includes('...this.tourCore.mapSalesServices'), `${label} replaceChildren should not inline service child mapping`);
    const detailMapperName = label === 'GIT' ? 'private toGitDetailData' : 'private toLandDetailData';
    const detailMapperStart = source.indexOf(detailMapperName);
    assert(detailMapperStart >= 0, `${label} should keep a detail mapper boundary`);
    const detailMapperEndMarker = label === 'GIT' ? 'private withGitCustomerSnapshot' : 'private withLandGuideSnapshot';
    const detailMapperEnd = source.indexOf(detailMapperEndMarker, detailMapperStart);
    assert(detailMapperEnd > detailMapperStart, `${label} should keep detail mapper separated from common child helpers`);
    const detailMapper = source.slice(detailMapperStart, detailMapperEnd);
    const forbiddenDetailFields = ['branch', 'department', 'customerSource', 'operatorOwner', 'bookingDate', 'paymentDueDate', 'startDate', 'endDate', 'paymentStatus', 'route', 'notes'];
    if (label === 'GIT') forbiddenDetailFields.push('agentName');
    if (label === 'LandTour') forbiddenDetailFields.push('guideName', 'termsVi', 'termsEn');
    for (const field of forbiddenDetailFields) {
      const pattern = new RegExp('dto\\.' + field + '\\b');
      assert(!pattern.test(detailMapper), `${label} detail mapper should not write common root/link field ${field}`);
    }
    assert(!source.includes('Kh?ng t?m th?y') && !source.includes('M? h? th?ng'), `${label} should not contain mojibake Vietnamese messages`);
  }
  const schemaSource = fs.readFileSync('/workspace/prisma/schema.prisma', 'utf8');
  for (const field of ['branch', 'department', 'customerSource']) {
    assert(schemaSource.includes(`Canonical value is Tour.${field}`), `GitTourDetail legacy ${field} schema note should point to Tour.${field}`);
  }
  assert(schemaSource.includes('Canonical value is TourCustomer where customerType is AGENT'), 'GitTourDetail legacy agentName schema note should point to TourCustomer AGENT');
  assert(schemaSource.includes('Canonical value is TourGuide where guideType is LANDTOUR'), 'LandTourDetail legacy guideName schema note should point to TourGuide LANDTOUR');
  assert(schemaSource.includes('Canonical value is TourTerm where language is VI') && schemaSource.includes('Canonical value is TourTerm where language is EN'), 'LandTourDetail legacy term schema notes should point to TourTerm');
  const migrationNotes = fs.readFileSync('/workspace/docs/tour-migration-notes.md', 'utf8');
  assert(migrationNotes.includes('Field Ownership Matrix'), 'Tour migration notes should document the field ownership matrix');
  assert(migrationNotes.includes('Legacy Table Decisions') && migrationNotes.includes('FE/BE Mapping'), 'Tour migration notes should document legacy table decommission decisions and FE/BE mapping');
  assert(migrationNotes.includes('git_tour_details.agentName'), 'Tour migration notes should mark legacy GIT agent snapshot read-only');
  assert(migrationNotes.includes('git_tour_details.branch'), 'Tour migration notes should mark legacy GIT scope snapshots read-only');
  assert(migrationNotes.includes('land_tour_details.guideName'), 'Tour migration notes should mark legacy LandTour guide snapshot read-only');
  assert(migrationNotes.includes('land_tour_details.termsVi') && migrationNotes.includes('land_tour_details.termsEn'), 'Tour migration notes should mark legacy LandTour term snapshots read-only');
  assert(migrationNotes.includes('Already read-only at application level'), 'Tour migration notes should identify legacy GIT/LandTour snapshot fields that are already read-only');
  assert(migrationNotes.includes('GIT agent/customer') && migrationNotes.includes('LandTour terms'), 'Tour migration notes should keep FE/BE mapping for GIT and LandTour response aliases');
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
  await expect(
    '/api/tours',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'FIT',
        systemCode: `${run}-BAD-DATETIME-SYS`,
        tourCode: `${run}-BAD-DATETIME-TOUR`,
        name: 'Tour type API common bad datetime',
        startDate: '2026-07-01T00:00:00.000Z',
      }),
    },
    400,
    'common tour should reject ISO datetime startDate',
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
        customerName: 'Tour type API GIT customer',
        agentName: 'Tour type API GIT agent',
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
  assert(gitTour.gitTour.agentName === 'Tour type API GIT agent', 'GIT response should expose agentName from common TourCustomer AGENT row');
  const rawGitDetail = await prisma.gitTourDetail.findUnique({ where: { tourId: gitTour.id } });
  const gitAgentCustomer = await prisma.tourCustomer.findFirst({ where: { tourId: gitTour.id, customerType: 'AGENT' } });
  assert(rawGitDetail && rawGitDetail.agentName === null, 'GIT detail should not write legacy agentName snapshot');
  assert(gitAgentCustomer && gitAgentCustomer.name === 'Tour type API GIT agent', 'GIT agentName should be stored as common TourCustomer AGENT row');
  const gitListRows = await expect('/api/git-tours?search=Tour%20type%20API%20GIT%20agent', {}, 200, 'GIT list should search common agent customer');
  const gitListRow = gitListRows.find((row) => row.id === gitTour.id);
  assert(gitListRow && gitListRow.gitTour.agentName === 'Tour type API GIT agent', 'GIT list should overlay agentName from common TourCustomer AGENT row');
  assert(gitListRow.customers.length === 1 && gitListRow.customers[0].name === 'Tour type API GIT customer', 'GIT list should keep customer list focused on the primary customer');
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
        customerName: 'Tour type API LandTour customer',
        guideName: 'Tour type API LandTour guide',
        termsVi: 'LandTour dieu khoan VI',
        termsEn: 'LandTour English terms',
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
  assert(landTour.landTour.guideName === 'Tour type API LandTour guide', 'LandTour response should expose guideName from common TourGuide row');
  assert(landTour.landTour.termsVi === 'LandTour dieu khoan VI' && landTour.landTour.termsEn === 'LandTour English terms', 'LandTour response should expose terms from common TourTerm rows');
  const rawLandDetail = await prisma.landTourDetail.findUnique({ where: { tourId: landTour.id } });
  const landGuide = await prisma.tourGuide.findFirst({ where: { tourId: landTour.id, guideType: 'LANDTOUR' } });
  const landTerms = await prisma.tourTerm.findMany({ where: { tourId: landTour.id, termType: 'LANDTOUR' } });
  assert(rawLandDetail && rawLandDetail.guideName === null, 'LandTour detail should not write legacy guideName snapshot');
  assert(rawLandDetail.termsVi === null && rawLandDetail.termsEn === null, 'LandTour detail should not write legacy term snapshots');
  assert(landGuide && landGuide.name === 'Tour type API LandTour guide', 'LandTour guideName should be stored as common TourGuide LANDTOUR row');
  assert(landTerms.length === 2 && landTerms.some((term) => term.language === 'VI' && term.content === 'LandTour dieu khoan VI') && landTerms.some((term) => term.language === 'EN' && term.content === 'LandTour English terms'), 'LandTour terms should be stored as common TourTerm rows');
  const landListRows = await expect('/api/landtours?search=Tour%20type%20API%20LandTour%20guide', {}, 200, 'LandTour list should search common guide name');
  const landListRow = landListRows.find((row) => row.id === landTour.id);
  assert(landListRow && landListRow.landTour.guideName === 'Tour type API LandTour guide', 'LandTour list should overlay guideName from common TourGuide row');
  assert(landListRow._count.terms === 2, 'LandTour list should count common TourTerm rows');
  assert(!('guides' in landListRow), 'LandTour list should not expose guide payload just for guideName overlay');
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
