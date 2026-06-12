#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

controller = Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text()
service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
query_dto = Path('apps/api/src/modules/suppliers/dto/supplier-query.dto.ts').read_text()
create_dto = Path('apps/api/src/modules/suppliers/dto/create-supplier.dto.ts').read_text()
schema = Path('prisma/schema.prisma').read_text()

supplier_model = schema.split('model Supplier {', 1)[1].split('\n}', 1)[0]
assert 'branch' not in supplier_model and 'department' not in supplier_model, 'supplier catalog must remain global master data'
assert 'Supplier records are global master data' in service
assert 'list(@Query() query: SupplierListQueryDto)' in controller and 'listSuppliers(query)' in controller

assert 'list(@Query() query: SupplierCategoryListQueryDto)' in controller
assert 'list(@Query() query: SupplierListQueryDto)' in controller
for field in ['search?: string', 'categoryId?: string', 'status?: SupplierStatus', 'province?: string', 'market?: string']:
    assert field in query_dto, f'common supplier query is missing {field}'
assert "@IsUUID('4', { message: 'Mã loại nhà cung cấp không hợp lệ' })" in query_dto
assert "@IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })" in query_dto
assert 'includeEmpty?: boolean' in query_dto and '@IsBoolean' in query_dto

assert "suppliers: { some: { deletedAt: null } }" in service, 'category filtering must use active suppliers'
assert "_count: { select: { suppliers: { where: { deletedAt: null } } } }" in service, 'category count must ignore soft-deleted suppliers'
assert "orderBy: { name: 'asc' }" in service, 'categories must have deterministic name ordering'
assert ".normalize('NFD')" in service and ".replace(/đ/gi, 'd')" in service, 'category uniqueness must normalize accents and case'

assert 'supplierCode?: string' in create_dto, 'common supplier payload should accept an optional supplier code'
assert "import { SupplierStatus } from '@prisma/client';" in create_dto
assert "import { Transform, Type } from 'class-transformer';" in create_dto
for field in [
    'taxCode?: string',
    'country?: string',
    'province?: string',
    'website?: string',
    'link?: string',
    'rating?: number',
    'market?: string',
    'bankAccountName?: string',
    'bankAccountNumber?: string',
    'bankName?: string',
    'status?: SupplierStatus',
]:
    assert field in create_dto, f'common supplier DTO is missing whitelisted field {field}'
assert '@Type(() => Number)' in create_dto and 'Xếp hạng nhà cung cấp không được lớn hơn 5' in create_dto
assert "@IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })" in create_dto
assert 'ensureSupplierCodeAvailable(dto.supplierCode)' in service
assert 'return code ? code.toUpperCase() : null' in service, 'supplier codes must be normalized before persistence'
assert "dto.categoryId !== undefined" in service and "dto.name !== undefined" in service, 'partial updates must only write supplied fields'
assert 'const statusChange = this.requestedSupplierStatusChange(current.status, dto.status)' in service, 'common supplier updates must validate inline status changes'
assert 'statusChange === SupplierStatus.INACTIVE && current.hotelProfile' in service, 'generic updates must not bypass hotel allocation deactivation guards'
assert "dto.pricePolicy !== undefined" in service and "dto.debtNote !== undefined" in service
for field in [
    "dto.taxCode !== undefined",
    "dto.country !== undefined",
    "dto.province !== undefined",
    "dto.website !== undefined",
    "dto.link !== undefined",
    "dto.rating !== undefined",
    "dto.market !== undefined",
    "dto.bankAccountName !== undefined",
    "dto.bankAccountNumber !== undefined",
    "dto.bankName !== undefined",
    "dto.status !== undefined",
]:
    assert field in service, f'toSupplierData must only write supplied field {field}'
for field in ['supplierCode', 'name', 'taxCode', 'contactPerson', 'phone', 'email']:
    assert f'{{ {field}: contains }}' in service, f'common supplier search must include {field}'
assert 'deletedAt: null' in service and 'include: this.supplierListInclude()' in service
assert 'category: true' in service and 'supplierServices: { where: { deletedAt: null }' in service
assert "this.prisma.supplierService.count({ where: { supplierId: id, deletedAt: null } })" in service
assert "this.prisma.supplierAllotment.count({ where: { supplierId: id } })" in service
assert "this.prisma.supplierFile.count({ where: { supplierId: id } })" in service
assert "this.prisma.supplierPaymentItem.count({ where: { supplierId: id } })" in service
assert "this.prisma.operationService.count({ where: { supplierId: id } })" in service
assert "['supplierServices', 'dịch vụ nhà cung cấp']" in service
assert "['allotments', 'quỹ phòng']" in service
assert "['files', 'file nhà cung cấp']" in service
assert "['supplierPaymentItems', 'yêu cầu thanh toán']" in service
assert "['operationServices', 'dịch vụ điều hành']" in service
assert 'private optionalLabel' in service and ".replace(/\\s+/g, ' ')" in service
assert 'private requiredBoundedText' in service and 'private optionalMaxLabel' in service, 'service-layer supplier fields must enforce DTO length bounds'
for constant in [
    'MAX_SUPPLIER_CODE_LENGTH',
    'MAX_SUPPLIER_NAME_LENGTH',
    'MAX_SUPPLIER_TAX_CODE_LENGTH',
    'MAX_SUPPLIER_ADDRESS_LENGTH',
    'MAX_SUPPLIER_URL_LENGTH',
    'MAX_SUPPLIER_BANK_ACCOUNT_NUMBER_LENGTH',
    'MAX_SUPPLIER_NOTES_LENGTH',
]:
    assert constant in service, f'service-layer supplier validation is missing {constant}'
assert "this.optionalPhoneText(dto.phone, 'Số điện thoại nhà cung cấp', 40)" in service, 'supplier phone service validation must match the DTO limit'

print('TEST_SUPPLIERS_COMMON_CONTRACT_OK')
PYTEST
