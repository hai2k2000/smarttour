#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_commission_security_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_COMMISSION_REPORTS_SECURITY missing POSTGRES_PASSWORD"
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
const { ParseEnumPipe } = require('@nestjs/common');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { CommissionReportsController } = require('./apps/api/dist/modules/commission-reports/commission-reports.controller');
const {
  CommissionReportGroupBy,
  CommissionReportsQueryDto,
} = require('./apps/api/dist/modules/commission-reports/dto/commission-report.dto');
const { CommissionReportsService } = require('./apps/api/dist/modules/commission-reports/commission-reports.service');

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

function role(...permissions) {
  return { role: { permissions: permissions.map((permission) => ({ permission })) } };
}

function scopedUser(id, username, branch, department, ...permissions) {
  return { id, username, email: `${username}@smarttour.local`, branch, department, roles: [role(...permissions)] };
}

async function createEntry(prisma, run, suffix, branch, department, status = 'PENDING', amount = 100) {
  const order = await prisma.order.create({
    data: {
      type: 'FIT_TOUR',
      systemCode: `${run}-ORD-${suffix}`,
      name: `Commission order ${suffix}`,
      status: 'CANCELLED',
      branch,
      department,
      totalRevenue: 1000,
      profit: 300,
    },
  });
  return prisma.commissionEntry.create({
    data: {
      orderId: order.id,
      orderCode: order.systemCode,
      orderType: order.type,
      branch,
      department,
      commissionAmount: amount,
      remainingAmount: amount,
      status,
    },
  });
}

