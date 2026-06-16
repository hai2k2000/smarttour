#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');

const site = process.env.SITE_URL || 'https://quanly.dunientravel.com';
const api = process.env.API_URL || `${site.replace(/\/+$/, '')}/api`;
const username = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || 'admin';
const password = process.env.ADMIN_PASSWORD || '';
const existingToken = process.env.ADMIN_TOKEN || '';
const outDir = process.env.OUT_DIR || '/tmp/smarttour-operations-ui-smoke';
const run = process.env.RUN_ID || `SMOKE-OPS-UI-${Date.now()}`;
const clientApiProxyFrom = (process.env.CLIENT_API_PROXY_FROM || (/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\/api/i.test(api) ? 'https://aitour.io.vn/api' : '')).replace(/\/+$/, '');

if (!password && !existingToken) {
  console.error('Set ADMIN_PASSWORD or ADMIN_TOKEN for operations UI smoke');
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeName(name) {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'step';
}

function isBadConsole(message) {
  if (!['error', 'warning'].includes(message.type())) return false;
  const text = message.text();
  if (/Failed to load resource: the server responded with a status of 404.*favicon/i.test(text)) return false;
  if (/Failed to load resource: the server responded with a status of 404/i.test(text)) return false;
  if (/Download the React DevTools/i.test(text)) return false;
  return /error|failed|exception|typeerror|referenceerror|hydration|cannot read/i.test(text);
}

async function request(token, method, urlPath, body, ok = [200, 201]) {
  const response = await fetch(api + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!ok.includes(response.status)) {
    throw new Error(`${method} ${urlPath} -> ${response.status} ${text.slice(0, 500)}`);
  }
  return data;
}

async function getSession() {
  if (existingToken) {
    const user = await request(existingToken, 'GET', '/auth/me');
    return { token: existingToken, user };
  }
  const response = await fetch(api + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: username, username, password }),
  });
  const data = await response.json().catch(() => ({}));
  const token = data.token || data.accessToken;
  if (!response.ok || !token || !data.user) {
    throw new Error(`Login failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  return { token, user: data.user };
}

function addDays(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedBooking(token, supplierSuffix, branch, department) {
  const unique = `${supplierSuffix}-${String(Date.now()).slice(-7)}`;
  const customer = await request(token, 'POST', '/customers', {
    code: `${run}-CUS-${unique}`,
    fullName: `Operations UI Customer ${unique}`,
    phone: `089${String(Date.now()).slice(-7)}`,
    branch,
    department,
  });
  const program = await request(token, 'POST', '/tour-programs', {
    code: `${run}-TP-${unique}`,
    name: `Operations UI Program ${unique}`,
    route: 'HN',
    durationDays: 1,
  });
  await request(token, 'POST', `/tour-programs/${program.id}/itinerary-days`, {
    dayNumber: 1,
    title: `Operations UI Day ${unique}`,
    description: `${run} itinerary ${unique}`,
  });
  const booking = await request(token, 'POST', '/bookings', {
    code: `${run}-BKG-${unique}`,
    tourProgramId: program.id,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    paxCount: 2,
    startDate: addDays(14),
    endDate: addDays(14),
  });
  return { customer, program, booking, unique };
}

async function createOperationForm(token, booking, supplier, supplierServiceId, suffix, amount = 250000) {
  return request(token, 'POST', '/operations/forms', {
    bookingId: booking.id,
    notes: `${run} operation form UI ${suffix}`,
    services: [{
      supplierId: supplier.id,
      supplierServiceId,
      serviceType: 'MEAL',
      serviceName: `Operations UI Lunch ${suffix}`,
      confirmationStatus: 'WAITING',
      expectedCost: amount,
      actualCost: amount,
    }],
    tasks: [{ title: `Operations UI Confirm ${suffix}`, dueDate: addDays(2), status: 'PENDING' }],
    costs: [{ costName: `Operations UI Cost ${suffix}`, expectedAmount: amount, actualAmount: amount, currency: 'VND', notes: `${run} cost UI ${suffix}` }],
  });
}

async function createPaymentRequest(token, form, supplier, suffix, amount = 250000) {
  return request(token, 'POST', '/operations/supplier-payment-requests', {
    code: `${run}-REQ-${suffix}`,
    requestedBy: 'operations-ui-smoke',
    items: [{ supplierId: supplier.id, costId: form.costs[0].id, amount, notes: `${run} request UI ${suffix}` }],
  });
}

async function seedOperations(token) {
  const suffix = String(Date.now()).slice(-8);
  const branch = `${run}-BR`;
  const department = `${run}-DEP`;
  const supplier = await request(token, 'POST', '/suppliers/restaurants', {
    supplierCode: `${run}-SUP-${suffix}`,
    name: `Operations UI Supplier ${suffix}`,
    phone: '0900000000',
    email: `ops-ui-${suffix}@smarttour.local`,
    province: 'HN',
    services: [{ serviceName: `Operations UI Service ${suffix}`, quantity: 1, netPrice: 250000, sellingPrice: 280000 }],
  });
  const supplierServiceId = supplier.supplierServices?.[0]?.id;
  if (!supplierServiceId) throw new Error('Seed supplier did not create supplierServices');

  const workflowBooking = await seedBooking(token, 'WORKFLOW', branch, department);
  const workflowForm = await createOperationForm(token, workflowBooking.booking, supplier, supplierServiceId, 'WORKFLOW');
  const rejectRequest = await createPaymentRequest(token, workflowForm, supplier, `REJECT-${suffix}`);

  const financeBooking = await seedBooking(token, 'FINANCE', branch, department);
  const financeForm = await createOperationForm(token, financeBooking.booking, supplier, supplierServiceId, 'FINANCE');
  const financeRequest = await createPaymentRequest(token, financeForm, supplier, `FINANCE-${suffix}`);

  const cancelBooking = await seedBooking(token, 'CANCEL', branch, department);
  const cancelForm = await createOperationForm(token, cancelBooking.booking, supplier, supplierServiceId, 'CANCEL');

  const uiCreateBooking = await seedBooking(token, 'UICREATE', branch, department);
  const errorBooking = await seedBooking(token, 'ERROR', branch, department);

  return {
    suffix,
    branch,
    department,
    supplier,
    supplierServiceId,
    workflowBooking: workflowBooking.booking,
    workflowForm,
    rejectRequest,
    financeBooking: financeBooking.booking,
    financeForm,
    financeRequest,
    cancelBooking: cancelBooking.booking,
    cancelForm,
    uiCreateBooking: uiCreateBooking.booking,
    errorBooking: errorBooking.booking,
  };
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${safeName(name)}.png`), fullPage: false });
}

