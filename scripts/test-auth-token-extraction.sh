#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker compose build api >/dev/null
docker compose run --rm --entrypoint node api <<'NODE'
const { AuthController } = require('./apps/api/dist/modules/auth/auth.controller');
const { bearerToken, cookieToken, tokenFromHeaders } = require('./apps/api/dist/modules/auth/auth-token');

function assert(condition, label) {
  if (!condition) throw new Error(label);
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
  assert(tokenFromHeaders({ authorization: 'Bearer header.token', cookie: 'smarttour.auth.token=cookie.token' }) === 'header.token', 'authorization header should take precedence');
  assert(tokenFromHeaders({ cookie: ['other=value', 'smarttour.auth.token=array.token'] }) === 'array.token', 'cookie header arrays should parse');

  const calls = [];
  const service = {
    logout: (...args) => calls.push(['logout', ...args]),
    me: (...args) => calls.push(['me', ...args]),
    changePassword: (...args) => calls.push(['changePassword', ...args]),
  };
  const controller = new AuthController(service);
  controller.logout({ headers: { authorization: 'Bearer logout.header', cookie: 'smarttour.auth.token=logout.cookie' }, user: { id: 'user-1' } });
  controller.me({ headers: { cookie: 'smarttour.auth.token=me.cookie' } });
  controller.changePassword({ headers: { authorization: 'Bearer change.header' }, user: { id: 'user-2' } }, { currentPassword: 'old', newPassword: 'new' });

  assert(calls[0][0] === 'logout' && calls[0][1] === 'logout.header' && calls[0][2] === 'user-1', 'logout should use shared token extraction');
  assert(calls[1][0] === 'me' && calls[1][1] === 'me.cookie', 'me should accept cookie token');
  assert(calls[2][0] === 'changePassword' && calls[2][1] === 'user-2' && calls[2][3] === 'change.header', 'change password should accept bearer token');

  console.log('TEST_AUTH_TOKEN_EXTRACTION_OK');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
