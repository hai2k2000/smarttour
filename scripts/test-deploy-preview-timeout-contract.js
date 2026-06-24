const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

const deployPreview = read('scripts/deploy-preview.sh');
const opsRunbook = read('docs/smarttour-ops-runbook.md');
const readinessTracker = read('docs/production-readiness-tracker.md');
const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');

for (const expected of [
  'PREVIEW_NPM_BUILD_TIMEOUT="${PREVIEW_NPM_BUILD_TIMEOUT:-20m}"',
  'PREVIEW_DOCKER_BUILD_TIMEOUT="${PREVIEW_DOCKER_BUILD_TIMEOUT:-30m}"',
  'PREVIEW_DOCKER_COMMAND_TIMEOUT="${PREVIEW_DOCKER_COMMAND_TIMEOUT:-5m}"',
  'run_preview_npm()',
  'run_preview_compose_build()',
  'run_preview_compose()',
  'run_preview_docker()',
  'timeout "$PREVIEW_NPM_BUILD_TIMEOUT" npm "$@"',
  'timeout "$PREVIEW_DOCKER_BUILD_TIMEOUT" docker compose "$@"',
  'timeout "$PREVIEW_DOCKER_COMMAND_TIMEOUT" docker compose "$@"',
  'timeout "$PREVIEW_DOCKER_COMMAND_TIMEOUT" docker "$@"',
  'run_preview_npm run build --workspace @smarttour/api',
  'run_preview_compose_build build api',
  'run_preview_docker rm -f smarttour-api-1',
  'run_preview_compose up -d api',
  'run_preview_npm run build --workspace @smarttour/web',
  'run_preview_compose_build build web',
  'run_preview_docker rm -f smarttour-web-preview',
  'run_preview_docker run -d',
]) {
  includes('scripts/deploy-preview.sh', deployPreview, expected);
}

for (const forbidden of [
  '\nnpm run build --workspace @smarttour/api',
  '\nnpm run build --workspace @smarttour/web',
  '\ndocker compose build api',
  '\ndocker compose build web',
  '\ndocker rm -f smarttour-api-1',
  '\ndocker rm -f smarttour-web-preview',
  '\ndocker compose up -d api',
  '\ndocker run -d',
]) {
  if (deployPreview.includes(forbidden)) {
    throw new Error(`scripts/deploy-preview.sh must not include raw command: ${forbidden.trim()}`);
  }
}

for (const expected of [
  'PREVIEW_NPM_BUILD_TIMEOUT',
  'PREVIEW_DOCKER_BUILD_TIMEOUT',
  'PREVIEW_DOCKER_COMMAND_TIMEOUT',
  'scripts/deploy-preview.sh',
]) {
  includes('docs/smarttour-ops-runbook.md', opsRunbook, expected);
  includes('docs/production-readiness-tracker.md', readinessTracker, expected);
}

if (packageJson.scripts['test:deploy-preview-timeout'] !== 'node scripts/test-deploy-preview-timeout-contract.js') {
  throw new Error('package.json must expose test:deploy-preview-timeout.');
}

includes(
  '.github/workflows/smarttour-ci.yml',
  ciWorkflow,
  'node scripts/test-deploy-preview-timeout-contract.js',
);

console.log('TEST_DEPLOY_PREVIEW_TIMEOUT_CONTRACT_OK');
