const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function includes(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function excludes(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

const runbook = read('docs/rollback-runbook.md');
const packageJson = JSON.parse(read('package.json'));
const ci = read('.github/workflows/smarttour-ci.yml');

for (const text of [
  'BAD_COMMIT="$(git rev-parse --short HEAD)"',
  'GOOD_COMMIT=',
  'ROLLBACK_BRANCH=rollback/',
  'git switch -C "$ROLLBACK_BRANCH" "$GOOD_COMMIT"',
  'git push origin "$ROLLBACK_BRANCH"',
  'BRANCH="$ROLLBACK_BRANCH" scripts/deploy-production.sh',
  'DEPLOY_START',
  'DEPLOY_REVISION',
  'npx prisma migrate status',
  'npm audit --omit=dev',
  'scripts/healthcheck.sh',
  'scripts/security-audit.sh',
]) {
  includes(runbook, text, `Rollback runbook must document ${text}.`);
}

for (const unsafeText of [
  'scripts/deploy-preview.sh',
  'git checkout GOOD_COMMIT',
  'git pull --ff-only || true',
]) {
  excludes(runbook, unsafeText, `Rollback runbook must not recommend ${unsafeText}.`);
}

if (packageJson.scripts['test:rollback-runbook'] !== 'node scripts/test-rollback-runbook-contract.js') {
  throw new Error('package.json must expose test:rollback-runbook.');
}

includes(ci, 'node scripts/test-rollback-runbook-contract.js', 'SmartTour CI must run the rollback runbook contract.');

console.log('TEST_ROLLBACK_RUNBOOK_CONTRACT_OK');
