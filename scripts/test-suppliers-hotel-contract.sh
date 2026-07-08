#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

controller = Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text(encoding='utf-8')
service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text(encoding='utf-8')
query_dto = Path('apps/api/src/modules/suppliers/dto/supplier-query.dto.ts').read_text(encoding='utf-8')
hotel_dto = Path('apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts').read_text(encoding='utf-8')
allotment_status = Path('apps/api/src/modules/suppliers/supplier-allotment-status.ts').read_text(encoding='utf-8')
frontend = Path('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx').read_text(encoding='utf-8')
supplier_ui = Path('apps/web/app/suppliers/SupplierClientUi.tsx').read_text(encoding='utf-8')
globals_css = Path('apps/web/app/globals.css').read_text(encoding='utf-8')
bookings_page = Path('apps/web/app/bookings/page.tsx').read_text(encoding='utf-8')

assert "@Get('hotels')" in controller and 'listHotelSuppliers(query, request.user)' in controller
assert "@Get('hotels/:id')" in controller and 'getHotelSupplier(id, request.user)' in controller
assert "@Post('hotels')" in controller and "@Put('hotels/:id')" in controller

assert 'class HotelSupplierListQueryDto' in query_dto
hotel_query_block = query_dto.split('export class HotelSupplierListQueryDto', 1)[1].split('export class TypedSupplierListQueryDto', 1)[0]
for field in ['search?: string', 'province?: string', 'hotelProject?: string', 'classHotel?: string', 'status?: SupplierStatus', 'market?: string', 'take?: number']:
    assert field in hotel_query_block, f'hotel supplier query is missing {field}'
assert 'MAX_SUPPLIERS_TAKE' in hotel_query_block, 'hotel supplier query must cap take to avoid unbounded SSR payloads'
assert 'class AllotmentInventoryQueryDto' in query_dto
assert "@IsUUID('4', { message: 'Mã nhà cung cấp không hợp lệ' })" in query_dto

assert 'const hotelProject = this.optionalLabel(query.hotelProject)' in service
assert 'const classHotel = this.optionalLabel(query.classHotel)' in service
hotel_list_block = service.split('async listHotelSuppliers', 1)[1].split('async getHotelSupplier', 1)[0]
assert 'take: this.listTake(query.take ?? query.limit)' in hotel_list_block, 'hotel supplier list must apply bounded take'
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
    "supplierServices: { where: { deletedAt: null }, orderBy: SUPPLIER_SERVICE_ORDER_BY }",
    "allotments: { orderBy: { createdAt: 'asc' }, include: { allocations:",
    "files: { orderBy: { createdAt: 'desc' } }",
]:
    assert include_fragment in service, f'hotel detail include is missing {include_fragment}'

for order_fragment in ["{ createdAt: 'asc' }", "{ sku: 'asc' }", "{ id: 'asc' }"]:
    assert order_fragment in service, f'supplier service order must include deterministic {order_fragment}'

assert 'const hotelProfileData = this.toHotelProfileData(dto)' in service
assert 'this.validateHotelProfilePayload(dto)' in service and 'this.validateHotelProfilePayload(dto, true)' in service, 'hotel create/update must validate required profile fields in the service layer'
assert 'const statusChange = this.requestedSupplierStatusChange(current.status, dto.status)' in service
assert 'if (statusChange === SupplierStatus.INACTIVE)' in service, 'hotel update status must use the shared transition guard'
assert "Object.keys(hotelProfileData).length ? { hotelProfile: { update: hotelProfileData } } : {}" in service
assert 'Hotel update contract: omitted child arrays preserve existing rows; provided arrays are full snapshots.' in service
assert "const contactsInput = this.optionalArray(dto.contacts, 'Danh sách người liên hệ');" in service
assert "const servicesInput = this.optionalArray(dto.services, 'Danh sách dịch vụ khách sạn');" in service
assert "const allotmentsInput = this.optionalArray(dto.allotments, 'Danh sách quỹ phòng');" in service
assert 'if (contacts !== undefined)' in service and 'if (services !== undefined)' in service and 'if (allotments !== undefined)' in service
assert "tx.supplierService.updateMany({ where: { supplierId, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } })" in service
assert "throw new ConflictException('Không thể thay toàn bộ quỹ phòng khi còn phân bổ đang khóa hoặc đã xác nhận')" in service

