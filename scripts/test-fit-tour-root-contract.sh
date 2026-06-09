#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_fit_tour_root_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_FIT_TOUR_ROOT_CONTRACT missing POSTGRES_PASSWORD"
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
const { FitServiceStatus, FitTourWorkflowStatus, TourServiceStatus, TourStatus, TourType } = require('@prisma/client');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { FitTourLegacyCompatService } = require('./apps/api/dist/modules/fit-tours/fit-tour-legacy-compat.service');
const { FitToursService } = require('./apps/api/dist/modules/fit-tours/fit-tours.service');
const { TourCoreService } = require('./apps/api/dist/modules/tours/tour-core.service');
const fitCreateDtoContract = require('./apps/api/dist/modules/fit-tours/dto/create-fit-tour.dto');
const fitUpdateDtoContract = require('./apps/api/dist/modules/fit-tours/dto/update-fit-tour.dto');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function decimal(value) {
  return Number(value || 0);
}

function rootCode(value) {
  return String(value).toUpperCase();
}

function assertFitDtoContract() {
  const groups = [
    fitCreateDtoContract.FIT_TOUR_ROOT_FIELDS,
    fitCreateDtoContract.FIT_TOUR_LINK_AND_CUSTOMER_FIELDS,
    fitCreateDtoContract.FIT_TOUR_WORKFLOW_FIELDS,
    fitCreateDtoContract.FIT_TOUR_DETAIL_FIELDS,
    fitCreateDtoContract.FIT_TOUR_CHILD_FIELDS,
  ];
  const groupedFields = groups.flat();
  assert(groupedFields.length === new Set(groupedFields).size, 'FIT DTO field groups should not overlap');
  assert(JSON.stringify(groupedFields) === JSON.stringify(fitCreateDtoContract.FIT_TOUR_CREATE_FIELDS), 'FIT create fields should be exactly grouped root/link/workflow/detail/child fields');
  assert(JSON.stringify(fitUpdateDtoContract.FIT_TOUR_UPDATE_FIELDS) === JSON.stringify(fitCreateDtoContract.FIT_TOUR_CREATE_FIELDS), 'FIT update should reuse the approved create/edit field surface');
  for (const field of fitCreateDtoContract.FIT_TOUR_REJECTED_ROOT_WORKFLOW_FIELDS) {
    assert(!fitCreateDtoContract.FIT_TOUR_CREATE_FIELDS.includes(field), `FIT DTO should not expose root workflow/lifecycle field ${field}`);
  }
  assert(fitCreateDtoContract.FIT_TOUR_WORKFLOW_FIELDS.length === 1 && fitCreateDtoContract.FIT_TOUR_WORKFLOW_FIELDS[0] === 'workflowStatus', 'FIT workflow DTO surface should only expose workflowStatus');
  assert(fitCreateDtoContract.FIT_TOUR_ROOT_FIELDS.includes('paymentStatus'), 'FIT root field group should keep root paymentStatus explicit');
  assert(fitCreateDtoContract.FIT_TOUR_DETAIL_FIELDS.includes('seatCount'), 'FIT-specific detail group should include seatCount');
  assert(fitCreateDtoContract.FIT_TOUR_CHILD_FIELDS.includes('operationServices'), 'FIT child group should include operationServices');
  assert(fitCreateDtoContract.FIT_TOUR_STEP_FIELDS.PRICING.includes('commonCosts'), 'FIT step fields should keep pricing cost groups');
  assert(!fitCreateDtoContract.FIT_TOUR_STEP_FIELDS.PRICING.includes('attachments'), 'FIT step saves should not accept attachment metadata; upload endpoint owns FIT attachments');
  assert(fitCreateDtoContract.FIT_TOUR_STEP_FIELDS.TOUR_INFO.includes('tourName'), 'FIT step fields should keep tour info root fields');
  assert(fitCreateDtoContract.FIT_TOUR_STEP_FIELDS.BUDGET.length === 1 && fitCreateDtoContract.FIT_TOUR_STEP_FIELDS.BUDGET[0] === 'budgetServices', 'FIT budget step should only accept budget services');
  assert(fitCreateDtoContract.FIT_TOUR_STEP_FIELDS.OPERATION.length === 1 && fitCreateDtoContract.FIT_TOUR_STEP_FIELDS.OPERATION[0] === 'operationServices', 'FIT operation step should only accept operation services');
  assert(fitCreateDtoContract.FIT_TOUR_DATE_PATTERN.test('2026-06-15'), 'FIT date pattern should accept YYYY-MM-DD');
  assert(!fitCreateDtoContract.FIT_TOUR_DATE_PATTERN.test('2026-06-15T00:00:00.000Z'), 'FIT date pattern should reject ISO datetimes');
}

