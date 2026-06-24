#!/usr/bin/env bash
set -euo pipefail

cd "${REPO_DIR:-/opt/smarttour}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://aitour.io.vn}"
PREVIEW_NPM_BUILD_TIMEOUT="${PREVIEW_NPM_BUILD_TIMEOUT:-20m}"
PREVIEW_DOCKER_BUILD_TIMEOUT="${PREVIEW_DOCKER_BUILD_TIMEOUT:-30m}"
PREVIEW_DOCKER_COMMAND_TIMEOUT="${PREVIEW_DOCKER_COMMAND_TIMEOUT:-5m}"

run_preview_npm() {
  timeout "$PREVIEW_NPM_BUILD_TIMEOUT" npm "$@"
}

run_preview_compose_build() {
  timeout "$PREVIEW_DOCKER_BUILD_TIMEOUT" docker compose "$@"
}

run_preview_compose() {
  timeout "$PREVIEW_DOCKER_COMMAND_TIMEOUT" docker compose "$@"
}

run_preview_docker() {
  timeout "$PREVIEW_DOCKER_COMMAND_TIMEOUT" docker "$@"
}

echo "BUILD_API"
run_preview_npm run build --workspace @smarttour/api
run_preview_compose_build build api
run_preview_docker rm -f smarttour-api-1 >/dev/null 2>&1 || true
run_preview_compose up -d api

echo "BUILD_WEB"
run_preview_npm run build --workspace @smarttour/web
run_preview_compose_build build web
run_preview_docker rm -f smarttour-web-preview >/dev/null 2>&1 || true
run_preview_docker run -d \
  --name smarttour-web-preview \
  --env-file .env \
  -e NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  -p "${WEB_BIND_ADDR:-127.0.0.1}:${WEB_HOST_PORT:-3001}:3000" \
  smarttour-web:latest

echo "DEPLOY_PREVIEW_OK"