assert 'private allotmentMetrics(' in service
assert 'const allotmentQty = item.allotmentQty ?? 0' in service, 'zero allotment quantity must not fall back to legacy locked quantity'
assert 'overbookedQty' in service
assert 'private percent(part: number, total: number)' in service
assert 'occupancyRate: this.percent(metrics.bookedQty, metrics.allotmentQty)' in service
assert 'sellThroughRate: this.percent(metrics.bookedQty + metrics.lockedQty, metrics.allotmentQty)' in service
assert "const isSellable = item.status === 'ACTIVE' && remainingQty > 0" in service and "const computedStatus = item.status === 'STOP_SELL'" in service and "!isSellable" in service, 'dashboard must prioritize stop-sell or sold-out inventory before COD lock'
assert "acc.activeAllotments += computedStatus === 'ACTIVE' ? 1 : 0" in service
assert "acc.stopSellAllotments += computedStatus === 'STOP_SELL' ? 1 : 0" in service
assert "acc.codLockedAllotments += computedStatus === 'COD_LOCKED' ? 1 : 0" in service, 'dashboard status buckets must be mutually exclusive'
assert 'const today = this.startOfUtcDay(new Date())' in service, 'inventory and dashboard must use UTC-day calculations'
assert "logs: { orderBy: { createdAt: 'desc' }, take: 5 }" in service
assert "allocations: { orderBy: { createdAt: 'desc' } }" in service

assert 'private allotmentChanges(' in service
assert "throw new BadRequestException('Không có giá trị quỹ phòng nào thay đổi')" in service
assert "changes: changes.map((change) => ({ field: change.field, value: change.oldValue }))" in service
assert "changes: changes.map((change) => ({ field: change.field, value: change.newValue }))" in service
assert "throw new BadRequestException('Số phòng giữ chỗ phải lớn hơn 0')" in service
assert "where: { id: dto.serviceId, supplierId: current.supplierId, deletedAt: null }" in service
assert "throw new BadRequestException('Nhà cung cấp khách sạn đang ngừng hoạt động')" in service
assert "throw new BadRequestException('Quỹ phòng đã hết thời gian áp dụng')" in service
assert "throw new BadRequestException('Quỹ phòng đã tới hạn chốt và không thể giữ chỗ')" in service
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
assert 'const maxSupplierAllotmentCutoffDays = 365;' in hotel_dto, 'hotel allotment cutoff days must use a business upper bound'
assert "SUPPLIER_ALLOTMENT_STATUSES = ['ACTIVE', 'INACTIVE', 'STOP_SELL'] as const" in allotment_status, 'hotel allotment statuses must be a shared fixed contract'
assert 'SUPPLIER_ALLOTMENT_STATUSES' in hotel_dto and '@IsIn(SUPPLIER_ALLOTMENT_STATUSES' in hotel_dto, 'hotel allotment DTO must use the shared status contract'
for update_description in [
    'Không gửi contacts thì giữ nguyên danh sách liên hệ; gửi contacts thì thay toàn bộ danh sách liên hệ.',
    'Không gửi services thì giữ nguyên danh sách dịch vụ; gửi services thì thay toàn bộ danh sách dịch vụ khách sạn.',
    'Không gửi allotments thì giữ nguyên quỹ phòng; gửi allotments thì thay toàn bộ quỹ phòng và bị chặn nếu còn phân bổ đang khóa hoặc đã xác nhận.',
]:
    assert update_description in hotel_dto, f'UpdateHotelSupplierDto must document nested array snapshot contract: {update_description}'
for dto_message in [
    'Cần nhập tên quỹ phòng',
    'Tên quỹ phòng không được vượt quá 180 ký tự',
    'Ngày bắt đầu quỹ phòng phải có định dạng YYYY-MM-DD',
    'Ngày kết thúc quỹ phòng phải có định dạng YYYY-MM-DD',
    'Số ngày chốt quỹ phòng không được vượt quá 365 ngày',
    'Giá thuần mỗi ngày không được vượt quá 999.999.999.999',
    'Giá bán mỗi ngày không được vượt quá 999.999.999.999',
]:
    assert dto_message in hotel_dto, f'hotel allotment DTO validation must be Vietnamese and bounded: {dto_message}'
