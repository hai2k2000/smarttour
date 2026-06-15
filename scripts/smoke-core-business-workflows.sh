#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000/api}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smarttour-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-smarttour}"
RUN_ID="${RUN_ID:-CORE-WF-$(date +%s)}"
RUN_ID_LOWER="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
RUN_ID_SAFE="$(printf '%s' "$RUN_ID_LOWER" | tr -c 'a-z0-9_' '_')"
CORE_TOKEN="${CORE_TOKEN:-${RUN_ID}.core-workflow-token}"
CORE_TOKEN_HASH="$(printf '%s' "$CORE_TOKEN" | sha256sum | awk '{print $1}')"
ROLE_ID="role_core_wf_${RUN_ID_SAFE}"
USER_ID="user_core_wf_${RUN_ID_SAFE}"
SESSION_ID="session_core_wf_${RUN_ID_SAFE}"

psql_exec() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d smarttour "$@"
}

cleanup() {
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
    echo "skip DB cleanup ($POSTGRES_CONTAINER not available)"
    return
  fi
  psql_exec >/dev/null <<SQL || true
DELETE FROM "CommissionPayment" WHERE "commissionId" IN (SELECT id FROM "CommissionEntry" WHERE "orderCode" LIKE '${RUN_ID}%');
DELETE FROM "CommissionLog" WHERE "commissionId" IN (SELECT id FROM "CommissionEntry" WHERE "orderCode" LIKE '${RUN_ID}%');
DELETE FROM "CommissionEntry" WHERE "orderCode" LIKE '${RUN_ID}%';
DELETE FROM "AuditLog" WHERE metadata::text LIKE '%${RUN_ID}%' OR "entityId" IN (
  SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%')
  UNION SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%')
  UNION SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%')
);
DELETE FROM "FinanceCashflowEntry" WHERE "receiptId" IN (
  SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%')
) OR "paymentId" IN (
  SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%')
);
DELETE FROM "CustomerLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%'
  OR "receiptId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%'))
  OR "invoiceId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%'));
DELETE FROM "SupplierLedgerEntry" WHERE "documentCode" LIKE '${RUN_ID}%'
  OR "paymentId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%'));
DELETE FROM "FinanceInvoiceItem" WHERE "invoiceId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%'));
DELETE FROM "FinanceInvoiceFile" WHERE "invoiceId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%'));
DELETE FROM "FinanceInvoice" WHERE "reversalOfId" IN (SELECT id FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceInvoice" WHERE "invoiceCode" LIKE '${RUN_ID}%';
DELETE FROM "FinanceReceiptOrder" WHERE "receiptId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%' OR "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%'));
DELETE FROM "FinanceReceipt" WHERE "reversalOfId" IN (SELECT id FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%');
DELETE FROM "FinanceReceipt" WHERE "receiptCode" LIKE '${RUN_ID}%';
DELETE FROM "FinancePayment" WHERE "reversalOfId" IN (SELECT id FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "FinancePayment" WHERE "voucherCode" LIKE '${RUN_ID}%';
DELETE FROM "OperationVoucherPayment" WHERE "voucherId" IN (SELECT id FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "OperationVoucherDetail" WHERE "voucherId" IN (SELECT id FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%');
DELETE FROM "OperationVoucher" WHERE "voucherCode" LIKE '${RUN_ID}%';
UPDATE "SupplierPaymentRequest" SET "financePaymentId" = NULL WHERE code LIKE '${RUN_ID}%';
DELETE FROM "SupplierPaymentItem" WHERE "requestId" IN (SELECT id FROM "SupplierPaymentRequest" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "SupplierPaymentRequest" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "OperationTask" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationCost" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationService" WHERE "operationFormId" IN (SELECT id FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%');
DELETE FROM "OperationForm" WHERE notes LIKE '${RUN_ID}%';
DELETE FROM "Tour" WHERE "systemCode" LIKE '${RUN_ID}%' OR "tourCode" LIKE '${RUN_ID}%';
DELETE FROM "OrderFile" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderLog" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderGuide" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderSalesItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderOperationItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderMember" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderItinerary" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderHandoverItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderSurveyQuestion" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "OrderTerm" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%');
DELETE FROM "Order" WHERE "systemCode" LIKE '${RUN_ID}%';
DELETE FROM "Booking" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "TourItineraryDay" WHERE "tourProgramId" IN (SELECT id FROM "TourProgram" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "TourProgram" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "QuotationApprovalLog" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "QuotationItem" WHERE "quotationId" IN (SELECT id FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%');
DELETE FROM "Quotation" WHERE "quoteCode" LIKE '${RUN_ID}%';
DELETE FROM "CustomerTimeline" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "CustomerContact" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE code LIKE '${RUN_ID}%');
DELETE FROM "Customer" WHERE code LIKE '${RUN_ID}%';
DELETE FROM "SupplierAllotmentAllocation" WHERE "allotmentId" IN (SELECT id FROM "SupplierAllotment" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%'));
DELETE FROM "SupplierAllotmentLog" WHERE "allotmentId" IN (SELECT id FROM "SupplierAllotment" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%'));
DELETE FROM "SupplierAllotment" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "SupplierFile" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "SupplierContact" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "SupplierService" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "HotelSupplier" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%');
DELETE FROM "Supplier" WHERE "supplierCode" LIKE '${RUN_ID}%';
DELETE FROM "UserSession" WHERE id = '${SESSION_ID}' OR "userId" = '${USER_ID}';
DELETE FROM "UserRole" WHERE "userId" = '${USER_ID}' OR "roleId" = '${ROLE_ID}';
DELETE FROM "User" WHERE id = '${USER_ID}' OR email = 'core-workflow-${RUN_ID_LOWER}@smarttour.local';
DELETE FROM "RolePermission" WHERE "roleId" = '${ROLE_ID}';
DELETE FROM "Role" WHERE id = '${ROLE_ID}' OR code = 'core-workflow-${RUN_ID_LOWER}';
SQL
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "$POSTGRES_CONTAINER is not running" >&2
  exit 1
fi

cleanup

psql_exec >/dev/null <<SQL
INSERT INTO "Role" (id, code, name, "isSystem", status, "createdAt", "updatedAt")
VALUES ('${ROLE_ID}', 'core-workflow-${RUN_ID_LOWER}', 'Core workflow smoke role', false, 'ACTIVE', now(), now());
INSERT INTO "RolePermission" (id, "roleId", permission, "createdAt")
VALUES
  ('${ROLE_ID}_rp_all', '${ROLE_ID}', '*', now()),
  ('${ROLE_ID}_rp_scope_all', '${ROLE_ID}', 'data.scope.all', now());
INSERT INTO "User" (id, username, email, name, "passwordHash", status, branch, department, "createdAt", "updatedAt")
VALUES ('${USER_ID}', 'core-workflow-${RUN_ID_LOWER}', 'core-workflow-${RUN_ID_LOWER}@smarttour.local', 'Core Workflow Smoke', 'not-used-by-token-smoke', 'ACTIVE', 'CORE-BR', 'CORE-DEP', now(), now());
INSERT INTO "UserRole" (id, "userId", "roleId", "createdAt")
VALUES ('ur_core_workflow_${RUN_ID_SAFE}', '${USER_ID}', '${ROLE_ID}', now());
INSERT INTO "UserSession" (id, "userId", "tokenHash", "userAgent", "ipAddress", "expiresAt", "createdAt", "updatedAt")
VALUES ('${SESSION_ID}', '${USER_ID}', '${CORE_TOKEN_HASH}', 'core-workflow-smoke', '127.0.0.1', now() + interval '1 hour', now(), now());
SQL

export API_URL RUN_ID CORE_TOKEN

node <<'NODE'
const api = process.env.API_URL || 'http://127.0.0.1:4000/api';
const run = process.env.RUN_ID;
const token = process.env.CORE_TOKEN;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mark(token) {
  console.log(token);
}

function rowsOf(data) {
  return Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);
}

function containsJson(data, text) {
  return JSON.stringify(data).includes(text);
}

function money(value) {
  return Number(value);
}

async function request(method, path, body, ok = [200, 201]) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(api + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (ok.includes(response.status)) {
        console.log(`${response.status} ${method} ${path}`);
        return data;
      }
      lastError = new Error(`${method} ${path} -> ${response.status} ${String(text).slice(0, 800)}`);
      if (![502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === 30) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError;
}

function baseOrderPayload(code, name, customer, extra = {}) {
  return {
    systemCode: code,
    name,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    branch: 'CORE-BR',
    department: 'CORE-DEP',
    createdBy: 'Core Sales',
    operatorOwner: 'Core Operator',
    salesItems: [{ description: `${name} revenue`, quantity: 2, serviceCount: 1, unitPrice: 1000000, vat: 0 }],
    operationItems: [{ serviceType: 'OTHER', quantity: 2, netPrice: 350000, vat: 0, status: 'WAITING' }],
    members: [{ fullName: 'Core Traveler', phone: '0900000001' }],
    itineraries: [{ dayNo: 1, title: 'Start', content: 'Core workflow itinerary' }],
    ...extra,
  };
}

function quotationPayload(code) {
  return {
    quoteCode: code,
    productType: 'FIT',
    customerName: 'Core Quotation Customer',
    customerPhone: '0900000002',
    customerEmail: `quotation-${run.toLowerCase()}@smarttour.local`,
    salesOwner: 'Core Sales',
    operatorOwner: 'Core Operator',
    branch: 'CORE-BR',
    department: 'CORE-DEP',
    marketGroup: 'CORE',
    productCategory: 'Tour',
    route: 'Ha Noi - Ninh Binh',
    paxAdult: 2,
    paxChild: 1,
    paxInfant: 0,
    currency: 'VND',
    exchangeRate: 1,
    createdDate: '2026-07-01',
    expiredDate: '2026-07-20',
    expectedPaymentDate: '2026-07-08',
    departureDate: '2026-08-01',
    returnDate: '2026-08-04',
    approvalLevel: 1,
    childPricePercent: 50,
    infantPricePercent: 10,
    language: 'VI',
    terms: 'Core smoke terms',
    note: `${run} quotation note`,
    items: [
      { serviceType: 'HOTEL', supplierName: 'Core Hotel Supplier', serviceName: 'Room package', unit: 'room', quantity: 2, paxCount: 2, nightCount: 2, netPrice: 500000, vat: 0, markupAmount: 100000, markupPercent: 0 },
      { serviceType: 'GUIDE', supplierName: 'Core Guide Supplier', serviceName: 'Guide package', unit: 'day', quantity: 1, paxCount: 3, nightCount: 1, netPrice: 300000, vat: 0, markupAmount: 0, markupPercent: 10 },
    ],
  };
}

async function createOrder(type, suffix, customer, extra = {}) {
  return request('POST', `/orders/${type}`, baseOrderPayload(`${run}-${suffix}`, `Core ${suffix}`, customer, extra));
}

(async () => {
  const restaurant = await request('POST', '/suppliers/restaurants', {
    supplierCode: `${run}-REST`,
    name: 'Core Restaurant Supplier',
    phone: '0901000001',
    email: `rest-${run.toLowerCase()}@smarttour.local`,
    province: 'Ha Noi',
    market: 'Core Market',
    contacts: [{ fullName: 'Core Restaurant Contact', phone: '0901000002' }],
    services: [{ serviceName: 'Core Set Menu', quantity: 1, netPrice: 500000, sellingPrice: 550000 }],
  });
  const restaurantServiceId = restaurant.supplierServices?.[0]?.id;
  assert(restaurant.id && restaurantServiceId, 'restaurant supplier/service missing');

  const guideSupplier = await request('POST', '/suppliers/guides', {
    supplierCode: `${run}-GUIDE`,
    name: 'Core Guide Supplier',
    phone: '0902000001',
    email: `guide-${run.toLowerCase()}@smarttour.local`,
    province: 'Ha Noi',
    market: 'Core Market',
    contacts: [{ fullName: 'Core Guide Contact', phone: '0902000002' }],
    services: [{ serviceName: 'Core Guide Day', quantity: 1, netPrice: 900000, sellingPrice: 1000000, metadata: { languages: 'VI,EN', regions: 'North', dailyRate: 900000 } }],
  });
  assert(guideSupplier.id, 'guide supplier missing');

  const hotel = await request('POST', '/suppliers/hotels', {
    supplierCode: `${run}-HOTEL`,
    name: 'Core Hotel Supplier',
    phone: '0903000001',
    email: `hotel-${run.toLowerCase()}@smarttour.local`,
    country: 'Viet Nam',
    province: 'Ha Noi',
    address: 'Core Hotel Address',
    classHotel: '4 sao',
    hotelProject: 'Core Hotel Line',
    market: 'Core Market',
    rating: 4,
    builtYear: 2020,
    contacts: [{ fullName: 'Core Hotel Contact', phone: '0903000002' }],
    services: [{ sku: `${run}-ROOM`, serviceName: 'Core Deluxe Room', dayType: 'WEEKDAY', quantity: 2, accountingPrice: 700000, netPrice: 800000, sellingPrice: 1000000 }],
    allotments: [{ sku: `${run}-ALLOT`, serviceName: 'Core Deluxe Room', startDate: '2026-09-01', endDate: '2026-09-30', dayType: 'WEEKEND', allotmentQty: 2, cutoffDays: 5, netCostPerDay: 800000, sellingPricePerDay: 1000000 }],
  });
  assert(hotel.id && hotel.hotelProfile?.hotelProject === 'Core Hotel Line', 'hotel supplier/profile missing');
  await request('PATCH', `/suppliers/${guideSupplier.id}/status`, { status: 'INACTIVE' });
  const restaurantSearch = await request('GET', `/suppliers/restaurants?search=${encodeURIComponent(run)}`);
  assert(rowsOf(restaurantSearch).some((item) => item.id === restaurant.id), 'restaurant supplier search failed');
  const guideInactive = await request('GET', `/suppliers/guides?status=INACTIVE&search=${encodeURIComponent(run)}`);
  assert(rowsOf(guideInactive).some((item) => item.id === guideSupplier.id), 'guide supplier status filter failed');
  const hotelFilter = await request('GET', `/suppliers/hotels?market=${encodeURIComponent('Core Market')}&classHotel=${encodeURIComponent('4 sao')}&hotelProject=${encodeURIComponent('Core Hotel Line')}`);
  assert(rowsOf(hotelFilter).some((item) => item.id === hotel.id), 'hotel supplier filter failed');
  mark('SUPPLIERS_OK');

  const customer = await request('POST', '/customers', {
    code: `${run}-CUS`,
    fullName: 'Core Workflow Customer',
    phone: '091' + String(Date.now()).slice(-7),
    email: `customer-${run.toLowerCase()}@smarttour.local`,
    branch: 'CORE-BR',
    department: 'CORE-DEP',
    contacts: [{ fullName: 'Core Primary Contact', phone: '0911000000', email: 'primary@example.test' }],
  });
  assert(customer.contacts?.length === 1, 'customer create did not persist contacts');
  mark('CREATE_CUSTOMER_OK');
  const updatedCustomer = await request('PUT', `/customers/${customer.id}`, {
    phone: customer.phone,
    contacts: [{ fullName: 'Core Updated Contact', phone: '0912000000', email: 'updated@example.test' }],
  });
  assert(updatedCustomer.contacts?.[0]?.fullName === 'Core Updated Contact', 'customer contact update failed');
  mark('UPDATE_CUSTOMER_CONTACTS_OK');
  const byName = await request('GET', `/customers?search=${encodeURIComponent('Core Workflow Customer')}`);
  const byPhone = await request('GET', `/customers?search=${encodeURIComponent(customer.phone)}`);
  assert(rowsOf(byName).some((item) => item.id === customer.id) && rowsOf(byPhone).some((item) => item.id === customer.id), 'customer search by name/phone failed');
  mark('SEARCH_CUSTOMER_OK');
  const timeline = await request('GET', `/customers/${customer.id}/timeline?take=10`);
  assert(rowsOf(timeline).length >= 1 || timeline.rows?.length >= 1, 'customer timeline missing');
  mark('CUSTOMER_TIMELINE_OK');

  const program = await request('POST', '/tour-programs', {
    code: `${run}-TP`,
    name: 'Core Tour Program',
    route: 'Ha Noi - Ha Long',
    durationDays: 3,
    description: `${run} program`,
  });
  for (const dayNumber of [1, 2, 3]) {
    await request('POST', `/tour-programs/${program.id}/itinerary-days`, { dayNumber, title: `Core Day ${dayNumber}`, description: `Core itinerary day ${dayNumber}` });
  }
  const booking = await request('POST', '/bookings', {
    code: `${run}-BKG`,
    tourProgramId: program.id,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    paxCount: 2,
    startDate: '2026-09-01',
    endDate: '2026-09-03',
  });
  const editedBooking = await request('PATCH', `/bookings/${booking.id}`, {
    paxCount: 3,
    startDate: '2026-09-02',
    endDate: '2026-09-04',
    customerName: 'Core Booking Customer Updated',
    customerPhone: customer.phone,
  });
  assert(editedBooking.paxCount === 3 && editedBooking.customerName === 'Core Booking Customer Updated', 'booking edit failed');
  mark('TOUR_PROGRAM_BOOKING_OK');

  const quotation = await request('POST', '/quotations', quotationPayload(`${run}-QTE`));
  assert(quotation.items?.length === 2 && money(quotation.totalSelling) > money(quotation.totalCost), 'quotation create/items failed');
  mark('CREATE_FIT_QUOTATION_OK');
  await request('POST', `/quotations/${quotation.id}/submit`, { actor: 'core-workflow' });
  const approvedQuotation = await request('POST', `/quotations/${quotation.id}/approve`, { actor: 'core-workflow' });
  assert(approvedQuotation.status === 'APPROVED', 'quotation approve failed');
  mark('APPROVE_QUOTATION_OK');
  const rejectQuote = await request('POST', '/quotations', quotationPayload(`${run}-QTE-REJECT`));
  await request('POST', `/quotations/${rejectQuote.id}/submit`, { actor: 'core-workflow' });
  const rejectedQuotation = await request('POST', `/quotations/${rejectQuote.id}/reject`, { actor: 'core-workflow', note: `${run} reject` });
  assert(rejectedQuotation.status === 'REJECTED', 'quotation reject failed');
  mark('REJECT_QUOTATION_OK');
  const convertedQuotation = await request('POST', `/quotations/${quotation.id}/convert`, { actor: 'core-workflow' });
  assert(convertedQuotation.status === 'CONVERTED' && convertedQuotation.convertedOrderId, 'quotation convert failed');
  mark('CONVERT_QUOTATION_OK');

  const fitOrder = await createOrder('fit-tours', 'FIT-ORDER', customer, { commission: 123456 });
  assert(fitOrder.type === 'FIT_TOUR', 'FIT order type mismatch');
  mark('CREATE_FIT_ORDER_OK');
  const gitOrder = await createOrder('git-combos', 'GIT-ORDER', customer);
  assert(gitOrder.type === 'GIT_COMBO', 'GIT order type mismatch');
  mark('CREATE_GIT_ORDER_OK');
  const landOrder = await createOrder('landtours', 'LAND-ORDER', customer);
  assert(landOrder.type === 'LANDTOUR', 'LandTour order type mismatch');
  mark('CREATE_LANDTOUR_ORDER_OK');
  const updatedFitOrder = await request('PUT', `/orders/fit-tours/${fitOrder.id}`, { paidAmount: 250000, paidCost: 100000, status: 'RUNNING' });
  assert(money(updatedFitOrder.paidAmount) === 250000 && updatedFitOrder.status === 'RUNNING', 'order financial/status update failed');
  const copiedFitOrder = await request('POST', `/orders/fit-tours/${fitOrder.id}/copy`);
  assert(copiedFitOrder.id !== fitOrder.id && copiedFitOrder.systemCode.startsWith(fitOrder.systemCode), 'order copy failed');
  const settledFitOrder = await request('POST', `/orders/fit-tours/${fitOrder.id}/settle`);
  assert(settledFitOrder.status === 'SETTLED', 'order settle failed');
  const unlockedFitOrder = await request('POST', `/orders/fit-tours/${fitOrder.id}/unlock`, { actor: 'core-workflow', reason: `${run} unlock` });
  assert(unlockedFitOrder.status === 'COMPLETED', 'order unlock failed');
  mark('ORDER_COPY_SETTLE_UNLOCK_OK');

  const operationForm = await request('POST', '/operations/forms', {
    bookingId: booking.id,
    notes: `${run} operation form`,
    services: [{ supplierId: restaurant.id, supplierServiceId: restaurantServiceId, serviceType: 'MEAL', serviceName: 'Core Lunch', confirmationStatus: 'WAITING', expectedCost: 500000, actualCost: 500000 }],
    tasks: [{ title: 'Core supplier confirmation', dueDate: '2026-08-25', status: 'PENDING' }],
    costs: [{ costName: 'Core lunch cost', expectedAmount: 500000, actualAmount: 500000, currency: 'VND', notes: `${run} operation cost` }],
  });
  assert(operationForm.services?.length === 1 && operationForm.tasks?.length === 1 && operationForm.costs?.length === 1, 'operation form children missing');
  const paymentRequest = await request('POST', '/operations/supplier-payment-requests', {
    code: `${run}-SPR`,
    requestedBy: 'core-workflow',
    items: [{ supplierId: restaurant.id, costId: operationForm.costs[0].id, amount: 500000, notes: `${run} supplier payment` }],
  });
  await request('POST', `/operations/supplier-payment-requests/${paymentRequest.id}/submit`, { actor: 'core-workflow' });
  const approvedPaymentRequest = await request('POST', `/operations/supplier-payment-requests/${paymentRequest.id}/approve`, { actor: 'core-workflow' });
  assert(approvedPaymentRequest.status === 'APPROVED', 'supplier payment request approve failed');
  mark('OPERATION_FORM_PAYMENT_REQUEST_OK');

  const voucherOrder = await createOrder('single-services', 'VCH-ORDER', customer);
  const voucherTour = await request('POST', '/tours', {
    type: 'FIT',
    systemCode: `${run}-VCH-TOUR`,
    orderId: voucherOrder.id,
    tourCode: `${run}-VCH-T`,
    name: 'Core voucher linked tour',
    branch: 'CORE-BR',
    department: 'CORE-DEP',
    startDate: '2026-09-02',
    endDate: '2026-09-04',
  });
  const voucher = await request('POST', '/operation-vouchers', {
    voucherCode: `${run}-VCH`,
    bookingId: booking.id,
    orderId: voucherOrder.id,
    tourId: voucherTour.id,
    supplierId: restaurant.id,
    supplierName: restaurant.name,
    serviceType: 'MEAL',
    serviceName: 'Core voucher lunch',
    serviceDate: '2026-09-02',
    paymentDeadline: '2026-09-07',
    createdBy: 'core-workflow',
    details: [
      { serviceName: 'Core lunch part 1', quantity: 2, unit: 'pax', netPrice: 150000, vat: 0 },
      { serviceName: 'Core lunch part 2', quantity: 2, unit: 'pax', netPrice: 100000, vat: 0 },
    ],
  });
  assert(money(voucher.totalAmount) === 500000 && voucher.details?.length === 2, 'operation voucher details/totals failed');
  const partialVoucherPayment = await request('POST', '/finance/payments', {
    voucherCode: `${run}-VCH-PAY-1`,
    voucherName: 'Core voucher partial payment',
    voucherType: 'SUPPLIER_PAYMENT',
    supplierId: restaurant.id,
    orderId: voucherOrder.id,
    tourId: voucherTour.id,
    totalAmount: 100000,
    paymentAmount: 100000,
    reason: `${run} voucher partial payment`,
    branch: 'CORE-BR',
    department: 'CORE-DEP',
  });
  await request('POST', `/finance/payments/${partialVoucherPayment.id}/approve`, { actor: 'core-workflow' });
  const voucherAfterPartial = await request('POST', `/operation-vouchers/${voucher.id}/payment`, { paymentVoucherId: partialVoucherPayment.id, note: `${run} partial` });
  assert(money(voucherAfterPartial.paidAmount) === 100000 && money(voucherAfterPartial.remainAmount) === 400000, 'operation voucher partial payment failed');
  const fullVoucherPayment = await request('POST', '/finance/payments', {
    voucherCode: `${run}-VCH-PAY-2`,
    voucherName: 'Core voucher final payment',
    voucherType: 'SUPPLIER_PAYMENT',
    supplierId: restaurant.id,
    orderId: voucherOrder.id,
    tourId: voucherTour.id,
    totalAmount: 400000,
    paymentAmount: 400000,
    reason: `${run} voucher final payment`,
    branch: 'CORE-BR',
    department: 'CORE-DEP',
  });
  await request('POST', `/finance/payments/${fullVoucherPayment.id}/approve`, { actor: 'core-workflow' });
  const voucherAfterFull = await request('POST', `/operation-vouchers/${voucher.id}/payment`, { paymentVoucherId: fullVoucherPayment.id, note: `${run} full` });
  assert(money(voucherAfterFull.remainAmount) === 0 && voucherAfterFull.status === 'PAID', 'operation voucher full payment failed');
  mark('OPERATION_VOUCHER_PAYMENTS_OK');

  const financeOrder = await createOrder('single-services', 'FIN-ORDER', customer);
  const financeTour = await request('POST', '/tours', {
    type: 'FIT',
    systemCode: `${run}-FIN-TOUR`,
    orderId: financeOrder.id,
    tourCode: `${run}-FIN-T`,
    name: 'Core finance linked tour',
    branch: 'CORE-BR',
    department: 'CORE-DEP',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
  });
  const receipt = await request('POST', '/finance/receipts', {
    receiptCode: `${run}-RCPT`,
    receiptName: 'Core finance receipt',
    receiptType: 'TOUR_PAYMENT',
    customerId: customer.id,
    tourId: financeTour.id,
    payerName: customer.fullName,
    payerPhone: customer.phone,
    totalAmount: 1000000,
    receiptAmount: 1000000,
    reason: `${run} receipt`,
    branch: 'CORE-BR',
    department: 'CORE-DEP',
    orders: [{ orderId: financeOrder.id, orderCode: financeOrder.systemCode, amount: 1000000 }],
  });
  const approvedReceipt = await request('POST', `/finance/receipts/${receipt.id}/approve`, { actor: 'core-workflow' });
  assert(approvedReceipt.approvalStatus === 'APPROVED', 'finance receipt approve failed');
  const rejectedReceiptDraft = await request('POST', '/finance/receipts', {
    receiptCode: `${run}-RCPT-REJECT`,
    receiptName: 'Core finance reject receipt',
    receiptType: 'TOUR_PAYMENT',
    customerId: customer.id,
    tourId: financeTour.id,
    totalAmount: 1,
    receiptAmount: 1,
    reason: `${run} reject receipt`,
    branch: 'CORE-BR',
    department: 'CORE-DEP',
  });
  const rejectedReceipt = await request('POST', `/finance/receipts/${rejectedReceiptDraft.id}/reject`, { actor: 'core-workflow', note: `${run} reject` });
  assert(rejectedReceipt.approvalStatus === 'REJECTED', 'finance receipt reject failed');
  const financePayment = await request('POST', '/finance/payments', {
    voucherCode: `${run}-PAY`,
    voucherName: 'Core finance payment',
    voucherType: 'SUPPLIER_PAYMENT',
    supplierId: restaurant.id,
    orderId: financeOrder.id,
    tourId: financeTour.id,
    totalAmount: 400000,
    paymentAmount: 400000,
    reason: `${run} payment`,
    branch: 'CORE-BR',
    department: 'CORE-DEP',
  });
  const approvedPayment = await request('POST', `/finance/payments/${financePayment.id}/approve`, { actor: 'core-workflow' });
  assert(approvedPayment.approvalStatus === 'APPROVED', 'finance payment approve failed');
  const invoice = await request('POST', '/finance/invoices', {
    invoiceCode: `${run}-INV`,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    orderId: financeOrder.id,
    tourId: financeTour.id,
    invoiceType: 'VAT',
    issuedDate: '2026-09-05',
    note: `${run} invoice`,
    items: [{ itemName: 'Core service', unit: 'package', quantity: 1, unitPrice: 1000000, taxRate: 8 }],
  });
  const approvedInvoice = await request('POST', `/finance/invoices/${invoice.id}/approve`, { actor: 'core-workflow' });
  assert(approvedInvoice.approvalStatus === 'APPROVED', 'finance invoice approve failed');
  const cancelledReceipt = await request('POST', `/finance/receipts/${receipt.id}/cancel`, { actor: 'core-workflow', reason: `${run} cancel receipt` });
  const cancelledPayment = await request('POST', `/finance/payments/${financePayment.id}/cancel`, { actor: 'core-workflow', reason: `${run} cancel payment` });
  const cancelledInvoice = await request('POST', `/finance/invoices/${invoice.id}/cancel`, { actor: 'core-workflow', reason: `${run} cancel invoice` });
  assert(cancelledReceipt.reversals?.length === 1 && cancelledPayment.reversals?.length === 1 && cancelledInvoice.reversals?.length === 1, 'finance cancellation reversal failed');
  mark('FINANCE_APPROVE_REJECT_CANCEL_OK');

  await request('POST', '/commission-reports/sync');
  const commissionList = await request('GET', `/commission-reports?search=${encodeURIComponent(fitOrder.systemCode)}&take=100`);
  const commission = rowsOf(commissionList).find((row) => row.orderCode === fitOrder.systemCode);
  assert(commission && money(commission.commissionAmount) === 123456, 'commission sync amount mismatch');
  mark('COMMISSION_SYNC_OK');

  const reportPaths = [
    '/reports/overview?branch=CORE-BR',
    '/reports/business-summary?branch=CORE-BR',
    '/reports/finance?branch=CORE-BR',
    '/reports/debt/customers?branch=CORE-BR',
    `/reports/debt/suppliers?supplier=${encodeURIComponent('Core Restaurant Supplier')}`,
    '/reports/employees/performance?employee=Core%20Sales',
  ];
  for (const path of reportPaths) {
    const data = await request('GET', path);
    assert(data !== null && data !== undefined, `report path returned empty: ${path}`);
  }
  mark('REPORTS_OK');
  mark('CORE_WORKFLOW_OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE
