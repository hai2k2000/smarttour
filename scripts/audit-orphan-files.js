#!/usr/bin/env node
const { Client } = require('minio');
const { PrismaClient } = require('@prisma/client');

const args = new Set(process.argv.slice(2));
const deleteOrphans = args.has('--delete');
const dryRun = !deleteOrphans;
const bucket = process.env.MINIO_BUCKET || 'smarttour';
const endpoint = new URL(process.env.MINIO_ENDPOINT || 'http://localhost:9000');
const client = new Client({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
  useSSL: endpoint.protocol === 'https:',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});
const prisma = new PrismaClient();

function objectKeyFromUrl(fileUrl) {
  if (!fileUrl) return null;
  try {
    const key = new URL(fileUrl, 'http://smarttour.local').searchParams.get('key');
    return key || null;
  } catch {
    return null;
  }
}

function addKey(keys, fileUrl) {
  const key = objectKeyFromUrl(fileUrl);
  if (key) keys.add(key);
}

async function collectReferencedKeys() {
  const keys = new Set();
  const [customerFiles, supplierFiles, guideFiles, fitFiles, tourFiles, invoiceFiles, receipts, payments] = await Promise.all([
    prisma.customerFile.findMany({ select: { fileUrl: true } }),
    prisma.supplierFile.findMany({ select: { fileUrl: true } }),
    prisma.guideFile.findMany({ select: { fileUrl: true } }),
    prisma.fitAttachment.findMany({ select: { fileUrl: true } }),
    prisma.tourAttachment.findMany({ select: { fileUrl: true } }),
    prisma.financeInvoiceFile.findMany({ select: { fileUrl: true } }),
    prisma.financeReceipt.findMany({ select: { attachmentUrl: true } }),
    prisma.financePayment.findMany({ select: { attachmentUrl: true } }),
  ]);
  for (const row of customerFiles) addKey(keys, row.fileUrl);
  for (const row of supplierFiles) addKey(keys, row.fileUrl);
  for (const row of guideFiles) addKey(keys, row.fileUrl);
  for (const row of fitFiles) addKey(keys, row.fileUrl);
  for (const row of tourFiles) addKey(keys, row.fileUrl);
  for (const row of invoiceFiles) addKey(keys, row.fileUrl);
  for (const row of receipts) addKey(keys, row.attachmentUrl);
  for (const row of payments) addKey(keys, row.attachmentUrl);
  return keys;
}

function inferObjectScope(objectKey) {
  const parts = objectKey.split('/').filter(Boolean);
  const root = parts[0] || '';
  const entity = root === 'finance' ? parts[2] : parts[1];
  if (!root) return { root: '', entity: '', reason: 'missing root segment' };
  if (!entity) return { root, entity: '', reason: 'missing entity segment' };
  if (!['customers', 'suppliers', 'tour-guides', 'fit-tours', 'finance'].includes(root)) {
    return { root, entity, reason: 'unknown root' };
  }
  return { root, entity, reason: 'no database metadata references this object key' };
}

function listObjectsV2(bucketName) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = client.listObjectsV2(bucketName, '', true);
    stream.on('data', (item) => rows.push(item));
    stream.on('error', reject);
    stream.on('end', () => resolve(rows));
  });
}

async function main() {
  console.log(`${dryRun ? 'DRY RUN' : 'DELETE'} orphan file audit for bucket ${bucket}`);
  const referenced = await collectReferencedKeys();
  const objects = await listObjectsV2(bucket);
  const orphans = [];
  for (const object of objects) {
    const objectKey = object.name;
    if (!objectKey || referenced.has(objectKey)) continue;
    const scope = inferObjectScope(objectKey);
    orphans.push({ objectKey, root: scope.root, entity: scope.entity, reason: scope.reason, size: object.size || 0, lastModified: object.lastModified || null });
  }

  for (const orphan of orphans) {
    console.log(JSON.stringify({ dryRun, ...orphan }));
    if (deleteOrphans) await client.removeObject(bucket, orphan.objectKey);
  }
  console.log(JSON.stringify({ dryRun, bucket, scannedObjects: objects.length, referencedObjects: referenced.size, orphanObjects: orphans.length, deletedObjects: deleteOrphans ? orphans.length : 0 }));
}

main()
  .catch((error) => {
    console.error('FAIL_AUDIT_ORPHAN_FILES');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
