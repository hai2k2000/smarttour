const fs = require('node:fs');

const compose = fs.readFileSync('docker-compose.yml', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ciWorkflow = fs.readFileSync('.github/workflows/smarttour-ci.yml', 'utf8');

const expected = {
  postgres: { mem_limit: '512m', cpus: '1.0', pids_limit: '256' },
  redis: { mem_limit: '128m', cpus: '0.25', pids_limit: '128' },
  minio: { mem_limit: '512m', cpus: '0.75', pids_limit: '256' },
  n8n: { mem_limit: '768m', cpus: '0.75', pids_limit: '256' },
  api: { mem_limit: '768m', cpus: '1.5', pids_limit: '256' },
  web: { mem_limit: '512m', cpus: '1.0', pids_limit: '256' },
  nginx: { mem_limit: '128m', cpus: '0.25', pids_limit: '128' },
};

function serviceBlock(service) {
  const pattern = new RegExp(
    `^  ${service}:\\r?\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:\\r?$|^volumes:\\r?$)`,
    'm',
  );
  const match = compose.match(pattern);
  if (!match) throw new Error(`docker-compose.yml must define ${service}`);
  return match[1];
}

for (const [service, limits] of Object.entries(expected)) {
  const block = serviceBlock(service);
  if (!/^    restart: unless-stopped\r?$/m.test(block)) {
    throw new Error(`${service} must use restart: unless-stopped`);
  }
  for (const [field, value] of Object.entries(limits)) {
    const pattern = new RegExp(`^    ${field}: ["']?${value}["']?\\r?$`, 'm');
    if (!pattern.test(block)) {
      throw new Error(`${service} must set ${field}: ${value}`);
    }
  }
}

if (
  packageJson.scripts['test:docker-compose-resources'] !==
  'node scripts/test-docker-compose-resource-limits-contract.js'
) {
  throw new Error('package.json must expose test:docker-compose-resources');
}

if (!ciWorkflow.includes('node scripts/test-docker-compose-resource-limits-contract.js')) {
  throw new Error('SmartTour CI must run the Docker Compose resource-limits contract');
}

console.log('TEST_DOCKER_COMPOSE_RESOURCE_LIMITS_CONTRACT_OK');
