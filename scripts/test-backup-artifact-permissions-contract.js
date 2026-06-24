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

const postgresBackup = read('scripts/backup-postgres.sh');
const disasterBackup = read('scripts/disaster-backup.sh');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const readinessTracker = read('docs/production-readiness-tracker.md');
const packageJson = JSON.parse(read('package.json'));
const ci = read('.github/workflows/smarttour-ci.yml');

for (const expected of [
  'umask 077',
  'POSTGRES_BACKUP_TIMEOUT="${POSTGRES_BACKUP_TIMEOUT:-30m}"',
  'run_postgres_backup_dump()',
  'timeout "$POSTGRES_BACKUP_TIMEOUT" docker exec "$POSTGRES_CONTAINER" pg_dump',
  'chmod 700 "$BACKUP_DIR"',
  'cleanup_tmp_backup()',
  'trap cleanup_tmp_backup EXIT',
  'rm -f "$tmp_file"',
  'chmod 600 "$backup_file" "$checksum_file"',
]) {
  includes('scripts/backup-postgres.sh', postgresBackup, expected);
}

if (postgresBackup.indexOf('trap cleanup_tmp_backup EXIT') > postgresBackup.indexOf('run_postgres_backup_dump \\')) {
  throw new Error('scripts/backup-postgres.sh must install tmp cleanup before pg_dump starts.');
}

if (postgresBackup.includes('\ndocker exec "$POSTGRES_CONTAINER" pg_dump')) {
  throw new Error('scripts/backup-postgres.sh must not call pg_dump through raw docker exec.');
}

for (const expected of [
  'umask 077',
  'chmod 700 "$BACKUP_ROOT"',
  'chmod 600 "$archive" "$archive.sha256"',
  'rm -rf "$work_dir"',
]) {
  includes('scripts/disaster-backup.sh', disasterBackup, expected);
}

if (disasterBackup.indexOf('sha256sum -c "$archive.sha256"') > disasterBackup.indexOf('rm -rf "$work_dir"')) {
  throw new Error('scripts/disaster-backup.sh must verify the archive checksum before removing the staging directory.');
}

if (disasterBackup.indexOf('rm -rf "$work_dir"') > disasterBackup.indexOf('if [[ -n "$REMOTE_TARGET" ]]')) {
  throw new Error('scripts/disaster-backup.sh must remove the staging directory before offsite sync starts.');
}

for (const expected of [
  'Backup artifacts must be private',
  'Temporary backup files are removed automatically if backup creation fails',
  'POSTGRES_BACKUP_TIMEOUT=30m',
  'Disaster backup staging directories are removed after archive checksum verification',
  'chmod 700 /opt/smarttour/backups/postgres',
  'chmod 600 /opt/smarttour/backups/postgres/smarttour-*.sql.gz',
  'chmod 600 /opt/smarttour/backups/postgres/smarttour-*.sql.gz.sha256',
  'chmod 700 /var/backups/smarttour/disaster',
  'chmod 600 /var/backups/smarttour/disaster/smarttour-disaster-*.tar.gz',
  'chmod 600 /var/backups/smarttour/disaster/smarttour-disaster-*.tar.gz.sha256',
  'npm run test:backup-artifact-permissions',
]) {
  includes('docs/operations-backup-reinstall.md', backupRunbook, expected);
}

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'npm run test:backup-artifact-permissions',
);

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'POSTGRES_BACKUP_TIMEOUT',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# POSTGRES_BACKUP_TIMEOUT=30m',
);

if (packageJson.scripts['test:backup-artifact-permissions'] !== 'node scripts/test-backup-artifact-permissions-contract.js') {
  throw new Error('package.json must expose test:backup-artifact-permissions.');
}

includes(
  '.github/workflows/smarttour-ci.yml',
  ci,
  'node scripts/test-backup-artifact-permissions-contract.js',
);

console.log('TEST_BACKUP_ARTIFACT_PERMISSIONS_CONTRACT_OK');
