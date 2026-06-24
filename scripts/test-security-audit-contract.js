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

const securityAudit = read('scripts/security-audit.sh');
const hardeningInstaller = read('scripts/install-security-hardening.sh');
const opsScheduleInstaller = read('scripts/install-ops-schedule.sh');
const securityRunbook = read('docs/security-hardening-runbook.md');
const readinessTracker = read('docs/production-readiness-tracker.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');

[
  "env_file_mode=\"$(stat -c '%a %U:%G' .env)\"",
  'OK_ENV_FILE .env=600 root:root',
  'FAIL_ENV_FILE',
  "ops_env_mode=\"$(stat -c '%a %U:%G' /etc/default/smarttour-ops)\"",
  'OK_OPS_ENV_FILE /etc/default/smarttour-ops=600 root:root',
  'FAIL_OPS_ENV_FILE',
  'check_private_backup_artifacts()',
  'OK_BACKUP_PERMS $label artifacts private',
  'check_private_backup_artifacts postgres "$REPO_DIR/backups/postgres"',
  'check_private_backup_artifacts disaster /var/backups/smarttour/disaster',
  'FAIL_BACKUP_PERMS',
  'check_disaster_backup_staging_dirs()',
  "find /var/backups/smarttour/disaster -maxdepth 1 -type d -name 'smarttour-disaster-*'",
  'OK_DISASTER_STAGING no expanded disaster backup staging directories',
  'FAIL_DISASTER_STAGING',
  "root_mode=\"$(stat -c '%a %U:%G' /)\"",
  'OK_ROOT_MODE /=755 root:root',
  'FAIL_ROOT_MODE',
  "root_ssh_mode=\"$(stat -c '%a %U:%G' /root/.ssh)\"",
  "authorized_keys_mode=\"$(stat -c '%a %U:%G' /root/.ssh/authorized_keys)\"",
  'OK_SSH_PERMS /root/.ssh=700 root:root',
  'OK_SSH_PERMS authorized_keys=600 root:root',
  'FAIL_SSH_PERMS',
].forEach((expected) => assertIncludes('scripts/security-audit.sh', securityAudit, expected));

assertRegex(
  'scripts/security-audit.sh',
  securityAudit,
  /if \[\[ "\$root_ssh_mode" == "700 root:root" \]\]/,
  'must require /root/.ssh to be 700 root:root',
);

assertRegex(
  'scripts/security-audit.sh',
  securityAudit,
  /if \[\[ "\$authorized_keys_mode" == "600 root:root" \]\]/,
  'must require authorized_keys to be 600 root:root',
);

[
  'chmod 600 "$OPS_ENV"',
  'chown root:root "$OPS_ENV"',
].forEach((expected) => assertIncludes('scripts/install-ops-schedule.sh', opsScheduleInstaller, expected));

[
  'chmod 600 "$REPO_DIR/.env"',
  'chmod 755 /',
  'chmod 700 /root/.ssh',
  'chmod 600 /root/.ssh/authorized_keys',
  'chown -R root:root /root/.ssh',
].forEach((expected) => assertIncludes('scripts/install-security-hardening.sh', hardeningInstaller, expected));

[
  'chmod 600 /opt/smarttour/.env',
  'chmod 755 /',
  'chmod 700 /root/.ssh',
  'chmod 600 /root/.ssh/authorized_keys',
  'chown -R root:root /root/.ssh',
  'npm run ops:security',
  'npm run test:security-audit',
  'OK_ENV_FILE',
  'OK_OPS_ENV_FILE',
  'OK_BACKUP_PERMS',
  'OK_DISASTER_STAGING',
  'OK_SSH_PERMS',
].forEach((expected) => assertIncludes('docs/security-hardening-runbook.md', securityRunbook, expected));

[
  'OK_ENV_FILE',
  'OK_OPS_ENV_FILE',
  'OK_BACKUP_PERMS',
  'OK_DISASTER_STAGING',
  'OK_ROOT_MODE',
  'OK_SSH_PERMS',
  'scripts/test-security-audit-contract.js',
].forEach((expected) => assertIncludes('docs/production-readiness-tracker.md', readinessTracker, expected));

if (packageJson.scripts['test:security-audit'] !== 'node scripts/test-security-audit-contract.js') {
  throw new Error('package.json must expose test:security-audit');
}

assertIncludes(
  '.github/workflows/smarttour-ci.yml',
  ciWorkflow,
  'node scripts/test-security-audit-contract.js',
);

console.log('TEST_SECURITY_AUDIT_CONTRACT_OK');
