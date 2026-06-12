#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

controller = Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text(encoding='utf-8')
service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text(encoding='utf-8')
query_dto = Path('apps/api/src/modules/suppliers/dto/supplier-query.dto.ts').read_text(encoding='utf-8')
hotel_dto = Path('apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts').read_text(encoding='utf-8')
frontend = Path('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx').read_text(encoding='utf-8')
supplier_ui = Path('apps/web/app/suppliers/SupplierClientUi.tsx').read_text(encoding='utf-8')

assert "@Get('hotels')" in controller and 'listHotelSuppliers(query)' in controller
assert "@Get('hotels/:id')" in controller and 'getHotelSupplier(id)' in controller
assert "@Post('hotels')" in controller and "@Put('hotels/:id')" in controller

assert 'class HotelSupplierListQueryDto' in query_dto
for field in ['search?: string', 'province?: string', 'hotelProject?: string', 'classHotel?: string', 'status?: SupplierStatus', 'market?: string']:
    assert field in query_dto, f'hotel supplier query is missing {field}'
assert 'class AllotmentInventoryQueryDto' in query_dto
assert "@IsUUID('4', { message: 'Mã nhà cung cấp không hợp lệ' })" in query_dto

assert 'const hotelProject = this.optionalLabel(query.hotelProject)' in service
assert 'const classHotel = this.optionalLabel(query.classHotel)' in service
assert 'hotelProfile: {' in service and 'is: {' in service, 'hotel list must require a hotel profile'
for search_fragment in [
    '{ supplierCode: contains }',
    '{ name: contains }',
    '{ taxCode: contains }',
    '{ contactPerson: contains }',
    '{ phone: contains }',
    '{ email: contains }',
    '{ address: contains }',
    '{ website: contains }',
    '{ province: contains }',
    '{ hotelProfile: { is: { hotelProject: contains } } }',
    '{ hotelProfile: { is: { classHotel: contains } } }',
    '{ hotelProfile: { is: { market: contains } } }',
    '{ contacts: { some: { fullName: contains } } }',
    '{ contacts: { some: { phone: contains } } }',
    '{ supplierServices: { some: { deletedAt: null, serviceName: contains } } }',
    '{ supplierServices: { some: { deletedAt: null, sku: contains } } }',
    '{ allotments: { some: { serviceName: contains } } }',
    '{ allotments: { some: { sku: contains } } }',
]:
    assert search_fragment in service, f'hotel supplier search must include {search_fragment}'

assert 'where: { id, deletedAt: null, hotelProfile: { isNot: null } }' in service
assert 'throw new NotFoundException(SUPPLIER_ERRORS.hotelSupplierNotFound)' in service
for include_fragment in [
    'hotelProfile: true',
    "contacts: { orderBy: { createdAt: 'asc' } }",
    "supplierServices: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } }",
    "allotments: { orderBy: { createdAt: 'asc' }, include: { allocations:",
    "files: { orderBy: { createdAt: 'desc' } }",
]:
    assert include_fragment in service, f'hotel detail include is missing {include_fragment}'

assert 'const hotelProfileData = this.toHotelProfileData(dto)' in service
assert "Object.keys(hotelProfileData).length ? { hotelProfile: { update: hotelProfileData } } : {}" in service
assert "const contactsInput = this.optionalArray(dto.contacts, 'Danh sách người liên hệ');" in service
assert "const servicesInput = this.optionalArray(dto.services, 'Danh sách dịch vụ khách sạn');" in service
assert "const allotmentsInput = this.optionalArray(dto.allotments, 'Danh sách quỹ phòng');" in service
assert 'if (contacts !== undefined)' in service and 'if (services !== undefined)' in service and 'if (allotments !== undefined)' in service
assert "tx.supplierService.updateMany({ where: { supplierId, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } })" in service
assert "throw new ConflictException('Không thể thay toàn bộ quỹ phòng khi còn phân bổ đang khóa hoặc đã xác nhận')" in service

assert 'private allotmentMetrics(' in service
assert 'overbookedQty' in service
assert 'private percent(part: number, total: number)' in service
assert 'occupancyRate: this.percent(metrics.bookedQty, metrics.allotmentQty)' in service
assert 'sellThroughRate: this.percent(metrics.bookedQty + metrics.lockedQty, metrics.allotmentQty)' in service
assert 'const today = this.startOfUtcDay(new Date())' in service, 'inventory and dashboard must use UTC-day calculations'
assert "logs: { orderBy: { createdAt: 'desc' }, take: 5 }" in service
assert "allocations: { orderBy: { createdAt: 'desc' } }" in service

