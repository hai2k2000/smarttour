const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/files/files.controller.ts', 'utf8');
const dtoPath = 'apps/api/src/modules/files/dto/file-query.dto.ts';
const failures = [];

if (!fs.existsSync(dtoPath)) {
  failures.push('File query DTO is missing');
} else {
  const dto = fs.readFileSync(dtoPath, 'utf8');
  for (const token of [
    'export class FileUploadBodyDto',
    'scope?: string',
    'export class FileObjectKeyQueryDto',
    '@IsString()',
    '@MinLength(1)',
    'key!: string',
  ]) {
    if (!dto.includes(token)) failures.push(`FileObjectKeyQueryDto missing ${token}`);
  }
}

for (const token of [
  "import type { ServerResponse } from 'node:http';",
  "import { FileObjectKeyQueryDto, FileUploadBodyDto } from './dto/file-query.dto';",
  'upload(',
  '@Body() dto: FileUploadBodyDto',
  'this.filesService.uploadAuthorized(file, dto.scope, request.user)',
  'async download(@Query() query: FileObjectKeyQueryDto',
  '@Res() response: ServerResponse',
  'downloadAuthorized(query.key, request.user)',
  'remove(@Query() query: FileObjectKeyQueryDto',
  'removeAuthorized(query.key, request.user)',
]) {
  if (!controller.includes(token)) failures.push(`FilesController missing ${token}`);
}

for (const unsafe of [
  "@Body('scope')",
  "@Query('key')",
  'response: any',
]) {
  if (controller.includes(unsafe)) failures.push(`FilesController must not use loose contract ${unsafe}`);
}

if (failures.length) {
  console.error('FAIL_FILES_CONTROLLER_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_FILES_CONTROLLER_CONTRACT_OK');
