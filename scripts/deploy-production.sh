#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
BRANCH="${BRANCH:-main}"
SITE_URL="${SITE_URL:-https://aitour.io.vn}"
API_URL="${API_URL:-https://aitour.io.vn/api}"
RUN_GIT_PULL="${RUN_GIT_PULL:-true}"
ALLOW_DIRTY="${ALLOW_DIRTY:-false}"
DEPLOY_DIRTY_REASON="${DEPLOY_DIRTY_REASON:-}"
DEPLOY_GIT_TIMEOUT="${DEPLOY_GIT_TIMEOUT:-5m}"
DEPLOY_PRISMA_MIGRATE_TIMEOUT="${DEPLOY_PRISMA_MIGRATE_TIMEOUT:-10m}"
DEPLOY_DOCKER_BUILD_TIMEOUT="${DEPLOY_DOCKER_BUILD_TIMEOUT:-45m}"
DEPLOY_DOCKER_UP_TIMEOUT="${DEPLOY_DOCKER_UP_TIMEOUT:-10m}"

cd "$REPO_DIR"

run_deploy_git() {
  timeout "$DEPLOY_GIT_TIMEOUT" git "$@"
}

run_deploy_prisma() {
  timeout "$DEPLOY_PRISMA_MIGRATE_TIMEOUT" npx prisma "$@"
}

run_deploy_compose_build() {
  timeout "$DEPLOY_DOCKER_BUILD_TIMEOUT" docker compose "$@"
}

run_deploy_compose_up() {
  timeout "$DEPLOY_DOCKER_UP_TIMEOUT" docker compose "$@"
}

validate_branch_name() {
  local value="$1"
  if [[ -z "$value" ]] \
    || [[ ! "$value" =~ ^[A-Za-z0-9._/-]+$ ]] \
    || [[ "$value" == /* ]] \
    || [[ "$value" == *..* ]] \
    || [[ "$value" == *.lock ]] \
    || [[ "$value" == *//* ]]; then
    echo "DEPLOY_ABORT invalid branch name: $value"
    exit 1
  fi
}

validate_branch_name "$BRANCH"

if [[ "$ALLOW_DIRTY" == "true" ]]; then
  if [[ -z "$DEPLOY_DIRTY_REASON" ]]; then
    echo "DEPLOY_ABORT ALLOW_DIRTY requires DEPLOY_DIRTY_REASON"
    exit 1
  fi
  echo "DEPLOY_DIRTY_OVERRIDE reason=$DEPLOY_DIRTY_REASON"
fi

if [[ "$ALLOW_DIRTY" != "true" ]] && ! git diff --quiet; then
  echo "DEPLOY_ABORT dirty worktree. Commit/push changes first, or set ALLOW_DIRTY=true for an emergency deploy."
  git status --short
  exit 1
fi

if [[ "$ALLOW_DIRTY" != "true" ]] && ! git diff --cached --quiet; then
  echo "DEPLOY_ABORT staged changes exist. Commit/push changes first."
  git status --short
  exit 1
fi

untracked_files="$(git ls-files --others --exclude-standard)"
if [[ "$ALLOW_DIRTY" != "true" && -n "$untracked_files" ]]; then
  echo "DEPLOY_ABORT untracked files exist. Remove or commit them first, or set ALLOW_DIRTY=true for an emergency deploy."
  printf '%s\n' "$untracked_files"
  exit 1
fi

starting_commit="$(git rev-parse --short HEAD)"
echo "DEPLOY_START branch=$BRANCH current_commit=$starting_commit"

if [[ "$RUN_GIT_PULL" == "true" ]]; then
  run_deploy_git fetch origin "$BRANCH"
  run_deploy_git checkout "$BRANCH"
  run_deploy_git pull --ff-only origin "$BRANCH"
fi

target_commit="$(git rev-parse --short HEAD)"
echo "DEPLOY_REVISION branch=$BRANCH previous_commit=$starting_commit target_commit=$target_commit"

echo "DEPLOY_PHASE smartlink_guard"
"$REPO_DIR/scripts/smartlink-legacy-audit.sh" --mode=guard

echo "DEPLOY_PHASE prisma_migrate_deploy"
run_deploy_prisma migrate deploy

echo "DEPLOY_PHASE docker_build"
run_deploy_compose_build build api web

echo "DEPLOY_PHASE docker_up"
run_deploy_compose_up up -d api web nginx

echo "DEPLOY_PHASE healthcheck"
SITE_URL="$SITE_URL" API_URL="$API_URL" "$REPO_DIR/scripts/healthcheck.sh"

echo "DEPLOY_PRODUCTION_OK branch=$BRANCH commit=$(git rev-parse --short HEAD)"
