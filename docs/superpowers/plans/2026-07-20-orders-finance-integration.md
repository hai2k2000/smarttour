# Orders Finance Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add order-scoped receipt/payment history and permission-aware draft creation to every Orders screen while keeping approval, cancellation, ledgers, cashflow, and reversals inside Finance.

**Architecture:** Extend Finance list queries with an `orderId` filter, preserve that filter in the Finance page, and add a focused `OrderFinancePanel` composed by `OrdersClient`. The panel calls existing Finance create endpoints and never mutates Order payment/cost snapshots optimistically.

**Tech Stack:** TypeScript, NestJS, Prisma, Next.js App Router, React, React Hook Form, existing source-contract scripts, Docker Compose.

---

## File Map

- Create `scripts/test-orders-finance-backend-contract.js`: source contract for Finance query filtering and supplier/order link validation.
- Modify `apps/api/src/modules/finance/dto/finance-query.dto.ts`: validate optional `orderId` list query input.
- Modify `apps/api/src/modules/finance/finance.service.ts`: filter receipts and payments by order.
- Modify `apps/api/src/modules/finance/finance-order-links.ts`: reject a direct supplier payment when the supplier is not an active operation-item supplier for the linked order.
- Modify `scripts/test-finance-service-flows.sh`: runtime coverage for order filters, data scope, and supplier/order validation.
- Create `scripts/test-orders-finance-client-contract.js`: source contract for Finance deep links and the Orders finance panel.
- Modify `apps/web/app/finance/FinanceClient.tsx`: read and preserve `orderId` from the URL.
- Create `apps/web/app/orders/[type]/OrderFinancePanel.tsx`: finance metrics, history, and draft receipt/payment UI.
- Modify `apps/web/app/orders/[type]/OrdersClient.tsx`: retain loaded order context and compose the finance panel outside the order edit form.
- Modify `apps/web/app/globals.css`: dense finance panel, table, and modal styles.
- Modify `.github/workflows/smarttour-ci.yml`: run the two new source contracts.
- Modify `scripts/test-github-actions-contract.js`: require the new CI commands.
- Modify `memory-bank/activeContext.md` and `memory-bank/progress.md`: record the completed slice and verification evidence.

### Task 1: Finance Order Filtering and Link Integrity

**Files:**
- Create: `scripts/test-orders-finance-backend-contract.js`
- Modify: `apps/api/src/modules/finance/dto/finance-query.dto.ts`
- Modify: `apps/api/src/modules/finance/finance.service.ts`
- Modify: `apps/api/src/modules/finance/finance-order-links.ts`
- Modify: `scripts/test-query-dto-contract.js`
- Modify: `scripts/test-finance-service-flows.sh`

- [ ] **Step 1: Write the failing backend source contract**

Create `scripts/test-orders-finance-backend-contract.js` with assertions equivalent to:

```js
const fs = require('fs');

const queryDto = fs.readFileSync('apps/api/src/modules/finance/dto/finance-query.dto.ts', 'utf8');
const service = fs.readFileSync('apps/api/src/modules/finance/finance.service.ts', 'utf8');
const orderLinks = fs.readFileSync('apps/api/src/modules/finance/finance-order-links.ts', 'utf8');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

requireText(queryDto, 'orderId?: string;', 'FinanceQueryDto must accept orderId');
requireText(service, "...(query.orderId ? { orders: { some: { orderId: query.orderId } } } : {}),", 'receiptWhere must filter by receipt order allocation');
requireText(service, "...(query.orderId ? { orderId: query.orderId } : {}),", 'paymentWhere must filter by direct orderId');
requireText(orderLinks, 'orderOperationItem.findFirst', 'payment link validation must inspect order operation items');
requireText(orderLinks, "status: { not: 'CANCELLED' }", 'cancelled operation items must not authorize supplier payments');
requireText(orderLinks, 'Nhà cung cấp phiếu chi không thuộc dịch vụ điều hành của booking', 'supplier/order mismatch must return an operational error');

if (failures.length) {
  console.error('FAIL_ORDERS_FINANCE_BACKEND_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_ORDERS_FINANCE_BACKEND_CONTRACT_OK');
```

