#!/usr/bin/env bash
set -euo pipefail

ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD to the current admin password}"
cd "${REPO_DIR:-/opt/smarttour}"

ADMIN_PASSWORD="$ADMIN_PASSWORD" scripts/smoke-rbac-workflows.sh
ADMIN_PASSWORD="$ADMIN_PASSWORD" scripts/smoke-business-workflows.sh
ADMIN_PASSWORD="$ADMIN_PASSWORD" scripts/smoke-finance-reports.sh

echo "DATA_SCOPE_VERIFY_OK"
