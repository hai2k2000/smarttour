# Orders Hotel Service Selectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Orders-owned hotel supplier/room-service choices, enforce supplier/service ownership, and align the Hotel Booking five-step form without changing the database schema.

**Architecture:** Add a minimal static Orders endpoint for active hotel options and a transaction helper that validates new/changed supplier-service links while preserving unchanged historical links. Extend the shared Orders form only for `hotel-bookings`, using the existing sales and operation arrays, dependent selectors, price auto-fill, and advisory allotment availability.

**Tech Stack:** TypeScript, NestJS, Prisma, Next.js App Router, React Hook Form, TanStack Table, source-contract scripts, Docker Compose.

---

## File Map

- Create `apps/api/src/modules/orders/order-hotel-service-options.ts`: minimal active hotel/service/allotment projection.
- Create `apps/api/src/modules/orders/order-supplier-service-links.ts`: transactional ownership and active-state validation.
- Modify `apps/api/src/modules/orders/orders.controller.ts`: static options route before dynamic routes.
- Modify `apps/api/src/modules/orders/orders.service.ts`: expose options and validate Hotel Booking writes.
- Create `scripts/test-orders-hotel-service-selectors-backend-contract.js`: backend source contract.
- Modify `scripts/test-order-service-flows.sh`: runtime ownership and historical-link coverage.
- Modify `apps/web/app/orders/[type]/page.tsx`: server-load options only for Hotel Booking.
- Modify `apps/web/app/orders/[type]/OrdersClient.tsx`: Hotel Booking step mapping, dependent selectors, price fill, historical option merge, and availability hint.
- Modify `apps/web/app/globals.css`: dense selector and availability styles.
- Create `scripts/test-orders-hotel-service-selectors-client-contract.js`: web source contract.
- Modify `.github/workflows/smarttour-ci.yml` and `scripts/test-github-actions-contract.js`: CI wiring.
- Modify `memory-bank/activeContext.md` and `memory-bank/progress.md`: completion and deploy evidence.

### Task 1: Orders-Owned Hotel Options Endpoint

**Files:**
- Create: `scripts/test-orders-hotel-service-selectors-backend-contract.js`
- Create: `apps/api/src/modules/orders/order-hotel-service-options.ts`
- Modify: `apps/api/src/modules/orders/orders.controller.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`

- [ ] **Step 1: Write the failing backend contract**

Create `scripts/test-orders-hotel-service-selectors-backend-contract.js`:

```js
const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/orders/orders.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/orders/orders.service.ts', 'utf8');
const options = fs.existsSync('apps/api/src/modules/orders/order-hotel-service-options.ts')
  ? fs.readFileSync('apps/api/src/modules/orders/order-hotel-service-options.ts', 'utf8')
  : '';
const links = fs.existsSync('apps/api/src/modules/orders/order-supplier-service-links.ts')
  ? fs.readFileSync('apps/api/src/modules/orders/order-supplier-service-links.ts', 'utf8')
  : '';
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(controller, "@Get('hotel-service-options')", 'Orders must expose a static hotel options route');
requireText(controller, "@RequirePermissions('order.view')", 'hotel options must use Order view permission');
if (controller.indexOf("@Get('hotel-service-options')") > controller.indexOf("@Get(':type')")) failures.push('static hotel options route must precede dynamic Order routes');
requireText(service, 'return listHotelServiceOptions(this.prisma);', 'OrdersService must delegate the hotel options projection');
requireText(options, 'hotelProfile: { isNot: null }', 'options must contain hotel suppliers only');
requireText(options, "status: 'ACTIVE'", 'options must contain active records only');
requireText(options, 'supplierServices:', 'options must include room services');
requireText(options, 'allotments:', 'options must include allotment summaries');
for (const forbidden of ['taxCode', 'bankAccountName', 'bankAccountNumber', 'debtNote', 'contacts', 'files']) {
  if (options.includes(forbidden)) failures.push(`hotel options must not expose ${forbidden}`);
}
requireText(links, 'assertHotelOrderSupplierServiceLinks', 'Hotel Booking writes must have a focused link validator');

if (failures.length) {
  console.error('FAIL_ORDERS_HOTEL_SERVICE_SELECTORS_BACKEND_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_ORDERS_HOTEL_SERVICE_SELECTORS_BACKEND_CONTRACT_OK');
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
node scripts/test-orders-hotel-service-selectors-backend-contract.js
```

