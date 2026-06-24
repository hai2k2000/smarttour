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
  'chmod 700 "$BACKUP_DIR"',
  'cleanup_tmp_backup()',
  'trap cleanup_tmp_backup EXIT',
  'rm -f "$tmp_file"',
  'chmod 600 "$backup_file" "$checksum_file"',
]) {
  includes('scripts/backup-postgres.sh', postgresBackup, expected);
}

if (postgresBackup.indexOf('trap cleanup_tmp_backup EXIT') > postgresBackup.indexOf('docker exec "$POSTGRES_CONTAINER" pg_dump')) {
  throw new Error('scripts/backup-postgres.sh must install tmp cleanup before pg_dump starts.');
}

for (const expected of [
  'umask 077',
  'chmod 700 "$BACKUP_ROOT"',
  'chmod 600 "$archive" "$archive.sha256"',
]) {
  includes('scripts/disaster-backup.sh', disasterBackup, expected);
}

for (const expected of [
  'Backup artifacts must be private',
  'Temporary backup files are removed automatically if backup creation fails',
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

if (packageJson.scripts['test:backup-artifact-permissions'] !== 'node scripts/test-backup-artifact-permissions-contract.js') {
  throw new Error('package.json must expose test:backup-artifact-permissions.');
}

includes(
  '.github/workflows/smarttour-ci.yml',
  ci,
  'node scripts/test-backup-artifact-permissions-contract.js',
);

console.log('TEST_BACKUP_ARTIFACT_PERMISSIONS_CONTRACT_OK');
