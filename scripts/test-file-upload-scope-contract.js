#!/usr/bin/env node
const { BadRequestException, ForbiddenException, NotFoundException } = require('@nestjs/common');
const { FilesService } = require('../apps/api/dist/modules/files/files.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function userWith(permissions) {
  return {
    id: 'user-file-upload-scope-contract',
    username: 'file-upload-scope-contract',
    roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

function uploadFile() {
  const buffer = Buffer.from('smarttour file upload scope contract');
  return { originalname: 'scope-contract.txt', mimetype: 'text/plain', size: buffer.length, buffer };
}

function fakePrisma() {
  const found = async ({ where }) => (where.id === 'existing-id' ? { id: 'existing-id' } : null);
  return {
    customer: { findFirst: found },
    supplier: { findFirst: found },
    guideProfile: { findFirst: found },
    fitTour: { findFirst: async ({ where }) => (where.AND?.[0]?.id === 'existing-id' || where.id === 'existing-id' ? { id: 'existing-id', tourId: null } : null) },
    financeReceipt: { findFirst: found },
    financePayment: { findFirst: found },
    financeInvoice: { findFirst: found },
  };
}

function serviceWithFakeClient() {
  const service = new FilesService(fakePrisma());
  let putObjectCalls = 0;
  service.client = {
    bucketExists: async () => true,
    makeBucket: async () => {},
    putObject: async () => { putObjectCalls += 1; },
    statObject: async () => { throw new Error('not used'); },
    getObject: async () => { throw new Error('not used'); },
    removeObject: async () => { throw new Error('not used'); },
  };
  return { service, putObjectCalls: () => putObjectCalls };
}

async function expectUploadRejectedBeforeStorage(scope, user, label) {
  const { service, putObjectCalls } = serviceWithFakeClient();
  try {
    await service.uploadAuthorized(uploadFile(), scope, user);
    throw new Error(`${label} should reject`);
  } catch (error) {
    assert(error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException, `${label} must reject with a controlled HTTP error`);
    assert(putObjectCalls() === 0, `${label} must reject before MinIO putObject`);
  }
}

async function main() {
  await expectUploadRejectedBeforeStorage('evil/root', userWith(['file.manage', '*']), 'unknown upload scope');
  await expectUploadRejectedBeforeStorage('suppliers', userWith(['file.manage', '*']), 'scope missing entity id');
  await expectUploadRejectedBeforeStorage('suppliers/missing-id', userWith(['file.manage', 'supplier.manage']), 'missing parent entity');
  await expectUploadRejectedBeforeStorage('suppliers/existing-id', userWith(['file.manage', 'supplier.view']), 'missing manage permission');

  const { service, putObjectCalls } = serviceWithFakeClient();
  const uploaded = await service.uploadAuthorized(uploadFile(), 'suppliers/existing-id', userWith(['file.manage', 'supplier.manage']));
  assert(uploaded.objectKey.startsWith('suppliers/existing-id/'), 'valid supplier upload must keep the authorized entity scope');
  assert(putObjectCalls() === 1, 'valid authorized upload should write exactly one MinIO object');

  console.log('TEST_FILE_UPLOAD_SCOPE_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
