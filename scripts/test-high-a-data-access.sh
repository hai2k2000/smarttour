#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_high_a_data_access_test}"
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
  -v "$PWD:/workspace:ro" \
  -e DATABASE_URL="postgresql://smarttour:${POSTGRES_PASSWORD}@postgres:5432/${TEST_DB}?schema=public" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { CustomersService } = require('./apps/api/dist/modules/customers/customers.service');
const { FilesService } = require('./apps/api/dist/modules/files/files.service');
const { QuotationsService } = require('./apps/api/dist/modules/quotations/quotations.service');
const { QuotesService } = require('./apps/api/dist/modules/quotes/quotes.service');
const { ReportsController } = require('./apps/api/dist/modules/reports/reports.controller');
const { PERMISSIONS_KEY } = require('./apps/api/dist/modules/auth/permissions.decorator');

function role(...permissions) {
  return { role: { permissions: permissions.map((permission) => ({ permission })) } };
}

function user(branch, department, ...permissions) {
  return { id: `${branch || 'all'}-${department || 'all'}`, branch, department, roles: [role(...permissions)] };
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

function tourPayload(code, customer) {
  return {
    quoteCode: code,
    tourCode: `${code}-TOUR`,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    costItems: [{ costType: 'COMMON', serviceType: 'GUIDE', description: 'Guide', unitPrice: 100 }],
  };
}

function quotationPayload(code, branch, department) {
  return {
    quoteCode: code,
    productType: 'FIT',
    customerCode: 'PRIVATE-CUSTOMER-CODE',
    customerName: 'Public Customer',
    customerPhone: '0909999999',
    customerEmail: 'private@example.com',
    salesOwner: 'Internal Sales',
    operatorOwner: 'Internal Operator',
    branch,
    department,
    route: 'Ha Noi - Da Nang',
    note: 'internal note',
    items: [{
      serviceType: 'HOTEL',
      supplierName: 'Internal Supplier',
      serviceName: 'Hotel',
      quantity: 1,
      netPrice: 100,
      markupAmount: 20,
      note: 'internal item note',
    }],
  };
}

function assertPublicQuotation(row) {
  const forbidden = [
    'id', 'customerCode', 'customerPhone', 'customerEmail', 'salesOwner', 'operatorOwner', 'branch', 'department',
    'totalCost', 'totalMarkup', 'costPerPax', 'profitPerPax', 'marginRate', 'smartLinkToken', 'note', 'logs',
  ];
  for (const field of forbidden) assert(!(field in row), `public quotation leaked ${field}`);
  for (const item of row.items || []) {
    for (const field of ['id', 'quotationId', 'supplierId', 'supplierName', 'serviceId', 'netPrice', 'vat', 'markupAmount', 'markupPercent', 'note']) {
      assert(!(field in item), `public quotation item leaked ${field}`);
    }
  }
}

async function main() {
  const reportsController = fs.readFileSync('/workspace/apps/api/src/modules/reports/reports.controller.ts', 'utf8');
  const filesController = fs.readFileSync('/workspace/apps/api/src/modules/files/files.controller.ts', 'utf8');
  const quotesController = fs.readFileSync('/workspace/apps/api/src/modules/quotes/quotes.controller.ts', 'utf8');
  assert(reportsController.includes("@RequirePermissions('report.view', 'finance.cashflow.view')"), 'finance reports need finance.cashflow.view');
  assert(reportsController.includes("@RequirePermissions('report.view', 'finance.debt.view')"), 'debt reports need finance.debt.view');
  assert(reportsController.includes('this.assertSensitiveExportPermission(report, request?.user)'), 'sensitive report exports need specialized permissions');
  assert(filesController.includes('downloadAuthorized(key, request.user)'), 'generic file download must authorize the parent entity');
  assert(filesController.includes('removeAuthorized(key, request.user)'), 'generic file delete must authorize the parent entity');
  assert(quotesController.includes('listTourQuotes(search, request?.user)'), 'tour quote list must pass request.user');
  assert(quotesController.includes('getTourQuote(id, request?.user)'), 'tour quote detail must pass request.user');
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.finance), ['report.view', 'finance.cashflow.view']);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.customerDebt), ['report.view', 'finance.debt.view']);
  const reports = new ReportsController({ exportCsv: () => 'ok' });
  const reportOnlyUser = user(null, null, 'data.scope.all', 'report.view', 'report.export');
  assert.throws(() => reports.export('finance', {}, { user: reportOnlyUser }), /Thiếu quyền xem báo cáo tài chính/);
  assert.equal(reports.export('finance', {}, { user: user(null, null, 'data.scope.all', 'report.view', 'report.export', 'finance.cashflow.view') }), 'ok');

  const prisma = new PrismaService();
  await prisma.$connect();
  const quotations = new QuotationsService(prisma);
  const quotes = new QuotesService(prisma);
  const customersService = new CustomersService(prisma, {});
  const files = new FilesService(prisma);
  const run = `HIGH-A-${Date.now()}`;
  const branchUser = user('BR-A', 'DEP-A', 'data.scope.branch', 'customer.view', 'customer.manage', 'file.view', 'file.manage', 'quote.view', 'quote.manage', 'finance.receipt.view', 'finance.receipt.update');
  const scopeOnlyUser = user('BR-A', 'DEP-A', 'data.scope.branch', 'file.view', 'file.manage');
  const allUser = user(null, null, 'data.scope.all', '*');

  const customerA = await prisma.customer.create({
    data: { code: `${run}-CA`, fullName: 'Shared Customer Name', phone: `090${String(Date.now()).slice(-7)}`, email: `${run.toLowerCase()}-a@example.com`, branch: 'BR-A', department: 'DEP-A' },
  });
  const customerB = await prisma.customer.create({
    data: { code: `${run}-CB`, fullName: 'Shared Customer Name', phone: `091${String(Date.now()).slice(-7)}`, email: `${run.toLowerCase()}-b@example.com`, branch: 'BR-B', department: 'DEP-B' },
  });

  const quotationA = await quotations.create(quotationPayload(`${run}-QA`, 'BR-A', 'DEP-A'), allUser);
  const quotationB = await quotations.create(quotationPayload(`${run}-QB`, 'BR-B', 'DEP-B'), allUser);
  assert.deepEqual((await quotations.list({ search: run }, branchUser)).map((row) => row.id), [quotationA.id], 'quotation list must be scoped');
  await rejects(() => quotations.detail(quotationB.id, branchUser), 'quotation detail must be scoped');

  const smart = await quotations.smartLink(quotationA.id, true, allUser);
  assert.match(smart.smartLinkToken, /^[A-Za-z0-9_-]{43}$/, 'SmartLink token must be 32 random bytes encoded as base64url');
  assert(!smart.smartLinkToken.toLowerCase().includes(quotationA.quoteCode.toLowerCase()), 'SmartLink token must not expose quote code');
  assertPublicQuotation(await quotations.publicDetail(smart.smartLinkToken));
  const rotatedSmart = await quotations.smartLink(quotationA.id, true, allUser);
  assert.notEqual(rotatedSmart.smartLinkToken, smart.smartLinkToken, 'SmartLink token must rotate when enabled');
  await prisma.quotation.update({ where: { id: quotationA.id }, data: { smartLinkToken: `${quotationA.quoteCode.toLowerCase()}-legacy`, smartLinkEnabled: true } });
  await rejects(() => quotations.publicDetail(`${quotationA.quoteCode.toLowerCase()}-legacy`), 'predictable legacy SmartLink tokens must be rejected');

  const tourA = await quotes.createTourQuote(tourPayload(`${run}-TA`, customerA), branchUser);
  assert.equal(tourA.customerId, customerA.id, 'scoped tour quote create must link the scoped customer');
  await rejects(() => quotes.createTourQuote(tourPayload(`${run}-TB-BLOCK`, customerB), branchUser), 'scoped tour quote create must reject customer outside scope');
  const tourB = await quotes.createTourQuote(tourPayload(`${run}-TB`, customerB), allUser);
  await prisma.tourQuote.update({ where: { id: tourB.id }, data: { customerId: customerB.id, customerName: customerA.fullName } });
  assert.deepEqual((await quotes.listTourQuotes(run, branchUser)).map((row) => row.id), [tourA.id], 'tour quote list must be scoped through customer');
  await rejects(() => quotes.getTourQuote(tourB.id, branchUser), 'tour quote detail must reject rows outside scope');
  await rejects(() => quotes.updateTourQuote(tourB.id, { route: 'blocked' }, branchUser), 'tour quote update must reject rows outside scope');
  await rejects(() => quotes.deleteTourQuote(tourB.id, branchUser), 'tour quote delete must reject rows outside scope');
  await rejects(() => quotes.approveTourQuote(tourB.id, {}, branchUser), 'tour quote actions must reject rows outside scope');

  const related = await customersService.quotes(customerA.id, branchUser);
  assert(related.rows.some((row) => row.id === tourA.id), 'customer quotes must include scoped tour quote');
  assert(!related.rows.some((row) => row.id === tourB.id), 'customer quotes must not leak same-name tour quote from another branch');

  const keyA = `customers/${customerA.id}/2026/06/file-a.pdf`;
  const keyB = `customers/${customerB.id}/2026/06/file-b.pdf`;
  const url = (key) => `/api/files/download?key=${encodeURIComponent(key)}`;
  await prisma.customerFile.createMany({
    data: [
      { customerId: customerA.id, fileName: 'a.pdf', fileUrl: url(keyA) },
      { customerId: customerB.id, fileName: 'b.pdf', fileUrl: url(keyB) },
    ],
  });
  await files.assertObjectAccess(keyA, branchUser, 'view');
  await files.assertObjectAccess(keyA, branchUser, 'manage');
  await rejects(() => files.assertObjectAccess(keyA, scopeOnlyUser, 'view'), 'file access must require parent module permission');
  await rejects(() => files.assertObjectAccess(keyB, branchUser, 'view'), 'file access must reject parent outside scope');
  await rejects(() => files.assertObjectAccess(`customers/${customerA.id}/2026/06/orphan.pdf`, branchUser, 'view'), 'file access must reject missing metadata');
  await rejects(() => files.assertObjectAccess('unknown/2026/06/file.pdf', allUser, 'view'), 'file access must reject unknown parent types');

  const receiptKeyA = `finance/receipts/receipt-a/2026/06/file-a.pdf`;
  const receiptKeyB = `finance/receipts/receipt-b/2026/06/file-b.pdf`;
  await prisma.financeReceipt.createMany({
    data: [
      { id: 'receipt-a', receiptCode: `${run}-RA`, receiptName: 'Receipt A', branch: 'BR-A', department: 'DEP-A', attachmentUrl: url(receiptKeyA) },
      { id: 'receipt-b', receiptCode: `${run}-RB`, receiptName: 'Receipt B', branch: 'BR-B', department: 'DEP-B', attachmentUrl: url(receiptKeyB) },
    ],
  });
  await files.assertObjectAccess(receiptKeyA, branchUser, 'view');
  await files.assertObjectAccess(receiptKeyA, branchUser, 'manage');
  await rejects(() => files.assertObjectAccess(receiptKeyB, branchUser, 'view'), 'finance file access must reject parent outside scope');

  await prisma.$disconnect();
  console.log('TEST_HIGH_A_DATA_ACCESS_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
