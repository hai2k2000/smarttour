const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

function exists(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} must exist`);
  }
}

exists('deploy/logrotate/smarttour');

const logrotate = read('deploy/logrotate/smarttour');
const installer = read('scripts/install-ops-schedule.sh');
const securityAudit = read('scripts/security-audit.sh');
const securityContract = read('scripts/test-security-audit-contract.js');
const readinessTracker = read('docs/production-readiness-tracker.md');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const securityRunbook = read('docs/security-hardening-runbook.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');
const githubActionsContract = read('scripts/test-github-actions-contract.js');

[
  '/var/log/smarttour/*.log',
  'daily',
  'rotate 14',
  'missingok',
  'notifempty',
  'compress',
  'delaycompress',
  'copytruncate',
  'create 0640 root root',
].forEach((expected) => includes('deploy/logrotate/smarttour', logrotate, expected));

[
  'install -d -m 0755 /etc/logrotate.d',
  'install -m 0644 "$REPO_DIR/deploy/logrotate/smarttour" /etc/logrotate.d/smarttour',
].forEach((expected) => includes('scripts/install-ops-schedule.sh', installer, expected));

[
  'logrotate_conf_mode="$(stat -c',
  'OK_LOGROTATE /etc/logrotate.d/smarttour=644 root:root',
  'FAIL_LOGROTATE',
  "grep -Eq '^/var/log/smarttour/\\*\\.log' /etc/logrotate.d/smarttour",
  "grep -Eq '^[[:space:]]*copytruncate$' /etc/logrotate.d/smarttour",
  "grep -Eq '^[[:space:]]*rotate 14$' /etc/logrotate.d/smarttour",
].forEach((expected) => includes('scripts/security-audit.sh', securityAudit, expected));

includes('scripts/test-security-audit-contract.js', securityContract, 'OK_LOGROTATE');
includes('docs/production-readiness-tracker.md', readinessTracker, 'OK_LOGROTATE');
includes('docs/operations-backup-reinstall.md', backupRunbook, '/etc/logrotate.d/smarttour');
includes('docs/security-hardening-runbook.md', securityRunbook, 'OK_LOGROTATE');

if (packageJson.scripts['test:ops-logrotate'] !== 'node scripts/test-ops-logrotate-contract.js') {
  throw new Error('package.json must expose test:ops-logrotate');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-ops-logrotate-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-ops-logrotate-contract.js');

console.log('TEST_OPS_LOGROTATE_CONTRACT_OK');
