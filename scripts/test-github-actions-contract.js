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
for (const option of [
  '-o BatchMode=yes',
  '-o ConnectTimeout=10',
  '-o ServerAliveInterval=15',
  '-o ServerAliveCountMax=2',
]) {
  includes(deploy, option, `Deploy workflow SSH command must include ${option}.`);
}
excludes(deploy, 'ALLOW_DIRTY=true', 'Deploy workflow must not allow dirty production deploys.');


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
]) {
  includes(runbookText, text, `GitHub Actions runbook must document ${text}.`);
}

console.log('TEST_GITHUB_ACTIONS_CONTRACT_OK');
