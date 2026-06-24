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

function assertRegex(file, content, regex, message) {
  if (!regex.test(content)) {
    throw new Error(`${file} ${message}`);
  }
}

const syncScript = read('scripts/sync-latest-backup.sh');
const disasterScript = read('scripts/disaster-backup.sh');
const scheduleInstaller = read('scripts/install-ops-schedule.sh');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');

[
  'BACKUP_REMOTE_CONNECT_TIMEOUT="${BACKUP_REMOTE_CONNECT_TIMEOUT:-10}"',
  'BACKUP_REMOTE_SERVER_ALIVE_INTERVAL="${BACKUP_REMOTE_SERVER_ALIVE_INTERVAL:-15}"',
  'BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX="${BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX:-2}"',
  'BACKUP_REMOTE_SCP_TIMEOUT="${BACKUP_REMOTE_SCP_TIMEOUT:-30m}"',
  'BACKUP_CHECKSUM_TIMEOUT="${BACKUP_CHECKSUM_TIMEOUT:-5m}"',
  'BACKUP_FILE_SCAN_TIMEOUT="${BACKUP_FILE_SCAN_TIMEOUT:-30s}"',
  'BACKUP_FILE_READ_TIMEOUT="${BACKUP_FILE_READ_TIMEOUT:-10s}"',
  'BACKUP_TEXT_FILTER_TIMEOUT="${BACKUP_TEXT_FILTER_TIMEOUT:-10s}"',
  'run_backup_scp()',
  'run_backup_checksum()',
  'run_backup_file_scan()',
  'run_backup_file_read()',
  'run_backup_text_filter()',
  'timeout "$BACKUP_REMOTE_SCP_TIMEOUT" scp "$@"',
  'timeout "$BACKUP_CHECKSUM_TIMEOUT" sha256sum "$@"',
  'timeout "$BACKUP_FILE_SCAN_TIMEOUT" find "$@"',
  'timeout "$BACKUP_FILE_READ_TIMEOUT" "$@"',
  'timeout "$BACKUP_TEXT_FILTER_TIMEOUT" "$@"',
  'latest="$(run_backup_file_scan "$BACKUP_DIR" -type f -name \'smarttour-*.sql.gz\' | run_backup_text_filter sort | run_backup_text_filter tail -1)"',
  'require_private_key_file()',
  'key_mode="$(run_backup_file_read stat -c \'%a\' "$key_file")"',
  'BACKUP_SYNC_ABORT remote key must be 600',
  'require_private_key_file "$BACKUP_REMOTE_KEY"',
  'chmod 600 "$checksum"',
  'run_backup_checksum "$latest" > "$checksum"',
  'run_backup_checksum -c "$checksum"',
  'run_backup_scp "${scp_args[@]}" "$latest" "$checksum" "$BACKUP_REMOTE_TARGET/"',
].forEach((expected) => assertIncludes('scripts/sync-latest-backup.sh', syncScript, expected));

if (syncScript.includes('\nscp "${scp_args[@]}" "$latest" "$checksum"')) {
  throw new Error('scripts/sync-latest-backup.sh must not call raw scp.');
}

if (syncScript.includes('key_mode="$(stat -c \'%a\' "$key_file")"')) {
  throw new Error('scripts/sync-latest-backup.sh must not read remote key mode with raw stat.');
}

if (syncScript.indexOf('run_backup_checksum -c "$checksum"') > syncScript.indexOf('run_backup_scp "${scp_args[@]}" "$latest" "$checksum"')) {
  throw new Error('scripts/sync-latest-backup.sh must verify the checksum before uploading backup artifacts.');
}

