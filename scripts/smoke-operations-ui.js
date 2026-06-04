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

if (!password && !existingToken) {
  console.error('Set ADMIN_PASSWORD or ADMIN_TOKEN for operations UI smoke');
  process.exit(1);
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

async function seedOperations(token) {
  const suffix = String(Date.now()).slice(-8);
  const branch = `${run}-BR`;
  const department = `${run}-DEP`;
  const customer = await request(token, 'POST', '/customers', {
    code: `${run}-CUS-${suffix}`,
    fullName: `Operations UI Customer ${suffix}`,
    phone: `089${suffix}`,
    branch,
    department,
  });
  const program = await request(token, 'POST', '/tour-programs', {
    code: `${run}-TP-${suffix}`,
    name: `Operations UI Program ${suffix}`,
    route: 'HN',
    durationDays: 1,
  });
  const booking = await request(token, 'POST', '/bookings', {
    code: `${run}-BKG-${suffix}`,
    tourProgramId: program.id,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    paxCount: 2,
    startDate: addDays(14),
    endDate: addDays(14),
  });
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
  const form = await request(token, 'POST', '/operations/forms', {
    bookingId: booking.id,
    notes: `${run} operation form UI ${suffix}`,
    services: [{
      supplierId: supplier.id,
      supplierServiceId,
      serviceType: 'MEAL',
      serviceName: `Operations UI Lunch ${suffix}`,
      confirmationStatus: 'WAITING',
      expectedCost: 250000,
      actualCost: 250000,
    }],
    tasks: [{ title: `Operations UI Confirm ${suffix}`, dueDate: addDays(-1), status: 'PENDING' }],
    costs: [{ costName: `Operations UI Cost ${suffix}`, expectedAmount: 250000, actualAmount: 250000, currency: 'VND', notes: `${run} cost UI ${suffix}` }],
  });
  const draftRequest = await request(token, 'POST', '/operations/supplier-payment-requests', {
    code: `${run}-REQ-DRAFT-${suffix}`,
    requestedBy: 'operations-ui-smoke',
    items: [{ supplierId: supplier.id, costId: form.costs[0].id, amount: 250000, notes: `${run} draft request UI ${suffix}` }],
  });
  return { suffix, booking, form, draftRequest };
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${safeName(name)}.png`), fullPage: false });
}

(async () => {
  await fs.mkdir(outDir, { recursive: true });
  const { token, user } = await getSession();
  const seed = await seedOperations(token);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const issues = [];
  const step = { value: 'bootstrap' };

  page.on('console', (message) => {
    if (isBadConsole(message)) issues.push({ step: step.value, type: 'console', text: message.text() });
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

  async function run(name, fn) {
    step.value = name;
    await fn();
    await page.waitForTimeout(250);
    await screenshot(page, name);
    console.log(`OK OPERATIONS_UI ${name}`);
  }

  try {
    await page.goto(site + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(({ authToken, authUser }) => {
      window.localStorage.setItem('smarttour.auth.token', authToken);
      window.localStorage.setItem('smarttour.auth.user', JSON.stringify(authUser));
      document.cookie = `smarttour.auth.token=${encodeURIComponent(authToken)}; path=/; max-age=${60 * 60}; samesite=lax`;
    }, { authToken: token, authUser: user });

    await run('load dashboard and forms', async () => {
      await page.goto(site + '/operations', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.getByTestId('operations-page').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-dashboard').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-search').fill(seed.suffix);
      await page.getByText(seed.booking.code, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      const rows = await page.getByTestId('operation-form-row').count();
      if (rows < 1) throw new Error('Operations form list did not render seeded form');
    });

    await run('form modal open and close', async () => {
      await page.getByTestId('operations-create-button').click();
      await page.getByTestId('operation-form-modal').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operation-form-modal-close').click();
      await page.getByTestId('operation-form-modal').waitFor({ state: 'hidden', timeout: 15000 });
    });

    await run('payment modal from form action', async () => {
      await page.getByTestId('operation-form-create-payment').first().click();
      await page.getByTestId('operation-payment-modal').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operation-payment-modal-close').click();
      await page.getByTestId('operation-payment-modal').waitFor({ state: 'hidden', timeout: 15000 });
      await page.getByTestId('operations-tab-forms').click();
      await page.getByTestId('operations-search').fill(seed.suffix);
      await page.getByText(seed.booking.code, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
    });

    await run('payment tab search and reconciliation panel', async () => {
      await page.getByTestId('operations-tab-payments').click();
      await page.getByTestId('operation-reconciliation-empty').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-search').fill(seed.draftRequest.code);
      await page.getByText(seed.draftRequest.code, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operation-payment-view-reconciliation').first().click();
      await page.getByTestId('operation-reconciliation-panel').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operation-reconciliation-panel').getByText(seed.draftRequest.code, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('reconciliation-submit').waitFor({ state: 'visible', timeout: 15000 });
      if (await page.getByTestId('reconciliation-submit').isDisabled()) throw new Error('Draft request submit action should be enabled');
      if (!(await page.getByTestId('reconciliation-approve').isDisabled())) throw new Error('Draft request approve action should be disabled');
      if (!(await page.getByTestId('reconciliation-create-finance').isDisabled())) throw new Error('Draft request create finance action should be disabled');
    });

    await run('tab state resets selected reconciliation', async () => {
      await page.getByTestId('operations-tab-forms').click();
      await page.getByTestId('operations-search').fill(seed.suffix);
      await page.getByText(seed.booking.code, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
      await page.getByTestId('operations-tab-payments').click();
      await page.getByTestId('operation-reconciliation-empty').waitFor({ state: 'visible', timeout: 15000 });
    });

    if (issues.length) {
      await fs.writeFile(path.join(outDir, 'issues.json'), JSON.stringify(issues, null, 2));
      throw new Error(`Operations UI smoke captured ${issues.length} issue(s); see ${outDir}/issues.json`);
    }

    console.log(`SMOKE_OPERATIONS_UI_OK output=${outDir}`);
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, `failure-${safeName(step.value)}.png`), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(outDir, 'failure.txt'), error.stack || error.message).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
