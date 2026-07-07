const fs = require('fs');

const source = fs.readFileSync('scripts/smoke-swagger-action-status.js', 'utf8');
const failures = [];

for (const token of [
  'HTTP_ATTEMPTS',
  'API_DOCS_URL',
  'docsUrlExplicit',
  'SWAGGER_ACTION_STATUS_SMOKE_SKIPPED',
  'status=401',
  'status=403',
  'status=404',
  'content-type',
  'application/json',
  'setTimeout',
  'Unexpected docs response',
  'test-action-endpoint-status-contract.js',
  'parseExpectedActions',
  'parseControllerMethods',
  '@Controller',
  'routeFromDecorators',
  'JSON.parse',
]) {
  if (!source.includes(token)) failures.push(`smoke-swagger-action-status.js missing ${token}`);
}

if (source.includes('const expectedActionResponses = [')) {
  failures.push('smoke-swagger-action-status.js must derive expected routes from the source action status contract instead of a manual route list');
}

if (!source.includes("process.exit(1)")) {
  failures.push('smoke-swagger-action-status.js must fail non-zero on bad docs responses when API_DOCS_URL is explicit');
}

if (failures.length) {
  console.error('FAIL_SWAGGER_ACTION_STATUS_SMOKE_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_SWAGGER_ACTION_STATUS_SMOKE_CONTRACT_OK');
