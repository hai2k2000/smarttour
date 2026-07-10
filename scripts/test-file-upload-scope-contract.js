#!/usr/bin/env node
const { BadRequestException, ForbiddenException, NotFoundException } = require('@nestjs/common');
const fs = require('fs');
const { FilesService } = require('../apps/api/dist/modules/files/files.service');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function userWith(permissions, scope = {}) {
  return {
    id: 'user-file-upload-scope-contract',
    username: 'file-upload-scope-contract',
    branch: scope.branch,
    department: scope.department,
    roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
  };
}

function uploadFile(originalname = 'scope-contract.txt', mimetype = 'text/plain', buffer = Buffer.from('smarttour file upload scope contract')) {
  return { originalname, mimetype, size: buffer.length, buffer };
}

function fakePrisma() {
  const found = async ({ where }) => (where.id === 'existing-id' || where.AND?.[0]?.id === 'existing-id' ? { id: 'existing-id' } : null);
  const supplierFound = async ({ where }) => {
    const encoded = JSON.stringify(where);
    assert(!encoded.includes('"branch"') && !encoded.includes('"department"'), 'supplier file lookup must not inject branch/department fields because Supplier has no data-scope columns');
    return found({ where });
  };
  return {
    customer: { findFirst: found },
    supplier: { findFirst: supplierFound },
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

async function expectUploadRejectedBeforeStorage(scope, user, label, file = uploadFile()) {
  const { service, putObjectCalls } = serviceWithFakeClient();
  try {
    await service.uploadAuthorized(file, scope, user);
    throw new Error(`${label} should reject`);
  } catch (error) {
    assert(error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException, `${label} must reject with a controlled HTTP error`);
    assert(putObjectCalls() === 0, `${label} must reject before MinIO putObject`);
  }
}

async function main() {
  const serviceSource = fs.readFileSync('apps/api/src/modules/files/files.service.ts', 'utf8');
  const supplierUploadStart = serviceSource.indexOf("if (root === 'suppliers')");
  const supplierUploadEnd = serviceSource.indexOf("if (root === 'tour-guides')", supplierUploadStart);
  const supplierUploadBlock = supplierUploadStart === -1 ? '' : serviceSource.slice(supplierUploadStart, supplierUploadEnd === -1 ? serviceSource.length : supplierUploadEnd);
  assert(!supplierUploadBlock.includes('branchDepartmentScopeWhere<Prisma.SupplierWhereInput>'), 'supplier upload parent lookup must not apply branch/department data scope to Supplier');
  const supplierAccessStart = serviceSource.indexOf('private async assertSupplierFile');
  const supplierAccessEnd = serviceSource.indexOf('private async assertGuideFile', supplierAccessStart);
  const supplierAccessBlock = supplierAccessStart === -1 ? '' : serviceSource.slice(supplierAccessStart, supplierAccessEnd === -1 ? serviceSource.length : supplierAccessEnd);
  assert(!supplierAccessBlock.includes('branchDepartmentScopeWhere<Prisma.SupplierWhereInput>'), 'supplier file access must not apply branch/department data scope to Supplier');

  await expectUploadRejectedBeforeStorage('evil/root', userWith(['file.manage', '*']), 'unknown upload scope');
  await expectUploadRejectedBeforeStorage('suppliers', userWith(['file.manage', '*']), 'scope missing entity id');
  await expectUploadRejectedBeforeStorage('suppliers/missing-id', userWith(['file.manage', 'supplier.manage']), 'missing parent entity');
  await expectUploadRejectedBeforeStorage('suppliers/existing-id', userWith(['file.manage', 'supplier.view']), 'missing manage permission');
  const unassignedScopedSupplierUpload = serviceWithFakeClient();
  const unassignedScopedUpload = await unassignedScopedSupplierUpload.service.uploadAuthorized(uploadFile(), 'suppliers/existing-id', userWith(['file.manage', 'supplier.manage', 'data.scope.branch']));
  assert(unassignedScopedUpload.objectKey.startsWith('suppliers/existing-id/'), 'branch-scoped supplier upload without a branch value must not fail on nonexistent Supplier branch columns');
  assert(unassignedScopedSupplierUpload.putObjectCalls() === 1, 'branch-scoped supplier upload without branch should write exactly one MinIO object');
  const scopedSupplierUpload = serviceWithFakeClient();
  const scopedUpload = await scopedSupplierUpload.service.uploadAuthorized(uploadFile(), 'suppliers/existing-id', userWith(['file.manage', 'supplier.manage', 'data.scope.branch'], { branch: 'FIN-BR' }));
  assert(scopedUpload.objectKey.startsWith('suppliers/existing-id/'), 'branch-scoped supplier upload with a branch value must not fail on nonexistent Supplier branch columns');
  assert(scopedSupplierUpload.putObjectCalls() === 1, 'branch-scoped supplier upload should write exactly one MinIO object');
  await expectUploadRejectedBeforeStorage(
    'suppliers/existing-id',
    userWith(['file.manage', 'supplier.manage']),
    'png upload with html content',
    uploadFile('spoofed.png', 'image/png', Buffer.from('<script>alert("xss")</script>')),
  );

  const { service, putObjectCalls } = serviceWithFakeClient();
  const uploaded = await service.uploadAuthorized(uploadFile(), 'suppliers/existing-id', userWith(['file.manage', 'supplier.manage', 'data.scope.all']));
  assert(uploaded.objectKey.startsWith('suppliers/existing-id/'), 'valid supplier upload must keep the authorized entity scope');
  assert(putObjectCalls() === 1, 'valid authorized upload should write exactly one MinIO object');

  console.log('TEST_FILE_UPLOAD_SCOPE_CONTRACT_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
