#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

failures=0

require_env() {
  local key="$1"
  if ! grep -Eq "^${key}=.+" .env; then
    echo "FAIL_ENV missing $key"
    failures=$((failures + 1))
  else
    echo "OK_ENV $key"
  fi
}

require_env SMARTTOUR_AUTH_ENFORCE
require_env JWT_SECRET
require_env DATABASE_URL

if grep -Eq '^SMARTTOUR_AUTH_ENFORCE=true$' .env; then
  echo "OK_AUTH_ENFORCE true"
else
  echo "FAIL_AUTH_ENFORCE not true"
  failures=$((failures + 1))
fi

if grep -Eq '123456|password|changeme|secret' .env; then
  echo "WARN_ENV possible weak placeholder string in .env"
else
  echo "OK_ENV no obvious placeholder secret"
fi

if docker ps --format '{{.Names}} {{.Ports}}' | grep -Eq 'smarttour-(postgres|redis).*0\.0\.0\.0'; then
  echo "WARN_PORTS Postgres/Redis are published on all interfaces; confirm this is intentional or firewall-restricted"
else
  echo "OK_PORTS database/cache not exposed on all interfaces"
fi

if [[ -f /etc/cron.d/smarttour-postgres-backup ]]; then
  echo "OK_BACKUP_CRON installed"
else
  echo "FAIL_BACKUP_CRON missing"
  failures=$((failures + 1))
fi

npm audit --omit=dev

if [[ "$failures" -gt 0 ]]; then
  echo "SECURITY_AUDIT_FAILED failures=$failures"
  exit 1
fi

echo "SECURITY_AUDIT_OK"
