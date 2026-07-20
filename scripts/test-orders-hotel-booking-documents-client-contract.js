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
