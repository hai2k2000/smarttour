const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const rendererPath = 'apps/web/app/orders/[type]/order-document.ts';
const actionsPath = 'apps/web/app/orders/[type]/OrderDocumentActions.tsx';
const clientPath = 'apps/web/app/orders/[type]/OrdersClient.tsx';
const designPath = 'docs/superpowers/specs/2026-07-20-orders-hotel-booking-documents-design.md';
const planPath = 'docs/superpowers/plans/2026-07-20-orders-hotel-booking-documents.md';
const renderer = fs.existsSync(rendererPath) ? fs.readFileSync(rendererPath, 'utf8') : '';
const actions = fs.existsSync(actionsPath) ? fs.readFileSync(actionsPath, 'utf8') : '';
const client = fs.readFileSync(clientPath, 'utf8');
const design = fs.readFileSync(designPath, 'utf8');
const plan = fs.readFileSync(planPath, 'utf8');
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

requireText(actions, "import { useRef, useState } from 'react';", 'actions must use a synchronous ref lock alongside render state');
requireText(actions, "const canExportDocuments = can('order.view') && can('order.export');", 'actions must require exact order view and export permissions');
if (actions.includes("canViewOrders && can('order.export')")) failures.push('actions must not treat order.manage as document view permission');
requireText(actions, "type !== 'hotel-bookings'", 'actions must be restricted to Hotel Booking orders');
requireText(actions, 'if (!canExportDocuments || !orderId) return null;', 'actions must fail closed without export permission or a persisted Order id');
requireText(actions, '/${orderId}/document', 'actions must fetch the protected persisted document model');
requireText(actions, "cache: 'no-store'", 'actions must bypass caches when loading persisted document data');
requireText(actions, 'authFetch(', 'actions must use the authenticated browser fetch helper');
requireText(actions, "window.open('', '_blank')", 'print must open its popup synchronously');
requireText(actions, 'Cho ph\u00e9p c\u1eeda s\u1ed5 b\u1eadt l\u00ean', 'print must explain how to allow a blocked popup');
requireText(actions, 'downloadOrderWord(model)', 'Word action must delegate to the shared renderer');
requireText(actions, 'writeOrderPrintWindow(popup, model)', 'print action must delegate to the shared renderer');
const printHandler = actions.slice(actions.indexOf('async function handlePrint'));
requireOrderedText(
  printHandler,
  ["window.open('', '_blank')", 'await fetchModel()'],
  'print must synchronously reserve the popup before awaiting fresh persisted data',
);

requireText(client, "import OrderDocumentActions from './OrderDocumentActions';", 'OrdersClient must import document actions');
requireText(client, '<OrderDocumentActions', 'OrdersClient must render document actions');
requireText(client, 'orderId={editingId}', 'OrdersClient must pass the persisted Order id');
requireText(client, 'onMessage={setMessage}', 'OrdersClient must expose document action feedback in the shared message area');
requireText(client, 'disabled={isSubmitting}', 'OrdersClient must disable document actions while saving');
requireText(client, 'role="status" aria-live="polite" aria-atomic="true"', 'OrdersClient must expose inline messages as an atomic polite status');
requireOrderedText(
  client,
  ['<OrderDocumentActions', "action('copy')", "action('settle')"],
  'OrdersClient must render persisted document actions before copy and settlement actions',
);
requireText(
  design,
  'Require both exact permissions, `order.view` and `order.export`; `order.manage` alone does not substitute for `order.view`.',
  'design must document the exact document permission pair',
);
requireText(
  plan,
  'Both exact permissions, `order.view` and `order.export`, are required for document actions. `order.manage` alone does not substitute for `order.view`',
  'implementation plan must document that order.manage is not a view substitute',
);
if (design.includes('`order.view` or `order.manage` and `order.export`')) failures.push('design must not retain view-equivalent document permissions');
if (plan.includes("canViewOrders && can('order.export')")) failures.push('implementation plan must not retain view-equivalent document permissions');

