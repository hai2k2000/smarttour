#!/usr/bin/env node
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoDir = process.env.REPO_DIR || path.resolve(__dirname, '..');
const testDb = process.env.TEST_DB || 'smarttour_auth_login_security_test';
const postgresContainer = process.env.POSTGRES_CONTAINER || 'smarttour-postgres-1';
const postgresUser = process.env.POSTGRES_USER || 'smarttour';

function envValue(name) {
  const envPath = path.join(repoDir, '.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reverse().find((row) => row.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1) : '';
}

function assertFileIncludes(file, expected) {
  const content = fs.readFileSync(path.join(repoDir, file), 'utf8');
  if (!content.includes(expected)) throw new Error(`${file} must include ${expected}`);
}

assertFileIncludes('apps/api/src/modules/auth/auth.service.ts', "const realIp = this.headerValue(request?.headers?.['x-real-ip']);");
assertFileIncludes('apps/api/src/modules/auth/auth.service.ts', "return (realIp || request?.ip || 'unknown-ip').toLowerCase();");
assertFileIncludes('deploy/nginx/default.conf', 'proxy_set_header X-Forwarded-For $remote_addr;');

const postgresPassword = process.env.POSTGRES_PASSWORD || envValue('POSTGRES_PASSWORD');
if (!postgresPassword) {
  console.error('FAIL_AUTH_LOGIN_SECURITY_TEST missing POSTGRES_PASSWORD');
  process.exit(1);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: repoDir, stdio: options.stdio || 'inherit', ...options });
}

function cleanup() {
  try {
    run('docker', ['exec', postgresContainer, 'dropdb', '-U', postgresUser, '--if-exists', testDb], { stdio: 'ignore' });
  } catch {
    // best-effort cleanup for local contract database
  }
}

const nodeContract = String.raw`
const { UnauthorizedException } = require('@nestjs/common');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { AuthService } = require('./apps/api/dist/modules/auth/auth.service');
const { AuthSessionService } = require('./apps/api/dist/modules/auth/auth-session.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function errorFrom(action) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('expected action to reject');
}

function messageOf(error) {
  const message = error?.response?.message || error?.message;
  return Array.isArray(message) ? message.join('; ') : String(message || '');
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const auth = new AuthService(prisma, new AuthSessionService(prisma));
  const password = 'StartPass123';
  const request = { headers: { 'user-agent': 'auth-login-security-contract' }, ip: '10.42.0.10' };

  process.env.SMARTTOUR_ENV = 'production';
  process.env.SMARTTOUR_BOOTSTRAP_KEY = 'auth-login-security-bootstrap-key';
  const boot = await auth.bootstrap({
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin',
    password,
    bootstrapKey: 'auth-login-security-bootstrap-key',
  }, request);
  assert(boot.token, 'bootstrap should issue a session for setup');

  const missingUserError = await errorFrom(() => auth.login({ username: 'missing-user', password: 'WrongPass123' }, request));
  const wrongPasswordError = await errorFrom(() => auth.login({ username: 'admin', password: 'WrongPass123' }, request));

  assert(missingUserError instanceof UnauthorizedException, 'missing user login must be a sanitized 401');
  assert(wrongPasswordError instanceof UnauthorizedException, 'wrong password login must be a sanitized 401');
  assert(missingUserError.status === 401 && wrongPasswordError.status === 401, 'invalid credential responses must both use HTTP 401');
  assert(messageOf(missingUserError) === messageOf(wrongPasswordError), 'invalid credential responses must not reveal whether the account exists');
  assert(messageOf(missingUserError) === 'Thông tin đăng nhập không hợp lệ', 'invalid credential message must be generic');

  const throttledRequest = { headers: { 'user-agent': 'auth-login-security-contract' }, ip: '10.42.0.99' };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const error = await errorFrom(() => auth.login({ username: 'admin', password: 'WrongPass123' }, throttledRequest));
    assert(error instanceof UnauthorizedException, 'failed attempts before throttle should remain sanitized 401');
  }
  const throttled = await errorFrom(() => auth.login({ username: 'admin', password: 'WrongPass123' }, throttledRequest));
  assert(throttled.status === 429, 'repeated invalid login attempts must be throttled with HTTP 429');

  const otherIpLogin = await auth.login({ username: 'admin', password }, { ...throttledRequest, ip: '10.42.0.100' });
  assert(otherIpLogin.token, 'throttle key should include IP and not block a legitimate login from a different address');

  const spoofedForwardedForBaseRequest = {
    headers: { 'user-agent': 'auth-login-security-contract', 'x-real-ip': '10.42.0.110' },
    ip: '172.18.0.10',
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const requestWithSpoofedForwardedFor = {
      ...spoofedForwardedForBaseRequest,
      headers: {
        ...spoofedForwardedForBaseRequest.headers,
        'x-forwarded-for': '203.0.113.' + attempt,
      },
    };
    const error = await errorFrom(() => auth.login({ username: 'admin', password: 'WrongPass123' }, requestWithSpoofedForwardedFor));
    assert(error instanceof UnauthorizedException, 'spoofed X-Forwarded-For attempts before throttle should remain sanitized 401');
  }
  const spoofedForwardedForThrottled = await errorFrom(() => auth.login(
    { username: 'admin', password: 'WrongPass123' },
    {
      ...spoofedForwardedForBaseRequest,
      headers: {
        ...spoofedForwardedForBaseRequest.headers,
        'x-forwarded-for': '203.0.113.250',
      },
    },
  ));
  assert(spoofedForwardedForThrottled.status === 429, 'throttle must use trusted X-Real-IP instead of client-spoofed X-Forwarded-For');

  await prisma.$disconnect();
  console.log('TEST_AUTH_LOGIN_SECURITY_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

cleanup();
run('docker', ['compose', 'build', 'api']);
run('docker', ['exec', postgresContainer, 'createdb', '-U', postgresUser, testDb]);

try {
  const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@postgres:5432/${testDb}?schema=public`;
  const command = `cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node <<'NODE'\n${nodeContract}\nNODE`;
  const result = spawnSync('docker', ['compose', 'run', '--rm', '-v', `${repoDir}:/workspace:ro`, '-e', `DATABASE_URL=${databaseUrl}`, '--entrypoint', 'sh', 'api', '-lc', command], {
    cwd: repoDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
} finally {
  cleanup();
}
