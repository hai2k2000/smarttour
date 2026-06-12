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
    'bus', 'other', 'villas', 'passport', 'guides', 'series-tickets',
}
backend_routes = set(re.findall(r"^  (?:'([^']+)'|([a-z][a-z-]*)): '[^']+',?$", types_source.split('export type TypedSupplierRoute')[0], re.M))
backend_routes = {quoted or plain for quoted, plain in backend_routes}
frontend_routes = set(re.findall(r"^  \| '([^']+)'", frontend, re.M))
assert backend_routes == expected_routes, f'backend typed routes differ: {backend_routes}'
assert frontend_routes == expected_routes, f'frontend typed routes differ: {frontend_routes}'

for route, label in {
    'restaurants': 'Nhà hàng', 'flights': 'Vé máy bay', 'attraction-tickets': 'Vé tham quan',
    'landtour-suppliers': 'Land Tour', 'water': 'Nước uống', 'transport': 'Vận chuyển', 'bus': 'Nhà xe',
    'other': 'Chi phí khác', 'villas': 'Biệt thự', 'passport': 'Visa và hộ chiếu', 'guides': 'Hướng dẫn viên',
    'series-tickets': 'Vé series',
}.items():
    pattern = rf"(?:'{re.escape(route)}'|{re.escape(route)}): '{re.escape(label)}'"
    assert re.search(pattern, types_source), f'missing backend mapping for {route}'
    assert re.search(rf"(?:'{re.escape(route)}'|{re.escape(route)}): \{{", frontend), f'missing frontend config for {route}'

for alias in ["restaurants: ['Restaurant']", "flights: ['Flight', 'Flight Ticket']", "'landtour-suppliers': ['LandTour Supplier', 'Landtour']", "transport: ['Transport', 'Vehicle']"]:
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
    "title: 'Nhà cung cấp vé tham quan'",
    "title: 'Nhà cung cấp Landtour'",
    "title: 'Nhà cung cấp vận chuyển'",
    "title: 'Nhà xe tuyến cố định'",
    "title: 'Nhà cung cấp chi phí khác'",
    "title: 'Nhà cung cấp villa / biệt thự'",
    "title: 'Nhà cung cấp visa và hộ chiếu'",
    "title: 'Hướng dẫn viên'",
    "title: 'Series vé giữ chỗ'",
    "label: 'Số hiệu chuyến bay đi'",
    "label: 'Số hiệu chuyến bay về'",
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
for stale_label in ['Nha cung cap', 'Huong dan vien', 'Gia KT', 'Gia NET', 'SHCB di', 'SHCB ve', 'Han coc', 'Gom xang', 'Ho boi', 'The HDV', 'Ben di', 'Quoc gia', 'Giá thuần (NET)']:
    assert stale_label not in frontend, f'frontend typed supplier stale label remains: {stale_label}'
for table_header in ["header: 'Tỉnh/thành'", "header: 'Thị trường'", "header: 'Xếp hạng'", "header: 'Số liên hệ'", "header: 'Số dịch vụ'", "header: 'Trạng thái'"]:
    assert table_header in frontend, f'typed supplier list must expose {table_header}'
assert "return `${year}-${month}-${day}`" in frontend, 'typed supplier contact dates must normalize through UTC date parts instead of slicing unsafe values only'
assert 'metadata: metadataRecord(item.metadata)' in frontend, 'typed supplier edit form must preserve service metadata safely'
assert "step={column.key === 'quantity' ? '1' : 'any'}" in frontend, 'typed supplier numeric inputs must use integer step only for quantity'

assert 'getSupplierFromRouteKey(routeKey)' in controller
assert 'SUPPLIER_ID_PATTERN.test(routeKey)' in service
assert 'getSupplier(routeKey)' not in controller, 'controller must not ambiguously treat every route key as an id'
assert "throw new NotFoundException(SUPPLIER_ERRORS.unsupportedType)" in service
assert 'this.validateTypedSupplierPayload(typedRoute, dto)' in service
assert 'class TypedSupplierListQueryDto' in query_dto and 'status?: SupplierStatus' in query_dto
assert 'query.status ? { status: query.status } : {}' in service, 'typed supplier status filter must use the shared Supplier status'
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
assert 'return this.deleteSupplierRecord(id)' in service
assert "tx.supplierService.updateMany({ where: { supplierId, deletedAt: null }, data: { deletedAt: new Date(), status: 'INACTIVE' } })" in service
assert 'tx.supplierService.deleteMany({ where: { supplierId } })' not in service, 'typed child replacement must not hard-delete supplier services'
assert 'service.metadata ? (this.normalizeTypedMetadata(type, service.metadata)' not in service
assert 'item.metadata ? (this.normalizeTypedMetadata(type, item.metadata)' in service
assert '@Max(5' in dto and 'Xếp hạng nhà cung cấp không được lớn hơn 5' in dto

supplier_service_model = schema.split('model SupplierService {', 1)[1].split('\n}', 1)[0]
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
