const fs = require('fs');

const path = 'scripts/smoke-error-response-shape.js';
const source = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
const failures = [];

if (!source) failures.push(`${path} is missing`);

for (const token of [
  '/api/auth/me',
  '/api/auth/login',
  'x-correlation-id',
  'statusCode',
  'message',
  'messages',
  'error',
  'code',
  'path',
  'method',
  'timestamp',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FAIL_ERROR_RESPONSE_SHAPE_SMOKE',
  'SMOKE_ERROR_RESPONSE_SHAPE_OK',
]) {
  if (!source.includes(token)) failures.push(`${path} missing ${token}`);
}

for (const unsafe of ['console.log(body)', 'console.error(body)', 'passwordValue', 'tokenValue', 'secretValue']) {
  if (source.includes(unsafe)) failures.push(`${path} must not print or define sensitive value token ${unsafe}`);
}

if (failures.length) {
  console.error('FAIL_ERROR_RESPONSE_SMOKE_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_ERROR_RESPONSE_SMOKE_CONTRACT_OK');