Add `'orderId?: string'` to the Finance DTO token list in `scripts/test-query-dto-contract.js`.

- [ ] **Step 2: Run the source contracts and verify RED**

Run:

```bash
node scripts/test-orders-finance-backend-contract.js
node scripts/test-query-dto-contract.js
```

Expected: the new contract fails because `orderId` filtering and supplier/order validation do not exist yet.

- [ ] **Step 3: Add `orderId` query validation and Prisma filters**

Add this property to `FinanceQueryDto` near `tourId`:

```ts
@ApiPropertyOptional()
@IsOptional()
@IsString()
orderId?: string;
```

Add this fragment to `receiptWhere()` before payment method filtering:

```ts
...(query.orderId ? { orders: { some: { orderId: query.orderId } } } : {}),
```

Add this fragment to `paymentWhere()` before payment method filtering:

```ts
...(query.orderId ? { orderId: query.orderId } : {}),
```

- [ ] **Step 4: Enforce direct supplier/order ownership**

In `assertPaymentLinks()`, after validating the linked order and before returning for a missing operation voucher, add:

```ts
if (payment.supplierId && payment.orderId && !payment.operationVoucherId) {
  const linkedOperationItem = await tx.orderOperationItem.findFirst({
    where: {
      orderId: payment.orderId,
      supplierId: payment.supplierId,
      status: { not: 'CANCELLED' },
    },
    select: { id: true },
  });
  if (!linkedOperationItem) {
    throw new BadRequestException('Nhà cung cấp phiếu chi không thuộc dịch vụ điều hành của booking');
  }
}
```

Do not apply this check when `operationVoucherId` is present because the existing voucher ownership checks remain authoritative for that path.

- [ ] **Step 5: Add runtime service-flow coverage**

In `scripts/test-finance-service-flows.sh`, create one active `OrderOperationItem` for `supplier` and `order` after the order fixture is created:

```js
await prisma.orderOperationItem.create({
  data: {
    orderId: order.id,
    supplierId: supplier.id,
    serviceType: 'HOTEL',
    quantity: 1,
    netPrice: 700,
    amount: 700,
    status: 'CONFIRMED',
  },
});
```

After the existing primary receipt and payment fixtures exist, add assertions:

```js
const orderReceipts = await finance.listReceipts({ orderId: order.id, take: '1000' }, branchUser);
assert(orderReceipts.rows.length > 0 && orderReceipts.rows.every((row) => row.orders.some((line) => line.orderId === order.id)), 'receipt orderId filter must return only allocated receipts');
const orderPayments = await finance.listPayments({ orderId: order.id, take: '1000' }, branchUser);
assert(orderPayments.rows.length > 0 && orderPayments.rows.every((row) => row.orderId === order.id), 'payment orderId filter must return only linked payments');
const hiddenReceipts = await finance.listReceipts({ orderId: order.id, take: '1000' }, outOfScopeUser);
const hiddenPayments = await finance.listPayments({ orderId: order.id, take: '1000' }, outOfScopeUser);
assert(hiddenReceipts.rows.length === 0 && hiddenPayments.rows.length === 0, 'order finance filters must preserve branch data scope');
await rejects(() => finance.createPayment({
  voucherCode: run + '-UNLINKED-ORDER-SUPPLIER',
  voucherName: 'Unlinked order supplier',
  voucherType: 'SUPPLIER_PAYMENT',
  supplierId: otherSupplier.id,
  orderId: order.id,
  tourId: tour.id,
  totalAmount: 10,
  paymentAmount: 10,
}), 'direct order payment should reject a supplier outside order operation items');
```

- [ ] **Step 6: Run backend verification and verify GREEN**

Run:

```bash
node scripts/test-orders-finance-backend-contract.js
node scripts/test-query-dto-contract.js
node scripts/test-finance-query-validation-contract.js
bash scripts/test-finance-service-flows.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
git diff --check
```

