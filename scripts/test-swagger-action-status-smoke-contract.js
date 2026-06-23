const fs = require('fs');

const source = fs.readFileSync('scripts/smoke-swagger-action-status.js', 'utf8');
const failures = [];

for (const token of [
  'HTTP_ATTEMPTS',
  'content-type',
  'application/json',
  'setTimeout',
  'Unexpected docs response',
  'JSON.parse',
]) {
  if (!source.includes(token)) failures.push(`smoke-swagger-action-status.js missing ${token}`);
}

if (!source.includes("process.exit(1)")) {
  failures.push('smoke-swagger-action-status.js must fail non-zero on bad docs responses');
}

if (failures.length) {
  console.error('FAIL_SWAGGER_ACTION_STATUS_SMOKE_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_SWAGGER_ACTION_STATUS_SMOKE_CONTRACT_OK');