async function installClientApiProxy(page) {
  const targetApi = api.replace(/\/+$/, '');
  if (!clientApiProxyFrom || clientApiProxyFrom === targetApi) return;
  const source = new URL(clientApiProxyFrom);
  const sourcePath = source.pathname.replace(/\/+$/, '');
  await page.route(`${clientApiProxyFrom}/**`, async (route) => {
    const requestInfo = route.request();
    if (requestInfo.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type,accept',
        },
      });
      return;
    }
    const requestUrl = new URL(requestInfo.url());
    const pathSuffix = requestUrl.pathname.startsWith(sourcePath) ? requestUrl.pathname.slice(sourcePath.length) || '/' : requestUrl.pathname;
    const targetUrl = `${targetApi}${pathSuffix}${requestUrl.search}`;
    const headers = { ...requestInfo.headers() };
    delete headers.host;
    delete headers.origin;
    const response = await fetch(targetUrl, {
      method: requestInfo.method(),
      headers,
      body: ['GET', 'HEAD'].includes(requestInfo.method()) ? undefined : requestInfo.postDataBuffer(),
    });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    responseHeaders['access-control-allow-origin'] = '*';
    await route.fulfill({ status: response.status, headers: responseHeaders, body: Buffer.from(await response.arrayBuffer()) });
  });
}

async function setStoredSession(page, token, user) {
  const siteUrl = new URL(site);
  await page.context().addCookies([{
    name: 'smarttour.auth.token',
    value: token,
    url: siteUrl.origin,
    httpOnly: true,
    secure: siteUrl.protocol === 'https:',
    sameSite: 'Lax',
  }]);
  await page.addInitScript((authUser) => {
    window.localStorage.removeItem('smarttour.auth.token');
    window.localStorage.setItem('smarttour.auth.user', JSON.stringify(authUser));
  }, user);
  await page.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
}

async function waitForNotice(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitEnabled(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (!(await locator.isDisabled().catch(() => true))) return;
    await sleep(100);
  }
  throw new Error(`${label} should be enabled`);
}

async function waitDisabled(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await locator.isDisabled().catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`${label} should be disabled`);
}

