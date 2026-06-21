#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null
docker compose run --rm --entrypoint node api <<'NODE'
const { AuthController } = require('./apps/api/dist/modules/auth/auth.controller');
const { AUTH_TOKEN_COOKIE, bearerToken, cookieToken, tokenFromHeaders } = require('./apps/api/dist/modules/auth/auth-token');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function responseRecorder() {
  return {
    cookies: [],
    cleared: [],
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
    },
  };
}

function assertAuthCookie(record, value, label) {
  assert(record?.name === AUTH_TOKEN_COOKIE, `${label}: cookie name should match auth token cookie`);
  assert(record.value === value, `${label}: cookie value should be session token`);
  assert(record.options?.httpOnly === true, `${label}: cookie should be HttpOnly`);
  assert(record.options?.sameSite === 'lax', `${label}: cookie should use SameSite=Lax`);
  assert(record.options?.path === '/', `${label}: cookie should be rooted at /`);
  assert(record.options?.expires instanceof Date && Number.isFinite(record.options.expires.getTime()), `${label}: cookie should expire with session`);
  assert(typeof record.options?.maxAge === 'number' && record.options.maxAge > 0, `${label}: cookie maxAge should match session lifetime`);
}

function session(token) {
  return {
    token,
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: { id: 'user-1' },
  };
}

function assertPublicSessionPayload(result, label) {
  assert(result?.token === undefined, `${label}: response body should not expose session token`);
  assert(result?.tokenType === undefined, `${label}: response body should not expose token type`);
  assert(result?.expiresAt instanceof Date, `${label}: response body should keep session expiry`);
  assert(result?.user?.id === 'user-1', `${label}: response body should keep safe user payload`);
}

async function run() {
  assert(bearerToken('Bearer header.token') === 'header.token', 'bearer token should parse');
  assert(bearerToken('bearer lower.token') === 'lower.token', 'bearer scheme should be case insensitive');
  assert(bearerToken('Bearer   spaced.token') === 'spaced.token', 'bearer token should allow separating whitespace');
  assert(!bearerToken('Bearer token extra'), 'bearer token should reject extra values');
  assert(!bearerToken(['Bearer first', 'Bearer second']), 'bearer token should reject duplicate authorization headers');

  assert(cookieToken('other=value; smarttour.auth.token=cookie.token') === 'cookie.token', 'cookie token should parse');
  assert(cookieToken('smarttour.auth.token=encoded%2Etoken') === 'encoded.token', 'cookie token should decode');
  assert(!cookieToken('smarttour.auth.token=%E0%A4%A'), 'malformed encoded cookie should not throw or return token');
  assert(tokenFromHeaders({ authorization: 'Bearer header.token', cookie: 'smarttour.auth.token=cookie.token' }) === 'cookie.token', 'cookie token should take precedence over stale bearer token');
  assert(tokenFromHeaders({ cookie: ['other=value', 'smarttour.auth.token=array.token'] }) === 'array.token', 'cookie header arrays should parse');

  const calls = [];
  const service = {
    bootstrap: (...args) => {
      calls.push(['bootstrap', ...args]);
      return session('bootstrap.token');
    },
    login: (...args) => {
      calls.push(['login', ...args]);
      return session('login.token');
    },
    logout: (...args) => {
      calls.push(['logout', ...args]);
      return { ok: true };
    },
    me: (...args) => calls.push(['me', ...args]),
    changePassword: (...args) => {
      calls.push(['changePassword', ...args]);
      return session('change.token');
    },
  };
  const controller = new AuthController(service);

  const bootstrapResponse = responseRecorder();
  const bootstrapResult = await controller.bootstrap({ email: 'admin@example.com' }, {}, '127.0.0.1', bootstrapResponse);
  assertPublicSessionPayload(bootstrapResult, 'bootstrap');
  assertAuthCookie(bootstrapResponse.cookies[0], 'bootstrap.token', 'bootstrap');

  const loginResponse = responseRecorder();
  const loginResult = await controller.login({ username: 'admin' }, {}, '127.0.0.1', loginResponse);
  assertPublicSessionPayload(loginResult, 'login');
  assertAuthCookie(loginResponse.cookies[0], 'login.token', 'login');

  const logoutResponse = responseRecorder();
  await controller.logout({ headers: { authorization: 'Bearer logout.header', cookie: 'smarttour.auth.token=logout.cookie' }, user: { id: 'user-1' } }, logoutResponse);
  controller.me({ headers: { cookie: 'smarttour.auth.token=me.cookie' } });
  const changePasswordResponse = responseRecorder();
  const changeResult = await controller.changePassword(
    { headers: { authorization: 'Bearer change.header', cookie: 'smarttour.auth.token=change.cookie' }, user: { id: 'user-2' } },
    { currentPassword: 'old', newPassword: 'new' },
    '127.0.0.1',
    changePasswordResponse,
  );
  assertPublicSessionPayload(changeResult, 'change password');
  assertAuthCookie(changePasswordResponse.cookies[0], 'change.token', 'change password');

  assert(calls[2][0] === 'logout' && calls[2][1] === 'logout.cookie' && calls[2][2] === 'user-1', 'logout should use cookie token over stale bearer token');
  assert(logoutResponse.cleared[0]?.name === AUTH_TOKEN_COOKIE, 'logout should clear auth cookie');
  assert(logoutResponse.cleared[0]?.options?.sameSite === 'lax' && logoutResponse.cleared[0]?.options?.path === '/', 'logout should clear cookie with matching options');
  assert(calls[3][0] === 'me' && calls[3][1] === 'me.cookie', 'me should accept cookie token');
  assert(calls[4][0] === 'changePassword' && calls[4][1] === 'user-2' && calls[4][3] === 'change.cookie' && calls[4][4].ip === '127.0.0.1', 'change password should use cookie token and request metadata');

  const headerLogoutResponse = responseRecorder();
  await controller.logout({ headers: { authorization: 'Bearer logout.header.only' } }, headerLogoutResponse);
  controller.me({ headers: { authorization: 'Bearer me.header.only' } });
  const headerChangeResponse = responseRecorder();
  await controller.changePassword(
    { headers: { authorization: 'Bearer change.header.only' }, user: { id: 'user-3' } },
    { currentPassword: 'old', newPassword: 'new' },
    '127.0.0.2',
    headerChangeResponse,
  );
  assert(calls[5][0] === 'logout' && calls[5][1] === 'logout.header.only', 'logout should accept Authorization bearer token when cookie is absent');
  assert(headerLogoutResponse.cleared[0]?.name === AUTH_TOKEN_COOKIE, 'header-only logout should still clear auth cookie');
  assert(calls[6][0] === 'me' && calls[6][1] === 'me.header.only', 'me should accept Authorization bearer token when cookie is absent');
  assert(calls[7][0] === 'changePassword' && calls[7][1] === 'user-3' && calls[7][3] === 'change.header.only' && calls[7][4].ip === '127.0.0.2', 'change password should accept Authorization bearer token when cookie is absent');
  assertAuthCookie(headerChangeResponse.cookies[0], 'change.token', 'header-only change password');

  console.log('TEST_AUTH_TOKEN_EXTRACTION_OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