Expected: `FAIL_ORDERS_HOTEL_SERVICE_SELECTORS_BACKEND_CONTRACT` because the route/helper files do not exist.

- [ ] **Step 3: Add the minimal projection**

Create `apps/api/src/modules/orders/order-hotel-service-options.ts`:

```ts
import { PrismaService } from '../../database/prisma.service';

export function listHotelServiceOptions(prisma: PrismaService) {
  return prisma.supplier.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      hotelProfile: { isNot: null },
    },
    select: {
      id: true,
      supplierCode: true,
      name: true,
      province: true,
      hotelProfile: { select: { hotelProject: true, classHotel: true } },
      supplierServices: {
        where: { deletedAt: null, status: 'ACTIVE' },
        select: { id: true, sku: true, serviceName: true, netPrice: true, sellingPrice: true, status: true },
        orderBy: [{ serviceName: 'asc' }, { id: 'asc' }],
      },
      allotments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          serviceId: true,
          serviceName: true,
          startDate: true,
          endDate: true,
          dayType: true,
          allotmentQty: true,
          bookedQty: true,
          lockedQty: true,
          cutoffDays: true,
          netCostPerDay: true,
          sellingPricePerDay: true,
          status: true,
        },
        orderBy: [{ startDate: 'asc' }, { serviceName: 'asc' }],
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 200,
  });
}
```

- [ ] **Step 4: Expose the route before `:type`**

Import `listHotelServiceOptions` in `orders.service.ts`, add:

```ts
  hotelServiceOptions() {
    return listHotelServiceOptions(this.prisma);
  }
```

Add this controller method before `@Get(':type')`:

```ts
  @Get('hotel-service-options')
  @RequirePermissions('order.view')
  hotelServiceOptions() {
    return this.ordersService.hotelServiceOptions();
  }
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
node scripts/test-orders-hotel-service-selectors-backend-contract.js
bash scripts/test-orders-ui-auth-contract.sh
npm run lint --workspace @smarttour/api
git diff --check
```

Expected: all exit `0` and the new contract prints its success marker.

Commit:

```bash
git add apps/api/src/modules/orders/order-hotel-service-options.ts apps/api/src/modules/orders/orders.controller.ts apps/api/src/modules/orders/orders.service.ts scripts/test-orders-hotel-service-selectors-backend-contract.js
git commit -m "feat: expose hotel service options for orders"
```

### Task 2: Hotel Supplier-Service Link Integrity

**Files:**
- Create: `apps/api/src/modules/orders/order-supplier-service-links.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `scripts/test-orders-hotel-service-selectors-backend-contract.js`
- Modify: `scripts/test-order-service-flows.sh`

- [ ] **Step 1: Extend the contract and verify RED**

Add these assertions to the backend contract:

```js
requireText(links, "type === 'HOTEL_BOOKING'", 'link validation must be Hotel Booking specific');
requireText(links, 'service.supplierId !== supplierId', 'service ownership mismatch must be rejected');
requireText(links, "service.status !== 'ACTIVE'", 'new inactive services must be rejected');
requireText(links, 'existingLinks.has(linkKey(supplierId, serviceId))', 'unchanged historical pairs must remain compatible');
requireText(service, 'await assertHotelOrderSupplierServiceLinks(tx, type, orderDto);', 'create must validate hotel service links');
requireText(service, 'await assertHotelOrderSupplierServiceLinks(tx, current.type, orderDto, current);', 'update must validate against persisted links');
```

Run the contract and expect failure because the validator is still missing.

- [ ] **Step 2: Implement the validator**

Create `apps/api/src/modules/orders/order-supplier-service-links.ts` with exported input types and this behavior:

```ts
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type LinkLine = { supplierId?: string | null; serviceId?: string | null };
type LinkInput = { salesItems?: LinkLine[]; operationItems?: LinkLine[] };

function text(value?: string | null) {
  return value?.trim() || '';
}

function linkKey(supplierId: string, serviceId: string) {
  return `${supplierId}:${serviceId}`;
}