assert 'private allotmentChanges(' in service
assert "throw new BadRequestException('Không có giá trị quỹ phòng nào thay đổi')" in service
assert "changes: changes.map((change) => ({ field: change.field, value: change.oldValue }))" in service
assert "changes: changes.map((change) => ({ field: change.field, value: change.newValue }))" in service
assert "throw new BadRequestException('Số phòng giữ chỗ phải lớn hơn 0')" in service
assert "where: { id: dto.serviceId, supplierId: current.supplierId, deletedAt: null }" in service
assert "Dịch vụ giữ chỗ không thuộc nhà cung cấp khách sạn hoặc đã bị xóa" in service
assert "if (nextStatus === 'CONFIRMED') throw new ConflictException('Chỉ phân bổ đang khóa mới được xác nhận')" in service
assert "throw new ConflictException('Không thể giải phóng phân bổ ở trạng thái hiện tại')" in service
assert "throw new ConflictException('Số lượng quỹ phòng không nhất quán với trạng thái phân bổ')" in service

for message in [
    'Không tìm thấy nhà cung cấp khách sạn',
    'Không tìm thấy quỹ phòng',
    'Số lượng đã đặt cộng số lượng đã khóa không được vượt quá tổng quỹ phòng',
    'Ngày bắt đầu không được sau ngày kết thúc',
    'Số phòng giữ chỗ phải lớn hơn 0',
]:
    assert message in (service + hotel_dto), f'missing Vietnamese hotel/allotment message: {message}'
for dto_message in [
    'Cần nhập tên người liên hệ',
    'Ngày sinh người liên hệ phải có định dạng YYYY-MM-DD',
    'Ngày sinh người liên hệ không hợp lệ',
    'Số điện thoại người liên hệ không được vượt quá 30 ký tự',
    'Số điện thoại người liên hệ không hợp lệ',
    'Email người liên hệ không hợp lệ',
    'Giá kế toán dịch vụ phải là số hợp lệ',
    'Giá thuần dịch vụ không được âm',
    'Tổng quỹ phòng phải là số nguyên',
    'Số phòng đang giữ không được âm',
    'Giá bán mỗi ngày phải là số hợp lệ',
    'Mô tả quỹ phòng không được vượt quá 2.000 ký tự',
    'Số phòng giữ chỗ phải là số nguyên',
    'Danh sách người liên hệ phải là danh sách hợp lệ',
    'Danh sách dịch vụ khách sạn phải là danh sách hợp lệ',
    'Danh sách quỹ phòng phải là danh sách hợp lệ',
    'Website nhà cung cấp phải là URL hợp lệ bắt đầu bằng http:// hoặc https://',
    'Liên kết tham khảo phải là URL hợp lệ bắt đầu bằng http:// hoặc https://',
]:
    assert dto_message in hotel_dto, f'hotel DTO numeric validation must be Vietnamese: {dto_message}'
for service_message in [
    'Mã dịch vụ không được vượt quá 80 ký tự',
    'Cần nhập tên dịch vụ',
    'Tên dịch vụ không được vượt quá 180 ký tự',
    'Ngày bắt đầu dịch vụ phải có định dạng YYYY-MM-DD',
    'Ngày kết thúc dịch vụ phải có định dạng YYYY-MM-DD',
    'Giá kế toán dịch vụ không được vượt quá 999.999.999.999',
    'Giá thuần dịch vụ không được vượt quá 999.999.999.999',
    'Giá bán dịch vụ không được vượt quá 999.999.999.999',
    'Mô tả dịch vụ không được vượt quá 2.000 ký tự',
    'Ghi chú dịch vụ không được vượt quá 2.000 ký tự',
]:
    assert service_message in hotel_dto, f'hotel service DTO validation must be Vietnamese: {service_message}'
