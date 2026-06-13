#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_smartlink_legacy_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
test -n "$POSTGRES_PASSWORD"

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

cleanup() {
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose run --rm \
  -v "$PWD:/workspace" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  -e SMARTTOUR_PUBLIC_BASE_URL="https://example.test" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && NODE_PATH=/app/node_modules node" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const scriptPath = '/workspace/scripts/smartlink-legacy-audit.js';
const wrapperPath = '/workspace/scripts/smartlink-legacy-audit.sh';
assert(fs.existsSync(scriptPath), 'smartlink legacy audit JS script must exist');
assert(fs.existsSync(wrapperPath), 'smartlink legacy audit shell wrapper must exist');

const smartlink = require(scriptPath);
assert.equal(typeof smartlink.auditSmartLinks, 'function', 'script must export auditSmartLinks');
assert.equal(typeof smartlink.backfillSmartLinks, 'function', 'script must export backfillSmartLinks');

const SECURE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_1';
assert.match(SECURE, /^[A-Za-z0-9_-]{43}$/);

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: '/workspace',
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_PATH: '/app/node_modules',
      SMARTTOUR_PUBLIC_BASE_URL: 'https://example.test',
    },
  });
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const run = `M2-${Date.now()}`;
  await prisma.quotation.create({ data: { quoteCode: `${run}-LEGACY`, productType: 'FIT', customerName: 'Legacy Active', smartLinkEnabled: true, smartLinkToken: `${run.toLowerCase()}-1700000000` } });
  await prisma.quotation.create({ data: { quoteCode: `${run}-NULL`, productType: 'GIT', customerName: 'Missing Token', smartLinkEnabled: true, smartLinkToken: null } });
  await prisma.quotation.create({ data: { quoteCode: `${run}-SECURE`, productType: 'COMBO', customerName: 'Secure Active', smartLinkEnabled: true, smartLinkToken: SECURE } });
  await prisma.quotation.create({ data: { quoteCode: `${run}-INACTIVE`, productType: 'BOOKING', customerName: 'Inactive Legacy', smartLinkEnabled: false, smartLinkToken: `${run.toLowerCase()}-inactive-1700000000` } });

  const audit = await smartlink.auditSmartLinks(prisma, { publicBaseUrl: 'https://example.test' });
  assert.equal(audit.activeLegacy.length, 2, 'audit must find active legacy/null SmartLinks');
  assert.equal(audit.inactiveLegacy.length, 1, 'audit must report inactive legacy tokens separately');
  assert.equal(audit.activeSecureCount, 1, 'audit must count active secure SmartLinks');
  assert(audit.activeLegacy.some((row) => row.quoteCode === `${run}-LEGACY` && row.oldPublicUrl?.includes(row.oldToken)), 'audit must include old public URL for resend planning');
  assert(audit.activeLegacy.some((row) => row.quoteCode === `${run}-NULL` && row.oldToken === null), 'audit must include active missing token rows');

  const guardBefore = cli(['--mode=guard']);
  assert.notEqual(guardBefore.status, 0, 'guard must block deploy when active legacy SmartLinks exist');
  assert.match(`${guardBefore.stdout}\n${guardBefore.stderr}`, /SMARTLINK_LEGACY_ACTIVE/);

  const reportPath = '/tmp/smartlink-backfill-report.json';
  const backfill = cli(['--mode=backfill', '--output', reportPath]);
  assert.equal(backfill.status, 0, backfill.stderr || backfill.stdout);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.rotated.length, 2, 'backfill report must list rotated active legacy links');
  for (const row of report.rotated) {
    assert.match(row.newToken, /^[A-Za-z0-9_-]{43}$/, 'backfill must generate secure token');
    assert(row.newPublicUrl.endsWith(`/api/quotations/public/${row.newToken}`), 'backfill report must include new public URL');
    assert(row.oldPublicUrl === null || row.oldPublicUrl.includes('/api/quotations/public/'), 'backfill report must include old public URL when available');
  }

  const after = await smartlink.auditSmartLinks(prisma, { publicBaseUrl: 'https://example.test' });
  assert.equal(after.activeLegacy.length, 0, 'active legacy SmartLinks must be gone after backfill');
  assert.equal(after.inactiveLegacy.length, 1, 'inactive legacy tokens should remain informational only');
  const secure = await prisma.quotation.findUniqueOrThrow({ where: { quoteCode: `${run}-SECURE` } });
  assert.equal(secure.smartLinkToken, SECURE, 'backfill must not rotate already-secure tokens');
  const inactive = await prisma.quotation.findUniqueOrThrow({ where: { quoteCode: `${run}-INACTIVE` } });
  assert.equal(inactive.smartLinkToken, `${run.toLowerCase()}-inactive-1700000000`, 'backfill must not rotate inactive legacy tokens by default');

  const guardAfter = cli(['--mode=guard']);
  assert.equal(guardAfter.status, 0, guardAfter.stderr || guardAfter.stdout);

  const deployScript = fs.readFileSync('/workspace/scripts/deploy-production.sh', 'utf8');
  const buildIndex = deployScript.indexOf('docker compose build api web');
  const guardMatch = deployScript.match(/smartlink-legacy-audit\.sh["']?\s+--mode=guard/);
  const guardIndex = guardMatch ? guardMatch.index : -1;
  assert(guardIndex >= 0 && guardIndex < buildIndex, 'production deploy must run SmartLink legacy guard before build');

  const packageJson = JSON.parse(fs.readFileSync('/workspace/package.json', 'utf8'));
  assert(packageJson.scripts['verify:deploy'].includes('smartlink-legacy-audit.sh --mode=guard'), 'verify:deploy must include SmartLink legacy guard');
  assert(packageJson.scripts['ops:smartlink:audit'], 'package must expose SmartLink audit command');
  assert(packageJson.scripts['ops:smartlink:backfill'], 'package must expose SmartLink backfill command');

  await prisma.$disconnect();
  console.log('TEST_SMARTLINK_LEGACY_AUDIT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