assert '@Max(5, { message: \'Xếp hạng khách sạn không được lớn hơn 5\' })' in hotel_dto, 'hotel rating must use a 0-5 scale'
assert '@Transform(trimOptional)\n  @Matches' in hotel_dto and '@IsDateString' in hotel_dto, 'optional hotel child dates must trim blanks, enforce YYYY-MM-DD, and validate calendar dates'
assert 'private optionalUrlText(' in service and 'http:// hoặc https://' in service, 'service must validate optional hotel URLs consistently'
assert 'private optionalHotelBuiltYear(' in service and 'MIN_HOTEL_BUILT_YEAR' in service, 'service must validate hotel built year range'
assert 'private optionalRating(' in service and 'MAX_SUPPLIER_RATING = 5' in service, 'service must validate supplier rating range'
assert 'private optionalPhoneText(' in service and 'SUPPLIER_PHONE_MAX_LENGTH = 30' in service, 'service must validate contact phone format and length'
assert 'private optionalEmailText(' in service and 'không được vượt quá 180 ký tự' in service, 'service must validate contact email format and length'
assert 'Họ tên ${row} phải có ít nhất 2 ký tự' in service, 'service must validate contact fullName length outside the global pipe'
assert 'position: this.optionalMaxText(item.position' in service, 'service must validate contact position length'
assert 'private optionalSku(' in service and 'MAX_SUPPLIER_SERVICE_SKU_LENGTH = 80' in service, 'service must normalize and bound service sku'
assert 'private requiredServiceName(' in service and 'MAX_SUPPLIER_SERVICE_NAME_LENGTH = 180' in service, 'service must validate service name consistently'
assert 'MAX_SUPPLIER_ALLOTMENT_NAME_LENGTH = 180' in service and 'private requiredAllotmentName(' in service, 'service must validate hotel allotment names consistently'
assert 'MAX_SUPPLIER_ALLOTMENT_CUTOFF_DAYS = 365' in service and 'private optionalCutoffDays(' in service, 'service must bound hotel allotment cutoff days'
assert 'SUPPLIER_ALLOTMENT_STATUSES' in service and 'private toAllotmentStatus(value?: unknown): SupplierAllotmentStatus' in service, 'service must use the shared fixed allotment status contract'
assert "this.toDayType(item.dayType, 'quỹ phòng')" in service, 'hotel allotments must use the shared dayType enum with allotment-specific errors'
assert 'Số phòng đang giữ và số lượng khóa phòng phải trùng nhau khi gửi cùng lúc' in service, 'service must reject conflicting lockedQty and quantityLock values'
assert 'private ensureNoOverlappingAllotments(' in service and 'Khoảng ngày quỹ phòng bị chồng nhau giữa dòng' in service, 'hotel allotment snapshots must reject overlapping date ranges'
assert 'private dayTypesOverlap(' in service and 'SupplierDayType.ALL_DAYS' in service, 'allotment overlap validation must account for all-days versus weekday/weekend rows'
assert 'data: { ...next, quantityLock: next.lockedQty }' in service, 'override must keep quantityLock synchronized with lockedQty'
assert 'SET "quantityLock" = "lockedQty"' in service, 'allocation transitions must resync quantityLock from lockedQty'
assert 'private optionalMoney(' in service and 'MAX_SUPPLIER_MONEY = 999_999_999_999' in service, 'service must bound supplier service prices'
assert 'private ensureUniqueServiceSkus(' in service and 'Mã dịch vụ không được trùng trong cùng nhà cung cấp' in service, 'service must reject duplicate service sku values in one payload'
assert "description: this.optionalMaxText(item.description, `Mô tả ${row}`, 2000)" in service, 'service must limit service description size'
assert "note: this.optionalMaxText(item.note, `Ghi chú ${row}`, 2000)" in service, 'service must limit service note size'
assert "Ngày bắt đầu ${subject} không được sau ngày kết thúc ${subject}" in service, 'service must validate startDate <= endDate'
for english in ['Hotel supplier not found', 'Allotment not found', 'Booked plus locked quantity cannot exceed allotment quantity']:
    assert english.lower() not in (service + hotel_dto).lower(), f'English hotel/allotment message remains: {english}'

