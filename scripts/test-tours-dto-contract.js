const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/tours/tours.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/tours/tours.service.ts', 'utf8');
const failures = [];

const listDtoPath = 'apps/api/src/modules/tours/dto/list-tours-query.dto.ts';
const actionDtoPath = 'apps/api/src/modules/tours/dto/tour-action.dto.ts';

if (!fs.existsSync(listDtoPath)) {
  failures.push('ListToursQueryDto file is missing');
} else {
  const listDto = fs.readFileSync(listDtoPath, 'utf8');
  for (const token of [
    'export class ListToursQueryDto',
    '@IsOptional()',
    '@IsEnum(TourType)',
    '@IsEnum(TourStatus)',
    '@IsString()',
    'search?: string',
    'type?: TourType',
    'status?: TourStatus',
  ]) {
    if (!listDto.includes(token)) failures.push(`ListToursQueryDto missing ${token}`);
  }
}

if (!fs.existsSync(actionDtoPath)) {
  failures.push('Tour action DTO file is missing');
} else {
  const actionDto = fs.readFileSync(actionDtoPath, 'utf8');
  for (const token of [
    'export class CloseTourDto',
    '@IsOptional()',
    '@IsString()',
    'note?: string',
  ]) {
    if (!actionDto.includes(token)) failures.push(`CloseTourDto missing ${token}`);
  }
}

for (const token of [
  "import { ListToursQueryDto } from './dto/list-tours-query.dto';",
  "import { CloseTourDto } from './dto/tour-action.dto';",
  'list(@Query() query: ListToursQueryDto',
  'this.toursService.list(query, request?.user)',
  'close(@Param(\'id\') id: string, @Body() dto: CloseTourDto',
]) {
  if (!controller.includes(token)) failures.push(`ToursController missing ${token}`);
}

for (const unsafe of [
  "@Query('search')",
  "@Query('type')",
  "@Query('status')",
  '@Body() dto: { note?: string }',
]) {
  if (controller.includes(unsafe)) failures.push(`ToursController must not use loose contract ${unsafe}`);
}

for (const token of [
  "import { ListToursQueryDto } from './dto/list-tours-query.dto';",
  "import { CloseTourDto } from './dto/tour-action.dto';",
  'list(query: ListToursQueryDto',
  'async close(id: string, dto: CloseTourDto',
]) {
  if (!service.includes(token)) failures.push(`ToursService missing ${token}`);
}

if (failures.length) {
  console.error('FAIL_TOURS_DTO_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_TOURS_DTO_CONTRACT_OK');
