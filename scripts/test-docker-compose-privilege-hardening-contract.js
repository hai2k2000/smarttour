const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ciWorkflow = fs.readFileSync('.github/workflows/smarttour-ci.yml', 'utf8');

const services = ['postgres', 'redis', 'minio', 'n8n', 'api', 'web', 'nginx'];
const capFreeServices = ['n8n', 'api', 'web'];

function resolveCompose() {
  try {
    const canonicalJson = execFileSync(
      'docker',
      ['compose', 'config', '--format', 'json', '--no-env-resolution', '--no-interpolate'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(canonicalJson);
  } catch (error) {
    const commandMessage =
      error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : 'unknown command failure';
    throw new Error(`canonical Compose config could not be resolved: ${commandMessage}`);
  }
}

function validatePrivilegePolicy(resolvedCompose) {
  if (
    !resolvedCompose.services ||
    typeof resolvedCompose.services !== 'object' ||
    Array.isArray(resolvedCompose.services)
  ) {
    throw new Error('canonical Compose config must define services');
  }

  const actualServices = Object.keys(resolvedCompose.services);
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
    const serviceConfig = resolvedCompose.services[service];
    const securityOpt = serviceConfig.security_opt ?? [];
    const capDrop = serviceConfig.cap_drop ?? [];
    const capAdd = serviceConfig.cap_add ?? [];

    if (serviceConfig.privileged === true) {
      throw new Error(`${service} must not set privileged:true`);
    }
    if (!Array.isArray(securityOpt) || !securityOpt.includes('no-new-privileges:true')) {
      throw new Error(`${service} must set security_opt no-new-privileges:true`);
    }
    if (!Array.isArray(capAdd) || capAdd.length > 0) {
      throw new Error(`${service} must not set cap_add`);
    }
    if (capFreeServices.includes(service)) {
      if (!Array.isArray(capDrop) || capDrop.length !== 1 || capDrop[0] !== 'ALL') {
        throw new Error(`${service} must set cap_drop exactly to ALL`);
      }
    } else if (!Array.isArray(capDrop) || capDrop.length > 0) {
      throw new Error(`${service} must not set cap_drop`);
    }
  }
}

function main() {
  validatePrivilegePolicy(resolveCompose());

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
}

if (require.main === module) {
  main();
}

module.exports = { validatePrivilegePolicy };
