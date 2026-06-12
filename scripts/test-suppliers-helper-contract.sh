#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path
import re

service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text(encoding='utf-8')
types_source = Path('apps/api/src/modules/suppliers/supplier-types.ts').read_text(encoding='utf-8')
frontend = Path('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx').read_text(encoding='utf-8')

vietnamese_labels = {
    'restaurants': 'Nhà hàng',
    'flights': 'Vé máy bay',
    'attraction-tickets': 'Vé tham quan',
    'other': 'Chi phí khác',
    'passport': 'Visa và hộ chiếu',
    'guides': 'Hướng dẫn viên',
}
for route, label in vietnamese_labels.items():
    assert f"{route}: '{label}'" in types_source or f"'{route}': '{label}'" in types_source, f'{route} must use a Vietnamese category label'

for alias in ["'Restaurant'", "'Flight'", "'Flight Ticket'", "'Other Cost'", "'Passport Visa'", "'Tour Guide'"]:
    assert alias in types_source, f'legacy category alias must remain supported: {alias}'

for label in ['Nhà hàng', 'Vé máy bay', 'Chi phí khác', 'Visa và hộ chiếu', 'Hướng dẫn viên']:
    assert label in types_source and label in frontend, f'typed supplier category label must match backend/frontend: {label}'
assert 'Vé series' in types_source and 'Series vé giữ chỗ' in frontend, 'series tickets must keep the backend category label while showing a clear frontend title'

backend_metadata_keys = set(re.findall(r"\b([A-Za-z][A-Za-z0-9]*): '(?:text|number|date|time|datetime)'", types_source))
frontend_form_keys = set(re.findall(r"\{ key: '([^']+)'", frontend))
common_frontend_keys = {'accountingPrice', 'description', 'fullName', 'netPrice', 'note', 'position', 'quantity', 'sellingPrice', 'serviceName', 'sku'}
assert backend_metadata_keys <= frontend_form_keys, f'frontend typed service fields missing backend metadata: {sorted(backend_metadata_keys - frontend_form_keys)}'
assert (frontend_form_keys - common_frontend_keys) <= backend_metadata_keys, f'backend metadata missing frontend typed service fields: {sorted(frontend_form_keys - common_frontend_keys - backend_metadata_keys)}'

assert 'findCategoryByName(categoryName)' in service, 'ensureCategoryByName must use normalized category lookup'
assert 'throw new ConflictException(SUPPLIER_ERRORS.categoryExists)' in service, 'category create races must return a Vietnamese conflict'
assert 'this.validateSupplierPayload(dto, false, false)' in service, 'typed/hotel create must validate shared supplier fields'
assert 'this.validateSupplierPayload(dto, true, false)' in service, 'typed/hotel update must validate shared supplier fields'
assert 'this.toSupplierStatus(status)' in service, 'status mutations must validate status before writing'

normalize_hotel = service.index('const contactsInput = this.optionalArray(dto.contacts, \'Danh sách người liên hệ\');')
delete_contact = service.index('await tx.supplierContact.deleteMany({ where: { supplierId } });', normalize_hotel)
assert normalize_hotel < delete_contact, 'hotel child rows must be normalized before contacts are deleted'
normalize_generic = service.index('const servicesInput = this.optionalArray(dto.services, \'Danh sách dịch vụ\');')
soft_delete_service = service.index("await tx.supplierService.updateMany({ where: { supplierId, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } });", normalize_generic)
assert normalize_generic < soft_delete_service, 'generic service rows must be normalized before existing services are replaced'

for helper in ['normalizeSupplierContacts', 'normalizeGenericServices', 'normalizeHotelServices', 'normalizeHotelAllotments']:
    assert f'private {helper}' in service, f'missing supplier child helper: {helper}'
for message in [
    'Cần nhập tên dịch vụ ${row}',
    'Cần nhập tên quỹ phòng ${row}',
    'Số lượng đã đặt cộng số lượng đã khóa không được vượt quá tổng quỹ phòng',
    'Loại ngày dịch vụ không hợp lệ',
    'Trạng thái quỹ phòng không hợp lệ',
]:
    assert message in service, f'missing Vietnamese helper validation message: {message}'

assert 'genericListInclude()' in service and 'genericInclude()' in service, 'typed supplier list/detail includes must remain separated'
assert 'hotelListInclude()' in service and 'hotelInclude()' in service, 'hotel supplier list/detail includes must remain separated'

print('TEST_SUPPLIERS_HELPER_CONTRACT_OK')
PYTEST