async function main() {
  const invalidGroupByErrors = validateSync(plainToInstance(CommissionReportsQueryDto, { groupBy: 'not-a-group' }));
  assert(invalidGroupByErrors.some((error) => error.property === 'groupBy'), 'query DTO should reject invalid groupBy');
  const invalidSortByErrors = validateSync(plainToInstance(CommissionReportsQueryDto, { sortBy: 'not-a-sort' }));
  assert(invalidSortByErrors.some((error) => error.property === 'sortBy'), 'query DTO should reject invalid sortBy');

  const groupingPipe = new ParseEnumPipe(CommissionReportGroupBy);
  await rejects(
    () => groupingPipe.transform('not-a-group', { type: 'param', metatype: String, data: 'groupBy' }),
    'grouping path should reject invalid groupBy',
  );
  assert(
    (await groupingPipe.transform('branch', { type: 'param', metatype: String, data: 'groupBy' })) === 'branch',
    'grouping path should accept supported groupBy',
  );

  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new CommissionReportsService(prisma);
  const run = 'COMM-SEC-' + Date.now();
  const user = scopedUser('user-a', 'accounting-a', 'BR-A', 'DEP-A', 'data.scope.branch', 'data.scope.department');
  const otherUser = scopedUser('user-b', 'accounting-b', 'BR-B', 'DEP-B', 'data.scope.branch', 'data.scope.department');

  const controllerCalls = [];
  const controller = new CommissionReportsController({
    syncFromOrders: (...args) => controllerCalls.push(['sync', ...args]),
    approve: (...args) => controllerCalls.push(['approve', ...args]),
    reject: (...args) => controllerCalls.push(['reject', ...args]),
    revoke: (...args) => controllerCalls.push(['revoke', ...args]),
    pay: (...args) => controllerCalls.push(['pay', ...args]),
  });
  controller.sync({ user });
  controller.approve({ id: 'a' }, { user });
  controller.reject({ id: 'b' }, { user });
  controller.revoke({ id: 'c' }, { user });
  controller.pay({ id: 'd' }, { user });
  assert(controllerCalls[0][1] === user, 'controller sync should pass request.user to service');
  assert(controllerCalls.slice(1).every((call) => call[2] === user), 'controller mutations should pass request.user to service');

  const pending = await createEntry(prisma, run, 'PENDING-A', 'BR-A', 'DEP-A');
  const outOfScope = await createEntry(prisma, run, 'PENDING-B', 'BR-B', 'DEP-B');
  const approved = await createEntry(prisma, run, 'APPROVED-A', 'BR-A', 'DEP-A', 'APPROVED');
  const rejected = await createEntry(prisma, run, 'REJECTED-A', 'BR-A', 'DEP-A', 'REJECTED');
  const revoked = await createEntry(prisma, run, 'REVOKED-A', 'BR-A', 'DEP-A', 'REVOKED');

  const list = await service.list({ take: '100' }, user);
  assert(list.rows.every((row) => row.branch === 'BR-A' && row.department === 'DEP-A'), 'list should apply branch and department scope');
  const summary = await service.summary({}, user);
  assert(summary.bookingCount === 4, 'summary should only include scoped reports');
  const grouping = await service.grouping('branch', {}, user);
  assert(grouping.length === 1 && grouping[0].key === 'BR-A', 'grouping should only include scoped reports');
  await rejects(() => service.detail(outOfScope.id, user), 'detail should reject report outside data scope');

  const outOfScopeActiveOrder = await prisma.order.create({
    data: {
      type: 'FIT_TOUR',
      systemCode: `${run}-ACTIVE-OUT`,
      name: 'Out of scope active commission order',
      branch: 'BR-B',
      department: 'DEP-B',
      totalRevenue: 1000,
      profit: 300,
      commission: 100,
    },
  });
  const inScopeActiveOrder = await prisma.order.create({
    data: {
      type: 'FIT_TOUR',
      systemCode: `${run}-ACTIVE-IN`,
      name: 'In-scope active commission order',
      branch: 'BR-A',
      department: 'DEP-A',
      totalRevenue: 1000,
      profit: 300,
      commission: 100,
    },
  });
  await service.list({}, user);
  assert(await prisma.commissionEntry.count({ where: { orderId: outOfScopeActiveOrder.id } }) === 0, 'scoped report query should not sync reports outside data scope');
  assert(await prisma.commissionEntry.count({ where: { orderId: inScopeActiveOrder.id } }) === 0, 'GET report query should not sync or write in-scope reports');
  await service.syncFromOrders(user);
  assert(await prisma.commissionEntry.count({ where: { orderId: inScopeActiveOrder.id } }) === 1, 'explicit sync should create scoped commission reports');

  await rejects(() => service.approve({ id: outOfScope.id, actor: 'client-spoof' }, user), 'approve should reject report outside data scope');
  const approvedPending = await service.approve({ id: pending.id, actor: 'client-spoof' }, user);
  assert(approvedPending.approved === 1, 'approve should update scoped pending report');
  const approvedPendingRow = await prisma.commissionEntry.findUniqueOrThrow({ where: { id: pending.id }, include: { logs: true } });
  assert(approvedPendingRow.status === 'APPROVED' && approvedPendingRow.approvedBy === user.username, 'approve should derive actor from request user');
  assert(approvedPendingRow.logs.some((log) => log.action === 'APPROVE' && log.actor === user.username), 'approve log should derive actor from request user');
  await rejects(() => service.approve({ id: pending.id }, user), 'approve should reject invalid current status');
  await rejects(() => service.reject({ id: approved.id }, user), 'reject should reject approved report');
  await rejects(() => service.revoke({ id: rejected.id }, user), 'revoke should reject rejected report');

  await rejects(() => service.pay({ id: approved.id, amount: 0 }, user), 'pay should reject zero amount');
  await rejects(() => service.pay({ id: approved.id, amount: -1 }, user), 'pay should reject negative amount');
  await rejects(() => service.pay({ id: approved.id, amount: 'not-a-number' }, user), 'pay should reject invalid amount');
  await rejects(() => service.pay({ id: approved.id, amount: 101 }, user), 'pay should reject amount greater than remaining amount');
  await rejects(() => service.pay({ id: rejected.id, amount: 10 }, user), 'pay should reject rejected report');
  await rejects(() => service.pay({ id: revoked.id, amount: 10 }, user), 'pay should reject revoked report');
  await rejects(() => service.pay({ id: outOfScope.id, amount: 10 }, user), 'pay should reject report outside data scope');

  const paid = await service.pay({ id: approved.id, amount: 40, actor: 'client-spoof', voucherNo: 'PC-TEST' }, user);
  assert(paid.paid === 1, 'pay should update scoped approved report');
  let paidRow = await prisma.commissionEntry.findUniqueOrThrow({ where: { id: approved.id }, include: { payments: true, logs: true } });
  assert(Number(paidRow.paidAmount) === 40 && Number(paidRow.remainingAmount) === 60 && paidRow.paymentStatus === 'PARTIAL', 'pay should update paid and remaining amounts');
  assert(paidRow.payments[0].createdBy === user.username && paidRow.logs.some((log) => log.action === 'PAY' && log.actor === user.username), 'pay should derive actor from request user');

  const concurrent = await Promise.allSettled([
    service.pay({ id: approved.id, amount: 60 }, user),
    service.pay({ id: approved.id, amount: 60 }, user),
  ]);
  assert(concurrent.filter((result) => result.status === 'fulfilled').length === 1, 'row lock should allow only one concurrent final payment');
  assert(concurrent.filter((result) => result.status === 'rejected').length === 1, 'row lock should reject duplicate concurrent final payment');
  paidRow = await prisma.commissionEntry.findUniqueOrThrow({ where: { id: approved.id }, include: { payments: true } });
  assert(Number(paidRow.paidAmount) === 100 && Number(paidRow.remainingAmount) === 0 && paidRow.paymentStatus === 'PAID', 'concurrent pay should not exceed commission amount');
  assert(paidRow.payments.length === 2, 'concurrent pay should create only one final payment row');

  const revocable = await createEntry(prisma, run, 'REVOKE-A', 'BR-A', 'DEP-A', 'APPROVED');
  const revokedResult = await service.revoke({ id: revocable.id, actor: 'client-spoof' }, user);
  assert(revokedResult.changed === 1, 'revoke should update scoped approved report');
  const revokedRow = await prisma.commissionEntry.findUniqueOrThrow({ where: { id: revocable.id }, include: { logs: true } });
  assert(revokedRow.status === 'REVOKED' && revokedRow.logs.some((log) => log.action === 'REVOKE' && log.actor === user.username), 'revoke should derive actor from request user');
  await rejects(() => service.revoke({ id: approved.id }, user), 'revoke should reject paid report');

  const rejectable = await createEntry(prisma, run, 'REJECT-A', 'BR-A', 'DEP-A');
  const rejectedResult = await service.reject({ id: rejectable.id, actor: 'client-spoof' }, user);
  assert(rejectedResult.changed === 1, 'reject should update scoped pending report');
  const rejectedRow = await prisma.commissionEntry.findUniqueOrThrow({ where: { id: rejectable.id } });
  assert(rejectedRow.status === 'REJECTED' && rejectedRow.rejectedBy === user.username, 'reject should derive actor from request user');

  await prisma.$disconnect();
  console.log('TEST_COMMISSION_REPORTS_SECURITY_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