function assertBehavior(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(action, message) {
  let thrown = null;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assertBehavior(thrown, message);
  return thrown;
}

function behavior(label, action) {
  try {
    action();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const asyncTests = [];
function asyncBehavior(label, action) {
  asyncTests.push({ label, action });
}

let actionsJavascript = '';
behavior('actions TypeScript must transpile for executable contract tests', () => {
  const transpiled = ts.transpileModule(actions, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: actionsPath,
    reportDiagnostics: true,
  });
  const diagnostics = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assertBehavior(!diagnostics.length, ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  actionsJavascript = transpiled.outputText;
});

function actionResponse({ ok = true, model = { order: { id: 'persisted-order' } }, message = null, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    async json() {
      return ok ? model : { message };
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function popupEnvironment(events, failure = null) {
  let opener = 'source-window';
  const popup = {
    closed: false,
    loadingHtml: '',
    get opener() {
      return opener;
    },
    set opener(value) {
      events.push('popup.opener');
      if (failure === 'opener') throw new Error('opener failed');
      opener = value;
    },
    document: {
      open() {
        events.push('document.open');
        if (failure === 'document.open') throw new Error('document open failed');
      },
      write(html) {
        events.push('document.write');
        popup.loadingHtml = html;
        if (failure === 'document.write') throw new Error('document write failed');
      },
      close() {
        events.push('document.close');
        if (failure === 'document.close') throw new Error('document close failed');
      },
    },
    close() {
      events.push('popup.close');
      popup.closed = true;
    },
  };
  return popup;
}

function createActionHarness(options = {}) {
  const hooks = [];
  let hookCursor = 0;
  const permissions = new Set(options.permissions || ['order.view', 'order.export']);
  const messages = [];
  const events = [];
  const fetchCalls = [];
  const wordCalls = [];
  const printCalls = [];
  const openCalls = [];
  const authHeadersValue = { Authorization: 'Bearer contract-token' };
  const defaultPopup = popupEnvironment(events);

  function useState(initialValue) {
    const index = hookCursor++;
    if (!(index in hooks)) hooks[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
    const setValue = (nextValue) => {
      hooks[index] = typeof nextValue === 'function' ? nextValue(hooks[index]) : nextValue;
    };
    return [hooks[index], setValue];
  }

  function useRef(initialValue) {
    const index = hookCursor++;
    if (!(index in hooks)) hooks[index] = { current: initialValue };
    return hooks[index];
  }

  function jsx(type, props, key) {
    return { type, key: key ?? null, props: props || {} };
  }

  const popupFactory = options.popupFactory || (() => ('popup' in options ? options.popup : defaultPopup));
  const browserWindow = {
    location: { hostname: 'web.example.test' },
    open(...args) {
      events.push('window.open');
      openCalls.push(args);
      if (options.openError) throw options.openError;
      return popupFactory();
    },
  };
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    process: { env: { NEXT_PUBLIC_API_URL: options.apiBase || 'https://api.example.test' } },
    window: browserWindow,
    console,
    require(specifier) {
      if (specifier === 'react') return { useState, useRef };
      if (specifier === 'react/jsx-runtime') return { Fragment: Symbol.for('contract.fragment'), jsx, jsxs: jsx };
      if (specifier === 'lucide-react') return { Download() {}, Printer() {} };
      if (specifier === '../../usePermissions') {
        return {
          usePermissions() {
            return {
              can(permission) { return permissions.has(permission); },
              permissionsReady: options.permissionsReady !== false,
            };
          },
        };
      }
      if (specifier === '../../authFetch') {
        return {
          authHeaders() { return authHeadersValue; },
          authFetch(url, init) {
            events.push('authFetch');
            fetchCalls.push({ url, init });
            if (options.fetch) return options.fetch(url, init);
            return Promise.resolve(actionResponse({ model: options.model }));
          },
        };
      }
      if (specifier === './order-document') {
        return {
          downloadOrderWord(model) {
            events.push('downloadOrderWord');
            wordCalls.push(model);
            if (options.wordError) throw options.wordError;
          },
          writeOrderPrintWindow(popup, model) {
            events.push('writeOrderPrintWindow');
            printCalls.push({ popup, model });
            if (options.printError) throw options.printError;
          },
        };
      }
      throw new Error(`Unexpected actions import: ${specifier}`);
    },
  };
  vm.runInNewContext(actionsJavascript, context, { filename: actionsPath });
  const Component = module.exports.default;
  const props = {
    type: options.type || 'hotel-bookings',
    orderId: options.orderId === undefined ? 'persisted-123' : options.orderId,
    disabled: Boolean(options.disabled),
    onMessage(message) { messages.push(message); },
  };

  return {
    authHeadersValue,
    events,
    fetchCalls,
    messages,
    openCalls,
    popup: defaultPopup,
    printCalls,
    wordCalls,
    render() {
      hookCursor = 0;
      return Component(props);
    },
  };
}

function findElements(node, type, matches = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, type, matches);
    return matches;
  }
  if (!node || typeof node !== 'object') return matches;
  if (node.type === type) matches.push(node);
  findElements(node.props?.children, type, matches);
  return matches;
}

function elementText(node) {
  if (Array.isArray(node)) return node.map(elementText).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return elementText(node.props?.children);
}

function actionButtons(harness) {
  return findElements(harness.render(), 'button');
}

behavior('actions render only for Hotel Booking with exact view and export permissions', () => {
  const cases = [
    { label: 'permissions not ready', options: { permissionsReady: false }, visible: false },
    { label: 'non-hotel type', options: { type: 'single-services' }, visible: false },
    { label: 'missing persisted id', options: { orderId: null }, visible: false },
    { label: 'view without export', options: { permissions: ['order.view'] }, visible: false },
    { label: 'export without view', options: { permissions: ['order.export'] }, visible: false },
    { label: 'manage and export without view', options: { permissions: ['order.manage', 'order.export'] }, visible: false },
    { label: 'view and export', options: { permissions: ['order.view', 'order.export'] }, visible: true },
  ];
  for (const testCase of cases) {
    const output = createActionHarness(testCase.options).render();
    if (testCase.visible) {
      assertBehavior(findElements(output, 'button').length === 2, `${testCase.label} did not render two actions`);
    } else {
      assertBehavior(output === null, `${testCase.label} rendered document actions`);
    }
  }
});

asyncBehavior('action buttons expose stable semantics and honor parent disabled state', async () => {
  const harness = createActionHarness({ disabled: true });
  const buttons = actionButtons(harness);
  assertBehavior(buttons.length === 2, 'document actions did not render two buttons');
  assertBehavior(buttons.every((button) => button.props.type === 'button'), 'document action button must use type=button');
  assertBehavior(buttons.every((button) => button.props.className === 'secondaryButton'), 'document action button must use secondaryButton styling');
  assertBehavior(elementText(buttons[0]).includes('Tải Word'), 'Word action label is incorrect');
  assertBehavior(elementText(buttons[1]).includes('In / PDF'), 'print action label is incorrect');
  assertBehavior(buttons.every((button) => button.props.disabled === true), 'parent disabled state did not disable both actions');
  await buttons[0].props.onClick();
  await buttons[1].props.onClick();
  assertBehavior(harness.fetchCalls.length === 0 && harness.openCalls.length === 0, 'disabled action handlers performed work');
});

asyncBehavior('Word action fetches the persisted protected model and downloads it', async () => {
  const model = { version: 1, order: { id: 'persisted-123' } };
  const harness = createActionHarness({ model });
  await actionButtons(harness)[0].props.onClick();
  assertBehavior(harness.fetchCalls.length === 1, 'Word action did not fetch exactly once');
  assertBehavior(harness.fetchCalls[0].url === 'https://api.example.test/api/orders/hotel-bookings/persisted-123/document', `Word action URL was ${harness.fetchCalls[0].url}`);
  assertBehavior(harness.fetchCalls[0].init.cache === 'no-store', 'Word action did not bypass cache');
  assertBehavior(harness.fetchCalls[0].init.headers === harness.authHeadersValue, 'Word action did not send auth headers');
  assertBehavior(harness.wordCalls.length === 1 && harness.wordCalls[0] === model, 'Word renderer did not receive the fetched model');
  assertBehavior(harness.messages.at(-1) === 'Đã tải chứng từ Word-compatible (.doc).', 'Word success message is incorrect');
});

asyncBehavior('Word API failures surface the protected response message and reset state', async () => {
  const harness = createActionHarness({
    fetch: () => Promise.resolve(actionResponse({ ok: false, status: 403, statusText: 'Forbidden', message: ['Thiếu quyền xem', 'Thiếu quyền xuất'] })),
  });
  await actionButtons(harness)[0].props.onClick();
  assertBehavior(harness.wordCalls.length === 0, 'Word renderer ran after an API failure');
  assertBehavior(harness.messages.at(-1).includes('Thiếu quyền xem, Thiếu quyền xuất'), `Word API error message was ${harness.messages.at(-1)}`);
  assertBehavior(actionButtons(harness).every((button) => button.props.disabled === false), 'Word API failure left actions busy');
});

asyncBehavior('blocked print popup reports guidance without fetching', async () => {
  const harness = createActionHarness({ popup: null });
  await actionButtons(harness)[1].props.onClick();
  assertBehavior(harness.openCalls.length === 1, 'print did not attempt to open a popup');
  assertBehavior(harness.fetchCalls.length === 0, 'blocked popup still fetched document data');
  assertBehavior(harness.messages.at(-1).includes('Cho phép cửa sổ bật lên'), 'blocked popup guidance is missing');
  assertBehavior(actionButtons(harness).every((button) => button.props.disabled === false), 'blocked popup left actions busy');
});

asyncBehavior('print reserves and isolates the popup before awaiting persisted data', async () => {
  const pending = deferred();
  const model = { version: 1, order: { id: 'persisted-123' } };
  const harness = createActionHarness({ fetch: () => pending.promise });
  const promise = actionButtons(harness)[1].props.onClick();
  assertBehavior(
    harness.events.slice(0, 6).join(',') === 'window.open,popup.opener,document.open,document.write,document.close,authFetch',
    `print pre-await sequence was ${harness.events.join(',')}`,
  );
  assertBehavior(harness.events.indexOf('window.open') < harness.events.indexOf('authFetch'), 'print popup opened after the fetch');
  assertBehavior(harness.openCalls[0][0] === '' && harness.openCalls[0][1] === '_blank', 'print popup target is incorrect');
  assertBehavior(harness.popup.opener === null, 'print popup retained its opener before the fetch completed');
  assertBehavior(harness.popup.loadingHtml.includes('Đang tải dữ liệu đã lưu'), 'print popup did not show the loading placeholder');
  const buttonsWhileBusy = actionButtons(harness);
  assertBehavior(buttonsWhileBusy.every((button) => button.props.disabled === true), 'print busy state did not disable both actions');
  assertBehavior(buttonsWhileBusy[1].props['aria-busy'] === true, 'print action did not expose aria-busy');
  pending.resolve(actionResponse({ model }));
  await promise;
  assertBehavior(harness.printCalls.length === 1 && harness.printCalls[0].model === model, 'print renderer did not receive the fetched model');
  assertBehavior(harness.printCalls[0].popup.opener === null, 'print popup retained its opener');
  assertBehavior(harness.printCalls[0].popup.loadingHtml.includes('Đang tải dữ liệu đã lưu'), 'print popup did not show the loading placeholder');
  assertBehavior(harness.messages.at(-1) === 'Đã mở bản In / PDF từ dữ liệu đã lưu.', 'print success message is incorrect');
  assertBehavior(harness.popup === harness.printCalls[0].popup, 'print renderer received an unexpected popup');
});

asyncBehavior('print handles window.open errors without fetching or leaking busy state', async () => {
  const harness = createActionHarness({ openError: new Error('popup setup failed') });
  let rejected = null;
  try {
    await actionButtons(harness)[1].props.onClick();
  } catch (error) {
    rejected = error;
  }
  assertBehavior(!rejected, `window.open error escaped the handler: ${rejected?.message}`);
  assertBehavior(harness.fetchCalls.length === 0, 'window.open error still fetched document data');
  assertBehavior(harness.messages.at(-1).includes('Không mở được bản In / PDF'), `window.open error was not localized: ${harness.messages.at(-1)}`);
  assertBehavior(actionButtons(harness).every((button) => button.props.disabled === false), 'window.open error left actions busy');
});

for (const failure of ['document.write', 'fetch', 'render']) {
  asyncBehavior(`print ${failure} failure closes the acquired popup and resets state`, async () => {
    const events = [];
    const popup = popupEnvironment(events, failure === 'document.write' ? 'document.write' : null);
    const harness = createActionHarness({
      popup,
      fetch: failure === 'fetch' ? () => Promise.reject(new Error('fetch failed')) : undefined,
      printError: failure === 'render' ? new Error('render failed') : undefined,
    });
    await actionButtons(harness)[1].props.onClick();
    assertBehavior(popup.closed, `print ${failure} failure did not close the popup`);
    assertBehavior(harness.messages.at(-1).includes('Không mở được bản In / PDF'), `print ${failure} failure was not localized`);
    assertBehavior(actionButtons(harness).every((button) => button.props.disabled === false), `print ${failure} failure left actions busy`);
  });
}

asyncBehavior('same-render Word double click performs only one fetch and download', async () => {
  const pending = deferred();
  const model = { version: 1, order: { id: 'persisted-123' } };
  const harness = createActionHarness({ fetch: () => pending.promise });
  const handler = actionButtons(harness)[0].props.onClick;
  const first = handler();
  const second = handler();
  const fetchCountBeforeResolve = harness.fetchCalls.length;
  const busyButtons = actionButtons(harness);
  pending.resolve(actionResponse({ model }));
  await Promise.all([first, second]);
  assertBehavior(fetchCountBeforeResolve === 1, `same-render Word double click fetched ${fetchCountBeforeResolve} times`);
  assertBehavior(harness.wordCalls.length === 1, `same-render Word double click downloaded ${harness.wordCalls.length} times`);
  assertBehavior(busyButtons.every((button) => button.props.disabled === true), 'Word busy state did not disable both actions');
  assertBehavior(busyButtons[0].props['aria-busy'] === true, 'Word action did not expose aria-busy');
  assertBehavior(actionButtons(harness).every((button) => button.props.disabled === false), 'Word completion left actions busy');
});

asyncBehavior('shared in-flight lock prevents print while Word is pending', async () => {
  const pending = deferred();
  const harness = createActionHarness({ fetch: () => pending.promise });
  const buttons = actionButtons(harness);
  const wordPromise = buttons[0].props.onClick();
  const printPromise = buttons[1].props.onClick();
  const fetchCountBeforeResolve = harness.fetchCalls.length;
  const openCountBeforeResolve = harness.openCalls.length;
  pending.resolve(actionResponse());
  await Promise.all([wordPromise, printPromise]);
  assertBehavior(fetchCountBeforeResolve === 1, `cross-action race fetched ${fetchCountBeforeResolve} times`);
  assertBehavior(openCountBeforeResolve === 0, `cross-action race opened ${openCountBeforeResolve} popups`);
  assertBehavior(harness.wordCalls.length === 1 && harness.printCalls.length === 0, 'cross-action race ran more than the active Word action');
});

let rendererJavascript = '';
behavior('renderer TypeScript must transpile for executable contract tests', () => {
  const transpiled = ts.transpileModule(renderer, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: rendererPath,
    reportDiagnostics: true,
  });
  const diagnostics = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assertBehavior(!diagnostics.length, ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  rendererJavascript = transpiled.outputText;
});

function contractViStatus(value) {
  const key = String(value ?? '').trim();
  if (!key) return '-';
  const labels = { DRAFT: 'Canonical draft', UPCOMING: 'Canonical upcoming', WAITING: 'Canonical waiting' };
  return labels[key] || key;
}

function loadRenderer(globals = {}, viStatus = contractViStatus) {
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === '../../i18n') return { viStatus };
      throw new Error(`Unexpected renderer import: ${specifier}`);
    },
    Date,
    Intl,
    ...globals,
  };
  vm.runInNewContext(rendererJavascript, context, { filename: rendererPath });
  return module.exports;
}

function completeModel() {
  return {
    version: 1,
    generatedAt: '2026-07-20T12:34:56.000Z',
    documentTitle: 'Hotel booking document',
    order: {
      id: 'order-1',
      type: 'HOTEL_BOOKING',
      systemCode: 'HOTEL-001',
      tourCode: 'TOUR-001',
      holdCode: 'HOLD-001',
      name: 'Hotel booking',
      route: 'Bangkok',
      marketGroup: 'FIT',
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      costStatus: 'PENDING',
      currency: 'VND',
      exchangeRate: 1,
      createdBy: 'Creator',
      branch: 'Branch',
      department: 'Department',
      operatorOwner: 'Operator',
      adultQty: 0,
      childQty: 0,
      infantQty: 0,
      quantity: 0,
      roomClass: 'Deluxe',
      servicePackage: 'Breakfast',
      note: 'Booking note',
      bookingDate: '2026-07-20T00:00:00.000Z',
      paymentDate: '2026-07-21T00:00:00.000Z',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-03T00:00:00.000Z',
      createdDate: '2026-07-20T00:00:00.000Z',
      receiveDeadline: '2026-07-25T00:00:00.000Z',
      closeDeadline: '2026-07-28T00:00:00.000Z',
    },
    customer: {
      customerName: 'Customer',
      customerType: 'Individual',
      customerPhone: '0900000000',
      customerEmail: 'customer@example.test',
      customerAddress: 'Address',
      agencyName: 'Agency',
      collaborator: 'Collaborator',
    },
    summary: {
      totalRevenue: 0,
      paidAmount: 0,
      remainingRevenue: 0,
      totalCost: 0,
      paidCost: 0,
      remainingCost: 0,
      profit: 0,
      commission: 0,
    },
    salesItems: [{
      id: 'sale-1',
      serviceType: 'HOTEL',
      description: 'Room sale',
      quantity: 0,
      serviceCount: 0,
      unitPrice: 0,
      vat: 0,
      amount: 0,
      note: 'Sales note',
      supplier: { id: 'supplier-1', supplierCode: 'SUP-1', name: 'Sales supplier' },
      service: { id: 'service-1', sku: 'SKU-1', serviceName: 'Sales service' },
    }],
    operationItems: [{
      id: 'operation-1',
      serviceType: 'HOTEL',
      bookingCode: 'BOOKING-1',
      serviceDate: '2026-08-01T00:00:00.000Z',
      quantity: 0,
      netPrice: 0,
      vat: 0,
      amount: 0,
      status: 'WAITING',
      note: 'Operation note',
      supplier: { id: 'supplier-2', supplierCode: 'SUP-2', name: 'Operation supplier' },
      service: { id: 'service-2', sku: 'SKU-2', serviceName: 'Operation service' },
    }],
    members: [{
      id: 'member-1',
      fullName: 'Member',
      gender: 'Female',
      birthday: '1990-01-02T00:00:00.000Z',
      phone: '0911111111',
      email: 'member@example.test',
      identityNumber: 'IDENTITY-1',
      issuedDate: '2020-02-03T00:00:00.000Z',
      nationality: 'VN',
      passengerType: 'ADULT',
      note: 'Member note',
    }],
    terms: [{ id: 'term-1', language: 'VN', terms: 'Term body', notes: 'Term note' }],
    survey: {
      description: 'Survey description',
      questions: [{ id: 'survey-1', question: 'Survey question', note: 'Survey note' }],
    },
    signatures: [
      { role: 'Customer', name: 'Customer name' },
      { role: 'Staff', name: 'Staff name' },
      { role: 'Operator', name: 'Operator name' },
    ],
  };
}

function escaped(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

behavior('renderer must escape complete persisted content and preserve zero values', () => {
  const runtime = loadRenderer();
  const model = completeModel();
  const malicious = {
    title: `<root-title data-value="&'">`,
    systemCode: `<system-code data-value="&'">`,
    order: `<order-name data-value="&'">`,
    orderStatus: `<order-status data-value="&'">`,
    customer: `<customer-name data-value="&'">`,
    salesDescription: `<sales-description data-value="&'">`,
    salesSupplier: `<sales-supplier data-value="&'">`,
    salesService: `<sales-service data-value="&'">`,
    salesNote: `<sales-note data-value="&'">`,
    operationBooking: `<operation-booking data-value="&'">`,
    operationSupplier: `<operation-supplier data-value="&'">`,
    operationService: `<operation-service data-value="&'">`,
    operationStatus: `<operation-status data-value="&'">`,
    operationNote: `<operation-note data-value="&'">`,
    member: `<member-name data-value="&'">`,
    memberNote: `<member-note data-value="&'">`,
    term: `<term-body data-value="&'">`,
    termNote: `<term-note data-value="&'">`,
    survey: `<survey-description data-value="&'">`,
    surveyQuestion: `<survey-question data-value="&'">`,
    surveyNote: `<survey-note data-value="&'">`,
    signatureRole: `<signature-role data-value="&'">`,
    signatureName: `<signature-name data-value="&'">`,
  };
  model.documentTitle = malicious.title;
  model.order.systemCode = malicious.systemCode;
  model.order.name = malicious.order;
  model.order.status = malicious.orderStatus;
  model.customer.customerName = malicious.customer;
  model.salesItems[0].description = malicious.salesDescription;
  model.salesItems[0].supplier.name = malicious.salesSupplier;
  model.salesItems[0].service.serviceName = malicious.salesService;
  model.salesItems[0].note = malicious.salesNote;
  model.operationItems[0].bookingCode = malicious.operationBooking;
  model.operationItems[0].supplier.name = malicious.operationSupplier;
  model.operationItems[0].service.serviceName = malicious.operationService;
  model.operationItems[0].status = malicious.operationStatus;
  model.operationItems[0].note = malicious.operationNote;
  model.members[0].fullName = malicious.member;
  model.members[0].note = malicious.memberNote;
  model.terms[0].terms = malicious.term;
  model.terms[0].notes = malicious.termNote;
  model.survey.description = malicious.survey;
  model.survey.questions[0].question = malicious.surveyQuestion;
  model.survey.questions[0].note = malicious.surveyNote;
  model.signatures[0].role = malicious.signatureRole;
  model.signatures[0].name = malicious.signatureName;

  const html = runtime.orderDocumentHtml(model);
  assertBehavior(runtime.escapeOrderDocumentHtml(`<escape-check data-value="&'">`) === '&lt;escape-check data-value=&quot;&amp;&#39;&quot;&gt;', 'escape helper output is incomplete');
  for (const [label, value] of Object.entries(malicious)) {
    assertBehavior(html.includes(escaped(value)), `${label} escaped value is missing`);
    assertBehavior(!html.includes(value), `${label} inserted a raw tag`);
  }
  assertBehavior(html.includes('<span class="number">0</span>'), 'table zero values must render as 0');
  assertBehavior(html.includes('<strong>0</strong>'), 'booking and summary zero values must render as 0');
});

behavior('renderer must omit empty optional member, term, and survey sections', () => {
  const runtime = loadRenderer();
  const model = completeModel();
  model.members = [];
  model.terms = [];
  model.survey = { description: null, questions: [] };
  const html = runtime.orderDocumentHtml(model);
  assertBehavior(!html.includes('Danh sách thành viên'), 'empty member section was rendered');
  assertBehavior(!html.includes('Điều khoản'), 'empty terms section was rendered');
  assertBehavior(!html.includes('Đánh giá dịch vụ'), 'empty survey section was rendered');
});

function wordEnvironment(failure) {
  const calls = [];
  const state = { blob: null };
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      state.blob = this;
    }
  }
  const link = {
    href: '',
    download: '',
    click() {
      calls.push('click');
      if (failure === 'click') throw new Error('click failed');
    },
    remove() {
      calls.push('remove');
      if (failure === 'remove') throw new Error('remove failed');
    },
  };
  const document = {
    createElement(tag) {
      calls.push('createElement');
      assertBehavior(tag === 'a', 'Word download must create an anchor');
      if (failure === 'createElement') throw new Error('createElement failed');
      return link;
    },
    body: {
      appendChild(value) {
        calls.push('appendChild');
        assertBehavior(value === link, 'Word download appended the wrong element');
        if (failure === 'appendChild') throw new Error('appendChild failed');
      },
    },
  };
  const URL = {
    createObjectURL(blob) {
      calls.push('createObjectURL');
      assertBehavior(blob === state.blob, 'Word download created a URL for the wrong Blob');
      return 'blob:hotel-document';
    },
    revokeObjectURL(url) {
      calls.push('revokeObjectURL');
      assertBehavior(url === 'blob:hotel-document', 'Word download revoked the wrong URL');
    },
  };
  return { globals: { Blob: FakeBlob, document, URL }, calls, state, link };
}

