# SmartTour Tour Management Module

## Current Assessment

The current implementation has a working first FIT slice:

- `fit_tours`
- `fit_common_costs`
- `fit_hotel_costs`
- `fit_private_costs`
- `fit_budget_services`
- `fit_operation_services`
- `fit_tour_guides`
- `fit_handover_items`
- `fit_survey_questions`
- `fit_attachments`
- `/api/fit-tours`
- `/fit-tours`

This is useful as a workflow prototype, but the new product direction requires a shared Tour core for FIT, GIT, and LandTour. Continuing with isolated `fit_*`, `git_*`, and `landtour_*` roots would duplicate customers, suppliers, attachments, finance, operations, reports, surveys, and audit logs.

## Target Architecture

Use one common `Tour` aggregate with type-specific extension tables.

```text
Tour
|-- FIT extension
|-- GIT extension
`-- LandTour extension

Common children:
|-- Customers
|-- Suppliers
|-- Services
|-- Revenues
|-- Costs
|-- Operations
|-- Guides
|-- Attachments
|-- Notes
|-- Terms
|-- Surveys
|-- Payments
|-- Receipts
|-- Expenses
`-- Logs
```

## Core Enums

```prisma
enum TourType {
  FIT
  GIT
  LANDTOUR
}

enum TourStatus {
  DRAFT
  UPCOMING
  RUNNING
  COMPLETED
  CANCELLED
  SETTLED
}

enum PaymentStatus {
  UNPAID
  PARTIAL
  PAID
  REFUND
}
```

Keep workflow state separate from accounting/payment status.

## Common Tables

### tours

The canonical tour record for all product types.

Key fields:

- `id`
- `type`
- `status`
- `paymentStatus`
- `systemCode`
- `tourCode`
- `name`
- `marketGroup`
- `tourType`
- `bookingDate`
- `paymentDueDate`
- `startDate`
- `endDate`
- `createdBy`
- `operatorOwner`
- `branch`
- `department`
- `customerSource`
- `exchangeRateCode`
- `exchangeRate`
- `route`
- `flightRoute`
- `pickupPoint`
- `dropoffPoint`
- `notes`
- `createdAt`
- `updatedAt`

### tour_customers

Use this for FIT passengers, GIT customer/company/agent, and LandTour buyer.

Key fields:

- `tourId`
- `customerType`
- `name`
- `phone`
- `email`
- `dateOfBirth`
- `passportNo`
- `nationality`
- `groupName`
- `isPrimary`
- `notes`

### tour_suppliers

Common supplier assignment.

Key fields:

- `tourId`
- `supplierId`
- `serviceType`
- `role`
- `status`
- `notes`

### tour_services

The shared service line. Sales estimate and operation confirmation should live here instead of separate per-product tables unless the product has a truly unique field.

Key fields:

- `tourId`
- `serviceType`
- `supplierId`
- `serviceDate`
- `description`
- `quantity`
- `unit`
- `currency`
- `exchangeRate`
- `salesUnitPrice`
- `budgetUnitPrice`
- `confirmedUnitPrice`
- `vat`
- `salesAmount`
- `budgetAmount`
- `confirmedAmount`
- `confirmationStatus`
- `bookingCode`
- `notes`

### tour_revenues

Common revenue items for FIT/GIT/LandTour.

Key fields:

- `tourId`
- `description`
- `customerId`
- `quantity`
- `unitPrice`
- `currency`
- `exchangeRate`
- `vat`
- `amount`
- `invoiceNo`
- `paymentStatus`
- `notes`

### tour_costs

Common cost items. Can link to a service and supplier.

Key fields:

- `tourId`
- `serviceId`
- `supplierId`
- `costType`
- `description`
- `expectedAmount`
- `actualAmount`
- `currency`
- `exchangeRate`
- `vat`
- `invoiceNo`
- `paymentStatus`
- `notes`

### tour_operations

Operational tasks and checklist items.

Key fields:

- `tourId`
- `title`
- `assignee`
- `dueDate`
- `status`
- `priority`
- `notes`

### tour_guides

Key fields:

- `tourId`
- `guideId`
- `name`
- `phone`
- `guideType`
- `notes`

### tour_attachments

Key fields:

- `tourId`
- `step`
- `fileName`
- `fileUrl`
- `mimeType`
- `size`
- `uploadedBy`

### tour_notes, tour_terms, tour_surveys

Keep documents and survey questions common, with a `section` or `language` field where needed.

### tour_payments, tour_receipts, tour_expenses

Finance should be common across products. Link each receipt/payment/expense to `tourId`, and optionally to a customer, supplier, revenue, or cost line.

### tour_logs

Audit trail for common functions:

- create
- edit
- delete
- copy tour
- export
- send email
- print document
- generate SmartLink
- upload attachment
- approval action
- close accounting

## Type-Specific Extension Tables

### FIT extension

`fit_tour_details`

