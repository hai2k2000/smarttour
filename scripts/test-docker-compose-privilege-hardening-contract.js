const fs = require('node:fs');

const compose = fs.readFileSync('docker-compose.yml', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ciWorkflow = fs.readFileSync('.github/workflows/smarttour-ci.yml', 'utf8');

const services = ['postgres', 'redis', 'minio', 'n8n', 'api', 'web', 'nginx'];
const capFreeServices = ['n8n', 'api', 'web'];

function composeServiceNames() {
  const header = compose.match(/^services:\r?\n/m);
  if (!header) throw new Error('docker-compose.yml must define services');
  const remainder = compose.slice(header.index + header[0].length);
  const nextTopLevelKey = remainder.search(/^[a-zA-Z0-9_-]+:\r?$/m);
  const serviceSection = nextTopLevelKey === -1 ? remainder : remainder.slice(0, nextTopLevelKey);
  return [...serviceSection.matchAll(/^  ([a-zA-Z0-9_-]+):\r?$/gm)].map((match) => match[1]);
}

function serviceBlock(service) {
  const pattern = new RegExp(
    `^  ${service}:\\r?\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:\\r?$|^volumes:\\r?$)`,
    'm',
  );
  const match = compose.match(pattern);
  if (!match) throw new Error(`docker-compose.yml must define ${service}`);
  return match[1];
}

function listValues(block, field) {
  const pattern = new RegExp(
    `^    ${field}:\\r?\\n((?:^      - .+\\r?\\n?)*)`,
    'm',
  );
  const match = block.match(pattern);
  if (!match) return [];
  return [...match[1].matchAll(/^      - (.+)\r?$/gm)].map((item) => item[1]);
}

function hasListField(block, field) {
  return new RegExp(`^    ${field}:`, 'm').test(block);
}

const actualServices = composeServiceNames();
const missingServices = services.filter((service) => !actualServices.includes(service));
const extraServices = actualServices.filter((service) => !services.includes(service));
if (
  actualServices.length !== services.length ||
  missingServices.length > 0 ||
  extraServices.length > 0
) {
  throw new Error(
    `docker-compose.yml services must exactly match the reviewed set ` +
      `(missing: ${missingServices.join(', ') || 'none'}; extra: ${extraServices.join(', ') || 'none'})`,
  );
}

for (const service of services) {
  const block = serviceBlock(service);
  const securityOpt = listValues(block, 'security_opt');
  const capDrop = listValues(block, 'cap_drop');
  const capAdd = listValues(block, 'cap_add');

  if (!securityOpt.includes('no-new-privileges:true')) {
    throw new Error(`${service} must set security_opt no-new-privileges:true`);
  }
  if (hasListField(block, 'cap_add') || capAdd.length > 0) {
    throw new Error(`${service} must not set cap_add`);
  }
  if (capFreeServices.includes(service)) {
    if (capDrop.length !== 1 || capDrop[0] !== 'ALL') {
      throw new Error(`${service} must set cap_drop exactly to ALL`);
    }
  } else if (hasListField(block, 'cap_drop') || capDrop.length > 0) {
    throw new Error(`${service} must not set cap_drop`);
  }
}

if (
  packageJson.scripts['test:docker-compose-privileges'] !==
  'node scripts/test-docker-compose-privilege-hardening-contract.js'
) {
  throw new Error('package.json must expose test:docker-compose-privileges');
}

if (!ciWorkflow.includes('node scripts/test-docker-compose-privilege-hardening-contract.js')) {
  throw new Error('SmartTour CI must run the Docker Compose privilege-hardening contract');
}

console.log('TEST_DOCKER_COMPOSE_PRIVILEGE_HARDENING_CONTRACT_OK');