assert 'const maxHotelBuiltYear = new Date().getFullYear();' in hotel_dto, 'hotel built year must not exceed the current year'
assert 'const maxSupplierMoney = 999_999_999_999;' in hotel_dto, 'hotel service money must use a business upper bound'
assert '@Max(5, { message: \'Xếp hạng khách sạn không được lớn hơn 5\' })' in hotel_dto, 'hotel rating must use a 0-5 scale'
assert '@Transform(trimOptional)\n  @IsDateString' in hotel_dto, 'optional hotel child dates must accept blank values after trim'
assert 'private optionalUrlText(' in service and 'http:// hoặc https://' in service, 'service must validate optional hotel URLs consistently'
assert 'private optionalHotelBuiltYear(' in service and 'MIN_HOTEL_BUILT_YEAR' in service, 'service must validate hotel built year range'
assert 'private optionalRating(' in service and 'MAX_SUPPLIER_RATING = 5' in service, 'service must validate supplier rating range'
assert 'private optionalPhoneText(' in service and 'SUPPLIER_PHONE_MAX_LENGTH = 30' in service, 'service must validate contact phone format and length'
assert 'private optionalEmailText(' in service and 'không được vượt quá 180 ký tự' in service, 'service must validate contact email format and length'
assert 'Họ tên ${row} phải có ít nhất 2 ký tự' in service, 'service must validate contact fullName length outside the global pipe'
assert 'position: this.optionalMaxText(item.position' in service, 'service must validate contact position length'
assert 'private optionalSku(' in service and 'MAX_SUPPLIER_SERVICE_SKU_LENGTH = 80' in service, 'service must normalize and bound service sku'
assert 'private requiredServiceName(' in service and 'MAX_SUPPLIER_SERVICE_NAME_LENGTH = 180' in service, 'service must validate service name consistently'
assert 'private optionalMoney(' in service and 'MAX_SUPPLIER_MONEY = 999_999_999_999' in service, 'service must bound supplier service prices'
assert 'private ensureUniqueServiceSkus(' in service and 'Mã dịch vụ không được trùng trong cùng nhà cung cấp' in service, 'service must reject duplicate service sku values in one payload'
assert "description: this.optionalMaxText(item.description, `Mô tả ${row}`, 2000)" in service, 'service must limit service description size'
assert "note: this.optionalMaxText(item.note, `Ghi chú ${row}`, 2000)" in service, 'service must limit service note size'
assert "Ngày bắt đầu ${subject} không được sau ngày kết thúc ${subject}" in service, 'service must validate startDate <= endDate'
for english in ['Hotel supplier not found', 'Allotment not found', 'Booked plus locked quantity cannot exceed allotment quantity']:
    assert english.lower() not in (service + hotel_dto).lower(), f'English hotel/allotment message remains: {english}'

assert "Object.entries(nextFilters).forEach" in frontend
for field in ['search', 'status', 'province', 'market', 'hotelProject', 'classHotel']:
    assert field in frontend, f'hotel frontend filter missing {field}'
assert "editingId ? {} : { allotments:" in frontend, 'hotel edit must not send allotments unless creating'
assert 'Quỹ phòng được quản lý riêng' in frontend
for required_label in ['Mã nhà cung cấp *', 'Tên khách sạn *', 'Số điện thoại *', 'Hạng khách sạn *', 'Dòng sản phẩm/Dự án *']:
    assert required_label in frontend, f'hotel frontend must mark required field: {required_label}'
assert 'const supplierPhonePattern = ' in frontend and 'requiredPhone' in frontend, 'hotel frontend must validate phone by business pattern'
assert 'const optionalUrl = ' in frontend and 'type="url"' in frontend, 'hotel frontend must validate optional website/link URLs'
assert 'max={currentYear}' in frontend and 'max(5' in frontend, 'hotel frontend must show year/rating bounds'
assert 'const isOptionalDateOnly = ' in frontend and 'Ngày sinh người liên hệ không hợp lệ' in frontend, 'hotel frontend must validate contact birthday'
assert 'Họ tên người liên hệ phải có ít nhất 2 ký tự' in frontend, 'hotel frontend must validate filled contact rows'
assert 'nestedErrorMessages(errors.contacts)' in frontend, 'hotel frontend must surface dynamic contact row errors'
assert 'const optionalDateOnly = ' in frontend and 'Ngày bắt đầu dịch vụ' in frontend and 'Ngày kết thúc dịch vụ' in frontend, 'hotel frontend must validate service date fields'
assert 'const nonNegativeMoney = ' in frontend and '999.999.999.999' in frontend, 'hotel frontend must bound service prices'
assert 'function hasServiceRowData(' in frontend and 'values.services.filter(hasServiceRowData)' in frontend, 'hotel frontend must preserve partially filled service rows for validation'
assert 'Mã dịch vụ không được trùng trong cùng nhà cung cấp' in frontend, 'hotel frontend must reject duplicate service sku values'
assert 'Tên dịch vụ *' in frontend and 'Tên dịch vụ phải có ít nhất 2 ký tự' in frontend, 'hotel frontend must make serviceName required for filled rows'
for day_type, label in [
    ('ALL_DAYS', 'Tất cả các ngày'),
    ('WEEKDAY', 'Ngày thường'),
    ('WEEKEND', 'Cuối tuần'),
    ('HOLIDAY', 'Ngày lễ'),
    ('PEAK', 'Cao điểm'),
]:
    assert day_type in frontend and day_type in supplier_ui, f'dayType {day_type} must exist in hotel form and shared UI'
    assert label in supplier_ui, f'dayType {day_type} must have a Vietnamese label'

print('TEST_SUPPLIERS_HOTEL_CONTRACT_OK')
PYTEST
