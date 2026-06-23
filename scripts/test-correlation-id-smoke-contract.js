const fs = require('fs');

const path = 'scripts/smoke-correlation-id.sh';
const source = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
const failures = [];

if (!source) failures.push(`${path} is missing`);

for (const token of [
  'set -euo pipefail',
  'HTTP_ATTEMPTS',
  'HTTP_RETRY_DELAY',
  'x-correlation-id',
  'SMOKE_CORRELATION_ID_OK',
  'FAIL_CORRELATION',
  'safe_id',
  'unsafe_id',
  'generated_id',
  'docker logs',
  'smarttour-api-1',
  'request_failed',
  'authorization|cookie|password|token|secret',
  'sleep "$HTTP_RETRY_DELAY"',
]) {
  if (!source.includes(token)) failures.push(`${path} missing ${token}`);
}

if (!source.includes('grep -E')) failures.push(`${path} must validate correlation id format with grep -E`);
if (!source.includes('curl -ksS')) failures.push(`${path} must call the live API with curl -ksS`);
if (!source.includes('/auth/me')) failures.push(`${path} must use /auth/me as a stable unauthenticated probe`);

if (failures.length) {
  console.error('FAIL_CORRELATION_ID_SMOKE_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_CORRELATION_ID_SMOKE_CONTRACT_OK');
