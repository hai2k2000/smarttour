#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_customers_api_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
BOOTSTRAP_KEY="${BOOTSTRAP_KEY:-smarttour-api-test-bootstrap-key}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_CUSTOMERS_API_TEST missing POSTGRES_PASSWORD"
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
  -e SMARTTOUR_ENV=development \
  -e SMARTTOUR_AUTH_ENFORCE=true \
  -e SMARTTOUR_BOOTSTRAP_KEY="$BOOTSTRAP_KEY" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./apps/api/dist/app.module');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');

const password = 'StrongPass1';

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function sessionCookie(response, label = 'auth response') {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookies.find((value) => value.startsWith('smarttour.auth.token='));
  assert(cookie, `${label} should set smarttour.auth.token cookie`);
  return cookie.split(';')[0].slice('smarttour.auth.token='.length);
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const prisma = app.get(PrismaService);
  const run = `cust_api_${Date.now()}`;

  async function request(method, path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    } else if (options.form) {
      body = options.form;
    }
    if (options.token) headers.Cookie = `smarttour.auth.token=${options.token}`;
    const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    if (options.status !== undefined) {
      assert(response.status === options.status, `${method} ${path} expected ${options.status}, got ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    } else if (!response.ok) {
      throw new Error(`${method} ${path} failed ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return { response, data };
  }

  async function login(username) {
    const { response, data } = await request('POST', '/auth/login', { body: { username, password } });
    assert(data.token === undefined && data.tokenType === undefined, 'login response should not expose token JSON');
    return sessionCookie(response, 'login');
  }

  try {
    await request('GET', '/customers', { status: 401 });

    const adminUsername = `${run}_admin`;
    const { response: bootstrapResponse, data: bootstrap } = await request('POST', '/auth/bootstrap', {
      body: { email: `${adminUsername}@smarttour.local`, username: adminUsername, password, name: 'API Admin', bootstrapKey: process.env.SMARTTOUR_BOOTSTRAP_KEY },
      status: 201,
    });
    assert(bootstrap.token === undefined && bootstrap.tokenType === undefined, 'bootstrap response should not expose token JSON');
    const adminToken = sessionCookie(bootstrapResponse, 'bootstrap');

    const manageRoleCode = `${run}_customer_manage`;
    const viewRoleCode = `${run}_customer_view`;
    const noCustomerRoleCode = `${run}_no_customer`;
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: manageRoleCode, name: 'Customer Manage Branch', permissions: ['customer.view', 'customer.manage', 'data.scope.branch'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: viewRoleCode, name: 'Customer View Branch', permissions: ['customer.view', 'data.scope.branch'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: noCustomerRoleCode, name: 'No Customer Permission', permissions: ['order.manage', 'data.scope.branch'] },
      status: 201,
    });

    const manageUsername = `${run}_manage`;
    const viewUsername = `${run}_view`;
    const noCustomerUsername = `${run}_noperm`;
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${manageUsername}@smarttour.local`, username: manageUsername, password, name: 'Branch Manager', branch: 'BR-A', department: 'DEP-A', roleCodes: [manageRoleCode] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${viewUsername}@smarttour.local`, username: viewUsername, password, name: 'Branch Viewer', branch: 'BR-A', department: 'DEP-A', roleCodes: [viewRoleCode] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${noCustomerUsername}@smarttour.local`, username: noCustomerUsername, password, name: 'No Customer', branch: 'BR-A', department: 'DEP-A', roleCodes: [noCustomerRoleCode] },
      status: 201,
    });

    const manageToken = await login(manageUsername);
    const viewToken = await login(viewUsername);
    const noCustomerToken = await login(noCustomerUsername);

    await request('GET', '/customers', { token: noCustomerToken, status: 403 });
    await request('POST', '/customers', { token: viewToken, body: { code: `${run}-VIEW-CREATE`, fullName: 'View Only', phone: `${run}0` }, status: 403 });

    const branchCustomerPayload = {
      code: `${run}-A`,
      fullName: 'API Customer A',
      phone: `090${String(Date.now()).slice(-7)}`,
      email: `${run}-a@smarttour.local`,
      latestComment: 'Created from API test',
    };
    const { data: branchCustomer } = await request('POST', '/customers', { token: manageToken, body: branchCustomerPayload, status: 201 });
    assert(branchCustomer.branch === 'BR-A', 'POST /customers should inject branch scope for scoped manager');

    const { data: outOfScopeCustomer } = await request('POST', '/customers', {
      token: adminToken,
      body: { code: `${run}-B`, fullName: 'API Customer B', phone: `091${String(Date.now()).slice(-7)}`, branch: 'BR-B', department: 'DEP-B' },
      status: 201,
    });

    const scopedList = await request('GET', `/customers?search=${run}`, { token: viewToken });
    assert(scopedList.data.rows.length === 1 && scopedList.data.rows[0].id === branchCustomer.id, 'GET /customers should only return customers inside branch scope');
    const adminList = await request('GET', `/customers?search=${run}`, { token: adminToken });
    assert(adminList.data.rows.some((row) => row.id === branchCustomer.id) && adminList.data.rows.some((row) => row.id === outOfScopeCustomer.id), 'Admin GET /customers should see all scoped test customers');
    const scopedDashboard = await request('GET', `/customers/dashboard?search=${run}`, { token: viewToken });
    assert(scopedDashboard.data.totalCustomers === 1, 'GET /customers/dashboard should apply branch scope');

    await request('POST', '/customers', {
      token: manageToken,
      body: { code: `${run}-OUTSIDE-WRITE`, fullName: 'Outside Write', phone: `092${String(Date.now()).slice(-7)}`, branch: 'BR-B' },
      status: 400,
    });
    await request('GET', `/customers/${outOfScopeCustomer.id}`, { token: manageToken, status: 404 });

    const updated = await request('PUT', `/customers/${branchCustomer.id}`, {
      token: manageToken,
      body: { fullName: 'API Customer A Updated', latestComment: 'Updated through API' },
    });
    assert(updated.data.fullName === 'API Customer A Updated' && updated.data.latestComment === 'Updated through API', 'PUT /customers/:id should update customer');

    const { data: removable } = await request('POST', '/customers', {
      token: manageToken,
      body: { code: `${run}-DEL`, fullName: 'API Removable', phone: `093${String(Date.now()).slice(-7)}` },
      status: 201,
    });
    await request('DELETE', `/customers/${removable.id}`, { token: manageToken });
    await request('GET', `/customers/${removable.id}`, { token: manageToken, status: 404 });

    const { data: tag } = await request('POST', '/customers/tags', { token: manageToken, body: { name: `${run}-Tag`, isActive: true }, status: 201 });
    await request('POST', '/customers/bulk-tag', { token: manageToken, body: { customerIds: [branchCustomer.id, outOfScopeCustomer.id], tagIds: [tag.id] }, status: 400 });
    const bulkTag = await request('POST', '/customers/bulk-tag', { token: manageToken, body: { customerIds: [branchCustomer.id], tagIds: [tag.id] }, status: 201 });
    assert(bulkTag.data.affectedCustomers === 1, 'POST /customers/bulk-tag should tag scoped customers');
    await request('POST', '/customers/bulk-update', { token: manageToken, body: { customerIds: [branchCustomer.id], branch: 'BR-B' }, status: 400 });
    const bulkUpdate = await request('POST', '/customers/bulk-update', {
      token: manageToken,
      body: { customerIds: [branchCustomer.id], owner: 'api-owner', tagIds: [tag.id], actor: 'api-tester', note: 'bulk note' },
      status: 201,
    });
    assert(bulkUpdate.data.affectedCustomers === 1, 'POST /customers/bulk-update should update scoped customers');

    const order = await prisma.order.create({
      data: { type: 'FIT_TOUR', systemCode: `${run}-ORD-A`, name: 'API Order A', branch: 'BR-A', department: 'DEP-A', customerId: branchCustomer.id, customerPhone: branchCustomer.phone, totalRevenue: 1500, paidAmount: 500 },
    });
    await prisma.order.create({
      data: { type: 'FIT_TOUR', systemCode: `${run}-ORD-B`, name: 'API Order B', branch: 'BR-B', department: 'DEP-B', customerId: outOfScopeCustomer.id, totalRevenue: 9000, paidAmount: 0 },
    });
    await prisma.quotation.create({ data: { quoteCode: `${run}-Q-A`, productType: 'FIT', customerId: branchCustomer.id, customerPhone: branchCustomer.phone, customerName: branchCustomer.fullName, branch: 'BR-A', department: 'DEP-A' } });
    await prisma.tourQuote.create({ data: { quoteCode: `${run}-TQ-A`, tourCode: `${run}-TOUR-A`, customerId: branchCustomer.id, customerPhone: branchCustomer.phone, customerName: branchCustomer.fullName } });

    const detail = await request('GET', `/customers/${branchCustomer.id}`, { token: manageToken });
    assert(detail.data.related.orders.length === 1, 'GET /customers/:id should include related orders');
    assert(detail.data.related.quotes.length === 2, 'GET /customers/:id should include related quotations and tour quotes');
    assert(detail.data.related.debts.receivableDebt === 0, 'GET /customers/:id should not embed debt values without finance.debt.view');
    assert(detail.data.related.timeline.length > 0, 'GET /customers/:id should include timeline');
    await request('GET', `/customers/${branchCustomer.id}/debts`, { token: manageToken, status: 403 });
    const debtDetail = await request('GET', `/customers/${branchCustomer.id}`, { token: adminToken });
    assert(debtDetail.data.related.debts.receivableDebt === 1000, 'GET /customers/:id should include scoped debts for finance.debt.view users');
    const orders = await request('GET', `/customers/${branchCustomer.id}/orders`, { token: manageToken });
    const quotes = await request('GET', `/customers/${branchCustomer.id}/quotes`, { token: manageToken });
    const debts = await request('GET', `/customers/${branchCustomer.id}/debts`, { token: adminToken });
    const timeline = await request('GET', `/customers/${branchCustomer.id}/timeline?take=1`, { token: manageToken });
    assert(orders.data.rows.length === 1 && orders.data.rows[0].id === order.id, 'GET /customers/:id/orders should be scope filtered');
    assert(quotes.data.rows.length === 2, 'GET /customers/:id/quotes should return related quotes');
    assert(debts.data.receivableDebt === 1000, 'GET /customers/:id/debts should derive scoped debt for finance.debt.view users');
    assert(timeline.data.rows.length === 1 && timeline.data.pagination.total >= 1, 'GET /customers/:id/timeline should paginate');

    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'contract.txt');
    const uploaded = await request('POST', `/customers/${branchCustomer.id}/files`, { token: manageToken, form: uploadForm, status: 201 });
    assert(uploaded.data.id && uploaded.data.fileName === 'contract.txt', 'POST /customers/:id/files should upload customer file');
    await request('DELETE', `/customers/${branchCustomer.id}/files/${uploaded.data.id}`, { token: manageToken });
    assert(await prisma.customerFile.count({ where: { id: uploaded.data.id } }) === 0, 'DELETE /customers/:id/files/:fileId should remove file metadata');

    const importPhone = `094${String(Date.now()).slice(-7)}`;
    const importRows = await request('POST', '/customers/import', {
      token: manageToken,
      body: { rows: [{ code: `${run}-IMP`, fullName: 'CSV Imported Customer', phone: importPhone }, { code: `${run}-IMP-BAD`, fullName: 'Missing Phone' }] },
      status: 201,
    });
    assert(importRows.data.created === 1 && importRows.data.failed === 1 && importRows.data.errors[0].row === 2, 'POST /customers/import should import parsed CSV rows and report failed rows');
    const imported = await prisma.customer.findFirst({ where: { phone: importPhone } });
    assert(imported?.branch === 'BR-A', 'POST /customers/import should apply scoped branch writes');

    const target = await request('POST', '/customers', {
      token: manageToken,
      body: { code: `${run}-MERGE-TARGET`, fullName: 'Merge Target', phone: `095${String(Date.now()).slice(-7)}` },
      status: 201,
    });
    const source = await request('POST', '/customers', {
      token: manageToken,
      body: { code: `${run}-MERGE-SOURCE`, fullName: 'Merge Source', phone: `096${String(Date.now()).slice(-7)}` },
      status: 201,
    });
    await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: `${run}-ORD-SRC`, name: 'Source Order', branch: 'BR-A', department: 'DEP-A', customerId: source.data.id } });
    await prisma.quotation.create({ data: { quoteCode: `${run}-Q-SRC`, productType: 'FIT', customerId: source.data.id, customerName: source.data.fullName, branch: 'BR-A', department: 'DEP-A' } });
    const merged = await request('POST', `/customers/${target.data.id}/merge`, {
      token: manageToken,
      body: { sourceId: source.data.id, actor: 'api-merge', note: 'merge via api' },
      status: 201,
    });
    assert(merged.data.id === target.data.id, 'POST /customers/:id/merge should return target detail');
    assert((await prisma.customer.findUnique({ where: { id: source.data.id } })).status === 'MERGED', 'merge API should mark source as MERGED');
    assert(await prisma.order.count({ where: { customerId: target.data.id, systemCode: `${run}-ORD-SRC` } }) === 1, 'merge API should move related orders');
    assert(await prisma.quotation.count({ where: { customerId: target.data.id, quoteCode: `${run}-Q-SRC` } }) === 1, 'merge API should move related quotations');
    await request('POST', `/customers/${target.data.id}/merge`, { token: manageToken, body: { sourceId: outOfScopeCustomer.id }, status: 404 });

    const transfer = await request('POST', `/customers/${branchCustomer.id}/transfer-owner`, {
      token: manageToken,
      body: { owner: 'api-new-owner', reason: 'handover' },
      status: 201,
    });
    assert(transfer.data.owner === 'api-new-owner', 'POST /customers/:id/transfer-owner should update owner');
    assert(await prisma.customerTimeline.count({ where: { customerId: branchCustomer.id, eventType: 'TRANSFER_OWNER' } }) === 1, 'transfer owner should write timeline');

    const csv = await request('GET', `/customers/export?search=${run}`, { token: manageToken });
    assert(typeof csv.data === 'string' && csv.data.includes('code,fullName,phone,email,type,source,market,owner,branch,department,tags'), 'GET /customers/export should return CSV text');

    console.log('CUSTOMERS_API_TEST_OK');
  } finally {
    await app.close();
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