function existingLinkKeys(current?: LinkInput) {
  return new Set([...(current?.salesItems || []), ...(current?.operationItems || [])]
    .map((line) => linkKey(text(line.supplierId), text(line.serviceId))));
}

export async function assertHotelOrderSupplierServiceLinks(
  tx: Prisma.TransactionClient,
  type: string,
  input: LinkInput,
  current?: LinkInput,
) {
  if (type !== 'HOTEL_BOOKING') return;
  const lines = [...(input.salesItems || []), ...(input.operationItems || [])]
    .map((line) => ({ supplierId: text(line.supplierId), serviceId: text(line.serviceId) }))
    .filter((line) => line.supplierId || line.serviceId);
  if (!lines.length) return;

  const existingLinks = existingLinkKeys(current);
  const supplierIds = Array.from(new Set(lines.map((line) => line.supplierId).filter(Boolean)));
  const serviceIds = Array.from(new Set(lines.map((line) => line.serviceId).filter(Boolean)));
  const [suppliers, services] = await Promise.all([
    tx.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, status: true, deletedAt: true, hotelProfile: { select: { id: true } } } }),
    tx.supplierService.findMany({ where: { id: { in: serviceIds } }, select: { id: true, supplierId: true, status: true, deletedAt: true } }),
  ]);
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const serviceById = new Map(services.map((service) => [service.id, service]));

  for (const { supplierId, serviceId } of lines) {
    if (!supplierId) throw new BadRequestException('Dịch vụ phòng phải có nhà cung cấp khách sạn');
    const supplier = supplierById.get(supplierId);
    if (!supplier) throw new BadRequestException('Nhà cung cấp dịch vụ phòng không tồn tại');
    if (serviceId) {
      const service = serviceById.get(serviceId);
      if (!service) throw new BadRequestException('Dịch vụ phòng không tồn tại');
      if (service.supplierId !== supplierId) throw new BadRequestException('Dịch vụ phòng không thuộc nhà cung cấp đã chọn');
      if (existingLinks.has(linkKey(supplierId, serviceId))) continue;
      if (service.status !== 'ACTIVE' || service.deletedAt) throw new BadRequestException('Dịch vụ phòng đang ngừng hoạt động');
    } else if (existingLinks.has(linkKey(supplierId, serviceId))) {
      continue;
    }
    if (supplier.status !== 'ACTIVE' || supplier.deletedAt) throw new BadRequestException('Nhà cung cấp khách sạn đang ngừng hoạt động');
    if (!supplier.hotelProfile) throw new BadRequestException('Nhà cung cấp đã chọn không phải khách sạn');
  }
}
```

- [ ] **Step 3: Call validation inside create/update transactions**

Import the helper in `orders.service.ts`.

In `create()`, after customer snapshot and before totals/child writes:

```ts
await assertHotelOrderSupplierServiceLinks(tx, type, orderDto);
```

In `update()`, after customer snapshot and before child sync:

```ts
await assertHotelOrderSupplierServiceLinks(tx, current.type, orderDto, current);
```

- [ ] **Step 4: Add runtime RED/GREEN coverage**

In `scripts/test-order-service-flows.sh`, make the existing supplier a real hotel supplier and add explicit secondary/inactive fixtures:

```js
// Add inside the existing supplier create data.
hotelProfile: { create: { classHotel: '4 sao', hotelProject: 'Order Service Hotel' } },

const otherHotelSupplier = await prisma.supplier.create({
  data: {
    categoryId: category.id,
    supplierCode: run + '-OTHER-HOTEL',
    name: 'Other Order Service Hotel',
    status: 'ACTIVE',
    hotelProfile: { create: { classHotel: '3 sao', hotelProject: 'Other Hotel' } },
  },
});
const otherHotelService = await prisma.supplierService.create({
  data: { supplierId: otherHotelSupplier.id, sku: run + '-OTHER-ROOM', serviceName: 'Other Room', netPrice: 500000, sellingPrice: 800000, status: 'ACTIVE' },
});
const inactiveHotelService = await prisma.supplierService.create({
  data: { supplierId: supplier.id, sku: run + '-INACTIVE-ROOM', serviceName: 'Inactive Room', netPrice: 400000, sellingPrice: 700000, status: 'INACTIVE' },
});
const historicalHotelService = await prisma.supplierService.create({
  data: { supplierId: supplier.id, sku: run + '-HISTORICAL-ROOM', serviceName: 'Historical Room', netPrice: 300000, sellingPrice: 600000, status: 'ACTIVE' },
});
```

Add these assertions after the base fixtures:

```js
await rejects(() => orders.create('hotel-bookings', {
  systemCode: run + '-HOTEL-MISMATCH',
  name: 'Hotel mismatch',
  operationItems: [{ serviceType: 'HOTEL', supplierId: otherHotelSupplier.id, serviceId: hotelService.id, quantity: 1, netPrice: 1 }],
}), 'hotel order should reject a service owned by another supplier');

