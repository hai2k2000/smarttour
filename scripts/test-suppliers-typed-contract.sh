#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
import re
from pathlib import Path

controller = Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text()
service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
types_source = Path('apps/api/src/modules/suppliers/supplier-types.ts').read_text()
dto = Path('apps/api/src/modules/suppliers/dto/generic-supplier.dto.ts').read_text()
frontend = Path('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx').read_text()
query_dto = Path('apps/api/src/modules/suppliers/dto/supplier-query.dto.ts').read_text()
schema = Path('prisma/schema.prisma').read_text()

expected_routes = {
    'restaurants', 'flights', 'attraction-tickets', 'landtour-suppliers', 'water', 'transport',
    'bus', 'other', 'villas', 'passport', 'guides', 'series-tickets', 'vouchers',
}
backend_routes = set(re.findall(r"^  (?:'([^']+)'|([a-z][a-z-]*)): '[^']+',?$", types_source.split('export type TypedSupplierRoute')[0], re.M))
backend_routes = {quoted or plain for quoted, plain in backend_routes}
frontend_routes = set(re.findall(r"^  \| '([^']+)'", frontend, re.M))
assert backend_routes == expected_routes, f'backend typed routes differ: {backend_routes}'
assert frontend_routes == expected_routes, f'frontend typed routes differ: {frontend_routes}'

for route, label in {
    'restaurants': 'Nhà hàng', 'flights': 'Vé máy bay', 'attraction-tickets': 'Vé tham quan',
    'landtour-suppliers': 'Landtour', 'water': 'Nước suối', 'transport': 'Vận chuyển', 'bus': 'Nhà xe',
    'other': 'Chi phí khác', 'villas': 'Biệt thự', 'passport': 'Visa và hộ chiếu', 'guides': 'Hướng dẫn viên',
    'series-tickets': 'Vé series', 'vouchers': 'Vouchers',
}.items():
    pattern = rf"(?:'{re.escape(route)}'|{re.escape(route)}): '{re.escape(label)}'"
    assert re.search(pattern, types_source), f'missing backend mapping for {route}'
    assert re.search(rf"(?:'{re.escape(route)}'|{re.escape(route)}): \{{", frontend), f'missing frontend config for {route}'

for alias in ["restaurants: ['Restaurant']", "flights: ['Flight', 'Flight Ticket']", "'landtour-suppliers': ['Land Tour', 'LandTour Supplier']", "transport: ['Transport', 'Vehicle']"]:
    assert alias in types_source, f'missing legacy category alias: {alias}'
assert 'export function getTypeLabel(type: TypedSupplierRoute)' in types_source, 'typed category labels must be exposed through a helper'
assert 'return [getTypeLabel(type), ...SUPPLIER_TYPE_CATEGORY_ALIASES[type]]' in types_source, 'typed category aliases must use the shared label helper'
assert 'getTypeLabel, isTypedSupplierRoute' in service, 'service must use the shared typed label helper'
assert 'ensureCategoryByName(getTypeLabel(typedRoute))' in service, 'typed create must resolve categories through the shared label helper'
assert 'supplierTypeCategoryNames(typedRoute)' in service, 'typed list/detail must include canonical and legacy categories'
assert 'SUPPLIER_TYPE_METADATA_FIELDS' in service and 'normalizeTypedMetadata' in service
for key in ['taxPrice', 'departureDate', 'capacity', 'driverPhone', 'bedroomCount', 'dailyRate', 'fullPaymentDeadline']:
    assert key in types_source and key in frontend, f'typed metadata contract missing {key}'

for label in [
    "title: 'Nhà cung cấp nhà hàng'",
    "title: 'Nhà cung cấp vé máy bay'",
    "title: 'Nhà cung cấp voucher'",
    "title: 'Nhà cung cấp vé tham quan'",
    "title: 'Nhà cung cấp Landtour'",
    "title: 'Nhà cung cấp vận chuyển'",
    "title: 'Nhà xe tuyến cố định'",
    "title: 'Nhà cung cấp chi phí khác'",
    "title: 'Nhà cung cấp villa, biệt thự'",
    "title: 'Nhà cung cấp visa và hộ chiếu'",
    "title: 'Hướng dẫn viên'",
    "title: 'Series vé giữ chỗ'",
    "title: 'Nhà cung cấp nước suối'",
    "label: 'Sân bay khởi hành'",
    "label: 'Sân bay đến'",
    "label: 'Hạn thanh toán đủ (FullPay)'",
    "label: 'Giá kế toán'",
    "label: 'Giá NET'",
    "label: 'Bao gồm nhiên liệu'",
    "label: 'Có hồ bơi'",
    "label: 'Có khu BBQ'",
    "label: 'Có bếp'",
    "label: 'CCCD'",
    "label: 'Thẻ hướng dẫn viên'",
    "label: 'Ngôn ngữ'",
    "label: 'Khu vực hoạt động'",
    "label: 'Bến đi'",
    "label: 'Bến đến'",
    "label: 'Loại ghế'",
    "label: 'Quốc gia'",
    "label: 'Hồ sơ cần có'",
]:
    assert label in frontend, f'frontend typed supplier label must be fully Vietnamese: {label}'
