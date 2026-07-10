#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const service = fs.readFileSync(path.join(process.cwd(), 'apps/api/src/modules/tour-guides/tour-guides.service.ts'), 'utf8');

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) throw new Error(`missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`missing block end after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const failures = [];
if (!service.includes('private async lockGuideForWrite')) failures.push('missing GuideProfile row-lock helper for writes');
if (!service.includes('FROM "GuideProfile"') || !service.includes('FOR UPDATE')) failures.push('GuideProfile row-lock helper must use SELECT ... FOR UPDATE');
if (!service.includes('this.guideScopeWhere({ id, deletedAt: null }, user)')) failures.push('GuideProfile lock helper must re-read through data scope and deletedAt guard');

const addFileBlock = sliceBetween(service, '  async addFile(', '  async deleteFile(');
const addFileTxIndex = addFileBlock.indexOf('this.prisma.$transaction(async (tx) => {');
if (addFileTxIndex === -1) failures.push('addFile: guide file metadata create must run in one transaction');
const addFileTxBlock = addFileTxIndex === -1 ? '' : addFileBlock.slice(addFileTxIndex);
if (!addFileTxBlock.includes('await this.lockGuideForWrite(tx, guideId, user)')) failures.push('addFile: must lock/re-read guide before metadata create');
const addFileLockIndex = addFileTxBlock.indexOf('lockGuideForWrite(tx, guideId, user)');
const addFileCreateIndex = addFileTxBlock.indexOf('tx.guideFile.create');
if (addFileCreateIndex === -1 || addFileLockIndex === -1 || addFileCreateIndex < addFileLockIndex) failures.push('addFile: guideFile.create must happen after guide lock');
if (!addFileBlock.includes('await this.filesService.removeQuietly(upload.objectKey)')) failures.push('addFile: uploaded object must be cleaned up if metadata create/lock fails');

const deleteFileBlock = sliceBetween(service, '  async deleteFile(', '  async create(');
const deleteFileTxIndex = deleteFileBlock.indexOf('this.prisma.$transaction(async (tx) => {');
if (deleteFileTxIndex === -1) failures.push('deleteFile: guide file metadata delete must run in one transaction');
const deleteFileBeforeTx = deleteFileTxIndex === -1 ? deleteFileBlock : deleteFileBlock.slice(0, deleteFileTxIndex);
if (deleteFileBeforeTx.includes('this.prisma.guideFile.findFirst')) failures.push('deleteFile: must not read file ownership from a pre-transaction snapshot');
if (deleteFileBeforeTx.includes('this.prisma.guideFile.delete')) failures.push('deleteFile: must not delete file metadata outside the transaction');
const deleteFileTxBlock = deleteFileTxIndex === -1 ? '' : deleteFileBlock.slice(deleteFileTxIndex);
if (!deleteFileTxBlock.includes('await this.lockGuideForWrite(tx, guideId, user)')) failures.push('deleteFile: must lock/re-read guide before metadata delete');
const deleteFileLockIndex = deleteFileTxBlock.indexOf('lockGuideForWrite(tx, guideId, user)');
const deleteFileFindIndex = deleteFileTxBlock.indexOf('tx.guideFile.findFirst');
const deleteFileDeleteIndex = deleteFileTxBlock.indexOf('tx.guideFile.delete');
if (deleteFileFindIndex === -1 || deleteFileLockIndex === -1 || deleteFileFindIndex < deleteFileLockIndex) failures.push('deleteFile: file ownership read must happen after guide lock');
if (deleteFileDeleteIndex === -1 || deleteFileFindIndex === -1 || deleteFileDeleteIndex < deleteFileFindIndex) failures.push('deleteFile: file metadata delete must happen after locked ownership check');

const updateBlock = sliceBetween(service, '  async update(', '  async remove(');
const updateTxIndex = updateBlock.indexOf('this.prisma.$transaction(async (tx) => {');
if (updateTxIndex === -1) failures.push('update: guide update must run in one transaction');
const updateBeforeTx = updateTxIndex === -1 ? updateBlock : updateBlock.slice(0, updateTxIndex);
if (updateBeforeTx.includes('this.detail(id, user)')) failures.push('update: must not use a pre-transaction guide writability/scope snapshot');
const updateTxBlock = updateTxIndex === -1 ? '' : updateBlock.slice(updateTxIndex);
if (!updateTxBlock.includes('await this.lockGuideForWrite(tx, id, user)')) failures.push('update: must lock/re-read guide inside the transaction before writes');
const updateLockIndex = updateTxBlock.indexOf('lockGuideForWrite(tx, id, user)');
for (const mutation of ['this.assertUniqueGuide(tx', 'this.validateScheduleLinks(tx', 'tx.guideProfile.update', 'this.replaceChildren(tx']) {
  const mutationIndex = updateTxBlock.indexOf(mutation);
  if (mutationIndex !== -1 && (updateLockIndex === -1 || mutationIndex < updateLockIndex)) failures.push(`update: ${mutation} must happen after guide lock`);
}

const removeBlock = sliceBetween(service, '  async remove(', '  private guideScopeWhere(');
const removeTxIndex = removeBlock.indexOf('this.prisma.$transaction(async (tx) => {');
if (removeTxIndex === -1) failures.push('remove: guide soft delete must run in one transaction');
const removeBeforeTx = removeTxIndex === -1 ? removeBlock : removeBlock.slice(0, removeTxIndex);
if (removeBeforeTx.includes('this.detail(id, user)')) failures.push('remove: must not use a pre-transaction guide writability/scope snapshot');
const removeTxBlock = removeTxIndex === -1 ? '' : removeBlock.slice(removeTxIndex);
if (!removeTxBlock.includes('await this.lockGuideForWrite(tx, id, user)')) failures.push('remove: must lock/re-read guide before soft delete');
const removeLockIndex = removeTxBlock.indexOf('lockGuideForWrite(tx, id, user)');
const removeUpdateIndex = removeTxBlock.indexOf('tx.guideProfile.update');
if (removeUpdateIndex === -1 || removeLockIndex === -1 || removeUpdateIndex < removeLockIndex) failures.push('remove: guideProfile.update must happen after guide lock');

if (failures.length) {
  console.error('TEST_TOUR_GUIDES_WRITE_LOCK_CONTRACT_FAILED');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('TEST_TOUR_GUIDES_WRITE_LOCK_CONTRACT_OK');
