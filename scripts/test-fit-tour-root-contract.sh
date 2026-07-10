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

async function assertRejects(action, expectedMessage, label) {
  try {
    await action();
  } catch (error) {
    assert(String(error?.message || error).includes(expectedMessage), `${label}: ${error?.message || error}`);
    return;
  }
  throw new Error(label);
}

function decimal(value) {
  return Number(value || 0);
}

function closeTo(actual, expected, tolerance = 0.01) {
  return Math.abs(decimal(actual) - expected) <= tolerance;
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
  assert(JSON.stringify(fitCreateDtoContract.FIT_TOUR_REQUIRED_CREATE_FIELDS) === JSON.stringify(['quoteCode', 'tourCode', 'customerName']), 'FIT required create fields should be explicit and module-specific');
  assert(fitCreateDtoContract.FIT_TOUR_ACTION_FIELDS.includes('id') && fitCreateDtoContract.FIT_TOUR_ACTION_FIELDS.includes('step') && fitCreateDtoContract.FIT_TOUR_ACTION_FIELDS.includes('sourceTourId'), 'FIT action fields should be grouped outside the aggregate DTO surface');
  for (const field of fitCreateDtoContract.FIT_TOUR_ACTION_FIELDS) {
    assert(!fitCreateDtoContract.FIT_TOUR_CREATE_FIELDS.includes(field), `FIT action field ${field} should not be part of create/update aggregate fields`);
  }
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
  const listDtoSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/dto/list-fit-tours-query.dto.ts', 'utf8');
  const createDtoSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/dto/create-fit-tour.dto.ts', 'utf8');
  const actionDtoSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/dto/fit-tour-action.dto.ts', 'utf8');
  const fitWizardSource = fs.readFileSync('/workspace/apps/web/app/fit-tours/FitTourWizard.tsx', 'utf8');
  const legacyCompatSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/fit-tour-legacy-compat.service.ts', 'utf8');
  const filesServiceSource = fs.readFileSync('/workspace/apps/api/src/modules/files/files.service.ts', 'utf8');
  const defaultsSource = fs.readFileSync('/workspace/apps/api/src/modules/fit-tours/fit-tour-defaults.ts', 'utf8');
  const schemaSource = fs.readFileSync('/workspace/prisma/schema.prisma', 'utf8');
  const migrationNotes = fs.readFileSync('/workspace/docs/tour-migration-notes.md', 'utf8');
  assert(!serviceSource.includes('new Date(text)'), 'FIT service date parsing should avoid direct new Date(text) timezone parsing');
  assert(listDtoSource.includes('class ListFitToursQueryDto') && listDtoSource.includes('take?: number') && listDtoSource.includes('MAX_FIT_TOURS_TAKE'), 'FIT list query DTO should accept bounded take');
  assert(controllerSource.includes('list(@Query() query: ListFitToursQueryDto') && controllerSource.includes('this.fitToursService.list(query, request?.user)'), 'FIT controller should pass the full validated list query to service');
  assert(serviceSource.includes('ListFitToursQueryDto') && serviceSource.includes('take: this.listTake(query.take)'), 'FIT list service should apply bounded take from the validated query');
  assert(!serviceSource.includes('tx.tour.create') && !serviceSource.includes('tx.tour.update'), 'FitToursService should delegate Tour root create/update to TourCoreService');
  assert(serviceSource.includes('tourCore.createRoot') && serviceSource.includes('tourCore.updateRoot'), 'FitToursService should use TourCoreService root helpers');
  assert(serviceSource.includes('logFitTourAction') && serviceSource.includes('tourCore.logAction') && serviceSource.includes("module: 'fit-tours'"), 'FIT create/update/copy/upload logs should use standardized TourCoreService.logAction format');
  assert(serviceSource.includes('COPY_FIT_BUDGET') && serviceSource.includes('COPY_FIT_OPERATION'), 'FIT copy actions should write copy action logs');
  assert(serviceSource.includes('tourCore.softDelete') && !/tx\\.fitTour\\.delete/.test(serviceSource), 'FIT remove should soft-delete the common Tour owner and not delete detail directly');
  assert(schemaSource.includes('Legacy compatibility snapshot for FIT pricing common cost rows'), 'FIT legacy cost schema should be marked as compatibility snapshots');
  assert(schemaSource.includes('Legacy compatibility snapshot for FIT budget service rows'), 'FIT legacy budget service schema should be marked as compatibility snapshot');
  assert(schemaSource.includes('Legacy compatibility snapshot for FIT uploaded file metadata'), 'FIT legacy attachment schema should be marked as compatibility snapshot');
  assert(schemaSource.includes('FIT-only handover rows'), 'FIT handover schema should be marked as FIT-owned until a common table exists');
  assert(migrationNotes.includes('Legacy Table Decisions') && migrationNotes.includes('FE/BE Mapping'), 'Tour migration notes should document legacy table decisions and FE/BE mapping');
  assert(migrationNotes.includes('fit_handover_items') && migrationNotes.includes('Not ready for read-only'), 'FIT handover legacy decision should remain explicit');
  assert(migrationNotes.includes('fit_attachments') && migrationNotes.includes('Manage only via upload/delete/import compatibility'), 'FIT attachment legacy decision should stay limited to explicit attachment actions');
  assert(controllerSource.includes("@Patch(':id/steps/:step')"), 'FIT step endpoint should be exposed for wizard draft saves');
  assert(controllerSource.includes("@Post(':id/steps/:step/confirm')"), 'FIT confirm-step endpoint should be exposed separately from draft saves');
  assert(controllerSource.includes("@Post(':id/attachments')") && controllerSource.includes('FileInterceptor') && controllerSource.includes('fileUploadInterceptorOptions()'), 'FIT attachment upload endpoint should be multipart, filtered, and scoped to a FIT tour');
  assert(controllerSource.includes("@Delete(':id/attachments/:attachmentId')"), 'FIT attachment delete endpoint should be scoped to a FIT tour and attachment');
  assert(filesServiceSource.includes('defaultMaxBytes = 10 * 1024 * 1024') && filesServiceSource.includes('fileUploadMaxBytes') && filesServiceSource.includes('limits: { fileSize: maxBytes }'), 'FilesService should enforce upload size limits through service and interceptor');
  assert(filesServiceSource.includes('allowedExtensions') && filesServiceSource.includes('allowedMimeTypes') && filesServiceSource.includes('assertAllowedUpload(file)'), 'FilesService should reject unsafe file extensions and mime types');
  assert(controllerSource.includes("@Get(':id/export')") && controllerSource.includes("this.setExportHeaders(response, 'text/csv; charset=utf-8', 'smarttour-fit-tour.csv')") && controllerSource.includes('csvToXlsxWorkbook'), 'FIT export endpoint should expose CSV/XLSX downloads by tour id');
  assert(controllerSource.includes('FitTourExportDto') && controllerSource.includes('FitTourCopySourceDto') && controllerSource.includes('FitTourAttachmentUploadDto'), 'FIT action routes should use focused action DTOs instead of aggregate DTO fields');
  assert(controllerSource.includes('fitToursService.importLegacy'), 'FIT import route should keep legacy attachment metadata separate from normal create');
  assert(actionDtoSource.includes('class FitTourExportDto') && actionDtoSource.includes('class FitTourCopySourceDto') && actionDtoSource.includes('class FitTourCopyOperationDto') && actionDtoSource.includes('class FitTourAttachmentUploadDto'), 'FIT focused action DTOs should exist for export/copy/upload actions');
  assert(actionDtoSource.includes('sourceTourId!: string'), 'FIT budget copy DTO should require an explicit source tour');
  assert(actionDtoSource.includes('IsEnum(FitTourWorkflowStatus)'), 'FIT upload action DTO should validate workflow step enum');
  assert(createDtoSource.includes('@IsInt()') && createDtoSource.includes('adultCount?: number') && createDtoSource.includes('seatCount?: number'), 'FIT pax and seat DTO fields should require integers');
  assert(serviceSource.includes('async saveStep') && serviceSource.includes('async confirmStep'), 'FIT service should expose separate step draft and confirm orchestration');
  assert(serviceSource.includes('assertTerminalWorkflowEditable') && serviceSource.includes('this.assertTerminalWorkflowEditable(current.workflowStatus, patch)'), 'FIT service should reject non-idempotent edits after terminal workflow status');
  assert(serviceSource.includes('SAVE_FIT_STEP_DRAFT') && serviceSource.includes('CONFIRM_FIT_STEP'), 'FIT step draft and confirm actions should be logged separately');
  assert(serviceSource.includes('async uploadAttachment') && serviceSource.includes('UPLOAD_FIT_ATTACHMENT'), 'FIT service should expose attachment upload orchestration and log it');
  assert(serviceSource.includes('async removeAttachment') && serviceSource.includes('DELETE_FIT_ATTACHMENT'), 'FIT service should delete attachment metadata through a dedicated action');
  assert(serviceSource.includes('async exportCsv') && serviceSource.includes('requiredTourRootId(fitTour)'), 'FIT export should be generated from a scoped FIT detail with common tourId');
  assert(serviceSource.includes('tourCore.addAttachment') && serviceSource.includes('legacyCompat.addAttachment'), 'FIT upload should persist attachment metadata through common and legacy boundaries');
  assert(serviceSource.includes('legacyCompat.removeAttachment'), 'FIT attachment delete should delegate legacy snapshot removal to compatibility service');
  assert(serviceSource.includes('filesService.removeQuietly') && serviceSource.includes('objectKeyFromUrl(attachment.fileUrl)'), 'FIT attachment delete should remove storage object after deleting DB metadata');
  assert(serviceSource.includes('allowAttachmentMetadata') && serviceSource.includes('dropAttachmentPatch(scopedDto)'), 'FIT create should strip attachment metadata while legacy import may preserve it');
  assert(serviceSource.includes('validateChildPatches') && serviceSource.includes('validateStepConfirmation'), 'FIT service should validate child rows and confirmed pricing requirements');
  assert(legacyCompatSource.includes('rooms * times * exchangeRate * unitPrice'), 'FIT backend hotel formula should include room count like the wizard');
  for (const forbidden of ['row.times || 1', 'row.exchangeRate || 1', 'row.quantity || 1']) {
    assert(!legacyCompatSource.includes(forbidden), `FIT legacy mapper should not use truthy fallback ${forbidden}`);
  }
  assert(!serviceSource.includes('row.exchangeRate || 1'), 'FIT service root operation mapper should not use truthy exchangeRate fallback');
  assert(serviceSource.includes('Tour nguồn dự toán phải khác tour đích'), 'FIT budget copy should reject the target as its own source');
  assert(serviceSource.includes('description: this.optionalText(operationInputRows[index]?.description)'), 'FIT common operation service mapping should preserve descriptions');
  assert(fitWizardSource.includes('stepPayloadFields') && fitWizardSource.includes('/steps/${step}') && fitWizardSource.includes('/steps/${step}/confirm'), 'FIT wizard should save existing records through step-scoped draft/confirm payloads');
  const fitWorkflowOrder = ['PRICING', 'TOUR_INFO', 'BUDGET', 'OPERATION', 'HANDOVER', 'SURVEY'];
  let previousWizardStepIndex = -1;
  let previousServiceStepIndex = serviceSource.indexOf('FitTourWorkflowStatus.DRAFT');
  const schemaWorkflowBlock = schemaSource.slice(schemaSource.indexOf('enum FitTourWorkflowStatus'), schemaSource.indexOf('enum FitServiceStatus'));
  let previousSchemaStepIndex = schemaWorkflowBlock.indexOf('DRAFT');
  assert(previousServiceStepIndex >= 0 && previousSchemaStepIndex >= 0, 'FIT backend workflow should start from DRAFT');
  for (const step of fitWorkflowOrder) {
    const wizardStepIndex = fitWizardSource.indexOf(`key: '${step}'`);
    const serviceStepIndex = serviceSource.indexOf(`FitTourWorkflowStatus.${step}`);
    const schemaStepIndex = schemaWorkflowBlock.indexOf(step);
    assert(wizardStepIndex > previousWizardStepIndex, `FIT wizard workflow step ${step} should keep the approved order`);
    assert(serviceStepIndex > previousServiceStepIndex, `FIT backend workflow step ${step} should keep the approved order`);
    assert(schemaStepIndex > previousSchemaStepIndex, `FIT schema workflow step ${step} should keep the approved enum order`);
    previousWizardStepIndex = wizardStepIndex;
    previousServiceStepIndex = serviceStepIndex;
    previousSchemaStepIndex = schemaStepIndex;
  }
  assert(serviceSource.indexOf('FitTourWorkflowStatus.COMPLETED') > previousServiceStepIndex && schemaWorkflowBlock.indexOf('COMPLETED') > previousSchemaStepIndex, 'FIT backend workflow should only complete after survey');
  assert(schemaWorkflowBlock.includes('CANCELLED'), 'FIT schema workflow should keep CANCELLED as terminal status');
  assert(fitWizardSource.includes('confirmedWorkflowStepIndex') && fitWizardSource.includes('canOpenWorkflowStep') && fitWizardSource.includes('blockedWorkflowStepMessage'), 'FIT wizard should derive accessible steps from confirmed workflow status');
  assert(fitWizardSource.includes('goToStep(index)') && fitWizardSource.includes('aria-disabled={locked}') && fitWizardSource.includes("locked ? ' locked' : ''"), 'FIT wizard step tabs should block unopened workflow steps');
  assert(fitWizardSource.includes('goToStep(Math.max(0, activeStep - 1))') && fitWizardSource.includes('goToStep(Math.min(workflowSteps.length - 1, activeStep + 1))'), 'FIT wizard previous/next buttons should use guarded workflow navigation');
  assert(fitWizardSource.includes('FormData') && fitWizardSource.includes('/attachments'), 'FIT wizard should upload attachment files through multipart FIT endpoint');
  assert(fitWizardSource.includes('removeAttachment') && fitWizardSource.includes('DELETE') && fitWizardSource.includes('AttachmentList'), 'FIT wizard should list and delete uploaded attachments');
  const pricingStepBlock = fitWizardSource.slice(fitWizardSource.indexOf('PRICING: ['), fitWizardSource.indexOf('TOUR_INFO: ['));
  assert(!pricingStepBlock.includes("'attachments'"), 'FIT wizard step payload should not send attachment metadata during pricing autosave');
  const fitToursClientSource = fs.readFileSync('/workspace/apps/web/app/fit-tours/FitToursClient.tsx', 'utf8');
  const fitToursPageSource = fs.readFileSync('/workspace/apps/web/app/fit-tours/page.tsx', 'utf8');
  assert(fitToursClientSource.includes('/export') && fitToursClientSource.includes('URL.createObjectURL'), 'FIT list UI should download exported CSV from the FIT export endpoint');
  assert(fitToursClientSource.includes('URLSearchParams') && fitToursClientSource.includes("params.set('status', workflowFilter)"), 'FIT list should send explicit search and workflow filters');
  assert(fitToursClientSource.includes('normalizedSearch.length < 2'), 'FIT list should reject misleading one-character searches');
  assert(fitToursClientSource.includes('messageClass(listMessage)'), 'FIT list should visually distinguish success, warning, and error feedback');
  assert(fitToursClientSource.includes('exportFileCode(tour)'), 'FIT list should export CSV with a business-facing tour code filename');
  assert(fitToursClientSource.includes("return workflowLabels[key] || 'Chưa xác định'"), 'FIT list should not expose unknown technical workflow values');
  assert(fitToursClientSource.includes('Tour FIT còn thay đổi chưa lưu'), 'FIT list should warn before closing a dirty wizard');
  assert(fitToursClientSource.includes('onDirtyChange={setWizardDirty}') && fitToursClientSource.includes('onStatusChange='), 'FIT list should receive dirty and action status from the wizard');
  assert(fitToursClientSource.includes('initialError') && fitToursPageSource.includes('initialError={initialError}'), 'FIT list should expose initial API load failures instead of showing a false empty state');
  assert(fitToursClientSource.includes("if (reason === 'confirm')") && fitToursClientSource.includes("if (reason === 'upload')"), 'FIT list save messages should distinguish confirm and upload actions');
  assert(fitToursClientSource.includes('<th>Tour FIT</th>') && fitToursClientSource.includes('<th>Tiến độ dịch vụ</th>'), 'FIT list should present business summary columns');
  assert(!fitToursClientSource.includes('<th>Dự toán / Điều hành</th>'), 'FIT list should not expose implementation-oriented combined column labels');
  assert(fitToursClientSource.includes('dịch vụ dự toán') && fitToursClientSource.includes('dịch vụ điều hành'), 'FIT list service counts should use business wording');
  assert(fitWizardSource.includes('onDirtyChange?:') && fitWizardSource.includes('onStatusChange?:'), 'FIT wizard should expose state callbacks for its parent list');
  assert(fitWizardSource.includes('loadRequestId.current') && fitWizardSource.includes('selectTour(event.target.value)'), 'FIT wizard should protect tour switching from stale detail responses');
  assert(fitWizardSource.includes('loadedTourId.current') && fitWizardSource.includes('hasUnsavedChanges && !window.confirm'), 'FIT wizard should restore the loaded tour and warn before discarding dirty state');
  assert(!fitWizardSource.includes('\u0110ang copy') && !fitWizardSource.includes('Copy d\u1ef1 to\u00e1n l\u1ed7i') && !fitWizardSource.includes('Copy \u0111i\u1ec1u h\u00e0nh l\u1ed7i'), 'FIT wizard should not expose English copy wording in action feedback');
  assert(fitWizardSource.includes('L\u01b0u nh\u00e1p') && fitWizardSource.includes('X\u00e1c nh\u1eadn b\u01b0\u1edbc'), 'FIT wizard should expose separate draft save and confirm buttons');
  for (const sectionTitle of ['Thông tin tour', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ']) {
    assert(fitWizardSource.includes(sectionTitle), `FIT wizard should keep synchronized section title ${sectionTitle}`);
  }
  for (const label of ['Mã báo giá', 'Mã tour', 'Nhóm thị trường', 'Ngày đặt', 'Khởi đi', 'Ngày về', 'Họ tên khách', 'Số người lớn', 'Trẻ em', 'Em bé', 'Giá bán / khách', 'Hoa hồng / khách', 'Chi phí chung', 'Chi phí khách sạn', 'Chi phí riêng khách', 'Dự toán dịch vụ', 'Điều hành dịch vụ', 'Phiếu bàn giao', 'Phiếu đánh giá dịch vụ']) {
    assert(fitWizardSource.includes(label), `FIT wizard should keep Vietnamese label ${label}`);
  }
  assert(fitWizardSource.includes('Cho phép vượt chỗ sau khi điều hành xác nhận'), 'FIT wizard allowOverbooking label should use concise business wording');
  for (const legacyText of ['Lien he khach truoc tour', 'Tao nhom Zalo', 'Bao cao phat sinh', 'Rooming list', 'Final confirmation', 'Khong', 'Loại HDV', 'Giá NET / khách', 'Cho phép nhận thêm khách vượt số chỗ dự kiến sau khi điều hành xác nhận']) {
    assert(!fitWizardSource.includes(legacyText), `FIT wizard should not keep legacy label ${legacyText}`);
  }
  assert(fitWizardSource.includes("quoteCode: ''") && fitWizardSource.includes("tourCode: ''"), 'FIT new-tour defaults should not generate collision-prone daily codes');
  assert(fitWizardSource.includes('commonCosts: [{ ...emptyCost }]') && fitWizardSource.includes('hotelCosts: [{ ...emptyCost, paxPerRoom: 2 }]') && fitWizardSource.includes('privateCosts: [{ ...emptyCost }]') && fitWizardSource.includes('budgetServices: [{ ...emptyService }]'), 'FIT new-tour defaults should keep child input rows empty instead of prefilled business examples');
  assert(!/commonCosts: \[\{ \.\.\.emptyCost, serviceType:/.test(fitWizardSource) && !/privateCosts: \[\{ \.\.\.emptyCost, serviceType:/.test(fitWizardSource) && !/budgetServices: \[\{ \.\.\.emptyService, serviceType:/.test(fitWizardSource), 'FIT toFormDefaults should not prefill business-specific service labels');
  assert(fitWizardSource.includes("if (!current.id)") && fitWizardSource.includes('Tour mới chỉ được lưu khi bạn bấm Lưu nháp'), 'FIT autosave should not create a new tour while the user is typing');
  assert(fitWizardSource.includes('saveInFlight.current') && fitWizardSource.includes('autosaveDelayMs = 3000'), 'FIT autosave should debounce and prevent concurrent saves');
  assert(fitWizardSource.includes('const autosaveTourId = current.id') && fitWizardSource.includes('autosaveTourId !== loadedTourId.current') && fitWizardSource.includes("setSaveState('Đang chuyển tour, tạm dừng tự lưu')"), 'FIT autosave should not update stale state after switching loaded tours');
  assert(fitWizardSource.includes('FieldErrors') && fitWizardSource.includes('handleInvalidSubmit') && fitWizardSource.includes('Chưa thể lưu'), 'FIT wizard submit/confirm should report invalid form state instead of submitting silently');
  assert(fitWizardSource.includes('noValidate') && fitWizardSource.includes('aria-busy={isBusy}') && fitWizardSource.includes('role="status"') && fitWizardSource.includes('aria-live="polite"'), 'FIT wizard should expose clear loading/save state and route validation through the form');
  assert(fitWizardSource.includes('sectionError') && fitWizardSource.includes('role="alert"') && fitWizardSource.includes('fieldErrorText') && fitWizardSource.includes('aria-invalid={Boolean(error)}'), 'FIT wizard validation errors should be visible at field or section level');
  assert(fitWizardSource.includes('const isMutationDisabled = !canManageTours || isBusy;') && fitWizardSource.includes('disabled={isMutationDisabled}') && fitWizardSource.includes('saveState.startsWith'), 'FIT wizard should disable dangerous submit/copy actions while a save action is running');
  assert(fitWizardSource.includes('ghi đè toàn bộ dự toán') && fitWizardSource.includes('ghi đè toàn bộ dòng điều hành'), 'FIT wizard copy actions should confirm before overwriting target data');
  assert(fitWizardSource.includes('Tạo tour FIT mới sẽ xóa dữ liệu đang nhập chưa lưu') && fitWizardSource.includes('Xóa dòng này khỏi bảng') && fitWizardSource.includes('rowHasDeletableContent'), 'FIT wizard should confirm reset and meaningful row deletion');
  assert(fitWizardSource.includes('void loadTour(initialTourId)') && fitWizardSource.includes('reset(defaults, { keepDirty: false })') && fitWizardSource.includes('lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults))'), 'FIT load should hydrate saved tours into a clean wizard state');
  assert(fitWizardSource.includes('workflowStepIndex(defaults.workflowStatus)'), 'FIT load should restore the active workflow step');
  assert(fitWizardSource.includes('normalizeCostRows') && fitWizardSource.includes('normalizeServiceRows'), 'FIT load should normalize numeric child rows');
  assert(fitWizardSource.includes('const hasSavedTour = Boolean(tour?.id)') && fitWizardSource.includes('const arrayFallbacks = hasSavedTour') && fitWizardSource.includes('commonCosts: [] as FitTourForm'), 'FIT load should not backfill saved tours with new-tour default child rows when API arrays are missing');
  assert(fitWizardSource.includes('bookingDate: normalizeDate(tour?.bookingDate) || (hasSavedTour ?') && fitWizardSource.includes('handoverGuideRequest: tour?.handoverGuideRequest !== undefined'), 'FIT load should avoid saved-tour scalar defaults that can overwrite missing legacy fields');
  assert(fitWizardSource.includes('createPayload') && fitWizardSource.includes('attachments: _attachments'), 'FIT create should omit action-owned attachment metadata');
  assert(fitWizardSource.includes('adultCount: normalizeNumber(data.adultCount, 0)') && fitWizardSource.includes('allowOverbooking: Boolean(data.allowOverbooking)') && fitWizardSource.includes('bookingDate: normalizeDate(data.bookingDate)'), 'FIT save payload should normalize number, boolean, and date fields before sending');
  for (const numericField of ['sellingPrice', 'commissionPerGuest', 'adultPrice', 'childPrice25', 'childPrice611', 'infantPrice', 'exchangeRate']) {
    assert(fitWizardSource.includes(`${numericField}: normalizeNumber(data.${numericField}`) && fitWizardSource.includes(`${numericField}: normalizeNumber(tour?.${numericField}`), `FIT wizard should normalize numeric field ${numericField} on save and load`);
  }
  assert(fitWizardSource.includes('function lineAmount') && fitWizardSource.includes('quantity * times * exchangeRate * unitPrice * (1 + vat / 100)'), 'FIT wizard lineAmount should calculate quantity * times * exchangeRate * unitPrice * VAT');
  assert(fitWizardSource.includes('function hotelLineAmount') && fitWizardSource.includes('Math.ceil(Math.max(1, totalPax) / positiveNumber(line.paxPerRoom))'), 'FIT hotel amount should account for guests per room');
  assert(legacyCompatSource.includes('quantity * times * exchangeRate * unitPrice') && legacyCompatSource.includes('rooms * times * exchangeRate * unitPrice') && legacyCompatSource.includes('quantity * unitPrice') && legacyCompatSource.includes('quantity * confirmedUnitPrice'), 'FIT backend mapping formulas should stay aligned with wizard cost/service calculations');
  assert(fitWizardSource.includes('const budgetRevenue = totalPax * number(values.sellingPrice)') && fitWizardSource.includes('const budgetProfit = budgetRevenue - budgetCost') && fitWizardSource.includes('const operationProfit = budgetRevenue - operationCost'), 'FIT wizard summary cards should use the same revenue/cost/profit formulas');
  assert(fitWizardSource.includes('amountFormulaFields') && fitWizardSource.includes('if (!changedField || !formulaFields.includes(changedField)) return'), 'FIT amount auto-calculation should only run when formula inputs change');
  assert(fitWizardSource.includes("operationServices: ['quantity', 'confirmedUnitPrice', 'vat']"), 'FIT operation amount auto-calculation should use confirmed unit price inputs');
  for (const label of ['Tổng số khách', 'Tổng phí chung', 'Tổng phí riêng', 'Giá vốn / khách', 'Lợi nhuận / khách', 'Tổng thu dự kiến', 'Tổng chi dự kiến', 'Lợi nhuận dự kiến', 'Tổng thu điều hành', 'Tổng chi điều hành', 'Lợi nhuận thực tế']) {
    assert(fitWizardSource.includes(label), `FIT wizard summary should keep business metric label ${label}`);
  }
  assert(fitWizardSource.includes('getFieldState(amountPath).isDirty') && fitWizardSource.includes('setValue(amountPath, amount as never, { shouldDirty: false, shouldValidate: false })'), 'FIT amount auto-calculation should preserve manually edited amounts');
  assert(fitWizardSource.includes('CopySourceSelect') && fitWizardSource.includes('findTourSummary(tours, copySourceTourId)') && fitWizardSource.includes('sourceTourId: sourceTour.id'), 'FIT budget copy should use a validated explicit source tour');
  assert(fitWizardSource.includes('let sourceTourId = id') && fitWizardSource.includes('sourceTourId = sourceTour.id') && fitWizardSource.includes('sourceTourId }'), 'FIT operation copy should explicitly use selected or current tour source');
  assert(fitWizardSource.includes('workflowSteps.some((step) => step.key === row.step)'), 'FIT loaded attachments should remain scoped to valid workflow steps');
  assert(fitWizardSource.includes('goToStep(index)') && fitWizardSource.includes('Math.max(0, activeStep - 1)') && fitWizardSource.includes('Math.min(workflowSteps.length - 1, activeStep + 1)'), 'FIT wizard should support guarded direct and previous/next workflow navigation');
  for (const [name, title] of [
    ['commonCosts', 'Chi phí chung'],
    ['hotelCosts', 'Chi phí khách sạn'],
    ['privateCosts', 'Chi phí riêng khách'],
    ['guides', 'Hướng dẫn viên'],
    ['budgetServices', 'Dự toán dịch vụ'],
    ['operationServices', 'Điều hành dịch vụ'],
    ['handoverItems', 'Vật dụng và quà tặng'],
    ['surveyQuestions', 'Câu hỏi đánh giá dịch vụ'],
  ]) {
    assert(fitWizardSource.includes(`title="${title}" name="${name}"`), `FIT wizard should render child table ${name}`);
    assert(fitWizardSource.includes(`append={() => arrays.${name}.append`) && fitWizardSource.includes(`confirmRemoveRow('${name}'`), `FIT wizard child table ${name} should support guarded add/remove rows`);
  }
  assert(!legacyCompatSource.includes('new Date(text)'), 'FIT legacy compatibility date parsing should avoid direct new Date(text) timezone parsing');
  assert(legacyCompatSource.includes('private hasChanges') && legacyCompatSource.includes('private async replaceFitChildren'), 'FIT legacy child sync should use hasChanges -> deleteMany -> createMany helper pattern');
  const legacySyncChildrenBlock = legacyCompatSource.slice(legacyCompatSource.indexOf('async syncChildren'), legacyCompatSource.indexOf('async replaceBudgetServices'));
  assert(legacySyncChildrenBlock.includes('hasChanges') && legacySyncChildrenBlock.includes('replaceFitChildren'), 'FIT legacy syncChildren should dispatch through child sync helpers');
  assert(!legacySyncChildrenBlock.includes('.deleteMany') && !legacySyncChildrenBlock.includes('.createMany'), 'FIT legacy syncChildren should not inline deleteMany/createMany per child group');
  assert(!serviceSource.includes('l? b?t bu?c'), 'FIT service validation messages should not contain mojibake text');
  assert(!serviceSource.includes('const defaultHandoverItems') && !legacyCompatSource.includes('const defaultHandoverItems'), 'FIT services should not duplicate default handover constants');
  assert(!serviceSource.includes('const defaultSurveyQuestions') && !legacyCompatSource.includes('const defaultSurveyQuestions'), 'FIT services should not duplicate default survey constants');
  assert(serviceSource.includes('FIT_DEFAULT_SURVEY_QUESTIONS'), 'FIT service should import shared default survey questions');
  assert(legacyCompatSource.includes('FIT_DEFAULT_HANDOVER_ITEMS') && legacyCompatSource.includes('FIT_DEFAULT_SURVEY_QUESTIONS'), 'FIT legacy compatibility should import shared defaults');
  assert(!legacyCompatSource.includes('Ti liu bn giao') && legacyCompatSource.includes('T\u00e0i li\u1ec7u b\u00e0n giao'), 'FIT legacy handover fallback should keep Vietnamese text');
  assert(!legacyCompatSource.includes('Cu hi') && legacyCompatSource.includes('C\u00e2u h\u1ecfi'), 'FIT legacy survey fallback should keep Vietnamese text');
  assert(!defaultsSource.includes('V my bay'), 'FIT default handover items should keep Vietnamese accents');
  assert(defaultsSource.includes('V\u00e9 m\u00e1y bay'), 'FIT default handover items should include Vietnamese text');
  assert(defaultsSource.includes('Ch\u1ea5t l\u01b0\u1ee3ng ch\u01b0\u01a1ng tr\u00ecnh tour'), 'FIT default survey questions should include Vietnamese text');
  for (const mojibake of ['Dch v', 'Khch sn', 'Dich vu', 'Bc workflow ca file']) {
    assert(!legacyCompatSource.includes(mojibake), `FIT legacy compatibility should not contain mojibake/fallback text ${mojibake}`);
  }
  assert(legacyCompatSource.includes('D\u1ecbch v\u1ee5') && legacyCompatSource.includes('Kh\u00e1ch s\u1ea1n'), 'FIT legacy compatibility should keep Vietnamese fallback service labels');
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
  const zeroCompat = new FitTourLegacyCompatService();
  const zeroCommon = zeroCompat.mapCommonCosts([{ serviceType: 'CAR', quantity: 0, times: 0, exchangeRate: 0, unitPrice: 1000 }])[0];
  assert(decimal(zeroCommon.quantity) === 0 && decimal(zeroCommon.times) === 0 && decimal(zeroCommon.exchangeRate) === 0 && decimal(zeroCommon.amount) === 0, 'FIT legacy common cost mapper should preserve explicit zero multipliers');
  const zeroHotel = zeroCompat.mapHotelCosts([{ serviceType: 'HOTEL', paxPerRoom: 2, times: 0, exchangeRate: 0, unitPrice: 1000 }], 4)[0];
  assert(decimal(zeroHotel.times) === 0 && decimal(zeroHotel.exchangeRate) === 0 && decimal(zeroHotel.amount) === 0, 'FIT legacy hotel cost mapper should preserve explicit zero multipliers');
  const zeroHandover = zeroCompat.mapHandoverItems([{ itemName: 'Voucher', quantity: 0 }])[0];
  assert(decimal(zeroHandover.quantity) === 0, 'FIT legacy handover mapper should preserve explicit zero quantity');
  const prisma = new PrismaService();
  await prisma.$connect();

  const tourCore = new TourCoreService(prisma);
  const uploadedScopes = [];
  const removedObjectKeys = [];
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
    removeQuietly: async (objectKey) => {
      if (objectKey) removedObjectKeys.push(objectKey);
    },
    objectKeyFromUrl: (fileUrl) => {
      if (!fileUrl) return null;
      return new URL(fileUrl, 'http://smarttour.local').searchParams.get('key');
    },
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
    hotelCosts: [{ serviceType: 'HOTEL', description: 'Source hotel', paxPerRoom: 2, times: 1, unitPrice: 2000, vat: 0, amount: 2000 }],
    privateCosts: [{ serviceType: 'TICKET', description: 'Source ticket', quantity: 2, times: 1, unitPrice: 500, vat: 0, amount: 1000 }],
    budgetServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, description: 'Budget hotel', quantity: 2, unitPrice: 1000, vat: 10, amount: 2200 }],
    operationServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, supplierServiceId: supplierService.id, description: 'Operation hotel', bookingCode: `${run}-BK`, quantity: 2, confirmedUnitPrice: 1200, vat: 10, amount: 2640, status: FitServiceStatus.CONFIRMED }],
    attachments: [{ step: FitTourWorkflowStatus.PRICING, fileName: 'injected-create.pdf', fileUrl: '/injected-create.pdf', size: 100 }],
    status: TourStatus.CANCELLED,
    workflowStep: 'MANUAL_ROOT_WORKFLOW_SHOULD_BE_IGNORED',
  });
  assert(source.tourId, 'FIT create should return linked Tour root id');
  assert(source.attachments.length === 0, 'FIT normal create should ignore client-supplied attachment metadata');
  assert(await prisma.tourAttachment.count({ where: { tourId: source.tourId } }) === 0, 'FIT normal create should not write common attachment metadata');
  assert(await prisma.fitAttachment.count({ where: { fitTourId: source.id } }) === 0, 'FIT normal create should not write legacy attachment metadata');

  const imported = await fitTours.importLegacy({
    quoteCode: `${run}-IMPORT-Q`,
    tourCode: `${run}-IMPORT-T`,
    customerName: 'FIT Import Customer',
    adultCount: 1,
    attachments: [{ step: FitTourWorkflowStatus.PRICING, fileName: 'legacy-import.pdf', fileUrl: '/legacy-import.pdf', size: 321 }],
  });
  assert(imported.attachments.some((row) => row.fileName === 'legacy-import.pdf'), 'FIT legacy import should preserve attachment metadata for compatibility');

  const incompletePricing = await fitTours.create({
    quoteCode: `${run}-INCOMPLETE-Q`,
    tourCode: `${run}-INCOMPLETE-T`,
    customerName: 'FIT Incomplete Customer',
    adultCount: 1,
  });
  await assertRejects(
    () => fitTours.confirmStep(incompletePricing.id, FitTourWorkflowStatus.PRICING, {}),
    'Cần nhập ngày khởi đi',
    'FIT pricing confirmation should require travel dates',
  );
  await assertRejects(
    () => fitTours.confirmStep(incompletePricing.id, FitTourWorkflowStatus.BUDGET, {}),
    'Không được chuyển workflow FIT vượt quá bước kế tiếp',
    'FIT confirmStep should reject skipping required workflow steps',
  );
  const beforeInvalidCreateCount = await prisma.fitTour.count();
  await assertRejects(
    () => fitTours.create({ quoteCode: `${run}-BAD-Q`, tourCode: 'X', customerName: '' }),
    'Mã tour cần ít nhất 2 ký tự',
    'FIT create should reject half-filled identity payloads',
  );
  assert(await prisma.fitTour.count() === beforeInvalidCreateCount, 'FIT rejected create should not leave a partial record');
  await assertRejects(
    () => fitTours.update(source.id, { commonCosts: [{ serviceType: 'CAR', amount: -1 }] }),
    'commonCosts[0].amount không được âm',
    'FIT child validation should reject negative cost amounts',
  );
  await assertRejects(
    () => fitTours.update(source.id, { commonCosts: [{ serviceType: 'CAR', quantity: 1, times: 0, unitPrice: 1000 }] }),
    'commonCosts[0].times phải lớn hơn 0',
    'FIT child validation should reject zero cost multipliers instead of defaulting them to one',
  );
  await assertRejects(
    () => fitTours.update(source.id, { budgetServices: [{ serviceType: 'HOTEL', quantity: 0, unitPrice: 1000 }] }),
    'budgetServices[0].quantity phải lớn hơn 0',
    'FIT child validation should reject zero budget service quantities',
  );
  await assertRejects(
    () => fitTours.update(source.id, { handoverItems: [{ itemName: 'Voucher dịch vụ', quantity: 0 }] }),
    'handoverItems[0].quantity phải lớn hơn 0',
    'FIT handover validation should reject zero handover item quantities instead of defaulting them to one',
  );
  await assertRejects(
    () => fitTours.update(source.id, { operationServices: [{ serviceType: 'HOTEL', status: 'INVALID_STATUS' }] }),
    'operationServices[0].status không thuộc danh sách trạng thái dịch vụ hợp lệ',
    'FIT child validation should reject invalid operation status',
  );

  const zeroAmountTour = await fitTours.create({
    quoteCode: `${run}-ZERO-AMOUNT-Q`,
    tourCode: `${run}-ZERO-AMOUNT-T`,
    customerName: 'FIT Zero Amount Customer',
    adultCount: 1,
    commonCosts: [{ serviceType: 'CAR', description: 'Zero amount car', quantity: 1, times: 1, unitPrice: 1000, vat: 0, amount: 0 }],
    budgetServices: [{ serviceType: 'MEAL', supplierId: supplier.id, description: 'Zero amount budget', quantity: 1, unitPrice: 1000, vat: 0, amount: 0 }],
  });
  assert(decimal(zeroAmountTour.commonCosts[0].amount) === 0, 'FIT create should preserve explicit zero common cost amount');
  assert(decimal(zeroAmountTour.budgetServices[0].amount) === 0, 'FIT create should preserve explicit zero budget service amount');
  const zeroAmountRoot = await prisma.tour.findUnique({ where: { id: zeroAmountTour.tourId }, include: { costs: true, services: true } });
  assert(zeroAmountRoot.costs.some((row) => row.costType === 'FIT_COMMON_COST:CAR' && decimal(row.expectedAmount) === 0), 'FIT common TourCost should preserve explicit zero cost amount');
  assert(zeroAmountRoot.services.some((row) => row.serviceType === 'MEAL' && decimal(row.budgetAmount) === 0), 'FIT common TourService should preserve explicit zero budget amount');
  await prisma.tourCost.updateMany({
    where: { tourId: zeroAmountTour.tourId, costType: 'FIT_COMMON_COST:CAR' },
    data: { expectedAmount: 1000, actualAmount: 0 },
  });
  const zeroActualDetail = await fitTours.detail(zeroAmountTour.id);
  const zeroActualCommonCost = zeroActualDetail.commonCosts.find((row) => row.serviceType === 'CAR');
  assert(zeroActualCommonCost && decimal(zeroActualCommonCost.amount) === 0, 'FIT root detail should preserve explicit zero actualAmount instead of falling back to expectedAmount');

  const linkedOrder = await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: `${run}-ORDER-FIT`, name: 'FIT linked order' } });
  const orderLinkedFit = await fitTours.create({
    quoteCode: `${run}-ORDER-LINKED-Q`,
    tourCode: `${run}-ORDER-LINKED-T`,
    customerName: 'FIT Order Linked Customer',
    adultCount: 1,
    orderId: linkedOrder.id,
  });
  await assertRejects(
    () => fitTours.remove(orderLinkedFit.id),
    'Không thể xóa tour FIT đã phát sinh',
    'FIT remove should block tours linked to orders or external dependencies',
  );
  const orderLinkedRootAfterRemove = await prisma.tour.findUnique({ where: { id: orderLinkedFit.tourId } });
  assert(!orderLinkedRootAfterRemove.deletedAt, 'FIT blocked remove should not soft-delete the common Tour root');

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

  const removableDetail = await fitTours.uploadAttachment(
    source.id,
    FitTourWorkflowStatus.BUDGET,
    { originalname: 'fit-budget-remove.pdf', mimetype: 'application/pdf', size: 777, buffer: Buffer.from('fit-budget-remove') },
  );
  const removableAttachment = removableDetail.attachments.find((row) => row.fileName === 'fit-budget-remove.pdf');
  assert(removableAttachment && removableAttachment.step === FitTourWorkflowStatus.BUDGET, 'FIT upload should attach files to the requested workflow step');
  const afterDeleteAttachment = await fitTours.removeAttachment(source.id, removableAttachment.id);
  assert(!afterDeleteAttachment.attachments.some((row) => row.fileName === 'fit-budget-remove.pdf'), 'FIT removeAttachment should remove the file from detail response');
  assert(await prisma.tourAttachment.count({ where: { tourId: source.tourId, fileName: 'fit-budget-remove.pdf' } }) === 0, 'FIT removeAttachment should delete common attachment metadata');
  assert(await prisma.fitAttachment.count({ where: { fitTourId: source.id, fileName: 'fit-budget-remove.pdf' } }) === 0, 'FIT removeAttachment should delete legacy attachment metadata');
  assert(removedObjectKeys.some((key) => key.includes(`fit-tours/${source.id}/${FitTourWorkflowStatus.BUDGET}`)), 'FIT removeAttachment should remove the uploaded object by workflow-scoped key');

  await fitTours.saveStep(source.id, FitTourWorkflowStatus.PRICING, { attachments: [{ step: FitTourWorkflowStatus.PRICING, fileName: 'tampered.pdf', fileUrl: '/tampered.pdf' }] });
  const attachmentsAfterStepPatch = await prisma.tourAttachment.findMany({ where: { tourId: source.tourId } });
  const legacyAttachmentsAfterStepPatch = await prisma.fitAttachment.findMany({ where: { fitTourId: source.id } });
  assert(attachmentsAfterStepPatch.length === 1 && attachmentsAfterStepPatch[0].fileName === 'fit-pricing.pdf', 'FIT step save should not overwrite uploaded common attachments');
  assert(legacyAttachmentsAfterStepPatch.length === 1 && legacyAttachmentsAfterStepPatch[0].fileName === 'fit-pricing.pdf', 'FIT step save should not overwrite uploaded legacy attachment snapshot');

  const exportedCsv = await fitTours.exportCsv(source.id);
  assert(exportedCsv.includes(`"tour","tourId","${source.tourId}","common Tour root"`), 'FIT export should include common tourId');
  assert(exportedCsv.includes('FIT Root Contract Source'), 'FIT export should include common Tour root name');
  assert(exportedCsv.includes('"attachments","1","PRICING","fit-pricing.pdf"'), 'FIT export should include uploaded attachment metadata');
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
  assert(createdRoot.costs.length === 3, 'Tour root should own every FIT cost group');
  assert(createdRoot.costs.some((row) => row.costType === 'FIT_COMMON_COST:CAR' && decimal(row.expectedAmount) === 1000), 'Tour root costType should preserve FIT common cost group and service type');
  assert(createdRoot.costs.some((row) => row.costType === 'FIT_HOTEL_COST:HOTEL' && decimal(row.expectedAmount) === 2000), 'Tour root should preserve FIT hotel costs');
  assert(createdRoot.costs.some((row) => row.costType === 'FIT_PRIVATE_COST:TICKET' && decimal(row.expectedAmount) === 1000), 'Tour root should preserve FIT private costs');
  assert(createdRoot.services.length === 2, 'Tour root should own budget and operation services');
  assert(createdRoot.services.some((row) => row.description === 'Operation hotel'), 'Tour root should preserve FIT operation service descriptions');
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
  const rootSourcedList = await fitTours.list({ search: 'FIT Root Contract Source' });
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
  assert(rootSourcedChildren.operationServices[0].description === 'Operation hotel', 'FIT detail should expose common TourService operation description');

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
  await assertRejects(
    () => fitTours.update(source.id, { workflowStatus: FitTourWorkflowStatus.SURVEY }),
    'Không được chuyển workflow FIT vượt quá bước kế tiếp',
    'FIT workflow should reject jumping outside the next step',
  );
  await assertRejects(
    () => fitTours.confirmStep(source.id, FitTourWorkflowStatus.SURVEY, {}),
    'Không được chuyển workflow FIT vượt quá bước kế tiếp',
    'FIT confirmStep should reject jumping outside the next step',
  );
  await fitTours.saveStep(source.id, FitTourWorkflowStatus.PRICING, {
    commonCosts: [{ serviceType: 'CAR', description: 'Step repriced car', quantity: 1, times: 1, unitPrice: 1100, vat: 0, amount: 1100 }],
  });
  const stepPricingBack = await fitTours.detail(source.id);
  assert(stepPricingBack.workflowStatus === FitTourWorkflowStatus.TOUR_INFO, 'saveStep earlier step should not regress workflow');
  assert(stepPricingBack.commonCosts[0].description === 'Step repriced car', 'saveStep earlier step should still update allowed pricing fields');
  assert(stepPricingBack.hotelCosts[0].description === 'Source hotel', 'updating commonCosts should preserve hotelCosts');
  assert(stepPricingBack.privateCosts[0].description === 'Source ticket', 'updating commonCosts should preserve privateCosts');
  const hotelFormulaTour = await fitTours.create({
    quoteCode: `${run}-HOTEL-FORMULA-Q`,
    tourCode: `${run}-HOTEL-FORMULA-T`,
    customerName: 'FIT Hotel Formula Customer',
    adultCount: 3,
    childCount: 1,
    infantCount: 1,
    hotelCosts: [{ serviceType: 'HOTEL', description: 'Formula hotel', paxPerRoom: 2, times: 2, unitPrice: 1000, vat: 10 }],
  });
  const formulaHotelRow = hotelFormulaTour.hotelCosts.find((row) => row.description === 'Formula hotel') || hotelFormulaTour.hotelCosts[0];
  assert(closeTo(formulaHotelRow.amount, 6600), `FIT backend hotel cost should match UI formula rooms * nights * unit price * VAT, got ${decimal(formulaHotelRow.amount)}`);
  const hotelFormulaRootCost = await prisma.tourCost.findFirst({ where: { tourId: hotelFormulaTour.tourId, costType: 'FIT_HOTEL_COST:HOTEL' } });
  assert(closeTo(hotelFormulaRootCost.expectedAmount, 6600), 'FIT common TourCost hotel amount should match UI formula');
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

  await fitTours.saveStep(source.id, FitTourWorkflowStatus.OPERATION, {
    operationServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, supplierServiceId: supplierService.id, description: 'Step operation hotel', bookingCode: `${run}-STEP-OP`, quantity: 3, confirmedUnitPrice: 1300, vat: 0, amount: 3900, status: FitServiceStatus.CONFIRMED }],
    budgetServices: [{ serviceType: 'WRONG_OPERATION_BUDGET', description: 'Wrong operation step', quantity: 1, unitPrice: 999, amount: 999 }],
  });
  const stepOperationDetail = await fitTours.detail(source.id);
  assert(stepOperationDetail.workflowStatus === FitTourWorkflowStatus.BUDGET, 'saveStep OPERATION should save draft without advancing workflow');
  assert(stepOperationDetail.operationServices[0].description === 'Step operation hotel', 'saveStep OPERATION should update operation rows');
  assert(!stepOperationDetail.budgetServices.some((row) => row.description === 'Wrong operation step'), 'saveStep OPERATION should ignore budget rows outside step field contract');
  await fitTours.confirmStep(source.id, FitTourWorkflowStatus.OPERATION, {});
  const stepOperationConfirmed = await fitTours.detail(source.id);
  assert(stepOperationConfirmed.workflowStatus === FitTourWorkflowStatus.OPERATION, 'confirmStep OPERATION should advance workflow');
  assert(stepOperationConfirmed.operationServices[0].bookingCode === `${run}-STEP-OP`, 'confirmStep OPERATION should keep drafted operation rows');

  await fitTours.saveStep(source.id, FitTourWorkflowStatus.HANDOVER, {
    handoverGuideRequest: 'Nhắc hướng dẫn viên xác nhận giờ đón khách',
    handoverItems: [{ itemName: 'Voucher dịch vụ', quantity: 2, notes: 'Bàn giao trước ngày khởi hành' }],
    surveyQuestions: [{ question: 'Wrong handover step', notes: 'Should be ignored' }],
  });
  const stepHandoverDetail = await fitTours.detail(source.id);
  assert(stepHandoverDetail.workflowStatus === FitTourWorkflowStatus.OPERATION, 'saveStep HANDOVER should save draft without advancing workflow');
  assert(stepHandoverDetail.handoverGuideRequest === 'Nhắc hướng dẫn viên xác nhận giờ đón khách', 'saveStep HANDOVER should update handover guide request');
  assert(stepHandoverDetail.handoverItems.some((row) => row.itemName === 'Voucher dịch vụ'), 'saveStep HANDOVER should update handover rows');
  assert(!stepHandoverDetail.surveyQuestions.some((row) => row.question === 'Wrong handover step'), 'saveStep HANDOVER should ignore survey rows outside step field contract');
  await fitTours.confirmStep(source.id, FitTourWorkflowStatus.HANDOVER, {});
  const stepHandoverConfirmed = await fitTours.detail(source.id);
  assert(stepHandoverConfirmed.workflowStatus === FitTourWorkflowStatus.HANDOVER, 'confirmStep HANDOVER should advance workflow');
  assert(stepHandoverConfirmed.handoverItems.some((row) => row.itemName === 'Voucher dịch vụ'), 'confirmStep HANDOVER should keep drafted handover rows');

  await fitTours.saveStep(source.id, FitTourWorkflowStatus.SURVEY, {
    surveyDescription: 'Phiếu đánh giá sau tour FIT',
    surveyQuestions: [{ question: 'Khách hài lòng với chương trình tour?', notes: 'Chấm điểm 1-5' }],
    handoverItems: [{ itemName: 'Wrong survey step', quantity: 1 }],
  });
  const stepSurveyDetail = await fitTours.detail(source.id);
  assert(stepSurveyDetail.workflowStatus === FitTourWorkflowStatus.HANDOVER, 'saveStep SURVEY should save draft without advancing workflow');
  assert(stepSurveyDetail.surveyDescription === 'Phiếu đánh giá sau tour FIT', 'saveStep SURVEY should update survey description');
  assert(stepSurveyDetail.surveyQuestions.some((row) => row.question === 'Khách hài lòng với chương trình tour?'), 'saveStep SURVEY should update survey rows');
  assert(!stepSurveyDetail.handoverItems.some((row) => row.itemName === 'Wrong survey step'), 'saveStep SURVEY should ignore handover rows outside step field contract');
  await fitTours.confirmStep(source.id, FitTourWorkflowStatus.SURVEY, {});
  const stepSurveyConfirmed = await fitTours.detail(source.id);
  assert(stepSurveyConfirmed.workflowStatus === FitTourWorkflowStatus.SURVEY, 'confirmStep SURVEY should advance workflow');
  await fitTours.update(source.id, { workflowStatus: FitTourWorkflowStatus.COMPLETED });
  await assertRejects(
    () => fitTours.update(source.id, { tourName: 'Edited completed FIT tour' }),
    'Tour FIT terminal workflow cannot be edited',
    'FIT update should reject editing a completed terminal workflow',
  );
  assert(
    (await fitTours.detail(source.id)).tourName !== 'Edited completed FIT tour',
    'rejected completed FIT update should preserve tour snapshot',
  );
  assert(stepSurveyConfirmed.surveyQuestions.some((row) => row.question === 'Khách hài lòng với chương trình tour?'), 'confirmStep SURVEY should keep drafted survey rows');

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

  await assertRejects(
    () => fitTours.copyBudget(target.id),
    'Cần chọn tour nguồn để sao chép dự toán',
    'copyBudget should require an explicit source tour',
  );
  await assertRejects(
    () => fitTours.copyBudget(target.id, target.id),
    'Tour nguồn dự toán phải khác tour đích',
    'copyBudget should reject the target as source',
  );
  await assertRejects(
    () => fitTours.copyBudget(target.id, incompletePricing.id),
    'Tour nguồn không có dữ liệu dự toán để sao chép',
    'copyBudget should not clear target rows from an empty source',
  );
  await assertRejects(
    () => fitTours.copyOperation(target.id, incompletePricing.id),
    'Tour nguồn không có dữ liệu dự toán hoặc điều hành để sao chép',
    'copyOperation should not clear target rows from an empty source',
  );

  await fitTours.copyOperation(target.id);
  const selfCopiedOperationServices = await prisma.tourService.findMany({ where: { tourId: target.tourId, confirmedAmount: { gt: 0 } } });
  const targetBudgetBeforeCopy = await prisma.tourService.findMany({ where: { tourId: target.tourId, budgetAmount: { gt: 0 } } });
  assert(selfCopiedOperationServices.length === 1 && decimal(selfCopiedOperationServices[0].confirmedAmount) === 100, 'copyOperation without source should copy the current tour budget into operation rows');
  assert(targetBudgetBeforeCopy.length === 1 && decimal(targetBudgetBeforeCopy[0].budgetAmount) === 100, 'copyOperation without source should keep current budget rows on the same tour');

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
  assert(targetOperationServices[0].description === 'Step operation hotel', 'copyOperation should preserve common operation service descriptions');
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