await rejects(() => orders.create('hotel-bookings', {
  systemCode: run + '-HOTEL-INACTIVE',
  name: 'Hotel inactive service',
  operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: inactiveHotelService.id, quantity: 1, netPrice: 1 }],
}), 'hotel order should reject a new inactive service');

const historicalOrder = await orders.create('hotel-bookings', {
  systemCode: run + '-HOTEL-HISTORICAL',
  name: 'Historical room booking',
  operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: historicalHotelService.id, quantity: 1, netPrice: 1 }],
});
await prisma.supplierService.update({ where: { id: historicalHotelService.id }, data: { status: 'INACTIVE' } });
const historicalUpdated = await orders.update('hotel-bookings', historicalOrder.id, {
  note: 'Keep historical room link',
  operationItems: [{ id: historicalOrder.operationItems[0].id, serviceType: 'HOTEL', supplierId: supplier.id, serviceId: historicalHotelService.id, quantity: 1, netPrice: 1 }],
});
assert(historicalUpdated.operationItems[0].serviceId === historicalHotelService.id, 'unchanged historical service link should remain editable');
```

Run the flow before implementation to observe failure, then after implementation expect `TEST_ORDER_SERVICE_FLOWS_OK`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
node scripts/test-orders-hotel-service-selectors-backend-contract.js
bash scripts/test-order-service-flows.sh
node scripts/test-orders-write-lock-contract.js
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
git diff --check
```

Commit:

```bash
git add apps/api/src/modules/orders/order-supplier-service-links.ts apps/api/src/modules/orders/orders.service.ts scripts/test-orders-hotel-service-selectors-backend-contract.js scripts/test-order-service-flows.sh
git commit -m "fix: validate hotel order service links"
```

### Task 3: Hotel Options Page Data and Client Contract

**Files:**
- Create: `scripts/test-orders-hotel-service-selectors-client-contract.js`
- Modify: `apps/web/app/orders/[type]/page.tsx`
- Modify: `apps/web/app/orders/[type]/OrdersClient.tsx`

- [ ] **Step 1: Write the failing client contract**

Create a source contract that reads the page and client, then requires:

```js
requireText(page, "'/orders/hotel-service-options'", 'Hotel Booking page must load Orders-owned hotel options');
requireText(page, "type === 'hotel-bookings'", 'hotel options must load only for Hotel Booking');
requireText(page, 'initialHotelSuppliers={hotelSuppliers}', 'page must pass hotel options to OrdersClient');
requireText(client, 'type HotelSupplierOption =', 'OrdersClient must define the minimal option contract');
requireText(client, 'function mergePersistedHotelOptions', 'inactive historical selections must remain visible');
requireText(client, 'function hotelAllotmentRemaining', 'room options must expose advisory availability');
requireText(client, "const isHotelBooking = type === 'hotel-bookings';", 'Hotel Booking rendering must be explicit');
```

Run `node scripts/test-orders-hotel-service-selectors-client-contract.js` and expect its failure marker.

- [ ] **Step 2: Server-load options only for Hotel Booking**

In `page.tsx`, define the minimal serializable option type or import it from the client with `import type`. Load:

```ts
const hotelSuppliers = canViewOrders && type === 'hotel-bookings'
  ? await apiGet<HotelSupplierOption[]>('/orders/hotel-service-options', [])
  : [];
```

Pass:

```tsx
<OrdersClient type={type} config={config} initialOrders={orders} initialHotelSuppliers={hotelSuppliers} />
```

- [ ] **Step 3: Add normalized option types/helpers**

