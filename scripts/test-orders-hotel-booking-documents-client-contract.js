const fs = require('fs');

const rendererPath = 'apps/web/app/orders/[type]/order-document.ts';
const actionsPath = 'apps/web/app/orders/[type]/OrderDocumentActions.tsx';
const clientPath = 'apps/web/app/orders/[type]/OrdersClient.tsx';
const renderer = fs.existsSync(rendererPath) ? fs.readFileSync(rendererPath, 'utf8') : '';
const actions = fs.existsSync(actionsPath) ? fs.readFileSync(actionsPath, 'utf8') : '';
const client = fs.readFileSync(clientPath, 'utf8');
const failures = [];

function requireText(source, token, label) {
  if (!source.includes(token)) failures.push(label);
}

function requireOrderedText(source, tokens, label) {
  let cursor = -1;
  for (const token of tokens) {
    cursor = source.indexOf(token, cursor + 1);
    if (cursor === -1) {
      failures.push(label);
      return;
    }
  }
}

requireText(renderer, 'export type OrderDocumentModel =', 'renderer must define the serialized document contract');
requireText(
  renderer,
  'type SupplierLabel = { id: string; supplierCode: string | null; name: string } | null;',
  'supplier labels must match the nullable Task 1 projection',
);
requireText(
  renderer,
  'type ServiceLabel = { id: string; sku: string | null; serviceName: string } | null;',
  'service labels must match the nullable Task 1 projection',
);
requireOrderedText(
  renderer,
  ['export type OrderDocumentModel = {', 'version: number;', 'generatedAt: string;', 'documentTitle: string;', 'order: {'],
  'document root metadata must match the Task 1 model',
);
requireOrderedText(
  renderer,
  [
    'order: {',
    'id: string;',
    'type: string;',
    'systemCode: string;',
    'tourCode: string | null;',
    'holdCode: string | null;',
    'name: string;',
    'route: string | null;',
    'marketGroup: string | null;',
    'status: string;',
    'paymentStatus: string;',
    'costStatus: string;',
    'currency: string;',
    'exchangeRate: number;',
    'createdBy: string | null;',
    'branch: string | null;',
    'department: string | null;',
    'operatorOwner: string | null;',
    'adultQty: number;',
    'childQty: number;',
    'infantQty: number;',
    'quantity: number;',
    'roomClass: string | null;',
    'servicePackage: string | null;',
    'note: string | null;',
    'bookingDate: string | null;',
    'paymentDate: string | null;',
    'startDate: string | null;',
    'endDate: string | null;',
    'createdDate: string | null;',
    'receiveDeadline: string | null;',
    'closeDeadline: string | null;',
  ],
  'order fields and serialized date nullability must match the Task 1 model',
);
requireOrderedText(
  renderer,
  [
    'customer: {',
    'customerName: string | null;',
    'customerType: string | null;',
    'customerPhone: string | null;',
    'customerEmail: string | null;',
    'customerAddress: string | null;',
    'agencyName: string | null;',
    'collaborator: string | null;',
  ],
  'customer snapshot fields must match the Task 1 model',
);
requireOrderedText(
  renderer,
  [
    'summary: {',
    'totalRevenue: number;',
    'paidAmount: number;',
    'remainingRevenue: number;',
    'totalCost: number;',
    'paidCost: number;',
    'remainingCost: number;',
    'profit: number;',
    'commission: number;',
  ],
  'financial summary fields must match the Task 1 model',
);
requireOrderedText(
  renderer,
  [
    'salesItems: Array<{',
    'id: string;',
    'serviceType: string | null;',
    'description: string | null;',
    'quantity: number;',
    'serviceCount: number;',
    'unitPrice: number;',
    'vat: number;',
    'amount: number;',
    'note: string | null;',
    'supplier: SupplierLabel;',
    'service: ServiceLabel;',
  ],
  'sales item fields must match the Task 1 model',
);
requireOrderedText(
  renderer,
  [
    'operationItems: Array<{',
    'id: string;',
    'serviceType: string | null;',
    'bookingCode: string | null;',
    'serviceDate: string | null;',
    'quantity: number;',
    'netPrice: number;',
    'vat: number;',
    'amount: number;',
    'status: string;',
    'note: string | null;',
    'supplier: SupplierLabel;',
    'service: ServiceLabel;',
  ],
  'operation item fields must match the Task 1 model',
);
requireOrderedText(
  renderer,
  [
    'members: Array<{',
    'id: string;',
    'fullName: string;',
    'gender: string | null;',
    'birthday: string | null;',
    'phone: string | null;',
    'email: string | null;',
    'identityNumber: string | null;',
    'issuedDate: string | null;',
    'nationality: string | null;',
    'passengerType: string | null;',
    'note: string | null;',
  ],
  'member fields must match the Task 1 model',
);
requireText(
  renderer,
  'terms: Array<{ id: string; language: string; terms: string | null; notes: string | null }>;',
  'terms must match the Task 1 model',
);
requireOrderedText(
  renderer,
  [
    'survey: {',
    'description: string | null;',
    'questions: Array<{ id: string; question: string; note: string | null }>;',
  ],
  'survey fields must match the Task 1 model',
);
requireText(renderer, 'signatures: Array<{ role: string; name: string | null }>;', 'signatures must match the Task 1 model');
requireText(renderer, 'export function escapeOrderDocumentHtml', 'renderer must escape dynamic HTML');
requireOrderedText(
  renderer,
  [
    ".replaceAll('&', '&amp;')",
    ".replaceAll('<', '&lt;')",
    ".replaceAll('>', '&gt;')",
    ".replaceAll('\"', '&quot;')",
    `.replaceAll("'", '&#39;')`,
  ],
  'HTML escaping must replace ampersands before angle brackets, double quotes, and single quotes',
);
requireText(renderer, 'escapeOrderDocumentHtml(model.documentTitle)', 'renderer must render the protected document title');
requireText(renderer, 'function quantity(value: unknown)', 'renderer must format quantities separately from money');
requireText(renderer, 'function status(value?: string | null)', 'renderer must format persisted statuses');
requireText(renderer, "import { viStatus } from '../../i18n';", 'renderer must import the canonical Vietnamese status formatter');
requireText(renderer, 'return viStatus(value);', 'renderer status formatting must delegate to viStatus');
if (renderer.includes('IN_PROGRESS:')) failures.push('renderer must not maintain a stale partial status map');
requireText(renderer, '@page { size: A4;', 'print output must define A4 page CSS');
requireText(renderer, 'application/msword;charset=utf-8', 'Word export must use the Word-compatible MIME type');
requireText(renderer, "'\\uFEFF'", 'Word export must prepend a UTF-8 BOM');
requireText(renderer, "extension: 'doc'", 'Word export must use the .doc extension');
requireText(renderer, 'URL.revokeObjectURL(url)', 'Word download must release the object URL');
requireText(renderer, 'if (!model.members.length)', 'empty member sections must be omitted');
requireText(
  renderer,
  "value === null || value === undefined || value === ''",
  'row rendering must use an explicit null, undefined, and empty-string fallback so numeric zero is preserved',
);
if (renderer.includes("value || '-'")) failures.push('row rendering must not replace numeric zero with a dash');

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
