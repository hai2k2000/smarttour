#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_data_scope_module_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_DATA_SCOPE_MODULE_TEST missing POSTGRES_PASSWORD"
  exit 1
fi

docker compose build api >/dev/null
docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_USER" "$TEST_DB"

cleanup() {
  docker exec "$POSTGRES_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose run --rm \
  -v "$PWD:/workspace:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { FinanceService } = require('./apps/api/dist/modules/finance/finance.service');
const { GitToursService } = require('./apps/api/dist/modules/git-tours/git-tours.service');
const { LandToursService } = require('./apps/api/dist/modules/landtours/landtours.service');
const { FitToursService } = require('./apps/api/dist/modules/fit-tours/fit-tours.service');

function role(...permissions) {
  return { role: { permissions: permissions.map((permission) => ({ permission })) } };
}

function user(branch, department, ...permissions) {
  return { branch, department, roles: [role(...permissions)] };
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function rejects(action, label) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, label);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "CodeSequence_scope_prefix_year_month_branch_expr_key" ON "CodeSequence"("scope", "prefix", "year", COALESCE("month", 0), COALESCE("branch", \'\'))');

  const finance = new FinanceService(prisma, {});
  const gitTours = new GitToursService(prisma);
  const landTours = new LandToursService(prisma);
  const fitTours = new FitToursService(prisma);
  const run = 'SCOPE-' + Date.now();

  const branchUser = user('BR-A', 'DEP-A', 'data.scope.branch');
  const departmentUser = user('BR-X', 'DEP-B', 'data.scope.department');
  const noScopeUser = user('BR-A', 'DEP-A', 'tour.view');
  const allUser = user(null, null, 'data.scope.all');

  const customerA = await prisma.customer.create({
    data: { code: run + '-CA', fullName: 'Customer A', phone: '090' + String(Date.now()).slice(-7), branch: 'BR-A', department: 'DEP-A' },
  });
  const customerB = await prisma.customer.create({
    data: { code: run + '-CB', fullName: 'Customer B', phone: '091' + String(Date.now()).slice(-7), branch: 'BR-B', department: 'DEP-B' },
  });

  const invoiceA = await finance.createInvoice({
    invoiceCode: run + '-INV-A',
    customerId: customerA.id,
    customerName: customerA.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-12-01',
    items: [{ itemName: 'Tour A', quantity: 1, unitPrice: 100, taxRate: 10 }],
  }, branchUser);
  const invoiceB = await finance.createInvoice({
    invoiceCode: run + '-INV-B',
    customerId: customerB.id,
    customerName: customerB.fullName,
    invoiceType: 'VAT',
    issuedDate: '2026-12-02',
    items: [{ itemName: 'Tour B', quantity: 1, unitPrice: 200, taxRate: 10 }],
  }, allUser);

  const branchInvoices = await finance.listInvoices({ search: run }, branchUser);
  assert(branchInvoices.rows.length === 1 && branchInvoices.rows[0].id === invoiceA.id, 'branch user should only see branch invoice');
  const departmentInvoices = await finance.listInvoices({ search: run }, departmentUser);
  assert(departmentInvoices.rows.length === 1 && departmentInvoices.rows[0].id === invoiceB.id, 'department user should see department invoice via customer');
  await rejects(() => finance.invoiceDetail(invoiceB.id, branchUser), 'branch user should not read other branch invoice');
  await rejects(() => finance.createInvoice({ invoiceCode: run + '-INV-NOLINK', items: [{ itemName: 'No link', quantity: 1, unitPrice: 1 }] }, branchUser), 'scoped invoice write should require scoped link');
  await rejects(() => finance.createInvoice({ invoiceCode: run + '-INV-OTHER', customerId: customerB.id, items: [{ itemName: 'Other', quantity: 1, unitPrice: 1 }] }, branchUser), 'scoped invoice write should reject other branch customer');

  const gitA = await gitTours.create({
    systemCode: run + '-GIT-A',
    tourCode: run + '-GITA',
    name: 'GIT A',
    customerName: 'GIT Customer A',
  }, branchUser);
  const gitB = await gitTours.create({
    systemCode: run + '-GIT-B',
    tourCode: run + '-GITB',
    name: 'GIT B',
    customerName: 'GIT Customer B',
    branch: 'BR-B',
    department: 'DEP-B',
  }, allUser);
  assert(gitA.branch === 'BR-A', 'GIT create should inject branch');
  const gitRows = await gitTours.list(run, undefined, branchUser);
  assert(gitRows.length === 1 && gitRows[0].id === gitA.id, 'GIT list should be branch scoped');
  await rejects(() => gitTours.detail(gitB.id, branchUser), 'GIT detail should reject other branch');
  assert((await gitTours.list(run, undefined, noScopeUser)).length === 0, 'GIT no-scope user should see no sensitive rows');

  const landA = await landTours.create({
    systemCode: run + '-LAND-A',
    tourCode: run + '-LANDA',
    name: 'Land A',
    customerName: 'Land Customer A',
  }, branchUser);
  const landB = await landTours.create({
    systemCode: run + '-LAND-B',
    tourCode: run + '-LANDB',
    name: 'Land B',
    customerName: 'Land Customer B',
    branch: 'BR-B',
    department: 'DEP-B',
  }, allUser);
  assert(landA.branch === 'BR-A', 'LandTour create should inject branch');
  assert((await landTours.list(run, undefined, branchUser)).length === 1, 'LandTour list should be branch scoped');
  await rejects(() => landTours.detail(landB.id, branchUser), 'LandTour detail should reject other branch');

  const fitA = await fitTours.create({
    quoteCode: run + '-FIT-A',
    tourCode: run + '-FITA',
    customerName: 'FIT Customer A',
  }, branchUser);
  const fitB = await fitTours.create({
    quoteCode: run + '-FIT-B',
    tourCode: run + '-FITB',
    customerName: 'FIT Customer B',
    branch: 'BR-B',
    department: 'DEP-B',
  }, allUser);
  assert(fitA.tour.branch === 'BR-A', 'FIT create should inject branch into linked tour');
  const fitRows = await fitTours.list(run, undefined, branchUser);
  assert(fitRows.length === 1 && fitRows[0].id === fitA.id, 'FIT list should be branch scoped through tour');
  await rejects(() => fitTours.detail(fitB.id, branchUser), 'FIT detail should reject other branch');

  await prisma.$disconnect();
  console.log('TEST_DATA_SCOPE_MODULE_FLOWS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
