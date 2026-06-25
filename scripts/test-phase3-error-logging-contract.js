#!/usr/bin/env node
const fs = require('fs');

const filter = fs.readFileSync('apps/api/src/http-error-response.filter.ts', 'utf8');
const logging = fs.readFileSync('apps/api/src/request-logging.interceptor.ts', 'utf8');
const smoke = fs.readFileSync('scripts/smoke-error-response-shape.js', 'utf8');
const failures = [];

function requireIncludes(source, token, label) {
  if (!source.includes(token)) failures.push(`${label} missing ${token}`);
}
function requireExcludes(source, token, label) {
  if (source.toLowerCase().includes(token.toLowerCase())) failures.push(`${label} must not include ${token}`);
}

for (const token of [
  '@Catch()',
  'unknown',
  'isHttpException',
  'statusFromException',
  'responseFromException',
  'INTERNAL_SERVER_ERROR',
  'Lỗi hệ thống. Vui lòng thử lại sau.',
  'correlationId: request.correlationId',
]) requireIncludes(filter, token, 'http error response filter');

for (const token of [
  'PrismaClientKnownRequestError',
  'P2002',
  'P2025',
  'DATABASE_CONFLICT',
  'DATABASE_NOT_FOUND',
]) requireIncludes(filter, token, 'http error response filter');

for (const token of ['stack', 'meta', 'clientVersion']) requireExcludes(filter, token, 'http error response body');

for (const token of [
  'errorCode',
  'errorStack',
  'this.logger.error',
  'request_failed',
  'correlationId',
]) requireIncludes(logging, token, 'request logging interceptor');
for (const unsafe of ['body', 'headers', 'authorization', 'cookie', 'password', 'token', 'secret']) requireExcludes(logging, unsafe, 'request logging interceptor');

for (const token of ['/phase3/unknown-error', 'INTERNAL_SERVER_ERROR', 'correlationId']) requireIncludes(smoke, token, 'error response smoke');

if (failures.length) {
  console.error('FAIL_PHASE3_ERROR_LOGGING_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_PHASE3_ERROR_LOGGING_CONTRACT_OK');
