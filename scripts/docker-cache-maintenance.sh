#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
DOCKER_CACHE_BUILDER_UNTIL="${DOCKER_CACHE_BUILDER_UNTIL:-24h}"
DOCKER_CACHE_IMAGE_UNTIL="${DOCKER_CACHE_IMAGE_UNTIL:-72h}"
DOCKER_CACHE_DOCKER_TIMEOUT="${DOCKER_CACHE_DOCKER_TIMEOUT:-30m}"
DOCKER_CACHE_HEALTHCHECK_TIMEOUT="${DOCKER_CACHE_HEALTHCHECK_TIMEOUT:-10m}"

run_docker_cache_docker() {
  timeout "$DOCKER_CACHE_DOCKER_TIMEOUT" docker "$@"
}

run_docker_cache_healthcheck() {
  timeout "$DOCKER_CACHE_HEALTHCHECK_TIMEOUT" "$@"
}

echo "DOCKER_CACHE_MAINTENANCE_START $(date -Is)"
cd "$REPO_DIR"

echo "DOCKER_CACHE_BEFORE"
run_docker_cache_docker system df

echo "DOCKER_CACHE_PRUNE_BUILDER until=$DOCKER_CACHE_BUILDER_UNTIL"
run_docker_cache_docker builder prune -af --filter "until=$DOCKER_CACHE_BUILDER_UNTIL"

echo "DOCKER_CACHE_PRUNE_IMAGES until=$DOCKER_CACHE_IMAGE_UNTIL"
run_docker_cache_docker image prune -af --filter "until=$DOCKER_CACHE_IMAGE_UNTIL"

echo "DOCKER_CACHE_AFTER"
run_docker_cache_docker system df

echo "DOCKER_CACHE_HEALTHCHECK"
run_docker_cache_healthcheck scripts/healthcheck.sh

echo "DOCKER_CACHE_MAINTENANCE_OK $(date -Is)"
