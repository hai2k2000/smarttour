#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tour_guides_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOUR_GUIDES_API_TEST missing POSTGRES_PASSWORD"
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

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const prisma = app.get(PrismaService);
  const run = `guide_${Date.now()}`;

  async function request(method, path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
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
    return data;
  }

  async function login(username, pass = password) {
    const data = await request('POST', '/auth/login', { body: { username, password: pass } });
    return data.token;
  }

  function guidePayload(code, overrides = {}) {
    return {
      guideCode: code,
      fullName: 'Nguyen Van HDV',
      phone: `090${String(Date.now()).slice(-7)}`,
      email: `${code.toLowerCase()}@smarttour.local`,
      guideType: 'Local',
      languages: ['VI', 'EN'],
      markets: ['Nội địa'],
      skills: ['Team building'],
      status: 'ACTIVE',
      cards: [{ cardType: 'Thẻ HDV', cardNumber: `${code}-CARD`, issueDate: '2030-01-01', expiredDate: '2031-01-01', issuePlace: 'Ha Noi', note: 'card note' }],
      documents: [{ documentType: 'Passport', documentNo: `${code}-PASS`, country: 'VN', issueDate: '2030-01-01', expiredDate: '2031-01-01', note: 'doc note' }],
      costServices: [{ serviceType: 'Guide', serviceName: 'Công tác phí HDV', unit: 'ngày', currency: 'VND', netPrice: 1000000, sellingPrice: 1200000, note: 'cost note' }],
      schedules: [{ title: 'Tour test', startDate: '2030-02-01T08:00:00.000Z', endDate: '2030-02-01T17:00:00.000Z', status: 'BUSY', note: 'schedule note' }],
      ...overrides,
    };
  }

  try {
    await request('GET', '/tour-guides', { status: 401 });

    const adminUsername = `${run}_admin`;
    const bootstrap = await request('POST', '/auth/bootstrap', {
      body: { email: `${adminUsername}@smarttour.local`, username: adminUsername, password, name: 'Guide Admin' },
      status: 201,
    });
    const adminToken = bootstrap.token;

    const viewRole = `${run}_guide_view`;
    const noGuideRole = `${run}_no_guide`;
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: viewRole, name: 'Guide Viewer', permissions: ['guide.view', 'data.scope.all'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: noGuideRole, name: 'No Guide Access', permissions: ['customer.view', 'data.scope.all'] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${run}_viewer@smarttour.local`, username: `${run}_viewer`, password, name: 'Guide Viewer', roleCodes: [viewRole] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${run}_noguide@smarttour.local`, username: `${run}_noguide`, password, name: 'No Guide', roleCodes: [noGuideRole] },
      status: 201,
    });
    const viewToken = await login(`${run}_viewer`);
    const noGuideToken = await login(`${run}_noguide`);

    await request('GET', '/tour-guides', { token: noGuideToken, status: 403 });
    await request('GET', '/tour-guides', { token: viewToken });
    await request('POST', '/tour-guides', { token: viewToken, body: guidePayload(`${run}_VIEW_DENY`), status: 403 });

    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD`), guideCode: 'bad code with spaces' },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_PHONE`), phone: 'abc' },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_EMAIL`), email: 'not-an-email' },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_STATUS`), status: 'LOCKED' },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_SCHEDULE`), schedules: [{ title: 'Missing date', status: 'BUSY' }] },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: {
        ...guidePayload(`${run}_CONFLICT_SCHEDULE`),
        schedules: [
          { title: 'A', startDate: '2030-03-01T08:00:00.000Z', endDate: '2030-03-01T12:00:00.000Z', status: 'BUSY' },
          { title: 'B', startDate: '2030-03-01T11:00:00.000Z', endDate: '2030-03-01T17:00:00.000Z', status: 'BUSY' },
        ],
      },
      status: 400,
    });

    const guide = await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_MAIN`, { phone: '0900000001', email: `${run}_main@smarttour.local` }),
      status: 201,
    });
    assert(guide.cards.length === 1 && guide.documents.length === 1 && guide.costServices.length === 1 && guide.schedules.length === 1, 'create should return detail with child arrays');
    assert(Array.isArray(guide.files), 'detail response should include files array for edit form');

    await request('GET', `/tour-guides/${guide.id}`, { status: 401 });
    const detail = await request('GET', `/tour-guides/${guide.id}`, { token: viewToken });
    assert(detail.cards[0].cardType === 'Thẻ HDV' && String(detail.costServices[0].netPrice) === '1000000', 'detail should return enough child data for edit form');
    await request('PUT', `/tour-guides/${guide.id}`, { token: viewToken, body: { fullName: 'Viewer cannot update' }, status: 403 });

    const searchRows = await request('GET', `/tour-guides?search=${encodeURIComponent(`${run}_main@smarttour.local`)}`, { token: viewToken });
    assert(searchRows.some((row) => row.id === guide.id), 'list search should include email');

    await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_MAIN`, { phone: '0900000002', email: `${run}_code2@smarttour.local` }),
      status: 409,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_EMAIL`, { phone: '0900000003', email: `${run}_MAIN@smarttour.local` }),
      status: 409,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_PHONE`, { phone: '0900000001', email: `${run}_phone@smarttour.local` }),
      status: 409,
    });

    const updated = await request('PUT', `/tour-guides/${guide.id}`, {
      token: adminToken,
      body: {
        fullName: 'Nguyen Van HDV Updated',
        cards: [{ cardType: 'Thẻ quốc tế', cardNumber: 'CARD-2', issueDate: '2030-05-01', expiredDate: '2031-05-01' }],
        documents: [],
        costServices: [{ serviceType: 'Guide', serviceName: 'Guide full day', unit: 'ngày', netPrice: 1500000, sellingPrice: 1800000 }],
        schedules: [],
      },
    });
    assert(updated.fullName === 'Nguyen Van HDV Updated', 'update should persist root data');
    assert(updated.cards.length === 1 && updated.cards[0].cardType === 'Thẻ quốc tế', 'update should replace card rows predictably');
    assert(updated.documents.length === 0 && updated.schedules.length === 0, 'update with empty child arrays should clear those sections');
    assert(updated.costServices.length === 1 && updated.costServices[0].serviceName === 'Guide full day', 'update should keep submitted cost service row');

    const cancelledOrder = await prisma.order.create({
      data: {
        type: 'FIT_TOUR',
        systemCode: `${run}_ORDER_CANCELLED`,
        name: 'Cancelled guide order',
        status: 'CANCELLED',
        startDate: new Date('2030-06-01T00:00:00.000Z'),
        endDate: new Date('2030-06-05T23:59:59.000Z'),
      },
    });
    const linkedGuide = await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_LINKED`, {
        phone: '0900000004',
        email: `${run}_linked@smarttour.local`,
        schedules: [{ title: 'Cancelled order link', orderId: cancelledOrder.id, startDate: '2030-06-02T08:00:00.000Z', endDate: '2030-06-02T17:00:00.000Z', status: 'BUSY' }],
      }),
      status: 201,
    });
    assert(linkedGuide.schedules[0].status === 'CANCELLED', 'schedule linked to cancelled order should sync to CANCELLED');
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_OUTSIDE`, {
        phone: '0900000005',
        email: `${run}_outside@smarttour.local`,
        schedules: [{ title: 'Outside order dates', orderId: cancelledOrder.id, startDate: '2030-05-01T08:00:00.000Z', endDate: '2030-05-01T17:00:00.000Z', status: 'BUSY' }],
      }),
      status: 400,
    });

    console.log('TEST_TOUR_GUIDES_API_OK');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
