const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

function excludes(file, content, forbidden) {
  if (content.includes(forbidden)) {
    throw new Error(`${file} must not include ${forbidden}`);
  }
}

const healthcheck = read('scripts/healthcheck.sh');
const installer = read('scripts/install-ops-schedule.sh');
const runbook = read('docs/observability-alerting-runbook.md');
const readinessTracker = read('docs/production-readiness-tracker.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');
const githubActionsContract = read('scripts/test-github-actions-contract.js');

[
  'DOCKER_CHECK_TIMEOUT="${DOCKER_CHECK_TIMEOUT:-10s}"',
  'run_docker_check()',
  'timeout "$DOCKER_CHECK_TIMEOUT" "$@"',
  'run_docker_check docker inspect',
  'if ! raw_logs="$(run_docker_check docker logs --since "${LOG_WINDOW:-10m}" "$name" 2>&1)"; then',
  "printf '%s\\n' \"$raw_logs\"",
  'run_docker_check docker compose exec -T api printenv SMARTTOUR_AUTH_ENFORCE',
  'run_docker_check docker exec smarttour-postgres-1 pg_isready',
  'run_docker_check docker exec smarttour-redis-1 redis-cli ping',
  'ports_output="$(run_docker_check docker ps --format',
  'FAIL_PORTS docker_ps_unavailable',
  'FAIL_LOG api unavailable',
  'FAIL_LOG web unavailable',
].forEach((expected) => includes('scripts/healthcheck.sh', healthcheck, expected));

[
  'if docker inspect',
  '\n  docker logs --since',
  'if docker compose exec',
  '\ndocker exec smarttour-postgres-1 pg_isready',
  '\ndocker exec smarttour-redis-1 redis-cli ping',
  'if docker ps --format',
].forEach((forbidden) => excludes('scripts/healthcheck.sh', healthcheck, forbidden));

includes('scripts/install-ops-schedule.sh', installer, '# DOCKER_CHECK_TIMEOUT=10s');
includes('docs/observability-alerting-runbook.md', runbook, 'DOCKER_CHECK_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'DOCKER_CHECK_TIMEOUT');

if (packageJson.scripts['test:healthcheck-docker-timeout'] !== 'node scripts/test-healthcheck-docker-timeout-contract.js') {
  throw new Error('package.json must expose test:healthcheck-docker-timeout');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-healthcheck-docker-timeout-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-healthcheck-docker-timeout-contract.js');

console.log('TEST_HEALTHCHECK_DOCKER_TIMEOUT_CONTRACT_OK');
