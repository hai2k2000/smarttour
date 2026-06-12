#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

files_service = Path('apps/api/src/modules/files/files.service.ts').read_text()
suppliers_service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
frontend_upload = Path('apps/web/app/suppliers/uploadSupplierFiles.ts').read_text()
smoke = Path('scripts/smoke-suppliers.sh').read_text()

for denied in ["'.svg'", "'.js'", "'.sh'", "'image/svg+xml'", "'text/html'", "'application/javascript'"]:
    assert denied in files_service, f'{denied} must remain blocked for supplier uploads'
assert 'const defaultMaxBytes = 10 * 1024 * 1024' in files_service, 'supplier upload default limit must remain 10 MB'
assert 'export function fileUploadLimitLabel' in files_service, 'service-level upload errors must use the same human-readable limit label'
assert files_service.count('assertAllowedUpload(file)') >= 2, 'mime/extension validation must run in both interceptor and service upload path'
assert 'Buffer.isBuffer(file.buffer)' in files_service, 'service upload must verify the uploaded buffer exists'
assert 'size !== file.buffer.length' in files_service, 'service upload must reject mismatched file sizes'
assert 'size > this.maxBytes' in files_service, 'service upload must enforce the configured upload size'
assert 'File vượt quá giới hạn ${fileUploadLimitLabel(this.maxBytes)}' in files_service, 'service upload limit message must be Vietnamese and user-readable'
assert "return key ? this.requiredObjectKey(key) : null" in files_service, 'objectKeyFromUrl must validate parsed download keys'
assert "BadRequestException('Object key không hợp lệ')" in files_service, 'invalid object keys must be rejected before storage access'

assert "this.requiredText(actorId, 'Không xác định được người tải file')" in suppliers_service, 'supplier file upload must require an authenticated actor'
assert 'await this.filesService.remove(upload.objectKey)' in suppliers_service, 'DB metadata failure must rollback the uploaded storage object'
assert 'Không thể lưu metadata file và không thể hoàn tác object trên storage' in suppliers_service, 'rollback failure must return a clear Vietnamese message'
assert 'Không xác định được object storage của file nhà cung cấp' in suppliers_service, 'delete must reject corrupted file metadata before deleting DB rows'
assert 'await this.filesService.removeIfPresent(objectKey)' in suppliers_service, 'delete must safely remove the validated storage object'
assert 'createdAt: file.createdAt' in suppliers_service, 'failed storage delete must restore original file metadata'
assert 'Xóa object storage thất bại và không thể khôi phục metadata file nhà cung cấp' in suppliers_service, 'unrecoverable delete failure must be explicit'

for field in ['fileName', 'fileUrl', 'fileType', 'uploadedBy', 'createdAt']:
    assert field in frontend_upload, f'frontend SupplierFile contract must expose {field}'
assert 'return `${apiBase}${fileUrl}`' in frontend_upload, 'frontend must use the backend download URL directly'

assert "'blocked.js'" in smoke and "'text/plain'" in smoke, 'smoke must prove dangerous extensions are blocked even with a safe mime type'
assert 'uploadedFile.fileUrl.includes' in smoke, 'smoke must assert download URL metadata is returned'
assert 'uploadedFile.createdAt' in smoke and 'uploadedFile.uploadedBy' in smoke, 'smoke must assert upload response metadata'
assert 'wrong-supplier delete must not remove the storage object' in smoke, 'smoke must protect file ownership on delete'
assert 'supplier file delete must remove the storage object' in smoke, 'smoke must verify storage cleanup on delete'

print('TEST_SUPPLIERS_FILE_CONTRACT_OK')
PYTEST
