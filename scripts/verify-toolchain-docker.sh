#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
IMAGE="${VERIFY_NODE_IMAGE:-node:22-alpine}"
INSTALL_CMD="${VERIFY_INSTALL_CMD:-npm ci}"
DATABASE_URL="${VERIFY_DATABASE_URL:-postgresql://smarttour:smarttour@localhost:5432/smarttour?schema=public}"

if [ ! -f "$REPO_DIR/package-lock.json" ]; then
  INSTALL_CMD="${VERIFY_INSTALL_CMD:-npm install}"
fi

printf 'Verifying SmartTour toolchain in %s using %s\n' "$IMAGE" "$INSTALL_CMD"

docker run --rm \
  -e VERIFY_INSTALL_CMD="$INSTALL_CMD" \
  -e DATABASE_URL="$DATABASE_URL" \
  -v "$REPO_DIR:/src:ro" \
  -w /tmp \
  "$IMAGE" \
  sh -eu -c '
    work=/tmp/smarttour-verify
    rm -rf "$work"
    mkdir -p "$work"
    tar -C /src \
      --exclude=node_modules \
      --exclude=.git \
      --exclude=.env \
      --exclude=.env.* \
      --exclude=apps/web/.next \
      --exclude=apps/api/dist \
      --exclude=coverage \
      -cf - . | tar -C "$work" -xf -
    cd "$work"
    $VERIFY_INSTALL_CMD
    npm run lint
    npx prisma validate
  '