behavior('Word success must produce a BOM document and release browser resources', () => {
  const environment = wordEnvironment();
  const runtime = loadRenderer(environment.globals);
  const model = completeModel();
  model.order.systemCode = 'H\u00f4tel Booking / 01';
  const result = runtime.downloadOrderWord(model);
  assertBehavior(result.extension === 'doc', 'Word result extension is not doc');
  assertBehavior(environment.state.blob.parts[0] === '\uFEFF', 'Word Blob is missing the UTF-8 BOM');
  assertBehavior(environment.state.blob.options.type === 'application/msword;charset=utf-8', 'Word Blob MIME is incorrect');
  assertBehavior(environment.link.download === 'Hotel-Booking-01.doc', `Word filename was not normalized: ${environment.link.download}`);
  assertBehavior(environment.link.href === 'blob:hotel-document', 'Word link did not receive the object URL');
  assertBehavior(
    environment.calls.join(',') === 'createObjectURL,createElement,appendChild,click,remove,revokeObjectURL',
    `Word success sequence was ${environment.calls.join(',')}`,
  );
});

for (const failure of ['createElement', 'appendChild', 'click', 'remove']) {
  behavior(`Word ${failure} failure must still revoke the object URL`, () => {
    const environment = wordEnvironment(failure);
    const runtime = loadRenderer(environment.globals);
    assertThrows(() => runtime.downloadOrderWord(completeModel()), `Word ${failure} failure did not propagate`);
    assertBehavior(environment.calls.includes('createObjectURL'), `Word ${failure} failure occurred before URL creation`);
    assertBehavior(environment.calls.includes('revokeObjectURL'), `Word ${failure} failure leaked the object URL`);
  });
}

