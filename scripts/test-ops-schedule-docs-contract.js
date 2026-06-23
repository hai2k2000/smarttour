const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

function assertNotIncludes(file, content, forbidden) {
  if (content.includes(forbidden)) {
    throw new Error(`${file} must not include stale ${forbidden}`);
  }
}

const readinessTracker = read('docs/production-readiness-tracker.md');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const securityRunbook = read('docs/security-hardening-runbook.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');

[
  '/etc/cron.d/smarttour-postgres-backup',
  '/etc/cron.d/smarttour-healthcheck',
].forEach((forbidden) => assertNotIncludes('docs/production-readiness-tracker.md', readinessTracker, forbidden));

[
  'smarttour-postgres-backup.timer',
  'smarttour-healthcheck.timer',
  'smarttour-nginx-host-report.timer',
  'smarttour-disaster-backup.timer',
  'smarttour-restore-drill.timer',
  'systemctl list-timers --all',
  'scripts/install-ops-schedule.sh',
].forEach((expected) => assertIncludes('docs/production-readiness-tracker.md', readinessTracker, expected));

[
  'smarttour-postgres-backup.timer',
  'smarttour-healthcheck.timer',
  'smarttour-nginx-host-report.timer',
  'smarttour-disaster-backup.timer',
  'smarttour-restore-drill.timer',
].forEach((expected) => {
  assertIncludes('docs/operations-backup-reinstall.md', backupRunbook, expected);
  assertIncludes('docs/security-hardening-runbook.md', securityRunbook, expected);
});

if (packageJson.scripts['test:ops-schedule-docs'] !== 'node scripts/test-ops-schedule-docs-contract.js') {
  throw new Error('package.json must expose test:ops-schedule-docs');
}

assertIncludes(
  '.github/workflows/smarttour-ci.yml',
  ciWorkflow,
  'node scripts/test-ops-schedule-docs-contract.js',
);

console.log('TEST_OPS_SCHEDULE_DOCS_CONTRACT_OK');
