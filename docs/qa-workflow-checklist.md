# SmartTour QA Workflow Checklist

Use this checklist with real team data after automated smoke tests pass.

## 1. Core Business Workflows

- Customer: create, update contact fields, search by name/phone, verify timeline.
- Quotation: create FIT quotation, add line items, approve/reject, convert where applicable.
- Order: create FIT/GIT/LandTour order, update financial fields, status, copy/settle/unlock where applicable.
- Tour program and booking: create sample tour program, create booking, edit pax/date/customer fields.
- Operation form: create from booking, add service/task/cost, submit supplier payment request, approve.
- Operation voucher: create voucher, add detail rows, record partial and full payment.
- Finance: create receipt/payment/invoice, approve, reject, cancel approved voucher and verify reversal.
- Commission: sync/generate commission and compare against expected sales result.
- Supplier: create hotel/restaurant/guide supplier, update status, search/filter.
- Reports: open overview, business summary, finance, customer debt, supplier debt, employee performance.

## 2. UX/UI Checks

- Forms show validation before bad data reaches the API.
- Long text, long names, large money values, and many table rows do not overlap.
- Tables remain readable on laptop and wide desktop screens.
- Filters/search reload expected data and can be cleared.
- Actions are disabled/hidden for users without permission.
- Export buttons return files that open correctly in Excel.
- Empty states, loading states, and API errors are understandable.
- Browser back/forward keeps users in a coherent state.

## 3. Role Checks

- `super_admin`: can access every route/action.
- `sales`: can manage customers, quotes, quotations, bookings/orders allowed for sales scope; cannot access finance mutations.
- `operation`: can manage operation forms, vouchers, suppliers/guides; cannot approve finance.
- `accounting`: can access finance, commission, reports/export; cannot mutate sales/operation-only resources.

## 4. Data Scope Checks

- Create records in two different branches/departments.
- Confirm branch-scoped users see only matching branch records.
- Confirm department-scoped users see only matching department records.
- Confirm unrestricted users see all records.
- Confirm list, detail, export, dashboard, report, and mutation endpoints behave consistently.

## 5. Sign-off

Record each failed case with:

- User role and branch/department.
- Route and action.
- Input payload or screenshot.
- Expected result and actual result.
- Whether the issue is blocking go-live.
