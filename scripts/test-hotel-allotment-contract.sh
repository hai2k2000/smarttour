#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PYTEST'
from pathlib import Path

service = Path('apps/api/src/modules/suppliers/suppliers.service.ts').read_text()
controller = Path('apps/api/src/modules/suppliers/suppliers.controller.ts').read_text()
dto = Path('apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts').read_text()
query_dto = Path('apps/api/src/modules/suppliers/dto/supplier-query.dto.ts').read_text()

for field in ['hotelProject', 'classHotel', 'market']:
    assert f'{{ hotelProfile: {{ is: {{ {field}: contains }} }} }}' in service, f'hotel search must include {field}'
assert '{ province: contains }' in service, 'hotel search must include province'
assert 'include: this.hotelListInclude()' in service, 'hotel list must return the frontend edit shape'
assert "status: { in: ['ACTIVE', 'STOP_SELL'] }" in service, 'dashboard must include sellable and stop-sell inventory'
assert 'select: {' in service[service.index('async allotmentDashboard'):service.index('async listAllotmentInventory')], 'dashboard must use a projection'
assert "item.status === 'ACTIVE' && remainingQty > 0" in service, 'dashboard active and stop-sell counts must not overlap'
assert 'supplier: { is: { deletedAt: null } }' in service, 'inventory must omit deleted suppliers'
assert 'this.parseDateOnly(query.startDate' in service and 'this.parseDateOnly(query.endDate' in service
assert r"@Matches(/^\d{4}-\d{2}-\d{2}$/" in query_dto, 'inventory query must require date-only values'
assert dto.count("@IsUUID('4'") >= 4, 'allocation links must be validated UUIDs'
override_section = dto[dto.index('export class OverrideAllotmentDto'):dto.index('export class LockAllotmentDto')]
assert '@ApiProperty()' in override_section and 'note!: string' in override_section, 'override reason must be required'
assert 'overrideAllotment(id, dto, request.user)' in controller, 'override audit must receive authenticated user'
assert 'FOR UPDATE' in service, 'override must lock the allotment row'
assert 'UPDATE "SupplierAllotment"' in service and '"bookedQty" + "lockedQty" + ${quantity}' in service, 'lock must reserve inventory atomically'
assert "status: 'LOCKED'" in service and 'supplierAllotmentAllocation.updateMany' in service, 'allocation transitions must use compare-and-set updates'
assert 'idempotent: true' in service and 'idempotent: false' in service, 'repeat transition result must be explicit'
assert "status: { in: ['LOCKED', 'CONFIRMED'] }" in service, 'active allocations must protect inventory replacement and overrides'
assert 'allocationSummary' in service and 'activeAllocationCount' in service, 'inventory response must expose allocation summaries'
assert 'return this.allotmentInventoryById(tx, updated.id, user)' in service, 'override response must include the newly written audit log with user scope'
assert "const computedStatus = item.status === 'STOP_SELL'" in service and "? 'STOP_SELL'" in service and "!isSellable" in service, 'explicit stop-sell and sold-out inventory must take priority over computed cutoff status'
assert "if (/^\\d{4}-\\d{2}-\\d{2}$/.test(text)) return this.parseDateOnly(text, fieldName)" in service, 'hotel child date-only values must be calendar validated'
assert 'allotmentInventory(@Query() query: AllotmentInventoryQueryDto, @Req() request: { user?: RequestUser })' in controller, 'inventory endpoint must receive authenticated user for allocation scope filtering'
assert 'return this.suppliersService.listAllotmentInventory(query, request.user)' in controller, 'inventory endpoint must pass user scope to service'
assert 'async listAllotmentInventory(query: { supplierId?: string; startDate?: string; endDate?: string }, user?: RequestUser)' in service, 'inventory service must accept user scope'
assert "allocations: { where: this.allotmentAllocationScopeWhere({}, user), orderBy: { createdAt: 'desc' } }" in service, 'inventory must filter allocation details by user data scope'
assert 'private async allotmentInventoryById(tx: Prisma.TransactionClient, id: string, user?: RequestUser)' in service, 'single inventory reload must accept user scope'
assert 'this.allotmentInventoryById(tx, allocation.allotmentId, user)' in service, 'allocation transition responses must not leak out-of-scope allocation details'
actor = "return this.optionalText(user?.id) || this.optionalText(user?.email) || this.optionalText(user?.username) || this.optionalText(dtoActor) || null;"
assert actor in service, 'authenticated actor must take precedence over payload actor'

print('TEST_HOTEL_ALLOTMENT_CONTRACT_OK')
PYTEST
