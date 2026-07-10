const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/customers/customers.controller.ts', 'utf8');
const dtoPath = 'apps/api/src/modules/customers/dto/customer-body.dto.ts';
const failures = [];

if (!fs.existsSync(dtoPath)) {
  failures.push('customer body DTO file is missing');
} else {
  const dto = fs.readFileSync(dtoPath, 'utf8');
  for (const name of [
    'CustomerTypeBodyDto',
    'CustomerTagBodyDto',
    'CustomerBulkTagDto',
    'CustomerBulkUpdateDto',
    'CustomerCampaignBodyDto',
    'CustomerImportRowsDto',
    'CustomerBodyDto',
    'CustomerMergeDto',
    'CustomerTransferOwnerDto',
    'CustomerCommentDto',
    'CustomerCareTaskDto',
    'CustomerCallLogDto',
    'CustomerOpportunityDto',
    'CustomerCareTaskUpdateDto',
  ]) {
    if (!dto.includes(`export class ${name}`)) failures.push(`missing DTO class ${name}`);
  }
  for (const token of [
    'Allow',
    'IsArray',
    'IsBoolean',
    'IsIn',
    'IsOptional',
    'IsString',
    'MaxLength',
    "['ACTIVE', 'INACTIVE']",
    "['INDIVIDUAL', 'COMPANY', 'AGENCY']",
    "['PENDING', 'DONE', 'CANCELLED']",
    'replaceNestedCollections',
  ]) {
    if (!dto.includes(token)) failures.push(`customer DTO validation missing ${token}`);
  }
  if (dto.includes("['ACTIVE', 'INACTIVE', 'MERGED']")) {
    failures.push('CustomerBodyDto must not allow MERGED through create/update; use merge endpoint');
  }
}

if (!controller.includes("from './dto/customer-body.dto'")) failures.push('CustomersController must import customer body DTO classes');
for (const [method, dtoName] of [
  ['createType', 'CustomerTypeBodyDto'],
  ['updateType', 'CustomerTypeBodyDto'],
  ['createTag', 'CustomerTagBodyDto'],
  ['bulkTag', 'CustomerBulkTagDto'],
  ['bulkUpdate', 'CustomerBulkUpdateDto'],
  ['createCampaign', 'CustomerCampaignBodyDto'],
  ['importRows', 'CustomerImportRowsDto'],
  ['create', 'CustomerBodyDto'],
  ['update', 'CustomerBodyDto'],
  ['merge', 'CustomerMergeDto'],
  ['transferOwner', 'CustomerTransferOwnerDto'],
  ['addComment', 'CustomerCommentDto'],
  ['addCareTask', 'CustomerCareTaskDto'],
  ['addCallLog', 'CustomerCallLogDto'],
  ['addOpportunity', 'CustomerOpportunityDto'],
  ['updateCareTask', 'CustomerCareTaskUpdateDto'],
]) {
  if (!controller.includes(`@Body() dto: ${dtoName}`)) failures.push(`${method} must use ${dtoName}`);
}
if (controller.includes('@Body() dto: Record<string, unknown>')) {
  failures.push('CustomersController must not use Record<string, unknown> request bodies');
}

if (failures.length) {
  console.error('FAIL_CUSTOMERS_DTO_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_CUSTOMERS_DTO_CONTRACT_OK');
