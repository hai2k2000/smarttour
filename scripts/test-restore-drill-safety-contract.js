const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function includes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

function before(file, content, earlier, later) {
  const earlierIndex = content.indexOf(earlier);
  const laterIndex = content.indexOf(later);
  if (earlierIndex === -1 || laterIndex === -1 || earlierIndex > laterIndex) {
    throw new Error(`${file} must place ${earlier} before ${later}`);
  }
}

const restoreDrill = read('scripts/restore-drill-postgres.sh');
const packageJson = JSON.parse(read('package.json'));
const ci = read('.github/workflows/smarttour-ci.yml');
const backupRunbook = read('docs/operations-backup-reinstall.md');

for (const expected of [
  'PROTECTED_RESTORE_DRILL_DBS=(smarttour postgres template0 template1)',
  'validate_drill_db_name()',
  'RESTORE_DRILL_ABORT unsafe DRILL_DB',
  '[[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]',
  'validate_drill_db_name "$DRILL_DB"',
]) {
  includes('scripts/restore-drill-postgres.sh', restoreDrill, expected);
}

before(
  'scripts/restore-drill-postgres.sh',
  restoreDrill,
  'validate_drill_db_name "$DRILL_DB"',
  'docker exec "$POSTGRES_CONTAINER" dropdb',
);

for (const expected of [
  'DRILL_DB must be a throwaway database name',
  'Do not set `DRILL_DB` to `smarttour`, `postgres`, `template0`, or `template1`',
  'npm run test:restore-drill-safety',
]) {
  includes('docs/operations-backup-reinstall.md', backupRunbook, expected);
}

if (packageJson.scripts['test:restore-drill-safety'] !== 'node scripts/test-restore-drill-safety-contract.js') {
  throw new Error('package.json must expose test:restore-drill-safety.');
}

includes(
  '.github/workflows/smarttour-ci.yml',
  ci,
  'node scripts/test-restore-drill-safety-contract.js',
);

console.log('TEST_RESTORE_DRILL_SAFETY_CONTRACT_OK');
