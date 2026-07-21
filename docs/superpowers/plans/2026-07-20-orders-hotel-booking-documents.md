# Orders Hotel Booking Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected persisted-data document model for Hotel Booking, plus Word-compatible download and browser print/PDF actions in Orders.

**Architecture:** Orders owns a focused, data-scoped document projection guarded by `order.view` and `order.export`. The web app fetches that JSON model at action time and passes it to a pure escaped HTML renderer shared by Word-compatible `.doc` download and an A4 print window; no schema or document-generation dependency is added.

**Tech Stack:** TypeScript, NestJS, Prisma, Next.js App Router, React, browser Blob/print APIs, source-contract scripts, Docker Compose.

---

## File Map

- Create `apps/api/src/modules/orders/order-document.ts`: focused Hotel Booking document projection and normalization.
- Modify `apps/api/src/modules/orders/orders.controller.ts`: protected document route before Order detail/write routes.
- Modify `apps/api/src/modules/orders/orders.service.ts`: delegate document reads after resolving Order type.
- Create `scripts/test-orders-hotel-booking-documents-backend-contract.js`: backend route, permission, projection, and sensitive-field contract.
- Modify `scripts/test-orders-controller-permissions.sh`: register the two-permission document route.
- Modify `scripts/test-order-service-flows.sh`: runtime Hotel Booking document-model coverage.
- Create `apps/web/app/orders/[type]/order-document.ts`: serialized model type, escaping, HTML, Word download, and print helpers.
- Create `apps/web/app/orders/[type]/OrderDocumentActions.tsx`: permission-aware Word/print actions and fresh model fetch.
- Modify `apps/web/app/orders/[type]/OrdersClient.tsx`: render document actions only for persisted Hotel Booking rows.
- Create `scripts/test-orders-hotel-booking-documents-client-contract.js`: renderer, action, permission, and integration source contract.
- Modify `scripts/test-orders-ui-auth-contract.sh`: fail-closed `order.export` coverage.
- Modify `scripts/smoke-order-lifecycle.sh`: credential-dependent Hotel Booking document endpoint smoke.
- Modify `.github/workflows/smarttour-ci.yml`: run backend/client document contracts.
- Modify `scripts/test-github-actions-contract.js`: require both CI commands.
- Modify `memory-bank/activeContext.md` and `memory-bank/progress.md`: completion, verification, deploy, and smoke evidence.

### Task 1: Protected Hotel Booking Document Model

**Files:**
- Create: `scripts/test-orders-hotel-booking-documents-backend-contract.js`
- Create: `apps/api/src/modules/orders/order-document.ts`
- Modify: `apps/api/src/modules/orders/orders.controller.ts`
- Modify: `apps/api/src/modules/orders/orders.service.ts`
- Modify: `scripts/test-orders-controller-permissions.sh`
- Modify: `scripts/test-order-service-flows.sh`

- [ ] **Step 1: Write the failing backend contract**

Create `scripts/test-orders-hotel-booking-documents-backend-contract.js`:

```js
const fs = require('fs');

const controller = fs.readFileSync('apps/api/src/modules/orders/orders.controller.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/orders/orders.service.ts', 'utf8');
const documentSource = fs.existsSync('apps/api/src/modules/orders/order-document.ts')
  ? fs.readFileSync('apps/api/src/modules/orders/order-document.ts', 'utf8')
  : '';
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(controller, "@Get(':type/:id/document')", 'Orders must expose a persisted document route');
requireText(controller, "@RequirePermissions('order.view', 'order.export')", 'document route must require view and export permissions');
if (controller.indexOf("@Get(':type/:id/document')") > controller.indexOf("@Get(':type/:id')")) failures.push('document route must precede Order detail');
requireText(service, 'return getHotelBookingOrderDocument(this.prisma, type, id, user);', 'OrdersService must delegate the document projection');
requireText(documentSource, 'type !== OrderType.HOTEL_BOOKING', 'non-hotel Order documents must be rejected');
requireText(documentSource, 'branchDepartmentScopeWhere', 'document lookup must preserve Order data scope');
requireText(documentSource, 'deletedAt: null', 'document lookup must exclude deleted Orders');
requireText(documentSource, 'supplier: { select:', 'document rows must use a minimal supplier projection');
requireText(documentSource, 'service: { select:', 'document rows must use a minimal service projection');
requireText(documentSource, "documentTitle: 'PHIẾU BOOKING PHÒNG KHÁCH SẠN'", 'document model needs the Hotel Booking title');
requireText(documentSource, 'generatedAt: new Date().toISOString()', 'document model needs a generation timestamp');
for (const forbidden of ['taxCode', 'bankAccountName', 'bankAccountNumber', 'debtNote', 'pricePolicy', 'contacts', 'files']) {
  if (documentSource.includes(forbidden)) failures.push(`document projection must not expose ${forbidden}`);
}

if (failures.length) {
  console.error('FAIL_ORDERS_HOTEL_BOOKING_DOCUMENTS_BACKEND_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_ORDERS_HOTEL_BOOKING_DOCUMENTS_BACKEND_CONTRACT_OK');
```

- [ ] **Step 2: Add the failing permission and runtime expectations**

Replace the `expected` object in `scripts/test-orders-controller-permissions.sh` with:

```js
const expected = {
  hotelServiceOptions: { http: 'GET', permissions: ['order.view'] },
  document: { http: 'GET', permissions: ['order.view', 'order.export'] },
  list: { http: 'GET', permissions: ['order.view'] },
  detail: { http: 'GET', permissions: ['order.view'] },
  create: { http: 'POST', permissions: ['order.manage'] },
  update: { http: 'PUT', permissions: ['order.manage'] },
  remove: { http: 'DELETE', permissions: ['order.manage'] },
  updateStatus: { http: 'PATCH', permissions: ['order.status.update'] },
  copy: { http: 'POST', permissions: ['order.manage'] },
  settle: { http: 'POST', permissions: ['order.settle'] },
  unlock: { http: 'POST', permissions: ['order.unlock'] },
};
```

Then replace the `const failures = [];` block after the controller parser with:

```js
const failures = [];
for (const [method, expectedRoute] of Object.entries(expected)) {
  const route = routes[method];
  if (!route) {
    failures.push(`missing orders endpoint method: ${method}`);
    continue;
  }
  if (route.http !== expectedRoute.http) failures.push(`${method} expected ${expectedRoute.http}, got ${route.http}`);
  if (JSON.stringify(route.permissions) !== JSON.stringify(expectedRoute.permissions)) {
    failures.push(`${method} expected ${expectedRoute.permissions.join(',')}, got ${route.permissions.join(',') || '<none>'}`);
  }
}
```

Extend the Node body in `scripts/test-order-service-flows.sh` after the hotel supplier/service fixtures:

```js
const documentOrder = await orders.create('hotel-bookings', {
  systemCode: run + '-HOTEL-DOCUMENT',
  tourCode: run + '-BOOKING',
  name: 'Hotel document booking',
  customerId: customer.id,
  startDate: '2026-10-10',
  endDate: '2026-10-12',
  roomClass: 'Deluxe',
  servicePackage: 'Breakfast',
  salesItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, description: 'Deluxe Room', quantity: 2, serviceCount: 2, unitPrice: 1000000, vat: 0 }],
  operationItems: [{ serviceType: 'HOTEL', supplierId: supplier.id, serviceId: hotelService.id, bookingCode: run + '-SUP-BOOK', serviceDate: '2026-10-10', quantity: 2, netPrice: 700000, vat: 0, status: 'WAITING' }],
  members: [{ fullName: 'Document Guest', phone: '0900000099', identityNumber: 'DOC-IDENTITY' }],
  terms: [{ language: 'VN', terms: 'Hotel document terms', notes: 'Document term note' }],
  surveyDescription: 'Hotel document survey',
  surveyQuestions: [{ question: 'Room quality?', note: 'Document survey note' }],
});

const documentModel = await orders.document('hotel-bookings', documentOrder.id);
assert(documentModel.documentTitle === 'PHIẾU BOOKING PHÒNG KHÁCH SẠN', 'document title should match Hotel Booking');
assert(documentModel.order.systemCode === documentOrder.systemCode, 'document must use persisted Order identity');
assert(documentModel.customer.customerName === customer.fullName, 'document must use the persisted customer snapshot');
assert(documentModel.salesItems[0].supplier.name === supplier.name && documentModel.salesItems[0].service.serviceName === hotelService.serviceName, 'document must include minimal sales supplier/service labels');
assert(documentModel.operationItems[0].bookingCode === run + '-SUP-BOOK', 'document must include persisted operation booking code');
assert(documentModel.members[0].identityNumber === 'DOC-IDENTITY', 'document must include persisted members');
assert(documentModel.terms[0].terms === 'Hotel document terms', 'document must include persisted terms');
assert(documentModel.survey.questions[0].question === 'Room quality?', 'document must include persisted survey questions');
assert(documentModel.summary.totalRevenue === 4000000 && documentModel.summary.totalCost === 1400000, 'document must expose recalculated persisted totals');
await rejects(() => orders.document('single-services', documentOrder.id), 'non-hotel document type must be rejected');
```

Add these normalized-value checks to `scripts/test-orders-hotel-booking-documents-backend-contract.js`:

```js
requireText(documentSource, 'totalRevenue: number(order.totalRevenue)', 'document totals must be serialized numbers');
requireText(documentSource, 'serviceDate: iso(row.serviceDate)', 'operation service dates must be serialized');
requireText(documentSource, 'birthday: iso(row.birthday)', 'member birth dates must be serialized');
requireText(documentSource, 'signatures: [', 'document model must provide signature columns');
```

- [ ] **Step 3: Run all backend expectations and verify RED**

Run:

```bash
node scripts/test-orders-hotel-booking-documents-backend-contract.js
bash scripts/test-orders-controller-permissions.sh
set +e
(
  set -euo pipefail
  test ! -e .env
  ln -s /opt/smarttour/.env .env
  cleanup_env_link() { test -L .env && rm -f .env; }
  trap cleanup_env_link EXIT
  REPO_DIR="$PWD" COMPOSE_PROJECT_NAME=smarttour bash scripts/test-order-service-flows.sh
)
runtime_status=$?
set -e
test ! -e .env && echo ENV_LINK_ABSENT
test "$runtime_status" -ne 0
```

Expected: the source contract reports `FAIL_ORDERS_HOTEL_BOOKING_DOCUMENTS_BACKEND_CONTRACT`, the permission contract reports the missing `document` method, and the runtime flow fails because `orders.document` does not exist. Confirm `ENV_LINK_ABSENT` after the runtime failure.

- [ ] **Step 4: Add the focused document projection**

Create `apps/api/src/modules/orders/order-document.ts` with this interface and projection:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, RequestUser } from '../auth/data-scope';

const supplierSelect = { id: true, supplierCode: true, name: true } satisfies Prisma.SupplierSelect;
const serviceSelect = { id: true, sku: true, serviceName: true } satisfies Prisma.SupplierServiceSelect;

