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
  'node scripts/test-orders-finance-backend-contract.js',
  'node scripts/test-orders-finance-client-contract.js',
  'node scripts/test-orders-hotel-service-selectors-backend-contract.js',
  'node scripts/test-orders-hotel-service-selectors-client-contract.js',
  'node scripts/test-orders-hotel-booking-documents-backend-contract.js',
  'node scripts/test-orders-hotel-booking-documents-client-contract.js',
  'node scripts/test-observability-alerting-contract.js',
  'node scripts/test-rollback-runbook-contract.js',
  'node scripts/test-restore-drill-safety-contract.js',
  'node scripts/test-backup-artifact-permissions-contract.js',
  'node scripts/test-healthcheck-http-timeout-contract.js',
  'node scripts/test-healthcheck-docker-timeout-contract.js',
  'node scripts/test-healthcheck-host-timeout-contract.js',
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
const smartlinkWrapper = read('scripts/smartlink-legacy-audit.sh');
includes(deployScript, 'validate_branch_name()', 'Server-side production deploy must validate BRANCH.');
includes(deployScript, 'DEPLOY_ABORT invalid branch name', 'Server-side production deploy must abort on invalid branch names.');
includes(deployScript, '[[ ! "$value" =~ ^[A-Za-z0-9._/-]+$ ]]', 'Server-side branch validation must reject unsafe git ref characters.');
includes(deployScript, '[[ "$value" == /* ]]', 'Server-side branch validation must reject absolute ref paths.');
includes(deployScript, '[[ "$value" == *..* ]]', 'Server-side branch validation must reject parent traversal.');
includes(deployScript, 'validate_branch_name "$BRANCH"', 'Server-side deploy must validate BRANCH before git fetch/checkout/pull.');
includes(deployScript, 'run_deploy_local_git ls-files --others --exclude-standard', 'Server-side production deploy must detect untracked files through bounded local Git.');
includes(deployScript, 'DEPLOY_ABORT untracked files exist', 'Server-side production deploy must abort when untracked files exist.');
includes(deployScript, 'printf \'%s\\n\' "$untracked_files"', 'Server-side production deploy must print untracked files before aborting.');
includes(deployScript, 'DEPLOY_DIRTY_REASON="${DEPLOY_DIRTY_REASON:-}"', 'Server-side deploy must define DEPLOY_DIRTY_REASON.');
includes(deployScript, 'DEPLOY_ABORT ALLOW_DIRTY requires DEPLOY_DIRTY_REASON', 'Server-side deploy must require a reason for dirty deploy override.');
includes(deployScript, 'DEPLOY_DIRTY_OVERRIDE reason=$DEPLOY_DIRTY_REASON', 'Server-side deploy must log the dirty deploy reason.');
includes(deployScript, 'DEPLOY_GIT_TIMEOUT="${DEPLOY_GIT_TIMEOUT:-5m}"', 'Server-side deploy must define Git sync timeout.');
includes(deployScript, 'DEPLOY_LOCAL_GIT_TIMEOUT="${DEPLOY_LOCAL_GIT_TIMEOUT:-30s}"', 'Server-side deploy must define local Git guard timeout.');
includes(deployScript, 'run_deploy_git()', 'Server-side deploy must wrap Git sync commands.');
includes(deployScript, 'run_deploy_local_git()', 'Server-side deploy must wrap local Git guard commands.');
includes(deployScript, 'timeout "$DEPLOY_GIT_TIMEOUT" git "$@"', 'Server-side deploy Git sync must be bounded.');
includes(deployScript, 'timeout "$DEPLOY_LOCAL_GIT_TIMEOUT" git "$@"', 'Server-side deploy local Git guard must be bounded.');
includes(deployScript, 'DEPLOY_START branch=$BRANCH current_commit=$starting_commit', 'Server-side deploy must log the starting branch and commit.');
includes(deployScript, 'DEPLOY_REVISION branch=$BRANCH previous_commit=$starting_commit target_commit=$target_commit', 'Server-side deploy must log the revision after git sync.');
includes(deployScript, 'run_deploy_local_git diff --quiet', 'Server-side deploy dirty worktree check must be bounded.');
includes(deployScript, 'run_deploy_local_git diff --cached --quiet', 'Server-side deploy staged-change check must be bounded.');
includes(deployScript, 'run_deploy_local_git status --short', 'Server-side deploy status output must be bounded.');
includes(deployScript, 'run_deploy_local_git rev-parse --short HEAD', 'Server-side deploy commit markers must be bounded.');
includes(deployScript, 'DEPLOY_PRISMA_MIGRATE_TIMEOUT="${DEPLOY_PRISMA_MIGRATE_TIMEOUT:-10m}"', 'Server-side deploy must define Prisma migration timeout.');
includes(deployScript, 'DEPLOY_SMARTLINK_GUARD_TIMEOUT="${DEPLOY_SMARTLINK_GUARD_TIMEOUT:-10m}"', 'Server-side deploy must define SmartLink guard phase timeout.');
includes(deployScript, 'DEPLOY_HEALTHCHECK_TIMEOUT="${DEPLOY_HEALTHCHECK_TIMEOUT:-5m}"', 'Server-side deploy must define healthcheck phase timeout.');
includes(deployScript, 'run_deploy_prisma()', 'Server-side deploy must wrap Prisma migration commands.');
includes(deployScript, 'run_deploy_smartlink_guard()', 'Server-side deploy must wrap SmartLink guard script.');
includes(deployScript, 'run_deploy_healthcheck()', 'Server-side deploy must wrap healthcheck script.');
includes(deployScript, 'timeout "$DEPLOY_PRISMA_MIGRATE_TIMEOUT" npx prisma "$@"', 'Server-side deploy Prisma migration must be bounded.');
includes(deployScript, 'timeout "$DEPLOY_SMARTLINK_GUARD_TIMEOUT" "$REPO_DIR/scripts/smartlink-legacy-audit.sh" "$@"', 'Server-side deploy SmartLink guard must be bounded.');
includes(deployScript, 'timeout "$DEPLOY_HEALTHCHECK_TIMEOUT" "$REPO_DIR/scripts/healthcheck.sh"', 'Server-side deploy healthcheck must be bounded.');
includes(deployScript, 'DEPLOY_DOCKER_BUILD_TIMEOUT="${DEPLOY_DOCKER_BUILD_TIMEOUT:-45m}"', 'Server-side deploy must define Docker build timeout.');
includes(deployScript, 'DEPLOY_DOCKER_UP_TIMEOUT="${DEPLOY_DOCKER_UP_TIMEOUT:-10m}"', 'Server-side deploy must define Docker up timeout.');
includes(deployScript, 'run_deploy_compose_build()', 'Server-side deploy must wrap Docker build commands.');
includes(deployScript, 'run_deploy_compose_up()', 'Server-side deploy must wrap Docker up commands.');
includes(deployScript, 'timeout "$DEPLOY_DOCKER_BUILD_TIMEOUT" docker compose "$@"', 'Server-side deploy Docker build must be bounded.');
includes(deployScript, 'timeout "$DEPLOY_DOCKER_UP_TIMEOUT" docker compose "$@"', 'Server-side deploy Docker up must be bounded.');
includes(deployScript, 'DEPLOY_PHASE smartlink_guard', 'Server-side deploy must log the SmartLink guard phase.');
includes(deployScript, 'run_deploy_smartlink_guard --mode=guard', 'Server-side deploy must run SmartLink guard through the bounded wrapper.');
includes(deployScript, 'DEPLOY_PHASE prisma_migrate_deploy', 'Server-side deploy must log the Prisma migration phase.');
includes(deployScript, 'run_deploy_prisma migrate deploy', 'Server-side deploy must run Prisma production migrations through the bounded wrapper.');
includes(deployScript, 'DEPLOY_PHASE docker_build', 'Server-side deploy must log the Docker build phase.');
includes(deployScript, 'run_deploy_compose_build build api web', 'Server-side deploy must build API/Web through the bounded Docker build wrapper.');
includes(deployScript, 'DEPLOY_PHASE docker_up', 'Server-side deploy must log the Docker up phase.');
includes(deployScript, 'run_deploy_compose_up up -d api web nginx', 'Server-side deploy must bring up services through the bounded Docker up wrapper.');
includes(deployScript, 'DEPLOY_PHASE healthcheck', 'Server-side deploy must log the healthcheck phase.');
includes(deployScript, 'run_deploy_healthcheck', 'Server-side deploy must run healthcheck through the bounded wrapper.');
excludes(deployScript, '\nnpx prisma migrate deploy', 'Server-side deploy must not call raw Prisma migrate deploy.');
excludes(deployScript, '\ndocker compose build api web', 'Server-side deploy must not call raw docker compose build.');
excludes(deployScript, '\ndocker compose up -d api web nginx', 'Server-side deploy must not call raw docker compose up.');
excludes(deployScript, '\ngit fetch origin "$BRANCH"', 'Server-side deploy must not call raw git fetch.');
excludes(deployScript, '\ngit checkout "$BRANCH"', 'Server-side deploy must not call raw git checkout.');
excludes(deployScript, '\ngit pull --ff-only origin "$BRANCH"', 'Server-side deploy must not call raw git pull.');
excludes(deployScript, '\nif [[ "$ALLOW_DIRTY" != "true" ]] && ! git diff --quiet', 'Server-side deploy must not call raw local git diff.');
excludes(deployScript, '\nif [[ "$ALLOW_DIRTY" != "true" ]] && ! git diff --cached --quiet', 'Server-side deploy must not call raw local cached git diff.');
excludes(deployScript, '\n  git status --short', 'Server-side deploy must not call raw local git status.');
excludes(deployScript, '\nuntracked_files="$(git ls-files --others --exclude-standard)"', 'Server-side deploy must not call raw local git ls-files.');
excludes(deployScript, '\n"$REPO_DIR/scripts/smartlink-legacy-audit.sh" --mode=guard', 'Server-side deploy must not call raw SmartLink guard script.');
excludes(deployScript, '\nSITE_URL="$SITE_URL" API_URL="$API_URL" "$REPO_DIR/scripts/healthcheck.sh"', 'Server-side deploy must not call raw healthcheck script.');
excludes(deployScript, '\nstarting_commit="$(git rev-parse --short HEAD)"', 'Server-side deploy must not call raw local git rev-parse for starting commit.');
excludes(deployScript, '\ntarget_commit="$(git rev-parse --short HEAD)"', 'Server-side deploy must not call raw local git rev-parse for target commit.');
excludes(deployScript, 'commit=$(git rev-parse --short HEAD)', 'Server-side deploy must not call raw local git rev-parse for final status.');
includes(smartlinkWrapper, 'SMARTLINK_AUDIT_DOCKER_TIMEOUT="${SMARTLINK_AUDIT_DOCKER_TIMEOUT:-10m}"', 'SmartLink wrapper must define Docker fallback timeout.');
includes(smartlinkWrapper, 'SMARTLINK_AUDIT_NODE_TIMEOUT="${SMARTLINK_AUDIT_NODE_TIMEOUT:-10m}"', 'SmartLink wrapper must define local Node audit timeout.');
includes(smartlinkWrapper, 'run_smartlink_node()', 'SmartLink wrapper must wrap local Node commands.');
includes(smartlinkWrapper, 'timeout "$SMARTLINK_AUDIT_NODE_TIMEOUT" node "$@"', 'SmartLink local Node path must be bounded.');
includes(smartlinkWrapper, 'run_smartlink_docker()', 'SmartLink wrapper must wrap Docker fallback commands.');
includes(smartlinkWrapper, 'timeout "$SMARTLINK_AUDIT_DOCKER_TIMEOUT" docker "$@"', 'SmartLink Docker fallback must be bounded.');
includes(smartlinkWrapper, 'NODE_PATH="${NODE_PATH:-$REPO_DIR/node_modules}" run_smartlink_node -e "require(\'@prisma/client\')"', 'SmartLink wrapper must check local Prisma client through the bounded Node wrapper.');
includes(smartlinkWrapper, 'run_smartlink_node scripts/smartlink-legacy-audit.js "$@"', 'SmartLink wrapper must run local audit through the bounded Node wrapper.');
excludes(smartlinkWrapper, '\n  exec node scripts/smartlink-legacy-audit.js "$@"', 'SmartLink wrapper must not exec raw local node audit.');
includes(smartlinkWrapper, 'run_smartlink_docker compose run --rm --no-deps', 'SmartLink wrapper must run Docker fallback through the bounded wrapper.');
excludes(smartlinkWrapper, '\ndocker compose run --rm --no-deps', 'SmartLink wrapper must not call raw docker compose run.');
const deployPhaseOrder = [
  'DEPLOY_START branch=$BRANCH current_commit=$starting_commit',
  'run_deploy_git fetch origin "$BRANCH"',
  'run_deploy_git checkout "$BRANCH"',
  'run_deploy_git pull --ff-only origin "$BRANCH"',
  'DEPLOY_REVISION branch=$BRANCH previous_commit=$starting_commit target_commit=$target_commit',
  'DEPLOY_PHASE smartlink_guard',
  '\nrun_deploy_smartlink_guard --mode=guard\n',
  'DEPLOY_PHASE prisma_migrate_deploy',
  'run_deploy_prisma migrate deploy',
  'DEPLOY_PHASE docker_build',
  'run_deploy_compose_build build api web',
  'DEPLOY_PHASE docker_up',
  'run_deploy_compose_up up -d api web nginx',
  'DEPLOY_PHASE healthcheck',
  '\nrun_deploy_healthcheck\n',
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
  'DEPLOY_GIT_TIMEOUT',
  'DEPLOY_LOCAL_GIT_TIMEOUT',
  'DEPLOY_REVISION',
  'Prisma migrations',
  'DEPLOY_PRISMA_MIGRATE_TIMEOUT',
  'DEPLOY_SMARTLINK_GUARD_TIMEOUT',
  'DEPLOY_HEALTHCHECK_TIMEOUT',
  'SMARTLINK_AUDIT_NODE_TIMEOUT',
  'SMARTLINK_AUDIT_DOCKER_TIMEOUT',
  'DEPLOY_DOCKER_BUILD_TIMEOUT',
  'DEPLOY_DOCKER_UP_TIMEOUT',
  'DEPLOY_PHASE smartlink_guard',
  'DEPLOY_PHASE docker_build',
  'DEPLOY_PHASE docker_up',
  'DEPLOY_PHASE healthcheck',
]) {
  includes(runbookText, text, `GitHub Actions runbook must document ${text}.`);
}

console.log('TEST_GITHUB_ACTIONS_CONTRACT_OK');
