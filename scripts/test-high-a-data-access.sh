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
const { OrdersService } = require('./apps/api/dist/modules/orders/orders.service');
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
  const reportQueryDto = fs.readFileSync('/workspace/apps/api/src/modules/reports/dto/report-query.dto.ts', 'utf8');
  const filesController = fs.readFileSync('/workspace/apps/api/src/modules/files/files.controller.ts', 'utf8');
  const quotesController = fs.readFileSync('/workspace/apps/api/src/modules/quotes/quotes.controller.ts', 'utf8');
  assert(reportsController.includes('ReportQueryDto'), 'reports controller must bind query through ReportQueryDto');
  assert(!reportsController.includes('Record<string, string>'), 'reports controller must not accept raw Record<string, string> query objects');
  assert(reportQueryDto.includes('IsDateString'), 'reports query DTO must validate date strings');
  assert(reportQueryDto.includes('OrderType') && reportQueryDto.includes('TourType') && reportQueryDto.includes('IsIn'), 'reports query DTO must validate report type values');
  assert(reportQueryDto.includes('OrderStatus') && reportQueryDto.includes('TourStatus') && reportQueryDto.includes('IsIn'), 'reports query DTO must validate report status values');
  assert(reportQueryDto.includes('OrderPaymentStatus') && reportQueryDto.includes('PaymentStatus') && reportQueryDto.includes('IsIn'), 'reports query DTO must validate payment status values');
  assert(reportQueryDto.includes('IsEnum(OrderCostStatus'), 'reports query DTO must validate order cost status enum');

  assert(reportsController.includes("@RequirePermissions('report.view', 'finance.cashflow.view')"), 'finance reports need finance.cashflow.view');
  assert(reportsController.includes("@RequirePermissions('report.view', 'finance.debt.view')"), 'debt reports need finance.debt.view');
  assert(reportsController.includes('this.assertSensitiveExportPermission(report, request?.user)'), 'sensitive report exports need specialized permissions');
  assert(filesController.includes('downloadAuthorized(key, request.user)'), 'generic file download must authorize the parent entity');
  assert(filesController.includes('removeAuthorized(key, request.user)'), 'generic file delete must authorize the parent entity');
  assert(quotesController.includes('listTourQuotes(query, request?.user)'), 'tour quote list must pass request.user');
  assert(quotesController.includes('getTourQuote(id, request?.user)'), 'tour quote detail must pass request.user');
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.finance), ['report.view', 'finance.cashflow.view']);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.customerDebt), ['report.view', 'finance.debt.view']);
  const reports = new ReportsController({ exportCsv: async () => 'ok' });
  const reportOnlyUser = user(null, null, 'data.scope.all', 'report.view', 'report.export');
  const exportResponse = { setHeader() {} };
  await assert.rejects(() => reports.export('finance', {}, { user: reportOnlyUser }, exportResponse), /Thi\u1ebfu quy\u1ec1n xem b\u00e1o c\u00e1o t\u00e0i ch\u00ednh/);
  assert.equal(await reports.export('finance', {}, { user: user(null, null, 'data.scope.all', 'report.view', 'report.export', 'finance.cashflow.view') }, exportResponse), 'ok');

  const prisma = new PrismaService();
  await prisma.$connect();
  const quotations = new QuotationsService(prisma);
  const quotes = new QuotesService(prisma);
  const orders = new OrdersService(prisma);
  const customersService = new CustomersService(prisma, {});
  const files = new FilesService(prisma);
  const run = `HIGH-A-${Date.now()}`;
  const branchUser = user('BR-A', 'DEP-A', 'data.scope.branch', 'customer.view', 'customer.manage', 'file.view', 'file.manage', 'quote.view', 'quote.manage', 'finance.receipt.view', 'finance.receipt.update');
  const scopeOnlyUser = user('BR-A', 'DEP-A', 'data.scope.branch', 'file.view', 'file.manage');
  const quoteNoScopeUser = user('BR-A', 'DEP-A', 'quote.view', 'quote.manage');
  const allUser = user(null, null, 'data.scope.all', '*');

  const customerA = await prisma.customer.create({
    data: { code: `${run}-CA`, fullName: 'Shared Customer Name', phone: `090${String(Date.now()).slice(-7)}`, email: `${run.toLowerCase()}-a@example.com`, branch: 'BR-A', department: 'DEP-A' },
  });
  const customerB = await prisma.customer.create({
    data: { code: `${run}-CB`, fullName: 'Shared Customer Name', phone: `091${String(Date.now()).slice(-7)}`, email: `${run.toLowerCase()}-b@example.com`, branch: 'BR-B', department: 'DEP-B' },
  });

  const scopedOrder = await orders.create('fit', {
    systemCode: `${run}-ORD-A`,
    name: 'Scoped order customer',
    customerId: customerA.id,
    salesItems: [{ description: 'Tour', quantity: 1, unitPrice: 100 }],
  }, branchUser);
  assert.equal(scopedOrder.customerId, customerA.id, 'scoped order create should link customer inside data scope');
  assert.equal(scopedOrder.customerName, customerA.fullName, 'scoped order create should snapshot customer inside data scope');
  await rejects(() => orders.create('fit', {
    systemCode: `${run}-ORD-OTHER-CUSTOMER`,
    name: 'Out of scope order customer',
    customerId: customerB.id,
    salesItems: [{ description: 'Tour', quantity: 1, unitPrice: 100 }],
  }, branchUser), 'scoped order create must reject customer outside data scope');
  await rejects(() => orders.update('fit', scopedOrder.id, { customerId: customerB.id }, branchUser), 'scoped order update must reject customer outside data scope');

  const quotationA = await quotations.create({ ...quotationPayload(`${run}-QA`, 'BR-A', 'DEP-A'), expiredDate: '2099-01-01' }, allUser);
  await rejects(
    () => quotations.create({ ...quotationPayload(`${run}-Q-BAD-RATE`, 'BR-A', 'DEP-A'), exchangeRate: 0 }, allUser),
    'quotation create should reject zero exchangeRate instead of defaulting it to one',
  );
  await rejects(
    () => quotations.create({ ...quotationPayload(`${run}-Q-BAD-QTY`, 'BR-A', 'DEP-A'), items: [{ serviceType: 'HOTEL', serviceName: 'Hotel', quantity: 0, nightCount: 1, paxCount: 1, netPrice: 100 }] }, allUser),
    'quotation create should reject zero item quantity instead of storing a zero line',
  );
  await rejects(
    () => quotations.create({ ...quotationPayload(`${run}-Q-BAD-NIGHT`, 'BR-A', 'DEP-A'), items: [{ serviceType: 'HOTEL', serviceName: 'Hotel', quantity: 1, nightCount: 0, paxCount: 1, netPrice: 100 }] }, allUser),
    'quotation create should reject zero item nightCount instead of storing a zero line',
  );
  await rejects(
    () => quotations.create({ ...quotationPayload(`${run}-Q-BAD-PAX`, 'BR-A', 'DEP-A'), items: [{ serviceType: 'HOTEL', serviceName: 'Hotel', quantity: 1, nightCount: 1, paxCount: 0, netPrice: 100 }] }, allUser),
    'quotation create should reject zero item paxCount instead of storing an invalid line',
  );
  const quotationB = await quotations.create(quotationPayload(`${run}-QB`, 'BR-B', 'DEP-B'), allUser);
  const convertCandidate = await quotations.create(quotationPayload(`${run}-QCONVERT`, 'BR-A', 'DEP-A'), allUser);
  await quotations.submit(convertCandidate.id, { actor: 'submitter' }, allUser);
  await quotations.approve(convertCandidate.id, { actor: 'approver' }, allUser);
  await rejects(
    () => quotations.update(convertCandidate.id, { route: 'Tampered approved route', items: [{ serviceType: 'HOTEL', serviceName: 'Tampered Hotel', quantity: 1, nightCount: 1, paxCount: 1, netPrice: 999 }] }, allUser),
    'approved quotation update should be rejected instead of silently changing approved commercial terms',
  );
  const approvedAfterRejectedUpdate = await quotations.detail(convertCandidate.id, allUser);
  assert.equal(approvedAfterRejectedUpdate.route, 'Ha Noi - Da Nang', 'rejected approved quotation update should not mutate route');
  assert.equal(Number(approvedAfterRejectedUpdate.items[0].netPrice), 100, 'rejected approved quotation update should not mutate items');
  const [convertedOnce, convertedTwice] = await Promise.all([
    quotations.convert(convertCandidate.id, { actor: 'converter-1' }, allUser),
    quotations.convert(convertCandidate.id, { actor: 'converter-2' }, allUser),
  ]);
  assert.equal(convertedOnce.convertedOrderId, convertedTwice.convertedOrderId, 'quotation convert should be idempotent under concurrent requests');
  const convertedAgain = await quotations.convert(convertCandidate.id, { actor: 'converter-3' }, allUser);
  assert.equal(convertedAgain.convertedOrderId, convertedOnce.convertedOrderId, 'quotation convert should return the existing converted order on repeat calls');
  assert.equal(await prisma.order.count({ where: { systemCode: `ORD-${convertCandidate.quoteCode}` } }), 1, 'quotation convert should create exactly one order for repeated convert calls');
  const scopedQuotationIds = (await quotations.list({ search: run }, branchUser)).map((row) => row.id);
  assert(scopedQuotationIds.includes(quotationA.id) && scopedQuotationIds.includes(convertCandidate.id) && !scopedQuotationIds.includes(quotationB.id), 'quotation list must be scoped');
  await rejects(() => quotations.detail(quotationB.id, branchUser), 'quotation detail must be scoped');

  await quotations.submit(quotationA.id, { actor: 'smart-submitter' }, allUser);
  await quotations.approve(quotationA.id, { actor: 'smart-approver' }, allUser);
  const smart = await quotations.smartLink(quotationA.id, true, allUser);
  assert.match(smart.smartLinkToken, /^[A-Za-z0-9_-]{43}$/, 'SmartLink token must be 32 random bytes encoded as base64url');
  assert(!smart.smartLinkToken.toLowerCase().includes(quotationA.quoteCode.toLowerCase()), 'SmartLink token must not expose quote code');
  assertPublicQuotation(await quotations.publicDetail(smart.smartLinkToken));
  const repeatedEnable = await quotations.smartLink(quotationA.id, true, allUser);
  assert.equal(repeatedEnable.smartLinkToken, smart.smartLinkToken, 'SmartLink token should stay stable when already enabled');
  await quotations.smartLink(quotationA.id, false, allUser);
  const reenabledSmart = await quotations.smartLink(quotationA.id, true, allUser);
  assert.notEqual(reenabledSmart.smartLinkToken, smart.smartLinkToken, 'SmartLink token should rotate when transitioning from disabled to enabled');
  await prisma.quotation.update({ where: { id: quotationA.id }, data: { smartLinkToken: `${quotationA.quoteCode.toLowerCase()}-legacy`, smartLinkEnabled: true } });
  await rejects(() => quotations.publicDetail(`${quotationA.quoteCode.toLowerCase()}-legacy`), 'predictable legacy SmartLink tokens must be rejected');

  const tourA = await quotes.createTourQuote(tourPayload(`${run}-TA`, customerA), branchUser);
  assert.equal(tourA.customerId, customerA.id, 'scoped tour quote create must link the scoped customer');
  await rejects(
    () => quotes.createTourQuote({ ...tourPayload(`${run}-TQ-BAD-RATE`, customerA), exchangeRate: 0 }, branchUser),
    'tour quote create should reject zero exchangeRate instead of defaulting it to one',
  );
  await rejects(() => quotes.createTourQuote(tourPayload(`${run}-TB-BLOCK`, customerB), branchUser), 'scoped tour quote create must reject customer outside scope');
  const tourB = await quotes.createTourQuote(tourPayload(`${run}-TB`, customerB), allUser);
  await prisma.tourQuote.update({ where: { id: tourB.id }, data: { customerId: customerB.id, customerName: customerA.fullName } });
  assert.deepEqual((await quotes.listTourQuotes({ search: run }, branchUser)).map((row) => row.id), [tourA.id], 'tour quote list must be scoped through customer');
  await rejects(() => quotes.getTourQuote(tourB.id, branchUser), 'tour quote detail must reject rows outside scope');
  await rejects(() => quotes.updateTourQuote(tourB.id, { route: 'blocked' }, branchUser), 'tour quote update must reject rows outside scope');
  await rejects(() => quotes.deleteTourQuote(tourB.id, branchUser), 'tour quote delete must reject rows outside scope');
  await rejects(() => quotes.approveTourQuote(tourB.id, {}, branchUser), 'tour quote actions must reject rows outside scope');

  const approvedTourA = await quotes.approveTourQuote(tourA.id, { approvedBy: 'client-spoof', approvalNote: 'approve note' }, branchUser);
  assert.equal(approvedTourA.approvedBy, branchUser.id, 'tour quote approve must derive approvedBy from request.user');
  const rejectCandidate = await quotes.createTourQuote(tourPayload(`${run}-TR`, customerA), branchUser);
  const rejectedTour = await quotes.rejectTourQuote(rejectCandidate.id, { approvedBy: 'client-reject-spoof', approvalNote: 'reject note' }, branchUser);
  assert.equal(rejectedTour.approvedBy, branchUser.id, 'tour quote reject must derive approvedBy from request.user');

  const related = await customersService.quotes(customerA.id, branchUser);
  assert(related.rows.some((row) => row.id === tourA.id), 'customer quotes must include scoped tour quote');
  assert(!related.rows.some((row) => row.id === tourB.id), 'customer quotes must not leak same-name tour quote from another branch');

  await rejects(
    () => quotes.createComboQuote({ comboCode: `${run}-CB-NOSCOPE`, comboType: 'Hotel combo', items: [{ serviceName: 'Combo hotel', nightCount: 1, paxCount: 1, netPricePerService: 100 }] }, quoteNoScopeUser),
    'combo quote create should reject users without data scope',
  );
  await rejects(
    () => quotes.createComboQuote({ comboCode: `${run}-CB-BAD-NIGHT`, comboType: 'Hotel combo', items: [{ serviceName: 'Combo hotel', nightCount: 0, paxCount: 1, netPricePerService: 100 }] }),
    'combo quote create should reject zero nightCount instead of defaulting it to one',
  );

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
  const absoluteKeyA = `customers/${customerA.id}/2026/06/file-absolute.pdf`;
  await prisma.customerFile.create({ data: { customerId: customerA.id, fileName: 'absolute.pdf', fileUrl: `https://aitour.io.vn/api/files/download?key=${encodeURIComponent(absoluteKeyA)}` } });
  await files.assertObjectAccess(absoluteKeyA, branchUser, 'view');
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
