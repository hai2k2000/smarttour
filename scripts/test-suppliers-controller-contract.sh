#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
import re
from pathlib import Path

controller = Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text()
service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
types_source = Path('apps/api/src/modules/suppliers/supplier-types.ts').read_text()
frontend = Path('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx').read_text()
files_service = Path('apps/api/src/modules/files/files.service.ts').read_text()
upload_filter = Path('apps/api/src/modules/files/file-upload-size-exception.filter.ts').read_text()

expected_types = {
    'restaurants', 'flights', 'attraction-tickets', 'landtour-suppliers',
    'water', 'transport', 'bus', 'other', 'villas', 'passport', 'guides',
    'series-tickets', 'vouchers',
}
backend_types = set(re.findall(r"^\s{2}(?:'([^']+)'|([a-z][a-z-]*)):\s*'", types_source, re.M))
backend_types = {quoted or plain for quoted, plain in backend_types}
frontend_types = set(re.findall(r"^\s*\|\s*'([^']+)'", frontend, re.M))
assert backend_types == expected_types, f'backend typed supplier routes differ: {backend_types}'
assert frontend_types == expected_types, f'frontend typed supplier routes differ: {frontend_types}'
for label in ['Nhà hàng', 'Vé máy bay', 'Vouchers', 'Nước suối', 'Chi phí khác', 'Visa và hộ chiếu', 'Hướng dẫn viên']:
    assert label in types_source, f'typed supplier label must be Vietnamese: {label}'
for alias in ["'Restaurant'", "'Flight'", "'Other Cost'", "'Passport Visa'", "'Series Ticket'"]:
    assert alias in types_source, f'legacy English category alias must remain supported: {alias}'

assert controller.count("@RequirePermissions('supplier.view')") >= 2, 'category and supplier controllers must require supplier.view'
assert controller.count("@RequirePermissions('supplier.manage')") == 19, 'every supplier mutation endpoint must explicitly require supplier.manage'
manage_methods = {
    'create', 'update', 'remove', 'createHotel', 'updateHotel', 'overrideAllotment',
    'lockAllotment', 'confirmAllotment', 'releaseAllotment', 'createTyped',
    'updateTyped', 'updateTypedStatus', 'removeTyped', 'addSupplierFile',
    'deleteSupplierFile', 'updateStatus',
}
for method in manage_methods:
    pattern = rf"@RequirePermissions\('supplier\.manage'\)[\s\S]{{0,240}}?\n\s*{method}\("
    assert re.search(pattern, controller), f'{method} must require supplier.manage'

assert "@Get(':id')" not in controller, 'duplicate single-segment detail route must not return'
for static_route in ["@Get('hotels')", "@Get('hotels/:id')", "@Get('hotel-allotments/dashboard')", "@Get('hotel-allotments/inventory')", "@Patch('hotel-allotments/:id/override')", "@Post('hotel-allotments/:id/lock')", "@Post('hotel-allotment-allocations/:id/confirm')", "@Post('hotel-allotment-allocations/:id/release')"]:
    assert controller.index(static_route) < controller.index("@Get(':routeKey')"), f'{static_route} must be declared before dynamic route dispatch'
assert "@Controller('supplier-categories')" in controller, 'supplier category routes must stay outside the dynamic /suppliers/:routeKey namespace'
assert 'isTypedSupplierRoute(routeKey)' in controller, 'single-segment dispatcher must distinguish typed routes from supplier ids'
remove_typed_match = re.search(r"removeTyped\([\s\S]*?\n\s*}\n", controller)
assert remove_typed_match, 'typed delete controller method must exist'
remove_typed_body = remove_typed_match.group(0)
assert 'deleteTypedSupplier(type, id, request.user)' in remove_typed_body, 'typed delete controller must delegate to the typed-safe service method with request.user'
assert 'getTypedSupplier(type, id).then' not in remove_typed_body and 'deleteSupplier(id)' not in remove_typed_body, 'typed delete must not validate then delete a generic supplier id directly'
delete_typed_match = re.search(r"async deleteTypedSupplier\([\s\S]*?\n\s*}\n", service)
assert delete_typed_match, 'typed delete service method must exist'
delete_typed_body = delete_typed_match.group(0)
assert 'await this.ensureTypedSupplier(typedRoute, id)' in delete_typed_body and 'return maskSupplierFinancialFields(await this.deleteSupplierRecord(id), user)' in delete_typed_body, 'typed delete must validate the supplier category and mask the soft-delete response'
for delegation in [
    'createHotelSupplier(dto, request.user)',
    'updateHotelSupplier(id, dto, request.user)',
    'createTypedSupplier(type, dto, request.user)',
    'updateTypedSupplier(type, id, dto, request.user)',
    'updateTypedSupplierStatus(type, id, dto.status, request.user)',
    'deleteTypedSupplier(type, id, request.user)',
    'createSupplier(dto, request.user)',
    'updateSupplier(id, dto, request.user)',
    'updateSupplierStatus(id, dto.status, request.user)',
    'deleteSupplier(id, request.user)',
]:
    assert delegation in controller, f'supplier mutation controller must pass request.user: {delegation}'
assert '@Query() query: HotelSupplierListQueryDto' in controller, 'hotel list query must be validated'
assert '@Query() query: AllotmentInventoryQueryDto' in controller, 'allotment inventory query must be validated'
assert "FileInterceptor('file', fileUploadInterceptorOptions())" in controller, 'supplier upload must use shared file limits and filtering'
assert '@UseFilters(FileUploadSizeExceptionFilter)' in controller, 'supplier upload must translate oversized files to the shared Vietnamese error response'
assert 'const defaultMaxBytes = 10 * 1024 * 1024' in files_service, 'default supplier upload limit must remain 10 MB'
assert 'limits: { fileSize: maxBytes }' in files_service, 'multer must enforce the configured upload limit before service persistence'
assert 'const allowedExtensions = new Set' in files_service and 'const allowedMimeTypes = new Set' in files_service, 'uploads must use an explicit allowlist for file extension and MIME type'
for token in ["'.pdf'", "'.docx'", "'.xlsx'", "'.jpg'", "'.png'", "'.zip'", "'text/plain'", "'application/pdf'", "'image/jpeg'"]:
    assert token in files_service, f'allowed upload policy must include common supplier attachment token {token}'
for token in ['.js', '.svg', 'text/html', 'application/javascript']:
    assert token not in files_service, f'unsafe upload token must not be allowed: {token}'
assert 'Định dạng file không được phép tải lên' in files_service, 'unsupported extensions must return a Vietnamese validation message'
assert 'MIME type của file không được phép tải lên' in files_service, 'unsupported MIME types must return a Vietnamese validation message'
assert 'File vượt quá giới hạn ${limitLabel} MB' in upload_filter, 'oversized uploads must return a Vietnamese 10 MB policy message'
assert "this.requiredText(actorId, 'Không xác định được người tải file')" in service, 'supplier upload must require an authenticated actor id'

print('TEST_SUPPLIERS_CONTROLLER_CONTRACT_OK')
PYTEST