In `OrdersClient.tsx`, add types for supplier, service, allotment, and flattened service options. Implement:

```ts
function hotelAllotmentRemaining(allotments: HotelAllotmentOption[], serviceDate?: string, orderStartDate?: string) {
  const target = dateOnly(serviceDate || orderStartDate);
  return allotments
    .filter((row) => !target || ((!row.startDate || dateOnly(row.startDate) <= target) && (!row.endDate || dateOnly(row.endDate) >= target)))
    .reduce((sum, row) => sum + Math.max(0, safeNumber(row.allotmentQty) - safeNumber(row.bookedQty) - safeNumber(row.lockedQty)), 0);
}

function flattenHotelServiceOptions(suppliers: HotelSupplierOption[]): HotelServiceOption[] {
  return suppliers.flatMap((supplier) => (supplier.supplierServices || []).map((service) => ({
    ...service,
    supplierId: supplier.id,
    supplierName: supplier.name,
    selectable: service.status === 'ACTIVE',
    allotments: (supplier.allotments || []).filter((row) => row.serviceId === service.id),
  })));
}
```

Implement `mergePersistedHotelOptions(options, order)` by adding missing `row.supplier` and `row.service` values from both sales and operation detail rows with `selectable: false`.

- [ ] **Step 4: Verify helper contract and commit**

Run:

```bash
node scripts/test-orders-hotel-service-selectors-client-contract.js
bash scripts/test-orders-ui-auth-contract.sh
npm run lint --workspace @smarttour/web
git diff --check
```

Expected: every current Task 3 assertion passes. Commit page/helper groundwork:

```bash
git add apps/web/app/orders/[type]/page.tsx apps/web/app/orders/[type]/OrdersClient.tsx scripts/test-orders-hotel-service-selectors-client-contract.js
git commit -m "feat: load hotel service options for orders"
```

### Task 4: Hotel Booking Steps and Dependent Selectors

