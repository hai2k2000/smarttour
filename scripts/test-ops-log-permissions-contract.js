const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

const installer = read('scripts/install-ops-schedule.sh');
const hostReport = read('scripts/nginx-host-report.sh');
const securityAudit = read('scripts/security-audit.sh');
const securityContract = read('scripts/test-security-audit-contract.js');
const readinessTracker = read('docs/production-readiness-tracker.md');
const backupRunbook = read('docs/operations-backup-reinstall.md');
const securityRunbook = read('docs/security-hardening-runbook.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');
const githubActionsContract = read('scripts/test-github-actions-contract.js');
const serviceUnits = [
  'smarttour-healthcheck.service',
  'smarttour-nginx-host-report.service',
  'smarttour-postgres-backup.service',
  'smarttour-disaster-backup.service',
  'smarttour-restore-drill.service',
];

for (const serviceUnit of serviceUnits) {
  includes(`deploy/systemd/${serviceUnit}`, read(`deploy/systemd/${serviceUnit}`), 'UMask=0027');
}

const serviceTimeouts = {
  'smarttour-healthcheck.service': 'TimeoutStartSec=2min',
  'smarttour-nginx-host-report.service': 'TimeoutStartSec=2min',
  'smarttour-postgres-backup.service': 'TimeoutStartSec=45min',
  'smarttour-disaster-backup.service': 'TimeoutStartSec=90min',
  'smarttour-restore-drill.service': 'TimeoutStartSec=45min',
};

for (const [serviceUnit, timeoutSetting] of Object.entries(serviceTimeouts)) {
  includes(`deploy/systemd/${serviceUnit}`, read(`deploy/systemd/${serviceUnit}`), timeoutSetting);
}

[
  'install -d -m 0750 /var/log/smarttour',
  'install -d -m 0750 /var/log/smarttour/security',
  'chown root:root /var/log/smarttour /var/log/smarttour/security',
  'OPS_FILE_SCAN_TIMEOUT="${OPS_FILE_SCAN_TIMEOUT:-30s}"',
  'run_ops_file_scan()',
  'timeout "$OPS_FILE_SCAN_TIMEOUT" find "$@"',
  'run_ops_file_scan /var/log/smarttour -maxdepth 1 -type f -name \'*.log\' -exec chown root:root {} +',
  'run_ops_file_scan /var/log/smarttour -maxdepth 1 -type f -name \'*.log\' -exec chmod 0640 {} +',
  'run_ops_file_scan /var/log/smarttour/security -maxdepth 1 -type f -name \'nginx-host-report-*.txt\' -exec chown root:root {} +',
  'run_ops_file_scan /var/log/smarttour/security -maxdepth 1 -type f -name \'nginx-host-report-*.txt\' -exec chmod 0640 {} +',
].forEach((expected) => includes('scripts/install-ops-schedule.sh', installer, expected));

[
  '\nfind /var/log/smarttour -maxdepth 1',
  '\nfind /var/log/smarttour/security -maxdepth 1',
].forEach((forbidden) => {
  if (installer.includes(forbidden)) {
    throw new Error(`scripts/install-ops-schedule.sh must not call raw ${forbidden.trim()}.`);
  }
});

[
  'HOST_REPORT_DOCKER_TIMEOUT="${HOST_REPORT_DOCKER_TIMEOUT:-10s}"',
  'HOST_REPORT_FILE_SCAN_TIMEOUT="${HOST_REPORT_FILE_SCAN_TIMEOUT:-30s}"',
  'HOST_REPORT_TEXT_TIMEOUT="${HOST_REPORT_TEXT_TIMEOUT:-10s}"',
  'run_host_report_docker()',
  'run_host_report_file_scan()',
  'run_host_report_text()',
  'timeout "$HOST_REPORT_DOCKER_TIMEOUT" docker "$@"',
  'timeout "$HOST_REPORT_FILE_SCAN_TIMEOUT" find "$@"',
  'timeout "$HOST_REPORT_TEXT_TIMEOUT" "$@"',
  'if ! raw_logs="$(run_host_report_docker logs --since "${REPORT_HOURS}h" "$NGINX_CONTAINER" 2>&1)"; then',
  'NGINX_HOST_REPORT_ABORT docker_logs_unavailable',
  'printf \'%s\\n\' "$raw_logs" | run_host_report_text grep -F \'|host=\' > "$tmp" || true',
  'run_host_report_text wc -l < "$tmp"',
  'run_host_report_text grep -Fv "|host=${OFFICIAL_HOST}|" "$tmp"',
  'run_host_report_text tail -20 || true',
  'install -d -m 0750 "$REPORT_DIR"',
  'chmod 0640 "$report"',
  'chmod 0640 "$latest"',
  'run_host_report_file_scan "$REPORT_DIR" -maxdepth 1 -type f -name \'nginx-host-report-*.txt\' -mtime "+$KEEP_DAYS" -delete',
].forEach((expected) => includes('scripts/nginx-host-report.sh', hostReport, expected));