for stale_label in ['Nha cung cap', 'Huong dan vien', 'Gia KT', 'Gia NET', 'SHCB di', 'SHCB ve', 'Han coc', 'Gom xang', 'Ho boi', 'The HDV', 'Ben di', 'Quoc gia', 'Giá thuần (NET)', 'Số hiệu chuyến bay đi', 'Số hiệu chuyến bay về']:
    assert stale_label not in frontend, f'frontend typed supplier stale label remains: {stale_label}'
assert "id: 'supplier'" in frontend, 'typed supplier list must use supplier name as the first column'
assert "id: 'supplierCode'" not in frontend, 'typed supplier list must not keep a separate supplier-code-first column'
assert 'supplierPrimaryCell' in frontend, 'typed supplier list must keep supplier code only as secondary traceability text'
for table_token in ["id: 'phone'", "id: 'email'", "accessor('province'", "id: 'market'", "id: 'rating'", "id: 'contacts'", "id: 'services'", "accessor('status'"]:
    assert table_token in frontend, f'typed supplier list must expose table token {table_token}'
assert "return `${year}-${month}-${day}`" in frontend, 'typed supplier contact dates must normalize through UTC date parts instead of slicing unsafe values only'
assert 'metadata: metadataRecord(item.metadata)' in frontend, 'typed supplier edit form must preserve service metadata safely'
assert 'function supplierPayload(values: SupplierForm)' in frontend and 'metadataPayload(item.metadata)' in frontend, 'typed supplier form must serialize contacts/services/metadata through a stable payload helper'
assert 'function validatePendingFiles(files: File[])' in frontend and 'allowedUploadMimeTypes' in frontend and 'maxUploadSize' in frontend, 'typed supplier upload picker must validate file type and size before submit'
assert "mode: 'onChange'" in frontend and '!isValid || isSubmitting' in frontend, 'typed supplier submit must be disabled while the form is invalid'
assert "step={column.key === 'quantity' ? '1' : 'any'}" in frontend, 'typed supplier numeric inputs must use integer step only for quantity'

assert 'getSupplierFromRouteKey(routeKey, request.user)' in controller
assert 'SUPPLIER_ID_PATTERN.test(routeKey)' in service
assert 'getSupplier(routeKey)' not in controller, 'controller must not ambiguously treat every route key as an id'
assert "throw new NotFoundException(SUPPLIER_ERRORS.unsupportedType)" in service
assert 'this.validateTypedSupplierPayload(typedRoute, dto)' in service
assert service.count('this.validateSpecializedSupplierIdentity(dto') >= 4, 'typed and hotel create/update must enforce required code and phone in the service layer'
typed_query_block = query_dto.split('export class TypedSupplierListQueryDto', 1)[1].split('export class AllotmentInventoryQueryDto', 1)[0]
assert 'status?: SupplierStatus' in typed_query_block and 'take?: number' in typed_query_block
assert 'MAX_SUPPLIERS_TAKE' in typed_query_block, 'typed supplier query must cap take to avoid unbounded SSR payloads'
assert 'query.status ? { status: query.status } : {}' in service, 'typed supplier status filter must use the shared Supplier status'
typed_list_block = service.split('listTypedSuppliers(type: string, query: TypedSupplierListQueryDto = {}, user?: RequestUser)', 1)[1].split('async getTypedSupplier', 1)[0]
assert 'take: this.listTake(query.take)' in typed_list_block, 'typed supplier list must apply bounded take'
for search_fragment in [
    '{ contactPerson: contains }',
    '{ province: contains }',
    '{ market: contains }',
    '{ contacts: { some: { fullName: contains } } }',
    '{ contacts: { some: { position: contains } } }',
    '{ contacts: { some: { phone: contains } } }',
    '{ contacts: { some: { email: contains } } }',
    '{ supplierServices: { some: { deletedAt: null, serviceName: contains } } }',
    '{ supplierServices: { some: { deletedAt: null, sku: contains } } }',
]:
    assert search_fragment in service, f'typed supplier search must include {search_fragment}'
