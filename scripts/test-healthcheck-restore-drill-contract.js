const fs = require('fs');

const healthcheck = fs.readFileSync('scripts/healthcheck.sh', 'utf8');
const opsSchedule = fs.readFileSync('scripts/install-ops-schedule.sh', 'utf8');
const restoreDrill = fs.readFileSync('scripts/restore-drill-postgres.sh', 'utf8');
const readinessTracker = fs.readFileSync('docs/production-readiness-tracker.md', 'utf8');
const observabilityRunbook = fs.readFileSync('docs/observability-alerting-runbook.md', 'utf8');
const operationsRunbook = fs.readFileSync('docs/operations-backup-reinstall.md', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

[
  'RESTORE_DRILL_LOG="${RESTORE_DRILL_LOG:-/var/log/smarttour/restore-drill.log}"',
  'RESTORE_DRILL_STATE="${RESTORE_DRILL_STATE:-/var/lib/smarttour/restore-drill.ok}"',
  'RESTORE_DRILL_SERVICE="${RESTORE_DRILL_SERVICE:-smarttour-restore-drill.service}"',
  'RESTORE_DRILL_MAX_AGE_HOURS:-192',
  'HEALTHCHECK_FILE_READ_TIMEOUT="${HEALTHCHECK_FILE_READ_TIMEOUT:-10s}"',
  'run_healthcheck_file_read()',
  'timeout "$HEALTHCHECK_FILE_READ_TIMEOUT" "$@"',
  "run_healthcheck_file_read grep -Fq 'RESTORE_DRILL_OK' \"$RESTORE_DRILL_STATE\"",
  'restore_drill_epoch="$(run_healthcheck_file_read stat -c \'%Y\' "$RESTORE_DRILL_STATE")"',
  'run_systemd_check show "$RESTORE_DRILL_SERVICE" -p Result --value',
  'OK_RESTORE_DRILL age=${restore_drill_age_hours}h result=success state=$RESTORE_DRILL_STATE log=$RESTORE_DRILL_LOG',
  'FAIL_RESTORE_DRILL missing_state state=$RESTORE_DRILL_STATE',
  'FAIL_RESTORE_DRILL missing_success_marker state=$RESTORE_DRILL_STATE',
  'FAIL_RESTORE_DRILL stale age=${restore_drill_age_hours}h state=$RESTORE_DRILL_STATE',
  'FAIL_RESTORE_DRILL result=${restore_drill_result:-unknown} service=$RESTORE_DRILL_SERVICE',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

includes('scripts/install-ops-schedule.sh', opsSchedule, 'RESTORE_DRILL_MAX_AGE_HOURS=192');
includes('scripts/install-ops-schedule.sh', opsSchedule, 'RESTORE_DRILL_STATE=/var/lib/smarttour/restore-drill.ok');
includes('scripts/install-ops-schedule.sh', opsSchedule, 'install -d -m 0750 /var/lib/smarttour');
includes('scripts/install-ops-schedule.sh', opsSchedule, '# HEALTHCHECK_FILE_READ_TIMEOUT=10s');
[
  'RESTORE_DRILL_STATE="${RESTORE_DRILL_STATE:-/var/lib/smarttour/restore-drill.ok}"',
  'write_restore_drill_state()',
  "printf '%s\\n' \"$message\" > \"$RESTORE_DRILL_STATE\"",
  'write_restore_drill_state "$restore_drill_message"',
].forEach((expected) => includes('scripts/restore-drill-postgres.sh', restoreDrill, expected));

includes('docs/production-readiness-tracker.md', readinessTracker, 'OK_RESTORE_DRILL');
includes('docs/production-readiness-tracker.md', readinessTracker, 'HEALTHCHECK_FILE_READ_TIMEOUT');
includes('docs/observability-alerting-runbook.md', observabilityRunbook, 'OK_RESTORE_DRILL');
includes('docs/observability-alerting-runbook.md', observabilityRunbook, 'HEALTHCHECK_FILE_READ_TIMEOUT');
includes('docs/operations-backup-reinstall.md', operationsRunbook, 'OK_RESTORE_DRILL');
includes('docs/operations-backup-reinstall.md', operationsRunbook, 'HEALTHCHECK_FILE_READ_TIMEOUT');

if (healthcheck.includes("elif ! grep -Fq 'RESTORE_DRILL_OK' \"$RESTORE_DRILL_LOG\"")) {
  throw new Error('scripts/healthcheck.sh must not run raw grep against the restore drill log.');
}

if (healthcheck.includes("grep -Fq 'RESTORE_DRILL_OK' \"$RESTORE_DRILL_LOG\"")) {
  throw new Error('scripts/healthcheck.sh must not depend on rotated restore-drill logs for the success marker.');
}

if (healthcheck.includes("restore_drill_epoch=\"$(stat -c '%Y' \"$RESTORE_DRILL_LOG\")\"")) {
  throw new Error('scripts/healthcheck.sh must not run raw stat against the restore drill log.');
}

if (packageJson.scripts['test:healthcheck-restore-drill'] !== 'node scripts/test-healthcheck-restore-drill-contract.js') {
  throw new Error('package.json must expose test:healthcheck-restore-drill');
}

console.log('TEST_HEALTHCHECK_RESTORE_DRILL_CONTRACT_OK');