export async function getHotelBookingOrderDocument(
  prisma: PrismaService,
  type: OrderType,
  id: string,
  user?: RequestUser,
) {
  if (type !== OrderType.HOTEL_BOOKING) {
    throw new BadRequestException('Chứng từ hiện chỉ hỗ trợ Booking phòng khách sạn');
  }

  const order = await prisma.order.findFirst({
    where: branchDepartmentScopeWhere({ id, type: OrderType.HOTEL_BOOKING, deletedAt: null }, user),
    select: {
      id: true,
      type: true,
      systemCode: true,
      tourCode: true,
      holdCode: true,
      name: true,
      route: true,
      marketGroup: true,
      bookingDate: true,
      paymentDate: true,
      startDate: true,
      endDate: true,
      status: true,
      paymentStatus: true,
      costStatus: true,
      currency: true,
      exchangeRate: true,
      createdBy: true,
      createdDate: true,
      branch: true,
      department: true,
      customerName: true,
      customerType: true,
      customerPhone: true,
      customerEmail: true,
      customerAddress: true,
      agencyName: true,
      collaborator: true,
      operatorOwner: true,
      adultQty: true,
      childQty: true,
      infantQty: true,
      quantity: true,
      roomClass: true,
      servicePackage: true,
      receiveDeadline: true,
      closeDeadline: true,
      totalRevenue: true,
      paidAmount: true,
      remainingRevenue: true,
      totalCost: true,
      paidCost: true,
      remainingCost: true,
      profit: true,
      commission: true,
      note: true,
      surveyDescription: true,
      salesItems: {
        select: {
          id: true,
          serviceType: true,
          description: true,
          quantity: true,
          serviceCount: true,
          unitPrice: true,
          vat: true,
          amount: true,
          note: true,
          supplier: { select: supplierSelect },
          service: { select: serviceSelect },
        },
        orderBy: { sortOrder: 'asc' },
      },
      operationItems: {
        select: {
          id: true,
          serviceType: true,
          bookingCode: true,
          serviceDate: true,
          quantity: true,
          netPrice: true,
          vat: true,
          amount: true,
          status: true,
          note: true,
          supplier: { select: supplierSelect },
          service: { select: serviceSelect },
        },
        orderBy: { sortOrder: 'asc' },
      },
      members: {
        select: { id: true, fullName: true, gender: true, birthday: true, phone: true, email: true, identityNumber: true, issuedDate: true, nationality: true, passengerType: true, note: true },
        orderBy: { sortOrder: 'asc' },
      },
      terms: {
        select: { id: true, language: true, terms: true, notes: true },
        orderBy: { language: 'asc' },
      },
      surveyQuestions: {
        select: { id: true, question: true, note: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!order) throw new NotFoundException('Không tìm thấy Booking phòng khách sạn');

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    documentTitle: 'PHIẾU BOOKING PHÒNG KHÁCH SẠN',
    order: {
      ...pick(order, ['id', 'type', 'systemCode', 'tourCode', 'holdCode', 'name', 'route', 'marketGroup', 'status', 'paymentStatus', 'costStatus', 'currency', 'createdBy', 'branch', 'department', 'operatorOwner', 'adultQty', 'childQty', 'infantQty', 'quantity', 'roomClass', 'servicePackage', 'note']),
      bookingDate: iso(order.bookingDate),
      paymentDate: iso(order.paymentDate),
      startDate: iso(order.startDate),
      endDate: iso(order.endDate),
      createdDate: iso(order.createdDate),
      receiveDeadline: iso(order.receiveDeadline),
      closeDeadline: iso(order.closeDeadline),
      exchangeRate: number(order.exchangeRate),
    },
    customer: pick(order, ['customerName', 'customerType', 'customerPhone', 'customerEmail', 'customerAddress', 'agencyName', 'collaborator']),
    summary: {
      totalRevenue: number(order.totalRevenue),
      paidAmount: number(order.paidAmount),
      remainingRevenue: number(order.remainingRevenue),
      totalCost: number(order.totalCost),
      paidCost: number(order.paidCost),
      remainingCost: number(order.remainingCost),
      profit: number(order.profit),
      commission: number(order.commission),
    },
    salesItems: order.salesItems.map((row) => ({ ...row, quantity: number(row.quantity), serviceCount: number(row.serviceCount), unitPrice: number(row.unitPrice), vat: number(row.vat), amount: number(row.amount) })),
    operationItems: order.operationItems.map((row) => ({ ...row, serviceDate: iso(row.serviceDate), quantity: number(row.quantity), netPrice: number(row.netPrice), vat: number(row.vat), amount: number(row.amount) })),
    members: order.members.map((row) => ({ ...row, birthday: iso(row.birthday), issuedDate: iso(row.issuedDate) })),
    terms: order.terms,
    survey: { description: order.surveyDescription, questions: order.surveyQuestions },
    signatures: [
      { role: 'Khách hàng', name: order.customerName },
      { role: 'Nhân viên phụ trách', name: order.createdBy },
      { role: 'Điều hành', name: order.operatorOwner },
    ],
  };
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value?: Date | null) {
  return value?.toISOString() ?? null;
}

function pick<T extends Record<string, unknown>, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<T, K>;
}
```

- [ ] **Step 5: Expose the protected route**

Import `getHotelBookingOrderDocument` in `orders.service.ts` and add:

```ts
  document(typePath: string, id: string, user?: RequestUser) {
    const type = this.resolveType(typePath);
    return getHotelBookingOrderDocument(this.prisma, type, id, user);
  }
```

Add this controller method before `@Get(':type/:id')`:

```ts
  @Get(':type/:id/document')
  @RequirePermissions('order.view', 'order.export')
  document(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.ordersService.document(type, id, request.user);
  }
```

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
node scripts/test-orders-hotel-booking-documents-backend-contract.js
bash scripts/test-orders-controller-permissions.sh
(
  set -euo pipefail
  test ! -e .env
  ln -s /opt/smarttour/.env .env
  cleanup_env_link() { test -L .env && rm -f .env; }
  trap cleanup_env_link EXIT
  REPO_DIR="$PWD" COMPOSE_PROJECT_NAME=smarttour bash scripts/test-order-service-flows.sh
)
test ! -e .env && echo ENV_LINK_ABSENT
node scripts/test-orders-write-lock-contract.js
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
git diff --check
```

Expected: the new contract prints `TEST_ORDERS_HOTEL_BOOKING_DOCUMENTS_BACKEND_CONTRACT_OK` and every command exits `0`.

Commit:

```bash
git add apps/api/src/modules/orders/order-document.ts apps/api/src/modules/orders/orders.controller.ts apps/api/src/modules/orders/orders.service.ts scripts/test-orders-hotel-booking-documents-backend-contract.js scripts/test-orders-controller-permissions.sh scripts/test-order-service-flows.sh
git commit -m "feat: expose hotel booking document model"
```

### Task 2: Escaped Word and Print Renderer

**Files:**
- Create: `scripts/test-orders-hotel-booking-documents-client-contract.js`
- Create: `apps/web/app/orders/[type]/order-document.ts`

- [ ] **Step 1: Write the failing renderer contract**

Create `scripts/test-orders-hotel-booking-documents-client-contract.js`:

```js
const fs = require('fs');

const renderer = fs.existsSync('apps/web/app/orders/[type]/order-document.ts')
  ? fs.readFileSync('apps/web/app/orders/[type]/order-document.ts', 'utf8')
  : '';
const actions = fs.existsSync('apps/web/app/orders/[type]/OrderDocumentActions.tsx')
  ? fs.readFileSync('apps/web/app/orders/[type]/OrderDocumentActions.tsx', 'utf8')
  : '';
const client = fs.readFileSync('apps/web/app/orders/[type]/OrdersClient.tsx', 'utf8');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(renderer, 'export type OrderDocumentModel =', 'renderer must define the serialized document contract');
requireText(renderer, 'export function escapeOrderDocumentHtml', 'renderer must escape dynamic HTML');
requireText(renderer, "replaceAll('&', '&amp;')", 'HTML escaping must start with ampersands');
requireText(renderer, 'escapeOrderDocumentHtml(model.documentTitle)', 'renderer must render the protected document title');
requireText(renderer, 'function quantity(value: unknown)', 'renderer must format quantities separately from money');
requireText(renderer, 'function status(value?: string | null)', 'renderer must format persisted statuses');
requireText(renderer, '@page { size: A4;', 'print output must define A4 page CSS');
requireText(renderer, 'application/msword;charset=utf-8', 'Word export must use the Word-compatible MIME type');
requireText(renderer, "'\\uFEFF'", 'Word export must prepend a UTF-8 BOM');
requireText(renderer, "extension: 'doc'", 'Word export must use the .doc extension');
requireText(renderer, 'URL.revokeObjectURL(url)', 'Word download must release the object URL');
requireText(renderer, 'if (!model.members.length)', 'empty member sections must be omitted');

if (actions) {
  requireText(actions, '/${orderId}/document', 'actions must fetch the protected persisted document model');
}
if (client.includes('OrderDocumentActions')) {
  requireText(client, 'orderId={editingId}', 'OrdersClient must pass the persisted Order id');
}

if (failures.length) {
  console.error('FAIL_ORDERS_HOTEL_BOOKING_DOCUMENTS_CLIENT_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_ORDERS_HOTEL_BOOKING_DOCUMENTS_CLIENT_CONTRACT_OK');
```

- [ ] **Step 2: Run the renderer contract and verify RED**

Run:

```bash
node scripts/test-orders-hotel-booking-documents-client-contract.js
```

Expected: `FAIL_ORDERS_HOTEL_BOOKING_DOCUMENTS_CLIENT_CONTRACT` because the renderer file does not exist.

- [ ] **Step 3: Define the serialized web model**

Create `apps/web/app/orders/[type]/order-document.ts` with these exported types:

```ts
type SupplierLabel = { id: string; supplierCode: string | null; name: string } | null;
type ServiceLabel = { id: string; sku: string | null; serviceName: string } | null;

export type OrderDocumentModel = {
  version: number;
  generatedAt: string;
  documentTitle: string;
  order: {
    id: string; type: string; systemCode: string; tourCode: string | null; holdCode: string | null; name: string;
    route: string | null; marketGroup: string | null; status: string; paymentStatus: string; costStatus: string;
    currency: string; exchangeRate: number; createdBy: string | null; branch: string | null; department: string | null;
    operatorOwner: string | null; adultQty: number; childQty: number; infantQty: number; quantity: number;
    roomClass: string | null; servicePackage: string | null; note: string | null;
    bookingDate: string | null; paymentDate: string | null; startDate: string | null; endDate: string | null;
    createdDate: string | null; receiveDeadline: string | null; closeDeadline: string | null;
  };
  customer: {
    customerName: string | null; customerType: string | null; customerPhone: string | null; customerEmail: string | null;
    customerAddress: string | null; agencyName: string | null; collaborator: string | null;
  };
  summary: { totalRevenue: number; paidAmount: number; remainingRevenue: number; totalCost: number; paidCost: number; remainingCost: number; profit: number; commission: number };
  salesItems: Array<{ id: string; serviceType: string | null; description: string | null; quantity: number; serviceCount: number; unitPrice: number; vat: number; amount: number; note: string | null; supplier: SupplierLabel; service: ServiceLabel }>;
  operationItems: Array<{ id: string; serviceType: string | null; bookingCode: string | null; serviceDate: string | null; quantity: number; netPrice: number; vat: number; amount: number; status: string; note: string | null; supplier: SupplierLabel; service: ServiceLabel }>;
  members: Array<{ id: string; fullName: string; gender: string | null; birthday: string | null; phone: string | null; email: string | null; identityNumber: string | null; issuedDate: string | null; nationality: string | null; passengerType: string | null; note: string | null }>;
  terms: Array<{ id: string; language: string; terms: string | null; notes: string | null }>;
  survey: { description: string | null; questions: Array<{ id: string; question: string; note: string | null }> };
  signatures: Array<{ role: string; name: string | null }>;
};
```

- [ ] **Step 4: Implement escaping and deterministic HTML**

Add these helpers to the same file:

```ts
export function escapeOrderDocumentHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function date(value?: string | null) {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString('vi-VN');
}

function quantity(value: unknown) {
  return Number(value ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function status(value?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: 'Nháp', UPCOMING: 'Sắp tới', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy', SETTLED: 'Đã quyết toán', WAITING: 'Chờ xử lý', CONFIRMED: 'Đã xác nhận',
  };
  return labels[value || ''] || value || '-';
}

function multiline(value?: string | null) {
  return escapeOrderDocumentHtml(value || '').replaceAll('\n', '<br>');
}

function row(label: string, value: unknown) {
  const display = value === null || value === undefined || value === '' ? '-' : value;
  return `<div class="infoRow"><span>${escapeOrderDocumentHtml(label)}</span><strong>${escapeOrderDocumentHtml(display)}</strong></div>`;
}

function table(headers: string[], rows: string[][]) {
  if (!rows.length) return '';
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeOrderDocumentHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const DOCUMENT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1f2933; font: 12px/1.45 Aptos, "Segoe UI", sans-serif; }
  h1 { margin: 4px 0 14px; font: 700 22px/1.2 Georgia, serif; text-align: center; }
  h2 { margin: 16px 0 7px; padding-bottom: 4px; border-bottom: 2px solid #0f766e; font-size: 13px; text-transform: uppercase; }
  .brand { color: #0f766e; font-weight: 800; letter-spacing: .12em; text-align: center; }
  .meta, .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 18px; }
  .infoRow { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dotted #cbd5e1; padding: 3px 0; }
  .infoRow span { color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 6px; vertical-align: top; }
  th { background: #e7f5f2; color: #115e59; text-align: left; }
  .right { text-align: right; white-space: nowrap; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 28px; text-align: center; }
  .signatureSpace { height: 62px; }
  .muted { color: #64748b; }
  @media print { .noPrint { display: none !important; } }
`;

export function orderDocumentHtml(model: OrderDocumentModel) {
  const sales = model.salesItems.map((item) => [
    escapeOrderDocumentHtml(item.supplier?.name || '-'),
    escapeOrderDocumentHtml(item.service?.serviceName || item.description || '-'),
    `<span class="right">${quantity(item.quantity)}</span>`,
    `<span class="right">${quantity(item.serviceCount)}</span>`,
    `<span class="right">${money(item.unitPrice)}</span>`,
    `<span class="right">${money(item.amount)}</span>`,
  ]);
  const operations = model.operationItems.map((item) => [
    escapeOrderDocumentHtml(item.supplier?.name || '-'),
    escapeOrderDocumentHtml(item.service?.serviceName || item.serviceType || '-'),
    escapeOrderDocumentHtml(item.bookingCode || '-'),
    escapeOrderDocumentHtml(date(item.serviceDate)),
    `<span class="right">${quantity(item.quantity)}</span>`,
    `<span class="right">${money(item.netPrice)}</span>`,
    `<span class="right">${money(item.amount)}</span>`,
  ]);
  const members = model.members.map((item) => [
    escapeOrderDocumentHtml(item.fullName),
    escapeOrderDocumentHtml(item.passengerType || '-'),
    escapeOrderDocumentHtml(date(item.birthday)),
    escapeOrderDocumentHtml(item.phone || '-'),
    escapeOrderDocumentHtml(item.identityNumber || '-'),
    escapeOrderDocumentHtml(item.nationality || '-'),
  ]);
  const memberSection = (() => {
    if (!model.members.length) return '';
    return `<h2>Danh sách thành viên</h2>${table(['Họ tên', 'Loại khách', 'Ngày sinh', 'Điện thoại', 'CCCD/Hộ chiếu', 'Quốc tịch'], members)}`;
  })();
  const terms = model.terms.filter((item) => item.terms || item.notes).map((item) => `<article><strong>${escapeOrderDocumentHtml(item.language)}</strong><p>${multiline(item.terms)}</p>${item.notes ? `<p class="muted">${multiline(item.notes)}</p>` : ''}</article>`).join('');
  const survey = [model.survey.description ? `<p>${multiline(model.survey.description)}</p>` : '', ...model.survey.questions.map((item) => `<p><strong>${escapeOrderDocumentHtml(item.question)}</strong>${item.note ? `<br><span class="muted">${multiline(item.note)}</span>` : ''}</p>`)].join('');

  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeOrderDocumentHtml(model.order.systemCode)}</title><style>${DOCUMENT_CSS}</style></head><body>
    <div class="brand">SMARTTOUR</div><h1>${escapeOrderDocumentHtml(model.documentTitle)}</h1>
    <section class="meta">${row('Mã hệ thống', model.order.systemCode)}${row('Mã booking', model.order.tourCode)}${row('Tên booking', model.order.name)}${row('Trạng thái', status(model.order.status))}${row('Check-in', date(model.order.startDate))}${row('Check-out', date(model.order.endDate))}${row('Hạng phòng', model.order.roomClass)}${row('Gói dịch vụ', model.order.servicePackage)}${row('Điều hành', model.order.operatorOwner)}${row('Chi nhánh', model.order.branch)}</section>
    <h2>Khách hàng</h2><section class="meta">${row('Họ tên', model.customer.customerName)}${row('Điện thoại', model.customer.customerPhone)}${row('Email', model.customer.customerEmail)}${row('Địa chỉ', model.customer.customerAddress)}${row('Đại lý', model.customer.agencyName)}${row('Cộng tác viên', model.customer.collaborator)}</section>
    <h2>Phòng bán / phần thu</h2>${table(['Khách sạn', 'Loại phòng', 'SL', 'Số lượt', 'Đơn giá', 'Thành tiền'], sales)}
    <h2>Phòng đặt / phần chi</h2>${table(['Khách sạn', 'Loại phòng', 'Mã NCC', 'Ngày dùng', 'SL', 'Giá NET', 'Thành tiền'], operations)}
    <h2>Tổng hợp</h2><section class="summary">${row('Tổng thu', money(model.summary.totalRevenue))}${row('Đã thu', money(model.summary.paidAmount))}${row('Còn thu', money(model.summary.remainingRevenue))}${row('Tổng chi', money(model.summary.totalCost))}${row('Đã chi', money(model.summary.paidCost))}${row('Còn chi', money(model.summary.remainingCost))}${row('Lợi nhuận', money(model.summary.profit))}${row('Hoa hồng', money(model.summary.commission))}</section>
    ${memberSection}${terms ? `<h2>Điều khoản</h2>${terms}` : ''}${survey ? `<h2>Đánh giá dịch vụ</h2>${survey}` : ''}
    <section class="signatures">${model.signatures.map((signature) => `<div><strong>${escapeOrderDocumentHtml(signature.role)}</strong><div class="signatureSpace"></div><span>${escapeOrderDocumentHtml(signature.name || '')}</span></div>`).join('')}</section>
    <p class="muted">Tạo lúc ${escapeOrderDocumentHtml(new Date(model.generatedAt).toLocaleString('vi-VN'))}</p>
  </body></html>`;
}
```

- [ ] **Step 5: Add Word download and print helpers**

Add to `order-document.ts`:

```ts
function fileBase(model: OrderDocumentModel) {
  const normalized = model.order.systemCode.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'hotel-booking';
}

export function downloadOrderWord(model: OrderDocumentModel) {
  const blob = new Blob(['\uFEFF', orderDocumentHtml(model)], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileBase(model)}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { extension: 'doc' as const };
}

export function writeOrderPrintWindow(popup: Window, model: OrderDocumentModel) {
  popup.document.open();
  popup.document.write(orderDocumentHtml(model));
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 150);
}
```

- [ ] **Step 6: Verify renderer GREEN and commit**

Run:

```bash
node scripts/test-orders-hotel-booking-documents-client-contract.js
npm run lint --workspace @smarttour/web
git diff --check
```

Expected: `TEST_ORDERS_HOTEL_BOOKING_DOCUMENTS_CLIENT_CONTRACT_OK` and exit `0`.

Commit:

```bash
git add apps/web/app/orders/[type]/order-document.ts scripts/test-orders-hotel-booking-documents-client-contract.js
git commit -m "feat: render hotel booking documents"
```

### Task 3: Permission-Aware Document Actions

Both exact permissions, `order.view` and `order.export`, are required for document actions. `order.manage` alone does not substitute for `order.view` because the API requires both permissions.

**Files:**
- Create: `apps/web/app/orders/[type]/OrderDocumentActions.tsx`
- Modify: `apps/web/app/orders/[type]/OrdersClient.tsx`
- Modify: `scripts/test-orders-hotel-booking-documents-client-contract.js`
- Modify: `scripts/test-orders-ui-auth-contract.sh`

- [ ] **Step 1: Extend the client contract and verify RED**

Add these assertions to `scripts/test-orders-hotel-booking-documents-client-contract.js`:

```js
requireText(actions, "const canExportDocuments = can('order.view') && can('order.export');", 'document actions must require exact view and export permissions');
requireText(actions, "type !== 'hotel-bookings'", 'document actions must be Hotel Booking only');
requireText(actions, 'if (!canExportDocuments || !orderId)', 'document actions must fail closed without permission or persisted id');
requireText(actions, 'window.open', 'print must open a browser print window');
requireText(actions, 'Cho phép cửa sổ bật lên', 'popup blocking must produce an operational message');
requireText(actions, 'downloadOrderWord(model)', 'Word action must use the shared renderer');
requireText(actions, 'writeOrderPrintWindow(popup, model)', 'print action must use the shared renderer');
requireText(client, '<OrderDocumentActions', 'OrdersClient must render the focused actions component');
requireText(client, 'orderId={editingId}', 'document actions must use a persisted Order id');
requireText(client, 'onMessage={setMessage}', 'document errors must use the existing inline message path');
```

Run:

```bash
node scripts/test-orders-hotel-booking-documents-client-contract.js
```

Expected: failure because `OrderDocumentActions.tsx` does not exist.

- [ ] **Step 2: Implement the focused actions component**

Create `apps/web/app/orders/[type]/OrderDocumentActions.tsx`:

```tsx
'use client';

import { Download, Printer } from 'lucide-react';
import { useRef, useState } from 'react';
import { authFetch, authHeaders } from '../../authFetch';
import { usePermissions } from '../../usePermissions';
import type { OrderRouteType } from '../order-config';
import { downloadOrderWord, type OrderDocumentModel, writeOrderPrintWindow } from './order-document';

function browserApiBase() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  if (typeof window === 'undefined') return apiBase;
  if (apiBase.includes('smarttour-api-1')) return `http://${window.location.hostname}:4000`;
  return apiBase;
}

async function responseMessage(response: Response) {
  const data = await response.json().catch(() => ({}));
  return data.message || response.statusText || `HTTP ${response.status}`;
}

export default function OrderDocumentActions({ type, orderId, disabled, onMessage }: { type: OrderRouteType; orderId: string | null; disabled: boolean; onMessage: (message: string) => void }) {
  const { can, permissionsReady } = usePermissions();
  const [busy, setBusy] = useState<'word' | 'print' | null>(null);
  const inFlightRef = useRef(false);
  const canExportDocuments = can('order.view') && can('order.export');
  if (!permissionsReady || type !== 'hotel-bookings') return null;
  if (!canExportDocuments || !orderId) return null;

  async function fetchModel() {
    const response = await authFetch(`${browserApiBase()}/api/orders/${type}/${orderId}/document`, { cache: 'no-store', headers: authHeaders() });
    if (!response.ok) throw new Error(`Không tải được chứng từ: ${await responseMessage(response)}`);
    return response.json() as Promise<OrderDocumentModel>;
  }

  async function word() {
    setBusy('word');
    try {
      const model = await fetchModel();
      downloadOrderWord(model);
      onMessage('Đã tải chứng từ Word-compatible (.doc).');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Không tải được chứng từ Word.');
    } finally {
      setBusy(null);
    }
  }

  async function print() {
    const popup = window.open('', '_blank');
    if (!popup) {
      onMessage('Cho phép cửa sổ bật lên rồi thử In / PDF lại.');
      return;
    }
    popup.opener = null;
    popup.document.write('<p style="font-family:sans-serif;padding:24px">Đang tải chứng từ...</p>');
    setBusy('print');
    try {
      const model = await fetchModel();
      writeOrderPrintWindow(popup, model);
      onMessage('Đã mở bản In / PDF từ dữ liệu đã lưu.');
    } catch (error) {
      popup.close();
      onMessage(error instanceof Error ? error.message : 'Không mở được bản In / PDF.');
    } finally {
      setBusy(null);
    }
  }

  return <>
    <button type="button" className="secondaryButton" disabled={disabled || busy !== null} onClick={() => void word()}><Download size={17} /> {busy === 'word' ? 'Đang tạo Word...' : 'Tải Word'}</button>
    <button type="button" className="secondaryButton" disabled={disabled || busy !== null} onClick={() => void print()}><Printer size={17} /> {busy === 'print' ? 'Đang mở bản in...' : 'In / PDF'}</button>
  </>;
}
```

- [ ] **Step 3: Integrate actions into the persisted form toolbar**

Import `OrderDocumentActions` in `OrdersClient.tsx` and add it before the existing copy/settle actions:

```tsx
<OrderDocumentActions
  type={type}
  orderId={editingId}
  disabled={isSubmitting}
  onMessage={setMessage}
/>
```

Do not render document actions in the Order list or for an unsaved create form.

- [ ] **Step 4: Extend the Orders auth contract**

In `scripts/test-orders-ui-auth-contract.sh`, read `OrderDocumentActions.tsx` into `documents` and require:

```js
assert(documents.includes("const canExportDocuments = can('order.view') && can('order.export');"), 'Order document actions should require exact view and export permissions.');
assert(documents.includes('if (!canExportDocuments || !orderId) return null;'), 'Order document actions should fail closed without export permission or persisted id.');
assert(documents.includes("type !== 'hotel-bookings'"), 'Order document actions should remain Hotel Booking specific.');
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
node scripts/test-orders-hotel-booking-documents-client-contract.js
bash scripts/test-orders-ui-auth-contract.sh
node scripts/test-orders-hotel-service-selectors-client-contract.js
node scripts/test-orders-finance-client-contract.js
npm run lint --workspace @smarttour/web
npm run build --workspace @smarttour/web
git diff --check
```

Expected: all source contracts, typecheck, and production build exit `0`.

Commit:

```bash
git add apps/web/app/orders/[type]/OrderDocumentActions.tsx apps/web/app/orders/[type]/OrdersClient.tsx scripts/test-orders-hotel-booking-documents-client-contract.js scripts/test-orders-ui-auth-contract.sh
git commit -m "feat: add hotel booking document actions"
```

### Task 4: CI, Smoke, Full Verification, Memory, and Deployment

**Files:**
- Modify: `.github/workflows/smarttour-ci.yml`
- Modify: `scripts/test-github-actions-contract.js`
- Modify: `scripts/smoke-order-lifecycle.sh`
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Add failing CI expectations**

Add these required workflow commands to `scripts/test-github-actions-contract.js`:

```js
'node scripts/test-orders-hotel-booking-documents-backend-contract.js',
'node scripts/test-orders-hotel-booking-documents-client-contract.js',
```

Run:

```bash
node scripts/test-github-actions-contract.js
```

Expected: failure because the workflow does not run the new contracts.

- [ ] **Step 2: Wire both contracts into CI**

Add both commands to `.github/workflows/smarttour-ci.yml` immediately after the existing Orders hotel selector contracts:

```yaml
          node scripts/test-orders-hotel-booking-documents-backend-contract.js
          node scripts/test-orders-hotel-booking-documents-client-contract.js
```

Run the GitHub Actions contract and both document contracts. Expected: all success markers.

- [ ] **Step 3: Add credential-dependent production smoke coverage**

In `scripts/smoke-order-lifecycle.sh`, after the customer fixture, create a minimal Hotel Booking document fixture:

```js
const hotelDocumentOrder = await request(token, 'POST', '/orders/hotel-bookings', {
  systemCode: run + '-HOTEL-DOC',
  tourCode: run + '-HOTEL-CODE',
  name: 'Hotel Document Smoke',
  customerId: customer.id,
  startDate: '2026-09-05',
  endDate: '2026-09-07',
  roomClass: 'Deluxe',
  salesItems: [{ serviceType: 'HOTEL', description: 'Deluxe Room', quantity: 1, serviceCount: 2, unitPrice: 900000, vat: 0 }],
  operationItems: [{ serviceType: 'HOTEL', bookingCode: run + '-SUP', quantity: 1, netPrice: 600000, vat: 0, status: 'WAITING' }],
  members: [{ fullName: 'Hotel Document Guest', identityNumber: run + '-ID' }],
  terms: [{ language: 'VN', terms: 'Hotel document smoke terms' }],
});
const hotelDocument = await request(token, 'GET', '/orders/hotel-bookings/' + hotelDocumentOrder.id + '/document');
if (hotelDocument.order.systemCode !== hotelDocumentOrder.systemCode || hotelDocument.documentTitle !== 'PHIẾU BOOKING PHÒNG KHÁCH SẠN') throw new Error('Hotel document endpoint returned the wrong model');
if (hotelDocument.members.length !== 1 || hotelDocument.summary.totalRevenue !== 1800000) throw new Error('Hotel document endpoint omitted persisted rows or totals');
await request(token, 'GET', '/orders/single-services/' + hotelDocumentOrder.id + '/document', undefined, [400]);
await request(token, 'DELETE', '/orders/hotel-bookings/' + hotelDocumentOrder.id);
```

The existing cleanup already deletes Orders with the shared `RUN_ID` prefix.

- [ ] **Step 4: Commit CI and smoke wiring**

Run:

```bash
node scripts/test-github-actions-contract.js
node scripts/test-orders-hotel-booking-documents-backend-contract.js
node scripts/test-orders-hotel-booking-documents-client-contract.js
git diff --check
```

Commit:

```bash
git add .github/workflows/smarttour-ci.yml scripts/test-github-actions-contract.js scripts/smoke-order-lifecycle.sh
git commit -m "test: cover hotel booking documents"
```

- [ ] **Step 5: Run the complete focused regression in the feature worktree**

Run:

```bash
node scripts/test-github-actions-contract.js
node scripts/test-orders-hotel-booking-documents-backend-contract.js
node scripts/test-orders-hotel-booking-documents-client-contract.js
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
(
  set -euo pipefail
  test ! -e .env
  ln -s /opt/smarttour/.env .env
  cleanup_env_link() { test -L .env && rm -f .env; }
  trap cleanup_env_link EXIT
  COMPOSE_PROJECT_NAME=smarttour docker compose build --no-cache --quiet api
  sed '/^docker compose build api >\/dev\/null$/d' scripts/test-order-service-flows.sh | REPO_DIR="$PWD" COMPOSE_PROJECT_NAME=smarttour bash
)
test ! -e .env && echo ENV_LINK_ABSENT
git diff --check
```

Use the temporary ignored `.env` symlink/trap pattern for worktree Docker Compose commands. Confirm `ENV_LINK_ABSENT` afterward and do not restart the production container during feature verification.

- [ ] **Step 6: Review and integrate**

Review the full range against the design with special attention to route permissions/order, data scope, supplier-sensitive field exclusion, persisted-data freshness, HTML escaping, popup timing, object URL cleanup, and Hotel Booking-only UI scope.

Fast-forward the clean feature branch into `main`. Rerun the focused contracts, API/web lint/build, Docker API build, and isolated Order service flow on `/opt/smarttour`.

- [ ] **Step 7: Push and deploy**

Run:

```bash
git push origin main
BRANCH=main bash scripts/deploy-production.sh
curl --fail --silent http://127.0.0.1:4000/api/health
```

Expected: `HEALTHCHECK_OK`, `DEPLOY_PRODUCTION_OK`, and `{"ok":true,"service":"smarttour-api"}`.

- [ ] **Step 8: Run authenticated smoke safely**

Run:

```bash
bash scripts/smoke-order-lifecycle.sh
```

If `ADMIN_PASSWORD` is unavailable, record the gap and do not change production credentials. If available, expect `SMOKE_ORDER_LIFECYCLE_OK` and cleanup of the Hotel Booking fixture.

- [ ] **Step 9: Update Memory Bank and synchronize main**

Prepend concise notes covering the protected document endpoint, Word-compatible `.doc`, browser print/PDF behavior, exact verification commands, deployed code commit, healthcheck, and authenticated smoke result/gap.

```bash
git add memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: update memory for hotel booking documents"
git push origin main
git status --short --branch
git rev-list --left-right --count main...origin/main
```

Expected: clean `main` and `0 0` synchronization.
