#!/usr/bin/env bash
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
RUN_ID="${RUN_ID:-HOTEL-CLIENT-UI-$(date +%s)}"
RUN_ID_LOWER="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
RUN_ID_SAFE="$(printf '%s' "$RUN_ID_LOWER" | tr -c 'a-z0-9_' '_')"

TEST_ROLE_ID="role_hotel_client_${RUN_ID_SAFE}"
TEST_USER_ID="user_hotel_client_${RUN_ID_SAFE}"
TEST_SESSION_ID="session_hotel_client_${RUN_ID_SAFE}"
TEST_TOKEN="${HOTEL_CLIENT_TEST_TOKEN:-${RUN_ID}.hotel-client-token}"
TEST_TOKEN_HASH="$(printf '%s' "$TEST_TOKEN" | sha256sum | awk '{print $1}')"
SEEDED_SESSION=0

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U smarttour -d smarttour "$@"
}

cleanup() {
  if [[ "$SEEDED_SESSION" != "1" ]]; then
    return
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    echo "skip Hotel Suppliers Client auth cleanup ($POSTGRES_CONTAINER not available)"
    return
  fi
  psql_exec >/dev/null <<SQL || true
DELETE FROM "UserSession" WHERE id = '${TEST_SESSION_ID}' OR "userId" = '${TEST_USER_ID}';
DELETE FROM "UserRole" WHERE "userId" = '${TEST_USER_ID}' OR "roleId" = '${TEST_ROLE_ID}';
DELETE FROM "User" WHERE id = '${TEST_USER_ID}' OR email = 'hotel-client-${RUN_ID_LOWER}@smarttour.local';
DELETE FROM "RolePermission" WHERE "roleId" = '${TEST_ROLE_ID}';
DELETE FROM "Role" WHERE id = '${TEST_ROLE_ID}' OR code = 'hotel-client-${RUN_ID_LOWER}';
SQL
}
trap cleanup EXIT

if [[ -z "${HOTEL_CLIENT_TEST_TOKEN:-}" && -z "${ADMIN_TOKEN:-}" ]]; then
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    echo "$POSTGRES_CONTAINER is not running and no HOTEL_CLIENT_TEST_TOKEN/ADMIN_TOKEN was provided" >&2
    exit 1
  fi
  cleanup
  psql_exec >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES ('${TEST_ROLE_ID}', 'hotel-client-${RUN_ID_LOWER}', 'Hotel supplier client UI test role', false, 'ACTIVE', now(), now());

INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES
  ('${TEST_ROLE_ID}_supplier_view', '${TEST_ROLE_ID}', 'supplier.view', now()),
  ('${TEST_ROLE_ID}_supplier_manage', '${TEST_ROLE_ID}', 'supplier.manage', now()),
  ('${TEST_ROLE_ID}_file_view', '${TEST_ROLE_ID}', 'file.view', now());

INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES (
  '${TEST_USER_ID}',
  'hotel-client-${RUN_ID_LOWER}',
  'hotel-client-${RUN_ID_LOWER}@smarttour.local',
  'Hotel Supplier Client UI Test',
  'not-used-by-token-test',
  'ACTIVE',
  'TEST-BR',
  'TEST-DEP',
  now(),
  now()
);

INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES ('ur_hotel_client_${RUN_ID_SAFE}', '${TEST_USER_ID}', '${TEST_ROLE_ID}', now());

INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES ('${TEST_SESSION_ID}', '${TEST_USER_ID}', '${TEST_TOKEN_HASH}', 'hotel-suppliers-client-ui-test', '127.0.0.1', now() + interval '1 hour', now(), now());
SQL
  SEEDED_SESSION=1
  export HOTEL_CLIENT_TEST_TOKEN="$TEST_TOKEN"
fi

node scripts/test-suppliers-hotel-client-ui.js
