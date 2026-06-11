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
    'restaurants': 'Restaurant', 'flights': 'Flight', 'attraction-tickets': 'Attraction Ticket',
    'landtour-suppliers': 'LandTour Supplier', 'water': 'Water', 'transport': 'Transport', 'bus': 'Bus',
    'other': 'Other Cost', 'villas': 'Villa', 'passport': 'Passport Visa', 'guides': 'Tour Guide',
    'series-tickets': 'Series Ticket',
}.items():
    pattern = rf"(?:'{re.escape(route)}'|{re.escape(route)}): '{re.escape(label)}'"
    assert re.search(pattern, types_source), f'missing backend mapping for {route}'
    assert re.search(rf"(?:'{re.escape(route)}'|{re.escape(route)}): \{{", frontend), f'missing frontend config for {route}'

for alias in ["flights: ['Flight Ticket']", "'landtour-suppliers': ['Landtour']", "transport: ['Vehicle']"]:
    assert alias in types_source, f'missing legacy category alias: {alias}'
assert 'supplierTypeCategoryNames(typedRoute)' in service, 'typed list/detail must include canonical and legacy categories'
assert 'SUPPLIER_TYPE_METADATA_FIELDS' in service and 'normalizeTypedMetadata' in service
for key in ['taxPrice', 'departureDate', 'capacity', 'driverPhone', 'bedroomCount', 'dailyRate', 'fullPaymentDeadline']:
    assert key in types_source and key in frontend, f'typed metadata contract missing {key}'

assert 'getSupplierFromRouteKey(routeKey)' in controller
assert 'SUPPLIER_ID_PATTERN.test(routeKey)' in service
assert 'getSupplier(routeKey)' not in controller, 'controller must not ambiguously treat every route key as an id'
assert "throw new NotFoundException(SUPPLIER_ERRORS.unsupportedType)" in service
assert 'this.validateTypedSupplierPayload(typedRoute, dto)' in service
assert 'return this.prisma.supplier.update({ where: { id }, data: { status }, include: this.genericInclude() })' in service
assert 'return this.deleteSupplierRecord(id)' in service
assert 'service.metadata ? (this.normalizeTypedMetadata(type, service.metadata)' not in service
assert 'item.metadata ? (this.normalizeTypedMetadata(type, item.metadata)' in service
assert '@Max(5' in dto and 'Xếp hạng nhà cung cấp không được lớn hơn 5' in dto

english_errors = ['typed supplier not found', 'supplier type not found', 'unsupported supplier type', 'invalid supplier type']
for error in english_errors:
    assert error.lower() not in (service + dto).lower(), f'English typed supplier error remains: {error}'

print('TEST_SUPPLIERS_TYPED_CONTRACT_OK')
PYTEST
