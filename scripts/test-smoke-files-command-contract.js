const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(file, content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`${file} must include ${expected}`);
  }
}

const packageJson = JSON.parse(read('package.json'));
const ciWorkflow = read('.github/workflows/smarttour-ci.yml');
const readinessTracker = read('docs/production-readiness-tracker.md');

if (packageJson.scripts['smoke:files'] !== 'scripts/smoke-files.sh') {
  throw new Error('package.json must expose smoke:files as scripts/smoke-files.sh');
}

assertIncludes(
  'package.json smoke:all',
  packageJson.scripts['smoke:all'] || '',
  'npm run smoke:files',
);

if (packageJson.scripts['test:smoke-files-command'] !== 'node scripts/test-smoke-files-command-contract.js') {
  throw new Error('package.json must expose test:smoke-files-command');
}

assertIncludes(
  '.github/workflows/smarttour-ci.yml',
  ciWorkflow,
  'node scripts/test-smoke-files-command-contract.js',
);

assertIncludes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'npm run smoke:files',
);

assertIncludes(
  'docs/production-readiness-tracker.md',
  readinessTracker,
  'scripts/test-smoke-files-command-contract.js',
);

console.log('TEST_SMOKE_FILES_COMMAND_CONTRACT_OK');
