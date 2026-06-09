#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_fit_tour_root_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_FIT_TOUR_ROOT_CONTRACT missing POSTGRES_PASSWORD"
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
const { FitServiceStatus, FitTourWorkflowStatus, TourServiceStatus, TourStatus, TourType } = require('@prisma/client');
const { PrismaService } = require('./apps/api/dist/database/prisma.service');
const { FitTourLegacyCompatService } = require('./apps/api/dist/modules/fit-tours/fit-tour-legacy-compat.service');
const { FitToursService } = require('./apps/api/dist/modules/fit-tours/fit-tours.service');
const { TourCoreService } = require('./apps/api/dist/modules/tours/tour-core.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function decimal(value) {
  return Number(value || 0);
}

function rootCode(value) {
  return String(value).toUpperCase();
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const tourCore = new TourCoreService(prisma);
  const fitTours = new FitToursService(prisma, tourCore, new FitTourLegacyCompatService());
  const run = 'FTR-' + Date.now();

  const category = await prisma.supplierCategory.create({ data: { name: `${run} Supplier Category` } });
  const supplier = await prisma.supplier.create({
    data: {
      categoryId: category.id,
      supplierCode: `${run}-SUP`,
      name: `${run} Supplier`,
    },
  });
  const supplierService = await prisma.supplierService.create({
    data: {
      supplierId: supplier.id,
      sku: `${run}-SVC`,
      serviceName: `${run} Hotel Room`,
      quantity: 10,
      netPrice: 900,
      sellingPrice: 1200,
    },
  });

  const source = await fitTours.create({
    quoteCode: `${run}-SRC-Q`,
    tourCode: `${run}-SRC-T`,
    tourName: 'FIT Root Contract Source',
    customerName: 'FIT Root Customer',
    adultCount: 2,
    startDate: '2026-08-01',
    endDate: '2026-08-03',
    sellingPrice: 5000000,
    commonCosts: [{ serviceType: 'CAR', description: 'Source car', quantity: 1, times: 1, unitPrice: 1000, vat: 0, amount: 1000 }],
    budgetServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, description: 'Budget hotel', quantity: 2, unitPrice: 1000, vat: 10, amount: 2200 }],
    operationServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, supplierServiceId: supplierService.id, bookingCode: `${run}-BK`, quantity: 2, confirmedUnitPrice: 1200, vat: 10, amount: 2640, status: FitServiceStatus.CONFIRMED }],
  });
  assert(source.tourId, 'FIT create should return linked Tour root id');

  const createdRoot = await prisma.tour.findUnique({
    where: { id: source.tourId },
    include: { fitTour: true, customers: true, services: true, costs: true, revenues: true, suppliers: true },
  });
  assert(createdRoot, 'FIT create should create Tour root');
  assert(createdRoot.type === TourType.FIT, 'Tour root should be FIT type');
  assert(createdRoot.systemCode === rootCode(`${run}-SRC-Q`), 'Tour root systemCode should use FIT quoteCode');
  assert(createdRoot.tourCode === rootCode(`${run}-SRC-T`), 'Tour root tourCode should use FIT tourCode');
  assert(createdRoot.name === 'FIT Root Contract Source', 'Tour root should own common tour name');
  assert(createdRoot.workflowStep === FitTourWorkflowStatus.DRAFT, 'Tour root should store FIT workflow step separately');
  assert(createdRoot.fitTour.id === source.id, 'Tour root should link back to FIT detail');
  assert(createdRoot.customers.length === 1 && createdRoot.customers[0].name === 'FIT Root Customer', 'Tour root should own primary customer');
  assert(createdRoot.revenues.length === 1 && decimal(createdRoot.revenues[0].amount) === 5000000, 'Tour root should own revenue rows');
  assert(createdRoot.costs.length === 1 && decimal(createdRoot.costs[0].expectedAmount) === 1000, 'Tour root should own cost rows');
  assert(createdRoot.services.length === 2, 'Tour root should own budget and operation services');
  assert(createdRoot.suppliers.length === 1 && createdRoot.suppliers[0].supplierId === supplier.id, 'Tour root should derive suppliers from services');

  await fitTours.update(source.id, {
    workflowStatus: FitTourWorkflowStatus.PRICING,
    tourName: 'FIT Root Contract Source Updated',
    budgetServices: [{ serviceType: 'HOTEL', supplierId: supplier.id, description: 'Updated budget hotel', quantity: 3, unitPrice: 1000, vat: 0, amount: 3000 }],
  });
  const updatedRoot = await prisma.tour.findUnique({ where: { id: source.tourId }, include: { services: true } });
  const updatedFit = await prisma.fitTour.findUnique({ where: { id: source.id } });
  assert(updatedRoot.name === 'FIT Root Contract Source Updated', 'FIT update should update Tour root before legacy detail');
  assert(updatedRoot.workflowStep === FitTourWorkflowStatus.PRICING, 'Tour root workflowStep should follow FIT workflow');
  assert(updatedRoot.status === TourStatus.UPCOMING, 'TourStatus should remain lifecycle status separate from FIT workflow');
  assert(updatedFit.workflowStatus === FitTourWorkflowStatus.PRICING, 'FIT workflow status should remain on FIT detail');
  assert(updatedRoot.services.filter((service) => decimal(service.budgetAmount) > 0).length === 1, 'FIT update should resync common budget services');
  assert(decimal(updatedRoot.services.find((service) => decimal(service.budgetAmount) > 0).budgetAmount) === 3000, 'Common budget amount should match updated FIT budget');

  const target = await fitTours.create({
    quoteCode: `${run}-TGT-Q`,
    tourCode: `${run}-TGT-T`,
    tourName: 'FIT Root Contract Target',
    customerName: 'FIT Root Target Customer',
    adultCount: 1,
    budgetServices: [{ serviceType: 'MEAL', description: 'Old target budget', quantity: 1, unitPrice: 100, vat: 0, amount: 100 }],
  });
  assert(target.tourId, 'target FIT should have Tour root');

  await fitTours.copyBudget(target.id, source.id);
  const copiedBudgetLegacyRows = await prisma.fitBudgetService.findMany({ where: { fitTourId: target.id } });
  const targetBudgetServices = await prisma.tourService.findMany({ where: { tourId: target.tourId, budgetAmount: { gt: 0 } } });
  assert(copiedBudgetLegacyRows.length === 1 && decimal(copiedBudgetLegacyRows[0].amount) === 3000, 'copyBudget should update legacy FIT budget rows');
  assert(targetBudgetServices.length === 1 && decimal(targetBudgetServices[0].budgetAmount) === 3000, 'copyBudget should update common TourService budget rows');

  await fitTours.copyOperation(target.id, source.id);
  const copiedOperationLegacyRows = await prisma.fitOperationService.findMany({ where: { fitTourId: target.id } });
  const targetOperationServices = await prisma.tourService.findMany({ where: { tourId: target.tourId, confirmedAmount: { gt: 0 } } });
  assert(copiedOperationLegacyRows.length === 1 && copiedOperationLegacyRows[0].supplierServiceId === supplierService.id, 'copyOperation should update legacy FIT operation rows');
  assert(targetOperationServices.length === 1 && targetOperationServices[0].supplierServiceId === supplierService.id, 'copyOperation should update common TourService operation rows');
  assert(targetOperationServices[0].confirmationStatus === TourServiceStatus.CONFIRMED, 'copyOperation should map FIT service status to common TourService status');

  const removed = await fitTours.remove(target.id);
  const removedRoot = await prisma.tour.findUnique({ where: { id: target.tourId } });
  assert(removed.workflowStatus === FitTourWorkflowStatus.CANCELLED, 'FIT remove should cancel legacy workflow detail');
  assert(removedRoot.status === TourStatus.CANCELLED && removedRoot.deletedAt, 'FIT remove should soft-delete the Tour root');

  await prisma.$disconnect();
  console.log('TEST_FIT_TOUR_ROOT_CONTRACT_OK');
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
