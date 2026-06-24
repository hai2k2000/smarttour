const fs = require('fs');

const healthcheck = fs.readFileSync('scripts/healthcheck.sh', 'utf8');
const opsSchedule = fs.readFileSync('scripts/install-ops-schedule.sh', 'utf8');
const readinessTracker = fs.readFileSync('docs/production-readiness-tracker.md', 'utf8');
const observabilityRunbook = fs.readFileSync('docs/observability-alerting-runbook.md', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

[
  'DISASTER_BACKUP_DIR="${DISASTER_BACKUP_DIR:-/var/backups/smarttour/disaster}"',
  'latest_disaster_backup="$(find "$DISASTER_BACKUP_DIR" -maxdepth 1 -type f -name \'smarttour-disaster-*.tar.gz\'',
  'DISASTER_BACKUP_MAX_AGE_HOURS:-192',
  'OK_DISASTER_BACKUP age=${disaster_backup_age_hours}h checksum=valid file=$latest_disaster_backup_file',
  'FAIL_DISASTER_BACKUP no disaster backup in $DISASTER_BACKUP_DIR',
  'FAIL_DISASTER_BACKUP stale age=${disaster_backup_age_hours}h file=$latest_disaster_backup_file',
  'FAIL_DISASTER_BACKUP checksum missing_or_invalid file=$latest_disaster_backup_file',
  'sha256sum -c "$latest_disaster_backup_file.sha256"',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

includes('scripts/install-ops-schedule.sh', opsSchedule, 'DISASTER_BACKUP_MAX_AGE_HOURS=192');
includes('docs/production-readiness-tracker.md', readinessTracker, 'OK_DISASTER_BACKUP');
includes('docs/observability-alerting-runbook.md', observabilityRunbook, 'OK_DISASTER_BACKUP');

if (packageJson.scripts['test:healthcheck-backup'] !== 'node scripts/test-healthcheck-backup-contract.js') {
  throw new Error('package.json must expose test:healthcheck-backup');
}

console.log('TEST_HEALTHCHECK_BACKUP_CONTRACT_OK');
