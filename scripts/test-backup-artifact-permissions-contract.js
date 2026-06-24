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
const scheduleInstaller = read('scripts/install-ops-schedule.sh');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const readinessTracker = read('docs/production-readiness-tracker.md');
const packageJson = JSON.parse(read('package.json'));
const ci = read('.github/workflows/smarttour-ci.yml');

for (const expected of [
  'umask 077',
  'POSTGRES_BACKUP_TIMEOUT="${POSTGRES_BACKUP_TIMEOUT:-30m}"',
  'BACKUP_CHECKSUM_TIMEOUT="${BACKUP_CHECKSUM_TIMEOUT:-5m}"',
  'BACKUP_COMPRESSION_TIMEOUT="${BACKUP_COMPRESSION_TIMEOUT:-30m}"',
  'BACKUP_FILE_SCAN_TIMEOUT="${BACKUP_FILE_SCAN_TIMEOUT:-30s}"',
  'run_postgres_backup_dump()',
  'run_backup_checksum()',
  'run_backup_compression()',
  'run_backup_file_scan()',
  'timeout "$POSTGRES_BACKUP_TIMEOUT" docker exec "$POSTGRES_CONTAINER" pg_dump',
  'timeout "$BACKUP_CHECKSUM_TIMEOUT" sha256sum "$@"',
  'timeout "$BACKUP_COMPRESSION_TIMEOUT" gzip "$@"',
  'timeout "$BACKUP_FILE_SCAN_TIMEOUT" find "$@"',
  'chmod 700 "$BACKUP_DIR"',
  'cleanup_tmp_backup()',
  'trap cleanup_tmp_backup EXIT',
  'rm -f "$tmp_file"',
  'run_backup_compression -9 > "$tmp_file"',
  'run_backup_checksum "$backup_file" > "$checksum_file"',
  'chmod 600 "$backup_file" "$checksum_file"',
  'run_backup_file_scan "$BACKUP_DIR" -type f -name \'smarttour-*.sql.gz\' -mtime +"$KEEP_DAYS" -delete',
  'run_backup_file_scan "$BACKUP_DIR" -type f -name \'smarttour-*.sql.gz.sha256\' -mtime +"$KEEP_DAYS" -delete',
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
  'DISASTER_BACKUP_DOCKER_TIMEOUT="${DISASTER_BACKUP_DOCKER_TIMEOUT:-30m}"',
  'DISASTER_BACKUP_COMPOSE_TIMEOUT="${DISASTER_BACKUP_COMPOSE_TIMEOUT:-10m}"',
  'DISASTER_BACKUP_HOST_COMMAND_TIMEOUT="${DISASTER_BACKUP_HOST_COMMAND_TIMEOUT:-30s}"',
  'DISASTER_BACKUP_ARCHIVE_TIMEOUT="${DISASTER_BACKUP_ARCHIVE_TIMEOUT:-60m}"',
  'DISASTER_BACKUP_GIT_TIMEOUT="${DISASTER_BACKUP_GIT_TIMEOUT:-5m}"',
  'DISASTER_BACKUP_FILE_SCAN_TIMEOUT="${DISASTER_BACKUP_FILE_SCAN_TIMEOUT:-30s}"',
  'DISASTER_BACKUP_FILE_READ_TIMEOUT="${DISASTER_BACKUP_FILE_READ_TIMEOUT:-10s}"',
  'DISASTER_BACKUP_TEXT_FILTER_TIMEOUT="${DISASTER_BACKUP_TEXT_FILTER_TIMEOUT:-10s}"',
  'DISASTER_BACKUP_CLEANUP_TIMEOUT="${DISASTER_BACKUP_CLEANUP_TIMEOUT:-5m}"',
  'BACKUP_ROOT="${BACKUP_ROOT%/}"',
  'validate_disaster_backup_root()',
  'safe_remove_disaster_path()',
  'safe_remove_disaster_archive()',
  'local target_dir="${target%/*}"',
  'local target_base="${target##*/}"',
  '[[ "$target_dir" != "$BACKUP_ROOT" ]]',
  '[[ "$target_base" != smarttour-disaster-* ]]',
  '[[ "$target_base" == *"/"* ]]',
  'DISASTER_BACKUP_ABORT unsafe backup root',
  'DISASTER_BACKUP_ABORT unsafe cleanup path',
  'validate_disaster_backup_root "$BACKUP_ROOT"',
  'run_disaster_archive_command gzip -9',
  'run_disaster_docker()',
  'run_disaster_compose()',
  'run_disaster_host_command()',
  'run_disaster_archive_command()',
  'run_disaster_git()',
  'run_disaster_file_scan()',
  'run_disaster_file_read()',
  'run_disaster_text_filter()',
  'run_disaster_cleanup()',
  'timeout "$DISASTER_BACKUP_DOCKER_TIMEOUT" docker "$@"',
  'timeout "$DISASTER_BACKUP_COMPOSE_TIMEOUT" docker compose "$@"',
  'timeout "$DISASTER_BACKUP_HOST_COMMAND_TIMEOUT" "$@"',
  'timeout "$DISASTER_BACKUP_ARCHIVE_TIMEOUT" "$@"',
  'timeout "$DISASTER_BACKUP_GIT_TIMEOUT" git "$@"',
  'timeout "$DISASTER_BACKUP_FILE_SCAN_TIMEOUT" find "$@"',
  'timeout "$DISASTER_BACKUP_FILE_READ_TIMEOUT" "$@"',
  'timeout "$DISASTER_BACKUP_TEXT_FILTER_TIMEOUT" "$@"',
  'timeout "$DISASTER_BACKUP_CLEANUP_TIMEOUT" rm "$@"',
  'run_disaster_cleanup -rf "$target"',
  'run_disaster_cleanup -f "$target" "$target.sha256"',
  'run_disaster_docker exec "$POSTGRES_CONTAINER" pg_dump',
  'run_disaster_docker exec -i "$POSTGRES_CONTAINER" pg_restore -l',
  'run_disaster_git status --short --branch',
  'run_disaster_git rev-parse HEAD',
  'run_disaster_git remote -v',
  'run_disaster_git bundle create "$work_dir/git/smarttour.bundle" --all',
  'run_disaster_archive_command tar -czf "$work_dir/config/smarttour-config.tar.gz"',
  'run_disaster_archive_command tar --ignore-failed-read -czf "$work_dir/config/server-config.tar.gz"',
  'run_disaster_archive_command tar -czf "$work_dir/volumes/$volume.tar.gz"',
  'run_disaster_archive_command tar -czf "$archive" -C "$BACKUP_ROOT" "$name"',
  'run_disaster_archive_command sha256sum "$archive"',
  'run_disaster_archive_command sha256sum -c "$archive.sha256"',
  'run_disaster_archive_command xargs -0 sha256sum',
  'run_disaster_host_command hostnamectl',
  'run_disaster_host_command ip addr',
  'run_disaster_host_command ip route',
  'run_disaster_host_command df -hT',
  'run_disaster_host_command systemctl --failed --no-pager',
  'run_disaster_host_command crontab -l',
  'run_disaster_docker ps -a',
  'run_disaster_docker image ls',
  'run_disaster_docker volume ls',
  'run_disaster_compose stop',
  'run_disaster_compose up -d',
  'run_disaster_docker volume inspect "$volume"',
  'hostname=$(run_disaster_host_command hostname)',
  "root_mode=$(run_disaster_host_command stat -c '%a %U:%G' /)",
  'key_mode="$(run_disaster_file_read stat -c \'%a\' "$key_file")"',
  'run_disaster_file_scan "$work_dir" -type f ! -name SHA256SUMS -print0',
  'run_disaster_text_filter sort -z',
  'run_disaster_file_scan "$BACKUP_ROOT" -maxdepth 1 -type f -name \'smarttour-disaster-*.tar.gz\'',
  'run_disaster_text_filter sort -nr',
  'run_disaster_text_filter tail -n "+$((KEEP_BACKUPS + 1))"',
  "run_disaster_text_filter cut -d' ' -f2-",
  'chmod 700 "$BACKUP_ROOT"',
  'chmod 600 "$archive" "$archive.sha256"',
  'safe_remove_disaster_path "$work_dir"',
  'safe_remove_disaster_archive "$old_archive"',
]) {
  includes('scripts/disaster-backup.sh', disasterBackup, expected);
}

