const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function excludes(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

function exists(file, message) {
  if (!fs.existsSync(file)) throw new Error(message);
}

const ciWorkflow = '.github/workflows/smarttour-ci.yml';
const deployWorkflow = '.github/workflows/deploy-production.yml';
const runbook = 'docs/github-actions-runbook.md';
exists(ciWorkflow, 'SmartTour CI workflow must exist.');
exists(deployWorkflow, 'Manual production deploy workflow must exist.');
exists(runbook, 'GitHub Actions runbook must document CI and deploy setup.');

const ci = read(ciWorkflow);
includes(ci, 'name: SmartTour CI', 'CI workflow must have a stable name.');
includes(ci, 'pull_request:', 'CI workflow must run for pull requests.');
includes(ci, 'push:', 'CI workflow must run for pushes.');
includes(ci, 'actions/checkout', 'CI workflow must checkout the repository.');
includes(ci, 'actions/setup-node', 'CI workflow must setup Node.');
includes(ci, 'node-version: 22', 'CI workflow must use Node 22 to match Docker/runtime.');
includes(ci, 'npm ci', 'CI workflow must install from the lockfile.');
includes(ci, 'npm audit --omit=dev', 'CI workflow must run production dependency audit.');
includes(ci, 'npx prisma generate', 'CI workflow must generate Prisma client before builds/contracts.');
for (const command of [
  'node scripts/test-github-actions-contract.js',
  'node scripts/test-dockerfile-npm-ci-contract.js',
  'node scripts/test-native-xlsx-export-contract.js',
  'node scripts/test-finance-xlsx-contract.js',
  'node scripts/test-query-dto-contract.js',
  'node scripts/test-observability-alerting-contract.js',
  'node scripts/test-rollback-runbook-contract.js',
  'node scripts/test-restore-drill-safety-contract.js',
  'node scripts/test-backup-artifact-permissions-contract.js',
  'node scripts/test-healthcheck-http-timeout-contract.js',
  'node scripts/test-healthcheck-docker-timeout-contract.js',
  'node scripts/test-healthcheck-systemd-timeout-contract.js',
  'node scripts/test-ops-logrotate-contract.js',
  'node scripts/test-ops-log-permissions-contract.js',
  'node scripts/test-ops-install-systemd-timeout-contract.js',
  'npm run lint --workspace @smarttour/api',
  'npm run lint --workspace @smarttour/web',
  'docker compose build api web',
]) {
  includes(ci, command, `CI workflow must run ${command}.`);
}
includes(ci, 'NEXT_PUBLIC_API_URL=https://aitour.io.vn', 'CI workflow must provide a deterministic public API URL for web builds.');
includes(ci, 'POSTGRES_PASSWORD=', 'CI workflow must create a non-secret local .env for Compose builds.');
excludes(ci, 'ALLOW_DIRTY=true', 'CI workflow must not allow dirty deploy/build shortcuts.');
excludes(ci, 'deploy-production.sh', 'CI workflow must not deploy production automatically.');

const deploy = read(deployWorkflow);
includes(deploy, 'name: SmartTour Production Deploy', 'Deploy workflow must have a stable name.');
includes(deploy, 'workflow_dispatch:', 'Production deploy must be manually dispatched.');
excludes(deploy, 'pull_request:', 'Production deploy must not run on pull requests.');
excludes(deploy, 'push:', 'Production deploy must not run on push.');
for (const secret of ['SMARTTOUR_SSH_HOST', 'SMARTTOUR_SSH_PORT', 'SMARTTOUR_SSH_USER', 'SMARTTOUR_SSH_KEY']) {
  includes(deploy, `secrets.${secret}`, `Deploy workflow must require ${secret}.`);
}
includes(deploy, 'ssh-keyscan', 'Deploy workflow must populate known_hosts before SSH.');
includes(deploy, 'ssh-keyscan -T 10', 'Deploy workflow must bound ssh-keyscan connection time.');
includes(deploy, 'scripts/deploy-production.sh', 'Deploy workflow must call the server-side production deploy script.');
includes(deploy, 'BRANCH=', 'Deploy workflow must pass an explicit branch to the deploy script.');
includes(deploy, 'name: Validate dispatch inputs', 'Deploy workflow must validate manual dispatch inputs before SSH.');
for (const validation of [
  '[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]]',
  '[[ "$BRANCH" != /* ]]',
  '[[ "$BRANCH" != *..* ]]',
  '[[ "$REPO_DIR" == /* ]]',
  '[[ "$REPO_DIR" =~ ^[A-Za-z0-9._/-]+$ ]]',
  '[[ "$SITE_URL" =~ ^https://[A-Za-z0-9._~:/?#\\[\\]@!$&()*+,;=%-]+$ ]]',
  '[[ "$API_URL" =~ ^https://[A-Za-z0-9._~:/?#\\[\\]@!$&()*+,;=%-]+$ ]]',
]) {
  includes(deploy, validation, `Deploy workflow must validate input with ${validation}.`);
}
for (const option of [
  '-o BatchMode=yes',
  '-o ConnectTimeout=10',
  '-o ServerAliveInterval=15',
  '-o ServerAliveCountMax=2',
]) {
  includes(deploy, option, `Deploy workflow SSH command must include ${option}.`);
}
excludes(deploy, 'ALLOW_DIRTY=true', 'Deploy workflow must not allow dirty production deploys.');

const deployScript = read('scripts/deploy-production.sh');
includes(deployScript, 'validate_branch_name()', 'Server-side production deploy must validate BRANCH.');
includes(deployScript, 'DEPLOY_ABORT invalid branch name', 'Server-side production deploy must abort on invalid branch names.');
includes(deployScript, '[[ ! "$value" =~ ^[A-Za-z0-9._/-]+$ ]]', 'Server-side branch validation must reject unsafe git ref characters.');
includes(deployScript, '[[ "$value" == /* ]]', 'Server-side branch validation must reject absolute ref paths.');
includes(deployScript, '[[ "$value" == *..* ]]', 'Server-side branch validation must reject parent traversal.');
includes(deployScript, 'validate_branch_name "$BRANCH"', 'Server-side deploy must validate BRANCH before git fetch/checkout/pull.');
includes(deployScript, 'git ls-files --others --exclude-standard', 'Server-side production deploy must detect untracked files.');
includes(deployScript, 'DEPLOY_ABORT untracked files exist', 'Server-side production deploy must abort when untracked files exist.');
includes(deployScript, 'printf \'%s\\n\' "$untracked_files"', 'Server-side production deploy must print untracked files before aborting.');
includes(deployScript, 'DEPLOY_DIRTY_REASON="${DEPLOY_DIRTY_REASON:-}"', 'Server-side deploy must define DEPLOY_DIRTY_REASON.');
includes(deployScript, 'DEPLOY_ABORT ALLOW_DIRTY requires DEPLOY_DIRTY_REASON', 'Server-side deploy must require a reason for dirty deploy override.');
includes(deployScript, 'DEPLOY_DIRTY_OVERRIDE reason=$DEPLOY_DIRTY_REASON', 'Server-side deploy must log the dirty deploy reason.');
includes(deployScript, 'DEPLOY_START branch=$BRANCH current_commit=$starting_commit', 'Server-side deploy must log the starting branch and commit.');
includes(deployScript, 'DEPLOY_REVISION branch=$BRANCH previous_commit=$starting_commit target_commit=$target_commit', 'Server-side deploy must log the revision after git sync.');
includes(deployScript, 'DEPLOY_PHASE smartlink_guard', 'Server-side deploy must log the SmartLink guard phase.');
includes(deployScript, 'DEPLOY_PHASE prisma_migrate_deploy', 'Server-side deploy must log the Prisma migration phase.');
includes(deployScript, 'npx prisma migrate deploy', 'Server-side deploy must run Prisma production migrations.');
includes(deployScript, 'DEPLOY_PHASE docker_build', 'Server-side deploy must log the Docker build phase.');
includes(deployScript, 'DEPLOY_PHASE docker_up', 'Server-side deploy must log the Docker up phase.');
includes(deployScript, 'DEPLOY_PHASE healthcheck', 'Server-side deploy must log the healthcheck phase.');
const deployPhaseOrder = [
  'DEPLOY_START branch=$BRANCH current_commit=$starting_commit',
  'git fetch origin "$BRANCH"',
  'DEPLOY_REVISION branch=$BRANCH previous_commit=$starting_commit target_commit=$target_commit',
  'DEPLOY_PHASE smartlink_guard',
  'smartlink-legacy-audit.sh" --mode=guard',
  'DEPLOY_PHASE prisma_migrate_deploy',
  'npx prisma migrate deploy',
  'DEPLOY_PHASE docker_build',
  'docker compose build api web',
  'DEPLOY_PHASE docker_up',
  'docker compose up -d api web nginx',
  'DEPLOY_PHASE healthcheck',
  'scripts/healthcheck.sh',
  'DEPLOY_PRODUCTION_OK',
];
for (let index = 1; index < deployPhaseOrder.length; index += 1) {
  const previous = deployPhaseOrder[index - 1];
  const current = deployPhaseOrder[index];
  if (deployScript.indexOf(previous) > deployScript.indexOf(current)) {
    throw new Error(`Server-side deploy must run ${previous} before ${current}.`);
  }
}


const runbookText = read(runbook);
for (const text of [
  'SmartTour CI',
  'SmartTour Production Deploy',
  'SMARTTOUR_SSH_HOST',
  'SMARTTOUR_SSH_PORT',
  'SMARTTOUR_SSH_USER',
  'SMARTTOUR_SSH_KEY',
  'workflow_dispatch',
  'scripts/deploy-production.sh',
  'BatchMode=yes',
  'ConnectTimeout=10',
  'ServerAliveInterval=15',
  'ServerAliveCountMax=2',
  'manual dispatch inputs are validated',
  'Branch names may',
  'contain only letters, numbers, dot, underscore, slash, and hyphen',
  'URLs must start',
  'with `https://`',
  'untracked files',
  'ALLOW_DIRTY=true',
  'DEPLOY_DIRTY_REASON',
  'DEPLOY_START',
  'DEPLOY_REVISION',
  'Prisma migrations',
  'npx prisma migrate deploy',
  'DEPLOY_PHASE smartlink_guard',
  'DEPLOY_PHASE docker_build',
  'DEPLOY_PHASE docker_up',
  'DEPLOY_PHASE healthcheck',
]) {
  includes(runbookText, text, `GitHub Actions runbook must document ${text}.`);
}

console.log('TEST_GITHUB_ACTIONS_CONTRACT_OK');