for field in ['search', 'status', 'province', 'market', 'hotelProject', 'classHotel']:
    assert field in frontend, f'hotel frontend filter missing {field}'
assert "const hotelListQueryKeys = ['search', 'status', 'province', 'market', 'hotelProject', 'classHotel'] as const" in frontend, 'hotel list frontend must whitelist backend query keys'
assert 'function validateHotelFilters(filters: Filters)' in frontend and 'Từ khóa tìm kiếm' in frontend and 'không được vượt quá ${maxLength.toLocaleString' in frontend, 'hotel list filters must validate backend query limits before request'
assert 'function buildHotelListSearchParams(filters: Filters)' in frontend and 'hotelListQueryKeys.forEach' in frontend, 'hotel list must build query params from the backend contract keys'
assert 'maxLength={hotelFilterMaxLengths.search}' in frontend and 'maxLength={hotelFilterMaxLengths.classHotel}' in frontend, 'hotel list filters must expose backend length limits in inputs'
assert 'Tìm mã, tên, số điện thoại, email, dự án hoặc hạng khách sạn' in frontend, 'hotel list search placeholder must describe searchable fields clearly'
assert 'Chưa tìm thấy nhà cung cấp khách sạn phù hợp.' in frontend and 'Hãy điều chỉnh từ khóa hoặc bộ lọc' in frontend, 'hotel list empty state must guide next action'
assert 'Không tải được danh sách nhà cung cấp khách sạn.' in frontend and 'listError' in frontend, 'hotel list error state must show API detail inline'
for localized_text in [
    'Tỉnh/thành',
    'Thị trường',
    'Dự án khách sạn',
    'Hạng khách sạn',
    'Ví dụ: Hà Nội',
    'Ví dụ: Nội địa',
    'Dòng sản phẩm hoặc dự án',
    'Ví dụ: 4 sao',
    'Ghi chú chính sách, công nợ hoặc lưu ý vận hành',
    'Chưa có file đính kèm.',
    'File sẽ được tải lên sau khi nhà cung cấp được tạo thành công.',
    'Chọn file đính kèm',
    'Mỗi file tối đa 10 MB',
    'Quỹ phòng được quản lý riêng',
    'Số ngày chốt quỹ',
    'Giữ chỗ quỹ phòng',
]:
    assert localized_text in (frontend + supplier_ui), f'hotel supplier UI text must be Vietnamese and fully accented: {localized_text}'
for stale_text in [
    'NCC',
    'Tinh/thanh',
    'Thi truong',
    'Du an khach san',
    'Hang khach san',
    'Ghi chu chinh sach',
    'Chon file can tai len',
    'Quy phong',
    'Giu cho',
]:
    assert stale_text not in (frontend + supplier_ui), f'hotel supplier UI still contains non-localized text: {stale_text}'
