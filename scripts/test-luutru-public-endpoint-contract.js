const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ciWorkflow = fs.readFileSync('.github/workflows/smarttour-ci.yml', 'utf8');
const nginxConfig = fs.readFileSync('deploy/nginx/default.conf', 'utf8');

function resolveCompose() {
  const output = execFileSync(
    'docker',
    ['compose', 'config', '--format', 'json', '--no-env-resolution', '--no-interpolate'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(output);
}

function assertExactValues(actual, expected, message) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${message}: expected ${sortedExpected.join(', ')}, received ${sortedActual.join(', ')}`);
  }
}

function main() {
  const compose = resolveCompose();
  const nginxNetworks = Object.keys(compose.services?.nginx?.networks ?? {});
  assertExactValues(
    nginxNetworks,
    ['default', 'luutru_frontend'],
    'SmartTour Nginx networks must match the reviewed public-edge set',
  );

  const apiAliases = compose.services?.api?.networks?.default?.aliases ?? [];
  const webAliases = compose.services?.web?.networks?.default?.aliases ?? [];
  if (!apiAliases.includes('smarttour-api')) {
    throw new Error('SmartTour API must expose the unique smarttour-api alias');
  }
  if (!webAliases.includes('smarttour-web')) {
    throw new Error('SmartTour web must expose the unique smarttour-web alias');
  }

  for (const [service, config] of Object.entries(compose.services ?? {})) {
    if (service === 'nginx') continue;
    const networks = Object.keys(config.networks ?? {});
    if (networks.includes('luutru_frontend')) {
      throw new Error(`Only Nginx may join luutru_frontend; found ${service}`);
    }
  }

  const publicNetwork = compose.networks?.luutru_frontend;
  if (!publicNetwork || publicNetwork.external !== true || publicNetwork.name !== 'luutru_frontend') {
    throw new Error('Compose must declare external network luutru_frontend by exact name');
  }

  const requiredFragments = [
    'server_name luutru.aitour.io.vn;',
    '/etc/letsencrypt/live/luutru.aitour.io.vn/fullchain.pem',
    '/etc/letsencrypt/live/luutru.aitour.io.vn/privkey.pem',
    'location = /api/v1/auth/login',
    'location = /api/openapi.json',
    'location = /api/docs',
    'resolver 127.0.0.11 valid=30s ipv6=off;',
    'set $luutru_gateway gateway:8080;',
    'proxy_pass http://$luutru_gateway;',
    'return 301 https://$host$request_uri;',
    'proxy_set_header X-Forwarded-Proto https;',
    'zone=luutru_login:10m rate=10r/m',
    'zone=luutru_api:10m rate=120r/m',
    'proxy_pass http://smarttour-api:4000/api/auth/login;',
    'proxy_pass http://smarttour-api:4000/api/;',
    'proxy_pass http://smarttour-web:3000;',
  ];
  for (const fragment of requiredFragments) {
    if (!nginxConfig.includes(fragment)) {
      throw new Error(`Nginx config is missing reviewed Luutru fragment: ${fragment}`);
    }
  }

  if (!/location = \/api\/openapi\.json\s*{\s*return 404;\s*}/m.test(nginxConfig)) {
    throw new Error('Public OpenAPI location must return 404');
  }
  if (!/location = \/api\/docs\s*{\s*return 404;\s*}/m.test(nginxConfig)) {
    throw new Error('Public API docs location must return 404');
  }

  const ambiguousSmartTourUpstreams = [
    'proxy_pass http://api:4000',
    'proxy_pass http://web:3000',
  ];
  for (const fragment of ambiguousSmartTourUpstreams) {
    if (nginxConfig.includes(fragment)) {
      throw new Error('Nginx config retains ambiguous SmartTour upstream: ' + fragment);
    }
  }

  const hostnameMatches = nginxConfig.match(/server_name luutru\.aitour\.io\.vn;/g) ?? [];
  if (hostnameMatches.length !== 2) {
    throw new Error('Nginx must define exactly one HTTP and one HTTPS Luutru vhost');
  }

  if (packageJson.scripts['test:luutru-public-endpoint'] !== 'node scripts/test-luutru-public-endpoint-contract.js') {
    throw new Error('package.json must expose test:luutru-public-endpoint');
  }
  if (!ciWorkflow.includes('node scripts/test-luutru-public-endpoint-contract.js')) {
    throw new Error('SmartTour CI must run the Luutru public-endpoint contract');
  }

  console.log('TEST_LUUTRU_PUBLIC_ENDPOINT_CONTRACT_OK');
}

if (require.main === module) {
  main();
}

module.exports = { assertExactValues };
