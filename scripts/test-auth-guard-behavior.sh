#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null

docker compose run --rm --entrypoint node api <<'NODE'
const { ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { AuthGuard } = require('./apps/api/dist/modules/auth/auth.guard');
const { PERMISSIONS_KEY, PUBLIC_ROUTE_KEY } = require('./apps/api/dist/modules/auth/permissions.decorator');
const { assertSecureRuntimeConfig, authEnforceEnabled, configuredCorsOrigins, smartTourEnvironment } = require('./apps/api/dist/config/runtime-env');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function context(headers = {}) {
  const request = { headers };
  return { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => 'handler', getClass: () => 'class', request };
}

function reflector(metadata = {}) {
  return { getAllAndOverride: (key) => metadata[key] };
}

function authService(userPermissions = [], seenTokens = []) {
  return {
    async validateToken(token) {
      seenTokens.push(token);
      if (!token) throw new UnauthorizedException('missing token');
      return { user: { roles: [{ role: { permissions: userPermissions.map((permission) => ({ permission })) } }] } };
    },
    hasPermissions(user, required) {
      const permissions = new Set(user.roles.flatMap((role) => role.role.permissions.map((entry) => entry.permission)));
      return required.every((permission) => permissions.has(permission));
    },
  };
}

const corsOriginEnvNames = ['SMARTTOUR_CORS_ORIGINS', 'CORS_ORIGINS', 'NEXT_PUBLIC_API_URL', 'SMARTTOUR_WEB_URL', 'WEB_ORIGIN'];

function clearCorsOriginEnv() {
  for (const name of corsOriginEnvNames) delete process.env[name];
}

function expectRuntimeConfigReject(label) {
  let rejected = false;
  try {
    assertSecureRuntimeConfig();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

function expectRuntimeConfigPass(label) {
  let rejected = false;
  try {
    assertSecureRuntimeConfig();
  } catch {
    rejected = true;
  }
  assert(!rejected, label);
}

async function run() {
  process.env.SMARTTOUR_ENV = 'development';
  delete process.env.SMARTTOUR_AUTH_ENFORCE;
  assert(smartTourEnvironment() === 'development', 'development env should resolve');
  assert(authEnforceEnabled() === false, 'development should not enforce by default');
  let missingTokenError;
  const noTokenSeen = [];
  try {
    await new AuthGuard(reflector(), authService([], noTokenSeen)).canActivate(context());
  } catch (error) {
    missingTokenError = error;
  }
  assert(missingTokenError instanceof UnauthorizedException, 'development private route without token should reject even when enforce is off');
  assert(noTokenSeen.length === 0, 'guard should reject missing token before calling validateToken');

  process.env.SMARTTOUR_ENV = 'production';
  process.env.SMARTTOUR_AUTH_ENFORCE = 'true';
  assert(authEnforceEnabled() === true, 'production should enforce');
  let rejected = false;
  try {
    await new AuthGuard(reflector(), authService()).canActivate(context());
  } catch {
    rejected = true;
  }
  assert(rejected, 'production without token should reject');

  process.env.SMARTTOUR_AUTH_ENFORCE = 'false';
  rejected = false;
  try {
    assertSecureRuntimeConfig();
  } catch {
    rejected = true;
  }
  assert(rejected, 'production with enforce=false should fail config validation');

  rejected = false;
  try {
    await new AuthGuard(reflector(), authService()).canActivate(context());
  } catch {
    rejected = true;
  }
  assert(rejected, 'production guard should fail closed when enforce=false');

  process.env.SMARTTOUR_AUTH_ENFORCE = 'true';
  clearCorsOriginEnv();
  expectRuntimeConfigReject('production without a configured CORS origin should fail config validation');

  process.env.NEXT_PUBLIC_API_URL = 'https://api.smarttour.example';
  expectRuntimeConfigReject('production should not accept NEXT_PUBLIC_API_URL as browser CORS origin');
  delete process.env.NEXT_PUBLIC_API_URL;

  for (const [value, label] of [
    ['not a url', 'invalid URL syntax should fail config validation'],
    ['ftp://smarttour.example', 'unsupported CORS origin protocol should fail config validation'],
    ['https://user:pass@smarttour.example', 'CORS origin with credentials should fail config validation'],
    ['https://smarttour.example/api', 'CORS origin with path should fail config validation'],
    ['https://smarttour.example?api=1', 'CORS origin with query string should fail config validation'],
    ['https://smarttour.example#app', 'CORS origin with fragment should fail config validation'],
    ['*', 'wildcard CORS origin should fail production config validation'],
  ]) {
    clearCorsOriginEnv();
    process.env.WEB_ORIGIN = value;
    expectRuntimeConfigReject(label);
  }

  clearCorsOriginEnv();
  process.env.CORS_ORIGINS = 'https://smarttour.example/, http://localhost:3000';
  const origins = configuredCorsOrigins();
  assert(origins.length === 2 && origins[0] === 'https://smarttour.example' && origins[1] === 'http://localhost:3000', 'configuredCorsOrigins should normalize valid http/https origins');
  expectRuntimeConfigPass('production should accept explicit valid browser CORS origins');

  process.env.SMARTTOUR_ENV = 'staging';
  clearCorsOriginEnv();
  expectRuntimeConfigReject('staging without a configured CORS origin should fail config validation');

  process.env.WEB_ORIGIN = 'https://smarttour.example';
  expectRuntimeConfigPass('staging should accept explicit WEB_ORIGIN');
  process.env.SMARTTOUR_ENV = 'production';
  expectRuntimeConfigPass('production should accept explicit WEB_ORIGIN');

  let permissionError;
  try {
    await new AuthGuard(reflector({ [PERMISSIONS_KEY]: ['finance.receipt.approve'] }), authService(['finance.receipt.view'])).canActivate(context({ authorization: 'Bearer token' }));
  } catch (error) {
    permissionError = error;
  }
  assert(permissionError instanceof ForbiddenException, 'authenticated user missing permission should receive forbidden');

  const allowedContext = context({ cookie: 'smarttour.auth.token=token' });
  assert(await new AuthGuard(reflector({ [PERMISSIONS_KEY]: ['finance.receipt.approve'] }), authService(['finance.receipt.approve'])).canActivate(allowedContext) === true, 'matching permission should pass');
  assert(allowedContext.request.user, 'guard should attach user to request');

  const encodedCookieContext = context({ cookie: 'other=value; smarttour.auth.token=encoded%2Etoken' });
  assert(await new AuthGuard(reflector(), authService()).canActivate(encodedCookieContext) === true, 'encoded cookie token should pass');

  const seenTokens = [];
  await new AuthGuard(reflector(), authService([], seenTokens)).canActivate(context({ authorization: 'Bearer header.token', cookie: 'smarttour.auth.token=cookie.token' }));
  assert(seenTokens[0] === 'cookie.token', 'guard should use shared token extraction with cookie precedence over stale bearer');

  rejected = false;
  try {
    await new AuthGuard(reflector(), authService()).canActivate(context({ authorization: 'Bearer token extra' }));
  } catch {
    rejected = true;
  }
  assert(rejected, 'malformed bearer header should reject');

  assert(await new AuthGuard(reflector({ [PUBLIC_ROUTE_KEY]: true }), authService()).canActivate(context()) === true, 'public route should bypass auth');
  console.log('TEST_AUTH_GUARD_BEHAVIOR_OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
