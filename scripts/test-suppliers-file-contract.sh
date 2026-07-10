#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

files_service = Path('apps/api/src/modules/files/files.service.ts').read_text()
suppliers_service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
frontend_upload = Path('apps/web/app/suppliers/uploadSupplierFiles.ts').read_text()
smoke = Path('scripts/smoke-suppliers.sh').read_text()

assert 'const allowedExtensions = new Set' in files_service, 'supplier uploads must use an explicit extension allowlist'
assert 'const allowedMimeTypes = new Set' in files_service, 'supplier uploads must use an explicit MIME type allowlist'
for allowed in ["'.pdf'", "'.docx'", "'.xlsx'", "'.jpg'", "'.png'", "'.zip'", "'text/plain'", "'application/pdf'", "'image/jpeg'"]:
    assert allowed in files_service, f'{allowed} must remain allowed for supplier uploads'
for unsafe in ["'.svg'", "'.js'", "'.sh'", "'image/svg+xml'", "'text/html'", "'application/javascript'"]:
    assert unsafe not in files_service, f'{unsafe} must not be present in the supplier upload allowlist'
assert 'Định dạng file không được phép tải lên' in files_service, 'unsupported upload extensions must return a Vietnamese message'
assert 'MIME type của file không được phép tải lên' in files_service, 'unsupported upload MIME types must return a Vietnamese message'
assert 'const defaultMaxBytes = 10 * 1024 * 1024' in files_service, 'supplier upload default limit must remain 10 MB'
assert 'export function fileUploadLimitLabel' in files_service, 'service-level upload errors must use the same human-readable limit label'
assert files_service.count('assertAllowedUpload(file)') >= 2, 'mime/extension validation must run in both interceptor and service upload path'
assert 'Buffer.isBuffer(file.buffer)' in files_service, 'service upload must verify the uploaded buffer exists'
assert 'size !== file.buffer.length' in files_service, 'service upload must reject mismatched file sizes'
assert 'size > this.maxBytes' in files_service, 'service upload must enforce the configured upload size'
assert 'File vượt quá giới hạn ${fileUploadLimitLabel(this.maxBytes)}' in files_service, 'service upload limit message must be Vietnamese and user-readable'
assert "return key ? this.requiredObjectKey(key) : null" in files_service, 'objectKeyFromUrl must validate parsed download keys'
assert "BadRequestException('Object key không hợp lệ')" in files_service, 'invalid object keys must be rejected before storage access'

assert 'addSupplierFile(id, file, request.user?.id, request.user)' in Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text(), 'supplier file upload controller must pass request.user to service'
assert "deleteSupplierFile(@Param('id') id: string, @Param('fileId') fileId: string, @Req() request: { user?: RequestUser })" in Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text(), 'supplier file delete controller must receive request.user'
assert 'deleteSupplierFile(id, fileId, request.user)' in Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text(), 'supplier file delete controller must pass request.user to service'
assert 'async addSupplierFile(id: string, file: UploadFile | undefined, actorId?: string, user?: RequestUser)' in suppliers_service, 'supplier file upload service must accept request user context'
assert 'await this.getSupplier(id, user)' in suppliers_service, 'supplier file upload/delete must load supplier with request user context'
assert 'async deleteSupplierFile(id: string, fileId: string, user?: RequestUser)' in suppliers_service, 'supplier file delete service must accept request user context'
assert "this.requiredText(actorId, 'Không xác định được người tải file')" in suppliers_service, 'supplier file upload must require an authenticated actor'
assert 'return await this.prisma.$transaction(async (tx) => {' in suppliers_service.split('async addSupplierFile', 1)[1].split('async deleteSupplierFile', 1)[0], 'supplier file upload metadata create must run in one transaction'
assert 'await this.lockSupplierForStatusWrite(tx, id)' in suppliers_service.split('async addSupplierFile', 1)[1].split('async deleteSupplierFile', 1)[0], 'supplier file upload must lock supplier before metadata create'
assert 'return tx.supplierFile.create' in suppliers_service.split('async addSupplierFile', 1)[1].split('async deleteSupplierFile', 1)[0], 'supplier file upload metadata create must use transaction client'
assert 'await this.filesService.remove(upload.objectKey)' in suppliers_service, 'DB metadata failure must rollback the uploaded storage object'
assert 'Không thể lưu thông tin file và không thể hoàn tác file trên kho lưu trữ' in suppliers_service, 'rollback failure must return a clear Vietnamese message'
assert 'Không xác định được khóa lưu trữ của file nhà cung cấp' in suppliers_service, 'delete must reject corrupted file metadata before deleting DB rows'
delete_block = suppliers_service.split('async deleteSupplierFile', 1)[1].split('async updateSupplierStatus', 1)[0]
assert 'const { file, objectKey } = await this.prisma.$transaction(async (tx) => {' in delete_block, 'supplier file delete metadata write must run in one transaction'
assert 'await this.lockSupplierForStatusWrite(tx, id)' in delete_block, 'supplier file delete must lock supplier before ownership read/delete'
assert 'tx.supplierFile.findFirst' in delete_block, 'supplier file delete ownership read must use transaction client'
assert 'tx.supplierFile.deleteMany' in delete_block, 'supplier file delete metadata delete must use transaction client'
assert delete_block.index('lockSupplierForStatusWrite(tx, id)') < delete_block.index('tx.supplierFile.findFirst') < delete_block.index('tx.supplierFile.deleteMany'), 'supplier file delete must lock before ownership read and delete metadata after ownership check'
assert 'await this.filesService.removeIfPresent(objectKey)' in suppliers_service, 'delete must safely remove the validated storage object'
assert 'createdAt: file.createdAt' in suppliers_service, 'failed storage delete must restore original file metadata'
assert 'Xóa file trên kho lưu trữ thất bại và không thể khôi phục thông tin file nhà cung cấp' in suppliers_service, 'unrecoverable delete failure must be explicit'

for field in ['fileName', 'fileUrl', 'fileType', 'uploadedBy', 'createdAt']:
    assert field in frontend_upload, f'frontend SupplierFile contract must expose {field}'
assert 'return `${apiBase}${fileUrl}`' in frontend_upload, 'frontend must use the backend download URL directly'

assert "'blocked.js'" in smoke and "'text/plain'" in smoke, 'smoke must prove dangerous extensions are blocked even with a safe mime type'
assert "'blocked.txt'" in smoke and "'text/html'" in smoke, 'smoke must prove dangerous MIME types are blocked even with an allowed extension'
assert 'uploadedFile.fileUrl.includes' in smoke, 'smoke must assert download URL metadata is returned'
assert 'uploadedFile.createdAt' in smoke and 'uploadedFile.uploadedBy' in smoke, 'smoke must assert upload response metadata'
assert 'wrong-supplier delete must not remove the storage object' in smoke, 'smoke must protect file ownership on delete'
assert 'supplier file delete must remove the storage object' in smoke, 'smoke must verify storage cleanup on delete'

print('TEST_SUPPLIERS_FILE_CONTRACT_OK')
PYTEST
