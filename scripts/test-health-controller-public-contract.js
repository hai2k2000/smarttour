const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'apps/api/src/health.controller.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes("import { Public } from './modules/auth/permissions.decorator';"), 'HealthController must import Public decorator');
assert(/@Public\(\)\s*@Get\(\)/.test(source), 'HealthController health route must be public for external monitoring');
assert(source.includes("return { ok: true, service: 'smarttour-api' };"), 'HealthController must keep response minimal');

console.log('TEST_HEALTH_CONTROLLER_PUBLIC_CONTRACT_OK');
