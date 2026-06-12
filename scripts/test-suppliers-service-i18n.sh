#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
import re
from pathlib import Path

service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
operations_service = Path('apps/api/src/modules/operations/operations.service.ts').read_text()
hotel_dto = Path('apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts').read_text()
generic_dto = Path('apps/api/src/modules/suppliers/dto/generic-supplier.dto.ts').read_text()
validation_factory = Path('apps/api/src/validation-exception.factory.ts').read_text()
source = '\n'.join((service, operations_service, hotel_dto, generic_dto))
dto_sources = {
    path.name: path.read_text()
    for path in Path('apps/api/src/modules/suppliers/dto').glob('*.ts')
}

english_fragments = [
    'Hotel supplier not found',
    'Allotment not found',
    'Booked plus locked quantity cannot exceed allotment quantity',
    'At least one supplier payment item is required',
    'Payment item amount must be greater than zero',
    'Tour not found',
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

bare_class_validator = re.compile(r'@(Is(?:Array|Object|Number|Int|Enum|String|UUID|DateString|Url|Email|Boolean|In|NotEmpty))\(\)')
for name, dto_source in dto_sources.items():
    matches = bare_class_validator.findall(dto_source)
    assert not matches, f'{name} has class-validator decorators without Vietnamese messages: {matches}'

required_messages = [
    'Không tìm thấy nhà cung cấp',
    'Không tìm thấy nhà cung cấp khách sạn',
    'Không tìm thấy nhà cung cấp thuộc loại đã chọn',
    'Loại nhà cung cấp không được hỗ trợ',
    'Không tìm thấy file nhà cung cấp',
    'Loại nhà cung cấp đã tồn tại',
    'Mã nhà cung cấp đã tồn tại',
    'Dịch vụ không khớp với quỹ phòng',
    'Số lượng quỹ phòng còn lại không đủ',
    'Số lượng đã đặt cộng số lượng đã khóa không được vượt quá tổng quỹ phòng',
    'Không tìm thấy phân bổ quỹ phòng',
    'Trạng thái quỹ phòng không hợp lệ',
    'Ngày bắt đầu dịch vụ không hợp lệ',
    'Cần ít nhất một dòng thanh toán nhà cung cấp',
    'Số tiền thanh toán phải lớn hơn 0',
    'Không tìm thấy tour',
    'Cần nhập tên người liên hệ',
    'Cần nhập tên dịch vụ',
    'Số lượng dịch vụ phải là số nguyên',
    'Giá kế toán dịch vụ phải là số hợp lệ',
    'Giá thuần dịch vụ không được vượt quá 999.999.999.999',
    'Metadata dịch vụ phải là object hợp lệ',
    'Danh sách dịch vụ phải là danh sách hợp lệ',
    'Website nhà cung cấp phải là URL hợp lệ bắt đầu bằng http:// hoặc https://',
    'Liên kết tham khảo phải là URL hợp lệ bắt đầu bằng http:// hoặc https://',
]
for message in required_messages:
    assert message in source, f'Missing standardized Vietnamese message: {message}'

for fallback in [
    'FIELD_LABELS',
    "case 'isUrl':",
    "case 'isObject':",
    "case 'matches':",
    "case 'nestedValidation':",
    'không đúng định dạng',
]:
    assert fallback in validation_factory, f'validation exception factory must localize fallback: {fallback}'

assert "message = 'Cần nhập trường bắt buộc'" in service, 'requiredText must provide a Vietnamese default message'
assert 'Number.isFinite(number)' in service, 'optionalNumber must reject non-finite values'
assert 'optionalNonNegativeNumber' in service and 'optionalNonNegativeInt' in service, 'supplier child numeric rows must be validated before persistence'
assert 'toSupplierStatus' in service and 'Trạng thái nhà cung cấp không hợp lệ' in service, 'supplier status must be validated in the service layer'
assert 'SUPPLIER_STATUS_TRANSITIONS' in service and 'ensureSupplierStatusTransition' in service, 'supplier status updates must validate lifecycle transitions'
assert 'Nhà cung cấp đã ở trạng thái' in service and 'Chuyển trạng thái nhà cung cấp không hợp lệ' in service, 'supplier status transition errors must be Vietnamese'
assert 'toDayType' in service and 'Loại ngày dịch vụ không hợp lệ' in service, 'supplier day type must be validated in the service layer'
assert 'toAllotmentStatus' in service and 'Trạng thái quỹ phòng không hợp lệ' in service, 'allotment status must be validated in the service layer'
assert 'normalizeGenericServices' in service and 'normalizeHotelAllotments' in service, 'child rows must be normalized before delete/create replacement'
assert 'Number.isNaN(date.getTime())' in service, 'optionalDate must reject invalid dates'
assert 'optionalDateRange' in service, 'supplier child date ranges must be checked before persistence'
assert 'Ngày bắt đầu ${subject} không được sau ngày kết thúc ${subject}' in service, 'date-range helper must return a Vietnamese message'
assert "@IsDateString({}, { message: 'Ngày bắt đầu dịch vụ không hợp lệ' })" in hotel_dto
assert 'SUPPLIER_ALLOTMENT_STATUSES' in hotel_dto and "@IsIn(SUPPLIER_ALLOTMENT_STATUSES, { message: 'Trạng thái quỹ phòng không hợp lệ' })" in hotel_dto
assert "@IsDateString({}, { message: 'Ngày sinh người liên hệ không hợp lệ' })" in generic_dto

print('TEST_SUPPLIERS_SERVICE_I18N_OK')
PYTEST
