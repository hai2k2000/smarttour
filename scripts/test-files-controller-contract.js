const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/files/files.controller.ts', 'utf8');
const tourGuidesController = fs.readFileSync('apps/api/src/modules/tour-guides/tour-guides.controller.ts', 'utf8');
const dtoPath = 'apps/api/src/modules/files/dto/file-query.dto.ts';
const failures = [];

function decoratorBlockBefore(source, methodSignature) {
  const methodIndex = source.indexOf(methodSignature);
  if (methodIndex === -1) return '';
  const before = source.slice(0, methodIndex);
  const lastBlank = before.lastIndexOf('\n\n');
  return before.slice(lastBlank === -1 ? 0 : lastBlank);
}

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
  "import { RequirePermissions } from '../auth/permissions.decorator';",
  'upload(',
  "@RequirePermissions('file.manage')",
  '@Body() dto: FileUploadBodyDto',
  'this.filesService.uploadAuthorized(file, dto.scope, request.user)',
  'async download(@Query() query: FileObjectKeyQueryDto',
  '@Res() response: ServerResponse',
  'const key = query.key;',
  'downloadAuthorized(key, request.user)',
  'remove(@Query() query: FileObjectKeyQueryDto',
  'removeAuthorized(key, request.user)',
]) {
  if (!controller.includes(token)) failures.push(`FilesController missing ${token}`);
}

const downloadDecorators = decoratorBlockBefore(controller, 'async download(');
const removeDecorators = decoratorBlockBefore(controller, 'remove(@Query() query: FileObjectKeyQueryDto');
if (downloadDecorators.includes('@RequirePermissions')) {
  failures.push('FilesController download must not require generic file.view; FilesService enforces entity-specific view permission');
}
if (removeDecorators.includes('@RequirePermissions')) {
  failures.push('FilesController delete must not require generic file.manage; FilesService enforces entity-specific manage permission');
}

for (const unsafe of [
  "@Body('scope')",
  "@Query('key')",
  'response: any',
  "@RequirePermissions('file.view')\n  async download",
  "@RequirePermissions('file.manage')\n  remove",
]) {
  if (controller.includes(unsafe)) failures.push(`FilesController must not use loose or generic file contract ${unsafe}`);
}

for (const token of [
  "import { fileUploadInterceptorOptions } from '../files/files.service';",
  "@UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))",
]) {
  if (!tourGuidesController.includes(token)) failures.push(`TourGuidesController missing standardized upload interceptor contract ${token}`);
}

if (tourGuidesController.includes("FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })")) {
  failures.push('TourGuidesController must not bypass shared fileUploadInterceptorOptions');
}

if (failures.length) {
  console.error('FAIL_FILES_CONTROLLER_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_FILES_CONTROLLER_CONTRACT_OK');
