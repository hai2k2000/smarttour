# Orders Finance Integration Design

## Context

The shared Orders module already stores revenue and cost snapshots on `Order`, while Finance owns receipts, payments, approval state, cashflow, ledgers, reversals, and the transaction-safe snapshot updates applied on approval or cancellation.

The Orders UI currently has no order-scoped finance history or draft creation flow. Operators must re-enter order, customer, tour, branch, and supplier context in the Finance screen. Adding approval actions directly to Orders would duplicate Finance workflow and permission rules.

This is the first of four sequential Orders slices:

1. Order finance history and draft receipt/payment creation.
2. Hotel supplier, room, and service selectors.
3. Order approval workflow.
4. Order export and member import/export.

## Design

Keep Finance as the sole owner of finance documents and their lifecycle. Orders will compose existing Finance APIs instead of introducing duplicate receipt/payment models or approval endpoints.

### Finance Query Support

- Add optional `orderId` validation to `FinanceQueryDto`.
- Receipt list filtering uses `orders.some.orderId = orderId`.
- Payment list filtering uses `orderId = orderId`.
- Existing branch and department data scope remains applied after the order filter.
- Existing Finance list response shapes and summary calculations remain unchanged.

### Orders UI

Show an `Order finance` panel only while an existing order is open for detail or edit. Do not add another wizard step because all six order types share the same finance behavior.

The panel contains:

- Revenue metrics from the Order snapshot: total revenue, paid amount, and remaining revenue.
- Cost metrics from the Order snapshot: total cost, paid cost, and remaining cost.
- A compact receipt history table.
- A compact payment history table.
- Permission-aware actions for creating draft receipts and payments.
- Links to the Finance page with the current `orderId` and target tab.

Receipt creation pre-fills the order, customer, tour, branch, payer, and remaining revenue. The submitted allocation contains the persisted order id and order code. The user may adjust the positive receipt amount before submission.

Payment creation pre-fills the order, tour, and branch. The user must select a supplier referenced by an active order operation item and enter a positive amount. This avoids silently allocating the full order cost to one supplier when an order has several suppliers.

Both actions call the existing Finance create endpoints and create `DRAFT` documents. Orders will not expose approve, reject, cancel, delete, or reversal actions.

### Data Refresh

- Load finance history only after an existing order is opened.
- Request receipt and payment history independently so one missing view permission does not hide the other section.
- After draft creation, reload only the affected history list.
- Do not update Order payment/cost snapshots optimistically. Existing Finance approval and cancellation logic remains responsible for `paidAmount`, `paidCost`, and remaining snapshots.
- Reloading the order detail reflects approved or reversed Finance postings.

## Permissions and Security

- Order content still requires `order.view`.
- Receipt history requires `finance.receipt.view`.
- Receipt draft creation requires `finance.receipt.create`.
- Payment history requires `finance.payment.view`.
- Payment draft creation requires `finance.payment.create`.
- The new finance panel is hidden when the user has neither Finance view permission. Existing Order field visibility remains unchanged by this slice.
- Finance services continue to validate branch/department scope, customer/order links, supplier/order links, and actor identity.
- The client does not send approval actors or workflow state.

## Error Handling

- Keep modal input intact when Finance rejects a request.
- Display the API business error without optimistic list or snapshot changes.
- Treat receipt and payment history failures independently.
- Do not add new Order lifecycle restrictions; Finance remains responsible for deciding whether the referenced order and document type are valid.

## Boundaries

This slice does not add database migrations, Finance approval actions to Orders, supplier debt allocation, invoice creation, file attachments, order approval workflow, hotel room selectors, exports, or member import/export.

## Testing

Use RED/GREEN coverage for:

- `FinanceQueryDto.orderId` validation and controller propagation.
- Receipt and payment order filtering with branch/department data scope preserved.
- Orders client permission gates and independent history loading.
- Draft receipt payload with an order allocation.
- Draft payment payload with order and selected supplier links.
- Absence of approve, reject, and cancel actions in Orders.
- No optimistic mutation of Order payment/cost snapshots.

Then run focused Finance and Orders service flows, permission/source contracts, API build/lint, Web typecheck/lint, diff checks, Docker deployment, production healthcheck, and relevant authenticated smoke coverage.
