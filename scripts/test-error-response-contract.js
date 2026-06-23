const fs = require('fs');

const main = fs.readFileSync('apps/api/src/main.ts', 'utf8');
const validation = fs.readFileSync('apps/api/src/validation-exception.factory.ts', 'utf8');
const filterPath = 'apps/api/src/http-error-response.filter.ts';
const failures = [];

if (!fs.existsSync(filterPath)) {
  failures.push('HTTP error response filter is missing');
} else {
  const filter = fs.readFileSync(filterPath, 'utf8');
  for (const token of [
    '@Catch(HttpException)',
    'HttpErrorResponseFilter',
    'statusCode',
    'message',
    'messages',
    'error',
    'code',
    'path',
    'method',
    'timestamp',
    'getStatus()',
    'exception.getResponse()',
  ]) {
    if (!filter.includes(token)) failures.push(`error filter missing ${token}`);
  }
  for (const unsafe of ['console.log', 'console.error', 'password', 'token', 'secret']) {
    if (filter.includes(unsafe)) failures.push(`error filter must not log or expose sensitive token: ${unsafe}`);
  }
}

if (!main.includes("import { HttpErrorResponseFilter } from './http-error-response.filter';")) {
  failures.push('main.ts must import HttpErrorResponseFilter');
}
if (!main.includes('app.useGlobalFilters(new HttpErrorResponseFilter())')) {
  failures.push('main.ts must register HttpErrorResponseFilter globally');
}
for (const token of [
  'code: \'VALIDATION_ERROR\'',
  'messages:',
  'statusCode: 400',
  'Dữ liệu không hợp lệ',
]) {
  if (!validation.includes(token)) failures.push(`validation factory missing standardized token ${token}`);
}
if (/must |should |property /.test(validation.split('DEFAULT_ERROR_PATTERNS')[0] || '')) {
  failures.push('validation factory should not expose default English class-validator messages directly');
}

if (failures.length) {
  console.error('FAIL_ERROR_RESPONSE_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_ERROR_RESPONSE_CONTRACT_OK');
