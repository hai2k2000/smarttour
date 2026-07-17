const fs = require('node:fs');

const controller = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/suppliers/suppliers.service.ts', 'utf8');
const genericDto = fs.readFileSync('apps/api/src/modules/suppliers/dto/generic-supplier.dto.ts', 'utf8');
const hotelDto = fs.readFileSync('apps/api/src/modules/suppliers/dto/hotel-supplier.dto.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
]) {
  const pattern = new RegExp("@RequirePermissions\\('supplier\\.manage'\\)[\\s\\S]{0,320}?\\n\\s*" + controllerMethod + "\\(");
  assert(pattern.test(controller), `${controllerMethod} must require supplier.manage`);
}

for (const readMethod of ['listSupplierContacts', 'listSupplierServices']) {
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
]) {
  assert(controller.includes(delegation), `controller must pass request.user for ${delegation}`);
}

for (const snippet of [
  'await this.lockSupplierForStatusWrite(tx, supplierId)',
  'where: { id: contactId, supplierId }',
  'where: { id: serviceId, supplierId, deletedAt: null }',
  "data: { deletedAt: new Date(), status: 'INACTIVE' }",
  'return this.rereadSupplierAfterChildWrite(tx, supplierId, locked.hotelProfileId)',
  'private typedRouteForSupplierCategory(categoryName: string | null)',
  'private normalizeChildSupplierService',
  'private async ensureServiceHasNoActiveHotelAllocations',
]) {
  assert(service.includes(snippet), `missing child-row safety snippet: ${snippet}`);
}

assert(genericDto.includes('export class SupplierContactInputDto'), 'generic contact DTO must be exported for child routes');
assert(genericDto.includes('export class GenericSupplierServiceInputDto'), 'generic service DTO must be exported for child routes');
assert(genericDto.includes('export class SupplierChildServiceInputDto'), 'child service DTO must combine generic and hotel service fields');
assert(genericDto.includes('export class UpdateSupplierContactDto extends PartialType(SupplierContactInputDto)'), 'contact update DTO must exist');
assert(genericDto.includes('export class UpdateSupplierChildServiceInputDto extends PartialType(SupplierChildServiceInputDto)'), 'child service update DTO must exist');
assert(hotelDto.includes('export class SupplierContactInputDto'), 'hotel contact DTO must be exported for compatibility');
assert(hotelDto.includes('export class SupplierServiceInputDto'), 'hotel service DTO must be exported for compatibility');
assert(hotelDto.includes('export class UpdateSupplierServiceInputDto extends PartialType(SupplierServiceInputDto)'), 'hotel service update DTO must exist');

console.log('TEST_SUPPLIERS_CHILD_ROW_APIS_CONTRACT_OK');
