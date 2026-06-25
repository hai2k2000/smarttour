const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(file, content, expected) {
  if (!content.includes(expected)) throw new Error(`${file} must include ${expected}`);
}

function assertNotIncludes(file, content, forbidden) {
  if (content.includes(forbidden)) throw new Error(`${file} must not include dangerous ${forbidden}`);
}

function assertExecutable(relativePath) {
  const mode = fs.statSync(path.join(repoRoot, relativePath)).mode;
  if ((mode & 0o111) === 0) throw new Error(`${relativePath} must be executable`);
}

const maintenanceScript = read('scripts/docker-cache-maintenance.sh');
const installer = read('scripts/install-ops-schedule.sh');
const service = read('deploy/systemd/smarttour-docker-cache-maintenance.service');
const timer = read('deploy/systemd/smarttour-docker-cache-maintenance.timer');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');
const readinessTracker = read('docs/production-readiness-tracker.md');
const backupRunbook = read('docs/operations-backup-reinstall.md');

assertExecutable('scripts/docker-cache-maintenance.sh');

[
  'set -euo pipefail',
  'REPO_DIR="${REPO_DIR:-/opt/smarttour}"',
  'DOCKER_CACHE_BUILDER_UNTIL="${DOCKER_CACHE_BUILDER_UNTIL:-24h}"',
  'DOCKER_CACHE_IMAGE_UNTIL="${DOCKER_CACHE_IMAGE_UNTIL:-72h}"',
  'DOCKER_CACHE_DOCKER_TIMEOUT="${DOCKER_CACHE_DOCKER_TIMEOUT:-30m}"',
  'DOCKER_CACHE_HEALTHCHECK_TIMEOUT="${DOCKER_CACHE_HEALTHCHECK_TIMEOUT:-10m}"',
  'run_docker_cache_docker()',
  'run_docker_cache_healthcheck()',
  'timeout "$DOCKER_CACHE_DOCKER_TIMEOUT" docker "$@"',
  'run_docker_cache_docker system df',
  'run_docker_cache_docker builder prune -af --filter "until=$DOCKER_CACHE_BUILDER_UNTIL"',
  'run_docker_cache_docker image prune -af --filter "until=$DOCKER_CACHE_IMAGE_UNTIL"',
  'run_docker_cache_healthcheck scripts/healthcheck.sh',
  'DOCKER_CACHE_MAINTENANCE_OK',
].forEach((expected) => assertIncludes('scripts/docker-cache-maintenance.sh', maintenanceScript, expected));

[
  'docker system prune',
  '--volumes',
  'docker volume prune',
  'docker container prune',
  'docker compose down',
  'rm -rf /var/lib/docker',
].forEach((forbidden) => assertNotIncludes('scripts/docker-cache-maintenance.sh', maintenanceScript, forbidden));

[
  'Description=SmartTour Docker cache maintenance',
  'After=docker.service smarttour-healthcheck.service',
  'EnvironmentFile=-/etc/default/smarttour-ops',
  'WorkingDirectory=/opt/smarttour',
  'ExecStart=/opt/smarttour/scripts/docker-cache-maintenance.sh',
  'TimeoutStartSec=45min',
  'StandardOutput=append:/var/log/smarttour/docker-cache-maintenance.log',
  'StandardError=append:/var/log/smarttour/docker-cache-maintenance.log',
].forEach((expected) => assertIncludes('deploy/systemd/smarttour-docker-cache-maintenance.service', service, expected));

[
  'Description=Run SmartTour Docker cache maintenance daily',
  'OnCalendar=*-*-* 03:10:00',
  'RandomizedDelaySec=10min',
  'Persistent=true',
  'WantedBy=timers.target',
].forEach((expected) => assertIncludes('deploy/systemd/smarttour-docker-cache-maintenance.timer', timer, expected));

[
  '# Set this to bound Docker cache maintenance commands.',
  '# DOCKER_CACHE_DOCKER_TIMEOUT=30m',
  '# Set this to bound Docker cache post-cleanup healthcheck.',
  '# DOCKER_CACHE_HEALTHCHECK_TIMEOUT=10m',
  '# Set these to control Docker cache retention windows.',
  '# DOCKER_CACHE_BUILDER_UNTIL=24h',
  '# DOCKER_CACHE_IMAGE_UNTIL=72h',
  '"$REPO_DIR/scripts/docker-cache-maintenance.sh"',
  'smarttour-docker-cache-maintenance.timer',
].forEach((expected) => assertIncludes('scripts/install-ops-schedule.sh', installer, expected));

if (!installer.includes('smarttour-docker-cache-maintenance.timer')) {
  throw new Error('scripts/install-ops-schedule.sh must enable smarttour-docker-cache-maintenance.timer');
}

if (packageJson.scripts['test:docker-cache-maintenance'] !== 'node scripts/test-docker-cache-maintenance-contract.js') {
  throw new Error('package.json must expose test:docker-cache-maintenance');
}

assertIncludes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-docker-cache-maintenance-contract.js');
assertIncludes('docs/production-readiness-tracker.md', readinessTracker, 'smarttour-docker-cache-maintenance.timer');
assertIncludes('docs/operations-backup-reinstall.md', backupRunbook, 'scripts/docker-cache-maintenance.sh');

console.log('TEST_DOCKER_CACHE_MAINTENANCE_CONTRACT_OK');