assert "params.set('status', nextFilters.status)" in frontend, 'frontend typed supplier list must send the same status filter contract'
assert 'private async ensureTypedSupplier(type: TypedSupplierRoute, id: string)' in service
assert 'deletedAt: null' in service and "category: { name: { in: supplierTypeCategoryNames(type), mode: 'insensitive' } }" in service
assert service.count('await this.ensureTypedSupplier(typedRoute, id)') >= 3, 'typed update/status/delete must verify id belongs to the route type'
assert 'return this.prisma.supplier.update({ where: { id }, data: { status: nextStatus }, include: this.genericInclude() })' in service
assert 'this.requestedSupplierStatusChange(current.status, dto.status)' in service, 'typed PUT updates must not bypass supplier status transitions'
assert 'return this.deleteSupplierRecord(id)' in service
assert "tx.supplierService.updateMany({ where: { supplierId, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } })" in service
assert 'tx.supplierService.deleteMany({ where: { supplierId } })' not in service, 'typed child replacement must not hard-delete supplier services'
assert 'service.metadata ? (this.normalizeTypedMetadata(type, service.metadata)' not in service
assert 'item.metadata ? (this.normalizeTypedMetadata(type, item.metadata)' in service
assert '@Max(5' in dto and 'Xếp hạng nhà cung cấp không được lớn hơn 5' in dto
assert 'return trimmed || null' in dto, 'generic supplier optional text fields must clear to null instead of disappearing on partial update'
assert 'const optionalNumber = ({ value }: { value: unknown })' in dto, 'generic supplier optional numbers must keep blank/null distinct from zero'
for numeric_field in ['quantity?: number', 'accountingPrice?: number', 'netPrice?: number', 'sellingPrice?: number', 'rating?: number']:
    before_field = dto.split(numeric_field, 1)[0].rsplit('@ApiPropertyOptional', 1)[-1]
    assert '@Transform(optionalNumber)' in before_field, f'{numeric_field} must use the safe optional number transformer'
assert 'await this.ensureSupplierCodeAvailable(dto.supplierCode)' in service, 'typed create must enforce supplierCode uniqueness'
assert 'await this.ensureSupplierCodeAvailable(dto.supplierCode, id)' in service, 'typed update must enforce supplierCode uniqueness excluding the current row'
for field in ['taxCode', 'phone', 'email']:
    assert f'ensureSupplierCodeAvailable(dto.{field}' not in service, f'{field} must not accidentally reuse supplierCode uniqueness checks'

supplier_service_model = schema.split('model SupplierService {', 1)[1].split('\n}', 1)[0]
supplier_model = schema.split('model Supplier {', 1)[1].split('\n}', 1)[0]
assert 'supplierCode         String?                @unique' in supplier_model, 'Supplier.supplierCode must remain the unique typed supplier identity'
for field in ['taxCode', 'phone', 'email']:
    field_line = next(line for line in supplier_model.splitlines() if line.strip().startswith(field))
    assert '@unique' not in field_line, f'Supplier.{field} must not be treated as globally unique unless product policy changes'
assert 'metadata' in supplier_service_model and 'Json?' in supplier_service_model, 'typed fields must use shared supplier-service metadata'
for model in ['RestaurantSupplier', 'FlightSupplier', 'TransportSupplier', 'GuideSupplier', 'VillaSupplier']:
    assert f'model {model} ' not in schema, f'{model} must not split typed suppliers into duplicate lifecycle tables'
assert 'const supplier = await tx.supplier.create' in service, 'typed suppliers must use the shared Supplier table'
assert 'return this.deleteSupplierRecord(id)' in service, 'typed suppliers must use the shared delete guard'

english_errors = ['typed supplier not found', 'supplier type not found', 'unsupported supplier type', 'invalid supplier type']
for error in english_errors:
    assert error.lower() not in (service + dto).lower(), f'English typed supplier error remains: {error}'

print('TEST_SUPPLIERS_TYPED_CONTRACT_OK')
PYTEST
