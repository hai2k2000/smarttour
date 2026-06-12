#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

hotel = Path('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx').read_text()
generic = Path('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx').read_text()
shared = Path('apps/web/app/suppliers/SupplierClientUi.tsx').read_text()
hotel_page = Path('apps/web/app/suppliers/hotels/page.tsx').read_text()
typed_page = Path('apps/web/app/suppliers/[type]/page.tsx').read_text()
supplier_page = Path('apps/web/app/suppliers/page.tsx').read_text()
styles = Path('apps/web/app/globals.css').read_text()

for source in [hotel, generic]:
    assert 'supplierApi<' in source or 'supplierApi(' in source
    assert 'SupplierNoticeBanner' in source
    assert 'PermissionNotice' in source
    assert 'supplier.manage' in source and 'supplier.view' in source
    assert 'window.confirm' in source, 'destructive supplier actions must require confirmation'
    assert 'Không tìm thấy' in source and 'Đang tải' in source
    assert 'supplierLifecycleStatusOptions' in source
    assert 'z.enum(supplierLifecycleStatuses)' in source
    assert 'Quản lý loại nhà cung cấp' in source
    assert 'Công nợ' not in source, 'typed list must not expose fake debt values'

for field in ['search', 'status', 'province', 'market']:
    assert f"params.set('{field}'" in generic or 'Object.entries(nextFilters)' in generic
for field in ['search', 'status', 'province', 'market', 'hotelProject', 'classHotel']:
    assert field in hotel

assert "authJsonHeaders()" in shared and "authHeaders()" in shared
assert 'HTTP ${response.status}' in shared
assert "supplierLifecycleStatuses = ['ACTIVE', 'INACTIVE'] as const" in shared
assert 'supplierStatusLabels' in shared and 'supplierLifecycleStatusOptions' in shared
assert 'uploadSupplierFiles' in shared
assert '/files/${file.id}' in hotel and '/files/${file.id}' in generic
assert "method: 'DELETE'" in hotel and "method: 'DELETE'" in generic
assert '/hotel-allotments/${allotment.id}/override' in hotel
assert '/hotel-allotments/${allotment.id}/lock' in hotel
assert '/hotel-allotment-allocations/${allocation.id}/${action}' in hotel
assert 'Cần nhập lý do giải phóng phân bổ quỹ phòng' in hotel
assert 'Quỹ phòng được quản lý riêng' in hotel
assert "mode === 'create' ? { allotments:" in hotel, 'hotel edits must not replace allotments implicitly'
assert 'function shouldSendCollection(' in hotel and "dirtyFields[name] !== undefined" in hotel, 'hotel edits must only send dirty child collection snapshots'
assert 'Mã dịch vụ' in hotel and 'Mã dịch vụ' in generic
assert 'Giá thuần (NET)' in hotel and 'Giá thuần (NET)' in generic
assert 'initialError' in hotel_page and 'initialError' in typed_page
assert 'supplierPageConfigs' in typed_page
assert 'supplierConfigs' not in typed_page, 'server page must not import runtime values from a client module'
assert 'const config = supplierConfigs[type]' in generic
assert 'td.tableEmptyState { display: table-cell;' in styles
assert 'updateCategory(formData' in supplier_page
assert 'editCategoryModalId' in supplier_page

print('TEST_SUPPLIERS_CLIENT_CONTRACT_OK')
PYTEST