function assertLegacyCompatBoundary() {
  const fs = require('fs');
  const serviceSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/fit-tours.service.ts', 'utf8');
  const controllerSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/fit-tours.controller.ts', 'utf8');
  const fitWizardSource = fs.readFileSync('/workspace/apps/web/app/fit-tours/FitTourWizard.tsx', 'utf8');
  const legacyCompatSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/fit-tour-legacy-compat.service.ts', 'utf8');
  const defaultsSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/fit-tour-defaults.ts', 'utf8');
  assert(!serviceSource.includes('new Date(text)'), 'FIT service date parsing should avoid direct new Date(text) timezone parsing');
  assert(!serviceSource.includes('tx.tour.create') && !serviceSource.includes('tx.tour.update'), 'FitToursService should delegate Tour root create/update to TourCoreService');
  assert(serviceSource.includes('tourCore.createRoot') && serviceSource.includes('tourCore.updateRoot'), 'FitToursService should use TourCoreService root helpers');
  assert(controllerSource.includes("@Patch(':id/steps/:step')"), 'FIT step endpoint should be exposed for wizard draft saves');
  assert(controllerSource.includes("@Post(':id/steps/:step/confirm')"), 'FIT confirm-step endpoint should be exposed separately from draft saves');
  assert(controllerSource.includes("@Post(':id/attachments')") && controllerSource.includes('FileInterceptor'), 'FIT attachment upload endpoint should be multipart and scoped to a FIT tour');
  assert(controllerSource.includes("@Get(':id/export')") && controllerSource.includes("@Header('Content-Type', 'text/csv; charset=utf-8')"), 'FIT export endpoint should expose a CSV download by tour id');
  assert(serviceSource.includes('async saveStep') && serviceSource.includes('async confirmStep'), 'FIT service should expose separate step draft and confirm orchestration');
  assert(serviceSource.includes('SAVE_FIT_STEP_DRAFT') && serviceSource.includes('CONFIRM_FIT_STEP'), 'FIT step draft and confirm actions should be logged separately');
  assert(serviceSource.includes('async uploadAttachment') && serviceSource.includes('UPLOAD_FIT_ATTACHMENT'), 'FIT service should expose attachment upload orchestration and log it');
  assert(serviceSource.includes('async exportCsv') && serviceSource.includes('requiredTourRootId(fitTour)'), 'FIT export should be generated from a scoped FIT detail with common tourId');
  assert(serviceSource.includes('tourCore.addAttachment') && serviceSource.includes('legacyCompat.addAttachment'), 'FIT upload should persist attachment metadata through common and legacy boundaries');
  assert(fitWizardSource.includes('stepPayloadFields') && fitWizardSource.includes('/steps/${step}') && fitWizardSource.includes('/steps/${step}/confirm'), 'FIT wizard should save existing records through step-scoped draft/confirm payloads');
  assert(fitWizardSource.includes('FormData') && fitWizardSource.includes('/attachments'), 'FIT wizard should upload attachment files through multipart FIT endpoint');
  const pricingStepBlock = fitWizardSource.slice(fitWizardSource.indexOf('PRICING: ['), fitWizardSource.indexOf('TOUR_INFO: ['));
  assert(!pricingStepBlock.includes("'attachments'"), 'FIT wizard step payload should not send attachment metadata during pricing autosave');
  const fitToursClientSource = fs.readFileSync('/workspace/apps/web/app/fit-tours/FitToursClient.tsx', 'utf8');
  assert(fitToursClientSource.includes('/export') && fitToursClientSource.includes('URL.createObjectURL'), 'FIT list UI should download exported CSV from the FIT export endpoint');
  assert(fitWizardSource.includes('L\u01b0u nh\u00e1p') && fitWizardSource.includes('X\u00e1c nh\u1eadn b\u01b0\u1edbc'), 'FIT wizard should expose separate draft save and confirm buttons');
  assert(!legacyCompatSource.includes('new Date(text)'), 'FIT legacy compatibility date parsing should avoid direct new Date(text) timezone parsing');
  assert(!serviceSource.includes('l? b?t bu?c'), 'FIT service validation messages should not contain mojibake text');
  assert(!serviceSource.includes('const defaultHandoverItems') && !legacyCompatSource.includes('const defaultHandoverItems'), 'FIT services should not duplicate default handover constants');
  assert(!serviceSource.includes('const defaultSurveyQuestions') && !legacyCompatSource.includes('const defaultSurveyQuestions'), 'FIT services should not duplicate default survey constants');
  assert(serviceSource.includes('FIT_DEFAULT_SURVEY_QUESTIONS'), 'FIT service should import shared default survey questions');
  assert(legacyCompatSource.includes('FIT_DEFAULT_HANDOVER_ITEMS') && legacyCompatSource.includes('FIT_DEFAULT_SURVEY_QUESTIONS'), 'FIT legacy compatibility should import shared defaults');
  assert(!legacyCompatSource.includes('Ti liu bn giao') && legacyCompatSource.includes('Tài liệu bàn giao'), 'FIT legacy handover fallback should keep Vietnamese text');
  assert(!legacyCompatSource.includes('Cu hi') && legacyCompatSource.includes('Câu hỏi'), 'FIT legacy survey fallback should keep Vietnamese text');
  assert(!defaultsSource.includes('V my bay'), 'FIT default handover items should keep Vietnamese accents');
  assert(defaultsSource.includes('Vé máy bay'), 'FIT default handover items should include Vietnamese text');
  assert(defaultsSource.includes('Chất lượng chương trình tour'), 'FIT default survey questions should include Vietnamese text');
  for (const mojibake of ['Dch v', 'Khch sn', 'Dich vu', 'Bc workflow ca file']) {
    assert(!legacyCompatSource.includes(mojibake), `FIT legacy compatibility should not contain mojibake/fallback text ${mojibake}`);
  }
  assert(legacyCompatSource.includes('Dịch vụ') && legacyCompatSource.includes('Khách sạn'), 'FIT legacy compatibility should keep Vietnamese fallback service labels');
  for (const mojibake of ['M bo gi', 'H tn khch', 'S khch phi ln hn 0', 'Ngy v phi sau', 'Tour FIT mi', 'Khng th i', 'C?n nh?p', 'ch?a li?n', 'Ch c hon', 'Khng c chuyn', 'cn t nht', 'phi l s', 'khng c m', 'Trng thi workflow FIT', 'Bc workflow ca file']) {
    assert(!serviceSource.includes(mojibake), `FIT service should not contain mojibake validation message ${mojibake}`);
  }
  assert(serviceSource.includes('M\u00e3 b\u00e1o gi\u00e1') && serviceSource.includes('C\u1ea7n nh\u1eadp t\u00ean kh\u00e1ch h\u00e0ng'), 'FIT service validation messages should keep Vietnamese text');
  const copyBudgetBlock = serviceSource.slice(serviceSource.indexOf('private async copyFitBudgetAggregate'), serviceSource.indexOf('private async copyFitOperationAggregate'));
  const copyOperationBlock = serviceSource.slice(serviceSource.indexOf('private async copyFitOperationAggregate'), serviceSource.indexOf('private async prepareCreateFitDto'));
  assert(!copyBudgetBlock.includes('syncTourCoreFromFit') && !copyOperationBlock.includes('syncTourCoreFromFit'), 'FIT copy actions should not resync all common Tour children');
  assert(copyBudgetBlock.includes('replaceFitTourServices') && copyOperationBlock.includes('replaceFitTourServices'), 'FIT copy actions should only replace common service rows through a focused helper');
  assert(serviceSource.includes('tourCore.replaceServicesAndSuppliers'), 'FIT service copy helper should update common Tour services and suppliers through TourCoreService');
  const directLegacyChildWrites = /tx\.fit(?:CommonCost|HotelCost|PrivateCost|BudgetService|OperationService|TourGuide|HandoverItem|SurveyQuestion|Attachment)\./;
  assert(!directLegacyChildWrites.test(serviceSource), 'FitToursService should not write legacy FIT child tables directly');
  assert(serviceSource.includes('legacyCompat.toChildCreateData'), 'FIT create should delegate legacy child create data to compatibility service');
  assert(serviceSource.includes('legacyCompat.syncChildren'), 'FIT update should delegate legacy child sync to compatibility service');
  assert(serviceSource.includes('legacyCompat.replaceBudgetServices'), 'FIT copyBudget should delegate legacy budget replacement to compatibility service');
  assert(serviceSource.includes('legacyCompat.replaceOperationServices'), 'FIT copyOperation should delegate legacy operation replacement to compatibility service');
  for (const helper of ['createFitTourAggregate', 'updateFitTourAggregate', 'removeFitTourAggregate', 'copyFitBudgetAggregate', 'copyFitOperationAggregate']) {
    assert(serviceSource.includes(helper), `FitToursService should keep orchestration helper ${helper}`);
  }
  assert(serviceSource.includes('allowStatusInput: false'), 'FIT Tour root sync should reject direct TourStatus payloads at TourCore boundary');
  assert(serviceSource.includes('allowWorkflowStepInput: false'), 'FIT Tour root sync should reject raw workflowStep payloads at TourCore boundary');
  assert(serviceSource.includes('tourCore.replaceCommonChildren'), 'FIT should sync common Tour children through TourCoreService.replaceCommonChildren');
  assert(serviceSource.includes('dropAttachmentPatch') && serviceSource.includes('hasAnyChanged'), 'FIT update should strip upload-only attachment patches and sync common children by changed field groups');
  for (const helper of ['replaceCustomers', 'replaceRevenues', 'replaceCosts', 'replaceGuides', 'replaceAttachments', 'replaceSurveys']) {
    assert(!new RegExp(`tourCore\\.${helper}\\s*\\(`).test(serviceSource), `FIT should not call ${helper} directly from module service`);
  }
  assert(!/tourCore\.replaceServices\s*\(/.test(serviceSource), 'FIT should not call replaceServices directly from module service');
  assert(!/tourCore\.replaceSuppliers\s*\(/.test(serviceSource), 'FIT should not call replaceSuppliers directly from module service');
}

async function main() {
  assertFitDtoContract();
  assertLegacyCompatBoundary();
  const prisma = new PrismaService();
  await prisma.$connect();

  const tourCore = new TourCoreService(prisma);
  const uploadedScopes = [];
  const filesService = {
    upload: async (file, scope, actorId) => {
      if (!file) throw new Error('missing upload file');
      uploadedScopes.push({ scope, actorId });
      return {
        bucket: 'test',
        objectKey: `${scope}/mock-upload.pdf`,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/api/files/download?key=${encodeURIComponent(`${scope}/mock-upload.pdf`)}`,
      };
    },
    removeQuietly: async () => undefined,
  };
  const fitTours = new FitToursService(prisma, tourCore, new FitTourLegacyCompatService(), filesService);
  const run = 'FTR-' + Date.now();

  const category = await prisma.supplierCategory.create({ data: { name: `${run} Supplier Category` } });
  const supplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: `${run}-SUP`,
      name: `${run} Supplier`,
    },
  });
  const supplierService = await prisma.supplierService.create({
    data: {
      supplierId: supplier.id,
      sku: `${run}-SVC`,
      serviceName: `${run} Hotel Room`,
      quantity: 10,
      netPrice: 900,
      sellingPrice: 1200,
    },
  });

  const source = await fitTours.create({
    quoteCode: `${run}-SRC-Q`,
    tourCode: `${run}-SRC-T`,
    tourName: 'FIT Root Contract Source',
    customerName: 'FIT Root Customer',
    adultCount: 2,
    startDate: '2026-08-01',
    endDate: '2026-08-03',
    sellingPrice: 5000000,
    commonCosts: [{ serviceType: 'CAR', description: 'Source car', quantity: 1, times: 1, unitPrice: 1000, vat: 0, amount: 1000 }],
    budgetServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, description: 'Budget hotel', quantity: 2, unitPrice: 1000, vat: 10, amount: 2200 }],
    operationServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, supplierServiceId: supplierService.id, bookingCode: `${run}-BK`, quantity: 2, confirmedUnitPrice: 1200, vat: 10, amount: 2640, status: FitServiceStatus.CONFIRMED }],
    status: TourStatus.CANCELLED,
    workflowStep: 'MANUAL_ROOT_WORKFLOW_SHOULD_BE_IGNORED',
  });
  assert(source.tourId, 'FIT create should return linked Tour root id');

  const attachedDetail = await fitTours.uploadAttachment(
    source.id,
    FitTourWorkflowStatus.PRICING,
    { originalname: 'fit-pricing.pdf', mimetype: 'application/pdf', size: 1234, buffer: Buffer.from('fit-pricing') },
  );
  assert(uploadedScopes.some((entry) => entry.scope === `fit-tours/${source.id}/${FitTourWorkflowStatus.PRICING}`), 'FIT upload should scope stored file by fitTourId and workflow step');
  assert(attachedDetail.attachments.some((row) => row.fileName === 'fit-pricing.pdf' && row.fileUrl && row.step === FitTourWorkflowStatus.PRICING), 'FIT detail should expose uploaded attachment from common TourAttachment');
  const commonAttachment = await prisma.tourAttachment.findFirst({ where: { tourId: source.tourId, fileName: 'fit-pricing.pdf' } });
  const legacyAttachment = await prisma.fitAttachment.findFirst({ where: { fitTourId: source.id, fileName: 'fit-pricing.pdf' } });
  assert(commonAttachment && commonAttachment.fileUrl && commonAttachment.uploadedBy === 'system', 'FIT upload should write common TourAttachment metadata');
  assert(legacyAttachment && legacyAttachment.fileUrl, 'FIT upload should keep legacy FitAttachment snapshot metadata');

  await fitTours.saveStep(source.id, FitTourWorkflowStatus.PRICING, { attachments: [{ step: FitTourWorkflowStatus.PRICING, fileName: 'tampered.pdf', fileUrl: '/tampered.pdf' }] });
  const attachmentsAfterStepPatch = await prisma.tourAttachment.findMany({ where: { tourId: source.tourId } });
  const legacyAttachmentsAfterStepPatch = await prisma.fitAttachment.findMany({ where: { fitTourId: source.id } });
  assert(attachmentsAfterStepPatch.length === 1 && attachmentsAfterStepPatch[0].fileName === 'fit-pricing.pdf', 'FIT step save should not overwrite uploaded common attachments');
  assert(legacyAttachmentsAfterStepPatch.length === 1 && legacyAttachmentsAfterStepPatch[0].fileName === 'fit-pricing.pdf', 'FIT step save should not overwrite uploaded legacy attachment snapshot');

  const exportedCsv = await fitTours.exportCsv(source.id);
  assert(exportedCsv.includes(`tour,tourId,${source.tourId},common Tour root`), 'FIT export should include common tourId');
  assert(exportedCsv.includes('FIT Root Contract Source'), 'FIT export should include common Tour root name');
  assert(exportedCsv.includes('attachments,1,PRICING,fit-pricing.pdf'), 'FIT export should include uploaded attachment metadata');
  assert(exportedCsv.includes('budget.services'), 'FIT export should include budget service rows');

  const createdRoot = await prisma.tour.findUnique({
    where: { id: source.tourId },
    include: { fitTour: true, customers: true, services: true, costs: true, revenues: true, suppliers: true },
  });
  assert(createdRoot, 'FIT create should create Tour root');
  assert(createdRoot.type === TourType.FIT, 'Tour root should be FIT type');
  assert(createdRoot.systemCode === rootCode(`${run}-SRC-Q`), 'Tour root systemCode should use FIT quoteCode');
  assert(createdRoot.tourCode === rootCode(`${run}-SRC-T`), 'Tour root tourCode should use FIT tourCode');
  assert(createdRoot.name === 'FIT Root Contract Source', 'Tour root should own common tour name');
  assert(createdRoot.workflowStep === FitTourWorkflowStatus.DRAFT, 'Tour root should store FIT workflow step separately');
  assert(createdRoot.status === TourStatus.UPCOMING, 'Tour root status should be derived from FIT workflow and ignore FIT DTO status payload');
  assert(createdRoot.fitTour.id === source.id, 'Tour root should link back to FIT detail');
  assert(createdRoot.customers.length === 1 && createdRoot.customers[0].name === 'FIT Root Customer', 'Tour root should own primary customer');
  assert(createdRoot.revenues.length === 1 && decimal(createdRoot.revenues[0].amount) === 5000000, 'Tour root should own revenue rows');
  assert(createdRoot.costs.length === 1 && decimal(createdRoot.costs[0].expectedAmount) === 1000, 'Tour root should own cost rows');
  assert(createdRoot.costs[0].costType === 'FIT_COMMON_COST:CAR', 'Tour root costType should preserve FIT cost group and service type');
  assert(createdRoot.services.length === 2, 'Tour root should own budget and operation services');
  assert(createdRoot.suppliers.length === 1 && createdRoot.suppliers[0].supplierId === supplier.id, 'Tour root should derive suppliers from services');

  await prisma.fitTour.update({
    where: { id: source.id },
    data: {
      tourCode: `${run}-LEGACY-STALE`,
      tourName: 'Legacy stale source name',
      customerName: 'Legacy stale customer',
      startDate: new Date('2035-01-01T00:00:00.000Z'),
      endDate: new Date('2035-01-02T00:00:00.000Z'),
    },
  });
  const rootSourcedDetail = await fitTours.detail(source.id);
  assert(rootSourcedDetail.tourCode === rootCode(`${run}-SRC-T`), 'FIT detail should expose Tour root tourCode over stale legacy value');
  assert(rootSourcedDetail.tourName === 'FIT Root Contract Source', 'FIT detail should expose Tour root name over stale legacy value');
  assert(rootSourcedDetail.customerName === 'FIT Root Customer', 'FIT detail should expose TourCustomer name over stale legacy value');
  assert(rootSourcedDetail.startDate.toISOString().startsWith('2026-08-01'), 'FIT detail should expose Tour root startDate over stale legacy value');
  const rootSourcedList = await fitTours.list('FIT Root Contract Source');
  const rootSourcedListRow = rootSourcedList.find((row) => row.id === source.id);
  assert(rootSourcedListRow, 'FIT list should search by common Tour root name');
  assert(rootSourcedListRow.tourName === 'FIT Root Contract Source', 'FIT list should expose Tour root name over stale legacy value');
  assert(rootSourcedListRow.customerName === 'FIT Root Customer', 'FIT list should expose TourCustomer name over stale legacy value');
  assert(!('tour' in rootSourcedListRow), 'FIT list should not expose nested Tour root payload');

  await fitTours.update(source.id, {
    workflowStatus: FitTourWorkflowStatus.PRICING,
    tourName: 'FIT Root Contract Source Updated',
    budgetServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, description: 'Updated budget hotel', quantity: 3, unitPrice: 1000, vat: 0, amount: 3000 }],
    attachments: [{ step: FitTourWorkflowStatus.PRICING, fileName: 'tampered-update.pdf', fileUrl: '/tampered-update.pdf' }],
  });
  const updatedRoot = await prisma.tour.findUnique({ where: { id: source.tourId }, include: { services: true } });
  const updatedFit = await prisma.fitTour.findUnique({ where: { id: source.id } });
  assert(updatedRoot.name === 'FIT Root Contract Source Updated', 'FIT update should update Tour root before legacy detail');
  assert(updatedRoot.workflowStep === FitTourWorkflowStatus.PRICING, 'Tour root workflowStep should follow FIT workflow');
  assert(updatedRoot.status === TourStatus.UPCOMING, 'TourStatus should remain lifecycle status separate from FIT workflow');
  assert(updatedFit.workflowStatus === FitTourWorkflowStatus.PRICING, 'FIT workflow status should remain on FIT detail');
  assert(updatedRoot.services.filter((service) => decimal(service.budgetAmount) > 0).length === 1, 'FIT update should resync common budget services');
  assert(decimal(updatedRoot.services.find((service) => decimal(service.budgetAmount) > 0).budgetAmount) === 3000, 'Common budget amount should match updated FIT budget');
  const attachmentsAfterFullUpdate = await prisma.tourAttachment.findMany({ where: { tourId: source.tourId } });
  assert(attachmentsAfterFullUpdate.length === 1 && attachmentsAfterFullUpdate[0].fileName === 'fit-pricing.pdf', 'FIT full update should not overwrite uploaded common attachments');

  await prisma.fitCommonCost.updateMany({ where: { fitTourId: source.id }, data: { description: 'Legacy stale common cost', unitPrice: 999, amount: 999 } });
  await prisma.fitBudgetService.updateMany({ where: { fitTourId: source.id }, data: { description: 'Legacy stale budget row', unitPrice: 999, amount: 999 } });
  await prisma.fitOperationService.updateMany({ where: { fitTourId: source.id }, data: { supplierServiceId: null, bookingCode: `${run}-STALE-OP`, confirmedUnitPrice: 999, amount: 999 } });
  const rootSourcedChildren = await fitTours.detail(source.id);
  assert(rootSourcedChildren.commonCosts[0].serviceType === 'CAR', 'FIT detail should expose common TourCost service type over stale legacy cost rows');
  assert(rootSourcedChildren.commonCosts[0].description === 'Source car', 'FIT detail should expose common TourCost description over stale legacy cost rows');
  assert(decimal(rootSourcedChildren.commonCosts[0].amount) === 1000, 'FIT detail should expose common TourCost amount over stale legacy cost rows');
  assert(decimal(rootSourcedChildren.budgetServices[0].amount) === 3000, 'FIT detail should expose common TourService budget rows over stale legacy rows');
  assert(rootSourcedChildren.budgetServices[0].description === 'Updated budget hotel', 'FIT detail should expose common TourService budget description over stale legacy rows');
  assert(rootSourcedChildren.operationServices[0].supplierServiceId === supplierService.id, 'FIT detail should expose common TourService operation supplier service over stale legacy rows');
  assert(rootSourcedChildren.operationServices[0].bookingCode === `${run}-BK`, 'FIT detail should expose common TourService operation booking code over stale legacy rows');

  await fitTours.saveStep(source.id, FitTourWorkflowStatus.TOUR_INFO, {
    tourName: 'FIT Step Tour Info Name',
    budgetServices: [{ serviceType: 'WRONG_STEP_BUDGET', description: 'Wrong tour info step', quantity: 1, unitPrice: 999, amount: 999 }],
  });
  const stepInfoDetail = await fitTours.detail(source.id);
  assert(stepInfoDetail.tourName === 'FIT Step Tour Info Name', 'saveStep TOUR_INFO should update allowed tourName');
  assert(!stepInfoDetail.budgetServices.some((row) => row.description === 'Wrong tour info step'), 'saveStep TOUR_INFO should ignore budgetServices outside step field contract');
  assert(stepInfoDetail.workflowStatus === FitTourWorkflowStatus.PRICING, 'saveStep TOUR_INFO should save draft without advancing workflow');
  await fitTours.confirmStep(source.id, FitTourWorkflowStatus.TOUR_INFO, {
    tourName: 'FIT Step Tour Info Confirmed',
    budgetServices: [{ serviceType: 'WRONG_CONFIRM_BUDGET', description: 'Wrong confirm tour info step', quantity: 1, unitPrice: 999, amount: 999 }],
  });
  const stepInfoConfirmed = await fitTours.detail(source.id);
  assert(stepInfoConfirmed.tourName === 'FIT Step Tour Info Confirmed', 'confirmStep TOUR_INFO should update allowed tourName');
  assert(!stepInfoConfirmed.budgetServices.some((row) => row.description === 'Wrong confirm tour info step'), 'confirmStep TOUR_INFO should ignore budgetServices outside step field contract');
  assert(stepInfoConfirmed.workflowStatus === FitTourWorkflowStatus.TOUR_INFO, 'confirmStep TOUR_INFO should advance workflow');
  await fitTours.saveStep(source.id, FitTourWorkflowStatus.PRICING, {
    commonCosts: [{ serviceType: 'CAR', description: 'Step repriced car', quantity: 1, times: 1, unitPrice: 1100, vat: 0, amount: 1100 }],
  });
  const stepPricingBack = await fitTours.detail(source.id);
  assert(stepPricingBack.workflowStatus === FitTourWorkflowStatus.TOUR_INFO, 'saveStep earlier step should not regress workflow');
  assert(stepPricingBack.commonCosts[0].description === 'Step repriced car', 'saveStep earlier step should still update allowed pricing fields');
  await fitTours.saveStep(source.id, FitTourWorkflowStatus.BUDGET, {
    budgetServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, description: 'Step budget hotel', quantity: 3, unitPrice: 1000, vat: 0, amount: 3000 }],
    operationServices: [{ serviceType: 'WRONG_STEP_OPERATION', description: 'Wrong budget step', amount: 999 }],
  });
  const stepBudgetDetail = await fitTours.detail(source.id);
  assert(stepBudgetDetail.workflowStatus === FitTourWorkflowStatus.TOUR_INFO, 'saveStep BUDGET should save draft without advancing workflow');
  assert(stepBudgetDetail.budgetServices[0].description === 'Step budget hotel', 'saveStep BUDGET should update budget rows');
  assert(!stepBudgetDetail.operationServices.some((row) => row.description === 'Wrong budget step'), 'saveStep BUDGET should ignore operation rows outside step field contract');
  await fitTours.confirmStep(source.id, FitTourWorkflowStatus.BUDGET, {});
  const stepBudgetConfirmed = await fitTours.detail(source.id);
  assert(stepBudgetConfirmed.workflowStatus === FitTourWorkflowStatus.BUDGET, 'confirmStep BUDGET should advance workflow');
  assert(stepBudgetConfirmed.budgetServices[0].description === 'Step budget hotel', 'confirmStep BUDGET should keep drafted budget rows');

  const pricingOnlySource = await fitTours.create({
    quoteCode: `${run}-PRICE-Q`,
    tourCode: `${run}-PRICE-T`,
    tourName: 'FIT Root Contract Pricing Only Source',
    customerName: 'FIT Root Pricing Customer',
    adultCount: 1,
    commonCosts: [{ serviceType: 'CAR', description: 'Pricing-only car', quantity: 2, times: 1, unitPrice: 750, vat: 0, amount: 1500 }],
  });
  const pricingOnlyTarget = await fitTours.create({
    quoteCode: `${run}-PRICE-TGT-Q`,
    tourCode: `${run}-PRICE-TGT-T`,
    tourName: 'FIT Root Contract Pricing Only Target',
    customerName: 'FIT Root Pricing Target Customer',
    adultCount: 1,
    budgetServices: [{ serviceType: 'MEAL', description: 'Old pricing target budget', quantity: 1, unitPrice: 100, vat: 0, amount: 100 }],
  });
  await prisma.fitCommonCost.updateMany({ where: { fitTourId: pricingOnlySource.id }, data: { description: 'Legacy stale pricing-only cost', unitPrice: 999, amount: 999 } });
  await fitTours.copyBudget(pricingOnlyTarget.id, pricingOnlySource.id);
  const copiedPricingBudgetLegacyRows = await prisma.fitBudgetService.findMany({ where: { fitTourId: pricingOnlyTarget.id } });
  const copiedPricingBudgetServices = await prisma.tourService.findMany({ where: { tourId: pricingOnlyTarget.tourId, budgetAmount: { gt: 0 } } });
  assert(copiedPricingBudgetLegacyRows.length === 1 && copiedPricingBudgetLegacyRows[0].description === 'Pricing-only car', 'copyBudget pricing fallback should use common TourCost description over stale legacy cost rows');
  assert(decimal(copiedPricingBudgetLegacyRows[0].amount) === 1500, 'copyBudget pricing fallback should update legacy budget rows from common TourCost');
  assert(copiedPricingBudgetServices.length === 1 && decimal(copiedPricingBudgetServices[0].budgetAmount) === 1500, 'copyBudget pricing fallback should update common TourService budget rows from common TourCost');

  const target = await fitTours.create({
    quoteCode: `${run}-TGT-Q`,
    tourCode: `${run}-TGT-T`,
    tourName: 'FIT Root Contract Target',
    customerName: 'FIT Root Target Customer',
    adultCount: 1,
    budgetServices: [{ serviceType: 'MEAL', description: 'Old target budget', quantity: 1, unitPrice: 100, vat: 0, amount: 100 }],
  });
  assert(target.tourId, 'target FIT should have Tour root');

  await fitTours.copyBudget(target.id, source.id);
  const copiedBudgetLegacyRows = await prisma.fitBudgetService.findMany({ where: { fitTourId: target.id } });
  const targetBudgetServices = await prisma.tourService.findMany({ where: { tourId: target.tourId, budgetAmount: { gt: 0 } } });
  assert(copiedBudgetLegacyRows.length === 1 && decimal(copiedBudgetLegacyRows[0].amount) === 3000, 'copyBudget should update legacy FIT budget rows');
  assert(targetBudgetServices.length === 1 && decimal(targetBudgetServices[0].budgetAmount) === 3000, 'copyBudget should update common TourService budget rows');

  await fitTours.copyOperation(target.id, source.id);
  const copiedOperationLegacyRows = await prisma.fitOperationService.findMany({ where: { fitTourId: target.id } });
  const targetOperationServices = await prisma.tourService.findMany({ where: { tourId: target.tourId, confirmedAmount: { gt: 0 } } });
  const targetBudgetServicesAfterOperation = await prisma.tourService.findMany({ where: { tourId: target.tourId, budgetAmount: { gt: 0 } } });
  assert(copiedOperationLegacyRows.length === 1 && copiedOperationLegacyRows[0].supplierServiceId === supplierService.id, 'copyOperation should update legacy FIT operation rows');
  assert(targetOperationServices.length === 1 && targetOperationServices[0].supplierServiceId === supplierService.id, 'copyOperation should update common TourService operation rows');
  assert(targetOperationServices[0].confirmationStatus === TourServiceStatus.CONFIRMED, 'copyOperation should map FIT service status to common TourService status');
  assert(targetBudgetServicesAfterOperation.length === 1 && decimal(targetBudgetServicesAfterOperation[0].budgetAmount) === 3000, 'copyOperation should preserve copied common budget services');

  const removed = await fitTours.remove(target.id);
  const removedRoot = await prisma.tour.findUnique({ where: { id: target.tourId } });
  assert(removed.workflowStatus === FitTourWorkflowStatus.CANCELLED, 'FIT remove should cancel legacy workflow detail');
  assert(removedRoot.status === TourStatus.CANCELLED && removedRoot.deletedAt, 'FIT remove should soft-delete the Tour root');

  await prisma.$disconnect();
  console.log('TEST_FIT_TOUR_ROOT_CONTRACT_OK');
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