Expected: every command exits `0`; the service flow prints its existing success marker.

- [ ] **Step 7: Commit backend changes**

```bash
git add apps/api/src/modules/finance/dto/finance-query.dto.ts apps/api/src/modules/finance/finance.service.ts apps/api/src/modules/finance/finance-order-links.ts scripts/test-orders-finance-backend-contract.js scripts/test-query-dto-contract.js scripts/test-finance-service-flows.sh
git commit -m "feat: filter finance documents by order"
```

### Task 2: Finance Page Order Deep Link

**Files:**
- Create: `scripts/test-orders-finance-client-contract.js`
- Modify: `apps/web/app/finance/FinanceClient.tsx`

- [ ] **Step 1: Write the failing Finance deep-link contract**

Create `scripts/test-orders-finance-client-contract.js` and initially require these FinanceClient tokens:

```js
const fs = require('fs');
const financeClient = fs.readFileSync('apps/web/app/finance/FinanceClient.tsx', 'utf8');
const failures = [];
function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}
requireText(financeClient, "const orderId = searchParams.get('orderId')?.trim() || '';", 'Finance page must read orderId from URL');
requireText(financeClient, "if (orderId) params.set('orderId', orderId);", 'Finance list query must include orderId');
requireText(financeClient, "if (orderId) nextParams.set('orderId', orderId);", 'Finance tab navigation must preserve orderId');
if (failures.length) {
  console.error('FAIL_ORDERS_FINANCE_CLIENT_CONTRACT');
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
console.log('TEST_ORDERS_FINANCE_CLIENT_CONTRACT_OK');
```

- [ ] **Step 2: Run the client contract and verify RED**

Run:

```bash
node scripts/test-orders-finance-client-contract.js
```

Expected: FAIL because FinanceClient ignores `orderId`.

- [ ] **Step 3: Preserve `orderId` in FinanceClient**

Read the URL value beside the current tab parsing:

```ts
const orderId = searchParams.get('orderId')?.trim() || '';
```

Include it in the memoized list query:

```ts
if (orderId) params.set('orderId', orderId);
```

Add `orderId` to the `useMemo` dependency list. Replace `openTab()` URL construction with:

```ts
function openTab(nextTab: FinanceTab) {
  setTab(nextTab);
  const nextParams = new URLSearchParams();
  if (nextTab !== 'receipts') nextParams.set('tab', nextTab);
  if (orderId) nextParams.set('orderId', orderId);
  const suffix = nextParams.toString();
  router.push(suffix ? `/finance?${suffix}` : '/finance', { scroll: false });
}
```

- [ ] **Step 4: Run Finance client regression verification**

Run:

```bash
node scripts/test-orders-finance-client-contract.js
bash scripts/test-finance-client-contract.sh
npm run lint --workspace @smarttour/web
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit the deep-link change**

```bash
git add apps/web/app/finance/FinanceClient.tsx scripts/test-orders-finance-client-contract.js
git commit -m "feat: preserve order filters in finance"
```

### Task 3: Orders Finance Panel

**Files:**
- Create: `apps/web/app/orders/[type]/OrderFinancePanel.tsx`
- Modify: `apps/web/app/orders/[type]/OrdersClient.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `scripts/test-orders-finance-client-contract.js`

- [ ] **Step 1: Extend the client contract and verify RED**

Extend `scripts/test-orders-finance-client-contract.js` to read `OrderFinancePanel.tsx`, `OrdersClient.tsx`, and `globals.css`, then require:

