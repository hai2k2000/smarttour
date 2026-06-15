#!/usr/bin/env bash
set -euo pipefail

cd "${REPO_DIR:-/opt/smarttour}"

node scripts/audit-data-scope.js
scripts/test-data-scope-module-flows.sh
scripts/smoke-rbac-workflows.sh

if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  ADMIN_PASSWORD="$ADMIN_PASSWORD" scripts/smoke-business-workflows.sh
  ADMIN_PASSWORD="$ADMIN_PASSWORD" scripts/smoke-finance-reports.sh
else
  echo "SKIP_DATA_SCOPE_ADMIN_WORKFLOWS ADMIN_PASSWORD is not set"
fi

echo "DATA_SCOPE_VERIFY_OK"
