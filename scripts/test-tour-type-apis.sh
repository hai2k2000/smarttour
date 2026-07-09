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
const { validationExceptionFactory } = require('./apps/api/dist/validation-exception.factory');
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
  assert(gitCreateDtoContract.GIT_TOUR_LINK_AND_CUSTOMER_FIELDS.includes('customers'), 'GIT customers array should be grouped with linked/customer data');
  assert(!gitCreateDtoContract.GIT_TOUR_DETAIL_FIELDS.includes('agentName'), 'GIT agentName should not be classified as a pure detail field');
  assert(!gitCreateDtoContract.GIT_TOUR_CHILD_FIELDS.includes('customers'), 'GIT customers array should not be treated as a generic child payload bucket');
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
  const gitDtoSource = require('fs').readFileSync('/workspace/apps/api/src/modules/git-tours/dto/create-git-tour.dto.ts', 'utf8');
  assert(gitDtoSource.includes('GIT_TOUR_CODE_PATTERN') && gitDtoSource.includes('@MaxLength(50'), 'GIT DTO should cap and validate systemCode/tourCode format');
  assert(gitDtoSource.includes('@Max(100') && gitDtoSource.includes('@Min(0.000001'), 'GIT DTO should bound commissionRate and exchangeRate');
  assert(gitDtoSource.includes('compactChildRows') && gitDtoSource.includes('@Transform(compactChildRows)'), 'GIT DTO should compact empty nested array rows before validation/mapping');
  assert(gitCreateDtoContract.GIT_TOUR_CHILD_ARRAY_LIMIT === 100 && gitCreateDtoContract.GIT_TOUR_ATTACHMENT_ARRAY_LIMIT === 50, 'GIT DTO should expose explicit payload-size limits for child arrays');
  assert(gitDtoSource.includes('@ArrayMaxSize(GIT_TOUR_CHILD_ARRAY_LIMIT') && gitDtoSource.includes('@ArrayMaxSize(GIT_TOUR_ATTACHMENT_ARRAY_LIMIT'), 'GIT DTO should cap large child/attachment arrays');
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
  assert(coreSource.includes('quantity * budgetUnitPrice * exchangeRate') && coreSource.includes('quantity * confirmedUnitPrice * exchangeRate'), 'TourCoreService should calculate service amounts with exchangeRate before VAT');
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

function assertGitToursControllerContract() {
  const fs = require('fs');
  const controllerSource = fs.readFileSync('/workspace/apps/api/src/modules/git-tours/git-tours.controller.ts', 'utf8');
  const queryDtoSource = fs.readFileSync('/workspace/apps/api/src/modules/git-tours/dto/list-git-tours-query.dto.ts', 'utf8');
  assert(controllerSource.includes("@RequirePermissions('tour.view')") && controllerSource.includes("@Controller('git-tours')"), 'GitToursController list/detail should inherit tour.view permission');
  for (const route of ["@Get()", "@Get(':id')", "@Post()", "@Put(':id')", "@Patch(':id')", "@Delete(':id')", "@Post(':id/copy-services')"]) {
    assert(controllerSource.includes(route), `GitToursController should expose ${route}`);
  }
  assert(controllerSource.includes('update(@Param') && controllerSource.includes('patch(@Param') && controllerSource.includes('UpdateGitTourDto'), 'GitToursController should support PUT and PATCH update with UpdateGitTourDto');
  for (const method of ['create', 'update', 'patch', 'remove', 'copyServices']) {
    const methodIndex = controllerSource.indexOf(`${method}(`);
    assert(methodIndex >= 0, `GitToursController should expose ${method}`);
    const routeBlock = controllerSource.slice(Math.max(0, methodIndex - 180), methodIndex);
    assert(routeBlock.includes("@RequirePermissions('tour.manage')"), `GitToursController ${method} should require tour.manage`);
  }
  const copyServicesIndex = controllerSource.indexOf('copyServices(');
  const copyServicesBlock = controllerSource.slice(Math.max(0, copyServicesIndex - 220), copyServicesIndex + 220);
  assert(copyServicesBlock.includes("@Post(':id/copy-services')"), 'GitToursController copy-services route should remain a target tour sub-resource');
  assert(copyServicesBlock.includes('GitTourCopyServicesDto') && copyServicesBlock.includes('dto.sourceTourId'), 'GitToursController copy-services should use focused action DTO sourceTourId');
  assert(!copyServicesBlock.includes('tour.copy') && !copyServicesBlock.includes('copy-services.manage'), 'GitToursController copy-services should not introduce an unseeded special permission without RBAC catalog work');
  assert(controllerSource.includes('ListGitToursQueryDto') && controllerSource.includes('@Query() query: ListGitToursQueryDto'), 'GitToursController list should use a focused query DTO');
  assert(!controllerSource.includes("@Query('status')"), 'GitToursController list should not accept raw status query values');
  assert(queryDtoSource.includes('class ListGitToursQueryDto') && queryDtoSource.includes('@IsEnum(TourStatus') && queryDtoSource.includes('Trạng thái tour GIT không hợp lệ'), 'ListGitToursQueryDto should validate TourStatus with Vietnamese message');
  assert(queryDtoSource.includes('trimSearch') && queryDtoSource.includes('normalizeStatus') && queryDtoSource.includes('LIST_SEARCH_MAX_LENGTH'), 'ListGitToursQueryDto should trim search/status and cap search length');
  assert(queryDtoSource.includes('take?: number') && queryDtoSource.includes('MAX_GIT_TOURS_TAKE'), 'ListGitToursQueryDto should accept bounded take');
  assert(controllerSource.includes('this.gitToursService.list(query, request?.user)'), 'GitToursController list should pass the full validated query to service');
}



function assertLandToursControllerContract() {
  const fs = require('fs');
  const controllerSource = fs.readFileSync('/workspace/apps/api/src/modules/landtours/landtours.controller.ts', 'utf8');
  const queryDtoSource = fs.readFileSync('/workspace/apps/api/src/modules/landtours/dto/list-landtours-query.dto.ts', 'utf8');
  const pageSource = fs.readFileSync('/workspace/apps/web/app/landtours/page.tsx', 'utf8');
  const i18nSource = fs.readFileSync('/workspace/apps/web/app/i18n.ts', 'utf8');
  assert(controllerSource.includes("@RequirePermissions('tour.view')") && controllerSource.includes("@Controller('landtours')"), 'LandToursController list/detail should inherit tour.view permission');
  for (const route of ["@Get()", "@Get(':id')", "@Post()", "@Put(':id')", "@Patch(':id')", "@Delete(':id')", "@Post(':id/copy-services')"]) {
    assert(controllerSource.includes(route), `LandToursController should expose ${route}`);
  }
  assert(controllerSource.includes('update(@Param') && controllerSource.includes('patch(@Param') && controllerSource.includes('UpdateLandTourDto'), 'LandToursController should support PUT and PATCH update with UpdateLandTourDto');
  for (const method of ['create', 'update', 'patch', 'remove', 'copyServices']) {
    const methodIndex = controllerSource.indexOf(`${method}(`);
    assert(methodIndex >= 0, `LandToursController should expose ${method}`);
    const routeBlock = controllerSource.slice(Math.max(0, methodIndex - 180), methodIndex);
    assert(routeBlock.includes("@RequirePermissions('tour.manage')"), `LandToursController ${method} should require tour.manage`);
  }
  const copyServicesIndex = controllerSource.indexOf('copyServices(');
  const copyServicesBlock = controllerSource.slice(Math.max(0, copyServicesIndex - 220), copyServicesIndex + 220);
  assert(copyServicesBlock.includes("@Post(':id/copy-services')"), 'LandToursController copy-services route should remain a target tour sub-resource');
  assert(copyServicesBlock.includes('LandTourCopyServicesDto') && copyServicesBlock.includes('dto.sourceTourId'), 'LandToursController copy-services should use focused action DTO sourceTourId');
  assert(!copyServicesBlock.includes('tour.copy') && !copyServicesBlock.includes('copy-services.manage'), 'LandToursController copy-services should not introduce an unseeded special permission without RBAC catalog work');
  assert(controllerSource.includes('ListLandToursQueryDto') && controllerSource.includes('@Query() query: ListLandToursQueryDto'), 'LandToursController list should use a focused query DTO');
  assert(!controllerSource.includes("@Query('status')"), 'LandToursController list should not accept raw status query values');
  assert(queryDtoSource.includes('class ListLandToursQueryDto') && queryDtoSource.includes('@IsEnum(TourStatus') && queryDtoSource.includes('Trạng thái LandTour không hợp lệ'), 'ListLandToursQueryDto should validate TourStatus with Vietnamese message');
  assert(queryDtoSource.includes('trimSearch') && queryDtoSource.includes('normalizeStatus') && queryDtoSource.includes('LIST_SEARCH_MAX_LENGTH'), 'ListLandToursQueryDto should trim search/status and cap search length');
  assert(queryDtoSource.includes('take?: number') && queryDtoSource.includes('MAX_LANDTOURS_TAKE'), 'ListLandToursQueryDto should accept bounded take');
  assert(controllerSource.includes('this.landToursService.list(query, request?.user)'), 'LandToursController list should pass the full validated query to service');
  for (const field of ['tour.systemCode', 'tour.tourCode', 'tour.route', 'tour.customers[0]?.name', 'tour.landTour?.comboType', 'tour.landTour?.guideName', 'tour._count?.services', 'tour._count?.terms', 'tour.workflowStep']) {
    assert(pageSource.includes(field), `LandTours frontend list should keep using response field ${field}`);
  }
  assert(pageSource.includes('type LandToursPageProps') && pageSource.includes('searchParams?.search') && pageSource.includes('searchParams?.status'), 'LandTours frontend should read search/status query params');
  assert(pageSource.includes('function landToursPath') && pageSource.includes("params.set('search', keyword)") && pageSource.includes("params.set('status', normalizedStatus)") && pageSource.includes("params.set('take', '100')"), 'LandTours frontend should pass bounded list search/status to backend query contract');
  assert(pageSource.includes('className="filterBar"') && pageSource.includes('name="search"') && pageSource.includes('name="status"'), 'LandTours frontend should expose search/status filters');
  assert(pageSource.includes('paymentStatus: string') && pageSource.includes('viStatus(tour.paymentStatus)'), 'LandTours frontend should show backend paymentStatus');
  assert(pageSource.includes('paymentStatuses') && pageSource.includes('name="paymentStatus"') && pageSource.includes('updateLandTourWorkflow'), 'LandTours frontend should let users update paymentStatus with workflow/status together');
  assert(pageSource.includes('copyLandServices') && pageSource.includes('/copy-services') && pageSource.includes('sourceTourId') && pageSource.includes('#copy-'), 'LandTours frontend should expose guarded copy-services UI with explicit source tour');
  assert(pageSource.includes('#delete-') && pageSource.includes('deleteLandTour') && pageSource.includes('dangerButton'), 'LandTours frontend should require a delete confirmation modal instead of direct row delete');
  assert(pageSource.includes('redirectWithState') && pageSource.includes('statusPillDanger') && pageSource.includes('statusPillSuccess'), 'LandTours frontend should surface save/copy/delete action state from server actions');
  assert(pageSource.includes('summarizeTours') && pageSource.includes('_count?.services') && pageSource.includes('_count?.terms'), 'LandTours frontend should show list summary counts for service and term child rows');
  assert(pageSource.includes('if (salesDescription || salesUnitPrice > 0 || salesServiceType)') && pageSource.includes('if (operationDescription || operationUnitPrice > 0 || operationServiceType)'), 'LandTour create form should not always send empty service child rows');
  assert(!pageSource.includes('updateLandTourStatus'), 'LandTours frontend should not keep the old status-only update action');
  assert(pageSource.includes('SETTLED'), 'LandTours frontend status options should include the shared TourStatus.SETTLED value');
  assert(!pageSource.includes('NVDH') && !pageSource.includes('SL sales') && !pageSource.includes('Sales service'), 'LandTours frontend should not use unclear abbreviated or English form labels');
  assert(pageSource.includes('landWorkflowSteps') && pageSource.includes('name="workflowStep"') && pageSource.includes('viStatus(tour.workflowStep)'), 'LandTours frontend should display and update backend workflowStep');
  for (const step of ['LANDTOUR_INFO', 'LANDTOUR_COSTING', 'LANDTOUR_OPERATION', 'LANDTOUR_HANDOVER', 'LANDTOUR_SURVEY', 'LANDTOUR_COMPLETED']) {
    assert(i18nSource.includes(step), `LandTour workflow label ${step} should be localized for frontend display`);
    assert(pageSource.includes(step), `LandTour frontend workflow options should include ${step}`);
    assert(require('fs').readFileSync('/workspace/apps/api/src/modules/landtours/landtours.service.ts', 'utf8').includes(step), `LandTour backend workflow validator should include ${step}`);
  }
}

