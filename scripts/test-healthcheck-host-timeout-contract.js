const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

function excludes(file, content, forbidden) {
  if (content.includes(forbidden)) {
    throw new Error(`${file} must not include ${forbidden}`);
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
  'HEALTHCHECK_HOST_COMMAND_TIMEOUT="${HEALTHCHECK_HOST_COMMAND_TIMEOUT:-10s}"',
  'run_healthcheck_host_command()',
  'timeout "$HEALTHCHECK_HOST_COMMAND_TIMEOUT" "$@"',
  'root_mode="$(run_healthcheck_host_command stat -c \'%a\' /)"',
  'disk_use=$(run_healthcheck_host_command df -P / | awk',
  'notify_host="$(run_healthcheck_host_command hostname 2>/dev/null || printf \'unknown\')"',
  'notify_failure "SmartTour healthcheck failed on $notify_host: failures=$failures"',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

[
  "root_mode=\"$(stat -c '%a' /)\"",
  'disk_use=$(df -P / | awk',
  'notify_failure "SmartTour healthcheck failed on $(hostname): failures=$failures"',
].forEach((forbidden) => excludes('scripts/healthcheck.sh', healthcheck, forbidden));

includes('scripts/install-ops-schedule.sh', installer, '# HEALTHCHECK_HOST_COMMAND_TIMEOUT=10s');
includes('docs/observability-alerting-runbook.md', runbook, 'HEALTHCHECK_HOST_COMMAND_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'HEALTHCHECK_HOST_COMMAND_TIMEOUT');

if (packageJson.scripts['test:healthcheck-host-timeout'] !== 'node scripts/test-healthcheck-host-timeout-contract.js') {
  throw new Error('package.json must expose test:healthcheck-host-timeout');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-healthcheck-host-timeout-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-healthcheck-host-timeout-contract.js');

console.log('TEST_HEALTHCHECK_HOST_TIMEOUT_CONTRACT_OK');
