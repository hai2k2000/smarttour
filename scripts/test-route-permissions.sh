#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

docker run --rm -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node scripts/audit-route-permissions.js
echo "TEST_ROUTE_PERMISSIONS_OK"
