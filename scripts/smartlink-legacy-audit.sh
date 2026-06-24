#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
SMARTLINK_AUDIT_DOCKER_TIMEOUT="${SMARTLINK_AUDIT_DOCKER_TIMEOUT:-10m}"
cd "$REPO_DIR"

run_smartlink_docker() {
  timeout "$SMARTLINK_AUDIT_DOCKER_TIMEOUT" docker "$@"
}

if command -v node >/dev/null 2>&1 && NODE_PATH="${NODE_PATH:-$REPO_DIR/node_modules}" node -e "require('@prisma/client')" >/dev/null 2>&1; then
  export NODE_PATH="${NODE_PATH:-$REPO_DIR/node_modules}"
  exec node scripts/smartlink-legacy-audit.js "$@"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "node_modules are unavailable and docker is not installed; cannot audit SmartLink legacy tokens" >&2
  exit 127
fi

run_smartlink_docker compose run --rm --no-deps \
  -v "$PWD:/workspace" \
  --workdir /workspace \
  -e NODE_PATH=/app/node_modules \
  -e SMARTTOUR_PUBLIC_BASE_URL="${SMARTTOUR_PUBLIC_BASE_URL:-}" \
  -e SITE_URL="${SITE_URL:-}" \
  -e NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}" \
  --entrypoint node api scripts/smartlink-legacy-audit.js "$@"
