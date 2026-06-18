const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`TEST_WEB_SERVER_API_BASE_CONTRACT_FAIL ${message}`);
    process.exit(1);
  }
}

const workspaceData = read('apps/web/app/workspace/workspace-data.ts');
const proxy = read('apps/web/proxy.ts');
const dockerCompose = read('docker-compose.yml');

for (const [label, source] of [
  ['workspace-data', workspaceData],
  ['proxy', proxy],
]) {
  assert(source.includes('SMARTTOUR_SERVER_API_URL'), `${label} must support a private server API URL override`);
  assert(source.includes('http://api:4000'), `${label} must use Docker internal API in production`);
  assert(source.includes('NODE_ENV') && source.includes('production'), `${label} must only default to internal API in production`);
}

assert(
  workspaceData.includes('const apiBase = serverApiBase();'),
  'workspace-data must use serverApiBase() for SSR data fetching',
);
assert(
  !workspaceData.includes("const apiBase = (process.env.NEXT_PUBLIC_API_URL || '')"),
  'workspace-data must not call public NEXT_PUBLIC_API_URL directly from SSR',
);
assert(
  proxy.includes('const apiBaseUrl = serverApiBase(request);'),
  'proxy must validate sessions through serverApiBase()',
);
assert(
  !proxy.includes('const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL'),
  'proxy must not validate sessions through public NEXT_PUBLIC_API_URL directly',
);
assert(
  dockerCompose.includes('SMARTTOUR_SERVER_API_URL: ${SMARTTOUR_SERVER_API_URL:-http://api:4000}'),
  'docker-compose web service must provide internal API URL at runtime',
);

console.log('TEST_WEB_SERVER_API_BASE_CONTRACT_OK');
