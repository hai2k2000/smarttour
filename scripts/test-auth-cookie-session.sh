#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

failures=0

fail() {
  echo "FAIL: $1" >&2
  failures=$((failures + 1))
}

frontend_matches() {
  local pattern="$1"
  find apps/web -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 grep -nE "$pattern" || true
}

browser_script_matches() {
  local pattern="$1"
  grep -nE "$pattern" \
    scripts/smoke-ui-browser.js \
    scripts/smoke-operations-ui.js \
    scripts/test-suppliers-hotel-client-ui.js || true
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  grep -qE "$pattern" "$file" || fail "$label"
}

token_storage_matches="$(frontend_matches "localStorage\\.(getItem|setItem)\\(['\\\"]smarttour\\.auth\\.token")"
if [ -n "$token_storage_matches" ]; then
  echo "$token_storage_matches" >&2
  fail "frontend must not read or store smarttour.auth.token in localStorage"
fi

session_storage_matches="$(frontend_matches "sessionStorage.*token|sessionToken")"
if [ -n "$session_storage_matches" ]; then
  echo "$session_storage_matches" >&2
  fail "frontend must not keep session tokens in sessionStorage/client variables"
fi

bearer_matches="$(frontend_matches "Authorization.*Bearer|Bearer.*Authorization")"
if [ -n "$bearer_matches" ]; then
  echo "$bearer_matches" >&2
  fail "frontend must not send Authorization Bearer from client auth state"
fi

cookie_matches="$(frontend_matches "document\\.cookie.*smarttour\\.auth\\.token")"
if [ -n "$cookie_matches" ]; then
  echo "$cookie_matches" >&2
  fail "frontend must not create, clear, or read smarttour.auth.token with document.cookie"
fi

auth_token_helper_matches="$(frontend_matches "\\bauthToken\\s*\\(")"
if [ -n "$auth_token_helper_matches" ]; then
  echo "$auth_token_helper_matches" >&2
  fail "frontend must not expose authToken/sessionToken client helpers"
fi

proxy_bearer_matches="$(grep -nE "Authorization.*Bearer|Bearer.*Authorization" apps/web/proxy.ts || true)"
if [ -n "$proxy_bearer_matches" ]; then
  echo "$proxy_bearer_matches" >&2
  fail "Next proxy must validate browser sessions by forwarding the auth cookie, not Authorization Bearer"
fi

browser_token_storage_matches="$(browser_script_matches "localStorage\\.(getItem|setItem)\\(['\\\"]smarttour\\.auth\\.token|document\\.cookie.*smarttour\\.auth\\.token")"
if [ -n "$browser_token_storage_matches" ]; then
  echo "$browser_token_storage_matches" >&2
  fail "browser smoke tests must not inject or assert localStorage/document.cookie session tokens"
fi

assert_contains apps/web/app/authFetch.ts "credentials: ['\\\"]include['\\\"]" "authFetch should send credentials: include"
assert_contains apps/web/app/login/LoginClient.tsx "credentials: ['\\\"]include['\\\"]" "login page should include credentials"
assert_contains apps/web/app/LoginClient.tsx "credentials: ['\\\"]include['\\\"]" "root login client should include credentials"
assert_contains apps/web/app/AppShell.tsx "credentials: ['\\\"]include['\\\"]" "logout should include credentials"
if grep -q "keepalive: true" apps/web/app/AppShell.tsx; then
  fail "logout must wait for backend Set-Cookie/revoke response instead of fire-and-forget keepalive"
fi
assert_contains apps/web/app/AppShell.tsx "async function logout" "logout should await backend logout before redirect"
assert_contains apps/web/app/AppShell.tsx "await fetch" "logout should await backend logout request"
assert_contains apps/web/app/security/SecurityClient.tsx "credentials: ['\\\"]include['\\\"]" "security client should include credentials"
assert_contains apps/web/app/finance/FinanceClient.tsx "credentials: ['\\\"]include['\\\"]" "finance client should include credentials"

assert_contains apps/api/src/modules/auth/auth-cookie.ts "httpOnly: true" "auth cookie helper should set HttpOnly"
assert_contains apps/api/src/modules/auth/auth-cookie.ts "sameSite: ['\\\"]lax['\\\"]" "auth cookie helper should set SameSite=Lax"
assert_contains apps/api/src/modules/auth/auth-cookie.ts "path: ['\\\"]/['\\\"]" "auth cookie helper should set path=/"
assert_contains apps/api/src/modules/auth/auth-cookie.ts "NODE_ENV" "auth cookie helper should derive secure mode from NODE_ENV"
assert_contains apps/api/src/modules/auth/auth.controller.ts "setAuthCookie" "auth controller should set cookies on session issuance"
assert_contains apps/api/src/modules/auth/auth.controller.ts "clearAuthCookie" "auth controller should clear cookies on logout"
assert_contains apps/api/src/modules/auth/auth-token.ts "cookieToken\\(headers\\?\\.cookie\\).*\\|\\|.*bearerToken\\(headers\\?\\.authorization\\)" "token extraction should prefer cookie over bearer"
assert_contains apps/api/src/main.ts "credentials: true" "CORS config should allow credentials"
if grep -q "origin: corsOrigins.length ? corsOrigins : true" apps/api/src/main.ts; then
  fail "credentialed CORS must not allow every origin outside explicit dev handling"
fi
assert_contains apps/api/src/main.ts "smartTourEnvironment\(\) === ['\"]development['\"]" "CORS permissive fallback should be development-only"
assert_contains apps/web/proxy.ts "Cookie: .*smarttour\\.auth\\.token" "Next proxy should forward auth cookie to /auth/me"
assert_contains scripts/smoke-ui-browser.js "httpOnly" "browser login smoke should assert HttpOnly auth cookie"
assert_contains scripts/smoke-ui-browser.js "context\\.cookies" "browser login smoke should inspect browser cookies"
assert_contains scripts/smoke-operations-ui.js "httpOnly: true" "operations browser smoke should inject HttpOnly auth cookie"
assert_contains scripts/test-suppliers-hotel-client-ui.js "httpOnly: true" "supplier browser smoke should inject HttpOnly auth cookie"

if [ "$failures" -gt 0 ]; then
  echo "TEST_AUTH_COOKIE_SESSION_FAILED ($failures failures)" >&2
  exit 1
fi

echo "TEST_AUTH_COOKIE_SESSION_OK"
