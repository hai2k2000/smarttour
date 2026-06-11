#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
hotel_dto = Path('apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts').read_text()
generic_dto = Path('apps/api/src/modules/suppliers/dto/generic-supplier.dto.ts').read_text()
source = '\n'.join((service, hotel_dto, generic_dto))

english_fragments = [
    'supplier not found',
    'supplier type not found',
    'typed supplier not found',
    'file not found',
    'supplier category already exists',
    'supplier code already exists',
    'Service does not match allotment',
    'Not enough allotment quantity',
    'Scoped allotment locks require',
]
for fragment in english_fragments:
    assert fragment.lower() not in source.lower(), f'English supplier error returned: {fragment}'

required_messages = [
    'Không tìm thấy nhà cung cấp',
    'Không tìm thấy nhà cung cấp thuộc loại đã chọn',
    'Loại nhà cung cấp không được hỗ trợ',
    'Không tìm thấy file nhà cung cấp',
    'Loại nhà cung cấp đã tồn tại',
    'Mã nhà cung cấp đã tồn tại',
    'Dịch vụ không khớp với quỹ phòng',
    'Số lượng quỹ phòng còn lại không đủ',
    'Không tìm thấy phân bổ quỹ phòng',
    'Trạng thái quỹ phòng không hợp lệ',
    'Ngày bắt đầu dịch vụ không hợp lệ',
]
for message in required_messages:
    assert message in source, f'Missing standardized Vietnamese message: {message}'

assert "message = 'Cần nhập trường bắt buộc'" in service, 'requiredText must provide a Vietnamese default message'
assert 'Number.isFinite(value)' in service, 'optionalNumber must reject non-finite values'
assert 'Number.isNaN(date.getTime())' in service, 'optionalDate must reject invalid dates'
assert 'optionalDateRange' in service, 'supplier child date ranges must be checked before persistence'
assert 'Ngày bắt đầu ${subject} không được sau ngày kết thúc ${subject}' in service, 'date-range helper must return a Vietnamese message'
assert "@IsDateString({}, { message: 'Ngày bắt đầu dịch vụ không hợp lệ' })" in hotel_dto
assert "@IsIn(['ACTIVE', 'INACTIVE', 'STOP_SELL'], { message: 'Trạng thái quỹ phòng không hợp lệ' })" in hotel_dto
assert "@IsDateString({}, { message: 'Ngày sinh người liên hệ không hợp lệ' })" in generic_dto

print('TEST_SUPPLIERS_SERVICE_I18N_OK')
PYTEST
