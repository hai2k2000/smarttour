#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null

docker compose run --rm --entrypoint node api <<'NODE'
const { ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { AuthGuard } = require('./apps/api/dist/modules/auth/auth.guard');
const { PERMISSIONS_KEY, PUBLIC_ROUTE_KEY } = require('./apps/api/dist/modules/auth/permissions.decorator');
const { assertSecureRuntimeConfig, authEnforceEnabled, smartTourEnvironment } = require('./apps/api/dist/config/runtime-env');

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

async function run() {
  process.env.SMARTTOUR_ENV = 'development';
  delete process.env.SMARTTOUR_AUTH_ENFORCE;
  assert(smartTourEnvironment() === 'development', 'development env should resolve');
  assert(authEnforceEnabled() === false, 'development should not enforce by default');
  let missingTokenError;
  try {
    await new AuthGuard(reflector(), authService()).canActivate(context());
  } catch (error) {
    missingTokenError = error;
  }
  assert(missingTokenError instanceof UnauthorizedException, 'development private route without token should reject even when enforce is off');

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