assert 'function HotelListLoadingRows()' in frontend and 'tableSkeletonLine' in frontend, 'hotel list loading state must use skeleton rows'
assert 'function shouldSendCollection(' in frontend and "dirtyFields[name] !== undefined" in frontend, 'hotel edit should only send dirty child collection snapshots'
assert "hotelSupplierPayload(values, editingId ? 'update' : 'create', dirtyFields as DirtyCollections, canViewSupplierFinancialFields)" in frontend, 'hotel frontend must centralize create/update payload shaping'
assert 'const { contacts, services, allotments, taxCode, bankAccountName, bankAccountNumber, bankName, ...baseValues } = values' in frontend and '...baseValues' in frontend, 'hotel edit payload must remove child arrays and gated financial fields from the base payload before applying dirty collection rules'
assert '...values,\n    builtYear:' not in frontend, 'hotel edit payload must not spread all form values because that would send untouched child arrays'
assert "mode === 'create' ? { allotments:" in frontend, 'hotel edit payload must omit allotments because allotments are managed separately'
assert 'values.allotments.filter(hasAllotmentRowData).map(syncAllotmentRow)' not in frontend, 'hotel frontend must not send legacy quantityLock in create payload'
assert 'getRowId: (row) => row.id' in frontend, 'hotel dynamic child rows must use react-hook-form field ids as stable row keys'
assert 'createFieldArrayRow(emptyRow)' in frontend, 'hotel dynamic child rows must append cloned default rows'
assert "column.key === 'dayType'" in frontend and "column.key === 'status'" in frontend, 'hotel dynamic select inputs must distinguish dayType from allotment status'
assert "{ key: 'phone', label: 'Điện thoại', type: 'tel' }" in frontend and "{ key: 'email', label: 'Email', type: 'email' }" in frontend, 'hotel contact rows must use phone/email input types'
assert "{ key: 'note', label: 'Ghi chú', type: 'textarea' }" in frontend, 'hotel child row notes must use textarea inputs'
assert 'Quỹ phòng được quản lý riêng' in frontend
for required_field in [
    '<label>Mã nhà cung cấp<input required',
    '<label>Tên khách sạn<input required',
    '<label>Số điện thoại<input required',
    '<label>Hạng khách sạn<input required',
    '<label>Dòng sản phẩm / dự án<input required',
]:
    assert required_field in frontend, f'hotel frontend must use native required field: {required_field}'
for legacy_required_label in ['Mã nhà cung cấp *', 'Tên khách sạn *', 'Số điện thoại *', 'Hạng khách sạn *', 'Dòng sản phẩm / dự án *']:
    assert legacy_required_label not in frontend, f'hotel frontend must use shared required indicator instead of manual star: {legacy_required_label}'