function printModel(events) {
  const model = completeModel();
  Object.defineProperty(model, 'salesItems', {
    configurable: true,
    get() {
      events.push('render');
      return [];
    },
  });
  return model;
}

behavior('print success must render before opening and complete the isolated print sequence', () => {
  const runtime = loadRenderer();
  const calls = [];
  const popup = {
    document: {
      open() { calls.push('open'); },
      write(html) {
        calls.push('write');
        assertBehavior(html.startsWith('<!doctype html>'), 'print window received invalid HTML');
      },
      close() { calls.push('close'); },
    },
    focus() { calls.push('focus'); },
    setTimeout(callback, delay) {
      calls.push(`setTimeout:${delay}`);
      callback();
    },
    print() { calls.push('print'); },
  };
  runtime.writeOrderPrintWindow(popup, printModel(calls));
  assertBehavior(
    calls.join(',') === 'render,open,write,close,focus,setTimeout:150,print',
    `print success sequence was ${calls.join(',')}`,
  );
});

behavior('print write failure must close without focusing or scheduling print', () => {
  const runtime = loadRenderer();
  const calls = [];
  const popup = {
    document: {
      open() { calls.push('open'); },
      write() {
        calls.push('write');
        throw new Error('write failed');
      },
      close() { calls.push('close'); },
    },
    focus() { calls.push('focus'); },
    setTimeout() { calls.push('setTimeout'); },
    print() { calls.push('print'); },
  };
  assertThrows(() => runtime.writeOrderPrintWindow(popup, printModel(calls)), 'print write failure did not propagate');
  assertBehavior(calls.join(',') === 'render,open,write,close', `print write failure sequence was ${calls.join(',')}`);
});