async function fillOperationFormModal(page, seed, booking, suffix, expectedAmount = '250001', actualAmount = '0') {
  const modal = page.getByTestId('operation-form-modal');
  await modal.locator('select[name="bookingId"]').selectOption(booking.id);
  await modal.locator('select[name="supplierId"]').selectOption(seed.supplier.id);
  await modal.locator(`select[name="supplierServiceId"] option[value="${seed.supplierServiceId}"]`).waitFor({ state: 'attached', timeout: 15000 });
  await modal.locator('select[name="supplierServiceId"]').selectOption(seed.supplierServiceId);
  await modal.locator('input[name="serviceType"]').fill('MEAL');
  await modal.locator('input[name="serviceName"]').fill(`Dịch vụ UI ${suffix}`);
  await modal.locator('select[name="confirmationStatus"]').selectOption('WAITING');
  await modal.locator('input[name="expectedCost"]').fill(expectedAmount);
  await modal.locator('input[name="actualCost"]').fill(actualAmount);
  await modal.locator('input[name="costName"]').fill(`Chi phí UI ${suffix}`);
  await modal.locator('input[name="taskTitle"]').fill(`Task UI ${suffix}`);
  await modal.locator('input[name="assignee"]').fill('Operations UI');
  await modal.locator('input[name="dueDate"]').fill(addDays(3));
  await modal.locator('textarea[name="notes"]').fill(`${run} tạo phiếu từ UI ${suffix}`);
}

