const fs = require('fs');

function read(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

const dto = read('apps/api/src/modules/suppliers/dto/supplier-batch.dto.ts');
const controller = read('apps/api/src/modules/suppliers/suppliers.controller.ts');
const service = read('apps/api/src/modules/suppliers/suppliers.service.ts');
const generic = read('apps/web/app/suppliers/[type]/GenericSupplierClient.tsx');
const hotel = read('apps/web/app/suppliers/hotels/HotelSuppliersClient.tsx');
const shared = read('apps/web/app/suppliers/SupplierClientUi.tsx');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const name of [
  'UpdateGenericSupplierRootDto',
  'UpdateHotelSupplierRootDto',
  'SupplierBatchContactDto',
  'SupplierBatchGenericServiceDto',
  'SupplierBatchHotelServiceDto',
  'SupplierBatchAllotmentDto',
  'UpdateGenericSupplierBatchDto',
  'UpdateHotelSupplierBatchDto',
]) assert(dto.includes(`export class ${name}`), `missing ${name}`);

assert(dto.includes("@IsUUID('4'"), 'batch row ids must be UUID v4');
assert(/OmitType\(\s*UpdateGenericSupplierDto,\s*\['contacts', 'services'\]/.test(dto), 'generic root must omit children');
assert(/OmitType\(\s*UpdateHotelSupplierDto,\s*\['contacts', 'services', 'allotments'\]/.test(dto), 'hotel root must omit children');

const hotelRoute = controller.indexOf("@Put('hotels/:id/batch')");
const typedRoute = controller.indexOf("@Put(':type/:id/batch')");
assert(hotelRoute !== -1 && typedRoute !== -1, 'missing supplier batch routes');
assert(hotelRoute < controller.indexOf("@Put('hotels/:id')"), 'hotel batch route must precede hotel parent update');
assert(typedRoute < controller.indexOf("@Put(':type/:id')"), 'typed batch route must precede typed parent update');
assert(controller.slice(hotelRoute, hotelRoute + 500).includes("@RequirePermissions('supplier.manage')"), 'hotel batch must require supplier.manage');
assert(controller.slice(typedRoute, typedRoute + 500).includes("@RequirePermissions('supplier.manage')"), 'typed batch must require supplier.manage');

assert(service.includes('async updateTypedSupplierBatch('), 'missing typed batch service');
assert(service.includes('async updateHotelSupplierBatch('), 'missing hotel batch service');
assert(service.includes('syncSupplierContactsSnapshot('), 'missing contact snapshot sync');
assert(service.includes('syncSupplierServicesSnapshot('), 'missing service snapshot sync');
assert(service.includes('syncSupplierAllotmentsSnapshot('), 'missing allotment snapshot sync');

assert(generic.includes('/batch`'), 'generic edit must use batch endpoint');
assert(hotel.includes('/batch`'), 'hotel edit must use batch endpoint');
for (const helper of ['syncSupplierContacts', 'syncSupplierServices', 'syncSupplierAllotments']) {
  assert(!shared.includes(`export function ${helper}`), `${helper} must not orchestrate form saves`);
}

console.log('TEST_SUPPLIERS_ATOMIC_BATCH_CONTRACT_OK');
