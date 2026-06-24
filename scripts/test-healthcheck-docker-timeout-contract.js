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
  'HEALTHCHECK_TEXT_FILTER_TIMEOUT="${HEALTHCHECK_TEXT_FILTER_TIMEOUT:-10s}"',
  'run_docker_check()',
  'run_healthcheck_text_filter()',
  'timeout "$DOCKER_CHECK_TIMEOUT" "$@"',
  'timeout "$HEALTHCHECK_TEXT_FILTER_TIMEOUT" "$@"',
  'run_docker_check docker inspect',
  "run_healthcheck_text_filter grep -qx true",
  'if ! raw_logs="$(run_docker_check docker logs --since "${LOG_WINDOW:-10m}" "$name" 2>&1)"; then',
  "printf '%s\\n' \"$raw_logs\"",
  'run_healthcheck_text_filter grep -Ev "Content-Type doesn\'t match Reply body|ExceptionFilter for non-JSON responses"',
  'run_healthcheck_text_filter grep -Ev \'"event":"request_failed".*"statusCode":4[0-9][0-9]\'',
  'run_docker_check docker compose exec -T api printenv SMARTTOUR_AUTH_ENFORCE',
  'run_docker_check docker exec smarttour-postgres-1 pg_isready',
  'run_docker_check docker exec smarttour-redis-1 redis-cli ping',
  "run_healthcheck_text_filter grep -qx PONG",
  'ports_output="$(run_docker_check docker ps --format',
  "run_healthcheck_text_filter grep -E 'smarttour-(api-1|postgres-1|redis-1|minio-1|n8n-1).*0\\.0\\.0\\.0'",
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
includes('scripts/install-ops-schedule.sh', installer, '# HEALTHCHECK_TEXT_FILTER_TIMEOUT=10s');
includes('docs/observability-alerting-runbook.md', runbook, 'DOCKER_CHECK_TIMEOUT');
includes('docs/observability-alerting-runbook.md', runbook, 'HEALTHCHECK_TEXT_FILTER_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'DOCKER_CHECK_TIMEOUT');
includes('docs/production-readiness-tracker.md', readinessTracker, 'HEALTHCHECK_TEXT_FILTER_TIMEOUT');

if (packageJson.scripts['test:healthcheck-docker-timeout'] !== 'node scripts/test-healthcheck-docker-timeout-contract.js') {
  throw new Error('package.json must expose test:healthcheck-docker-timeout');
}

includes('.github/workflows/smarttour-ci.yml', ciWorkflow, 'node scripts/test-healthcheck-docker-timeout-contract.js');
includes('scripts/test-github-actions-contract.js', githubActionsContract, 'node scripts/test-healthcheck-docker-timeout-contract.js');

console.log('TEST_HEALTHCHECK_DOCKER_TIMEOUT_CONTRACT_OK');
