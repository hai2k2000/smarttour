#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
RUN_BACKEND_LINT="${RUN_BACKEND_LINT:-1}"
RUN_LIST_PERFORMANCE="${RUN_LIST_PERFORMANCE:-0}"
RUN_LIVE_AUTH_SMOKE="${RUN_LIVE_AUTH_SMOKE:-0}"
RUN_LIVE_API_SMOKES="${RUN_LIVE_API_SMOKES:-0}"

cd "$REPO_DIR"

cleanup_docker_builder_cache() {
  if [[ "${SMARTTOUR_TEST_PRUNE_DOCKER_CACHE:-1}" == "1" ]]; then
    docker builder prune -af >/dev/null 2>&1 || true
  fi
}
trap cleanup_docker_builder_cache EXIT

run_step() {
  local name="$1"
  shift
  echo "==> $name"
  "$@"
}

run_node_audit() {
  local script="$1"
  docker run --rm -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node "$script"
}

run_backend_lint() {
  docker compose run --rm \
    -v "$PWD/apps/api/src:/app/apps/api/src:ro" \
    -v "$PWD/apps/api/tsconfig.json:/app/apps/api/tsconfig.json:ro" \
    -v "$PWD/apps/api/package.json:/app/apps/api/package.json:ro" \
    -v "$PWD/tsconfig.base.json:/app/tsconfig.base.json:ro" \
    -v "$PWD/prisma:/app/prisma:ro" \
    --entrypoint sh api -lc 'npm run lint -w @smarttour/api'
}

run_step "api build" docker compose build api

if [[ "$RUN_BACKEND_LINT" == "1" ]]; then
  run_step "api lint" run_backend_lint
else
  echo "skip api lint (RUN_BACKEND_LINT=$RUN_BACKEND_LINT)"
fi

run_step "backend module wiring audit" run_node_audit scripts/audit-backend-module-wiring.js
run_step "route permission audit" bash scripts/test-route-permissions.sh
run_step "booking controller contract" bash scripts/test-bookings-controller-contract.sh
run_step "data scope audit" run_node_audit scripts/audit-data-scope.js
run_step "list view include audit" run_node_audit scripts/audit-list-view-includes.js

run_step "auth guard behavior" bash scripts/test-auth-guard-behavior.sh
run_step "auth session flows" bash scripts/test-auth-session-flows.sh
run_step "auth data scope helpers" bash scripts/test-auth-data-scope.sh
run_step "module data scope flows" bash scripts/test-data-scope-module-flows.sh

run_step "order calculator" bash scripts/test-order-calculator.sh
run_step "order service flows" bash scripts/test-order-service-flows.sh

run_step "finance rules" bash scripts/test-finance-rules.sh
run_step "finance service flows" bash scripts/test-finance-service-flows.sh

run_step "files service core" bash scripts/test-files-service-core.sh
run_step "file service error flows" bash scripts/test-file-service-error-flows.sh

if [[ "$RUN_LIST_PERFORMANCE" == "1" ]]; then
  run_step "list view performance" bash scripts/test-list-view-performance.sh
else
  echo "skip list view performance (RUN_LIST_PERFORMANCE=$RUN_LIST_PERFORMANCE)"
fi

if [[ "$RUN_LIVE_AUTH_SMOKE" == "1" ]]; then
  run_step "live auth enforcement smoke" bash scripts/test-auth-enforcement.sh
else
  echo "skip live auth enforcement smoke (RUN_LIVE_AUTH_SMOKE=$RUN_LIVE_AUTH_SMOKE)"
fi

if [[ "$RUN_LIVE_API_SMOKES" == "1" ]]; then
  run_step "live business smoke" bash scripts/smoke-business-workflows.sh
  run_step "live operations backend smoke" bash scripts/smoke-operations-backend.sh
  run_step "live suppliers smoke" bash scripts/smoke-suppliers.sh
  run_step "live quotes and quotations smoke" bash scripts/smoke-quotes-quotations.sh
  run_step "live finance reports smoke" bash scripts/smoke-finance-reports.sh
  run_step "live reports business rules smoke" bash scripts/smoke-reports-business-rules.sh
  run_step "live finance cancellations smoke" bash scripts/smoke-finance-cancellations.sh
  run_step "live files smoke" bash scripts/smoke-files.sh
else
  echo "skip live API smokes (RUN_LIVE_API_SMOKES=$RUN_LIVE_API_SMOKES)"
fi

echo "TEST_BACKEND_CRITICAL_FLOWS_OK"
