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
  'AUDIT_COMMAND_TIMEOUT="${AUDIT_COMMAND_TIMEOUT:-10s}"',
  'NPM_AUDIT_TIMEOUT="${NPM_AUDIT_TIMEOUT:-120s}"',
  'run_audit_command()',
  'timeout "$AUDIT_COMMAND_TIMEOUT" "$@"',
  'run_npm_audit()',
  'timeout "$NPM_AUDIT_TIMEOUT" npm audit --omit=dev',
  "env_file_mode=\"$(stat -c '%a %U:%G' .env)\"",
  'OK_ENV_FILE .env=600 root:root',
  'FAIL_ENV_FILE',
  "ops_env_mode=\"$(stat -c '%a %U:%G' /etc/default/smarttour-ops)\"",
  'OK_OPS_ENV_FILE /etc/default/smarttour-ops=600 root:root',
  'FAIL_OPS_ENV_FILE',
  "logrotate_conf_mode=\"$(stat -c '%a %U:%G' /etc/logrotate.d/smarttour",
  'OK_LOGROTATE /etc/logrotate.d/smarttour=644 root:root',
  'FAIL_LOGROTATE',
  "ops_log_dir_mode=\"$(stat -c '%a %U:%G' /var/log/smarttour)\"",
  "ops_security_log_dir_mode=\"$(stat -c '%a %U:%G' /var/log/smarttour/security)\"",
  'OK_OPS_LOG_PERMS /var/log/smarttour private',
  'FAIL_OPS_LOG_PERMS',
  'OK_OPS_SERVICE_UMASK SmartTour ops services UMask=0027',
  'FAIL_OPS_SERVICE_UMASK',
  'check_private_backup_artifacts()',
  'OK_BACKUP_PERMS $label artifacts private',
  'check_private_backup_artifacts postgres "$REPO_DIR/backups/postgres"',
  'check_private_backup_artifacts disaster /var/backups/smarttour/disaster',
  'FAIL_BACKUP_PERMS',
  'check_disaster_backup_staging_dirs()',
  "find /var/backups/smarttour/disaster -maxdepth 1 -type d -name 'smarttour-disaster-*'",
  'OK_DISASTER_STAGING no expanded disaster backup staging directories',
  'FAIL_DISASTER_STAGING',
  'if ! ports_output="$(run_audit_command docker ps --format',
  'FAIL_PORTS docker_unavailable',
  "root_mode=\"$(stat -c '%a %U:%G' /)\"",
  'OK_ROOT_MODE /=755 root:root',
  'FAIL_ROOT_MODE',
  "root_ssh_mode=\"$(stat -c '%a %U:%G' /root/.ssh)\"",
  "authorized_keys_mode=\"$(stat -c '%a %U:%G' /root/.ssh/authorized_keys)\"",
  'OK_SSH_PERMS /root/.ssh=700 root:root',
  'OK_SSH_PERMS authorized_keys=600 root:root',
  'FAIL_SSH_PERMS',
  'if ! sshd_effective="$(run_audit_command sshd -T 2>/dev/null)"; then',
  'FAIL_SSH sshd_config_unavailable',
  'run_audit_command systemctl show "$ops_service" -p UMask --value',
  'run_audit_command systemctl is-enabled smarttour-postgres-backup.timer',
  'run_audit_command systemctl is-enabled smarttour-healthcheck.timer',
  'run_audit_command systemctl is-enabled smarttour-nginx-host-report.timer',
  'run_audit_command systemctl is-enabled smarttour-disaster-backup.timer',
  'run_audit_command systemctl is-enabled smarttour-restore-drill.timer',
  'if ! run_npm_audit; then',
  'FAIL_NPM_AUDIT failed_or_timed_out',
].forEach((expected) => assertIncludes('scripts/security-audit.sh', securityAudit, expected));

[
  'if docker ps --format',
  'elif docker ps --format',
  'sshd_effective="$(sshd -T)"',
  'ops_service_umask="$(systemctl show "$ops_service"',
  'if systemctl is-enabled smarttour-postgres-backup.timer',
  '\nnpm audit --omit=dev\n',
].forEach((forbidden) => {
  if (securityAudit.includes(forbidden)) {
    throw new Error(`scripts/security-audit.sh must not include raw command: ${forbidden}`);
  }
});

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
  'OK_LOGROTATE',
  'OK_OPS_LOG_PERMS',
  'OK_OPS_SERVICE_UMASK',
  'OK_BACKUP_PERMS',
  'OK_DISASTER_STAGING',
  'AUDIT_COMMAND_TIMEOUT',
  'NPM_AUDIT_TIMEOUT',
  'OK_SSH_PERMS',
].forEach((expected) => assertIncludes('docs/security-hardening-runbook.md', securityRunbook, expected));

[
  'OK_ENV_FILE',
  'OK_OPS_ENV_FILE',
  'OK_LOGROTATE',
  'OK_OPS_LOG_PERMS',
  'OK_OPS_SERVICE_UMASK',
  'OK_BACKUP_PERMS',
  'OK_DISASTER_STAGING',
  'AUDIT_COMMAND_TIMEOUT',
  'NPM_AUDIT_TIMEOUT',
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