- `tourId`
- `seatCount`
- `availableSeats`
- `adultPrice`
- `childPrice`
- `infantPrice`
- `discount`
- `surcharge`
- `holdUntil`
- `confirmedAt`
- `closeAt`
- `allowOverbooking`
- `smartLinkCode`

Additional FIT tables:

- `fit_seat_holdings`
- `fit_booking_groups`
- `fit_passengers`
- `fit_refunds`
- `fit_transfer_history`

### GIT extension

`git_tour_details`

- `tourId`
- `holdCode`
- `itinerarySummary`
- `agentName`
- `collaborator`
- `commissionRate`
- `invoiceStatus`
- `accountCode`

Additional GIT tables:

- `git_revenue_items`
- `git_budget_services`
- `git_operation_services`
- `git_payment_requests`

These can initially be views or compatibility wrappers over `tour_revenues`, `tour_services`, and `tour_costs` unless unique GIT fields require separate storage.

### LandTour extension

`landtour_details`

- `tourId`
- `guideName`
- `termsVi`
- `termsEn`
- `autoTermsEnabled`
- `smartLinkCode`

Additional LandTour tables:

- `landtour_services`
- `landtour_terms`
- `landtour_service_confirmations`

These should map onto `tour_services` and `tour_terms` where possible.

## Workflow Design

### FIT

```text
DRAFT
-> PRICING
-> TOUR_INFO
-> BUDGET
-> OPERATION
-> HANDOVER
-> SURVEY
-> COMPLETED
```

### GIT

```text
DRAFT
-> TOUR_INFO
-> CUSTOMER_INFO
-> REVENUE
-> COSTING
-> OPERATION
-> HANDOVER
-> SURVEY
-> SETTLEMENT
```

### LandTour

```text
DRAFT
-> TOUR_INFO
-> CUSTOMER_INFO
-> SALES_SERVICES
-> OPERATION_SERVICES
-> TERMS
-> CONFIRMATION
-> SETTLEMENT
```

Store product workflow in a `tour_workflow_step` field or a `tour_logs` event stream. Do not overload `TourStatus`; `TourStatus` is the lifecycle state.

## API Design

Prefer a common route plus typed subroutes:

```text
POST   /tours
GET    /tours
GET    /tours/:id
PUT    /tours/:id
DELETE /tours/:id

POST   /tours/:id/copy
POST   /tours/:id/export
POST   /tours/:id/attachments
POST   /tours/:id/smart-link

POST   /fit-tours
GET    /fit-tours
GET    /fit-tours/:id
PUT    /fit-tours/:id

POST   /git-tours
GET    /git-tours
GET    /git-tours/:id
PUT    /git-tours/:id

POST   /landtours
GET    /landtours
GET    /landtours/:id
PUT    /landtours/:id
```

Implementation rule:

- `/tours` owns common fields and reporting queries.
- `/fit-tours`, `/git-tours`, and `/landtours` orchestrate product-specific forms and defaults.
- Finance/reporting must query common tables first.

## UI Design

Use one Tour Management section with tabs:

- FIT
- GIT
- LandTour
- Calendar
- Reports

Each product list needs:

- dashboard counters
- filters
- dense table
- status chips
- payment status chips
- quick actions

FIT keeps the current 6-step wizard, but it should save into common `tours` plus FIT extension tables.

GIT and LandTour should reuse:

- customer panels
- supplier selectors
- service tables
- revenue/cost summaries
- attachments
- document print/export actions

## Migration Plan From Current State

### Phase A: Add Common Tour Core

Add enums and common tables while keeping existing `fit_tours` working.

New code should write both:

- common `tours`
- compatibility `fit_tours` during transition

### Phase B: Move FIT to Common Core

Create a migration script:

```text
fit_tours -> tours + fit_tour_details
fit_budget_services -> tour_services
fit_operation_services -> tour_services
fit_attachments -> tour_attachments
fit_tour_guides -> tour_guides
fit_survey_questions -> tour_surveys
```

Keep old `fit_*` tables read-only until the new UI is verified.

### Phase C: Build GIT and LandTour on Common Core

Do not create independent `git_tours` or `landtour_tours` roots. Use `tours.type`.

### Phase D: Finance and Reports

Build reports from:

- `tour_revenues`
- `tour_costs`
- `tour_receipts`
- `tour_payments`
- `tour_expenses`

This avoids one report implementation per product type.

## Immediate Implementation Recommendation

Next engineering step should be:

1. Add common `TourType`, `TourStatus`, and `PaymentStatus` enums.
2. Add common `Tour`, `TourCustomer`, `TourService`, `TourRevenue`, `TourCost`, `TourGuide`, `TourAttachment`, `TourSurvey`, and `TourLog` models.
3. Add `FitTourDetail` and FIT special tables.
4. Refactor current FIT API to create/update common `Tour` first, then FIT detail.
5. Keep current `/fit-tours` UI route, but change its data shape behind the API.

Do not start GIT or LandTour implementation until the common tour core is in place.