if (hostReport.includes('\ndocker logs --since "${REPORT_HOURS}h" "$NGINX_CONTAINER"')) {
  throw new Error('scripts/nginx-host-report.sh must not call raw docker logs.');
}

if (hostReport.includes('\nfind "$REPORT_DIR" -maxdepth 1 -type f -name \'nginx-host-report-*.txt\' -mtime "+$KEEP_DAYS" -delete')) {
  throw new Error('scripts/nginx-host-report.sh must not call raw find for report retention cleanup.');
}

[
  '\n  grep -Fv "|host=${OFFICIAL_HOST}|" "$tmp"',
  '\n  grep -Fv "|host=${OFFICIAL_HOST}|" "$tmp" | tail -20',
].forEach((forbidden) => {
  if (hostReport.includes(forbidden)) {
    throw new Error(`scripts/nginx-host-report.sh must not call raw ${forbidden.trim()}.`);
  }
});

[
  "ops_log_dir_mode=\"$(run_audit_file_read stat -c '%a %U:%G' /var/log/smarttour)\"",
  "ops_security_log_dir_mode=\"$(run_audit_file_read stat -c '%a %U:%G' /var/log/smarttour/security)\"",
  "run_audit_file_scan /var/log/smarttour -maxdepth 1 -type f -name '*.log' -perm /037",
  "run_audit_file_scan /var/log/smarttour/security -maxdepth 1 -type f -name 'nginx-host-report-*.txt' -perm /037",
  'OK_OPS_LOG_PERMS /var/log/smarttour private',
  'FAIL_OPS_LOG_PERMS',
  'OK_OPS_SERVICE_UMASK SmartTour ops services UMask=0027',
  'FAIL_OPS_SERVICE_UMASK',
].forEach((expected) => includes('scripts/security-audit.sh', securityAudit, expected));

includes('scripts/test-security-audit-contract.js', securityContract, 'OK_OPS_LOG_PERMS');
includes('docs/production-readiness-tracker.md', readinessTracker, 'OK_OPS_LOG_PERMS');
includes('docs/production-readiness-tracker.md', readinessTracker, 'HOST_REPORT_DOCKER_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'HOST_REPORT_FILE_SCAN_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'HOST_REPORT_TEXT_TIMEOUT');
includes('docs/operations-backup-reinstall.md', backupRunbook, 'OK_OPS_LOG_PERMS');
includes('docs/security-hardening-runbook.md', securityRunbook, 'OK_OPS_LOG_PERMS');
includes('docs/security-hardening-runbook.md', securityRunbook, 'HOST_REPORT_DOCKER_TIMEOUT');
includes('docs/security-hardening-runbook.md', securityRunbook, 'HOST_REPORT_FILE_SCAN_TIMEOUT');
includes('docs/security-hardening-runbook.md', securityRunbook, 'HOST_REPORT_TEXT_TIMEOUT');
includes('scripts/install-ops-schedule.sh', installer, '# HOST_REPORT_DOCKER_TIMEOUT=10s');
includes('scripts/install-ops-schedule.sh', installer, '# HOST_REPORT_FILE_SCAN_TIMEOUT=30s');
includes('scripts/install-ops-schedule.sh', installer, '# HOST_REPORT_TEXT_TIMEOUT=10s');
includes('scripts/install-ops-schedule.sh', installer, '# OPS_FILE_SCAN_TIMEOUT=30s');

if (packageJson.scripts['test:ops-log-permissions'] !== 'node scripts/test-ops-log-permissions-contract.js') {
  throw new Error('package.json must expose test:ops-log-permissions');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-ops-log-permissions-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-ops-log-permissions-contract.js');

console.log('TEST_OPS_LOG_PERMISSIONS_CONTRACT_OK');
