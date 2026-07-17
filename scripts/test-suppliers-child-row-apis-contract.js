const fs = require('node:fs');

const controller = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.service.ts', 'utf8');
const genericDto = fs.readFileSync('apps/api/src/modules/suppliers/dto/generic-supplier.dto.ts', 'utf8');
const hotelDto = fs.readFileSync('apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  assert(startIndex > -1, `missing source block start ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `missing source block end ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertNoMojibake(source, label) {
  const markers = ['MÃ', 'dá»', 'nhÃ', 'quá»', 'phÃ', 'Ä‘', 'Ä', 'KhÃ'];
  const found = markers.filter((marker) => source.includes(marker));
  assert(found.length === 0, `${label} contains mojibake markers: ${found.join(', ')}`);
}

const dynamicRouteIndex = controller.indexOf("@Get(':routeKey')");
assert(dynamicRouteIndex > -1, 'supplier dynamic route dispatcher must exist');

for (const route of [
  "@Get(':id/contacts')",
  "@Post(':id/contacts')",
  "@Put(':id/contacts/:contactId')",
  "@Delete(':id/contacts/:contactId')",
  "@Get(':id/services')",
  "@Post(':id/services')",
  "@Put(':id/services/:serviceId')",
  "@Delete(':id/services/:serviceId')",
  "@Get(':id/allotments')",
  "@Post(':id/allotments')",
  "@Put(':id/allotments/:allotmentId')",
  "@Delete(':id/allotments/:allotmentId')",
]) {
  assert(controller.includes(route), `missing child-row route ${route}`);
  assert(controller.indexOf(route) < dynamicRouteIndex, `${route} must stay before typed dynamic route dispatch`);
}

for (const method of [
  'listSupplierContacts',
  'createSupplierContact',
  'updateSupplierContact',
  'deleteSupplierContact',
  'listSupplierServices',
  'createSupplierService',
  'updateSupplierService',
  'deleteSupplierService',
  'listSupplierAllotments',
  'createSupplierAllotment',
  'updateSupplierAllotment',
  'deleteSupplierAllotment',
]) {
  assert(service.includes(`async ${method}(`), `missing SuppliersService method ${method}`);
}

for (const controllerMethod of [
  'createSupplierContact',
  'updateSupplierContact',
  'deleteSupplierContact',
  'createSupplierService',
  'updateSupplierService',
  'deleteSupplierService',
  'createSupplierAllotment',
  'updateSupplierAllotment',
  'deleteSupplierAllotment',
]) {
  const pattern = new RegExp("@RequirePermissions\\('supplier\\.manage'\\)[\\s\\S]{0,320}?\\n\\s*" + controllerMethod + "\\(");
  assert(pattern.test(controller), `${controllerMethod} must require supplier.manage`);
}

for (const readMethod of ['listSupplierContacts', 'listSupplierServices', 'listSupplierAllotments']) {
  const pattern = new RegExp(`${readMethod}\\(@Param\\('id'\\) id: string, @Req\\(\\) request: \\{ user\\?: RequestUser \\}\\)`);
  assert(pattern.test(controller), `${readMethod} must be a supplier.view read route using the parent controller permission`);
}

for (const delegation of [
  'listSupplierContacts(id, request.user)',
  'createSupplierContact(id, dto, request.user)',
  'updateSupplierContact(id, contactId, dto, request.user)',
  'deleteSupplierContact(id, contactId, request.user)',
  'listSupplierServices(id, request.user)',
  'createSupplierService(id, dto, request.user)',
  'updateSupplierService(id, serviceId, dto, request.user)',
  'deleteSupplierService(id, serviceId, request.user)',
  'listSupplierAllotments(id, request.user)',
  'createSupplierAllotment(id, dto, request.user)',
  'updateSupplierAllotment(id, allotmentId, dto, request.user)',
  'deleteSupplierAllotment(id, allotmentId, request.user)',
]) {
  assert(controller.includes(delegation), `controller must pass request.user for ${delegation}`);
}

for (const snippet of [
  'await this.lockSupplierForStatusWrite(tx, supplierId)',
  'where: { id: contactId, supplierId }',
  'where: { id: serviceId, supplierId, deletedAt: null }',
  'await this.ensureChildServiceSkuAvailable(tx, supplierId, service.sku)',
  'await this.ensureChildServiceSkuAvailable(tx, supplierId, service.sku, serviceId)',
  "data: { deletedAt: new Date(), status: 'INACTIVE' }",
  'await tx.supplierAllotment.updateMany({ where: { supplierId, serviceId }, data: { serviceId: null } })',
  'return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId)',
  'private typedRouteForSupplierCategory(categoryName: string | null)',
  'private normalizeChildSupplierService',
  'this.rejectHotelServiceUnsupportedFields(dto)',
  'private async ensureServiceHasNoActiveHotelAllocations',
  'private async ensureChildServiceSkuAvailable',
  "sku: { equals: sku, mode: 'insensitive' }",
  "id: { not: excludedServiceId }",
  'private rejectHotelServiceUnsupportedFields',
  "['quantity', 'metadata']",
  'await this.lockSupplierForAllotmentWrite(tx, supplierId)',
  'await this.ensureHotelSupplierForChildWrite(tx, supplierId)',
  'await this.lockSupplierAllotmentForWrite(tx, supplierId, allotmentId)',
  'await this.ensureAllotmentHasNoActiveAllocations(tx, allotmentId)',
  'await this.ensureAllotmentServiceBelongsToSupplier(tx, supplierId, allotment.serviceId)',
  'await this.ensureNoOverlappingAllotmentsForSupplier(tx, supplierId, allotment)',
  'await this.ensureNoOverlappingAllotmentsForSupplier(tx, supplierId, allotment, allotmentId)',
  'private async lockSupplierAllotmentForWrite',
  'FOR UPDATE',
  'private async ensureAllotmentHasNoActiveAllocations',
  "where: { allotmentId, status: { in: ['LOCKED', 'CONFIRMED'] } }",
  'private async ensureNoOverlappingAllotmentsForSupplier',
  'private mergeSupplierAllotmentRow',
]) {
  assert(service.includes(snippet), `missing child-row safety snippet: ${snippet}`);
}

