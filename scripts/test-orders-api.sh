#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_orders_api_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
BOOTSTRAP_KEY="${BOOTSTRAP_KEY:-smarttour-api-test-bootstrap-key}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_ORDERS_API_TEST missing POSTGRES_PASSWORD"
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

const password = 'StrongPass1';

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const run = `orders_api_${Date.now()}`;

  async function request(method, path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.token) {
      if (String(options.token).includes('=')) headers.Cookie = options.token;
      else headers.Authorization = `Bearer ${options.token}`;
    }
    const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (options.status !== undefined) {
      assert(response.status === options.status, `${method} ${path} expected ${options.status}, got ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    } else if (!response.ok) {
      throw new Error(`${method} ${path} failed ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) Object.defineProperty(data, '__headers', { value: response.headers });
    return data;
  }

  function authCookie(headers) {
    const setCookie = headers.get('set-cookie') || '';
    const match = setCookie.match(/smarttour\.auth\.token=[^;]+/);
    assert(match, 'auth response should set smarttour auth cookie');
    return match[0];
  }

  async function login(username) {
    const result = await request('POST', '/auth/login', { body: { username, password } });
    return authCookie(result.__headers);
  }

  try {
    await request('GET', '/orders/single-services', { status: 401 });

    const adminUsername = `${run}_admin`;
    const bootstrap = await request('POST', '/auth/bootstrap', {
      body: { email: `${adminUsername}@smarttour.local`, username: adminUsername, password, name: 'Orders API Admin', bootstrapKey: process.env.SMARTTOUR_BOOTSTRAP_KEY },
      status: 201,
    });
    const adminToken = authCookie(bootstrap.__headers);

    const manageRoleCode = `${run}_order_manage`;
    const viewRoleCode = `${run}_order_view`;
    const actionRoleCode = `${run}_order_action`;
    const noOrderRoleCode = `${run}_no_order`;
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: manageRoleCode, name: 'Order Manage Branch', permissions: ['order.view', 'order.manage', 'data.scope.branch'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: viewRoleCode, name: 'Order View Branch', permissions: ['order.view', 'data.scope.branch'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: actionRoleCode, name: 'Order Action Branch', permissions: ['order.view', 'order.manage', 'order.status.update', 'order.settle', 'order.unlock', 'data.scope.branch'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: noOrderRoleCode, name: 'No Order Permission', permissions: ['customer.view', 'data.scope.branch'] },
      status: 201,
    });

    const manageUsername = `${run}_manage`;
    const viewUsername = `${run}_view`;
    const actionUsername = `${run}_action`;
    const noOrderUsername = `${run}_noperm`;
    for (const [username, name, roleCode] of [
      [manageUsername, 'Order Manager', manageRoleCode],
      [viewUsername, 'Order Viewer', viewRoleCode],
      [actionUsername, 'Order Action User', actionRoleCode],
      [noOrderUsername, 'No Order User', noOrderRoleCode],
    ]) {
      await request('POST', '/auth/users', {
        token: adminToken,
        body: { email: `${username}@smarttour.local`, username, password, name, branch: 'BR-A', department: 'DEP-A', roleCodes: [roleCode] },
        status: 201,
      });
    }

    const manageToken = await login(manageUsername);
    const viewToken = await login(viewUsername);
    const actionToken = await login(actionUsername);
    const noOrderToken = await login(noOrderUsername);

    await request('GET', '/orders/single-services', { token: noOrderToken, status: 403 });
    await request('POST', '/orders/single-services', { token: viewToken, body: { systemCode: `${run}-VIEW`, name: 'View create blocked' }, status: 403 });
    await request('POST', '/orders/single-services', { token: manageToken, body: {}, status: 400 });
    await request('POST', '/orders/single-services', {
      token: manageToken,
      body: { systemCode: `${run}-BAD-DATE`, name: 'Bad date', startDate: '2026-12-10', endDate: '2026-12-09' },
      status: 400,
    });
    await request('POST', '/orders/single-services', {
      token: manageToken,
      body: { systemCode: `${run}-INVALID-DATE`, name: 'Invalid date', startDate: 'not-a-date' },
      status: 400,
    });

    const branchOrder = await request('POST', '/orders/single-services', {
      token: manageToken,
      body: {
        systemCode: `${run}-A`,
        name: 'Orders API Branch A',
        customerPhone: '0900000001',
        salesItems: [{ description: 'Revenue A', quantity: 1, serviceCount: 1, unitPrice: 1000 }],
        operationItems: [{ serviceType: 'OTHER', quantity: 1, netPrice: 400 }],
        members: [{ fullName: 'Member A' }],
      },
      status: 201,
    });
    assert(branchOrder.branch === 'BR-A' && Number(branchOrder.profit) === 600, 'scoped manager create should inject branch and calculate totals');

    const otherOrder = await request('POST', '/orders/single-services', {
      token: adminToken,
      body: { systemCode: `${run}-B`, name: 'Orders API Branch B', branch: 'BR-B', department: 'DEP-B', customerPhone: '0900000002' },
      status: 201,
    });

    const scopedList = await request('GET', `/orders/single-services?search=${run}`, { token: viewToken });
    assert(scopedList.length === 1 && scopedList[0].id === branchOrder.id, 'order list should apply branch scope');
    const searchByPhone = await request('GET', '/orders/single-services?search=0900000001', { token: viewToken });
    assert(searchByPhone.length === 1 && searchByPhone[0].id === branchOrder.id, 'order list should search customer phone');
    const detail = await request('GET', `/orders/single-services/${branchOrder.id}`, { token: viewToken });
    assert(detail.id === branchOrder.id && detail.members.length === 1 && detail.salesItems.length === 1, 'order detail should return scoped child data');
    await request('GET', `/orders/single-services/${otherOrder.id}`, { token: viewToken, status: 404 });

    await request('PUT', `/orders/single-services/${branchOrder.id}`, { token: viewToken, body: { name: 'Viewer blocked' }, status: 403 });
    await request('PUT', `/orders/single-services/${otherOrder.id}`, { token: manageToken, body: { name: 'Outside update blocked' }, status: 404 });
    await request('DELETE', `/orders/single-services/${otherOrder.id}`, { token: manageToken, status: 404 });
    await request('POST', `/orders/single-services/${otherOrder.id}/copy`, { token: manageToken, status: 404 });
    await request('POST', `/orders/single-services/${otherOrder.id}/settle`, { token: actionToken, status: 404 });

    const emptyUpdated = await request('PUT', `/orders/single-services/${branchOrder.id}`, { token: manageToken, body: {} });
    assert(emptyUpdated.id === branchOrder.id && emptyUpdated.members[0].id === branchOrder.members[0].id, 'empty update payload should preserve order children');
    await request('PUT', `/orders/single-services/${branchOrder.id}`, {
      token: manageToken,
      body: { startDate: '2026-12-10', endDate: '2026-12-09' },
      status: 400,
    });
    await request('PUT', `/orders/single-services/${branchOrder.id}`, {
      token: manageToken,
      body: { status: 'CANCELLED' },
      status: 400,
    });
    const afterRejectedStatusPayload = await request('GET', `/orders/single-services/${branchOrder.id}`, { token: viewToken });
    assert(afterRejectedStatusPayload.status === branchOrder.status, 'normal update endpoint should not mutate lifecycle status');
    await request('PATCH', `/orders/single-services/${branchOrder.id}/status`, { token: viewToken, body: { status: 'RUNNING' }, status: 403 });
    await request('PATCH', `/orders/single-services/${branchOrder.id}/status`, { token: manageToken, body: { status: 'RUNNING' }, status: 403 });
    const running = await request('PATCH', `/orders/single-services/${branchOrder.id}/status`, { token: actionToken, body: { status: 'RUNNING' } });
    assert(running.status === 'RUNNING', 'order action user should update lifecycle status');

    const copied = await request('POST', `/orders/single-services/${branchOrder.id}/copy`, { token: manageToken, status: 201 });
    assert(copied.id !== branchOrder.id && copied.members[0].id !== branchOrder.members[0].id, 'copy endpoint should create independent order children');
    await request('POST', `/orders/single-services/${branchOrder.id}/settle`, { token: manageToken, status: 403 });
    const settled = await request('POST', `/orders/single-services/${branchOrder.id}/settle`, { token: actionToken, status: 200 });
    assert(settled.status === 'SETTLED' && settled.settledAt, 'settle endpoint should set settlement state');
    await request('POST', `/orders/single-services/${branchOrder.id}/unlock`, {
      token: manageToken,
      body: { actor: 'orders-api-test', reason: 'verify unlock permission' },
      status: 403,
    });
    const unlocked = await request('POST', `/orders/single-services/${branchOrder.id}/unlock`, {
      token: actionToken,
      body: { actor: 'orders-api-test', reason: 'verify unlock permission' },
      status: 200,
    });
    assert(unlocked.status === 'COMPLETED' && !unlocked.settledAt, 'unlock endpoint should clear settlement state');
    await request('DELETE', `/orders/single-services/${copied.id}`, { token: manageToken });

    console.log('TEST_ORDERS_API_OK');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
