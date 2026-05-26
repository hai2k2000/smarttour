#!/usr/bin/env bash
set -euo pipefail

cd "${REPO_DIR:-/opt/smarttour}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://quanly.dunientravel.com}"

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
  -e NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  -p "${WEB_BIND_ADDR:-127.0.0.1}:${WEB_HOST_PORT:-3001}:3000" \
  smarttour-web:latest

echo "DEPLOY_PREVIEW_OK"