for (const forbidden of [
  '\ndocker exec "$POSTGRES_CONTAINER" pg_dump',
  '\ndocker exec "$POSTGRES_CONTAINER" pg_dumpall',
  '\ndocker exec -i "$POSTGRES_CONTAINER" pg_restore',
  '\ndocker ps -a',
  '\ndocker image ls',
  '\ndocker volume ls',
  '\ndocker volume inspect "$volume"',
  '\ndocker compose stop',
  '\ndocker compose up -d',
  '\nhostnamectl > "$work_dir/config/hostnamectl.txt"',
  '\nip addr > "$work_dir/config/ip-addresses.txt"',
  '\nip route > "$work_dir/config/ip-routes.txt"',
  '\ndf -hT > "$work_dir/config/disk.txt"',
  '\nsystemctl --failed --no-pager > "$work_dir/config/systemd-failed.txt"',
  '\ncrontab -l > "$work_dir/config/root-crontab.txt"',
  '\ngit status --short --branch',
  '\ngit rev-parse HEAD',
  '\ngit remote -v',
  '\ngit bundle create',
  '\nfind "$work_dir" -type f ! -name SHA256SUMS -print0',
  '\n  find "$BACKUP_ROOT" -maxdepth 1 -type f -name \'smarttour-disaster-*.tar.gz\'',
  '\n  | sort -z',
  '\n    | sort -nr',
  '\n    | tail -n "+$((KEEP_BACKUPS + 1))"',
  "\n    | cut -d' ' -f2-",
  'hostname=$(hostname)',
  "root_mode=$(stat -c '%a %U:%G' /)",
  'key_mode="$(stat -c \'%a\' "$key_file")"',
  '\n  | gzip -9 > "$work_dir/database/smarttour.sql.gz"',
  '\ntar -czf "$work_dir/config/smarttour-config.tar.gz"',
  '\ntar --ignore-failed-read -czf "$work_dir/config/server-config.tar.gz"',
  '\ntar -czf "$work_dir/volumes/$volume.tar.gz"',
  '\ntar -czf "$archive" -C "$BACKUP_ROOT" "$name"',
  '\nsha256sum "$archive" > "$archive.sha256"',
  '\nsha256sum -c "$archive.sha256"',
  '\n  | xargs -0 sha256sum',
  'rm -rf "$work_dir"',
  'rm -rf "$target"',
  'rm -rf "${old_archive%.tar.gz}"',
  'rm -f "$old_archive" "$old_archive.sha256"',
  'rm -f "$target" "$target.sha256"',
  '[[ -z "$target" || "$target" != "$BACKUP_ROOT"/smarttour-disaster-* ]]',
  '[[ -z "$target" || "$target" != "$BACKUP_ROOT"/smarttour-disaster-*.tar.gz ]]',
]) {
  if (disasterBackup.includes(forbidden)) {
    throw new Error(`scripts/disaster-backup.sh must not use raw ${forbidden.trim()}.`);
  }
}

