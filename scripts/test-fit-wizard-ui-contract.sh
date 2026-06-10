#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');

const wizard = fs.readFileSync('apps/web/app/fit-tours/FitTourWizard.tsx', 'utf8');
const client = fs.readFileSync('apps/web/app/fit-tours/FitToursClient.tsx', 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function blockBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `Missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

function functionBlock(name, nextMarker) {
  return blockBetween(wizard, `function ${name}`, nextMarker);
}

function asyncFunctionBlock(name, nextMarker) {
  return blockBetween(wizard, `async function ${name}`, nextMarker);
}

function assertIncludesAll(source, snippets, label) {
  for (const snippet of snippets) assert(source.includes(snippet), `${label}: missing ${snippet}`);
}

const workflowStepsBlock = blockBetween(wizard, 'const workflowSteps = [', '] as const;');
const toFormDefaultsBlock = functionBlock('toFormDefaults', 'type SaveReason');
const loadTourBlock = asyncFunctionBlock('loadTour', 'function selectTour');
const autosaveBlock = blockBetween(wizard, 'const timeout = setTimeout(async () => {', '}, autosaveDelayMs);');
const saveTourBlock = asyncFunctionBlock('saveTour', 'async function submit');
const submitBlock = asyncFunctionBlock('submit', 'function handleInvalidSubmit');
const invalidSubmitBlock = functionBlock('handleInvalidSubmit', 'async function confirmCurrentStep');
const confirmBlock = asyncFunctionBlock('confirmCurrentStep', 'async function loadTour');
const selectTourBlock = functionBlock('selectTour', 'function confirmRemoveRow');
const copyBudgetBlock = asyncFunctionBlock('copyBudget', 'async function copyOperation');
const copyOperationBlock = asyncFunctionBlock('copyOperation', 'async function uploadAttachmentFile');
const uploadAttachmentBlock = asyncFunctionBlock('uploadAttachmentFile', 'async function addFiles');
const addFilesBlock = asyncFunctionBlock('addFiles', 'async function removeAttachment');
const removeAttachmentBlock = asyncFunctionBlock('removeAttachment', 'return (');
const tableBlock = functionBlock('EditableTable', 'function TableInput');
const fieldBlock = functionBlock('Field', 'function EditableTable');

// Load tour into wizard.
assertIncludesAll(loadTourBlock, [
  'loadRequestId.current',
  "fetch(`${apiBase}/api/fit-tours/${id}`",
  'authHeaders()',
  'toFormDefaults(await response.json())',
  'if (requestId !== loadRequestId.current) return',
  'reset(defaults, { keepDirty: false })',
  'setActiveStep(workflowStepIndex(defaults.workflowStatus))',
  'lastAutosaveSignature.current = JSON.stringify(preparePayload(defaults))',
  'loadedTourId.current = id',
], 'FIT wizard load tour should hydrate selected detail safely');
assertIncludesAll(toFormDefaultsBlock, [
  'normalizeDate(tour?.bookingDate)',
  'normalizeCostRows(tour?.commonCosts',
  'normalizeServiceRows(tour?.budgetServices',
  'normalizeServiceRows(tour?.operationServices',
  'workflowSteps.some((step) => step.key === row.step)',
  'const hasSavedTour = Boolean(tour?.id)',
  'const arrayFallbacks = hasSavedTour',
  'commonCosts: [] as FitTourForm',
], 'FIT wizard defaults should normalize loaded data and avoid saved-tour fallbacks');

// Autosave / save / submit.
assertIncludesAll(autosaveBlock, [
  'if (!formState.isDirty) return',
  'if (!current.id)',
  'autosaveTourId !== loadedTourId.current',
  'saveInFlight.current',
  'canPersistTour(current)',
  'validateBeforeSave(payload, step, creating)',
  "saveTour(payload, step, 'draft')",
], 'FIT wizard autosave should be existing-record-only and validated');
assertIncludesAll(saveTourBlock, [
  'preparePayload(data, payloadWorkflowStatus)',
  'validateBeforeSave(payload, step, creating)',
  "mode === 'confirm'",
  "method: creating || !step ? 'POST' : mode === 'confirm' ? 'POST' : 'PATCH'",
  'createPayload(payload)',
  'stepPayload(payload, step)',
  'responseError(response)',
], 'FIT wizard saveTour should validate and send draft/confirm payloads correctly');
assertIncludesAll(submitBlock, [
  "saveTour(data, step, 'draft')",
  'reset(defaults, { keepDirty: false })',
  "onSaved?.(saved, 'save')",
], 'FIT wizard submit should save draft and reset clean state');
assertIncludesAll(confirmBlock, [
  "saveTour(draft, step, 'draft')",
  "saveTour({ ...draft, workflowStatus: step }, step, 'confirm')",
  'Math.min(workflowSteps.length - 1, activeStep + 1)',
  "onSaved?.(saved, 'confirm')",
], 'FIT wizard confirm should save/confirm current workflow step and move forward');

// Step navigation order.
assertIncludesAll(workflowStepsBlock, ['PRICING', 'TOUR_INFO', 'BUDGET', 'OPERATION', 'HANDOVER', 'SURVEY'], 'FIT wizard should keep approved workflow steps');
assertIncludesAll(wizard, [
  'confirmedWorkflowStepIndex',
  'workflowStepIndex',
  'canOpenWorkflowStep',
  'blockedWorkflowStepMessage',
  'goToStep(index)',
  'aria-disabled={locked}',
  "locked ? ' locked' : ''",
  'goToStep(Math.max(0, activeStep - 1))',
  'goToStep(Math.min(workflowSteps.length - 1, activeStep + 1))',
], 'FIT wizard should guard workflow step navigation');

// lineAmount and summary formulas.
assertIncludesAll(wizard, [
  'function lineAmount',
  'quantity * times * exchangeRate * unitPrice * (1 + vat / 100)',
  'function hotelLineAmount',
  'Math.ceil(Math.max(1, totalPax) / positiveNumber(line.paxPerRoom))',
  'const totalPax = Math.max(1, number(values.adultCount) + number(values.childCount) + number(values.infantCount))',
  'const totalCommonCost = [...values.commonCosts, ...values.hotelCosts].reduce',
  'const totalPrivateCost = values.privateCosts.reduce',
  'const netPerGuest = totalCommonCost / totalPax + totalPrivateCost',
  'const profitPerGuest = number(values.sellingPrice) - netPerGuest',
  'const budgetRevenue = totalPax * number(values.sellingPrice)',
  'const budgetProfit = budgetRevenue - budgetCost',
  'const operationProfit = budgetRevenue - operationCost',
  "operationServices: ['quantity', 'confirmedUnitPrice', 'vat']",
  'getFieldState(amountPath).isDirty',
], 'FIT wizard formulas and summaries should stay covered');
for (const label of [
  'T\u1ed5ng s\u1ed1 kh\u00e1ch',
  'T\u1ed5ng ph\u00ed chung',
  'T\u1ed5ng ph\u00ed ri\u00eang',
  'Gi\u00e1 v\u1ed1n / kh\u00e1ch',
  'L\u1ee3i nhu\u1eadn / kh\u00e1ch',
  'T\u1ed5ng thu d\u1ef1 ki\u1ebfn',
  'T\u1ed5ng chi d\u1ef1 ki\u1ebfn',
  'L\u1ee3i nhu\u1eadn d\u1ef1 ki\u1ebfn',
  'T\u1ed5ng thu \u0111i\u1ec1u h\u00e0nh',
  'T\u1ed5ng chi \u0111i\u1ec1u h\u00e0nh',
  'L\u1ee3i nhu\u1eadn th\u1ef1c t\u1ebf',
]) {
  assert(wizard.includes(label), `FIT wizard summary should show ${label}`);
}

// Add/remove rows in child tables.
for (const name of ['commonCosts', 'hotelCosts', 'privateCosts', 'guides', 'budgetServices', 'operationServices', 'handoverItems', 'surveyQuestions']) {
  assert(wizard.includes(`name="${name}"`), `FIT wizard should render ${name} table`);
  assert(wizard.includes(`append={() => arrays.${name}.append`), `FIT wizard should append ${name} rows`);
  assert(wizard.includes(`confirmRemoveRow('${name}'`), `FIT wizard should guard removal for ${name}`);
}
assertIncludesAll(tableBlock, ['useReactTable', 'TableInput', 'Trash2', 'remove(row.index)'], 'FIT wizard editable table should wire row add/remove controls');
assertIncludesAll(wizard, ['rowHasDeletableContent'], 'FIT wizard should detect populated rows before delete');

// Copy budget / operation.
assertIncludesAll(copyBudgetBlock, [
  'copySourceTourId',
  'copySourceTourId === id',
  'window.confirm',
  "fetch(`${apiBase}/api/fit-tours/${id}/copy-budget`",
  'sourceTourId: copySourceTourId',
  "onSaved?.(saved, 'copy-budget')",
], 'FIT wizard copyBudget should require source and confirm overwrite');
assertIncludesAll(copyOperationBlock, [
  'const sourceTourId = copySourceTourId || id',
  'window.confirm',
  "fetch(`${apiBase}/api/fit-tours/${id}/copy-operation`",
  'sourceTourId }',
  "onSaved?.(saved, 'copy-operation')",
], 'FIT wizard copyOperation should copy selected/current source and confirm overwrite');

// Upload/delete attachments.
assertIncludesAll(uploadAttachmentBlock, [
  "saveTour(getValues(), step, 'draft')",
  'new FormData()',
  "body.append('file', file)",
  "body.append('step', step)",
  "fetch(`${apiBase}/api/fit-tours/${id}/attachments`",
  'authHeaders()',
], 'FIT wizard uploadAttachmentFile should create draft if needed and post multipart step metadata');
assertIncludesAll(addFilesBlock, [
  'const step = workflowSteps[activeStep].key',
  'const stepLabel = workflowSteps[activeStep].label',
  'uploadAttachmentFile(file, step)',
  "onSaved?.(saved, 'upload')",
], 'FIT wizard addFiles should upload files against active workflow step');
assertIncludesAll(removeAttachmentBlock, [
  'window.confirm',
  "method: 'DELETE'",
  "fetch(`${apiBase}/api/fit-tours/${id}/attachments/${attachment.id}`",
  "onSaved?.(saved, 'delete-attachment')",
], 'FIT wizard removeAttachment should confirm and delete file metadata');
assertIncludesAll(wizard, ['AttachmentList', 'fileHref(attachment.fileUrl)', 'workflowStepLabel(attachment.step)'], 'FIT wizard should render loaded attachment metadata');

// Reset form and load another tour.
assertIncludesAll(selectTourBlock, [
  'id === selectedTourId',
  'window.confirm(message)',
  'void loadTour(id)',
], 'FIT wizard selectTour should confirm reset and tour switching');
assertIncludesAll(loadTourBlock, [
  "if (!id)",
  "setSelectedTourId('')",
  "setCopySourceTourId('')",
  'setActiveStep(0)',
  'reset(toFormDefaults())',
  'setSelectedTourId(loadedTourId.current)',
], 'FIT wizard loadTour should reset cleanly and restore previous selection on load failure');
assertIncludesAll(client, ['onDirtyChange={setWizardDirty}', 'initialTourId={selectedTourId}'], 'FIT list should protect dirty wizard state and pass selected tour id');

// Vietnamese validation errors.
assertIncludesAll(wizard, [
  'zodResolver(fitTourSchema)',
  'M\u00e3 b\u00e1o gi\u00e1 c\u1ea7n \u00edt nh\u1ea5t 2 k\u00fd t\u1ef1',
  'M\u00e3 tour c\u1ea7n \u00edt nh\u1ea5t 2 k\u00fd t\u1ef1',
  'H\u1ecd t\u00ean kh\u00e1ch c\u1ea7n \u00edt nh\u1ea5t 2 k\u00fd t\u1ef1',
  'Email kh\u00f4ng h\u1ee3p l\u1ec7',
  'S\u1ed1 kh\u00e1ch ph\u1ea3i l\u1edbn h\u01a1n 0',
  'Ng\u00e0y v\u1ec1 ph\u1ea3i sau ho\u1eb7c b\u1eb1ng ng\u00e0y kh\u1edfi \u0111i',
  'handleInvalidSubmit',
  'sectionError',
  'fieldErrorText',
  'aria-invalid={Boolean(error)}',
], 'FIT wizard validation should keep Vietnamese field/section errors');
assertIncludesAll(invalidSubmitBlock, ['firstFormError(errors)'], 'FIT wizard invalid submit should surface the first form error');
assertIncludesAll(fieldBlock, ['fieldErrorText', 'aria-invalid={Boolean(error)}'], 'FIT wizard field component should render field-level validation state');

console.log('TEST_FIT_WIZARD_UI_CONTRACT_OK');
NODE