```js
requireText(ordersClient, "import OrderFinancePanel, { type OrderFinanceOrder } from './OrderFinancePanel';", 'OrdersClient must compose the finance panel');
requireText(ordersClient, 'const [financeOrder, setFinanceOrder] = useState<OrderFinanceOrder | null>(null);', 'OrdersClient must retain loaded finance context');
requireText(ordersClient, '<OrderFinancePanel order={financeOrder} />', 'OrdersClient must render finance outside the edit form');
requireText(panel, "can('finance.receipt.view')", 'receipt history must be permission gated');
requireText(panel, "can('finance.payment.view')", 'payment history must be permission gated');
requireText(panel, "can('finance.receipt.create')", 'receipt creation must be permission gated');
requireText(panel, "can('finance.payment.create')", 'payment creation must be permission gated');
requireText(panel, '/api/finance/receipts?${params.toString()}', 'panel must load order receipts');
requireText(panel, '/api/finance/payments?${params.toString()}', 'panel must load order payments');
requireText(panel, "orders: [{ orderId: order.id, orderCode: order.systemCode", 'receipt payload must allocate to the order');
requireText(panel, 'supplierId: paymentDraft.supplierId', 'payment payload must submit selected supplier');
requireText(panel, 'orderId: order.id', 'payment payload must link the order');
requireText(panel, "item.status !== 'CANCELLED'", 'supplier choices must exclude cancelled operation items');
requireText(panel, '/finance?tab=receipts&orderId=', 'panel must deep-link receipt history');
requireText(panel, '/finance?tab=payments&orderId=', 'panel must deep-link payment history');
for (const forbidden of ['/approve', '/reject', '/cancel']) {
  if (panel.includes(forbidden)) failures.push(`Orders finance panel must not expose ${forbidden} actions`);
}
requireText(css, '.orderFinancePanel', 'Orders finance panel styles are missing');
requireText(css, '.orderFinanceHistoryGrid', 'Orders finance history grid styles are missing');
```

Run `node scripts/test-orders-finance-client-contract.js` and expect failure because the component does not exist.

- [ ] **Step 2: Create focused finance types and loading behavior**

Create `OrderFinancePanel.tsx` with exported types matching the loaded Order detail:

```ts
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { authFetch, authHeaders, authJsonHeaders } from '../../authFetch';
import { viStatus } from '../../i18n';
import { usePermissions } from '../../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export type OrderFinanceOrder = {
  id: string;
  systemCode: string;
  tourCode?: string | null;
  name: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  branch?: string | null;
  department?: string | null;
  totalRevenue: string | number;
  paidAmount: string | number;
  remainingRevenue: string | number;
  totalCost: string | number;
  paidCost: string | number;
  remainingCost: string | number;
  operationItems?: Array<{
    supplierId?: string | null;
    status?: string | null;
    supplier?: { id: string; name: string } | null;
  }>;
};

type ReceiptRow = {
  id: string;
  receiptCode: string;
  receiptName?: string | null;
  paymentDate?: string | null;
  receiptAmount: string | number;
  approvalStatus: string;
  payerName?: string | null;
};

type PaymentRow = {
  id: string;
  voucherCode: string;
  voucherName?: string | null;
  paymentDate?: string | null;
  paymentAmount: string | number;
  approvalStatus: string;
  receiverName?: string | null;
};
```

Export the completed component with the exact signature `export default function OrderFinancePanel({ order }: { order: OrderFinanceOrder })` and initialize permissions with `const { can, permissionsReady } = usePermissions();`.

Use `usePermissions()` and independent `loadReceipts()` / `loadPayments()` functions. Each function sends `orderId` and `take=50`, clears only its own error, and leaves the other list usable when one request fails.

- [ ] **Step 3: Implement permission-aware draft payloads**

Use controlled draft state with positive numeric amounts. Receipt submission calls `/api/finance/receipts` with:

```ts
const amount = Number(receiptDraft.amount);
const payload = {
  receiptName: receiptDraft.name || `Thu ${order.systemCode}`,
  receiptType: 'TOUR_PAYMENT',
  paymentMethod: receiptDraft.paymentMethod,
  paymentDate: receiptDraft.paymentDate || undefined,
  customerId: order.customerId || undefined,
  payerName: order.customerName || undefined,
  payerPhone: order.customerPhone || undefined,
  payerEmail: order.customerEmail || undefined,
  totalAmount: Number(order.totalRevenue),
  paidBefore: Number(order.paidAmount),
  receiptAmount: amount,
  branch: order.branch || undefined,
  department: order.department || undefined,
  orders: [{ orderId: order.id, orderCode: order.systemCode, tourCode: order.tourCode, tourName: order.name, amount }],
};
```