behavior('renderer failure must not open the print document', () => {
  const runtime = loadRenderer();
  const calls = [];
  const model = completeModel();
  model.salesItems = null;
  const popup = {
    document: {
      open() { calls.push('open'); },
      write() { calls.push('write'); },
      close() { calls.push('close'); },
    },
    focus() { calls.push('focus'); },
    setTimeout() { calls.push('setTimeout'); },
    print() { calls.push('print'); },
  };
  assertThrows(() => runtime.writeOrderPrintWindow(popup, model), 'renderer failure did not propagate');
  assertBehavior(!calls.length, `renderer failure touched the popup: ${calls.join(',')}`);
});

behavior('Task 1 API return type must be assignable to OrderDocumentModel', () => {
  const virtualFile = path.resolve('__orders_hotel_document_model_compatibility__.ts');
  const virtualSource = `
    import { getHotelBookingOrderDocument } from './apps/api/src/modules/orders/order-document';
    import type { OrderDocumentModel } from './apps/web/app/orders/[type]/order-document';

    type ApiDocumentModel = Awaited<ReturnType<typeof getHotelBookingOrderDocument>>;
    const compatible: OrderDocumentModel = null as unknown as ApiDocumentModel;
    void compatible;
  `;
  const config = ts.readConfigFile('tsconfig.base.json', ts.sys.readFile);
  assertBehavior(!config.error, config.error ? ts.flattenDiagnosticMessageText(config.error.messageText, '\n') : 'invalid TypeScript config');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd(), { noEmit: true }, 'tsconfig.base.json');
  assertBehavior(!parsed.errors.length, ts.formatDiagnostics(parsed.errors, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  const host = ts.createCompilerHost(parsed.options, true);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  host.fileExists = (fileName) => path.resolve(fileName) === virtualFile || defaultFileExists(fileName);
  host.readFile = (fileName) => path.resolve(fileName) === virtualFile ? virtualSource : defaultReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (path.resolve(fileName) === virtualFile) {
      return ts.createSourceFile(fileName, virtualSource, languageVersion, true);
    }
    return defaultGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram([virtualFile], parsed.options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assertBehavior(!diagnostics.length, ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
});

(async () => {
  for (const test of asyncTests) {
    try {
      await test.action();
    } catch (error) {
      failures.push(`${test.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) {
    console.error('FAIL_ORDERS_HOTEL_BOOKING_DOCUMENTS_CLIENT_CONTRACT');
    failures.forEach((failure) => console.error(failure));
    process.exitCode = 1;
    return;
  }
  console.log('TEST_ORDERS_HOTEL_BOOKING_DOCUMENTS_CLIENT_CONTRACT_OK');
})().catch((error) => {
  console.error('FAIL_ORDERS_HOTEL_BOOKING_DOCUMENTS_CLIENT_CONTRACT');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
