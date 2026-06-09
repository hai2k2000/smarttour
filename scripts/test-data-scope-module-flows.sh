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
const { BookingsService } = require('./apps/api/dist/modules/bookings/bookings.service');
const { OperationVouchersService } = require('./apps/api/dist/modules/operation-vouchers/operation-vouchers.service');
const { OrdersService } = require('./apps/api/dist/modules/orders/orders.service');
const { SuppliersService } = require('./apps/api/dist/modules/suppliers/suppliers.service');
const { TourGuidesService } = require('./apps/api/dist/modules/tour-guides/tour-guides.service');
const { TourCoreService } = require('./apps/api/dist/modules/tours/tour-core.service');
const { FitTourLegacyCompatService } = require('./apps/api/dist/modules/fit-tours/fit-tour-legacy-compat.service');

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

  const tourCore = new TourCoreService(prisma);
  const fitLegacyCompat = new FitTourLegacyCompatService();
  const finance = new FinanceService(prisma, {});
  const gitTours = new GitToursService(prisma, tourCore);
  const landTours = new LandToursService(prisma, tourCore);
  const fitTours = new FitToursService(prisma, tourCore, fitLegacyCompat);
  const bookings = new BookingsService(prisma);
  const operationVouchers = new OperationVouchersService(prisma);
  const orders = new OrdersService(prisma);
  const suppliers = new SuppliersService(prisma, {});
  const tourGuides = new TourGuidesService(prisma, {});
  const run = 'SCOPE-' + Date.now();

  const branchUser = user('BR-A', 'DEP-A', 'data.scope.branch');
  const departmentUser = user('BR-X', 'DEP-B', 'data.scope.department');
  const mixedUser = user('BR-A', 'DEP-A', 'data.scope.branch', 'data.scope.department');
  const noScopeUser = user('BR-A', 'DEP-A', 'tour.view');
  const allUser = user(null, null, 'data.scope.all');
  const missingBranchUser = user(null, 'DEP-A', 'data.scope.branch');
  const missingDepartmentUser = user('BR-A', null, 'data.scope.department');

  const customerA = await prisma.customer.create({
    data: { code: run + '-CA', fullName: 'Customer A', phone: '090' + String(Date.now()).slice(-7), branch: 'BR-A', department: 'DEP-A' },
  });
  const customerB = await prisma.customer.create({
    data: { code: run + '-CB', fullName: 'Customer B', phone: '091' + String(Date.now()).slice(-7), branch: 'BR-B', department: 'DEP-B' },
  });
  const customerBranchOnly = await prisma.customer.create({
    data: { code: run + '-CBR', fullName: 'Customer Branch Only', phone: '092' + String(Date.now()).slice(-7), branch: 'BR-A', department: 'DEP-X' },
  });
  const tourProgram = await prisma.tourProgram.create({
    data: { code: run + '-TP', name: 'Scoped Program', route: 'HAN-DAD', durationDays: 3 },
  });
  await prisma.tourItineraryDay.createMany({
    data: [1, 2, 3].map((dayNumber) => ({
      tourProgramId: tourProgram.id,
      dayNumber,
      title: `Scoped day ${dayNumber}`,
      description: `Data-scope itinerary day ${dayNumber}`,
    })),
  });
  const orderA = await prisma.order.create({
    data: { type: 'FIT_TOUR', systemCode: run + '-ORD-A', name: 'Order A', branch: 'BR-A', department: 'DEP-A', customerId: customerA.id },
  });
  const orderB = await prisma.order.create({
    data: { type: 'FIT_TOUR', systemCode: run + '-ORD-B', name: 'Order B', branch: 'BR-B', department: 'DEP-B', customerId: customerB.id },
  });
  const scopedCreatedOrder = await orders.create('single-services', {
    systemCode: run + '-ORD-CREATED-A',
    name: 'Scoped created order',
    salesItems: [{ description: 'Scoped revenue', quantity: 1, serviceCount: 1, unitPrice: 100 }],
  }, branchUser);
  assert(scopedCreatedOrder.branch === 'BR-A' && !scopedCreatedOrder.department, 'order create should inject only the required branch scope');
  const departmentCreatedOrder = await orders.create('single-services', {
    systemCode: run + '-ORD-CREATED-DEP',
    name: 'Department scoped created order',
  }, departmentUser);
  assert(departmentCreatedOrder.department === 'DEP-B' && !departmentCreatedOrder.branch, 'order create should inject only the required department scope');
  assert((await orders.list('fit-tours', run, branchUser)).map((row) => row.id).join(',') === orderA.id, 'branch user should only list scoped orders');
  assert((await orders.list('fit-tours', run, departmentUser)).map((row) => row.id).join(',') === orderB.id, 'department user should only list scoped orders');
  assert((await orders.list('fit-tours', run, noScopeUser)).length === 0, 'order list should return no sensitive rows for user without data scope');
  assert((await orders.detail('fit-tours', orderA.id, branchUser)).id === orderA.id, 'branch user should read scoped order detail');
  await rejects(() => orders.detail('fit-tours', orderB.id, branchUser), 'branch user should not read other branch order detail');
  const mixedOrder = await prisma.order.create({
    data: { type: 'FIT_TOUR', systemCode: run + '-ORD-MIX-BOTH', name: 'Order Mixed Both', branch: 'BR-A', department: 'DEP-A' },
  });
  const branchOnlyOrder = await prisma.order.create({
    data: { type: 'FIT_TOUR', systemCode: run + '-ORD-MIX-BRANCH', name: 'Order Mixed Branch Only', branch: 'BR-A', department: 'DEP-X' },
  });
  const departmentOnlyOrder = await prisma.order.create({
    data: { type: 'FIT_TOUR', systemCode: run + '-ORD-MIX-DEPT', name: 'Order Mixed Department Only', branch: 'BR-X', department: 'DEP-A' },
  });
  const tourA = await prisma.tour.create({
    data: {
      type: 'FIT',
      systemCode: run + '-TOUR-SYS-A',
      tourCode: run + '-TOUR-A',
      name: 'Tour A',
      orderId: orderA.id,
      branch: 'BR-A',
      department: 'DEP-A',
    },
  });
  const tourB = await prisma.tour.create({
    data: {
      type: 'FIT',
      systemCode: run + '-TOUR-SYS-B',
      tourCode: run + '-TOUR-B',
      name: 'Tour B',
      orderId: orderB.id,
      branch: 'BR-B',
      department: 'DEP-B',
    },
  });
  const mixedRows = await orders.list('fit-tours', run + '-ORD-MIX', mixedUser);
  assert(mixedRows.map((row) => row.id).join(',') === mixedOrder.id, 'mixed branch+department user should only list orders matching both scope values');
  assert((await orders.detail('fit-tours', mixedOrder.id, mixedUser)).id === mixedOrder.id, 'mixed branch+department user should read order detail matching both scope values');
  await rejects(() => orders.detail('fit-tours', branchOnlyOrder.id, mixedUser), 'mixed user should not read same-branch different-department order detail');
  await rejects(() => orders.detail('fit-tours', departmentOnlyOrder.id, mixedUser), 'mixed user should not read same-department different-branch order detail');
  await rejects(() => orders.create('single-services', { systemCode: run + '-ORD-OUTSIDE', name: 'Outside order', branch: 'BR-B' }, branchUser), 'order create should reject explicit outside branch');
  await rejects(() => orders.create('single-services', { systemCode: run + '-ORD-NOSCOPE', name: 'No scope order' }, noScopeUser), 'order create should reject user without data scope');
  const scopedUpdatedOrder = await orders.update('fit-tours', orderA.id, { name: 'Order A Updated' }, branchUser);
  assert(scopedUpdatedOrder.name === 'Order A Updated' && scopedUpdatedOrder.branch === 'BR-A', 'order update should allow mutation inside scope');
  await rejects(() => orders.update('fit-tours', orderB.id, { name: 'Blocked update' }, branchUser), 'order update should reject mutation outside branch scope');
  await rejects(() => orders.remove('fit-tours', orderB.id, branchUser), 'order remove should reject mutation outside branch scope');
  await rejects(() => orders.copy('fit-tours', orderB.id, branchUser), 'order copy should reject mutation outside branch scope');
  await rejects(() => orders.settle('fit-tours', orderB.id, branchUser), 'order settle should reject mutation outside branch scope');

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
  await rejects(() => finance.createInvoice({ invoiceCode: run + '-INV-MISSING-BRANCH', customerId: customerA.id, items: [{ itemName: 'Missing branch', quantity: 1, unitPrice: 1 }] }, missingBranchUser), 'branch scoped finance write should reject user without branch');
  await rejects(() => finance.createInvoice({ invoiceCode: run + '-INV-MISSING-DEPT', customerId: customerA.id, items: [{ itemName: 'Missing department', quantity: 1, unitPrice: 1 }] }, missingDepartmentUser), 'department scoped finance write should reject user without department');

  const bookingA = await bookings.create({
    code: run + '-BK-A',
    tourProgramId: tourProgram.id,
    customerId: customerA.id,
    orderId: orderA.id,
    tourId: tourA.id,
    customerName: customerA.fullName,
    paxCount: 2,
    startDate: '2026-12-03',
    endDate: '2026-12-05',
  }, branchUser);
  await bookings.create({
    code: run + '-BK-B',
    tourProgramId: tourProgram.id,
    customerId: customerB.id,
    orderId: orderB.id,
    tourId: tourB.id,
    customerName: customerB.fullName,
    paxCount: 2,
    startDate: '2026-12-04',
    endDate: '2026-12-06',
  }, allUser);
  assert((await bookings.list(run, undefined, undefined, branchUser)).map((row) => row.id).join(',') === bookingA.id, 'branch user should only list scoped bookings');
  const crossScopedBooking = await bookings.create({
    code: run + '-BK-CROSS',
    tourProgramId: tourProgram.id,
    customerId: customerBranchOnly.id,
    orderId: departmentOnlyOrder.id,
    customerName: customerBranchOnly.fullName,
    paxCount: 2,
    startDate: '2026-12-07',
    endDate: '2026-12-09',
  }, allUser);
  assert((await bookings.list(run, undefined, undefined, mixedUser)).map((row) => row.id).join(',') === bookingA.id, 'mixed user should only list bookings with one linked row matching both branch and department');
  await rejects(() => bookings.detail(crossScopedBooking.id, mixedUser), 'mixed user should not read booking whose branch and department match across different linked rows');
  await rejects(() => bookings.create({ code: run + '-BK-NOLINK', tourProgramId: tourProgram.id, customerName: 'No Link', paxCount: 1, startDate: '2026-12-01', endDate: '2026-12-02' }, branchUser), 'branch scoped booking write should require scoped link');
  await rejects(() => bookings.create({ code: run + '-BK-OTHER', tourProgramId: tourProgram.id, customerId: customerB.id, customerName: customerB.fullName, paxCount: 1, startDate: '2026-12-01', endDate: '2026-12-02' }, branchUser), 'branch scoped booking write should reject other branch customer');
  await rejects(() => bookings.create({ code: run + '-BK-NOSCOPE', tourProgramId: tourProgram.id, customerId: customerA.id, customerName: customerA.fullName, paxCount: 1, startDate: '2026-12-01', endDate: '2026-12-02' }, noScopeUser), 'booking write should reject users without data scope');
  await rejects(() => bookings.update(bookingA.id, { customerId: customerB.id }, branchUser), 'booking update should reject customer outside branch scope');
  await rejects(() => bookings.update(bookingA.id, { orderId: orderB.id }, branchUser), 'booking update should reject order outside branch scope');
  await rejects(() => bookings.update(bookingA.id, { tourId: tourB.id }, branchUser), 'booking update should reject tour outside branch scope');

  const voucherA = await operationVouchers.create({
    voucherCode: run + '-VCH-A',
    orderId: orderA.id,
    supplierName: 'Supplier A',
    serviceType: 'HOTEL',
    serviceName: 'Hotel A',
    serviceDate: '2026-12-03',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 100, vat: 0 }],
  }, branchUser);
  await operationVouchers.create({
    voucherCode: run + '-VCH-B',
    orderId: orderB.id,
    supplierName: 'Supplier B',
    serviceType: 'HOTEL',
    serviceName: 'Hotel B',
    serviceDate: '2026-12-03',
    details: [{ serviceName: 'Room', quantity: 1, netPrice: 200, vat: 0 }],
  }, allUser);
  assert((await operationVouchers.list(run, undefined, branchUser)).map((row) => row.id).join(',') === voucherA.id, 'branch user should only list scoped operation vouchers');
  await rejects(() => operationVouchers.create({ voucherCode: run + '-VCH-NOLINK', supplierName: 'Supplier', serviceType: 'HOTEL', serviceName: 'Hotel', serviceDate: '2026-12-03', details: [{ serviceName: 'Room', quantity: 1, netPrice: 100, vat: 0 }] }, branchUser), 'scoped operation voucher write should require order, tour or booking');
  await rejects(() => operationVouchers.create({ voucherCode: run + '-VCH-OTHER', orderId: orderB.id, supplierName: 'Supplier', serviceType: 'HOTEL', serviceName: 'Hotel', serviceDate: '2026-12-03', details: [{ serviceName: 'Room', quantity: 1, netPrice: 100, vat: 0 }] }, branchUser), 'scoped operation voucher write should reject other branch order');
  const requestPayment = await operationVouchers.createPaymentVoucher(voucherA.id, branchUser);
  assert(requestPayment.financePayments[0]?.branch === 'BR-A', 'operation voucher finance payment should inherit branch scope');

  const supplierCategory = await prisma.supplierCategory.create({ data: { name: run + '-Hotel' } });
  const supplier = await prisma.supplier.create({ data: { categoryId: supplierCategory.id, supplierCode: run + '-SUP', name: 'Scoped Supplier' } });
  const allotment = await prisma.supplierAllotment.create({
    data: { supplierId: supplier.id, serviceName: 'Scoped Room', allotmentQty: 10, status: 'ACTIVE' },
  });
  const scopedLock = await suppliers.lockAllotment(allotment.id, { orderId: orderA.id, quantity: 1, actor: 'scope-test' }, branchUser);
  assert(scopedLock.allocation.orderId === orderA.id, 'branch user should lock allotment against scoped order');
  await suppliers.confirmAllotmentAllocation(scopedLock.allocation.id, { note: 'confirm scoped' }, branchUser);
  const otherLock = await suppliers.lockAllotment(allotment.id, { orderId: orderB.id, quantity: 1, actor: 'scope-test' }, allUser);
  await rejects(() => suppliers.lockAllotment(allotment.id, { quantity: 1, actor: 'scope-test' }, branchUser), 'scoped allotment lock should require order, booking or tour');
  await rejects(() => suppliers.lockAllotment(allotment.id, { orderId: orderB.id, quantity: 1, actor: 'scope-test' }, branchUser), 'scoped allotment lock should reject other branch order');
  await rejects(() => suppliers.lockAllotment(allotment.id, { orderId: orderA.id, quantity: 1, actor: 'scope-test' }, missingBranchUser), 'branch scoped allotment lock should reject user without branch');
  await rejects(() => suppliers.lockAllotment(allotment.id, { orderId: orderA.id, quantity: 1, actor: 'scope-test' }, missingDepartmentUser), 'department scoped allotment lock should reject user without department');
  await rejects(() => suppliers.releaseAllotmentAllocation(otherLock.allocation.id, { note: 'release other' }, branchUser), 'scoped allotment release should reject other branch allocation');

  const guideA = await tourGuides.create({
    guideCode: run + '-GUIDE-A',
    fullName: 'Guide A',
    phone: '098' + String(Date.now()).slice(-7),
    schedules: [{ orderId: orderA.id, title: 'Scoped order', startDate: '2026-12-07', endDate: '2026-12-08' }],
  }, branchUser);
  assert(guideA.schedules[0]?.orderId === orderA.id, 'branch user should create guide schedule for scoped order');
  await rejects(() => tourGuides.create({
    guideCode: run + '-GUIDE-OTHER',
    fullName: 'Guide Other',
    phone: '097' + String(Date.now()).slice(-7),
    schedules: [{ orderId: orderB.id, title: 'Other order', startDate: '2026-12-09', endDate: '2026-12-10' }],
  }, branchUser), 'scoped guide schedule should reject other branch order');
  await rejects(() => tourGuides.create({
    guideCode: run + '-GUIDE-MISSING-BR',
    fullName: 'Guide Missing Branch',
    phone: '096' + String(Date.now()).slice(-7),
    schedules: [{ orderId: orderA.id, title: 'Missing branch', startDate: '2026-12-11', endDate: '2026-12-12' }],
  }, missingBranchUser), 'branch scoped guide schedule should reject user without branch');
  await rejects(() => tourGuides.create({
    guideCode: run + '-GUIDE-MISSING-DEP',
    fullName: 'Guide Missing Department',
    phone: '095' + String(Date.now()).slice(-7),
    schedules: [{ orderId: orderA.id, title: 'Missing department', startDate: '2026-12-13', endDate: '2026-12-14' }],
  }, missingDepartmentUser), 'department scoped guide schedule should reject user without department');
  await rejects(() => tourGuides.update(guideA.id, {
    schedules: [{ orderId: orderB.id, title: 'Move other', startDate: '2026-12-15', endDate: '2026-12-16' }],
  }, branchUser), 'scoped guide schedule update should reject other branch order');

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
