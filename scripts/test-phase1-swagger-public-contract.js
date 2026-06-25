const fs = require('fs');
const assert = require('assert');

const main = fs.readFileSync('apps/api/src/main.ts', 'utf8');
const nginx = fs.readFileSync('deploy/nginx/default.conf', 'utf8');

assert(
  main.includes('SMARTTOUR_ENABLE_SWAGGER') && main.includes('enableSwagger'),
  'Swagger must be controlled by an explicit SMARTTOUR_ENABLE_SWAGGER gate',
);

const setupIndex = main.indexOf('SwaggerModule.setup');
assert(setupIndex !== -1, 'Swagger setup should still exist for explicitly enabled environments');
const guardIndex = main.lastIndexOf('if (enableSwagger)', setupIndex);
assert(guardIndex !== -1, 'SwaggerModule.setup must be inside an enableSwagger guard');

const docsBlock = nginx.match(/location\s+\/docs\s*\{[\s\S]*?\n\s*\}/);
assert(docsBlock, 'nginx must define an explicit /docs policy');
assert(
  /return\s+404\b/.test(docsBlock[0]) || /auth_basic\b/.test(docsBlock[0]) || /allow\s+/.test(docsBlock[0]),
  'nginx /docs must not proxy public Swagger without protection',
);

console.log('TEST_PHASE1_SWAGGER_PUBLIC_CONTRACT_OK');
