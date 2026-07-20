# Orders Hotel Booking Documents Design

## Context

Order Center already exports filtered Order lists as CSV/XLSX. The Orders detail workflow does not yet produce a customer-facing or operational document. Hotel Booking is the best first document type because its five-step form now has stable persisted booking, room sales, room operation, member, term, and survey data.

The repository has dependency-free CSV/XLSX helpers but no production DOCX/PDF generator or bundled Vietnamese PDF font. This slice therefore separates a protected document data model from browser-side presentation: Word-compatible HTML is downloaded as `.doc`, while the browser print dialog provides printing and Save as PDF.

## Goals

- Let authorized users export a persisted Hotel Booking as a Word-compatible document.
- Let authorized users open a print layout and save it as PDF through the browser.
- Generate documents from fresh persisted data rather than unsaved form state.
- Enforce `order.view`, `order.export`, and existing branch/department data scope on the server.
- Keep the response focused on document fields and exclude Supplier financial, contact, and file data.
- Establish reusable document-model and rendering boundaries for later FIT, GIT/Combo, LandTour, flight, and single-service documents.

## Non-Goals

- No Prisma schema or migration.
- No server-generated PDF binary in this slice.
- No true OOXML `.docx` generation or new document dependencies.
- No configurable company branding, logo upload, tenant templates, electronic signatures, email, or public sharing.
- No export of unsaved create/edit form state.
- No document support for non-hotel Order types until the Hotel Booking format is operationally validated.

## Considered Approaches

### Client-only export from the open form

This is the smallest implementation, but it can export unsaved values, makes server enforcement of `order.export` weak, and couples document output to the large shared form component. It is rejected.

### Protected document model plus client renderers

The API returns a sanitized, data-scoped document model. Focused web helpers render the same escaped model into Word-compatible HTML and a print window. This requires no new dependency, keeps permission enforcement on the server, and provides a clean extension point. This is the chosen approach.

### Server-generated DOCX and PDF binaries

This provides direct file downloads and stronger layout control, but it requires new libraries, Vietnamese font assets, larger production images, and additional binary rendering tests. It is deferred until the first document layout is validated.

## API Design

Add `GET /orders/:type/:id/document` before the existing dynamic detail/write routes. The route requires both `order.view` and `order.export`.

The Orders service resolves the route type, rejects non-Hotel Booking types with a clear `400`, applies `branchDepartmentScopeWhere`, excludes soft-deleted Orders, and delegates projection to a focused `order-document.ts` helper.

The endpoint returns JSON rather than a file. The model contains:

- Document metadata: version, generated timestamp, document title, and Order type.
- Booking identity: Order id, system code, booking/tour code, name, status, branch, department, creator, operator, and notes.
- Booking dates and Hotel Booking root fields: booking/payment/check-in/check-out dates, room class, service package, quantities, and currency/exchange rate.
- Customer snapshot: name, type, phone, email, address, agency, and collaborator.
- Financial summary: total/paid/remaining revenue, total/paid/remaining cost, commission, and profit.
- Sales room rows: service type, room description, quantity, service count, selling price, VAT, amount, note, and minimal supplier/service labels.
- Operation room rows: service type, booking code, service date, quantity, NET price, VAT, amount, status, note, and minimal supplier/service labels.
- Member rows: name, gender, birth date, phone, email, identity number, nationality, passenger type, and note.
- Terms and survey content.
- Signature labels for customer, responsible staff, and operator confirmation.

Supplier projections are limited to id/code/name and service id/SKU/name. The endpoint must not expose Supplier tax, bank, debt, price policy, contacts, files, or unrelated profile data.

## Document Rendering

Create a focused web module that owns:

- The serialized `OrderDocumentModel` type.
- HTML escaping for every dynamic value.
- Date, money, quantity, and status formatting.
- A single deterministic Hotel Booking HTML body shared by Word and print output.
- Safe file-name normalization based on the persisted system code.

The layout is a dense A4 operational document with:

1. SmartTour header and `PHIEU BOOKING PHONG KHACH SAN` title.
2. Booking and customer information blocks.
3. Sales room table.
4. Operation room table.
5. Financial summary.
6. Member table when members exist.
7. Terms and service survey sections when populated.
8. Three signature columns.

Empty optional sections are omitted rather than rendered as blank tables.

### Word

`Tai Word` fetches the protected model, renders UTF-8 Word-compatible HTML with Office namespaces, prepends a BOM, and downloads it using `application/msword` with a `.doc` extension. The UI must describe it as Word-compatible `.doc`, not `.docx`.

### Print and PDF

`In / PDF` fetches the same model and opens an isolated print window with embedded A4 print CSS. The user prints or selects Save as PDF in the browser. The product must not label this as a direct PDF download.

## UI Integration

Add a small `OrderDocumentActions` component instead of expanding document logic inside `OrdersClient`.

- Render actions only for `hotel-bookings` and a persisted `editingId`.
- Hide actions unless the user has `order.view` or `order.manage` and `order.export`.
- Fetch the document model at click time through `authFetch`.
- Keep separate busy states for Word and print actions.
- Report API, popup-blocking, and download errors through the existing Orders inline message path.
- Disable document actions while the form is submitting.

Settled, completed, and cancelled persisted bookings remain exportable because document generation is read-only.

## Security and Data Integrity

- Backend permission and data scope are authoritative; hidden buttons are only a usability layer.
- The document endpoint always reloads persisted data and never accepts document content from the client.
- All HTML values are escaped before Word download or print-window insertion.
- No supplier-sensitive fields or file URLs are included.
- Existing Order customer/member data is included only for users who also hold `order.export`.
- The endpoint does not write logs or mutate lifecycle state in this slice.

## Error Handling

- Missing permissions return the normal RBAC `403`.
- Requesting a non-Hotel Booking type path returns a localized `400` unsupported-document message.
- For the `hotel-bookings` type path, a missing, deleted, different-type, or out-of-scope Order id returns `404` to avoid disclosure.
- A blocked print popup produces an inline instruction to allow popups and retry.
- Failed downloads revoke any created object URL and restore the action state.

## Testing

- Add a backend source contract for route ordering, `order.view` plus `order.export`, focused projection, data scope, and sensitive-field exclusion.
- Add an Order service-flow case that creates a Hotel Booking and verifies the document model uses persisted rows, totals, supplier/service labels, and customer/member data.
- Add a client source contract for Hotel Booking-only actions, permission checks, fresh document fetch, Word MIME/extension, HTML escaping, print-window CSS, and error handling.
- Extend the Orders auth contract so export actions fail closed without `order.export`.
- Add the document endpoint to credential-dependent Order lifecycle/export smoke when credentials are available.
- Wire new contracts into SmartTour CI and run existing Orders Finance, hotel selector, auth, write-lock, API/web lint/build, Docker build, and Order service-flow regressions.

## Deployment

Implement in an isolated worktree, fast-forward to `main` after review, and deploy with `BRANCH=main bash scripts/deploy-production.sh`. No migration is expected. Verify the internal API health endpoint, full production healthcheck, and authenticated document smoke only when existing credentials are available. Do not change production credentials to satisfy smoke tests.

## Follow-Up

After Hotel Booking document validation, extend the same model/rendering contract to other Order types. Direct PDF and true DOCX generation should be reconsidered only if browser PDF or Word-compatible `.doc` is insufficient for real operational use.
