#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"
TEST_DB="${TEST_DB:-smarttour_customers_service_test}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"

cd "$REPO_DIR"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep -E '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "FAIL_CUSTOMERS_SERVICE_TEST missing POSTGRES_PASSWORD"
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
const { CustomersService } = require('./apps/api/dist/modules/customers/customers.service');
const { fileUploadMaxBytes, FilesService } = require('./apps/api/dist/modules/files/files.service');
const fs = require('fs');

function role(...permissions) {
  return { role: { permissions: permissions.map((permission) => ({ permission })) } };
}

function user(data, ...permissions) {
  return {
    id: data.id || 'test-user',
    name: data.name || 'Scoped User',
    username: data.username || 'scoped',
    email: data.email || 'scoped@smarttour.local',
    branch: data.branch,
    department: data.department,
    roles: [role(...permissions)],
  };
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

async function rejectsMessage(action, fragment, label) {
  try {
    await action();
  } catch (error) {
    assert(String(error.message || '').includes(fragment), label + ': unexpected message ' + String(error.message || error));
    return;
  }
  throw new Error(label);
}

class FakeFilesService {
  constructor() {
    this.counter = 0;
    this.removed = [];
    this.failRemove = false;
  }
  async upload(file, scope, actorId) {
    if (!file?.buffer) throw new Error('missing file');
    this.counter += 1;
    const objectKey = `${scope}/fake-${this.counter}.txt`;
    return {
      bucket: 'test',
      objectKey,
      fileName: file.originalname,
      mimeType: file.mimetype || 'text/plain',
      size: file.size,
      url: `/api/files/download?key=${encodeURIComponent(objectKey)}`,
      actorId,
    };
  }
  objectKeyFromUrl(fileUrl) {
    return new URL(fileUrl, 'http://smarttour.local').searchParams.get('key');
  }
  async removeIfPresent(objectKey) {
    if (!objectKey) return { deleted: false, objectKey: null };
    if (this.failRemove) throw new Error('storage remove failed');
    this.removed.push(objectKey);
    return { deleted: true, objectKey };
  }
  async removeQuietly(objectKey) {
    if (!objectKey) return;
    this.removed.push(objectKey);
  }
}

async function main() {
  const serviceSource = fs.readFileSync('/workspace/apps/api/src/modules/customers/customers.service.ts', 'utf8');
  {
    const start = serviceSource.indexOf('async debts(');
    const next = serviceSource.indexOf('\n  async ', start + 1);
    const block = start === -1 ? '' : serviceSource.slice(start, next === -1 ? serviceSource.length : next);
    assert(block.includes('customerDebtSummaryFromDb(customer, user)'), 'customer debts must use aggregate order summary helper');
    assert(!block.includes('.reduce('), 'customer debts must not reduce bounded order rows');
  }
  {
    const start = serviceSource.indexOf('private async customerDebtSummaryFromDb(');
    const block = start === -1 ? '' : serviceSource.slice(start, start + 1400);
    assert(block.includes('.aggregate({'), 'customerDebtSummaryFromDb must aggregate order totals in the database');
    assert(block.includes('_sum:'), 'customerDebtSummaryFromDb must sum order financial fields in the database');
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  const files = new FakeFilesService();
  const service = new CustomersService(prisma, files);
  const realFiles = new FilesService();
  const run = 'CUST-SVC-' + Date.now();
  const allUser = user({ id: 'all-user', name: 'All User', username: 'all', email: 'all@smarttour.local' }, '*', 'data.scope.all');
  const branchUser = user({ id: 'branch-user', name: 'Branch User', username: 'branch', email: 'branch@smarttour.local', branch: 'BR-A', department: 'DEP-A' }, 'data.scope.branch');
  const branchDebtUser = user({ id: 'branch-debt-user', name: 'Branch Debt User', username: 'branch-debt', email: 'branch-debt@smarttour.local', branch: 'BR-A', department: 'DEP-A' }, 'data.scope.branch', 'finance.debt.view');

  const type = await prisma.customerTypeConfig.create({ data: { code: run + '-TYPE', name: 'VIP', isActive: true } });
  await rejectsMessage(() => service.create({ code: run + '-BAD-DOB', fullName: 'Bad Date Customer', phone: '098' + String(Date.now()).slice(-7), dateOfBirth: '2026-02-31' }, branchUser), 'Date is invalid', 'create should reject impossible customer birth dates');
  await rejectsMessage(
    () => service.create({ code: run + '-BAD-MERGED-CREATE', fullName: 'Bad Merged Customer', phone: '089' + String(Date.now()).slice(-7), status: 'MERGED' }, branchUser),
    'MERGED',
    'create should reject direct MERGED customer status',
  );
  const campaign = await prisma.customerCampaign.create({ data: { code: run + '-CMP', name: 'Summer', isActive: true } });
  const tagA = await prisma.customerTag.create({ data: { name: run + '-TAG-A', isActive: true } });
  const tagB = await prisma.customerTag.create({ data: { name: run + '-TAG-B', isActive: true } });

  const linkPhone = '096' + String(Date.now()).slice(-7);
  const linkEmail = `linked-${Date.now()}@smarttour.local`;
  await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: run + '-ORD-LINK', name: 'Orphan Order', branch: 'BR-A', department: 'DEP-A', customerName: 'Linked Customer', customerPhone: linkPhone, customerEmail: linkEmail } });
  const outOfScopeOrphanOrder = await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: run + '-ORD-LINK-OTHER-BRANCH', name: 'Other Branch Orphan Order', branch: 'BR-B', department: 'DEP-B', customerName: 'Linked Customer', customerPhone: linkPhone, customerEmail: linkEmail } });
  await prisma.quotation.create({ data: { quoteCode: run + '-Q-LINK', productType: 'FIT', customerName: 'Linked Customer', customerPhone: linkPhone, customerEmail: linkEmail, branch: 'BR-A', department: 'DEP-A' } });
  await prisma.tourQuote.create({ data: { quoteCode: run + '-TQ-LINK', tourCode: run + '-TQ-TOUR', customerName: 'Linked Customer', customerPhone: linkPhone, customerEmail: linkEmail } });
  const tourProgram = await prisma.tourProgram.create({ data: { code: run + '-TP-LINK', name: 'Linked Program', durationDays: 3 } });
  await prisma.booking.create({ data: { code: run + '-BK-LINK', tourProgramId: tourProgram.id, customerName: 'Linked Customer', customerPhone: linkPhone, customerEmail: linkEmail, paxCount: 2, startDate: new Date('2026-08-01'), endDate: new Date('2026-08-03') } });
  const tour = await prisma.tour.create({ data: { type: 'FIT', systemCode: run + '-TOUR-SYS-LINK', tourCode: run + '-TOUR-LINK', branch: 'BR-A', department: 'DEP-A' } });
  await prisma.tourCustomer.create({ data: { tourId: tour.id, name: 'Linked Customer', phone: linkPhone, email: linkEmail } });
  await prisma.fitTour.create({ data: { quoteCode: run + '-FIT-LINK', tourCode: run + '-FIT-TOUR', customerName: 'Linked Customer', phone: linkPhone, email: linkEmail } });
  await prisma.financeReceipt.create({ data: { receiptCode: run + '-REC-LINK', receiptName: 'Linked Receipt', payerName: 'Linked Customer', payerPhone: linkPhone, payerEmail: linkEmail, branch: 'BR-A', department: 'DEP-A' } });
  await prisma.financeInvoice.create({ data: { invoiceCode: run + '-INV-LINK', customerName: 'Linked Customer', customerPhone: linkPhone, customerEmail: linkEmail } });

  const linked = await service.create({ code: run + '-LINK', fullName: 'Linked Customer', phone: linkPhone, email: linkEmail }, branchUser);
  assert(await prisma.order.count({ where: { customerId: linked.id, customerPhone: linkPhone, branch: 'BR-A' } }) === 1, 'create should link scoped orphan orders by phone/email/name');
  assert((await prisma.order.findUnique({ where: { id: outOfScopeOrphanOrder.id } })).customerId === null, 'scoped create should not link orphan orders outside data scope');
  assert(await prisma.quotation.count({ where: { customerId: linked.id, customerPhone: linkPhone } }) === 1, 'create should link orphan quotations');
  assert(await prisma.tourQuote.count({ where: { customerId: linked.id, customerPhone: linkPhone } }) === 1, 'create should link orphan tour quotes');
  assert(await prisma.booking.count({ where: { customerId: linked.id, customerPhone: linkPhone } }) === 1, 'create should link orphan bookings');
  assert(await prisma.tourCustomer.count({ where: { crmCustomerId: linked.id, phone: linkPhone } }) === 1, 'create should link orphan tour customers');
  assert(await prisma.fitTour.count({ where: { customerId: linked.id, phone: linkPhone } }) === 1, 'create should link orphan FIT tours');
  assert(await prisma.financeReceipt.count({ where: { customerId: linked.id, payerPhone: linkPhone } }) === 1, 'create should link orphan finance receipts');
  assert(await prisma.financeInvoice.count({ where: { customerId: linked.id, customerPhone: linkPhone } }) === 1, 'create should link orphan finance invoices');
  const blockedPhone = '097' + String(Date.now()).slice(-7);
  await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: run + '-ORD-LINKED-OTHER', name: 'Linked Other Order', branch: 'BR-A', department: 'DEP-A', customerId: linked.id, customerPhone: blockedPhone } });
  await rejects(() => service.create({ code: run + '-PHONE-BLOCK', fullName: 'Blocked Customer', phone: blockedPhone }, branchUser), 'create should reject phone already linked to another customer business row');

  const customer = await service.create({
    code: run + '-A',
    fullName: 'Customer A',
    phone: '090' + String(Date.now()).slice(-7),
    typeId: type.id,
    campaignId: campaign.id,
    tagIds: [tagA.id],
    contacts: [{ fullName: 'Primary Contact', phone: '0911000000' }],
    careTasks: [{ channel: 'PHONE', scheduledAt: '2026-07-01', owner: 'care-a' }],
    comments: [{ content: 'Initial comment', createdBy: 'tester' }],
    callLogs: [{ caller: 'tester', calledAt: '2026-07-01', durationSec: 60, note: 'hello' }],
    opportunities: [{ title: 'Opportunity A', value: 1000, probability: 50 }],
  }, branchUser);
  assert(customer.branch === 'BR-A', 'create should inject branch scope');
  assert(customer.createdBy === branchUser.name && customer.comments[0].createdBy === branchUser.name, 'create should derive customer and comment createdBy from request.user');
  assert(customer.contacts.length === 1 && customer.tags.length === 1, 'create should persist contacts and tags');

  await rejectsMessage(() => realFiles.upload(undefined), 'Cần chọn file', 'file upload should require a selected file');
  await rejectsMessage(() => realFiles.upload({ originalname: 'bad.svg', mimetype: 'image/svg+xml', size: 5, buffer: Buffer.from('bad') }), 'Định dạng file không được phép tải lên', 'file upload should reject dangerous extensions');
  await rejectsMessage(() => realFiles.upload({ originalname: 'bad.txt', mimetype: 'image/svg+xml', size: 5, buffer: Buffer.from('bad') }), 'MIME type của file không được phép tải lên', 'file upload should reject dangerous mime types');
  await rejectsMessage(() => realFiles.upload({ originalname: 'mismatch.txt', mimetype: 'text/plain', size: fileUploadMaxBytes() + 1, buffer: Buffer.from('x') }), 'Kích thước file không khớp với nội dung tải lên', 'file upload should reject mismatched size metadata');
  const oversizedBuffer = Buffer.alloc(fileUploadMaxBytes() + 1, 'x');
  await rejectsMessage(() => realFiles.upload({ originalname: 'large.txt', mimetype: 'text/plain', size: oversizedBuffer.length, buffer: oversizedBuffer }), 'File vượt quá giới hạn', 'file upload should reject files over max size');

  const partialUpdate = await service.update(customer.id, { latestComment: 'Partial only', note: 'partial update' }, branchUser);
  assert(partialUpdate.contacts.length === 1 && partialUpdate.tags.length === 1, 'partial update should not drop contacts or tags');
  assert(partialUpdate.latestComment === 'Partial only', 'partial update should update scalar field');
  await rejectsMessage(
    () => service.update(customer.id, { status: 'MERGED' }, branchUser),
    'MERGED',
    'update should reject direct MERGED customer status',
  );
  assert((await prisma.customer.findUnique({ where: { id: customer.id } })).status !== 'MERGED', 'rejected direct MERGED update must preserve customer status');

  await rejectsMessage(() => service.update(customer.id, { comments: [] }, branchUser), 'replaceNestedCollections', 'update should reject comment replacement without explicit replaceNestedCollections flag');
  assert(await prisma.customerComment.count({ where: { customerId: customer.id } }) === 1, 'rejected comment replacement must preserve existing comments');
  await rejectsMessage(() => service.update(customer.id, { contacts: [] }, branchUser), 'replaceNestedCollections', 'update should reject contact replacement without explicit replaceNestedCollections flag');
  assert(await prisma.customerContact.count({ where: { customerId: customer.id } }) === 1, 'rejected contact replacement must preserve existing contacts');

  const replaced = await service.update(customer.id, {
    replaceNestedCollections: true,
    fullName: 'Customer A Updated',
    contacts: [{ fullName: 'Replacement Contact', email: 'replace@example.test' }],
    tagIds: [tagB.id],
    careTasks: [{ channel: 'EMAIL', scheduledAt: '2026-07-02', owner: 'care-b' }],
    comments: [{ content: 'Replacement comment', createdBy: 'tester' }],
    callLogs: [{ caller: 'tester', calledAt: '2026-07-02', durationSec: 30, note: 'update' }],
    opportunities: [{ title: 'Opportunity B', value: 2000, probability: 25 }],
  }, branchUser);
  assert(replaced.contacts.length === 1 && replaced.contacts[0].fullName === 'Replacement Contact', 'update should replace contacts when supplied');
  assert(replaced.tags.length === 1 && replaced.tags[0].tagId === tagB.id, 'update should replace tags when supplied');

  await service.addComment(customer.id, { content: 'Follow up', createdBy: 'branch' }, branchUser);
  const taskDetail = await service.addCareTask(customer.id, { channel: 'PHONE', scheduledAt: '2026-07-03', owner: 'branch' }, branchUser);
  await service.addCallLog(customer.id, { caller: 'branch', calledAt: '2026-07-03', durationSec: 10, note: 'called' }, branchUser);
  await service.addOpportunity(customer.id, { title: 'New deal', value: 3000, probability: 60 }, branchUser);
  const taskId = taskDetail.careTasks[0].id;
  await service.updateCareTask(customer.id, taskId, { status: 'DONE', result: 'ok' }, branchUser);

  const outOfScope = await service.create({
    code: run + '-B',
    fullName: 'Customer B',
    phone: '091' + String(Date.now()).slice(-7),
    branch: 'BR-B',
    department: 'DEP-B',
  }, allUser);
  await rejects(() => service.detail(outOfScope.id, branchUser), 'branch user should not read customer outside scope');
  await rejects(() => service.bulkTag({ customerIds: [customer.id, outOfScope.id], tagIds: [tagA.id] }, branchUser), 'bulkTag should reject customers outside scope');
  await service.bulkTag({ customerIds: [customer.id], tagIds: [tagA.id] }, branchUser);
  await rejects(() => service.bulkUpdate({ customerIds: [customer.id], branch: 'BR-B' }, branchUser), 'bulkUpdate should reject branch changes outside scope');
  await service.bulkUpdate({ customerIds: [customer.id], owner: 'owner-bulk', tagIds: [tagA.id], actor: 'bulk-actor', note: 'bulk note' }, branchUser);
  assert((await prisma.customer.findUnique({ where: { id: customer.id } })).owner === 'owner-bulk', 'bulkUpdate should update scoped customer');
  assert(await prisma.customerTimeline.count({ where: { customerId: customer.id, eventType: 'BULK_UPDATE', actor: branchUser.name, content: 'bulk note' } }) === 1, 'bulkUpdate should derive actor from request.user and write note');

  await rejects(() => service.importRows({ rows: 'not-array' }, branchUser), 'importRows should reject non-array rows');
  const importedPhone = '094' + String(Date.now()).slice(-7);
  const importResult = await service.importRows({
    rows: [
      { code: run + '-IMP', fullName: 'Imported Customer', phone: importedPhone, tagIds: [tagA.id] },
      { code: run + '-IMP-BAD', fullName: 'Missing Phone' },
      null,
    ],
  }, branchUser);
  assert(importResult.created === 1 && importResult.failed === 2 && importResult.errors[0].row === 2 && importResult.errors[1].row === 3, 'importRows should return stable created/failed/errors format');
  const imported = await prisma.customer.findFirst({ where: { phone: importedPhone } });
  assert(imported?.branch === 'BR-A', 'importRows should apply user write scope');

  const order = await prisma.order.create({
    data: { type: 'FIT_TOUR', systemCode: run + '-ORD-A', name: 'Order A', branch: 'BR-A', department: 'DEP-A', customerId: customer.id, customerPhone: customer.phone, totalRevenue: 1000, paidAmount: 400 },
  });
  await prisma.order.create({
    data: { type: 'FIT_TOUR', systemCode: run + '-ORD-B', name: 'Order B', branch: 'BR-B', department: 'DEP-B', customerId: outOfScope.id, totalRevenue: 9999, paidAmount: 0 },
  });
  await prisma.quotation.create({ data: { quoteCode: run + '-Q-A', productType: 'FIT', customerId: customer.id, customerPhone: customer.phone, customerName: customer.fullName, branch: 'BR-A', department: 'DEP-A' } });
  await prisma.tourQuote.create({ data: { quoteCode: run + '-TQ-A', tourCode: run + '-TOUR-A', customerId: customer.id, customerPhone: customer.phone, customerName: customer.fullName } });
  const orders = await service.orders(customer.id, branchUser);
  const quotes = await service.quotes(customer.id, branchUser);
  const debts = await service.debts(customer.id, branchUser);
  const timeline = await service.timeline(customer.id, branchUser);
  const careHistory = await service.careHistory(customer.id, branchUser);
  const opportunities = await service.opportunities(customer.id, branchUser);
  const timelinePage = await service.timeline(customer.id, branchUser, { take: '1', skip: '0' });
  const detailWithoutDebt = await service.detail(customer.id, branchUser);
  const detailWithDebt = await service.detail(customer.id, branchDebtUser);
  assert(detailWithoutDebt.related.debts.receivableDebt === 0, 'detail should hide debt without finance.debt.view');
  assert(detailWithDebt.related.debts.receivableDebt === 600, 'detail should include debt with finance.debt.view');
  assert(orders.rows.length === 1 && orders.rows[0].id === order.id, 'orders should be customer and scope filtered');
  assert(quotes.rows.length === 2, 'quotes should include quotation and tour quote for scoped customer');
  assert(debts.receivableDebt === 600, 'debts should derive from scoped orders');
  assert(timeline.rows.length > 0 && careHistory.rows.length > 0 && opportunities.rows.length > 0, 'detail subresources should return scoped data');
  assert(timelinePage.rows.length === 1 && timelinePage.pagination.total >= timelinePage.rows.length, 'timeline should support explicit pagination');

  const dashboard = await service.dashboard({ search: 'Customer' }, branchUser);
  assert(dashboard.totalCustomers >= 1 && dashboard.totalRevenue === 1000 && dashboard.totalDebt === 0, 'dashboard should hide debt without finance.debt.view');
  const dashboardWithDebt = await service.dashboard({ search: 'Customer' }, branchDebtUser);
  assert(dashboardWithDebt.totalCustomers >= 1 && dashboardWithDebt.totalRevenue === 1000 && dashboardWithDebt.totalDebt === 600, 'dashboard should include scoped debt with finance.debt.view');
  const csv = await service.exportCsv({ search: run }, branchUser);
  const csvBody = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const csvLines = csvBody.split('\r\n');
  assert(csv.charCodeAt(0) === 0xfeff, 'exportCsv should include UTF-8 BOM');
  assert(csvLines[0] === 'code,fullName,phone,email,type,source,market,owner,branch,department,tags', 'exportCsv should use stable headers');
  assert(csvLines.some((line) => line.includes(`"${run}-A"`)), 'exportCsv should include scoped customer rows');

  const uploaded = await service.addFile(customer.id, { originalname: 'contract.txt', mimetype: 'text/plain', size: 5, buffer: Buffer.from('hello') }, branchUser.id, branchUser);
  files.failRemove = true;
  await rejects(() => service.deleteFile(customer.id, uploaded.id, branchUser), 'deleteFile should surface storage remove failure');
  assert(await prisma.customerFile.count({ where: { id: uploaded.id, customerId: customer.id } }) === 1, 'deleteFile should restore DB metadata when object removal fails');
  files.failRemove = false;
  await service.deleteFile(customer.id, uploaded.id, branchUser);
  assert(await prisma.customerFile.count({ where: { id: uploaded.id } }) === 0, 'deleteFile should remove DB metadata after object removal succeeds');

  const source = await service.create({ code: run + '-SRC', fullName: 'Merge Source', phone: '092' + String(Date.now()).slice(-7) }, branchUser);
  await prisma.customerComment.create({ data: { customerId: source.id, content: 'source comment' } });
  await prisma.order.create({ data: { type: 'FIT_TOUR', systemCode: run + '-ORD-SRC', name: 'Source Order', branch: 'BR-A', department: 'DEP-A', customerId: source.id } });
  const merged = await service.merge(customer.id, { sourceId: source.id, actor: 'merge-actor', note: 'merge note' }, branchUser);
  assert(merged.id === customer.id, 'merge should return target detail');
  assert((await prisma.customer.findUnique({ where: { id: source.id } })).status === 'MERGED', 'merge should mark source as merged');
  assert(await prisma.order.count({ where: { customerId: customer.id, systemCode: run + '-ORD-SRC' } }) === 1, 'merge should move source orders');
  await rejects(() => service.merge(customer.id, { sourceId: outOfScope.id }, branchUser), 'merge should reject source outside scope');

  await rejectsMessage(() => service.update(source.id, { fullName: 'Merged Source Edited' }, branchUser), 'đã được gộp', 'update should reject writes on merged customers');
  await rejectsMessage(() => service.transferOwner(source.id, { owner: 'merged-owner' }, branchUser), 'đã được gộp', 'transferOwner should reject writes on merged customers');
  await rejectsMessage(() => service.addComment(source.id, { content: 'merged comment' }, branchUser), 'đã được gộp', 'addComment should reject writes on merged customers');
  await rejectsMessage(() => service.addFile(source.id, { originalname: 'merged.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('test') }, branchUser.id, branchUser), 'đã được gộp', 'addFile should reject writes on merged customers');
  await rejectsMessage(() => service.merge(customer.id, { sourceId: source.id }, branchUser), 'đã được gộp', 'merge should reject already merged source customers');
  assert((await prisma.customer.findUnique({ where: { id: source.id } })).status === 'MERGED', 'rejected merged-customer writes must preserve MERGED status');

  await service.transferOwner(customer.id, { owner: 'new-owner', reason: 'handover' }, branchUser);
  assert((await prisma.customer.findUnique({ where: { id: customer.id } })).owner === 'new-owner', 'transferOwner should update owner');
  assert(await prisma.customerTimeline.count({ where: { customerId: customer.id, eventType: 'TRANSFER_OWNER', actor: 'Branch User' } }) === 1, 'transferOwner should write timeline actor');

  const removable = await service.create({ code: run + '-DEL', fullName: 'Delete Me', phone: '093' + String(Date.now()).slice(-7) }, branchUser);
  await service.remove(removable.id, branchUser);
  await rejects(() => service.remove(customer.id, branchUser), 'remove should reject customer with dependent data');

  console.log('CUSTOMERS_SERVICE_TEST_OK');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
