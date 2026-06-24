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
  'latest_disaster_backup="$(run_healthcheck_file_scan "$DISASTER_BACKUP_DIR" -maxdepth 1 -type f -name \'smarttour-disaster-*.tar.gz\'',
  'DISASTER_BACKUP_MAX_AGE_HOURS:-192',
  'CHECKSUM_CHECK_TIMEOUT="${CHECKSUM_CHECK_TIMEOUT:-5m}"',
  'HEALTHCHECK_FILE_SCAN_TIMEOUT="${HEALTHCHECK_FILE_SCAN_TIMEOUT:-30s}"',
  'run_checksum_check()',
  'run_healthcheck_file_scan()',
  'timeout "$CHECKSUM_CHECK_TIMEOUT" sha256sum "$@"',
  'timeout "$HEALTHCHECK_FILE_SCAN_TIMEOUT" find "$@"',
  'latest_backup="$(run_healthcheck_file_scan "$BACKUP_DIR" -type f -name \'smarttour-*.sql.gz\'',
  'OK_DISASTER_BACKUP age=${disaster_backup_age_hours}h checksum=valid file=$latest_disaster_backup_file',
  'FAIL_DISASTER_BACKUP no disaster backup in $DISASTER_BACKUP_DIR',
  'FAIL_DISASTER_BACKUP stale age=${disaster_backup_age_hours}h file=$latest_disaster_backup_file',
  'FAIL_DISASTER_BACKUP checksum missing_or_invalid file=$latest_disaster_backup_file',
  'run_checksum_check -c "$latest_backup_file.sha256"',
  'run_checksum_check -c "$latest_disaster_backup_file.sha256"',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

includes('scripts/install-ops-schedule.sh', opsSchedule, 'DISASTER_BACKUP_MAX_AGE_HOURS=192');
includes('scripts/install-ops-schedule.sh', opsSchedule, '# CHECKSUM_CHECK_TIMEOUT=5m');
includes('scripts/install-ops-schedule.sh', opsSchedule, '# HEALTHCHECK_FILE_SCAN_TIMEOUT=30s');
includes('docs/production-readiness-tracker.md', readinessTracker, 'OK_DISASTER_BACKUP');
includes('docs/production-readiness-tracker.md', readinessTracker, 'CHECKSUM_CHECK_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'HEALTHCHECK_FILE_SCAN_TIMEOUT');
includes('docs/observability-alerting-runbook.md', observabilityRunbook, 'OK_DISASTER_BACKUP');
includes('docs/observability-alerting-runbook.md', observabilityRunbook, 'CHECKSUM_CHECK_TIMEOUT');
includes('docs/observability-alerting-runbook.md', observabilityRunbook, 'HEALTHCHECK_FILE_SCAN_TIMEOUT');

if (healthcheck.includes('sha256sum -c "$latest_backup_file.sha256"') || healthcheck.includes('sha256sum -c "$latest_disaster_backup_file.sha256"')) {
  throw new Error('scripts/healthcheck.sh must not run raw sha256sum checksum verification.');
}

if (healthcheck.includes('latest_backup="$(find "$BACKUP_DIR"') || healthcheck.includes('latest_disaster_backup="$(find "$DISASTER_BACKUP_DIR"')) {
  throw new Error('scripts/healthcheck.sh must not run raw find for backup discovery.');
}

if (packageJson.scripts['test:healthcheck-backup'] !== 'node scripts/test-healthcheck-backup-contract.js') {
  throw new Error('package.json must expose test:healthcheck-backup');
}

console.log('TEST_HEALTHCHECK_BACKUP_CONTRACT_OK');
