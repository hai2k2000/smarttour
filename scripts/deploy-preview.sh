#!/usr/bin/env bash
set -euo pipefail

cd "${REPO_DIR:-/opt/smarttour}"

echo "BUILD_API"
npm run build --workspace @smarttour/api
docker compose build api
docker rm -f smarttour-api-1 >/dev/null 2>&1 || true
docker compose up -d api

echo "BUILD_WEB"
npm run build --workspace @smarttour/web
docker compose build web
docker rm -f smarttour-web-preview >/dev/null 2>&1 || true
docker run -d \
  --name smarttour-web-preview \
  --env-file .env \
  -e NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://103.75.185.200:4000}" \
  -p "${WEB_HOST_PORT:-3001}:3000" \
  smarttour-web:latest

echo "DEPLOY_PREVIEW_OK"