async function formRow(page, code) {
  const row = page.getByTestId('operation-form-row').filter({ hasText: code }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  return row;
}

async function paymentRow(page, code) {
  const row = page.getByTestId('operation-payment-row').filter({ hasText: code }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  return row;
}

async function openPaymentRequest(page, code) {
  await page.getByTestId('operations-tab-payments').click();
  await page.getByTestId('operations-status-filter').selectOption('');
  await page.getByTestId('operations-search').fill(code);
  const row = await paymentRow(page, code);
  await row.getByTestId('operation-payment-view-reconciliation').click();
  await page.getByTestId('operation-reconciliation-panel').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('operation-reconciliation-panel').getByText(code, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
}

(async () => {
  await fs.mkdir(outDir, { recursive: true });
  const { token, user } = await getSession();
  const seed = await seedOperations(token);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await installClientApiProxy(page);
  const issues = [];
  const step = { value: 'bootstrap' };

  page.on('console', (message) => {
    const text = message.text();
    if (step.value === 'api error message' && /status of 400 \(Bad Request\)/i.test(text)) return;
    if (isBadConsole(message)) issues.push({ step: step.value, type: 'console', text });
  });
  page.on('pageerror', (error) => issues.push({ step: step.value, type: 'pageerror', text: error.message }));
  page.on('requestfailed', (requestInfo) => {
    if (requestInfo.failure()?.errorText === 'net::ERR_ABORTED') return;
    if (/favicon\.ico/i.test(requestInfo.url())) return;
    issues.push({ step: step.value, type: 'requestfailed', text: `${requestInfo.method()} ${requestInfo.url()} ${requestInfo.failure()?.errorText || ''}` });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) issues.push({ step: step.value, type: 'http', text: `${response.status()} ${response.url()}` });
  });

  async function runStep(name, fn) {
    step.value = name;
    await fn();
    await page.waitForTimeout(250);
    await screenshot(page, name);
    console.log(`OK OPERATIONS_UI ${name}`);
  }

  try {
    await setStoredSession(page, token, user);

    await runStep('load dashboard and form filters', async () => {
      await page.goto(site + '/operations', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.getByTestId('operations-page').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-dashboard').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-dashboard').getByText('Sắp khởi hành', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-dashboard').getByText('Yêu cầu thanh toán nhà cung cấp', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-search').fill(seed.workflowBooking.code);
      await page.getByTestId('operations-status-filter').selectOption('PENDING');
      await formRow(page, seed.workflowBooking.code);
      const rows = await page.getByTestId('operation-form-row').count();
      assert(rows >= 1, 'Operations form list did not render seeded form');
    });

    await runStep('payment filters and detail panel', async () => {
      await page.getByTestId('operations-tab-payments').click();
      await page.getByTestId('operation-reconciliation-empty').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-search').fill(seed.rejectRequest.code);
      await page.getByTestId('operations-status-filter').selectOption('DRAFT');
      const row = await paymentRow(page, seed.rejectRequest.code);
      await row.getByTestId('operation-payment-view-reconciliation').click();
      await page.getByTestId('operation-reconciliation-panel').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByText('Bước 1: Yêu cầu thanh toán', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByText('Bước 2: Phiếu chi tài chính', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByText('Bước 3: Hoàn tất đối soát', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await waitEnabled(page.getByTestId('reconciliation-submit'), 'draft submit action');
      await waitDisabled(page.getByTestId('reconciliation-approve'), 'draft approve action');
      await waitDisabled(page.getByTestId('reconciliation-create-finance'), 'draft create finance action');
      await page.getByTestId('operation-reconciliation-close').click();
      await page.getByTestId('operation-reconciliation-empty').waitFor({ state: 'visible', timeout: 15000 });
    });

    await runStep('create form success message', async () => {
      await page.getByTestId('operations-tab-forms').click();
      await page.getByTestId('operations-status-filter').selectOption('');
      await page.getByTestId('operations-search').fill(seed.uiCreateBooking.code);
      await page.getByTestId('operations-create-button').click();
      await page.getByTestId('operation-form-modal').waitFor({ state: 'visible', timeout: 15000 });
      await fillOperationFormModal(page, seed, seed.uiCreateBooking, 'CREATE-FORM', '260001');
      await waitEnabled(page.getByTestId('operation-form-modal').getByRole('button', { name: 'Tạo phiếu điều hành' }), 'create form submit button');
      await page.getByTestId('operation-form-modal').getByRole('button', { name: 'Tạo phiếu điều hành' }).click();
      await waitForNotice(page, 'Tạo phiếu điều hành thành công');
      await formRow(page, seed.uiCreateBooking.code);
    });

    await runStep('create payment request from form', async () => {
      await page.getByTestId('operations-tab-payments').click();
      await page.getByTestId('operations-status-filter').selectOption('');
      await page.getByTestId('operations-search').fill('');
      await page.getByTestId('operations-tab-forms').click();
      await page.getByTestId('operations-search').fill(seed.uiCreateBooking.code);
      await formRow(page, seed.uiCreateBooking.code);
      await page.getByTestId('operation-form-create-payment').first().click();
      await page.getByTestId('operation-payment-modal').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operation-payment-modal').locator('textarea[name="notes"]').fill(`${run} thanh toán tạo từ UI`);
      await waitEnabled(page.getByTestId('operation-payment-modal').getByRole('button', { name: 'Tạo yêu cầu thanh toán' }), 'create payment request submit button');
      await page.getByTestId('operation-payment-modal').getByRole('button', { name: 'Tạo yêu cầu thanh toán' }).click();
      await waitForNotice(page, 'Tạo yêu cầu thanh toán nhà cung cấp thành công');
      await page.getByTestId('operation-reconciliation-panel').waitFor({ state: 'visible', timeout: 15000 });
    });

    await runStep('cancel form with prompt and confirm', async () => {
      await page.getByTestId('operations-tab-forms').click();
      await page.getByTestId('operations-status-filter').selectOption('');
      await page.getByTestId('operations-search').fill(seed.cancelBooking.code);
      await formRow(page, seed.cancelBooking.code);
      page.once('dialog', async (prompt) => {
        assert(prompt.type() === 'prompt', 'cancel form should ask for a reason first');
        page.once('dialog', async (confirm) => {
          assert(confirm.type() === 'confirm', 'cancel form should confirm after reason');
          await confirm.accept();
        });
        await prompt.accept(`${run} lý do hủy từ UI`);
      });
      await page.getByTestId('operation-form-cancel').first().click();
      await waitForNotice(page, 'Hủy phiếu điều hành thành công');
      await page.getByTestId('operation-form-row').filter({ hasText: seed.cancelBooking.code }).filter({ hasText: 'Đã hủy' }).first().waitFor({ state: 'visible', timeout: 15000 });
    });

    await runStep('submit and reject request', async () => {
      await openPaymentRequest(page, seed.rejectRequest.code);
      await waitEnabled(page.getByTestId('reconciliation-submit'), 'reject flow submit action');
      await page.getByTestId('reconciliation-submit').click();
      await waitForNotice(page, 'Gửi duyệt yêu cầu thanh toán thành công');
      await waitEnabled(page.getByTestId('reconciliation-reject'), 'reject flow reject action');
      await page.getByTestId('reconciliation-reject').click();
      await waitForNotice(page, 'Từ chối yêu cầu thanh toán thành công');
      await page.getByTestId('operation-reconciliation-panel').locator('span').filter({ hasText: 'Từ chối |' }).first().waitFor({ state: 'visible', timeout: 15000 });
    });

    await runStep('submit approve and create finance payment', async () => {
      await openPaymentRequest(page, seed.financeRequest.code);
      await page.getByTestId('reconciliation-submit').click();
      await waitForNotice(page, 'Gửi duyệt yêu cầu thanh toán thành công');
      await waitEnabled(page.getByTestId('reconciliation-approve'), 'approve flow approve action');
      await page.getByTestId('reconciliation-approve').click();
      await waitForNotice(page, 'Duyệt yêu cầu thanh toán thành công');
      await waitEnabled(page.getByTestId('reconciliation-create-finance'), 'approved request create finance action');
      await page.getByTestId('reconciliation-create-finance').click();
      await waitForNotice(page, 'Tạo phiếu chi tài chính thành công');
      await page.getByTestId('operation-reconciliation-panel').getByText('Phiếu chi tài chính', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operation-reconciliation-panel').getByText('Chờ xử lý', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    });

    await runStep('api error message', async () => {
      await page.route('**/api/operations/forms', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Lỗi kiểm thử UI Operations' }) });
          return;
        }
        await route.fallback();
      });
      await page.getByTestId('operations-tab-forms').click();
      await page.getByTestId('operations-status-filter').selectOption('');
      await page.getByTestId('operations-search').fill(seed.errorBooking.code);
      await page.getByTestId('operations-create-button').click();
      await page.getByTestId('operation-form-modal').waitFor({ state: 'visible', timeout: 15000 });
      await fillOperationFormModal(page, seed, seed.errorBooking, 'ERROR-FORM', '270001');
      await waitEnabled(page.getByTestId('operation-form-modal').getByRole('button', { name: 'Tạo phiếu điều hành' }), 'create form submit button');
      await page.getByTestId('operation-form-modal').getByRole('button', { name: 'Tạo phiếu điều hành' }).click();
      await waitForNotice(page, 'Tạo phiếu điều hành thất bại (400). Chi tiết: Lỗi kiểm thử UI Operations');
      await page.unroute('**/api/operations/forms');
      await page.getByTestId('operation-form-modal-close').click();
      await page.getByTestId('operation-form-modal').waitFor({ state: 'hidden', timeout: 15000 });
    });

    await runStep('permission disabled state', async () => {
      const viewOnlyUser = {
        ...user,
        permissions: ['operation.form.view', 'operation.payment-request.view', 'data.scope.all'],
      };
      await setStoredSession(page, token, viewOnlyUser);
      await page.goto(site + '/operations', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.getByTestId('operations-page').waitFor({ state: 'visible', timeout: 15000 });
      await waitDisabled(page.getByTestId('operations-create-button'), 'view-only create form button');
      await page.getByTestId('operations-search').fill(seed.workflowBooking.code);
      await page.getByText(seed.workflowBooking.code, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
      await waitDisabled(page.getByTestId('operation-form-create-payment').first(), 'view-only create payment action');
      await waitDisabled(page.getByTestId('operation-form-cancel').first(), 'view-only cancel form action');
      await page.getByTestId('operations-tab-payments').click();
      await waitDisabled(page.getByTestId('operations-create-button'), 'view-only create payment button');
      await page.getByTestId('operations-search').fill(seed.financeRequest.code);
      await page.getByText(seed.financeRequest.code, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
      await waitDisabled(page.getByTestId('operation-payment-submit').first(), 'view-only submit payment action');
      await waitDisabled(page.getByTestId('operation-payment-approve').first(), 'view-only approve payment action');
      await waitDisabled(page.getByTestId('operation-payment-create-finance').first(), 'view-only create finance action');
      await page.getByTestId('operation-payment-view-reconciliation').first().click();
      await page.getByTestId('operation-reconciliation-panel').waitFor({ state: 'visible', timeout: 15000 });
      await waitDisabled(page.getByTestId('reconciliation-submit'), 'view-only reconciliation submit action');
      await waitDisabled(page.getByTestId('reconciliation-approve'), 'view-only reconciliation approve action');
      await waitDisabled(page.getByTestId('reconciliation-create-finance'), 'view-only reconciliation create finance action');
    });

    if (issues.length) {
      await fs.writeFile(path.join(outDir, 'issues.json'), JSON.stringify(issues, null, 2));
      throw new Error(`Operations UI smoke captured ${issues.length} issue(s); see ${outDir}/issues.json`);
    }

    console.log(`SMOKE_OPERATIONS_UI_OK output=${outDir}`);
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, `failure-${safeName(step.value)}.png`), fullPage: true }).catch(() => {});
    const debug = {
      step: step.value,
      url: page.url(),
      issues,
      bodyText: await page.locator('body').innerText({ timeout: 3000 }).catch((bodyError) => `BODY_TEXT_FAILED: ${bodyError.message}`),
    };
    await fs.writeFile(path.join(outDir, 'debug.json'), JSON.stringify(debug, null, 2)).catch(() => {});
    await fs.writeFile(path.join(outDir, 'failure.txt'), error.stack || error.message).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