function assertGitToursFrontendContract() {
  const fs = require('fs');
  const pageSource = fs.readFileSync('/workspace/apps/web/app/git-tours/page.tsx', 'utf8');
  const i18nSource = fs.readFileSync('/workspace/apps/web/app/i18n.ts', 'utf8');
  assert(pageSource.includes('type GitToursPageProps') && pageSource.includes('searchParams?.search') && pageSource.includes('searchParams?.status'), 'GIT tours page should read search/status query params');
  assert(pageSource.includes('function gitToursPath') && pageSource.includes("params.set('search', keyword)") && pageSource.includes("params.set('status', normalizedStatus)") && pageSource.includes("params.set('take', '100')"), 'GIT tours page should pass bounded list search/status to backend query contract');
  assert(pageSource.includes('className="filterBar"') && pageSource.includes('name="search"') && pageSource.includes('name="status"'), 'GIT tours page should expose search/status filters');
  assert(pageSource.includes('workflowStep: string | null') && pageSource.includes('viStatus(tour.workflowStep)'), 'GIT tours page should show backend workflowStep');
  assert(pageSource.includes('paymentStatus: string') && pageSource.includes('viStatus(tour.paymentStatus)'), 'GIT tours page should show backend paymentStatus');
  assert(pageSource.includes('gitWorkflowSteps') && pageSource.includes('name="workflowStep"') && pageSource.includes('updateGitTourWorkflow'), 'GIT tours page should let users update workflow step explicitly');
  assert(pageSource.includes('paymentStatuses') && pageSource.includes('name="paymentStatus"') && pageSource.includes('invoiceStatuses') && pageSource.includes('name="invoiceStatus"'), 'GIT tours page should expose paymentStatus and invoiceStatus controls');
  assert(pageSource.includes('tour.gitTour?.invoiceStatus') && pageSource.includes('<th>Hóa đơn</th>'), 'GIT tours page should display invoice status in the list');
  assert(pageSource.includes('copyGitServices') && pageSource.includes('/copy-services') && pageSource.includes('sourceTourId') && pageSource.includes('#copy-'), 'GIT tours page should expose guarded copy-services UI with explicit source tour');
  assert(pageSource.includes('#delete-') && pageSource.includes('Xác nhận xóa'), 'GIT tours page should require a delete confirmation modal instead of direct row delete');
  assert(pageSource.includes('redirectWithState') && pageSource.includes('statusPillDanger') && pageSource.includes('statusPillSuccess'), 'GIT tours page should surface save/load action state from server actions');
  assert(pageSource.includes('summarizeTours') && pageSource.includes('Dòng doanh thu') && pageSource.includes('Dòng dịch vụ'), 'GIT tours page should show list summary counts for financial child rows');
  assert(pageSource.includes('if (revenueDescription || revenueUnitPrice > 0)') && pageSource.includes('if (budgetDescription || budgetUnitPrice > 0 || budgetServiceType)'), 'GIT create form should not always send empty revenue/service child rows');
  assert(!pageSource.includes('updateGitTourStatus'), 'GIT tours page should not keep the old status-only update action');
  assert(!pageSource.includes('autosave') && !pageSource.includes('auto-save'), 'GIT tours page should not pretend to autosave without a real client wizard contract');
  assert(pageSource.includes('SETTLED'), 'GIT tours page status options should include the shared TourStatus.SETTLED value');
  assert(!pageSource.includes('NVDH') && !pageSource.includes('CTV') && !pageSource.includes('DT / DV'), 'GIT tours page should not use unclear abbreviated Vietnamese labels');
  for (const step of ['GIT_INFO', 'GIT_COSTING', 'GIT_OPERATION', 'GIT_HANDOVER', 'GIT_SURVEY', 'GIT_COMPLETED']) {
    assert(i18nSource.includes(step), `GIT workflow label ${step} should be localized for frontend display`);
    assert(pageSource.includes(step), `GIT frontend workflow options should include ${step}`);
    assert(require('fs').readFileSync('/workspace/apps/api/src/modules/git-tours/git-tours.service.ts', 'utf8').includes(step), `GIT backend workflow validator should include ${step}`);
  }
  assert(i18nSource.includes('SETTLED'), 'Shared status label SETTLED should be localized for GIT status filters');
  assert(i18nSource.includes('PAID') && i18nSource.includes('PARTIAL') && i18nSource.includes('UNPAID') && i18nSource.includes('INVOICE'), 'Shared payment/invoice labels should be localized for GIT UI/report filters');
  const reportSource = require('fs').readFileSync('/workspace/apps/api/src/modules/reports/reports.service.ts', 'utf8');
  const reportsClientSource = require('fs').readFileSync('/workspace/apps/web/app/reports/ReportsClient.tsx', 'utf8');
  assert(reportSource.includes('tourPaymentStatus(query.paymentStatus)') && reportSource.includes('paymentStatus: this.tourPaymentStatus(query.paymentStatus)'), 'Reports should keep validated paymentStatus filter support for tour finance/reporting');
  assert(reportsClientSource.includes("'paymentStatus'") && reportsClientSource.includes('filters.paymentStatus') && reportsClientSource.includes('paymentOptions'), 'Reports frontend should keep paymentStatus filter controls');
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
    if (label === 'GIT') {
      assert(source.includes('prepareGitDto') && source.includes('GIT_WORKFLOW_STEPS') && source.includes('Bước workflow tour GIT không hợp lệ'), 'GIT should normalize/validate create/update data before TourCoreService writes root fields');
      assert(source.includes('ensureRemovable') && source.includes('orderId') && source.includes('operationForms') && source.includes('financeReceipts'), 'GIT remove should block tours with external operational/finance dependencies');
      assert(!source.includes('Number.isFinite(parsed) ? parsed : 0'), 'GIT numeric helper should not silently coerce invalid numbers to zero');
      assert(source.includes('validateChildLinks') && source.includes('Nhà cung cấp trong dịch vụ GIT không hợp lệ') && source.includes('Dịch vụ nhà cung cấp không thuộc nhà cung cấp đã chọn'), 'GIT should validate supplier links before replacing service/cost children');
      assert(source.includes('toServiceStatus') && source.includes('Trạng thái dịch vụ GIT không hợp lệ'), 'GIT should map UI service statuses into TourServiceStatus');
      assert(source.includes('Hãy chọn tour nguồn để sao chép dịch vụ GIT') && source.includes('Tour nguồn sao chép dịch vụ GIT phải khác tour đích'), 'GIT copyServices should require an explicit source different from target');
      assert(!source.includes('const sourceId = sourceTourId || targetTourId'), 'GIT copyServices should not silently copy from target when sourceTourId is missing');
      assert(!source.includes('Khach hang GIT') && !source.includes('GIT Customer'), 'GIT customer mapping should not create a fake default customer');
    }
    if (label === 'LandTour') {
      assert(source.includes('prepareLandTourDto') && source.includes('LANDTOUR_WORKFLOW_STEPS') && source.includes('Bước workflow LandTour không hợp lệ'), 'LandTour should normalize/validate create/update data before TourCoreService writes root fields');
      assert(source.includes('ensureRemovable') && source.includes('orderId') && source.includes('operationForms') && source.includes('financeReceipts'), 'LandTour remove should block tours with external operational/finance dependencies');
      assert(!source.includes('Number.isFinite(parsed) ? parsed : 0'), 'LandTour numeric helper should not silently coerce invalid numbers to zero');
      assert(source.includes('validateChildLinks') && source.includes('Nhà cung cấp trong dịch vụ LandTour không hợp lệ') && source.includes('Dịch vụ nhà cung cấp không thuộc nhà cung cấp đã chọn'), 'LandTour should validate supplier links before replacing service/cost children');
      assert(source.includes('toServiceStatus') && source.includes('Trạng thái dịch vụ LandTour không hợp lệ'), 'LandTour should map UI service statuses into TourServiceStatus');
      assert(source.includes('Hãy chọn tour nguồn để sao chép dịch vụ LandTour') && source.includes('Tour nguồn sao chép dịch vụ LandTour phải khác tour đích'), 'LandTour copyServices should require an explicit source different from target');
      assert(!source.includes('const sourceId = sourceTourId || targetTourId'), 'LandTour copyServices should not silently copy from target when sourceTourId is missing');
      assert(!source.includes('Khach hang landtour') && !source.includes('LandTour Customer'), 'LandTour customer mapping should not create a fake default customer');
      assert(source.includes('currentTerms') && source.includes('dto.termsVi !== undefined') && source.includes('dto.termsEn !== undefined'), 'LandTour term mapping should preserve the untouched language on partial update');
    }
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
  assertGitToursControllerContract();
  assertLandToursControllerContract();
  assertGitToursFrontendContract();
  assertTourRootOrchestrationBoundaries();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }));
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

  const viewToken = `tour-type-api-view-test.${crypto.randomBytes(24).toString('base64url')}`;
  const viewRole = await prisma.role.create({
    data: {
      code: `${run.toLowerCase()}-view-role`,
      name: 'Tour Type API View Role',
      permissions: { create: [{ permission: 'tour.view' }, { permission: 'data.scope.all' }] },
    },
  });
  const viewUser = await prisma.user.create({
    data: {
      username: `${run.toLowerCase()}-view-user`,
      email: `${run.toLowerCase()}-view@smarttour.local`,
      name: 'Tour Type API View User',
      passwordHash: 'not-used',
      roles: { create: { roleId: viewRole.id } },
    },
  });
  await prisma.userSession.create({
    data: {
      userId: viewUser.id,
      tokenHash: tokenHash(viewToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: `Bearer ${token}` };
  const viewHeaders = { authorization: `Bearer ${viewToken}` };

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

  function assertMessage(body, expected, label) {
    const messages = Array.isArray(body?.message) ? body.message : [body?.message].filter(Boolean);
    assert(messages.some((message) => String(message).includes(expected)), `${label}: missing message ${expected}, got ${JSON.stringify(body)}`);
  }

  function assertGitListRowShape(row, label) {
    assert(row && row.id && row.systemCode && row.tourCode && typeof row.status === 'string', `${label}: list row should expose root identity/status fields`);
    assert('paymentStatus' in row && 'workflowStep' in row && 'operatorOwner' in row && 'productType' in row, `${label}: list row should expose payment/workflow/operator/productType fields used by frontend/report flows`);
    assert(row.gitTour && 'agentName' in row.gitTour, `${label}: list row should expose gitTour.agentName snapshot overlay`);
    assert(Array.isArray(row.customers), `${label}: list row should expose customers array`);
    assert(row._count && typeof row._count.revenues === 'number' && typeof row._count.services === 'number' && typeof row._count.costs === 'number', `${label}: list row should expose child counts`);
    assert(!('services' in row) && !('revenues' in row), `${label}: list row should stay lightweight and not expose full edit child arrays`);
  }

  function assertGitDetailShape(row, label) {
    assert(row && row.id && row.systemCode && row.tourCode && typeof row.status === 'string', `${label}: detail response should expose root identity/status fields`);
    assert('paymentStatus' in row && 'workflowStep' in row && 'operatorOwner' in row && 'productType' in row, `${label}: detail response should expose payment/workflow/operator/productType fields`);
    assert(row.gitTour && 'agentName' in row.gitTour, `${label}: detail response should expose gitTour.agentName snapshot overlay`);
    for (const field of ['customers', 'revenues', 'services', 'costs', 'guides', 'attachments', 'surveys', 'logs']) {
      assert(Array.isArray(row[field]), `${label}: detail response should include ${field} array for edit/copy flows`);
    }
  }

  function assertLandListRowShape(row, label) {
    assert(row && row.id && row.systemCode && row.tourCode && typeof row.status === 'string', `${label}: list row should expose root identity/status fields`);
    assert('paymentStatus' in row && 'workflowStep' in row && 'operatorOwner' in row, `${label}: list row should expose payment/workflow/operator fields used by frontend`);
    assert(row.landTour && 'comboType' in row.landTour && 'guideName' in row.landTour, `${label}: list row should expose landTour combo/guide snapshot overlay`);
    assert(Array.isArray(row.customers), `${label}: list row should expose customers array`);
    assert(row._count && typeof row._count.services === 'number' && typeof row._count.terms === 'number', `${label}: list row should expose service/term counts`);
    assert(!('services' in row) && !('revenues' in row) && !('guides' in row), `${label}: list row should stay lightweight and not expose full edit child arrays`);
  }

  function assertLandDetailShape(row, label) {
    assert(row && row.id && row.systemCode && row.tourCode && typeof row.status === 'string', `${label}: detail response should expose root identity/status fields`);
    assert('paymentStatus' in row && 'workflowStep' in row && 'operatorOwner' in row, `${label}: detail response should expose payment/workflow/operator fields`);
    assert(row.landTour && 'comboType' in row.landTour && 'guideName' in row.landTour && 'termsVi' in row.landTour && 'termsEn' in row.landTour, `${label}: detail response should expose landTour guide/term overlays`);
    for (const field of ['customers', 'revenues', 'services', 'costs', 'guides', 'terms', 'attachments', 'surveys', 'logs']) {
      assert(Array.isArray(row[field]), `${label}: detail response should include ${field} array for edit/copy flows`);
    }
  }

  const supplierCategory = await prisma.supplierCategory.create({ data: { name: `${run} Supplier Category` } });
  const gitSupplier = await prisma.supplier.create({
    data: {
      categoryId: supplierCategory.id,
      supplierCode: `${run}-SUP`,
      name: 'Tour type API GIT supplier',
    },
  });
  const gitSupplierService = await prisma.supplierService.create({
    data: {
      supplierId: gitSupplier.id,
      sku: `${run}-SUP-SERVICE`,
      serviceName: 'Tour type API GIT supplier service',
      quantity: 1,
      netPrice: 1000,
      sellingPrice: 1200,
    },
  });

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
  const cancelledCommonTour = await expect(
    `/api/tours/${commonTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) },
    200,
    'cancel common tour via PATCH',
  );
  assert(cancelledCommonTour.status === 'CANCELLED', 'common tour PATCH should allow cancellation');
  await expect(
    `/api/tours/${commonTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    400,
    'common tour should not reopen from CANCELLED status',
  );
  await expect(`/api/tours/${commonTour.id}/close`, { method: 'POST', body: JSON.stringify({ note: 'cannot close cancelled tour' }) }, 400, 'common tour close should reject CANCELLED status');
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

  const missingGitField = await expect(
    '/api/git-tours',
    { method: 'POST', body: JSON.stringify({ tourCode: `${run}-GIT-MISSING`, name: 'Tour type API GIT missing system code' }) },
    400,
    'GIT should reject missing systemCode',
  );
  assertMessage(missingGitField, 'Mã hệ thống tour GIT phải là chuỗi ký tự', 'GIT missing field should use Vietnamese validation message');
  const invalidGitNumber = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-NUMBER-SYS`,
        tourCode: `${run}-GIT-BAD-NUMBER`,
        name: 'Tour type API GIT bad number',
        commissionRate: 'abc',
      }),
    },
    400,
    'GIT should reject invalid numeric fields',
  );
  assertMessage(invalidGitNumber, 'Tỷ lệ hoa hồng GIT phải là số hợp lệ', 'GIT invalid number should use Vietnamese validation message');
  const invalidGitCode = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run} BAD CODE`,
        tourCode: `${run}-GIT-BAD-CODE`,
        name: 'Tour type API GIT bad code',
      }),
    },
    400,
    'GIT should reject systemCode with spaces',
  );
  assertMessage(invalidGitCode, 'Mã hệ thống tour GIT chỉ được gồm', 'GIT invalid code should use Vietnamese validation message');
  const invalidGitCommissionMax = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-COMMISSION-SYS`,
        tourCode: `${run}-GIT-BAD-COMMISSION`,
        name: 'Tour type API GIT bad commission',
        commissionRate: 101,
      }),
    },
    400,
    'GIT should reject commissionRate above 100',
  );
  assertMessage(invalidGitCommissionMax, 'Tỷ lệ hoa hồng GIT không được vượt quá 100%', 'GIT commission max should use Vietnamese validation message');
  const invalidGitExchangeRate = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-EXCHANGE-SYS`,
        tourCode: `${run}-GIT-BAD-EXCHANGE`,
        name: 'Tour type API GIT bad exchange rate',
        exchangeRate: 0,
      }),
    },
    400,
    'GIT should reject zero exchangeRate',
  );
  assertMessage(invalidGitExchangeRate, 'Tỷ giá tour GIT phải lớn hơn 0', 'GIT exchangeRate min should use Vietnamese validation message');
  const invalidGitChildArray = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-CHILD-SYS`,
        tourCode: `${run}-GIT-BAD-CHILD`,
        name: 'Tour type API GIT bad child array',
        revenues: {},
      }),
    },
    400,
    'GIT should reject non-array child payloads',
  );
  assertMessage(invalidGitChildArray, 'Doanh thu tour GIT phải là danh sách hợp lệ', 'GIT child array validation should use Vietnamese message');
  const oversizedGitChildArray = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BIG-CHILD-SYS`,
        tourCode: `${run}-GIT-BIG-CHILD`,
        name: 'Tour type API GIT oversized child array',
        revenues: Array.from({ length: gitCreateDtoContract.GIT_TOUR_CHILD_ARRAY_LIMIT + 1 }, (_, index) => ({ description: `Revenue ${index}`, quantity: 1, unitPrice: 1 })),
      }),
    },
    400,
    'GIT should reject oversized child arrays',
  );
  assertMessage(oversizedGitChildArray, 'Doanh thu tour GIT không được vượt quá 100 dòng', 'GIT child array size validation should use Vietnamese message');
  const invalidGitDate = await expect(
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
  assertMessage(invalidGitDate, 'Ngày khởi hành GIT phải có định dạng YYYY-MM-DD', 'GIT invalid date should use Vietnamese validation message');
  const invalidGitDateRange = await expect(
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
  assertMessage(invalidGitDateRange, 'Ngày khởi hành phải trước hoặc bằng ngày kết thúc', 'GIT invalid date range should use Vietnamese service message');
  const invalidGitSupplier = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-SUPPLIER-SYS`,
        tourCode: `${run}-GIT-BAD-SUPPLIER`,
        name: 'Tour type API GIT bad supplier',
        budgetServices: [{ serviceType: 'GIT_HOTEL', supplierId: crypto.randomUUID(), quantity: 1, unitPrice: 1000 }],
      }),
    },
    400,
    'GIT should validate supplier links before replacing services',
  );
  assertMessage(invalidGitSupplier, 'Nhà cung cấp trong dịch vụ GIT không hợp lệ', 'GIT supplier validation should use Vietnamese service message');
  const invalidGitNestedNumber = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-SERVICE-NUMBER-SYS`,
        tourCode: `${run}-GIT-BAD-SERVICE-NUMBER`,
        name: 'Tour type API GIT bad service number',
        budgetServices: [{ serviceType: 'GIT_HOTEL', quantity: 1, unitPrice: 1000, exchangeRate: 'abc' }],
      }),
    },
    400,
    'GIT should reject invalid nested service numeric fields',
  );
  assertMessage(invalidGitNestedNumber, 'exchangeRate phải là số hợp lệ', 'GIT nested number validation should use Vietnamese service message');
  const invalidGitNegativeNestedNumber = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-NEG-SERVICE-SYS`,
        tourCode: `${run}-GIT-BAD-NEG-SERVICE`,
        name: 'Tour type API GIT negative service number',
        budgetServices: [{ serviceType: 'GIT_HOTEL', quantity: 1, unitPrice: -1000, exchangeRate: 1 }],
      }),
    },
    400,
    'GIT should reject negative nested service numeric fields',
  );
  assertMessage(invalidGitNegativeNestedNumber, 'budgetUnitPrice không được âm', 'GIT negative nested number should use Vietnamese service message');
  const invalidGitZeroQuantity = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-BAD-ZERO-QTY-SYS`,
        tourCode: `${run}-GIT-BAD-ZERO-QTY`,
        name: 'Tour type API GIT zero quantity service',
        budgetServices: [{ serviceType: 'GIT_HOTEL', quantity: 0, unitPrice: 1000, exchangeRate: 1 }],
      }),
    },
    400,
    'GIT should reject zero nested service quantity instead of defaulting it to one',
  );
  assertMessage(invalidGitZeroQuantity, 'quantity phải lớn hơn 0', 'GIT zero nested quantity should use Vietnamese service message');
  const gitZeroUnitPriceTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-ZERO-UNIT-SYS`,
        tourCode: `${run}-GIT-ZERO-UNIT`,
        name: 'Tour type API GIT zero unit price service',
        budgetServices: [{ serviceType: 'GIT_HOTEL', quantity: 1, unitPrice: 0, budgetUnitPrice: 1000, exchangeRate: 1 }],
      }),
    },
    201,
    'GIT should preserve explicit zero unitPrice instead of falling through to budgetUnitPrice alias',
  );
  const gitZeroUnitPriceService = gitZeroUnitPriceTour.services.find((service) => service.serviceType === 'GIT_HOTEL');
  assert(gitZeroUnitPriceService && Number(gitZeroUnitPriceService.budgetUnitPrice) === 0 && Number(gitZeroUnitPriceService.budgetAmount) === 0, 'GIT should preserve explicit zero unitPrice and zero calculated budget amount');
  const gitZeroExplicitAmountTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-ZERO-AMOUNT-SYS`,
        tourCode: `${run}-GIT-ZERO-AMOUNT`,
        name: 'Tour type API GIT zero explicit amount service',
        budgetServices: [{ serviceType: 'GIT_HOTEL', quantity: 1, unitPrice: 1000, amount: 0, exchangeRate: 1 }],
      }),
    },
    201,
    'GIT should preserve explicit zero amount instead of recalculating from unit price',
  );
  const gitZeroExplicitAmountService = gitZeroExplicitAmountTour.services.find((service) => service.serviceType === 'GIT_HOTEL');
  assert(gitZeroExplicitAmountService && Number(gitZeroExplicitAmountService.budgetAmount) === 0, 'GIT should preserve explicit zero budget amount override');
  const gitZeroCostAmountTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-ZERO-COST-SYS`,
        tourCode: `${run}-GIT-ZERO-COST`,
        name: 'Tour type API GIT zero cost amount',
        costs: [{ costType: 'GIT_COST', description: 'Zero cost amount', amount: 0, expectedAmount: 1000 }],
      }),
    },
    201,
    'GIT should preserve explicit zero cost amount instead of falling through to expectedAmount alias',
  );
  assert(gitZeroCostAmountTour.costs.length === 1 && Number(gitZeroCostAmountTour.costs[0].expectedAmount) === 0, 'GIT should preserve explicit zero cost expected amount');

  const gitArrayCustomerTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-ARRAY-CUSTOMER-SYS`,
        tourCode: `${run}-GIT-ARRAY-CUSTOMER`,
        name: 'Tour type API GIT array customer',
        customers: [
          {},
          { name: 'Tour type API GIT array primary customer', phone: '0900000000', isPrimary: true },
          { customerType: 'AGENT', name: 'Tour type API GIT array agent' },
        ],
      }),
    },
    201,
    'create GIT tour with customers array',
  );
  assert(gitArrayCustomerTour.customers.length === 2, 'GIT should strip empty customer rows and persist valid customer rows');
  assert(gitArrayCustomerTour.customers.some((customer) => customer.name === 'Tour type API GIT array primary customer' && customer.isPrimary === true), 'GIT customers array should preserve explicit primary customer');
  assert(gitArrayCustomerTour.gitTour.agentName === 'Tour type API GIT array agent', 'GIT customers array should expose AGENT row through response overlay');

  const gitTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run.toLowerCase()}-git-sys`,
        tourCode: `${run.toLowerCase()}-git`,
        name: 'Tour type API GIT tour',
        route: 'Tour type API GIT common route',
        itinerarySummary: 'Tour type API GIT detail itinerary',
        customerName: 'Tour type API GIT customer',
        agentName: 'Tour type API GIT agent',
        operatorOwner: 'Tour type API GIT operator',
        paymentStatus: 'partial',
        invoiceStatus: ' requested ',
        branch: ` ${run}-GIT-BRANCH `,
        department: ` ${run}-GIT-DEPT `,
        customerSource: '  Website  ',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        revenues: [{ description: 'GIT revenue package', quantity: 2, unitPrice: 500, vat: 10 }],
        budgetServices: [{ serviceType: 'GIT_HOTEL', supplierId: gitSupplier.id, supplierServiceId: gitSupplierService.id, description: 'GIT copied budget service', quantity: 2, unitPrice: 1000, amount: 2000, currency: 'USD', exchangeRate: 2, vat: 10, status: 'confirmed' }],
        operationServices: [{ serviceType: 'GIT_CAR', supplierId: gitSupplier.id, supplierServiceId: gitSupplierService.id, description: 'GIT copied operation service', quantity: 1, confirmedUnitPrice: 500, exchangeRate: 2, vat: 8, status: 'operating' }],
      }),
    },
    201,
    'create GIT tour',
  );
  assert(gitTour.id, 'GIT create should return id');
  assert(gitTour.systemCode === `${run}-GIT-SYS` && gitTour.tourCode === `${run}-GIT`, 'GIT create should uppercase systemCode and tourCode');
  assert(gitTour.workflowStep === 'GIT_INFO', 'GIT create should initialize default workflow step');
  assert(gitTour.paymentStatus === 'PARTIAL', 'GIT create should normalize paymentStatus');
  assert(gitTour.branch === `${run}-GIT-BRANCH` && gitTour.department === `${run}-GIT-DEPT` && gitTour.customerSource === 'Website', 'GIT create should trim branch/department/customerSource root fields');
  assert(gitTour.gitTour.invoiceStatus === 'requested', 'GIT create should trim invoiceStatus detail field without changing user-defined value');
  assertGitDetailShape(gitTour, 'GIT create response');
  assert(gitTour.logs.some((log) => log.action === 'CREATE_GIT_TOUR' && log.metadata?.systemCode === `${run}-GIT-SYS`), 'GIT create should write standardized create log metadata');
  assert(gitTour.revenues.length === 1 && Number(gitTour.revenues[0].amount) === 1100, 'GIT should map revenue amount with VAT');
  assert(gitTour.services.length === 2 && gitTour.services.some((service) => service.confirmationStatus === 'CONFIRMED') && gitTour.services.some((service) => service.confirmationStatus === 'OPERATING'), 'GIT should map service status strings into TourServiceStatus');
  assert(gitTour.services.every((service) => service.supplierId === gitSupplier.id && service.supplierServiceId === gitSupplierService.id), 'GIT should persist supplier and supplier-service links on services');
  const gitBudgetService = gitTour.services.find((service) => service.serviceType === 'GIT_HOTEL');
  const gitOperationService = gitTour.services.find((service) => service.serviceType === 'GIT_CAR');
  assert(gitBudgetService && Number(gitBudgetService.budgetAmount) === 2000 && Number(gitBudgetService.exchangeRate) === 2 && gitBudgetService.currency === 'USD', 'GIT should preserve explicit budget amount and service exchange metadata');
  assert(gitOperationService && Number(gitOperationService.confirmedAmount) === 1080 && Number(gitOperationService.exchangeRate) === 2, 'GIT should calculate operation amount with exchangeRate and VAT');
  assert(gitTour.route === 'Tour type API GIT common route', 'GIT root route should use the common route field');
  assert(gitTour.gitTour.itinerarySummary === 'Tour type API GIT detail itinerary', 'GIT detail should keep itinerarySummary separate from root route');
  assert(gitTour.gitTour.agentName === 'Tour type API GIT agent', 'GIT response should expose agentName from common TourCustomer AGENT row');
  const rawGitDetail = await prisma.gitTourDetail.findUnique({ where: { tourId: gitTour.id } });
  const gitAgentCustomer = await prisma.tourCustomer.findFirst({ where: { tourId: gitTour.id, customerType: 'AGENT' } });
  assert(rawGitDetail && rawGitDetail.agentName === null, 'GIT detail should not write legacy agentName snapshot');
  assert(gitAgentCustomer && gitAgentCustomer.name === 'Tour type API GIT agent', 'GIT agentName should be stored as common TourCustomer AGENT row');
  const gitDetail = await expect(`/api/git-tours/${gitTour.id}`, {}, 200, 'GIT detail should load full edit data');
  assertGitDetailShape(gitDetail, 'GIT detail response');
  assert(gitDetail.customers.length === 2 && gitDetail.revenues.length === 1 && gitDetail.services.length === 2 && Array.isArray(gitDetail.logs), 'GIT detail should include edit wizard relations');
  await expect(`/api/git-tours/${gitTour.id}`, { headers: viewHeaders }, 200, 'GIT detail should allow tour.view users');
  await expect(`/api/git-tours/${gitTour.id}`, { method: 'PUT', headers: viewHeaders, body: JSON.stringify({ status: 'COMPLETED' }) }, 403, 'GIT PUT should reject tour.view-only users');
  await expect(`/api/git-tours/${gitTour.id}/copy-services`, { method: 'POST', headers: viewHeaders, body: JSON.stringify({ sourceTourId: gitTour.id }) }, 403, 'GIT copy-services should reject tour.view-only users');
  const gitListRows = await expect('/api/git-tours?search=Tour%20type%20API%20GIT%20agent', {}, 200, 'GIT list should search common agent customer');
  const gitListRow = gitListRows.find((row) => row.id === gitTour.id);
  assertGitListRowShape(gitListRow, 'GIT list response');
  const viewGitListRows = await expect('/api/git-tours?status=upcoming', { headers: viewHeaders }, 200, 'GIT list should allow tour.view users');
  assert(viewGitListRows.some((row) => row.id === gitTour.id), 'GIT tour.view list should include scoped matching GIT tour');
  assert(gitListRow && gitListRow.gitTour.agentName === 'Tour type API GIT agent', 'GIT list should overlay agentName from common TourCustomer AGENT row');
  assert(gitListRow.customers.length === 1 && gitListRow.customers[0].name === 'Tour type API GIT customer', 'GIT list should keep customer list focused on the primary customer');
  for (const [query, label] of [
    [`${run}-GIT-SYS`, 'systemCode'],
    [`${run}-GIT`, 'tourCode'],
    ['Tour type API GIT customer', 'customerName'],
    ['Tour type API GIT operator', 'operatorOwner'],
  ]) {
    const rows = await expect(`/api/git-tours?search=${encodeURIComponent(query)}`, {}, 200, `GIT list should search ${label}`);
    assert(rows.some((row) => row.id === gitTour.id), `GIT list search by ${label} should find the tour`);
  }
  const gitStatusRows = await expect('/api/git-tours?status=upcoming', {}, 200, 'GIT list should filter by initial status');
  assert(gitStatusRows.some((row) => row.id === gitTour.id), 'GIT status filter should include matching upcoming tour');
  await expect(
    '/api/git-tours',
    {
      method: 'POST',
      headers: viewHeaders,
      body: JSON.stringify({ systemCode: `${run}-GIT-VIEW-FORBIDDEN`, tourCode: `${run}-GIT-VIEW-FORBIDDEN`, name: 'Tour type API GIT forbidden create' }),
    },
    403,
    'GIT create should reject tour.view-only users',
  );
  const missingGitDetail = await expect(`/api/git-tours/${crypto.randomUUID()}`, {}, 404, 'GIT missing detail should return Vietnamese not-found message');
  assertMessage(missingGitDetail, 'Không tìm thấy tour GIT', 'GIT missing detail should use Vietnamese service message');
  const duplicateGitSystemCode = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-SYS`,
        tourCode: `${run}-GIT-DUP`,
        name: 'Tour type API GIT duplicate system code',
      }),
    },
    409,
    'GIT should reject duplicate systemCode',
  );
  assertMessage(duplicateGitSystemCode, 'Mã hệ thống tour GIT đã tồn tại', 'GIT duplicate systemCode should use Vietnamese conflict message');
  const invalidGitPartialDateRange = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ endDate: '2026-07-31' }) },
    400,
    'GIT partial update should reject endDate before current startDate',
  );
  assertMessage(invalidGitPartialDateRange, 'Ngày khởi hành phải trước hoặc bằng ngày kết thúc', 'GIT partial date range should use Vietnamese service message');
  const patchedGitTour = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch GIT tour',
  );
  assert(patchedGitTour.status === 'RUNNING', 'GIT PATCH should update lifecycle status');
  assert(patchedGitTour.customers.some((customer) => customer.name === 'Tour type API GIT customer'), 'GIT partial status update should not replace customers');
  assert(patchedGitTour.services.length === 2 && patchedGitTour.services.some((service) => service.serviceType === 'GIT_HOTEL') && patchedGitTour.services.some((service) => service.serviceType === 'GIT_CAR'), 'GIT partial status update should not replace services');
  assert(patchedGitTour.revenues.length === 1, 'GIT partial status update should not replace revenues');
  assert(patchedGitTour.logs.some((log) => log.action === 'UPDATE_GIT_TOUR' && log.metadata?.changedFields?.includes('status')), 'GIT update should write changed field metadata');
  const putGitTour = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PUT', body: JSON.stringify({ paymentStatus: 'paid', invoiceStatus: 'ISSUED' }) },
    200,
    'PUT GIT tour should share update contract with frontend-compatible PATCH',
  );
  assertGitDetailShape(putGitTour, 'GIT PUT update response');
  assert(putGitTour.paymentStatus === 'PAID', 'GIT PUT should normalize and update paymentStatus');
  assert(putGitTour.gitTour.invoiceStatus === 'ISSUED', 'GIT PUT should update invoiceStatus detail field');
  assert(putGitTour.services.length === 2 && putGitTour.revenues.length === 1 && putGitTour.customers.length === 2, 'GIT PUT partial update should preserve edit children');
  const invalidGitWorkflowStep = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'WRONG_STEP' }) },
    400,
    'GIT should reject invalid workflow step',
  );
  assertMessage(invalidGitWorkflowStep, 'Bước workflow tour GIT không hợp lệ', 'GIT invalid workflowStep should use Vietnamese service message');
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
        bookingDate: ' ',
        paymentDueDate: '',
        startDate: ' ',
        endDate: '',
        customers: [{}],
        revenues: [{}],
        budgetServices: [{}],
        operationServices: [{}],
        attachments: [{}],
      }),
    },
    201,
    'create GIT copy target',
  );
  const copiedGitServices = await expect(
    `/api/git-tours/${gitCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({ sourceTourId: gitTour.id }) },
    200,
    'copy GIT services',
  );
  assert(gitCopyTarget.customers.length === 0, 'GIT create without customerName should not create a fake default customer');
  assert(gitCopyTarget.revenues.length === 0 && gitCopyTarget.services.length === 0 && gitCopyTarget.attachments.length === 0, 'GIT DTO should strip empty child rows before create mapping');
  assert(gitCopyTarget.bookingDate === null && gitCopyTarget.startDate === null, 'GIT DTO should trim blank optional dates instead of storing invalid date values');
  const missingGitCopySource = await expect(
    `/api/git-tours/${gitCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({}) },
    400,
    'GIT copy-services should require explicit sourceTourId',
  );
  assertMessage(missingGitCopySource, 'Hãy chọn tour nguồn để sao chép dịch vụ GIT', 'GIT copy-services missing source should use Vietnamese service message');
  const sameGitCopySource = await expect(
    `/api/git-tours/${gitCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({ sourceTourId: gitCopyTarget.id }) },
    400,
    'GIT copy-services should reject same source and target',
  );
  assertMessage(sameGitCopySource, 'Tour nguồn sao chép dịch vụ GIT phải khác tour đích', 'GIT copy-services same source should use Vietnamese service message');
  const notFoundGitCopySource = await expect(
    `/api/git-tours/${gitCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({ sourceTourId: crypto.randomUUID() }) },
    404,
    'GIT copy-services should reject missing source tour',
  );
  assertMessage(notFoundGitCopySource, 'Không tìm thấy tour nguồn', 'GIT copy-services missing source tour should use Vietnamese service message');
  assertGitDetailShape(copiedGitServices, 'GIT copy-services response');
  assert(copiedGitServices.services.length === 2, 'GIT copy-services should copy budget and operation common TourService rows');
  const copiedBudgetService = copiedGitServices.services.find((service) => service.serviceType === 'GIT_HOTEL');
  const copiedOperationService = copiedGitServices.services.find((service) => service.serviceType === 'GIT_CAR');
  assert(copiedBudgetService && copiedOperationService, 'GIT copy-services should preserve serviceType through TourCore clone helper');
  assert(copiedBudgetService.supplierId === gitSupplier.id && copiedBudgetService.supplierServiceId === gitSupplierService.id, 'GIT copy-services should preserve supplier links');
  assert(Number(copiedBudgetService.budgetAmount) === 2000 && Number(copiedBudgetService.vat) === 10 && Number(copiedBudgetService.exchangeRate) === 2 && copiedBudgetService.currency === 'USD', 'GIT copy-services should preserve explicit budget amount, VAT, currency and exchangeRate');
  assert(Number(copiedOperationService.confirmedAmount) === 1080 && Number(copiedOperationService.vat) === 8 && Number(copiedOperationService.exchangeRate) === 2, 'GIT copy-services should preserve calculated operation amount, VAT and exchangeRate');
  assert(copiedBudgetService.confirmationStatus === 'CONFIRMED' && copiedOperationService.confirmationStatus === 'OPERATING', 'GIT copy-services should preserve normalized service statuses');
  assert(copiedGitServices.logs.some((log) => log.action === 'COPY_GIT_SERVICES' && log.metadata?.sourceTourId === gitTour.id), 'GIT copy-services should write source/target log metadata');
  const lowercaseGitStatusRows = await expect('/api/git-tours?status=running', {}, 200, 'GIT lowercase status query');
  assert(lowercaseGitStatusRows.some((row) => row.id === gitTour.id), 'GIT lowercase status query should include running tour');
  const spacedGitStatusRows = await expect('/api/git-tours?status=%20running%20', {}, 200, 'GIT spaced lowercase status query');
  assert(spacedGitStatusRows.some((row) => row.id === gitTour.id), 'GIT status query DTO should trim and normalize status');
  const invalidGitStatusQuery = await expect('/api/git-tours?status=WRONG', {}, 400, 'GIT invalid status query');
  assertMessage(invalidGitStatusQuery, 'Trạng thái tour GIT không hợp lệ', 'GIT invalid status query should use Vietnamese validation message');
  const gitLinkedOrder = await prisma.order.create({ data: { type: 'GIT_COMBO', systemCode: `${run}-ORDER-GIT`, name: 'Tour type API linked order' } });
  const gitOrderLinkedTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-ORDER-LINKED-SYS`,
        tourCode: `${run}-GIT-ORDER-LINKED`,
        name: 'Tour type API GIT order linked',
        orderId: gitLinkedOrder.id,
      }),
    },
    201,
    'create GIT tour linked to order',
  );
  const blockedGitRemove = await expect(`/api/git-tours/${gitOrderLinkedTour.id}`, { method: 'DELETE' }, 400, 'GIT remove should block tour linked to order/external dependency');
  assertMessage(blockedGitRemove, 'Không thể xóa tour GIT đã phát sinh', 'GIT blocked remove should use Vietnamese service message');
  const blockedCommonGitRemove = await expect(`/api/tours/${gitOrderLinkedTour.id}`, { method: 'DELETE' }, 400, 'common Tour remove should not bypass dependency guard for GIT tours');
  assertMessage(blockedCommonGitRemove, 'Không thể xóa tour đã phát sinh', 'common Tour blocked remove should use Vietnamese service message');
  await expect(`/api/git-tours/${gitCopyTarget.id}`, { method: 'DELETE', headers: viewHeaders }, 403, 'GIT delete should reject tour.view-only users');
  const removedGitTour = await expect(`/api/git-tours/${gitCopyTarget.id}`, { method: 'DELETE' }, 200, 'GIT remove should soft-delete target tour');
  assert(removedGitTour.deletedAt && removedGitTour.status === 'CANCELLED', 'GIT remove should cancel and soft-delete the common Tour owner');
  const removedGitDetail = await expect(`/api/git-tours/${gitCopyTarget.id}`, {}, 404, 'GIT detail should hide soft-deleted tour');
  assertMessage(removedGitDetail, 'Không tìm thấy tour GIT', 'GIT removed detail should use Vietnamese not-found message');

  const invalidLandCalendarDate = await expect(
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
  assertMessage(invalidLandCalendarDate, 'startDate kh\u00f4ng h\u1ee3p l\u1ec7', 'LandTour invalid calendar date should use Vietnamese service message');
  const invalidLandDateRange = await expect(
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
  assertMessage(invalidLandDateRange, 'Ng\u00e0y kh\u1edfi h\u00e0nh ph\u1ea3i tr\u01b0\u1edbc ho\u1eb7c b\u1eb1ng ng\u00e0y k\u1ebft th\u00fac', 'LandTour invalid date range should use Vietnamese service message');
  const invalidLandDateFormat = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-BAD-DATETIME-SYS`,
        tourCode: `${run}-LAND-BAD-DATETIME`,
        name: 'Tour type API LandTour bad datetime',
        startDate: '2026-09-01T00:00:00.000Z',
      }),
    },
    400,
    'LandTour should reject ISO datetime startDate',
  );
  assertMessage(invalidLandDateFormat, 'Ng\u00e0y kh\u1edfi h\u00e0nh LandTour ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng YYYY-MM-DD', 'LandTour invalid date format should use Vietnamese validation message');
  const invalidLandSupplier = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-BAD-SUPPLIER-SYS`,
        tourCode: `${run}-LAND-BAD-SUPPLIER`,
        name: 'Tour type API LandTour bad supplier',
        salesServices: [{ serviceType: 'LAND_CAR', supplierId: crypto.randomUUID(), quantity: 1, unitPrice: 1000 }],
      }),
    },
    400,
    'LandTour should validate supplier links before replacing services',
  );
  assertMessage(invalidLandSupplier, 'Nhà cung cấp trong dịch vụ LandTour không hợp lệ', 'LandTour supplier validation should use Vietnamese service message');
  const invalidLandExchangeRate = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-BAD-EXCHANGE-SYS`,
        tourCode: `${run}-LAND-BAD-EXCHANGE`,
        name: 'Tour type API LandTour bad exchange rate',
        exchangeRate: 0,
      }),
    },
    400,
    'LandTour should reject zero exchangeRate',
  );
  assertMessage(invalidLandExchangeRate, 'Tỷ giá LandTour phải lớn hơn 0', 'LandTour exchangeRate min should use Vietnamese validation message');

  const invalidLandNumber = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-BAD-NUMBER-SYS`,
        tourCode: `${run}-LAND-BAD-NUMBER`,
        name: 'Tour type API LandTour bad number',
        exchangeRate: 'abc',
      }),
    },
    400,
    'LandTour should reject invalid numeric fields',
  );
  assertMessage(invalidLandNumber, 'T\u1ef7 gi\u00e1 LandTour ph\u1ea3i l\u00e0 s\u1ed1 h\u1ee3p l\u1ec7', 'LandTour invalid number should use Vietnamese validation message');
  const missingLandSystemCode = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        tourCode: `${run}-LAND-MISSING-SYS`,
        name: 'Tour type API LandTour missing system code',
      }),
    },
    400,
    'LandTour should reject missing systemCode',
  );
  assertMessage(missingLandSystemCode, 'M\u00e3 h\u1ec7 th\u1ed1ng LandTour ph\u1ea3i l\u00e0 chu\u1ed7i k\u00fd t\u1ef1', 'LandTour missing systemCode should use Vietnamese validation message');
  const missingLandTourCode = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-MISSING-TOUR-SYS`,
        name: 'Tour type API LandTour missing tour code',
      }),
    },
    400,
    'LandTour should reject missing tourCode',
  );
  assertMessage(missingLandTourCode, 'M\u00e3 tour LandTour ph\u1ea3i l\u00e0 chu\u1ed7i k\u00fd t\u1ef1', 'LandTour missing tourCode should use Vietnamese validation message');
  const missingLandName = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-MISSING-NAME-SYS`,
        tourCode: `${run}-LAND-MISSING-NAME`,
      }),
    },
    400,
    'LandTour should reject missing name',
  );
  assertMessage(missingLandName, 'T\u00ean LandTour ph\u1ea3i l\u00e0 chu\u1ed7i k\u00fd t\u1ef1', 'LandTour missing name should use Vietnamese validation message');

  const landTour = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run.toLowerCase()}-land-sys`,
        tourCode: `${run.toLowerCase()}-land`,
        name: 'Tour type API LandTour',
        route: 'Tour type API LandTour common route',
        itinerarySummary: 'Tour type API LandTour legacy itinerary alias',
        customerName: 'Tour type API LandTour customer',
        guideName: 'Tour type API LandTour guide',
        comboType: 'Combo du lịch',
        smartLinkCode: `${run}-LAND-SMART`,
        confirmationNote: 'LandTour confirmation note',
        paymentStatus: 'partial',
        termsVi: 'LandTour dieu khoan VI',
        termsEn: 'LandTour English terms',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        salesServices: [{ serviceType: 'LAND_CAR', supplierId: gitSupplier.id, supplierServiceId: gitSupplierService.id, description: 'LandTour copied sales service', quantity: 1, unitPrice: 1500, amount: 1500, vat: 10, status: 'confirmed' }],
        operationServices: [{ serviceType: 'LAND_HOTEL', supplierId: gitSupplier.id, supplierServiceId: gitSupplierService.id, description: 'LandTour copied operation service', quantity: 2, confirmedUnitPrice: 700, exchangeRate: 2, vat: 5, status: 'operating', bookingCode: 'LAND-BOOK-1', notes: 'Land operation note' }],
      }),
    },
    201,
    'create LandTour',
  );
  assert(landTour.id, 'LandTour create should return id');
  assert(landTour.systemCode === `${run}-LAND-SYS` && landTour.tourCode === `${run}-LAND`, 'LandTour create should uppercase systemCode and tourCode');
  assert(landTour.workflowStep === 'LANDTOUR_INFO', 'LandTour create should initialize default workflow step');
  assert(landTour.productType === 'LANDTOUR', 'LandTour create should set common productType LANDTOUR for reporting/product filters');
  assert(landTour.paymentStatus === 'PARTIAL', 'LandTour create should normalize paymentStatus');
  assert(landTour.logs.some((log) => log.action === 'CREATE_LANDTOUR' && log.metadata?.systemCode === `${run}-LAND-SYS`), 'LandTour create should write standardized create log metadata');
  assert(landTour.services.length === 2 && landTour.services.some((service) => service.confirmationStatus === 'CONFIRMED') && landTour.services.some((service) => service.confirmationStatus === 'OPERATING'), 'LandTour should map service status strings into TourServiceStatus');
  assert(landTour.services.every((service) => service.supplierId === gitSupplier.id && service.supplierServiceId === gitSupplierService.id), 'LandTour should persist supplier and supplier-service links on services');
  const landSalesService = landTour.services.find((service) => service.serviceType === 'LAND_CAR');
  const landOperationService = landTour.services.find((service) => service.serviceType === 'LAND_HOTEL');
  assert(landSalesService && Number(landSalesService.salesAmount) === 1500 && Number(landSalesService.vat) === 10, 'LandTour should preserve explicit sales amount even when VAT is present');
  assert(landOperationService && Number(landOperationService.confirmedAmount) === 2940 && landOperationService.bookingCode === 'LAND-BOOK-1' && landOperationService.notes === 'Land operation note', 'LandTour should calculate operation amount and preserve bookingCode/notes');
  assert(landTour.route === 'Tour type API LandTour common route', 'LandTour root route should prefer the common route field over itinerarySummary alias');
  assert(landTour.landTour.guideName === 'Tour type API LandTour guide', 'LandTour response should expose guideName from common TourGuide row');
  assert(landTour.landTour.comboType === 'Combo du lịch' && landTour.landTour.smartLinkCode === `${run}-LAND-SMART` && landTour.landTour.confirmationNote === 'LandTour confirmation note', 'LandTour response should expose comboType/smartLinkCode/confirmationNote detail fields');
  assert(landTour.landTour.termsVi === 'LandTour dieu khoan VI' && landTour.landTour.termsEn === 'LandTour English terms', 'LandTour response should expose terms from common TourTerm rows');
  const rawLandDetail = await prisma.landTourDetail.findUnique({ where: { tourId: landTour.id } });
  const landGuide = await prisma.tourGuide.findFirst({ where: { tourId: landTour.id, guideType: 'LANDTOUR' } });
  const landTerms = await prisma.tourTerm.findMany({ where: { tourId: landTour.id, termType: 'LANDTOUR' } });
  assert(rawLandDetail && rawLandDetail.guideName === null, 'LandTour detail should not write legacy guideName snapshot');
  assert(rawLandDetail.comboType === 'Combo du lịch' && rawLandDetail.smartLinkCode === `${run}-LAND-SMART` && rawLandDetail.confirmationNote === 'LandTour confirmation note', 'LandTour detail should store product-specific detail fields');
  assert(rawLandDetail.termsVi === null && rawLandDetail.termsEn === null, 'LandTour detail should not write legacy term snapshots');
  assert(landGuide && landGuide.name === 'Tour type API LandTour guide', 'LandTour guideName should be stored as common TourGuide LANDTOUR row');
  assert(landTerms.length === 2 && landTerms.some((term) => term.language === 'VI' && term.content === 'LandTour dieu khoan VI') && landTerms.some((term) => term.language === 'EN' && term.content === 'LandTour English terms'), 'LandTour terms should be stored as common TourTerm rows');
  const landDetail = await expect(`/api/landtours/${landTour.id}`, {}, 200, 'LandTour detail should load full edit data');
  assertLandDetailShape(landDetail, 'LandTour detail response');
  await expect(`/api/landtours/${landTour.id}`, { headers: viewHeaders }, 200, 'LandTour detail should allow tour.view users');
  const landListRows = await expect('/api/landtours?search=Tour%20type%20API%20LandTour%20guide', {}, 200, 'LandTour list should search common guide name');
  const landListRow = landListRows.find((row) => row.id === landTour.id);
  assertLandListRowShape(landListRow, 'LandTour list response');
  const viewLandListRows = await expect('/api/landtours?status=upcoming', { headers: viewHeaders }, 200, 'LandTour list should allow tour.view users');
  assert(viewLandListRows.some((row) => row.id === landTour.id), 'LandTour tour.view list should include scoped matching LandTour');
  assert(landListRow && landListRow.landTour.guideName === 'Tour type API LandTour guide', 'LandTour list should overlay guideName from common TourGuide row');
  assert(landListRow._count.terms === 2, 'LandTour list should count common TourTerm rows');
  assert(!('guides' in landListRow), 'LandTour list should not expose guide payload just for guideName overlay');
  for (const [query, label] of [
    [`${run}-LAND-SYS`, 'systemCode'],
    [`${run}-LAND`, 'tourCode'],
    ['Tour type API LandTour', 'name'],
    ['Tour type API LandTour common route', 'route'],
    ['Tour type API LandTour customer', 'customerName'],
    ['Combo du lịch', 'comboType'],
    [`${run}-LAND-SMART`, 'smartLinkCode'],
  ]) {
    const rows = await expect(`/api/landtours?search=${encodeURIComponent(query)}`, {}, 200, `LandTour list should search ${label}`);
    assert(rows.some((row) => row.id === landTour.id), `LandTour list search by ${label} should find the tour`);
  }
  assert(String(landTour.startDate).startsWith('2026-09-01') && String(landTour.endDate).startsWith('2026-09-01'), 'LandTour should allow equal startDate/endDate for one-day tours');
  await expect(
    '/api/landtours',
    {
      method: 'POST',
      headers: viewHeaders,
      body: JSON.stringify({ systemCode: `${run}-LAND-VIEW-FORBIDDEN`, tourCode: `${run}-LAND-VIEW-FORBIDDEN`, name: 'Tour type API LandTour forbidden create' }),
    },
    403,
    'LandTour create should reject tour.view-only users',
  );
  await expect(`/api/landtours/${landTour.id}`, { method: 'PUT', headers: viewHeaders, body: JSON.stringify({ status: 'COMPLETED' }) }, 403, 'LandTour PUT should reject tour.view-only users');
  const duplicateLandSystemCode = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-SYS`,
        tourCode: `${run}-LAND-DUP`,
        name: 'Tour type API LandTour duplicate system code',
      }),
    },
    409,
    'LandTour should reject duplicate systemCode',
  );
  assertMessage(duplicateLandSystemCode, 'Mã hệ thống LandTour đã tồn tại', 'LandTour duplicate systemCode should use Vietnamese conflict message');
  const duplicateLandTourCode = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-DUP-TOUR-SYS`,
        tourCode: `${run}-LAND`,
        name: 'Tour type API LandTour duplicate tour code',
      }),
    },
    409,
    'LandTour should reject duplicate tourCode',
  );
  assertMessage(duplicateLandTourCode, 'M\u00e3 tour LandTour \u0111\u00e3 t\u1ed3n t\u1ea1i', 'LandTour duplicate tourCode should use Vietnamese conflict message');
  const landTourForDuplicateUpdate = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-UPDATE-DUP-SYS`,
        tourCode: `${run}-LAND-UPDATE-DUP`,
        name: 'Tour type API LandTour duplicate update target',
      }),
    },
    201,
    'create LandTour duplicate update target',
  );
  const duplicateLandTourCodeUpdate = await expect(
    `/api/landtours/${landTourForDuplicateUpdate.id}`,
    { method: 'PATCH', body: JSON.stringify({ tourCode: `${run}-LAND` }) },
    409,
    'LandTour update should reject duplicate tourCode',
  );
  assertMessage(duplicateLandTourCodeUpdate, 'M\u00e3 tour LandTour \u0111\u00e3 t\u1ed3n t\u1ea1i', 'LandTour update duplicate tourCode should use Vietnamese conflict message');
  const duplicateLandSystemCodeUpdate = await expect(
    `/api/landtours/${landTourForDuplicateUpdate.id}`,
    { method: 'PATCH', body: JSON.stringify({ systemCode: `${run}-LAND-SYS` }) },
    409,
    'LandTour update should reject duplicate systemCode',
  );
  assertMessage(duplicateLandSystemCodeUpdate, 'M\u00e3 h\u1ec7 th\u1ed1ng LandTour \u0111\u00e3 t\u1ed3n t\u1ea1i', 'LandTour update duplicate systemCode should use Vietnamese conflict message');
  const invalidLandWorkflowStep = await expect(
    `/api/landtours/${landTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'WRONG_STEP' }) },
    400,
    'LandTour should reject invalid workflow step',
  );
  assertMessage(invalidLandWorkflowStep, 'Bước workflow LandTour không hợp lệ', 'LandTour invalid workflowStep should use Vietnamese service message');
  const partialTermsLandTour = await expect(
    `/api/landtours/${landTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ termsVi: 'LandTour dieu khoan VI cap nhat' }) },
    200,
    'LandTour partial terms update should preserve untouched language',
  );
  assert(partialTermsLandTour.landTour.termsVi === 'LandTour dieu khoan VI cap nhat' && partialTermsLandTour.landTour.termsEn === 'LandTour English terms', 'LandTour partial terms update should preserve termsEn when only termsVi changes');
  assert(partialTermsLandTour.terms.length === 2, 'LandTour partial terms update should keep both language rows');
  const patchedLandTour = await expect(
    `/api/landtours/${landTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch LandTour',
  );
  assert(patchedLandTour.status === 'RUNNING', 'LandTour PATCH should update status');
  assert(patchedLandTour.customers.length === 1 && patchedLandTour.customers[0].name === 'Tour type API LandTour customer', 'LandTour partial status update should not replace customers');
  assert(patchedLandTour.services.length === 2 && patchedLandTour.services.some((service) => service.serviceType === 'LAND_CAR') && patchedLandTour.services.some((service) => service.serviceType === 'LAND_HOTEL'), 'LandTour partial status update should not replace services');
  assert(patchedLandTour.terms.length === 2 && patchedLandTour.landTour.termsEn === 'LandTour English terms', 'LandTour partial status update should not replace terms');
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
  assert(landCopyTarget.customers.length === 0, 'LandTour create without customerName should not create a fake default customer');
  await expect(`/api/landtours/${landCopyTarget.id}/copy-services`, { method: 'POST', headers: viewHeaders, body: JSON.stringify({ sourceTourId: landTour.id }) }, 403, 'LandTour copy-services should reject tour.view-only users');
  const missingLandCopySource = await expect(
    `/api/landtours/${landCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({}) },
    400,
    'LandTour copy-services should require explicit sourceTourId',
  );
  assertMessage(missingLandCopySource, 'Hãy chọn tour nguồn để sao chép dịch vụ LandTour', 'LandTour copy-services missing source should use Vietnamese service message');
  const sameLandCopySource = await expect(
    `/api/landtours/${landCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({ sourceTourId: landCopyTarget.id }) },
    400,
    'LandTour copy-services should reject same source and target',
  );
  assertMessage(sameLandCopySource, 'Tour nguồn sao chép dịch vụ LandTour phải khác tour đích', 'LandTour copy-services same source should use Vietnamese service message');
  const copiedLandServices = await expect(
    `/api/landtours/${landCopyTarget.id}/copy-services`,
    { method: 'POST', body: JSON.stringify({ sourceTourId: landTour.id }) },
    200,
    'copy LandTour services',
  );
  assertLandDetailShape(copiedLandServices, 'LandTour copy-services response');
  assert(copiedLandServices.services.length === 2, 'LandTour copy-services should copy sales and operation common TourService rows');
  const copiedLandSalesService = copiedLandServices.services.find((service) => service.serviceType === 'LAND_CAR');
  const copiedLandOperationService = copiedLandServices.services.find((service) => service.serviceType === 'LAND_HOTEL');
  assert(copiedLandSalesService && copiedLandOperationService, 'LandTour copy-services should preserve serviceType through TourCore clone helper');
  assert(copiedLandSalesService.supplierId === gitSupplier.id && copiedLandOperationService.supplierId === gitSupplier.id, 'LandTour copy-services should preserve supplier links');
  assert(Number(copiedLandSalesService.salesAmount) === 1500 && copiedLandSalesService.confirmationStatus === 'CONFIRMED', 'LandTour copy-services should preserve explicit sales amount and status');
  assert(Number(copiedLandOperationService.confirmedAmount) === 2940 && copiedLandOperationService.confirmationStatus === 'OPERATING' && copiedLandOperationService.bookingCode === 'LAND-BOOK-1', 'LandTour copy-services should preserve operation amount/status/bookingCode');
  const lowercaseLandStatusRows = await expect('/api/landtours?status=running', {}, 200, 'LandTour lowercase status query');
  assert(lowercaseLandStatusRows.some((row) => row.id === landTour.id), 'LandTour lowercase status query should include running tour');
  const spacedLandStatusRows = await expect('/api/landtours?status=%20running%20', {}, 200, 'LandTour spaced lowercase status query');
  assert(spacedLandStatusRows.some((row) => row.id === landTour.id), 'LandTour status query DTO should trim and normalize status');
  const invalidLandStatusQuery = await expect('/api/landtours?status=WRONG', {}, 400, 'LandTour invalid status query');
  assertMessage(invalidLandStatusQuery, 'Trạng thái LandTour không hợp lệ', 'LandTour invalid status query should use Vietnamese validation message');
  const landLinkedOrder = await prisma.order.create({ data: { type: 'LANDTOUR', systemCode: `${run}-ORDER-LAND`, name: 'Tour type API linked LandTour order' } });
  const landOrderLinkedTour = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-ORDER-LINKED-SYS`,
        tourCode: `${run}-LAND-ORDER-LINKED`,
        name: 'Tour type API LandTour order linked',
        orderId: landLinkedOrder.id,
      }),
    },
    201,
    'create LandTour linked to order',
  );
  const blockedLandRemove = await expect(`/api/landtours/${landOrderLinkedTour.id}`, { method: 'DELETE' }, 400, 'LandTour remove should block tour linked to order/external dependency');
  assertMessage(blockedLandRemove, 'Không thể xóa LandTour đã phát sinh', 'LandTour blocked remove should use Vietnamese service message');
  await expect(`/api/landtours/${landCopyTarget.id}`, { method: 'DELETE', headers: viewHeaders }, 403, 'LandTour delete should reject tour.view-only users');
  const removedLandTour = await expect(`/api/landtours/${landCopyTarget.id}`, { method: 'DELETE' }, 200, 'LandTour remove should soft-delete target tour');
  assert(removedLandTour.deletedAt && removedLandTour.status === 'CANCELLED', 'LandTour remove should cancel and soft-delete the common Tour owner');
  const removedLandDetail = await expect(`/api/landtours/${landCopyTarget.id}`, {}, 404, 'LandTour detail should hide soft-deleted tour');
  assertMessage(removedLandDetail, 'Không tìm thấy LandTour', 'LandTour removed detail should use Vietnamese not-found message');

  await app.close();
  console.log('TEST_TOUR_TYPE_APIS_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
