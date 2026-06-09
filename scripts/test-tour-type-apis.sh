#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_tour_type_api_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_TOUR_TYPE_APIS_TEST missing POSTGRES_PASSWORD"
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
  -e SMARTTOUR_ENV="development" \
  -e SMARTTOUR_AUTH_ENFORCE="true" \
  --entrypoint sh api -lc "cd /workspace && /app/node_modules/.bin/prisma db push --schema prisma/schema.prisma --skip-generate >/dev/null && cd /app && node" <<'NODE'
const crypto = require('crypto');
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./apps/api/dist/app.module');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function assertTourRootOrchestrationBoundaries() {
  const fs = require('fs');
  const services = [
    ['GIT', '/workspace/apps/api/src/modules/git-tours/git-tours.service.ts'],
    ['LandTour', '/workspace/apps/api/src/modules/landtours/landtours.service.ts'],
  ];
  for (const [label, file] of services) {
    const source = fs.readFileSync(file, 'utf8');
    assert(source.includes('tourCore.createRoot'), `${label} should create common Tour root through TourCoreService.createRoot`);
    assert(source.includes('tourCore.updateRoot'), `${label} should update common Tour root through TourCoreService.updateRoot`);
    assert(!/tx\.tour\.create\s*\(/.test(source), `${label} should not create Tour root directly in module service`);
    assert(!/tx\.tour\.update\s*\(/.test(source), `${label} should not update Tour root directly in module service`);
  }
}

async function jsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  assertTourRootOrchestrationBoundaries();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');

  const prisma = app.get(PrismaService);
  const run = 'TTA-' + Date.now();
  const token = `tour-type-api-test.${crypto.randomBytes(24).toString('base64url')}`;
  const role = await prisma.role.create({
    data: {
      code: `${run.toLowerCase()}-role`,
      name: 'Tour Type API Test Role',
      permissions: { create: [{ permission: '*' }] },
    },
  });
  const user = await prisma.user.create({
    data: {
      username: `${run.toLowerCase()}-user`,
      email: `${run.toLowerCase()}@smarttour.local`,
      name: 'Tour Type API Test User',
      passwordHash: 'not-used',
      roles: { create: { roleId: role.id } },
    },
  });
  await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: `Bearer ${token}` };

  async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
    return { status: response.status, body: await jsonResponse(response) };
  }

  async function expect(path, options, status, label) {
    const response = await api(path, options);
    assert(response.status === status, `${label}: expected ${status}, got ${response.status} ${JSON.stringify(response.body)}`);
    return response.body;
  }

  const commonTour = await expect(
    '/api/tours',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'FIT',
        systemCode: `${run}-SYS`,
        tourCode: `${run}-TOUR`,
        name: 'Tour type API common tour',
      }),
    },
    201,
    'create common tour',
  );
  assert(commonTour.id, 'common tour create should return id');
  const patchedCommonTour = await expect(
    `/api/tours/${commonTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch common tour',
  );
  assert(patchedCommonTour.status === 'RUNNING', 'common tour PATCH should update status');
  const workflowPatchedCommonTour = await expect(
    `/api/tours/${commonTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'COMMON_REVIEW' }) },
    200,
    'patch common tour workflow step',
  );
  assert(workflowPatchedCommonTour.workflowStep === 'COMMON_REVIEW', 'common tour PATCH should update workflowStep');
  assert(workflowPatchedCommonTour.status === 'RUNNING', 'common tour workflowStep PATCH should not change lifecycle status');
  await expect('/api/tours?type=fit', {}, 200, 'common tours lowercase type query');
  await expect('/api/tours?status=running', {}, 200, 'common tours lowercase status query');
  await expect('/api/tours?type=WRONG', {}, 400, 'common tours invalid type query');
  await expect('/api/tours?status=WRONG', {}, 400, 'common tours invalid status query');

  const fitTour = await expect(
    '/api/fit-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        quoteCode: `${run}-FIT-Q`,
        tourCode: `${run}-FIT`,
        customerName: 'Tour type API FIT customer',
        adultCount: 1,
      }),
    },
    201,
    'create FIT tour',
  );
  assert(fitTour.id, 'FIT create should return id');
  const patchedFitTour = await expect(
    `/api/fit-tours/${fitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStatus: 'PRICING' }) },
    200,
    'patch FIT tour',
  );
  assert(patchedFitTour.workflowStatus === 'PRICING', 'FIT PATCH should update workflowStatus');
  await expect('/api/fit-tours?status=pricing', {}, 200, 'FIT lowercase workflow status query');
  await expect('/api/fit-tours?status=WRONG', {}, 400, 'FIT invalid workflow status query');

  const gitTour = await expect(
    '/api/git-tours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-GIT-SYS`,
        tourCode: `${run}-GIT`,
        name: 'Tour type API GIT tour',
      }),
    },
    201,
    'create GIT tour',
  );
  assert(gitTour.id, 'GIT create should return id');
  const patchedGitTour = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch GIT tour',
  );
  assert(patchedGitTour.status === 'RUNNING', 'GIT PATCH should update lifecycle status');
  const workflowPatchedGitTour = await expect(
    `/api/git-tours/${gitTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'GIT_COSTING' }) },
    200,
    'patch GIT workflow step',
  );
  assert(workflowPatchedGitTour.workflowStep === 'GIT_COSTING', 'GIT PATCH should update workflowStep');
  assert(workflowPatchedGitTour.status === 'RUNNING', 'GIT workflowStep PATCH should not change lifecycle status');
  await expect('/api/git-tours?status=running', {}, 200, 'GIT lowercase status query');
  await expect('/api/git-tours?status=WRONG', {}, 400, 'GIT invalid status query');

  const landTour = await expect(
    '/api/landtours',
    {
      method: 'POST',
      body: JSON.stringify({
        systemCode: `${run}-LAND-SYS`,
        tourCode: `${run}-LAND`,
        name: 'Tour type API LandTour',
      }),
    },
    201,
    'create LandTour',
  );
  assert(landTour.id, 'LandTour create should return id');
  const patchedLandTour = await expect(
    `/api/landtours/${landTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'RUNNING' }) },
    200,
    'patch LandTour',
  );
  assert(patchedLandTour.status === 'RUNNING', 'LandTour PATCH should update status');
  const workflowPatchedLandTour = await expect(
    `/api/landtours/${landTour.id}`,
    { method: 'PATCH', body: JSON.stringify({ workflowStep: 'LANDTOUR_COSTING' }) },
    200,
    'patch LandTour workflow step',
  );
  assert(workflowPatchedLandTour.workflowStep === 'LANDTOUR_COSTING', 'LandTour PATCH should update workflowStep');
  assert(workflowPatchedLandTour.status === 'RUNNING', 'LandTour workflowStep PATCH should not change lifecycle status');
  await expect('/api/landtours?status=running', {}, 200, 'LandTour lowercase status query');
  await expect('/api/landtours?status=WRONG', {}, 400, 'LandTour invalid status query');

  await app.close();
  console.log('TEST_TOUR_TYPE_APIS_OK');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