if (disasterBackup.indexOf('sha256sum -c "$archive.sha256"') > disasterBackup.indexOf('safe_remove_disaster_path "$work_dir"')) {
  throw new Error('scripts/disaster-backup.sh must verify the archive checksum before removing the staging directory.');
}

if (disasterBackup.indexOf('safe_remove_disaster_path "$work_dir"') > disasterBackup.indexOf('if [[ -n "$REMOTE_TARGET" ]]')) {
  throw new Error('scripts/disaster-backup.sh must remove the staging directory before offsite sync starts.');
}

for (const expected of [
  'Backup artifacts must be private',
  'Temporary backup files are removed automatically if backup creation fails',
  'POSTGRES_BACKUP_TIMEOUT=30m',
  'BACKUP_CHECKSUM_TIMEOUT=5m',
  'BACKUP_COMPRESSION_TIMEOUT=30m',
  'BACKUP_FILE_SCAN_TIMEOUT=30s',
  'DISASTER_BACKUP_DOCKER_TIMEOUT=30m',
  'DISASTER_BACKUP_COMPOSE_TIMEOUT=10m',
  'DISASTER_BACKUP_HOST_COMMAND_TIMEOUT=30s',
  'DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m',
  'DISASTER_BACKUP_GIT_TIMEOUT=5m',
  'DISASTER_BACKUP_FILE_SCAN_TIMEOUT=30s',
  'DISASTER_BACKUP_FILE_READ_TIMEOUT=10s',
  'DISASTER_BACKUP_TEXT_FILTER_TIMEOUT=10s',
  'DISASTER_BACKUP_CLEANUP_TIMEOUT=5m',
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

for (const expected of [
  'DISASTER_BACKUP_CLEANUP_TIMEOUT=5m',
]) {
  includes('scripts/install-ops-schedule.sh', scheduleInstaller, expected);
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
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'DISASTER_BACKUP_DOCKER_TIMEOUT',
);

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'DISASTER_BACKUP_HOST_COMMAND_TIMEOUT',
);

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'DISASTER_BACKUP_ARCHIVE_TIMEOUT',
);

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'DISASTER_BACKUP_GIT_TIMEOUT',
);

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'DISASTER_BACKUP_CLEANUP_TIMEOUT',
);

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'DISASTER_BACKUP_FILE_SCAN_TIMEOUT',
);

includes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'DISASTER_BACKUP_TEXT_FILTER_TIMEOUT',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# POSTGRES_BACKUP_TIMEOUT=30m',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# DISASTER_BACKUP_DOCKER_TIMEOUT=30m',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# DISASTER_BACKUP_HOST_COMMAND_TIMEOUT=30s',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# DISASTER_BACKUP_ARCHIVE_TIMEOUT=60m',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# DISASTER_BACKUP_GIT_TIMEOUT=5m',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# DISASTER_BACKUP_FILE_SCAN_TIMEOUT=30s',
);

includes(
  'scripts/install-ops-schedule.sh',
  read('scripts/install-ops-schedule.sh'),
  '# DISASTER_BACKUP_TEXT_FILTER_TIMEOUT=10s',
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
