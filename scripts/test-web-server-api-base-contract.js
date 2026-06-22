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
const tourProgramsPage = read('apps/web/app/tour-programs/page.tsx');
const bookingsPage = read('apps/web/app/bookings/page.tsx');
const dockerCompose = read('docker-compose.yml');
const serverPagesWithApiFetches = [
  'apps/web/app/bookings/page.tsx',
  'apps/web/app/fit-tours/page.tsx',
  'apps/web/app/git-tours/page.tsx',
  'apps/web/app/landtours/page.tsx',
  'apps/web/app/operation-vouchers/page.tsx',
  'apps/web/app/order-center/page.tsx',
  'apps/web/app/orders/[type]/page.tsx',
  'apps/web/app/quotations/page.tsx',
  'apps/web/app/quotes/combos/page.tsx',
  'apps/web/app/quotes/tours/page.tsx',
  'apps/web/app/reports/page.tsx',
  'apps/web/app/suppliers/[type]/page.tsx',
  'apps/web/app/suppliers/hotels/page.tsx',
  'apps/web/app/suppliers/page.tsx',
  'apps/web/app/tour-guides/page.tsx',
  'apps/web/app/tour-programs/page.tsx',
];

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
for (const [label, source] of [
  ['tour-programs page', tourProgramsPage],
  ['bookings page', bookingsPage],
]) {
  assert(source.includes('const apiBase = serverApiBase();'), `${label} must use serverApiBase() for SSR requests and mutations`);
  assert(!source.includes("NEXT_PUBLIC_API_URL || 'http://localhost:4000'"), `${label} must not fall back to localhost for SSR API calls`);
}
for (const relativePath of serverPagesWithApiFetches) {
  const source = read(relativePath);
  assert(source.includes('serverApiBase'), `${relativePath} must import or define serverApiBase for SSR API calls`);
  assert(source.includes('const apiBase = serverApiBase();'), `${relativePath} must call serverApiBase() for SSR API calls`);
  assert(!source.includes('process.env.NEXT_PUBLIC_API_URL'), `${relativePath} must not read NEXT_PUBLIC_API_URL directly in SSR code`);
  assert(!source.includes("NEXT_PUBLIC_API_URL || ''"), `${relativePath} must not use empty public API fallback in SSR code`);
}
assert(
  dockerCompose.includes('SMARTTOUR_SERVER_API_URL: ${SMARTTOUR_SERVER_API_URL:-http://api:4000}'),
  'docker-compose web service must provide internal API URL at runtime',
);

console.log('TEST_WEB_SERVER_API_BASE_CONTRACT_OK');
