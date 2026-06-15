#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_data_scope_api_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_DATA_SCOPE_API_TEST missing POSTGRES_PASSWORD"
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
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./apps/api/dist/app.module');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');

const password = 'StrongPass1';

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function ids(rows) {
  return new Set(rows.map((row) => row.id));
}

function hasOnly(rows, expectedIds, label) {
  const actual = ids(rows);
  assert(actual.size === expectedIds.length && expectedIds.every((id) => actual.has(id)), label);
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const prisma = app.get(PrismaService);
  const run = `scope_api_${Date.now()}`;

  async function request(method, path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (options.status !== undefined) {
      assert(
        response.status === options.status,
        `${method} ${path} expected ${options.status}, got ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
      );
    } else if (!response.ok) {
      throw new Error(`${method} ${path} failed ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return { response, data };
  }

  async function login(username) {
    const { data } = await request('POST', '/auth/login', { body: { username, password } });
    return data.token;
  }

  try {
    const adminUsername = `${run}_admin`;
    const { data: bootstrap } = await request('POST', '/auth/bootstrap', {
      body: { email: `${adminUsername}@smarttour.local`, username: adminUsername, password, name: 'Data Scope Admin' },
      status: 201,
    });
    const adminToken = bootstrap.token;
    const commonPermissions = [
      'customer.view',
      'customer.manage',
      'order.view',
      'order.manage',
      'operation.form.view',
      'operation.form.manage',
      'report.view',
      'report.export',
    ];
    const roleCodes = {
      branch: `${run}_branch`,
      department: `${run}_department`,
      all: `${run}_all`,
    };

    for (const [scope, permission] of [
      ['branch', 'data.scope.branch'],
      ['department', 'data.scope.department'],
      ['all', 'data.scope.all'],
    ]) {
      await request('POST', '/auth/roles', {
        token: adminToken,
        body: {
          code: roleCodes[scope],
          name: `Data Scope ${scope}`,
          permissions: [...commonPermissions, permission],
        },
        status: 201,
      });
    }

    const usernames = {
      branch: `${run}_branch_user`,
      department: `${run}_department_user`,
      all: `${run}_all_user`,
    };
    await request('POST', '/auth/users', {
      token: adminToken,
      body: {
        email: `${usernames.branch}@smarttour.local`,
        username: usernames.branch,
        password,
        name: 'Branch Scope User',
        branch: 'BR-A',
        department: 'DEP-X',
        roleCodes: [roleCodes.branch],
      },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: {
        email: `${usernames.department}@smarttour.local`,
        username: usernames.department,
        password,
        name: 'Department Scope User',
        branch: 'BR-X',
        department: 'DEP-B',
        roleCodes: [roleCodes.department],
      },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: {
        email: `${usernames.all}@smarttour.local`,
        username: usernames.all,
        password,
        name: 'Unrestricted Scope User',
        roleCodes: [roleCodes.all],
      },
      status: 201,
    });

    const tokens = {
      branch: await login(usernames.branch),
      department: await login(usernames.department),
      all: await login(usernames.all),
    };
    const branchMe = (await request('GET', '/auth/me', { token: tokens.branch })).data;
    const departmentMe = (await request('GET', '/auth/me', { token: tokens.department })).data;
    const allMe = (await request('GET', '/auth/me', { token: tokens.all })).data;
    assert(branchMe.dataScope === 'branch' && branchMe.branch === 'BR-A', 'branch user should expose BR-A branch scope');
    assert(departmentMe.dataScope === 'department' && departmentMe.department === 'DEP-B', 'department user should expose DEP-B department scope');
    assert(allMe.dataScope === 'all', 'unrestricted user should expose all data scope');

    const nowSuffix = String(Date.now()).slice(-7);
    const customerA = (await request('POST', '/customers', {
      token: adminToken,
      body: {
        code: `${run}-CA`,
        fullName: `${run} Customer A`,
        phone: `081${nowSuffix}`,
        branch: 'BR-A',
        department: 'DEP-A',
      },
      status: 201,
    })).data;
    const customerB = (await request('POST', '/customers', {
      token: adminToken,
      body: {
        code: `${run}-CB`,
        fullName: `${run} Customer B`,
        phone: `082${nowSuffix}`,
        branch: 'BR-B',
        department: 'DEP-B',
      },
      status: 201,
    })).data;

    const startDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const orderA = await prisma.order.create({
      data: {
        type: 'FIT_TOUR',
        systemCode: `${run}-ORDER-A`,
        name: `${run} Order A`,
        customerId: customerA.id,
        customerName: customerA.fullName,
        branch: 'BR-A',
        department: 'DEP-A',
        startDate,
        endDate,
        status: 'UPCOMING',
        totalRevenue: 1000,
        paidAmount: 400,
        remainingRevenue: 600,
        totalCost: 500,
        paidCost: 200,
        remainingCost: 300,
        profit: 500,
        commission: 50,
        operatorOwner: 'scope-operator-a',
      },
    });
    const orderB = await prisma.order.create({
      data: {
        type: 'FIT_TOUR',
        systemCode: `${run}-ORDER-B`,
        name: `${run} Order B`,
        customerId: customerB.id,
        customerName: customerB.fullName,
        branch: 'BR-B',
        department: 'DEP-B',
        startDate,
        endDate,
        status: 'UPCOMING',
        totalRevenue: 2000,
        paidAmount: 1500,
        remainingRevenue: 500,
        totalCost: 1200,
        paidCost: 1000,
        remainingCost: 200,
        profit: 800,
        commission: 80,
        operatorOwner: 'scope-operator-b',
      },
    });

    const tourProgram = await prisma.tourProgram.create({
      data: { code: `${run}-TP`, name: `${run} Tour Program`, route: 'HAN-DAD', durationDays: 3 },
    });
    const bookingA = await prisma.booking.create({
      data: {
        code: `${run}-BOOKING-A`,
        tourProgramId: tourProgram.id,
        customerId: customerA.id,
        orderId: orderA.id,
        customerName: customerA.fullName,
        paxCount: 2,
        startDate,
        endDate,
        status: 'CONFIRMED',
      },
    });
    const bookingB = await prisma.booking.create({
      data: {
        code: `${run}-BOOKING-B`,
        tourProgramId: tourProgram.id,
        customerId: customerB.id,
        orderId: orderB.id,
        customerName: customerB.fullName,
        paxCount: 2,
        startDate,
        endDate,
        status: 'CONFIRMED',
      },
    });
    const formA = await prisma.operationForm.create({
      data: { bookingId: bookingA.id, orderId: orderA.id, status: 'PENDING', notes: `${run} Form A` },
    });
    const formB = await prisma.operationForm.create({
      data: { bookingId: bookingB.id, orderId: orderB.id, status: 'PENDING', notes: `${run} Form B` },
    });

    const branchCustomers = (await request('GET', `/customers?search=${run}`, { token: tokens.branch })).data;
    const departmentCustomers = (await request('GET', `/customers?search=${run}`, { token: tokens.department })).data;
    const allCustomers = (await request('GET', `/customers?search=${run}`, { token: tokens.all })).data;
    hasOnly(branchCustomers.rows, [customerA.id], 'branch user should list only matching branch customer');
    hasOnly(departmentCustomers.rows, [customerB.id], 'department user should list only matching department customer');
    hasOnly(allCustomers.rows, [customerA.id, customerB.id], 'unrestricted user should list all customers');

    const branchCustomerDashboard = (await request('GET', `/customers/dashboard?search=${run}`, { token: tokens.branch })).data;
    const departmentCustomerDashboard = (await request('GET', `/customers/dashboard?search=${run}`, { token: tokens.department })).data;
    const allCustomerDashboard = (await request('GET', `/customers/dashboard?search=${run}`, { token: tokens.all })).data;
    assert(branchCustomerDashboard.totalCustomers === 1, 'branch user should see one customer in dashboard');
    assert(departmentCustomerDashboard.totalCustomers === 1, 'department user should see one customer in dashboard');
    assert(allCustomerDashboard.totalCustomers === 2, 'unrestricted user should see all customers in dashboard');

    const branchCustomerCsv = (await request('GET', `/customers/export?search=${run}`, { token: tokens.branch })).data;
    const departmentCustomerCsv = (await request('GET', `/customers/export?search=${run}`, { token: tokens.department })).data;
    const allCustomerCsv = (await request('GET', `/customers/export?search=${run}`, { token: tokens.all })).data;
    assert(branchCustomerCsv.includes(customerA.code) && !branchCustomerCsv.includes(customerB.code), 'branch user should export only matching branch customer');
    assert(departmentCustomerCsv.includes(customerB.code) && !departmentCustomerCsv.includes(customerA.code), 'department user should export only matching department customer');
    assert(allCustomerCsv.includes(customerA.code) && allCustomerCsv.includes(customerB.code), 'unrestricted user should export all customers');

    await request('GET', `/customers/${customerA.id}`, { token: tokens.branch });
    await request('GET', `/customers/${customerB.id}`, { token: tokens.branch, status: 404 });
    await request('GET', `/customers/${customerB.id}`, { token: tokens.department });
    await request('GET', `/customers/${customerA.id}`, { token: tokens.department, status: 404 });
    await request('GET', `/customers/${customerA.id}`, { token: tokens.all });
    await request('GET', `/customers/${customerB.id}`, { token: tokens.all });

    const branchOrders = (await request('GET', `/orders/fit-tours?search=${run}`, { token: tokens.branch })).data;
    const departmentOrders = (await request('GET', `/orders/fit-tours?search=${run}`, { token: tokens.department })).data;
    const allOrders = (await request('GET', `/orders/fit-tours?search=${run}`, { token: tokens.all })).data;
    hasOnly(branchOrders, [orderA.id], 'branch user should list only matching branch order');
    hasOnly(departmentOrders, [orderB.id], 'department user should list only matching department order');
    hasOnly(allOrders, [orderA.id, orderB.id], 'unrestricted user should list all orders');

    await request('GET', `/orders/fit-tours/${orderA.id}`, { token: tokens.branch });
    await request('GET', `/orders/fit-tours/${orderB.id}`, { token: tokens.branch, status: 404 });
    await request('GET', `/orders/fit-tours/${orderB.id}`, { token: tokens.department });
    await request('GET', `/orders/fit-tours/${orderA.id}`, { token: tokens.department, status: 404 });
    await request('GET', `/orders/fit-tours/${orderA.id}`, { token: tokens.all });
    await request('GET', `/orders/fit-tours/${orderB.id}`, { token: tokens.all });

    const branchForms = (await request('GET', `/operations/forms?search=${run}`, { token: tokens.branch })).data;
    const departmentForms = (await request('GET', `/operations/forms?search=${run}`, { token: tokens.department })).data;
    const allForms = (await request('GET', `/operations/forms?search=${run}`, { token: tokens.all })).data;
    hasOnly(branchForms, [formA.id], 'branch user should list only matching branch operation form');
    hasOnly(departmentForms, [formB.id], 'department user should list only matching department operation form');
    hasOnly(allForms, [formA.id, formB.id], 'unrestricted user should list all operation forms');

    await request('GET', `/operations/forms/${formA.id}`, { token: tokens.branch });
    await request('GET', `/operations/forms/${formB.id}`, { token: tokens.branch, status: 404 });
    await request('GET', `/operations/forms/${formB.id}`, { token: tokens.department });
    await request('GET', `/operations/forms/${formA.id}`, { token: tokens.department, status: 404 });
    await request('GET', `/operations/forms/${formA.id}`, { token: tokens.all });
    await request('GET', `/operations/forms/${formB.id}`, { token: tokens.all });

    const branchOperationsDashboard = (await request('GET', '/operations/dashboard', { token: tokens.branch })).data;
    const departmentOperationsDashboard = (await request('GET', '/operations/dashboard', { token: tokens.department })).data;
    const allOperationsDashboard = (await request('GET', '/operations/dashboard', { token: tokens.all })).data;
    assert(branchOperationsDashboard.upcomingDepartures === 1, 'branch user should see one upcoming departure');
    assert(departmentOperationsDashboard.upcomingDepartures === 1, 'department user should see one upcoming departure');
    assert(allOperationsDashboard.upcomingDepartures === 2, 'unrestricted user should see all upcoming departures');

    const branchOverview = (await request('GET', `/reports/overview?search=${run}`, { token: tokens.branch })).data;
    const departmentOverview = (await request('GET', `/reports/overview?search=${run}`, { token: tokens.department })).data;
    const allOverview = (await request('GET', `/reports/overview?search=${run}`, { token: tokens.all })).data;
    assert(branchOverview.totalOrders === 1 && Number(branchOverview.totalRevenue) === 1000, 'branch user should see only matching branch report totals');
    assert(departmentOverview.totalOrders === 1 && Number(departmentOverview.totalRevenue) === 2000, 'department user should see only matching department report totals');
    assert(allOverview.totalOrders === 2 && Number(allOverview.totalRevenue) === 3000, 'unrestricted user should see all report totals');

    const branchSummary = (await request('GET', `/reports/business-summary?search=${run}`, { token: tokens.branch })).data;
    const departmentSummary = (await request('GET', `/reports/business-summary?search=${run}`, { token: tokens.department })).data;
    const allSummary = (await request('GET', `/reports/business-summary?search=${run}`, { token: tokens.all })).data;
    hasOnly(branchSummary.recentOrders, [orderA.id], 'branch user should see only matching branch business summary');
    hasOnly(departmentSummary.recentOrders, [orderB.id], 'department user should see only matching department business summary');
    hasOnly(allSummary.recentOrders, [orderA.id, orderB.id], 'unrestricted user should see all business summary orders');

    const branchReportCsv = (await request('GET', `/reports/export/revenue?search=${run}&groupBy=by-branch`, { token: tokens.branch })).data;
    const departmentReportCsv = (await request('GET', `/reports/export/revenue?search=${run}&groupBy=by-branch`, { token: tokens.department })).data;
    const allReportCsv = (await request('GET', `/reports/export/revenue?search=${run}&groupBy=by-branch`, { token: tokens.all })).data;
    assert(branchReportCsv.includes('BR-A') && !branchReportCsv.includes('BR-B'), 'branch user should export only matching branch report data');
    assert(departmentReportCsv.includes('BR-B') && !departmentReportCsv.includes('BR-A'), 'department user should export only matching department report data');
    assert(allReportCsv.includes('BR-A') && allReportCsv.includes('BR-B'), 'unrestricted user should export all report data');

    const bypassBranchCustomers = (await request('GET', `/customers?search=${run}&branch=BR-B`, { token: tokens.branch })).data;
    const bypassDepartmentCustomers = (await request('GET', `/customers?search=${run}&department=DEP-A`, { token: tokens.department })).data;
    const bypassBranchReport = (await request('GET', `/reports/overview?search=${run}&branch=BR-B`, { token: tokens.branch })).data;
    assert(bypassBranchCustomers.rows.length === 0, 'branch user should not bypass scope with branch filter');
    assert(bypassDepartmentCustomers.rows.length === 0, 'department user should not bypass scope with department filter');
    assert(bypassBranchReport.totalOrders === 0, 'branch user should not bypass report scope with branch filter');

    await request('PUT', `/customers/${customerA.id}`, {
      token: tokens.branch,
      body: { latestComment: 'branch mutation allowed' },
    });
    await request('PUT', `/customers/${customerB.id}`, {
      token: tokens.branch,
      body: { latestComment: 'branch mutation blocked' },
      status: 404,
    });
    await request('PUT', `/customers/${customerB.id}`, {
      token: tokens.department,
      body: { latestComment: 'department mutation allowed' },
    });
    await request('PUT', `/customers/${customerA.id}`, {
      token: tokens.department,
      body: { latestComment: 'department mutation blocked' },
      status: 404,
    });
    await request('PUT', `/customers/${customerA.id}`, {
      token: tokens.all,
      body: { latestComment: 'unrestricted mutation A' },
    });
    await request('PUT', `/customers/${customerB.id}`, {
      token: tokens.all,
      body: { latestComment: 'unrestricted mutation B' },
    });

    await request('PUT', `/orders/fit-tours/${orderA.id}`, {
      token: tokens.branch,
      body: { note: 'branch order mutation allowed' },
    });
    await request('PUT', `/orders/fit-tours/${orderB.id}`, {
      token: tokens.branch,
      body: { note: 'branch order mutation blocked' },
      status: 404,
    });
    await request('PUT', `/orders/fit-tours/${orderB.id}`, {
      token: tokens.department,
      body: { note: 'department order mutation allowed' },
    });
    await request('PUT', `/orders/fit-tours/${orderA.id}`, {
      token: tokens.department,
      body: { note: 'department order mutation blocked' },
      status: 404,
    });

    await request('PUT', `/operations/forms/${formA.id}`, {
      token: tokens.branch,
      body: { notes: 'branch operation mutation allowed' },
    });
    await request('PUT', `/operations/forms/${formB.id}`, {
      token: tokens.branch,
      body: { notes: 'branch operation mutation blocked' },
      status: 404,
    });
    await request('PUT', `/operations/forms/${formB.id}`, {
      token: tokens.department,
      body: { notes: 'department operation mutation allowed' },
    });
    await request('PUT', `/operations/forms/${formA.id}`, {
      token: tokens.department,
      body: { notes: 'department operation mutation blocked' },
      status: 404,
    });
    await request('PUT', `/operations/forms/${formA.id}`, {
      token: tokens.all,
      body: { notes: 'unrestricted operation mutation A' },
    });
    await request('PUT', `/operations/forms/${formB.id}`, {
      token: tokens.all,
      body: { notes: 'unrestricted operation mutation B' },
    });

    const mutatedCustomers = await prisma.customer.findMany({
      where: { id: { in: [customerA.id, customerB.id] } },
      select: { id: true, latestComment: true },
    });
    const customerComments = new Map(mutatedCustomers.map((row) => [row.id, row.latestComment]));
    assert(customerComments.get(customerA.id) === 'unrestricted mutation A', 'unrestricted user should persist customer A mutation');
    assert(customerComments.get(customerB.id) === 'unrestricted mutation B', 'unrestricted user should persist customer B mutation');
    const mutatedOrders = await prisma.order.findMany({
      where: { id: { in: [orderA.id, orderB.id] } },
      select: { id: true, note: true },
    });
    const orderNotes = new Map(mutatedOrders.map((row) => [row.id, row.note]));
    assert(orderNotes.get(orderA.id) === 'branch order mutation allowed', 'branch user should persist in-scope order mutation');
    assert(orderNotes.get(orderB.id) === 'department order mutation allowed', 'department user should persist in-scope order mutation');
    const mutatedForms = await prisma.operationForm.findMany({
      where: { id: { in: [formA.id, formB.id] } },
      select: { id: true, notes: true },
    });
    const formNotes = new Map(mutatedForms.map((row) => [row.id, row.notes]));
    assert(formNotes.get(formA.id) === 'unrestricted operation mutation A', 'unrestricted user should persist operation form A mutation');
    assert(formNotes.get(formB.id) === 'unrestricted operation mutation B', 'unrestricted user should persist operation form B mutation');

    console.log('TEST_DATA_SCOPE_API_FLOWS_OK');
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