const lockAllotmentMatch = service.match(/async lockAllotment\([\s\S]*?\n  async confirmAllotmentAllocation\(/);
assert(lockAllotmentMatch, 'lockAllotment method must exist before allocation confirmation');
const lockAllotmentBody = lockAllotmentMatch[0];
for (const snippet of [
  'const allotmentPointer = await tx.supplierAllotment.findUnique({ where: { id }, select: { supplierId: true } })',
  'await this.lockSupplierForAllotmentWrite(tx, allotmentPointer.supplierId)',
  'const current = await tx.supplierAllotment.findUnique({ where: { id } })',
]) {
  assert(lockAllotmentBody.includes(snippet), `lockAllotment must avoid stale allotment reads: ${snippet}`);
}
assert(
  lockAllotmentBody.indexOf('await this.lockSupplierForAllotmentWrite(tx, allotmentPointer.supplierId)')
    < lockAllotmentBody.indexOf('const current = await tx.supplierAllotment.findUnique({ where: { id } })'),
  'lockAllotment must re-read allotment after locking the parent supplier',
);

assert(genericDto.includes('export class SupplierContactInputDto'), 'generic contact DTO must be exported for child routes');
assert(genericDto.includes('export class GenericSupplierServiceInputDto'), 'generic service DTO must be exported for child routes');
assert(genericDto.includes('export class SupplierChildServiceInputDto'), 'child service DTO must combine generic and hotel service fields');
assert(genericDto.includes('export class UpdateSupplierContactDto extends PartialType(SupplierContactInputDto)'), 'contact update DTO must exist');
assert(genericDto.includes('export class UpdateSupplierChildServiceInputDto extends PartialType(SupplierChildServiceInputDto)'), 'child service update DTO must exist');
assert(hotelDto.includes('export class SupplierContactInputDto'), 'hotel contact DTO must be exported for compatibility');
assert(hotelDto.includes('export class SupplierServiceInputDto'), 'hotel service DTO must be exported for compatibility');
assert(hotelDto.includes('export class SupplierAllotmentInputDto'), 'hotel allotment DTO must be exported for child routes');
assert(hotelDto.includes('export class UpdateSupplierServiceInputDto extends PartialType(SupplierServiceInputDto)'), 'hotel service update DTO must exist');
assert(hotelDto.includes('export class UpdateSupplierAllotmentInputDto extends PartialType(SupplierAllotmentInputDto)'), 'hotel allotment update DTO must exist');
const allotmentDtoBlock = sourceBlock(hotelDto, 'export class SupplierAllotmentInputDto', 'export class UpdateSupplierAllotmentInputDto');
assert(allotmentDtoBlock.includes("serviceId?: string"), 'hotel allotment child DTO must support optional serviceId linking');
assert(
  /@Transform\(trimOptional\)[\s\S]{0,160}@IsUUID\('4', \{ message: 'Mã dịch vụ nhà cung cấp không hợp lệ' \}\)[\s\S]{0,80}serviceId\?: string/.test(allotmentDtoBlock),
  'hotel allotment serviceId must trim optional input before UUID validation',
);
assert(allotmentDtoBlock.includes("@IsUUID('4', { message: 'Mã dịch vụ nhà cung cấp không hợp lệ' })"), 'hotel allotment serviceId must be UUID validated');
assertNoMojibake(allotmentDtoBlock, 'SupplierAllotmentInputDto');
for (const [start, end, label] of [
  ['private async ensureAllotmentHasNoActiveAllocations', 'private async ensureAllotmentServiceBelongsToSupplier', 'ensureAllotmentHasNoActiveAllocations'],
  ['private async ensureAllotmentServiceBelongsToSupplier', 'private async ensureNoOverlappingAllotmentsForSupplier', 'ensureAllotmentServiceBelongsToSupplier'],
  ['private async ensureNoOverlappingAllotmentsForSupplier', 'private async ensureHotelSupplierCanDeactivate', 'ensureNoOverlappingAllotmentsForSupplier'],
]) {
  assertNoMojibake(sourceBlock(service, start, end), label);
}

console.log('TEST_SUPPLIERS_CHILD_ROW_APIS_CONTRACT_OK');
