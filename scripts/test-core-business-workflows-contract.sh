#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
cd "$REPO_DIR"

node <<'NODE'
const fs = require('fs');

const failures = [];
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scriptPath = 'scripts/smoke-core-business-workflows.sh';

if (packageJson.scripts?.['smoke:core'] !== scriptPath) {
  failures.push('package.json must expose smoke:core -> scripts/smoke-core-business-workflows.sh');
}

if (!fs.existsSync(scriptPath)) {
  failures.push(`${scriptPath} must exist`);
} else {
  const source = fs.readFileSync(scriptPath, 'utf8');
  const mode = fs.statSync(scriptPath).mode;
  if ((mode & 0o111) === 0) failures.push(`${scriptPath} must be executable`);
  if (source.includes('ADMIN_PASSWORD:?')) failures.push(`${scriptPath} must not require ADMIN_PASSWORD`);
  for (const token of [
    'CREATE_CUSTOMER_OK',
    'UPDATE_CUSTOMER_CONTACTS_OK',
    'SEARCH_CUSTOMER_OK',
    'CUSTOMER_TIMELINE_OK',
    'CREATE_FIT_QUOTATION_OK',
    'APPROVE_QUOTATION_OK',
    'REJECT_QUOTATION_OK',
    'CONVERT_QUOTATION_OK',
    'CREATE_FIT_ORDER_OK',
    'CREATE_GIT_ORDER_OK',
    'CREATE_LANDTOUR_ORDER_OK',
    'ORDER_COPY_SETTLE_UNLOCK_OK',
    'TOUR_PROGRAM_BOOKING_OK',
    'OPERATION_FORM_PAYMENT_REQUEST_OK',
    'OPERATION_VOUCHER_PAYMENTS_OK',
    'FINANCE_APPROVE_REJECT_CANCEL_OK',
    'COMMISSION_SYNC_OK',
    'SUPPLIERS_OK',
    'REPORTS_OK',
    'CORE_WORKFLOW_OK',
  ]) {
    if (!source.includes(token)) failures.push(`${scriptPath} missing checkpoint ${token}`);
  }
}

if (failures.length) {
  console.error(['CORE_BUSINESS_WORKFLOWS_CONTRACT_FAILED', ...failures].join('\n'));
  process.exit(1);
}
console.log('CORE_BUSINESS_WORKFLOWS_CONTRACT_OK');
NODE
