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
  'SYSTEMD_CHECK_TIMEOUT="${SYSTEMD_CHECK_TIMEOUT:-10s}"',
  'run_systemd_check()',
  'timeout "$SYSTEMD_CHECK_TIMEOUT" systemctl "$@"',
  'systemd_failed_units_available=false',
  'if ! failed_units_output="$(run_systemd_check --failed --no-legend --plain 2>/dev/null)"; then',
  'FAIL_SYSTEMD unavailable',
  'systemd_failed_units_available=true',
  'critical_failed_units="$(printf',
  'elif [[ "$systemd_failed_units_available" == "true" ]]; then',
  'restore_drill_result="$(run_systemd_check show "$RESTORE_DRILL_SERVICE" -p Result --value 2>/dev/null || true)"',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

[
  'systemctl --failed',
  'systemctl show "$RESTORE_DRILL_SERVICE"',
].forEach((forbidden) => excludes('scripts/healthcheck.sh', healthcheck, forbidden));

includes('scripts/install-ops-schedule.sh', installer, '# SYSTEMD_CHECK_TIMEOUT=10s');
includes('docs/observability-alerting-runbook.md', runbook, 'SYSTEMD_CHECK_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'SYSTEMD_CHECK_TIMEOUT');

if (packageJson.scripts['test:healthcheck-systemd-timeout'] !== 'node scripts/test-healthcheck-systemd-timeout-contract.js') {
  throw new Error('package.json must expose test:healthcheck-systemd-timeout');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-healthcheck-systemd-timeout-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-healthcheck-systemd-timeout-contract.js');

console.log('TEST_HEALTHCHECK_SYSTEMD_TIMEOUT_CONTRACT_OK');