assertRegex(
  'scripts/sync-latest-backup.sh',
  syncScript,
  /scp_args=\(-P "\$BACKUP_REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout="\$BACKUP_REMOTE_CONNECT_TIMEOUT" -o ServerAliveInterval="\$BACKUP_REMOTE_SERVER_ALIVE_INTERVAL" -o ServerAliveCountMax="\$BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX"\)/,
  'must run scp non-interactively with bounded SSH timeouts',
);

[
  'REMOTE_CONNECT_TIMEOUT="${DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT:-10}"',
  'REMOTE_SERVER_ALIVE_INTERVAL="${DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL:-15}"',
  'REMOTE_SERVER_ALIVE_COUNT_MAX="${DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX:-2}"',
  'REMOTE_SCP_TIMEOUT="${DISASTER_BACKUP_REMOTE_SCP_TIMEOUT:-60m}"',
  'DISASTER_BACKUP_FILE_READ_TIMEOUT="${DISASTER_BACKUP_FILE_READ_TIMEOUT:-10s}"',
  'run_disaster_scp()',
  'run_disaster_file_read()',
  'timeout "$REMOTE_SCP_TIMEOUT" scp "$@"',
  'timeout "$DISASTER_BACKUP_FILE_READ_TIMEOUT" "$@"',
  'require_private_key_file()',
  'key_mode="$(run_disaster_file_read stat -c \'%a\' "$key_file")"',
  'DISASTER_BACKUP_ABORT remote key must be 600',
  'require_private_key_file "$REMOTE_KEY"',
  'sha256sum -c "$archive.sha256"',
  'run_disaster_scp "${scp_args[@]}" "$archive" "$archive.sha256" "$REMOTE_TARGET/"',
].forEach((expected) => assertIncludes('scripts/disaster-backup.sh', disasterScript, expected));

if (disasterScript.includes('\n  scp "${scp_args[@]}" "$archive" "$archive.sha256"')) {
  throw new Error('scripts/disaster-backup.sh must not call raw scp.');
}

if (disasterScript.includes('key_mode="$(stat -c \'%a\' "$key_file")"')) {
  throw new Error('scripts/disaster-backup.sh must not read remote key mode with raw stat.');
}

if (disasterScript.indexOf('sha256sum -c "$archive.sha256"') > disasterScript.indexOf('run_disaster_scp "${scp_args[@]}" "$archive" "$archive.sha256"')) {
  throw new Error('scripts/disaster-backup.sh must verify the disaster archive checksum before uploading artifacts.');
}

assertRegex(
  'scripts/disaster-backup.sh',
  disasterScript,
  /scp_args=\(-P "\$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout="\$REMOTE_CONNECT_TIMEOUT" -o ServerAliveInterval="\$REMOTE_SERVER_ALIVE_INTERVAL" -o ServerAliveCountMax="\$REMOTE_SERVER_ALIVE_COUNT_MAX"\)/,
  'must run scp non-interactively with bounded SSH timeouts',
);

[
  'BACKUP_REMOTE_TARGET=',
  'BACKUP_REMOTE_CONNECT_TIMEOUT=10',
  'BACKUP_REMOTE_SERVER_ALIVE_INTERVAL=15',
  'BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX=2',
  'BACKUP_REMOTE_SCP_TIMEOUT=30m',
  'BACKUP_CHECKSUM_TIMEOUT=5m',
  'BACKUP_FILE_SCAN_TIMEOUT=30s',
  'BACKUP_FILE_READ_TIMEOUT=10s',
  'BACKUP_TEXT_FILTER_TIMEOUT=10s',
  'DISASTER_BACKUP_REMOTE_TARGET=',
  'DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT=10',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL=15',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX=2',
  'DISASTER_BACKUP_REMOTE_SCP_TIMEOUT=60m',
  'DISASTER_BACKUP_FILE_READ_TIMEOUT=10s',
].forEach((expected) => assertIncludes('scripts/install-ops-schedule.sh', scheduleInstaller, expected));

[
  'BACKUP_REMOTE_TARGET',
  'BACKUP_REMOTE_CONNECT_TIMEOUT',
  'BACKUP_REMOTE_SERVER_ALIVE_INTERVAL',
  'BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX',
  'BACKUP_REMOTE_SCP_TIMEOUT',
  'BACKUP_FILE_READ_TIMEOUT=10s',
  'DISASTER_BACKUP_REMOTE_TARGET',
  'DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX',
  'DISASTER_BACKUP_REMOTE_SCP_TIMEOUT',
  'DISASTER_BACKUP_FILE_READ_TIMEOUT=10s',
  'npm run ops:backup-sync',
  'npm run test:backup-offsite',
  'BACKUP_CHECKSUM_TIMEOUT=5m',
  'BACKUP_FILE_SCAN_TIMEOUT=30s',
  'BACKUP_TEXT_FILTER_TIMEOUT=10s',
  'sha256sum -c',
  'disaster archive sync verifies `sha256sum -c` before upload',
  'remote key must be mode `600`',
  'chmod 600 /root/.ssh/id_ed25519_backup',
].forEach((expected) => assertIncludes('docs/operations-backup-reinstall.md', backupRunbook, expected));

if (packageJson.scripts['test:backup-offsite'] !== 'node scripts/test-backup-offsite-contract.js') {
  throw new Error('package.json must expose test:backup-offsite');
}

assertIncludes(
  '.github/workflows/smarttour-ci.yml',
  ciWorkflow,
  'node scripts/test-backup-offsite-contract.js',
);

console.log('TEST_BACKUP_OFFSITE_CONTRACT_OK');
