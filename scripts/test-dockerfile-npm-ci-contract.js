const fs = require('fs');

const dockerfiles = ['apps/api/Dockerfile', 'apps/web/Dockerfile'];
const failures = [];

for (const file of dockerfiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/RUN\s+npm\s+ci\b/.test(text)) {
    failures.push(`${file} must use npm ci for reproducible dependency installs`);
  }
  if (/RUN\s+npm\s+install\b/.test(text)) {
    failures.push(`${file} must not use npm install in production Docker builds`);
  }
}

if (failures.length) {
  console.error('FAIL_DOCKERFILE_NPM_CI_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log('TEST_DOCKERFILE_NPM_CI_CONTRACT_OK');
