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
  'chmod 600 "$checksum"',
  'sha256sum -c "$checksum"',
].forEach((expected) => assertIncludes('scripts/sync-latest-backup.sh', syncScript, expected));

if (syncScript.indexOf('sha256sum -c "$checksum"') > syncScript.indexOf('scp "${scp_args[@]}" "$latest" "$checksum"')) {
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
].forEach((expected) => assertIncludes('scripts/disaster-backup.sh', disasterScript, expected));

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
  'DISASTER_BACKUP_REMOTE_TARGET=',
  'DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT=10',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL=15',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX=2',
].forEach((expected) => assertIncludes('scripts/install-ops-schedule.sh', scheduleInstaller, expected));

[
  'BACKUP_REMOTE_TARGET',
  'BACKUP_REMOTE_CONNECT_TIMEOUT',
  'BACKUP_REMOTE_SERVER_ALIVE_INTERVAL',
  'BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX',
  'DISASTER_BACKUP_REMOTE_TARGET',
  'DISASTER_BACKUP_REMOTE_CONNECT_TIMEOUT',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_INTERVAL',
  'DISASTER_BACKUP_REMOTE_SERVER_ALIVE_COUNT_MAX',
  'npm run ops:backup-sync',
  'npm run test:backup-offsite',
  'sha256sum -c',
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
