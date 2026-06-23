const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/quotations/quotations.controller.ts', 'utf8');
const dto = fs.readFileSync('apps/api/src/modules/quotations/dto/quotation.dto.ts', 'utf8');

const failures = [];

for (const token of [
  'export class QuotationSmartLinkDto',
  '@IsOptional()',
  '@IsBoolean()',
  'enabled?: boolean',
]) {
  if (!dto.includes(token)) failures.push(`QuotationSmartLinkDto missing ${token}`);
}

for (const token of [
  "import { CreateQuotationDto, ListQuotationsQueryDto, QuotationActionDto, QuotationSmartLinkDto, UpdateQuotationDto } from './dto/quotation.dto';",
  'smartLink(@Param(\'id\') id: string, @Body() dto: QuotationSmartLinkDto',
  'this.service.smartLink(id, dto.enabled ?? true, request?.user)',
]) {
  if (!controller.includes(token)) failures.push(`QuotationsController missing ${token}`);
}

for (const unsafe of ["@Body('enabled')"]) {
  if (controller.includes(unsafe)) failures.push(`QuotationsController must not use loose smartLink contract ${unsafe}`);
}

if (failures.length) {
  console.error('FAIL_QUOTATIONS_SMARTLINK_DTO_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_QUOTATIONS_SMARTLINK_DTO_CONTRACT_OK');
