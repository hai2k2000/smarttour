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
assert 'ensureSupplierCodeAvailable(dto.supplierCode)' in service
assert 'return code ? code.toUpperCase() : null' in service, 'supplier codes must be normalized before persistence'
assert "dto.categoryId !== undefined" in service and "dto.name !== undefined" in service, 'partial updates must only write supplied fields'
assert "dto.pricePolicy !== undefined" in service and "dto.debtNote !== undefined" in service
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

print('TEST_SUPPLIERS_COMMON_CONTRACT_OK')
PYTEST
