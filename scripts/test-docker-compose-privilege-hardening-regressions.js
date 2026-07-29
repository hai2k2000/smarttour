const fs = require('node:fs');
const {
  validatePrivilegePolicy,
} = require('./test-docker-compose-privilege-hardening-contract');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const ciWorkflow = fs.readFileSync('.github/workflows/smarttour-ci.yml', 'utf8');
const services = ['postgres', 'redis', 'minio', 'n8n', 'api', 'web', 'nginx'];
const capFreeServices = new Set(['n8n', 'api', 'web']);

function canonicalCompose() {
  return {
    services: Object.fromEntries(
      services.map((service) => [
        service,
        {
          security_opt: ['no-new-privileges:true'],
          cap_drop: capFreeServices.has(service) ? ['ALL'] : [],
          cap_add: [],
        },
      ]),
    ),
  };
}

validatePrivilegePolicy(canonicalCompose());

const explicitFalse = canonicalCompose();
for (const service of services) {
  explicitFalse.services[service].privileged = false;
}
validatePrivilegePolicy(explicitFalse);

for (const service of services) {
  for (const value of [true, 'true', 'false', null, 0]) {
    const composeModel = canonicalCompose();
    composeModel.services[service].privileged = value;

    let rejection;
    try {
      validatePrivilegePolicy(composeModel);
    } catch (error) {
      rejection = error;
    }

    if (!(rejection instanceof Error)) {
      throw new Error(`${service} privileged=${JSON.stringify(value)} must be rejected`);
    }
    if (!rejection.message.includes(service) || !rejection.message.includes('privileged')) {
      throw new Error(
        `${service} rejection must identify the privileged field: ${rejection.message}`,
      );
    }
  }
}

if (
  packageJson.scripts['test:docker-compose-privilege-regressions'] !==
  'node scripts/test-docker-compose-privilege-hardening-regressions.js'
) {
  throw new Error('package.json must expose test:docker-compose-privilege-regressions');
}
if (!ciWorkflow.includes('node scripts/test-docker-compose-privilege-hardening-regressions.js')) {
  throw new Error('SmartTour CI must run the Docker Compose privilege-hardening regressions');
}

console.log('TEST_DOCKER_COMPOSE_PRIVILEGE_HARDENING_REGRESSIONS_OK');
