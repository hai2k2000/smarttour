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

const installer = read('scripts/install-ops-schedule.sh');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const securityRunbook = read('docs/security-hardening-runbook.md');
const readinessTracker = read('docs/production-readiness-tracker.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');
const githubActionsContract = read('scripts/test-github-actions-contract.js');

[
  'OPS_SYSTEMD_TIMEOUT="${OPS_SYSTEMD_TIMEOUT:-30s}"',
  'run_ops_systemctl()',
  'timeout "$OPS_SYSTEMD_TIMEOUT" systemctl "$@"',
  'run_ops_systemctl daemon-reload',
  'run_ops_systemctl enable --now \\',
  "run_ops_systemctl list-timers --all --no-pager 'smarttour-*'",
  '# OPS_SYSTEMD_TIMEOUT=30s',
].forEach((expected) => includes('scripts/install-ops-schedule.sh', installer, expected));

[
  '\nsystemctl daemon-reload',
  '\nsystemctl enable --now',
  '\nsystemctl list-timers',
].forEach((forbidden) => excludes('scripts/install-ops-schedule.sh', installer, forbidden));

[
  'OPS_SYSTEMD_TIMEOUT',
  'scripts/install-ops-schedule.sh',
].forEach((expected) => {
  includes('docs/operations-backup-reinstall.md', backupRunbook, expected);
  includes('docs/security-hardening-runbook.md', securityRunbook, expected);
  includes('docs/production-readiness-tracker.md', readinessTracker, expected);
});

if (packageJson.scripts['test:ops-install-systemd-timeout'] !== 'node scripts/test-ops-install-systemd-timeout-contract.js') {
  throw new Error('package.json must expose test:ops-install-systemd-timeout');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-ops-install-systemd-timeout-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-ops-install-systemd-timeout-contract.js');

console.log('TEST_OPS_INSTALL_SYSTEMD_TIMEOUT_CONTRACT_OK');