Payment submission calls `/api/finance/payments` with:

```ts
const supplier = suppliers.find((item) => item.id === paymentDraft.supplierId);
const amount = Number(paymentDraft.amount);
const payload = {
  voucherName: paymentDraft.name || `Chi ${order.systemCode}`,
  voucherType: 'SUPPLIER_PAYMENT',
  paymentMethod: paymentDraft.paymentMethod,
  paymentDate: paymentDraft.paymentDate || undefined,
  supplierId: paymentDraft.supplierId,
  orderId: order.id,
  tourCode: order.tourCode || undefined,
  receiverName: supplier?.name,
  totalAmount: amount,
  paymentAmount: amount,
  branch: order.branch || undefined,
  department: order.department || undefined,
};
```

Build `suppliers` with a `Map` from operation items satisfying `item.supplierId`, `item.supplier`, and `item.status !== 'CANCELLED'`. Reject missing supplier, non-finite amount, amount `<= 0`, and receipt amounts greater than `remainingRevenue` before sending.

After success, close only the relevant draft modal and reload only its history list. Do not modify Order snapshot props in local state.

- [ ] **Step 4: Render metrics, history, modal inputs, and Finance links**

Render nothing when permissions are not ready or when the user has neither `finance.receipt.view` nor `finance.payment.view`.

Render six persisted snapshot metrics, two compact tables, empty states, and these links:

```tsx
<Link href={`/finance?tab=receipts&orderId=${encodeURIComponent(order.id)}`}>Mở phiếu thu trong Finance</Link>
<Link href={`/finance?tab=payments&orderId=${encodeURIComponent(order.id)}`}>Mở phiếu chi trong Finance</Link>
```

Use `type="button"` for every panel action. Do not add approve, reject, cancel, delete, or settlement controls.

- [ ] **Step 5: Compose the panel from OrdersClient without nested forms**

Import the component and add state:

```ts
import OrderFinancePanel, { type OrderFinanceOrder } from './OrderFinancePanel';

const [financeOrder, setFinanceOrder] = useState<OrderFinanceOrder | null>(null);
```

In `loadOrder()`, set the full loaded detail before resetting the order form:

```ts
setFinanceOrder(order as OrderFinanceOrder);
```

Clear it in the no-permission effect, `openCreate()`, `closeForm()`, and after a successful save closes the modal.

Keep the existing modal and Order form body unchanged. Replace the current closing suffix:

```tsx
</form></div></div> : null}
```

with this sibling composition:

```tsx
</form>{financeOrder ? <OrderFinancePanel order={financeOrder} /> : null}</div></div> : null}
```

This keeps receipt/payment inputs outside the Order form and prevents Enter/button events from submitting the wrong workflow.

- [ ] **Step 6: Add responsive dense ERP styles**

Add styles to `globals.css` for:

```css
.orderFinancePanel { border-top: 1px solid var(--dn-border); padding: 20px; background: var(--dn-surface); }
.orderFinanceMetrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.orderFinanceMetric { border: 1px solid var(--dn-border); border-radius: var(--dn-radius-md); padding: 10px; background: var(--dn-surface-soft); }
.orderFinanceHistoryGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
.orderFinanceTable { width: 100%; border-collapse: collapse; }
.orderFinanceTable th, .orderFinanceTable td { padding: 8px; border-bottom: 1px solid var(--dn-border); text-align: left; }
.orderFinanceDraftGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1100px) {
  .orderFinanceMetrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .orderFinanceHistoryGrid { grid-template-columns: 1fr; }
}
@media (max-width: 700px) {
  .orderFinanceMetrics, .orderFinanceDraftGrid { grid-template-columns: 1fr; }
}
```

Use the exact `--dn-*` variables shown above so the panel follows the existing SmartTour visual system.

- [ ] **Step 7: Run Orders UI verification and verify GREEN**

Run:

