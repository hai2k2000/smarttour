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
      schedules: [{ title: 'Tour test', startDate: '2030-02-01T08:00', endDate: '2030-02-01T17:00', status: 'BUSY', note: 'schedule note' }],
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
    const branchGuideRole = `${run}_guide_branch`;
    const departmentGuideRole = `${run}_guide_department`;
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
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: branchGuideRole, name: 'Branch Guide Manager', permissions: ['guide.view', 'guide.manage', 'data.scope.branch'] },
      status: 201,
    });
    await request('POST', '/auth/roles', {
      token: adminToken,
      body: { code: departmentGuideRole, name: 'Department Guide Manager', permissions: ['guide.view', 'guide.manage', 'data.scope.department'] },
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
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${run}_branch@smarttour.local`, username: `${run}_branch`, password, name: 'Branch Guide User', branch: 'BR-A', department: 'DEP-A', roleCodes: [branchGuideRole] },
      status: 201,
    });
    await request('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${run}_department@smarttour.local`, username: `${run}_department`, password, name: 'Department Guide User', branch: 'BR-X', department: 'DEP-B', roleCodes: [departmentGuideRole] },
      status: 201,
    });
    const viewToken = await login(`${run}_viewer`);
    const noGuideToken = await login(`${run}_noguide`);
    const branchGuideToken = await login(`${run}_branch`);
    const departmentGuideToken = await login(`${run}_department`);

    await request('GET', '/tour-guides', { token: noGuideToken, status: 403 });
    await request('GET', '/tour-guides/not-a-real-guide', { token: noGuideToken, status: 403 });
    await request('GET', '/tour-guides', { token: viewToken });
    await request('POST', '/tour-guides', { token: viewToken, body: guidePayload(`${run}_VIEW_DENY`), status: 403 });

    const badCodeResponse = await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD`), guideCode: 'bad code with spaces' },
      status: 400,
    });
    assert(JSON.stringify(badCodeResponse).includes('Mã hướng dẫn viên'), 'guideCode validation should return a Vietnamese field message');
    const missingCode = guidePayload(`${run}_MISSING_CODE`);
    delete missingCode.guideCode;
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: missingCode,
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_MISSING_NAME`), fullName: '' },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_MISSING_PHONE`), phone: '' },
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
      body: { ...guidePayload(`${run}_BAD_BIRTHDAY`), birthday: 'not-a-date' },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_CARD_DATE`), cards: [{ cardType: 'Thẻ HDV', issueDate: 'wrong-date' }] },
      status: 400,
    });
    const missingCardType = await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_CARD_TYPE`), cards: [{ note: 'missing card type' }] },
      status: 400,
    });
    assert(JSON.stringify(missingCardType).includes('Loại thẻ'), 'card row validation should name the missing card type in Vietnamese');
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_COST_PRICE`), costServices: [{ serviceName: 'Guide half day', netPrice: -1 }] },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_SCHEDULE`), schedules: [{ title: 'Missing date', status: 'BUSY' }] },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_SCHEDULE_DATE`), schedules: [{ title: 'Invalid date', startDate: 'not-a-date', endDate: '2030-03-01T17:00', status: 'BUSY' }] },
      status: 400,
    });
    await request('POST', '/tour-guides', {
      token: adminToken,
      body: { ...guidePayload(`${run}_BAD_SCHEDULE_RANGE`), schedules: [{ title: 'Wrong range', startDate: '2030-03-01T17:00', endDate: '2030-03-01T08:00', status: 'BUSY' }] },
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
    assert(guide.cards[0].issueDate.startsWith('2030-01-01') && guide.cards[0].expiredDate.startsWith('2031-01-01'), 'date-only card issue/expired dates should not shift calendar day');
    assert(guide.documents[0].issueDate.startsWith('2030-01-01') && guide.documents[0].expiredDate.startsWith('2031-01-01'), 'date-only document issue/expired dates should not shift calendar day');
    assert(guide.schedules[0].startDate === '2030-02-01T01:00:00.000Z' && guide.schedules[0].endDate === '2030-02-01T10:00:00.000Z', 'datetime-local schedule should be parsed as Asia/Bangkok time');

    const compacted = await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_COMPACT`, {
        phone: '0900000006',
        email: `${run}_compact@smarttour.local`,
        languages: [' VI ', ''],
        markets: [' Nội địa ', ''],
        skills: [' Team building ', ''],
        cards: [{}],
        documents: [{}],
        costServices: [{}],
        schedules: [{}],
      }),
      status: 201,
    });
    assert(compacted.languages.length === 1 && compacted.languages[0] === 'VI', 'languages should be trimmed and compacted');
    assert(compacted.markets.length === 1 && compacted.markets[0] === 'Nội địa', 'markets should be trimmed and compacted');
    assert(compacted.skills.length === 1 && compacted.skills[0] === 'Team building', 'skills should be trimmed and compacted');
    assert(compacted.cards.length === 0 && compacted.documents.length === 0 && compacted.costServices.length === 0 && compacted.schedules.length === 0, 'empty child rows should be compacted before save');

    const listRows = await request('GET', '/tour-guides', { token: viewToken });
    assert(listRows.some((row) => row.id === guide.id), 'list should include created guide');
    const searchByCode = await request('GET', `/tour-guides?search=${encodeURIComponent(`${run}_MAIN`)}`, { token: viewToken });
    assert(searchByCode.some((row) => row.id === guide.id), 'search should find guide by code');
    const searchByName = await request('GET', `/tour-guides?search=${encodeURIComponent('Nguyen Van HDV')}`, { token: viewToken });
    assert(searchByName.some((row) => row.id === guide.id), 'search should find guide by full name');
    const searchByPhone = await request('GET', '/tour-guides?search=0900000001', { token: viewToken });
    assert(searchByPhone.some((row) => row.id === guide.id), 'search should find guide by phone');
    const searchByType = await request('GET', '/tour-guides?search=Local', { token: viewToken });
    assert(searchByType.some((row) => row.id === guide.id), 'search should find guide by guide type');
    const searchByMarketNoAccent = await request('GET', `/tour-guides?search=${encodeURIComponent('noi dia')}`, { token: viewToken });
    assert(searchByMarketNoAccent.some((row) => row.id === guide.id), 'search should find guide by Vietnamese market without accents');
    const searchBySkill = await request('GET', `/tour-guides?search=${encodeURIComponent('team building')}`, { token: viewToken });
    assert(searchBySkill.some((row) => row.id === guide.id), 'search should find guide by skills');
    const activeRows = await request('GET', '/tour-guides?status=ACTIVE', { token: viewToken });
    assert(activeRows.some((row) => row.id === guide.id), 'status filter should include active guide');
    await request('GET', '/tour-guides?status=LOCKED', { token: viewToken, status: 400 });

    await request('GET', `/tour-guides/${guide.id}`, { status: 401 });
    const detail = await request('GET', `/tour-guides/${guide.id}`, { token: viewToken });
    assert(detail.cards[0].cardType === 'Thẻ HDV' && String(detail.costServices[0].netPrice) === '1000000', 'detail should return enough child data for edit form');

    const scopedStart = new Date('2030-04-01T00:00:00.000Z');
    const scopedEnd = new Date('2030-04-05T23:59:59.000Z');
    const scopedOrderA = await prisma.order.create({
      data: {
        type: 'FIT_TOUR',
        systemCode: `${run}_SCOPED_ORDER_A`,
        name: 'Scoped guide order A',
        branch: 'BR-A',
        department: 'DEP-A',
        status: 'UPCOMING',
        startDate: scopedStart,
        endDate: scopedEnd,
      },
    });
    const scopedOrderB = await prisma.order.create({
      data: {
        type: 'FIT_TOUR',
        systemCode: `${run}_SCOPED_ORDER_B`,
        name: 'Scoped guide order B',
        branch: 'BR-B',
        department: 'DEP-B',
        status: 'UPCOMING',
        startDate: scopedStart,
        endDate: scopedEnd,
      },
    });
    const scopedGuideA = await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_SCOPED_A`, {
        phone: '0900000011',
        email: `${run}_scoped_a@smarttour.local`,
        schedules: [{ title: 'Scoped branch guide', orderId: scopedOrderA.id, startDate: '2030-04-02T08:00:00.000Z', endDate: '2030-04-02T17:00:00.000Z', status: 'BUSY' }],
      }),
      status: 201,
    });
    const scopedGuideB = await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_SCOPED_B`, {
        phone: '0900000012',
        email: `${run}_scoped_b@smarttour.local`,
        schedules: [{ title: 'Scoped department guide', orderId: scopedOrderB.id, startDate: '2030-04-03T08:00:00.000Z', endDate: '2030-04-03T17:00:00.000Z', status: 'BUSY' }],
      }),
      status: 201,
    });
    const scopedListBranch = await request('GET', `/tour-guides?search=${encodeURIComponent(`${run}_SCOPED`)}`, { token: branchGuideToken });
    const scopedListDepartment = await request('GET', `/tour-guides?search=${encodeURIComponent(`${run}_SCOPED`)}`, { token: departmentGuideToken });
    const scopedListAll = await request('GET', `/tour-guides?search=${encodeURIComponent(`${run}_SCOPED`)}`, { token: viewToken });
    assert(scopedListBranch.some((row) => row.id === scopedGuideA.id) && !scopedListBranch.some((row) => row.id === scopedGuideB.id), 'branch guide user should list only guides linked to branch-scoped orders');
    assert(scopedListDepartment.some((row) => row.id === scopedGuideB.id) && !scopedListDepartment.some((row) => row.id === scopedGuideA.id), 'department guide user should list only guides linked to department-scoped orders');
    assert(scopedListAll.some((row) => row.id === scopedGuideA.id) && scopedListAll.some((row) => row.id === scopedGuideB.id), 'unrestricted guide user should list all scoped guide records');
    await request('GET', `/tour-guides/${scopedGuideA.id}`, { token: branchGuideToken });
    await request('GET', `/tour-guides/${scopedGuideB.id}`, { token: branchGuideToken, status: 404 });
    await request('GET', `/tour-guides/${scopedGuideB.id}`, { token: departmentGuideToken });
    await request('GET', `/tour-guides/${scopedGuideA.id}`, { token: departmentGuideToken, status: 404 });
    await request('PUT', `/tour-guides/${scopedGuideA.id}`, { token: branchGuideToken, body: { fullName: 'Scoped Branch Guide Updated' } });
    await request('PUT', `/tour-guides/${scopedGuideB.id}`, { token: branchGuideToken, body: { fullName: 'Blocked Branch Guide Update' }, status: 404 });
    await request('DELETE', `/tour-guides/${scopedGuideA.id}`, { token: departmentGuideToken, status: 404 });
    assert(String(detail.costServices[0].sellingPrice) === '1200000' && !('amount' in detail.costServices[0]), 'guide cost service should save price-book values without derived calculations');
    await request('PUT', `/tour-guides/${guide.id}`, { token: viewToken, body: { fullName: 'Viewer cannot update' }, status: 403 });
    await request('DELETE', `/tour-guides/${guide.id}`, { token: viewToken, status: 403 });

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
    assert(String(updated.costServices[0].netPrice) === '1500000' && String(updated.costServices[0].sellingPrice) === '1800000', 'guide price-book update should persist explicit net/selling prices');
    assert(!('amount' in updated.costServices[0]), 'guide price-book rows should not calculate or expose derived amount');
    const preserved = await request('PUT', `/tour-guides/${guide.id}`, {
      token: adminToken,
      body: { fullName: 'Nguyen Van HDV Preserve Children' },
    });
    assert(preserved.cards.length === 1 && preserved.cards[0].cardType === 'Thẻ quốc tế', 'update without child arrays should preserve existing card rows');
    assert(preserved.costServices.length === 1 && preserved.costServices[0].serviceName === 'Guide full day', 'update without child arrays should preserve existing cost rows');
    const cleared = await request('PUT', `/tour-guides/${guide.id}`, {
      token: adminToken,
      body: {
        cards: [],
        documents: [{ documentType: 'Visa', documentNo: 'VISA-1', issueDate: '2030-07-01', expiredDate: '2030-08-01' }],
        costServices: [],
        schedules: [{ title: 'New local time schedule', startDate: '2030-08-01T09:30', endDate: '2030-08-01T11:00', status: 'CONFIRMED' }],
      },
    });
    assert(cleared.cards.length === 0 && cleared.costServices.length === 0, 'submitted empty child arrays should delete those rows after save');
    assert(cleared.documents.length === 1 && cleared.documents[0].documentType === 'Visa', 'submitted document rows should be saved after deleting other child rows');
    assert(cleared.schedules.length === 1 && cleared.schedules[0].startDate === '2030-08-01T02:30:00.000Z', 'saved schedule rows should keep Asia/Bangkok local time conversion');

    const multiRows = await request('PUT', `/tour-guides/${guide.id}`, {
      token: adminToken,
      body: {
        cards: [
          { cardType: 'Thẻ nội địa', cardNumber: 'CARD-A', issueDate: '2030-09-01', expiredDate: '2031-09-01' },
          { cardType: 'Thẻ quốc tế', cardNumber: 'CARD-B', issueDate: '2030-09-02', expiredDate: '2031-09-02' },
        ],
        documents: [
          { documentType: 'Passport', documentNo: 'PASS-A', issueDate: '2030-09-01', expiredDate: '2031-09-01' },
          { documentType: 'Visa', documentNo: 'VISA-B', issueDate: '2030-09-02', expiredDate: '2031-09-02' },
        ],
        costServices: [
          { serviceType: 'Guide', serviceName: 'Guide morning', unit: 'buổi', currency: 'VND', netPrice: 700000, sellingPrice: 900000 },
          { serviceType: 'Guide', serviceName: 'Guide evening', unit: 'buổi', currency: 'USD', netPrice: 50, sellingPrice: 70 },
        ],
        schedules: [
          { title: 'Morning tour', startDate: '2030-09-01T08:00', endDate: '2030-09-01T12:00', status: 'CONFIRMED' },
          { title: 'Evening tour', startDate: '2030-09-02T18:00', endDate: '2030-09-02T22:00', status: 'BUSY' },
        ],
      },
    });
    assert(multiRows.cards.map((row) => row.cardNumber).join(',') === 'CARD-A,CARD-B', 'multiple card rows should keep submitted order after save');
    assert(multiRows.documents.map((row) => row.documentNo).join(',') === 'PASS-A,VISA-B', 'multiple document rows should keep submitted order after save');
    assert(multiRows.costServices.map((row) => row.serviceName).join(',') === 'Guide morning,Guide evening', 'multiple guide price rows should keep submitted order after save');
    assert(multiRows.schedules.map((row) => row.title).join(',') === 'Morning tour,Evening tour', 'multiple schedule rows should keep submitted order after save');
    assert(String(multiRows.costServices[1].netPrice) === '50' && multiRows.costServices[1].currency === 'USD', 'price-book rows should preserve currency and explicit price values');

    const rowDelete = await request('PUT', `/tour-guides/${guide.id}`, {
      token: adminToken,
      body: {
        cards: [{ cardType: 'Thẻ quốc tế cập nhật', cardNumber: 'CARD-B', issueDate: '2030-09-02', expiredDate: '2032-09-02' }],
        documents: [{ documentType: 'Visa cập nhật', documentNo: 'VISA-B', issueDate: '2030-09-02', expiredDate: '2032-09-02' }],
        costServices: [{ serviceType: 'Guide', serviceName: 'Guide evening updated', unit: 'buổi', currency: 'USD', netPrice: 55, sellingPrice: 75 }],
        schedules: [{ title: 'Evening tour updated', startDate: '2030-09-02T18:30', endDate: '2030-09-02T22:30', status: 'OPERATING' }],
      },
    });
    assert(rowDelete.cards.length === 1 && rowDelete.cards[0].cardType === 'Thẻ quốc tế cập nhật' && rowDelete.cards[0].expiredDate.startsWith('2032-09-02'), 'updating/deleting card rows should persist the remaining row data');
    assert(rowDelete.documents.length === 1 && rowDelete.documents[0].documentType === 'Visa cập nhật' && rowDelete.documents[0].expiredDate.startsWith('2032-09-02'), 'updating/deleting document rows should persist the remaining row data');
    assert(rowDelete.costServices.length === 1 && rowDelete.costServices[0].serviceName === 'Guide evening updated' && String(rowDelete.costServices[0].netPrice) === '55' && String(rowDelete.costServices[0].sellingPrice) === '75', 'updating/deleting price rows should persist the remaining row data');
    assert(rowDelete.schedules.length === 1 && rowDelete.schedules[0].title === 'Evening tour updated' && rowDelete.schedules[0].startDate === '2030-09-02T11:30:00.000Z', 'updating/deleting schedule rows should persist remaining row data with Asia/Bangkok conversion');

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
    const completedOrder = await prisma.order.create({
      data: {
        type: 'FIT_TOUR',
        systemCode: `${run}_ORDER_COMPLETED`,
        name: 'Completed guide order',
        status: 'COMPLETED',
        startDate: new Date('2030-07-01T00:00:00.000Z'),
        endDate: new Date('2030-07-05T23:59:59.000Z'),
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
    const completedLinkedGuide = await request('POST', '/tour-guides', {
      token: adminToken,
      body: guidePayload(`${run}_COMPLETED_LINKED`, {
        phone: '0900000007',
        email: `${run}_completed_linked@smarttour.local`,
        schedules: [{ title: 'Completed order link', orderId: completedOrder.id, startDate: '2030-07-02T08:00:00.000Z', endDate: '2030-07-02T17:00:00.000Z', status: 'BUSY' }],
      }),
      status: 201,
    });
    assert(completedLinkedGuide.schedules[0].status === 'COMPLETED', 'schedule linked to completed order should sync to COMPLETED');
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

docker run --rm -i -v "$PWD:/workspace:ro" -w /workspace node:22-alpine node <<'NODE'
const fs = require('fs');

const source = fs.readFileSync('apps/web/app/tour-guides/TourGuidesClient.tsx', 'utf8');
const pageSource = fs.readFileSync('apps/web/app/tour-guides/page.tsx', 'utf8');
const serviceSource = fs.readFileSync('apps/api/src/modules/tour-guides/tour-guides.service.ts', 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

assert(source.includes('Date.now().toString(36).toUpperCase()') && source.includes('crypto.randomUUID'), 'newGuideCode should use high-entropy timestamp plus random suffix');
function simulateGuideCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `HDV-${timestamp}-${random}`;
}
const generatedCodes = new Set(Array.from({ length: 5000 }, simulateGuideCode));
assert(generatedCodes.size === 5000, 'new guide code generation should not collide during rapid consecutive create form opens');
assert([...generatedCodes].every((code) => /^HDV-[A-Z0-9]+-[A-Z0-9]{8}$/.test(code)), 'new guide code should keep the expected HDV timestamp-random format');
assert(source.includes("const appTimeZone = 'Asia/Bangkok'") && source.includes('timeZone: appTimeZone'), 'TourGuidesClient should display schedule datetimes in Asia/Bangkok');
assert(source.includes('buildPayload') && source.includes('costServices') && source.includes('netPrice: numberOrZero(row.netPrice)'), 'TourGuidesClient should submit guide price-book rows as explicit numbers');
assert(source.includes("import { authHeaders, authJsonHeaders } from '../authFetch'"), 'TourGuidesClient should send auth headers for reload/detail/save requests');
assert(source.includes('function tourGuidesPath') && source.includes("params.set('search'") && source.includes("params.set('status'"), 'TourGuidesClient reload should pass sanitized search/status query to /tour-guides');
assert(source.includes('const [statusFilter, setStatusFilter]') && source.includes('L\u1ecdc tr\u1ea1ng th\u00e1i h\u01b0\u1edbng d\u1eabn vi\u00ean'), 'TourGuidesClient should expose a status filter for the guide list');
assert(source.includes('guideStatusOptions') && source.includes('scheduleStatusOptions') && source.includes('currencyOptions'), 'TourGuidesClient should use controlled options for guide status, schedule status, and currency');
assert(source.includes('column.options ?') && source.includes('<select disabled={disabled}'), 'Rows should render selects for option columns instead of free-text fields');
assert(source.includes('colSpan={6}'), 'Guide table empty state should match the visible column count');
assert(source.includes('Kh\u00f4ng l\u01b0u \u0111\u01b0\u1ee3c h\u1ed3 s\u01a1 h\u01b0\u1edbng d\u1eabn vi\u00ean'), 'Save error message should be clear Vietnamese');
assert(source.includes('M\u00e3 h\u01b0\u1edbng d\u1eabn vi\u00ean') && source.includes('Th\u00f4ng tin li\u00ean h\u1ec7') && source.includes('Ng\u00f4n ng\u1eef / th\u1ecb tr\u01b0\u1eddng') && source.includes('Tr\u1ea1ng th\u00e1i h\u1ed3 s\u01a1'), 'Guide list headers should be fully Vietnamese');
assert(pageSource.includes('\u0110i\u1ec1u h\u00e0nh h\u01b0\u1edbng d\u1eabn vi\u00ean'), 'Tour guides page should avoid HDV abbreviation in visible copy');
assert(serviceSource.includes('Kh\u00f4ng t\u00ecm th\u1ea5y h\u1ed3 s\u01a1 h\u01b0\u1edbng d\u1eabn vi\u00ean'), 'TourGuidesService not-found message should be Vietnamese');

for (const bad of [
  'Ma HDV',
  'Thong tin',
  'Ngon ngu / thi truong',
  'Trang thai',
  'Ho so huong dan vien',
  'Quan ly HDV doc lap voi NCC',
  'Ho ten',
  'Dien thoai',
  'Loai HDV',
  'Ngay sinh',
  'Gioi tinh',
  'Tinh/TP',
  'Ngay cap',
  'Het han',
  'Bat dau',
  'Ket thuc',
  'Khong luu duoc HDV',
  'M\u00e3 HDV',
  'Lo\u1ea1i HDV',
  'L\u01b0u HDV',
  '\u0110VT',
  'S\u0110T',
  '\u0110i\u1ec1u h\u00e0nh HDV',
  'Tour guide not found',
]) {
  assert(!source.includes(bad) && !pageSource.includes(bad) && !serviceSource.includes(bad), `tour guides visible/API contract should not keep old copy: ${bad}`);
}

console.log('TEST_TOUR_GUIDES_CLIENT_CONTRACT_OK');
NODE
