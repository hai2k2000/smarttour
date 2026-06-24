const fs = require('fs');

const healthcheck = fs.readFileSync('scripts/healthcheck.sh', 'utf8');
const opsSchedule = fs.readFileSync('scripts/install-ops-schedule.sh', 'utf8');
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
  'RESTORE_DRILL_SERVICE="${RESTORE_DRILL_SERVICE:-smarttour-restore-drill.service}"',
  'RESTORE_DRILL_MAX_AGE_HOURS:-192',
  "grep -Fq 'RESTORE_DRILL_OK' \"$RESTORE_DRILL_LOG\"",
  'systemctl show "$RESTORE_DRILL_SERVICE" -p Result --value',
  'OK_RESTORE_DRILL age=${restore_drill_age_hours}h result=success log=$RESTORE_DRILL_LOG',
  'FAIL_RESTORE_DRILL missing_log log=$RESTORE_DRILL_LOG',
  'FAIL_RESTORE_DRILL missing_success_marker log=$RESTORE_DRILL_LOG',
  'FAIL_RESTORE_DRILL stale age=${restore_drill_age_hours}h log=$RESTORE_DRILL_LOG',
  'FAIL_RESTORE_DRILL result=${restore_drill_result:-unknown} service=$RESTORE_DRILL_SERVICE',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

includes('scripts/install-ops-schedule.sh', opsSchedule, 'RESTORE_DRILL_MAX_AGE_HOURS=192');
includes('docs/production-readiness-tracker.md', readinessTracker, 'OK_RESTORE_DRILL');
includes('docs/observability-alerting-runbook.md', observabilityRunbook, 'OK_RESTORE_DRILL');
includes('docs/operations-backup-reinstall.md', operationsRunbook, 'OK_RESTORE_DRILL');

if (packageJson.scripts['test:healthcheck-restore-drill'] !== 'node scripts/test-healthcheck-restore-drill-contract.js') {
  throw new Error('package.json must expose test:healthcheck-restore-drill');
}

console.log('TEST_HEALTHCHECK_RESTORE_DRILL_CONTRACT_OK');
