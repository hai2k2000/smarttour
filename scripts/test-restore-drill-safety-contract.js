const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

function before(file, content, earlier, later) {
  const earlierIndex = content.indexOf(earlier);
  const laterIndex = content.indexOf(later);
  if (earlierIndex === -1 || laterIndex === -1 || earlierIndex > laterIndex) {
    throw new Error(`${file} must place ${earlier} before ${later}`);
  }
}

const restoreDrill = read('scripts/restore-drill-postgres.sh');
const opsSchedule = read('scripts/install-ops-schedule.sh');
const packageJson = JSON.parse(read('package.json'));
const ci = read('.github/workflows/smarttour-ci.yml');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const readinessTracker = read('docs/production-readiness-tracker.md');

for (const expected of [
  'RESTORE_DRILL_COMMAND_TIMEOUT="${RESTORE_DRILL_COMMAND_TIMEOUT:-30m}"',
  'BACKUP_CHECKSUM_TIMEOUT="${BACKUP_CHECKSUM_TIMEOUT:-5m}"',
  'BACKUP_COMPRESSION_TIMEOUT="${BACKUP_COMPRESSION_TIMEOUT:-30m}"',
  'BACKUP_FILE_SCAN_TIMEOUT="${BACKUP_FILE_SCAN_TIMEOUT:-30s}"',
  'run_restore_drill_docker()',
  'run_restore_drill_checksum()',
  'run_restore_drill_compression()',
  'run_restore_drill_file_scan()',
  'timeout "$RESTORE_DRILL_COMMAND_TIMEOUT" docker exec "$@"',
  'timeout "$BACKUP_CHECKSUM_TIMEOUT" sha256sum "$@"',
  'timeout "$BACKUP_COMPRESSION_TIMEOUT" gzip "$@"',
  'timeout "$BACKUP_FILE_SCAN_TIMEOUT" find "$@"',
  'backup_file="$(run_restore_drill_file_scan "$BACKUP_DIR" -type f -name \'smarttour-*.sql.gz\'',
  'PROTECTED_RESTORE_DRILL_DBS=(smarttour postgres template0 template1)',
  'validate_drill_db_name()',
  'RESTORE_DRILL_ABORT unsafe DRILL_DB',
  '[[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]',
  'validate_drill_db_name "$DRILL_DB"',
  'run_restore_drill_docker "$POSTGRES_CONTAINER" dropdb',
  'run_restore_drill_docker "$POSTGRES_CONTAINER" createdb',
  'run_restore_drill_docker -i "$POSTGRES_CONTAINER" psql',
  'run_restore_drill_checksum -c "$backup_file.sha256"',
  'run_restore_drill_compression -dc "$backup_file"',
]) {
  includes('scripts/restore-drill-postgres.sh', restoreDrill, expected);
}

for (const forbidden of [
  'docker exec "$POSTGRES_CONTAINER" dropdb',
  'docker exec "$POSTGRES_CONTAINER" createdb',
  'docker exec -i "$POSTGRES_CONTAINER" psql',
  'sha256sum -c "$backup_file.sha256"',
  'gzip -dc "$backup_file"',
  'backup_file="$(find "$BACKUP_DIR" -type f -name \'smarttour-*.sql.gz\'',
]) {
  if (restoreDrill.includes(forbidden)) {
    throw new Error(`scripts/restore-drill-postgres.sh must not include raw ${forbidden}`);
  }
}

before(
  'scripts/restore-drill-postgres.sh',
  restoreDrill,
  'validate_drill_db_name "$DRILL_DB"',
  'run_restore_drill_docker "$POSTGRES_CONTAINER" dropdb',
);

for (const expected of [
  'DRILL_DB must be a throwaway database name',
  'Do not set `DRILL_DB` to `smarttour`, `postgres`, `template0`, or `template1`',
  'RESTORE_DRILL_COMMAND_TIMEOUT=30m',
  'BACKUP_CHECKSUM_TIMEOUT=5m',
  'BACKUP_COMPRESSION_TIMEOUT=30m',
  'BACKUP_FILE_SCAN_TIMEOUT=30s',
  'npm run test:restore-drill-safety',
]) {
  includes('docs/operations-backup-reinstall.md', backupRunbook, expected);
}

includes('scripts/install-ops-schedule.sh', opsSchedule, '# RESTORE_DRILL_COMMAND_TIMEOUT=30m');
includes('scripts/install-ops-schedule.sh', opsSchedule, '# BACKUP_CHECKSUM_TIMEOUT=5m');
includes('scripts/install-ops-schedule.sh', opsSchedule, '# BACKUP_COMPRESSION_TIMEOUT=30m');
includes('scripts/install-ops-schedule.sh', opsSchedule, '# BACKUP_FILE_SCAN_TIMEOUT=30s');
includes('docs/production-readiness-tracker.md', readinessTracker, 'RESTORE_DRILL_COMMAND_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'BACKUP_CHECKSUM_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'BACKUP_COMPRESSION_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'BACKUP_FILE_SCAN_TIMEOUT');

if (packageJson.scripts['test:restore-drill-safety'] !== 'node scripts/test-restore-drill-safety-contract.js') {
  throw new Error('package.json must expose test:restore-drill-safety.');
}

includes(
  '.github/workflows/smarttour-ci.yml',
  ci,
  'node scripts/test-restore-drill-safety-contract.js',
);

console.log('TEST_RESTORE_DRILL_SAFETY_CONTRACT_OK');
