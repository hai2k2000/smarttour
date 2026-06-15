#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
RUN_ID="${RUN_ID:-UXUI-$(date +%s)}"
RUN_SAFE="$(printf '%s' "$RUN_ID" | tr '[:upper:]-' '[:lower:]_' | tr -c 'a-z0-9_' '_')"
ADMIN_TOKEN="${ADMIN_TOKEN:-${RUN_ID}.admin-token}"
VIEW_TOKEN="${VIEW_TOKEN:-${RUN_ID}.view-token}"
ADMIN_TOKEN_HASH="$(printf '%s' "$ADMIN_TOKEN" | sha256sum | awk '{print $1}')"
VIEW_TOKEN_HASH="$(printf '%s' "$VIEW_TOKEN" | sha256sum | awk '{print $1}')"
ADMIN_ROLE_ID="role_ux_admin_${RUN_SAFE}"
VIEW_ROLE_ID="role_ux_view_${RUN_SAFE}"
ADMIN_USER_ID="user_ux_admin_${RUN_SAFE}"
VIEW_USER_ID="user_ux_view_${RUN_SAFE}"

cd "$REPO_DIR"

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d smarttour "$@"
}

cleanup() {
  psql_exec >/dev/null <<SQL || true
DELETE FROM "UserSession" WHERE "userId" IN ('${ADMIN_USER_ID}', '${VIEW_USER_ID}');
DELETE FROM "UserRole" WHERE "userId" IN ('${ADMIN_USER_ID}', '${VIEW_USER_ID}') OR "roleId" IN ('${ADMIN_ROLE_ID}', '${VIEW_ROLE_ID}');
DELETE FROM "User" WHERE id IN ('${ADMIN_USER_ID}', '${VIEW_USER_ID}');
DELETE FROM "RolePermission" WHERE "roleId" IN ('${ADMIN_ROLE_ID}', '${VIEW_ROLE_ID}');
DELETE FROM "Role" WHERE id IN ('${ADMIN_ROLE_ID}', '${VIEW_ROLE_ID}');
SQL
}
trap cleanup EXIT

cleanup
psql_exec >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES
  ('${ADMIN_ROLE_ID}', 'ux-admin-${RUN_SAFE}', 'UX UI smoke admin', false, 'ACTIVE', now(), now()),
  ('${VIEW_ROLE_ID}', 'ux-view-${RUN_SAFE}', 'UX UI smoke viewer', false, 'ACTIVE', now(), now());
INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES
  ('${ADMIN_ROLE_ID}_all', '${ADMIN_ROLE_ID}', '*', now()),
  ('${VIEW_ROLE_ID}_customer_view', '${VIEW_ROLE_ID}', 'customer.view', now()),
  ('${VIEW_ROLE_ID}_scope', '${VIEW_ROLE_ID}', 'data.scope.all', now());
INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES
  ('${ADMIN_USER_ID}', 'ux-admin-${RUN_SAFE}', 'ux-admin-${RUN_SAFE}@smarttour.local', 'UX UI Admin', 'session-only', 'ACTIVE', 'UX', 'QA', now(), now()),
  ('${VIEW_USER_ID}', 'ux-view-${RUN_SAFE}', 'ux-view-${RUN_SAFE}@smarttour.local', 'UX UI Viewer', 'session-only', 'ACTIVE', 'UX', 'QA', now(), now());
INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES
  ('ur_${ADMIN_USER_ID}', '${ADMIN_USER_ID}', '${ADMIN_ROLE_ID}', now()),
  ('ur_${VIEW_USER_ID}', '${VIEW_USER_ID}', '${VIEW_ROLE_ID}', now());
INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES
  ('session_${ADMIN_USER_ID}', '${ADMIN_USER_ID}', '${ADMIN_TOKEN_HASH}', 'ux-ui-smoke', '127.0.0.1', now() + interval '2 hours', now(), now()),
  ('session_${VIEW_USER_ID}', '${VIEW_USER_ID}', '${VIEW_TOKEN_HASH}', 'ux-ui-smoke', '127.0.0.1', now() + interval '2 hours', now(), now());
SQL

export ADMIN_TOKEN VIEW_TOKEN ADMIN_USER_ID VIEW_USER_ID
node scripts/smoke-ux-ui.js
AUTH_TOKEN="$ADMIN_TOKEN" scripts/smoke-exports.sh
