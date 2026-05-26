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

if grep -Eq '=(123456|password|changeme|secret|smarttour_dev_password|smarttour_dev_secret)$' .env; then
  echo "FAIL_ENV weak placeholder secret found"
  failures=$((failures + 1))
else
  echo "OK_ENV no obvious weak placeholder secret"
fi

if docker ps --format '{{.Names}} {{.Ports}}' | grep -Eq 'smarttour-(web-preview|api-1|postgres-1|redis-1).*0\.0\.0\.0'; then
  echo "FAIL_PORTS SmartTour containers are published on all interfaces"
  failures=$((failures + 1))
elif docker ps --format '{{.Names}} {{.Ports}}' | grep -Eq 'smarttour-(web-preview|api-1|postgres-1|redis-1).*127\.0\.0\.1'; then
  echo "OK_PORTS SmartTour host ports bound to localhost"
else
  echo "WARN_PORTS SmartTour publish state could not be confirmed"
fi

if [[ -f /etc/cron.d/smarttour-postgres-backup ]]; then
  echo "OK_BACKUP_CRON installed"
else
  echo "FAIL_BACKUP_CRON missing"
  failures=$((failures + 1))
fi

if [[ -f /etc/cron.d/smarttour-healthcheck ]]; then
  echo "OK_HEALTH_CRON installed"
else
  echo "FAIL_HEALTH_CRON missing"
  failures=$((failures + 1))
fi

npm audit --omit=dev

if [[ "$failures" -gt 0 ]]; then
  echo "SECURITY_AUDIT_FAILED failures=$failures"
  exit 1
fi

echo "SECURITY_AUDIT_OK"
