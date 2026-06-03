#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
BRANCH="${BRANCH:-main}"
SITE_URL="${SITE_URL:-https://aitour.io.vn}"
API_URL="${API_URL:-https://aitour.io.vn/api}"
RUN_GIT_PULL="${RUN_GIT_PULL:-true}"
ALLOW_DIRTY="${ALLOW_DIRTY:-false}"

cd "$REPO_DIR"

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

if [[ "$RUN_GIT_PULL" == "true" ]]; then
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

docker compose build api web
docker compose up -d api web nginx

SITE_URL="$SITE_URL" API_URL="$API_URL" "$REPO_DIR/scripts/healthcheck.sh"

echo "DEPLOY_PRODUCTION_OK branch=$BRANCH commit=$(git rev-parse --short HEAD)"