```bash
node scripts/test-orders-finance-client-contract.js
bash scripts/test-orders-ui-auth-contract.sh
bash scripts/test-finance-client-contract.sh
npm run lint --workspace @smarttour/web
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 8: Commit the Orders panel**

```bash
git add apps/web/app/orders/[type]/OrderFinancePanel.tsx apps/web/app/orders/[type]/OrdersClient.tsx apps/web/app/globals.css scripts/test-orders-finance-client-contract.js
git commit -m "feat: add order finance panel"
```

### Task 4: CI, Full Verification, Deployment, and Memory

**Files:**
- Modify: `.github/workflows/smarttour-ci.yml`
- Modify: `scripts/test-github-actions-contract.js`
- Modify: `memory-bank/activeContext.md`
- Modify: `memory-bank/progress.md`

- [ ] **Step 1: Add failing CI contract expectations**

Add these commands to the required CI command list in `scripts/test-github-actions-contract.js`:

```js
'node scripts/test-orders-finance-backend-contract.js',
'node scripts/test-orders-finance-client-contract.js',
```

Run `node scripts/test-github-actions-contract.js` and expect failure because the workflow does not run them yet.

- [ ] **Step 2: Wire source contracts into SmartTour CI**

Add both commands to the `Source contracts` block in `.github/workflows/smarttour-ci.yml`, directly after `test-query-dto-contract.js`.

Run:

```bash
node scripts/test-github-actions-contract.js
node scripts/test-orders-finance-backend-contract.js
node scripts/test-orders-finance-client-contract.js
```

Expected: all print their success markers.

- [ ] **Step 3: Run the complete focused regression set**

Run:

```bash
node scripts/test-query-dto-contract.js
node scripts/test-finance-query-validation-contract.js
bash scripts/test-finance-helper-contracts.sh
bash scripts/test-finance-service-flows.sh
bash scripts/test-order-service-flows.sh
bash scripts/test-orders-ui-auth-contract.sh
bash scripts/test-finance-client-contract.sh
npm run lint --workspace @smarttour/api
npm run build --workspace @smarttour/api
npm run lint --workspace @smarttour/web
npm run build --workspace @smarttour/web
git diff --check
```

Expected: all commands exit `0` with no contract, typecheck, build, or whitespace failures.

- [ ] **Step 4: Commit CI wiring**

```bash
git add .github/workflows/smarttour-ci.yml scripts/test-github-actions-contract.js
git commit -m "test: cover order finance integration"
```

- [ ] **Step 5: Rebuild and deploy API/Web on the VPS**

Run from `/opt/smarttour`:

```bash
docker compose build api web
docker compose up -d api web
curl --fail --silent http://127.0.0.1:4000/api/health
```

Expected: Docker builds complete, both services are running, and health returns `{"ok":true,"service":"smarttour-api"}`.

- [ ] **Step 6: Run authenticated production smoke where credentials are available**

Run the existing Orders and Finance smoke commands that do not require resetting production credentials:

```bash
bash scripts/smoke-order-lifecycle.sh
bash scripts/smoke-finance-reports.sh
```

If either script explicitly reports missing `ADMIN_PASSWORD`, record it as a credential-dependent gap and do not change production credentials.

- [ ] **Step 7: Update Memory Bank**

Prepend concise completion notes to `memory-bank/activeContext.md` and `memory-bank/progress.md` covering:

```text
- Orders Finance integration slice:
  - Finance receipt/payment lists now accept orderId while preserving data scope.
  - Direct order supplier payments require a non-cancelled operation item link.
  - Orders shows permission-aware finance snapshots/history and creates DRAFT receipts/payments only.
  - Approval/cancel/reversal remains in Finance; no schema migration was added.
  - Record the exact verification and production health commands that passed.
```

- [ ] **Step 8: Commit docs, push, and verify clean sync**

```bash
git add memory-bank/activeContext.md memory-bank/progress.md
git commit -m "docs: update memory for order finance integration"
git push origin main
git status --short --branch
git rev-list --left-right --count main...origin/main
```

Expected: the push succeeds, status is clean, and rev-list prints `0 0`.