**Files:**
- Modify: `apps/web/app/orders/[type]/OrdersClient.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `scripts/test-orders-hotel-service-selectors-client-contract.js`

- [ ] **Step 1: Extend the client contract and verify RED**

Require the exact Hotel Booking step booleans and selector tokens:

```js
requireText(client, 'const showBookingInfo = isHotelBooking ? activeStep === 0 : activeStep === 1;', 'Hotel Booking info must be step 0');
requireText(client, 'const showHotelPricing = isHotelBooking && activeStep === 1;', 'Hotel room pricing must be step 1');
requireText(client, 'const showMembers = isHotelBooking ? activeStep === 2 : activeStep === 1;', 'Hotel members must be step 2');
requireText(client, 'const showTerms = isHotelBooking ? activeStep === 3 : activeStep === 5;', 'Hotel terms must be step 3');
requireText(client, 'const showSurvey = isHotelBooking ? activeStep === 4 : activeStep === 5;', 'Hotel survey must be step 4');
requireText(client, "type === 'supplier'", 'Rows must render hotel supplier selectors');
requireText(client, "type === 'hotelService'", 'Rows must render room service selectors');
requireText(client, "setValue(`${name}.${index}.supplierId`", 'service selection must set supplier ownership');
requireText(client, "setValue(`${name}.${index}.serviceType` as any, 'HOTEL'", 'room selection must set HOTEL service type');
requireText(client, "setValue(`${name}.${index}.unitPrice`", 'sales room selection must fill selling price');
requireText(client, "setValue(`${name}.${index}.netPrice`", 'operation room selection must fill net price');
requireText(client, 'Dịch vụ không còn hoạt động', 'historical services must be labelled unavailable');
requireText(client, 'Còn ${remaining} phòng', 'room options must show availability');
requireText(css, '.orderHotelServiceHint', 'Hotel service availability styles are missing');
```

- [ ] **Step 2: Extend the shared dynamic-cell contract**

Add `supplier` and `hotelService` to `RowColumn` types. Destructure `setValue` from `useForm`. Pass `hotelSuppliers`, flattened options, watched rows, Order start date, and `setValue` through `Rows` to `Cell` only for Hotel Booking pricing tables.

Supplier cell behavior:

```ts
if (type === 'supplier') {
  const field = register(`${name}.${index}.supplierId` as any);
  return <select {...field} onChange={(event) => {
    field.onChange(event);
    const supplierId = event.target.value;
    const current = hotelServices.find((service) => service.id === text(watchedRows[index]?.serviceId));
    if (current && current.supplierId !== supplierId) {
      setValue(`${name}.${index}.serviceId` as any, '', { shouldDirty: true });
      if (name === 'salesItems') {
        setValue(`${name}.${index}.description` as any, '', { shouldDirty: true });
        setValue(`${name}.${index}.unitPrice` as any, 0, { shouldDirty: true });
      } else {
        setValue(`${name}.${index}.netPrice` as any, 0, { shouldDirty: true });
      }
    }
  }}>
    <option value="">Chọn khách sạn</option>
    {hotelSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
  </select>;
}
```

Implement the service cell with the concrete dependent behavior:

```ts
if (type === 'hotelService') {
  const selectedSupplierId = text(watchedRows[index]?.supplierId);
  const selectedServiceId = text(watchedRows[index]?.serviceId);
  const available = selectedSupplierId ? hotelServices.filter((service) => service.supplierId === selectedSupplierId) : hotelServices;
  const field = register(`${name}.${index}.serviceId` as any);
  return <div className="orderHotelServiceCell">
    <select {...field} onChange={(event) => {
      field.onChange(event);
      const service = hotelServices.find((item) => item.id === event.target.value);
      if (!service) return;
      setValue(`${name}.${index}.supplierId` as any, service.supplierId, { shouldDirty: true });
      setValue(`${name}.${index}.serviceType` as any, 'HOTEL', { shouldDirty: true });
      if (name === 'salesItems') {
        setValue(`${name}.${index}.description` as any, service.serviceName, { shouldDirty: true });
        setValue(`${name}.${index}.unitPrice` as any, safeNumber(service.sellingPrice), { shouldDirty: true });
      } else {
        setValue(`${name}.${index}.netPrice` as any, safeNumber(service.netPrice), { shouldDirty: true });
      }
    }}>
      <option value="">Chọn loại phòng</option>
      {available.map((service) => {
        const remaining = hotelAllotmentRemaining(service.allotments, text(watchedRows[index]?.serviceDate), orderStartDate);
        const historical = !service.selectable;
        return <option key={`${service.supplierId}:${service.id}`} value={service.id} disabled={historical && service.id !== selectedServiceId}>
          {service.serviceName} - {historical ? 'Dịch vụ không còn hoạt động' : `Còn ${remaining} phòng`}
        </option>;
      })}
    </select>
    <span className="orderHotelServiceHint">Tồn quỹ chỉ mang tính tham khảo; hệ thống kiểm tra lại khi lưu.</span>
  </div>;
}
```

- [ ] **Step 3: Align the five Hotel Booking steps**

Add:

```ts
const isHotelBooking = type === 'hotel-bookings';
const showBookingInfo = isHotelBooking ? activeStep === 0 : activeStep === 1;
const showHotelPricing = isHotelBooking && activeStep === 1;
const showMembers = isHotelBooking ? activeStep === 2 : activeStep === 1;
const showTerms = isHotelBooking ? activeStep === 3 : activeStep === 5;
const showSurvey = isHotelBooking ? activeStep === 4 : activeStep === 5;
```

Use those booleans so Hotel Booking renders:

- Common booking/customer plus hotel root fields at step 0.
- Sales rows titled `Phòng bán / phần thu` and operation rows titled `Phòng đặt / phần chi` at step 1, with supplier/service columns first.
- Member rows at step 2.
- Terms at step 3.
- Survey description/questions at step 4.

Keep existing non-hotel conditions unchanged.

- [ ] **Step 4: Merge historical options during detail load**

Initialize option state from props. In `loadOrder()` before reset:

```ts
if (isHotelBooking) setHotelSuppliers((current) => mergePersistedHotelOptions(current, order));
```

Reset to `initialHotelSuppliers` in `openCreate()` and `closeForm()` so historical options from one booking do not leak into another create flow.

- [ ] **Step 5: Add dense styles**

Add:

```css
.orderHotelServiceCell { display: grid; gap: 5px; min-width: 210px; }
.orderHotelServiceHint { color: var(--dn-muted); font-size: 11px; font-weight: 700; line-height: 1.35; }
.orderHotelServiceHint.available { color: var(--dn-primary); }
.orderHotelServiceHint.unavailable { color: #b42318; }
.orderHotelEmptyOptions { margin: 0 0 10px; border: 1px solid #f6d28b; border-radius: var(--dn-radius-sm); background: #fff7ed; color: #9a5b00; padding: 9px 10px; font-size: 13px; font-weight: 700; }
```

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node scripts/test-orders-hotel-service-selectors-client-contract.js
bash scripts/test-orders-ui-auth-contract.sh
node scripts/test-orders-finance-client-contract.js
npm run lint --workspace @smarttour/web
npm run build --workspace @smarttour/web
git diff --check
```

Commit:

```bash
git add apps/web/app/orders/[type]/OrdersClient.tsx apps/web/app/globals.css scripts/test-orders-hotel-service-selectors-client-contract.js
git commit -m "feat: add hotel room selectors to orders"
```

### Task 5: CI, Full Verification, Memory, and Deployment

**Files:**
- Modify: `.github/workflows/smarttour-ci.yml`
- Modify: `scripts/test-github-actions-contract.js`
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Add failing CI expectations**

Require:

```js
'node scripts/test-orders-hotel-service-selectors-backend-contract.js',
'node scripts/test-orders-hotel-service-selectors-client-contract.js',
```

Run `node scripts/test-github-actions-contract.js` and expect failure because the workflow does not run them.

- [ ] **Step 2: Wire both contracts into Source contracts**

Add both commands after the existing Orders Finance contracts in `.github/workflows/smarttour-ci.yml`. Run the GitHub Actions contract plus both new contracts and expect all success markers.

- [ ] **Step 3: Commit CI wiring**

```bash
git add .github/workflows/smarttour-ci.yml scripts/test-github-actions-contract.js
git commit -m "test: cover hotel service selectors"
```

- [ ] **Step 4: Run the complete focused regression**

Run from the feature worktree, ensuring runtime scripts use that worktree rather than `/opt/smarttour`:

```bash
node scripts/test-github-actions-contract.js
node scripts/test-orders-hotel-service-selectors-backend-contract.js
node scripts/test-orders-hotel-service-selectors-client-contract.js
node scripts/test-orders-finance-backend-contract.js
node scripts/test-orders-finance-client-contract.js
bash scripts/test-orders-ui-auth-contract.sh
node scripts/test-orders-write-lock-contract.js
bash scripts/test-hotel-allotment-contract.sh
bash scripts/test-suppliers-hotel-contract.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
npm run lint --workspace @smarttour/web
npm run build --workspace @smarttour/web
COMPOSE_PROJECT_NAME=smarttour docker compose build --no-cache --quiet api
sed '/^docker compose build api >\/dev\/null$/d' scripts/test-order-service-flows.sh | REPO_DIR="$PWD" COMPOSE_PROJECT_NAME=smarttour bash
git diff --check
```

- [ ] **Step 5: Review and integrate**

Review the full range against the design spec, with special attention to route order, permission boundaries, historical links, selector clearing, and non-hotel regressions. Fast-forward the clean feature branch into `main`, rerun the same focused regression on `/opt/smarttour`, then remove the merged worktree/branch.

- [ ] **Step 6: Push and deploy**

```bash
git push origin main
BRANCH=main bash scripts/deploy-production.sh
curl --fail --silent http://127.0.0.1:4000/api/health
```

Expected: `HEALTHCHECK_OK`, `DEPLOY_PRODUCTION_OK`, and `{"ok":true,"service":"smarttour-api"}`.

- [ ] **Step 7: Run credential-dependent smoke safely**

Run `bash scripts/smoke-order-lifecycle.sh`. If it reports missing `ADMIN_PASSWORD`, record the gap and do not change production credentials.

- [ ] **Step 8: Update and commit Memory Bank**

Prepend concise notes covering the Orders-owned hotel options endpoint, link integrity, Hotel Booking five-step mapping, selector price fill, historical compatibility, exact verification commands, deployed commit, healthcheck, and any credential-dependent smoke gap.

```bash
git add memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: update memory for hotel service selectors"
git push origin main
git status --short --branch
git rev-list --left-right --count main...origin/main
```

Expected: clean `main` and `0 0` sync.
