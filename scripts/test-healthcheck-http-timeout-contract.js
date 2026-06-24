const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

const healthcheck = read('scripts/healthcheck.sh');
const installer = read('scripts/install-ops-schedule.sh');
const runbook = read('docs/observability-alerting-runbook.md');
const readinessTracker = read('docs/production-readiness-tracker.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');
const githubActionsContract = read('scripts/test-github-actions-contract.js');

[
  'local connect_timeout="${HTTP_CONNECT_TIMEOUT:-5}"',
  'local max_time="${HTTP_MAX_TIME:-10}"',
  '--connect-timeout "$connect_timeout"',
  '--max-time "$max_time"',
  'HTTP_ATTEMPTS',
  'HTTP_RETRY_DELAY',
  'FAIL_HTTP $name expected=$expected actual=$code url=$url',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

[
  '# HTTP_CONNECT_TIMEOUT=5',
  '# HTTP_MAX_TIME=10',
  '# HTTP_ATTEMPTS=6',
  '# HTTP_RETRY_DELAY=3',
].forEach((expected) => includes('scripts/install-ops-schedule.sh', installer, expected));

[
  'HTTP_CONNECT_TIMEOUT',
  'HTTP_MAX_TIME',
  'HTTP_ATTEMPTS',
  'HTTP_RETRY_DELAY',
].forEach((expected) => {
  includes('docs/observability-alerting-runbook.md', runbook, expected);
  includes('docs/production-readiness-tracker.md', readinessTracker, expected);
});

if (packageJson.scripts['test:healthcheck-http-timeout'] !== 'node scripts/test-healthcheck-http-timeout-contract.js') {
  throw new Error('package.json must expose test:healthcheck-http-timeout');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-healthcheck-http-timeout-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-healthcheck-http-timeout-contract.js');

console.log('TEST_HEALTHCHECK_HTTP_TIMEOUT_CONTRACT_OK');