assert 'const supplierPhonePattern = ' in frontend and 'requiredPhone' in frontend, 'hotel frontend must validate phone by business pattern'
assert "min(1, 'Cần nhập mã nhà cung cấp')" in frontend, 'hotel frontend must show a clear required supplier code message'
assert "min(1, 'Cần nhập tên khách sạn')" in frontend, 'hotel frontend must show a clear required hotel name message'
assert "min(1, 'Cần nhập số điện thoại nhà cung cấp')" in frontend, 'hotel frontend must show a clear required phone message'
assert "min(1, 'Cần chọn hoặc nhập hạng khách sạn')" in frontend, 'hotel frontend must show a clear required hotel class message'
assert "min(1, 'Cần nhập dòng sản phẩm hoặc dự án khách sạn')" in frontend, 'hotel frontend must show a clear required hotel project message'
assert 'const optionalUrl = ' in frontend and 'type="url"' in frontend, 'hotel frontend must validate optional website/link URLs'
assert 'const optionalText = ' in frontend and 'Ghi chú nội bộ không được vượt quá' in frontend, 'hotel frontend must trim and bound optional text fields'
assert 'max={currentYear}' in frontend and 'max(5' in frontend, 'hotel frontend must show year/rating bounds'
assert 'const isOptionalDateOnly = ' in frontend and 'Ngày sinh người liên hệ không hợp lệ' in frontend, 'hotel frontend must validate contact birthday'
assert 'function dateOnly(value?: unknown)' in frontend and 'getUTCFullYear()' in frontend, 'hotel frontend must normalize Date values without local timezone drift'
assert "return dateOnlyMatch && isOptionalDateOnly(dateOnlyMatch[1]) ? dateOnlyMatch[1] : ''" in frontend, 'hotel frontend must reject ambiguous non-date-only strings'
assert "const hotelProfile = (hotel.hotelProfile || {}) as NonNullable<HotelSupplier['hotelProfile']>" in frontend, 'hotel form mapping must tolerate missing hotel profiles'
assert "Array.isArray(hotel.contacts) && hotel.contacts.length" in frontend, 'hotel form mapping must handle empty or missing contact collections'
assert "Array.isArray(hotel.supplierServices) && hotel.supplierServices.length" in frontend, 'hotel form mapping must handle empty or missing service collections'
assert "Array.isArray(hotel.allotments) && hotel.allotments.length" in frontend, 'hotel form mapping must handle empty or missing allotment collections'
assert 'setHotels([])' in frontend, 'hotel list API failures must clear stale rows'
assert 'function textValue(' in frontend and 'function numberValue(' in frontend and 'function asDayType(' in frontend and 'function asAllotmentStatus(' in frontend, 'hotel frontend must map legacy/null backend values safely'
assert 'Họ tên người liên hệ phải có ít nhất 2 ký tự' in frontend, 'hotel frontend must validate filled contact rows'
assert 'nestedErrorMessages(errors.contacts)' in frontend, 'hotel frontend must surface dynamic contact row errors'
assert 'type InventoryFilters = ' in frontend and 'type AllotmentInventoryLine = ' in frontend, 'hotel frontend must model allotment inventory rows'
assert 'Tồn quỹ phòng theo ngày' in frontend and 'submitInventoryFilters' in frontend, 'hotel frontend must expose an allotment inventory filter panel'
assert 'supplierApi<AllotmentInventoryLine[]>(`/api/suppliers/hotel-allotments/inventory' in frontend, 'hotel frontend must load allotment inventory from backend inventory endpoint'
assert 'type="date" value={inventoryFilters.startDate}' in frontend and 'type="date" value={inventoryFilters.endDate}' in frontend, 'hotel inventory filters must use date-only inputs'
assert 'Ngày bắt đầu tồn quỹ không được sau ngày kết thúc' in frontend, 'hotel inventory UI must validate date range before querying'
assert 'overbookedQty' in frontend and 'Vượt tồn' in frontend and 'inventoryWarningsAttention' in frontend, 'hotel allotment UI must warn on shortage or over-lock'
assert 'Số phòng giữ chỗ không được vượt quá số phòng còn khả dụng' in frontend and 'Chỉ có thể giữ chỗ khi quỹ phòng đang hoạt động' in frontend, 'hotel allotment lock flow must guard invalid quantities and statuses'
assert 'Tổng quỹ phòng không được nhỏ hơn số phòng đã xác nhận và đang giữ' in frontend, 'hotel allotment override must guard totals below used quantity'
assert 'noValidate' in frontend and '<FieldError message={errors.supplierCode?.message}' in frontend and '<FieldError message={errors.phone?.message}' in frontend, 'hotel form must block invalid submit through schema and show field-level errors'
assert 'function FieldError(' in frontend and 'role="alert"' in frontend and 'aria-invalid={Boolean(errors.name)}' in frontend, 'hotel form field errors must be accessible inline'
assert 'errors={errors}' in frontend and 'function rowFieldErrorMessage(' in frontend, 'hotel dynamic rows must show per-cell validation errors'
assert 'Xóa dòng ${index + 1}' in frontend and 'fieldArray.remove(index)' in frontend, 'hotel dynamic rows must confirm before removing contacts/services/allotments'
assert 'freshDefaultValues()' in frontend and 'keepDirty: false' in frontend and 'keepTouched: false' in frontend, 'hotel form reset must avoid stale dirty/touched state between create and edit'
assert 'autosave' not in frontend.lower(), 'hotel form must not autosave while the user is typing'
assert '<Pencil size={15} /> Sửa' in frontend and '<BedDouble size={15} /> Quỹ phòng' in frontend and '<Trash2 size={15} /> Xóa' in frontend, 'hotel list row actions must show consistent icon and Vietnamese text'
assert '<CheckCircle2 size={15} /> Xác nhận' in frontend and '<Undo2 size={15} /> Giải phóng' in frontend, 'hotel allocation actions must show consistent icon and Vietnamese text'
assert '<X size={16} /> Hủy' in frontend and '<Save size={17} />' in frontend, 'hotel modal save/cancel buttons must use consistent icons and text'
assert "title=\"Điều chỉnh\"" in frontend and "title={canLock ? 'Giữ chỗ' : 'Không thể giữ chỗ'}" in frontend, 'hotel allotment action tooltips must be short Vietnamese text'
assert 'const optionalDateOnly = ' in frontend and 'Ngày bắt đầu dịch vụ' in frontend and 'Ngày kết thúc dịch vụ' in frontend, 'hotel frontend must validate service date fields'
assert 'const nonNegativeMoney = ' in frontend and '999.999.999.999' in frontend, 'hotel frontend must bound service prices'
assert 'function hasServiceRowData(' in frontend and 'services.filter(hasServiceRowData)' in frontend, 'hotel frontend must preserve partially filled service rows for validation'
assert 'function hasAllotmentRowData(' in frontend and 'allotments.filter(hasAllotmentRowData)' in frontend, 'hotel frontend must preserve partially filled allotment rows for validation'
assert 'maxSupplierAllotmentCutoffDays = 365' in frontend, 'hotel frontend must mirror the allotment cutoff upper bound'
assert 'Tên hạng phòng *' not in frontend and 'Tên hạng phòng' in frontend and 'Tên quỹ phòng phải có ít nhất 2 ký tự' in frontend, 'hotel frontend must require an allotment name for filled rows without manual required stars'
assert 'Ngày bắt đầu quỹ phòng không được sau ngày kết thúc quỹ phòng' in frontend, 'hotel frontend must validate allotment date ranges'
assert 'quantityLock: z.coerce' not in frontend and 'syncAllotmentRow' not in frontend, 'hotel frontend must use lockedQty as the only editable lock quantity'
assert 'Number(item.allotmentQty || item.quantityLock || 0)' not in frontend, 'hotel frontend must not lose valid zero values when mapping allotment quantities'
assert 'numberValue(item.allotmentQty ?? item.quantityLock)' not in frontend, 'hotel frontend must not treat legacy lock quantity as total allotment'
assert "numberStep: 'any'" in frontend and "numberStep: '1'" in frontend, 'hotel dynamic rows must distinguish decimal money from integer quantities'
assert 'step={column.numberStep' in frontend, 'hotel dynamic row number inputs must use their declared numeric step'
assert 'quantityLock được quy đổi' in frontend, 'hotel inventory must explain the legacy quantityLock compatibility mapping'
assert 'function validatePendingFiles(files: File[])' in frontend, 'hotel file picker must validate files before upload'
assert 'deniedSupplierFileExtensions' in frontend and 'maxSupplierFileBytes' in frontend, 'hotel file picker must reject dangerous or oversized files'
assert '<option value="INACTIVE">Tạm ngừng</option>' not in frontend, 'hotel statuses must use one clear inactive label'
assert "if (!apiBase || apiBase.includes('smarttour-api-1')) return ''" in supplier_ui, 'internal API hosts must use the browser same-origin proxy'
assert 'http://${window.location.hostname}:4000' not in supplier_ui, 'supplier API base must not hard-code an insecure browser port'
assert 'Thứ tự' in frontend and 'Thêm nhà cung cấp khách sạn' in frontend and 'Tạo nhà cung cấp khách sạn' in frontend, 'hotel form labels and actions must be clear Vietnamese text'
assert 'hotelInventoryTable' in globals_css and 'allotmentActionSummary' in globals_css and 'inventoryWarningsAttention' in globals_css, 'hotel inventory UI must have responsive table and warning styles'
assert 'compactActionButton' in globals_css and '.hotelSupplierPage .hotelListTable th:nth-child(6)' in globals_css, 'hotel action buttons must fit the table consistently'
assert '.fieldError' in globals_css and 'input[aria-invalid="true"]' in globals_css, 'hotel field-level validation must be visibly styled'
assert 'cellClamp' in globals_css and 'cellClamp2' in globals_css and 'booking.tourProgram.name' in bookings_page, 'booking/tour list cells must clamp long display text'
assert 'Mã dịch vụ không được trùng trong cùng nhà cung cấp' in frontend, 'hotel frontend must reject duplicate service sku values'
assert 'Tên dịch vụ *' not in frontend and 'Tên dịch vụ' in frontend and 'Tên dịch vụ phải có ít nhất 2 ký tự' in frontend, 'hotel frontend must make serviceName required for filled rows without manual required stars'
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
