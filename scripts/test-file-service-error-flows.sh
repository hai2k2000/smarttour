#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"
docker compose build api >/dev/null

docker compose run --rm --entrypoint sh api -lc "cd /app && node" <<'NODE'
const assert = require('node:assert/strict');
const { CustomersService } = require('./apps/api/dist/modules/customers/customers.service');
const { FinanceService } = require('./apps/api/dist/modules/finance/finance.service');
const { SuppliersService } = require('./apps/api/dist/modules/suppliers/suppliers.service');
const { TourGuidesService } = require('./apps/api/dist/modules/tour-guides/tour-guides.service');

const upload = {
  bucket: 'smarttour',
  objectKey: 'tests/2027/01/uploaded.txt',
  fileName: 'uploaded.txt',
  mimeType: 'text/plain',
  size: 12,
  url: '/api/files/download?key=tests%2F2027%2F01%2Fuploaded.txt',
};
const oldUrl = '/api/files/download?key=tests%2F2027%2F01%2Fold.txt';
const oldKey = 'tests/2027/01/old.txt';
const testFile = { originalname: 'uploaded.txt', mimetype: 'text/plain', size: 12, buffer: Buffer.from('hello world!') };

function filesService(options = {}) {
  const calls = { upload: 0, removeIfPresent: [], removeQuietly: [] };
  return {
    calls,
    async upload() {
      calls.upload += 1;
      return upload;
    },
    async removeIfPresent(objectKey) {
      calls.removeIfPresent.push(objectKey);
      if (options.failRemove) throw new Error('remove failed');
      return { deleted: Boolean(objectKey), objectKey };
    },
    async removeQuietly(objectKey) {
      calls.removeQuietly.push(objectKey);
    },
    objectKeyFromUrl(fileUrl) {
      return fileUrl ? new URL(fileUrl, 'http://smarttour.local').searchParams.get('key') : null;
    },
  };
}

async function assertCustomerUploadCleanup() {
  const files = filesService();
  const service = new CustomersService({
    customer: { findFirst: async () => ({ id: 'cus-1' }) },
    customerFile: { create: async () => { throw new Error('db create failed'); } },
  }, files);

  await assert.rejects(() => service.addFile('cus-1', testFile, 'actor-1'), /db create failed/);
  assert.deepEqual(files.calls.removeQuietly, [upload.objectKey]);
}

async function assertCustomerDeleteRollback() {
  const files = filesService({ failRemove: true });
  const file = { id: 'file-1', customerId: 'cus-1', fileName: 'old.txt', fileUrl: oldUrl, fileType: 'text/plain', uploadedBy: 'actor-1', createdAt: new Date('2027-01-01T00:00:00Z') };
  const restored = [];
  const service = new CustomersService({
    customer: { findFirst: async () => ({ id: 'cus-1' }) },
    customerFile: {
      findFirst: async () => file,
      delete: async () => file,
      create: async ({ data }) => { restored.push(data); return data; },
    },
  }, files);

  await assert.rejects(() => service.deleteFile('cus-1', 'file-1'), /remove failed/);
  assert.deepEqual(files.calls.removeIfPresent, [oldKey]);
  assert.equal(restored[0].id, file.id);
  assert.equal(restored[0].fileUrl, file.fileUrl);
}

async function assertFinanceReceiptUploadCleanup() {
  const files = filesService();
  const service = new FinanceService({
    financeReceipt: {
      findFirst: async () => ({ id: 'receipt-1', attachmentName: 'old.txt', attachmentUrl: oldUrl }),
      update: async () => { throw new Error('receipt update failed'); },
    },
  }, files);

  await assert.rejects(() => service.uploadReceiptFileCore('receipt-1', testFile, 'actor-1'), /receipt update failed/);
  assert.deepEqual(files.calls.removeQuietly, [upload.objectKey]);
}

async function assertFinanceAttachmentDeleteRollback(kind) {
  const files = filesService({ failRemove: true });
  const updates = [];
  const current = { id: `${kind}-1`, attachmentName: 'old.txt', attachmentUrl: oldUrl };
  const model = {
    findFirst: async () => current,
    update: async ({ data }) => {
      updates.push(data);
      return { ...current, ...data };
    },
  };
  const prisma = kind === 'receipt' ? { financeReceipt: model } : { financePayment: model };
  const service = new FinanceService(prisma, files);

  if (kind === 'receipt') await assert.rejects(() => service.deleteReceiptFileCore('receipt-1'), /remove failed/);
  else await assert.rejects(() => service.deletePaymentFileCore('payment-1'), /remove failed/);

  assert.deepEqual(files.calls.removeIfPresent, [oldKey]);
  assert.deepEqual(updates, [
    { attachmentName: null, attachmentUrl: null },
    { attachmentName: 'old.txt', attachmentUrl: oldUrl },
  ]);
}

