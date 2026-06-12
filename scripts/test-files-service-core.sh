#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/smarttour}"

cd "$REPO_DIR"
docker compose build api >/dev/null

docker compose run --rm --entrypoint node api <<'NODE'
const assert = require('node:assert/strict');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { FilesService } = require('./apps/api/dist/modules/files/files.service');

function makeClient(options = {}) {
  const calls = {
    bucketExists: [],
    makeBucket: [],
    putObject: [],
    statObject: [],
    getObject: [],
    removeObject: [],
  };
  let bucketReady = Boolean(options.bucketReady);
  return {
    calls,
    async bucketExists(bucket) {
      calls.bucketExists.push(bucket);
      return bucketReady;
    },
    async makeBucket(bucket) {
      calls.makeBucket.push(bucket);
      bucketReady = true;
    },
    async putObject(bucket, objectKey, buffer, size, metadata) {
      calls.putObject.push({ bucket, objectKey, buffer, size, metadata });
      if (options.failPut) throw new Error('put failed');
    },
    async statObject(bucket, objectKey) {
      calls.statObject.push({ bucket, objectKey });
      if (options.missing) throw { code: 'NoSuchKey' };
      return {
        size: 12,
        metaData: {
          'content-type': 'text/plain',
          'x-amz-meta-original-name': encodeURIComponent('source.txt'),
        },
      };
    },
    async getObject(bucket, objectKey) {
      calls.getObject.push({ bucket, objectKey });
      return Buffer.from('file content');
    },
    async removeObject(bucket, objectKey) {
      calls.removeObject.push({ bucket, objectKey });
      if (options.failRemove) throw new Error('remove failed');
    },
  };
}

function createService(client, maxBytes = '1024') {
  process.env.MINIO_BUCKET = 'smarttour-files-test';
  process.env.MINIO_ENDPOINT = 'http://minio:9000';
  process.env.MINIO_ACCESS_KEY = 'test-access';
  process.env.MINIO_SECRET_KEY = 'test-secret';
  process.env.FILE_UPLOAD_MAX_BYTES = maxBytes;
  const service = new FilesService();
  service.client = client;
  return service;
}

async function main() {
  const client = makeClient();
  const service = createService(client);
  const file = {
    originalname: 'vé máy bay 01.txt',
    mimetype: 'text/plain',
    size: 12,
    buffer: Buffer.from('file content'),
  };

  const uploaded = await service.upload(file, 'finance receipts/June 2026', 'actor-1');
  assert.equal(uploaded.bucket, 'smarttour-files-test');
  assert.equal(uploaded.fileName, file.originalname);
  assert.equal(uploaded.mimeType, file.mimetype);
  assert.equal(uploaded.size, file.size);
  assert.match(uploaded.objectKey, /^finance-receipts\/June-2026\/\d{4}\/\d{2}\/[0-9a-f-]+-ve-may-bay-01\.txt$/);
  assert.equal(uploaded.url, `/api/files/download?key=${encodeURIComponent(uploaded.objectKey)}`);
  assert.equal(client.calls.makeBucket.length, 1);
  assert.equal(client.calls.putObject.length, 1);
  assert.equal(client.calls.putObject[0].metadata['Content-Type'], 'text/plain');
  assert.equal(client.calls.putObject[0].metadata['X-Amz-Meta-Original-Name'], encodeURIComponent(file.originalname));
  assert.equal(client.calls.putObject[0].metadata['X-Amz-Meta-Uploaded-By'], 'actor-1');
  assert.equal(client.calls.putObject[0].metadata['X-Amz-Meta-Original-Mime-Type'], 'text/plain');
  assert.equal(client.calls.putObject[0].metadata['X-Amz-Meta-File-Size'], '12');

  const normalizedFile = {
    originalname: ' C:\\fakepath\\báo cáo.txt ',
    mimetype: ' Text/Plain; charset=UTF-8 ',
    size: 12,
    buffer: Buffer.from('file content'),
  };
  const normalizedUpload = await service.upload(normalizedFile, 'supplier files');
  assert.equal(normalizedUpload.fileName, 'báo cáo.txt');
  assert.equal(normalizedUpload.mimeType, 'text/plain');
  assert.match(normalizedUpload.objectKey, /^supplier-files\/\d{4}\/\d{2}\/[0-9a-f-]+-bao-cao\.txt$/);

  const extensionlessUpload = await service.upload({ ...file, originalname: '.env', mimetype: 'application/octet-stream' }, 'supplier files');
  assert.match(extensionlessUpload.objectKey, /^supplier-files\/\d{4}\/\d{2}\/[0-9a-f-]+-env$/);
  assert.deepEqual(await service.remove(extensionlessUpload.objectKey), { deleted: true, objectKey: extensionlessUpload.objectKey });

  await assert.rejects(
    () => service.upload({ ...file, originalname: 'unsafe.svg', mimetype: 'image/svg+xml' }, 'files'),
    BadRequestException,
    'svg upload should be rejected',
  );
  await assert.rejects(
    () => createService(makeClient(), '4').upload(file, 'files'),
    BadRequestException,
    'oversized upload should be rejected',
  );
  await assert.rejects(
    () => service.upload({ ...file, buffer: undefined }, 'files'),
    BadRequestException,
    'missing buffer should be rejected',
  );
  await assert.rejects(
    () => service.upload({ ...file, size: 0, buffer: Buffer.alloc(0) }, 'files'),
    /File tải lên không được để trống/,
    'empty upload should be rejected',
  );
  await assert.rejects(
    () => service.upload({ ...file, size: 11 }, 'files'),
    /Kích thước file không khớp/,
    'declared size must match buffer length',
  );
  await assert.rejects(
    () => service.upload({ ...file, mimetype: 'not a mime' }, 'files'),
    /MIME type của file không hợp lệ/,
    'invalid mime metadata should be rejected',
  );
  await assert.rejects(
    () => service.upload({ ...file, originalname: `${'x'.repeat(256)}.txt` }, 'files'),
    /Tên file không được vượt quá 255 ký tự/,
    'overlong file names should be rejected',
  );

  const download = await service.download('finance/2026/06/source.txt');
  assert.equal(download.size, 12);
  assert.equal(download.mimeType, 'text/plain');
  assert.equal(download.fileName, 'source.txt');
  assert.equal(client.calls.getObject[0].objectKey, 'finance/2026/06/source.txt');

  await assert.rejects(
    () => createService(makeClient({ missing: true })).download('finance/2026/06/missing.txt'),
    NotFoundException,
    'missing object should map to NotFoundException',
  );
  await assert.rejects(
    () => service.download('../secret.txt'),
    BadRequestException,
    'unsafe object key should be rejected',
  );

  assert.equal(service.objectKeyFromUrl('/api/files/download?key=finance%2F2026%2F06%2Fsource.txt'), 'finance/2026/06/source.txt');
  assert.equal(service.objectKeyFromUrl('not a url'), null);

  assert.deepEqual(await service.removeIfPresent(null), { deleted: false, objectKey: null });
  assert.deepEqual(await service.remove('finance/2026/06/source.txt'), { deleted: true, objectKey: 'finance/2026/06/source.txt' });
  assert(client.calls.removeObject.some((call) => call.objectKey === 'finance/2026/06/source.txt'));

  console.log('TEST_FILES_SERVICE_CORE_OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