async function assertFinanceInvoiceUploadCleanup() {
  const files = filesService();
  const service = new FinanceService({
    financeInvoice: { findFirst: async () => ({ id: 'invoice-1', files: [] }) },
    financeInvoiceFile: { create: async () => { throw new Error('invoice file create failed'); } },
  }, files);

  await assert.rejects(() => service.uploadInvoiceFileCore('invoice-1', testFile, 'actor-1'), /invoice file create failed/);
  assert.deepEqual(files.calls.removeQuietly, [upload.objectKey]);
}

async function assertFinanceInvoiceDeleteRollback() {
  const files = filesService({ failRemove: true });
  const invoiceFile = { id: 'invoice-file-1', invoiceId: 'invoice-1', fileName: 'old.txt', fileUrl: oldUrl, fileType: 'text/plain', uploadedBy: 'actor-1', createdAt: new Date('2027-01-01T00:00:00Z') };
  const restored = [];
  const service = new FinanceService({
    financeInvoice: { findFirst: async () => ({ id: 'invoice-1', files: [invoiceFile] }) },
    financeInvoiceFile: {
      findFirst: async () => invoiceFile,
      delete: async () => invoiceFile,
      create: async ({ data }) => { restored.push(data); return data; },
    },
  }, files);

  await assert.rejects(() => service.deleteInvoiceFileCore('invoice-1', 'invoice-file-1'), /remove failed/);
  assert.deepEqual(files.calls.removeIfPresent, [oldKey]);
  assert.equal(restored[0].id, invoiceFile.id);
  assert.equal(restored[0].fileUrl, invoiceFile.fileUrl);
}

async function assertSupplierDeleteRollback() {
  const files = filesService({ failRemove: true });
  const supplierFile = { id: 'supplier-file-1', supplierId: 'supplier-1', fileName: 'old.txt', fileUrl: oldUrl, fileType: 'text/plain', uploadedBy: 'actor-1', createdAt: new Date('2027-01-01T00:00:00Z') };
  const restored = [];
  const service = new SuppliersService({
    supplier: { findUnique: async () => ({ id: 'supplier-1', deletedAt: null }) },
    supplierFile: {
      findFirst: async () => supplierFile,
      delete: async () => supplierFile,
      create: async ({ data }) => { restored.push(data); return data; },
    },
  }, files);

  await assert.rejects(() => service.deleteSupplierFile('supplier-1', 'supplier-file-1'), /remove failed/);
  assert.deepEqual(files.calls.removeIfPresent, [oldKey]);
  assert.equal(restored[0].id, supplierFile.id);
  assert.equal(restored[0].fileUrl, supplierFile.fileUrl);
}

async function assertTourGuideDeleteRollback() {
  const files = filesService({ failRemove: true });
  const guideFile = { id: 'guide-file-1', guideId: 'guide-1', fileName: 'old.txt', fileUrl: oldUrl, fileType: 'text/plain', uploadedBy: 'actor-1', createdAt: new Date('2027-01-01T00:00:00Z') };
  const restored = [];
  const service = new TourGuidesService({
    guideProfile: { findFirst: async () => ({ id: 'guide-1', deletedAt: null }) },
    guideFile: {
      findFirst: async () => guideFile,
      delete: async () => guideFile,
      create: async ({ data }) => { restored.push(data); return data; },
    },
  }, files);

  await assert.rejects(() => service.deleteFile('guide-1', 'guide-file-1'), /remove failed/);
  assert.deepEqual(files.calls.removeIfPresent, [oldKey]);
  assert.equal(restored[0].id, guideFile.id);
  assert.equal(restored[0].fileUrl, guideFile.fileUrl);
}

(async () => {
  await assertCustomerUploadCleanup();
  await assertCustomerDeleteRollback();
  await assertFinanceReceiptUploadCleanup();
  await assertFinanceAttachmentDeleteRollback('receipt');
  await assertFinanceAttachmentDeleteRollback('payment');
  await assertFinanceInvoiceUploadCleanup();
  await assertFinanceInvoiceDeleteRollback();
  await assertSupplierDeleteRollback();
  await assertTourGuideDeleteRollback();
  console.log('TEST_FILE_SERVICE_ERROR_FLOWS_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
