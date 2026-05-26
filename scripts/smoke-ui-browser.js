#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');

const site = process.env.SITE_URL || 'https://quanly.dunientravel.com';
const email = process.env.ADMIN_EMAIL || 'admin@smarttour.local';
const password = process.env.ADMIN_PASSWORD;
const outDir = process.env.OUT_DIR || '/tmp/smarttour-ui-browser-smoke';

if (!password) {
  console.error('Set ADMIN_PASSWORD to the current admin password');
  process.exit(1);
}

const routes = [
  '/',
  '/security',
  '/customers',
  '/orders/fit-tours',
  '/finance',
  '/operations',
  '/operation-vouchers',
  '/order-center',
  '/quotes/tours',
  '/quotes/combos',
  '/quotations',
  '/suppliers',
  '/suppliers/hotels',
  '/suppliers/restaurants',
  '/bookings',
  '/tour-programs',
  '/reports',
  '/tour-guides',
  '/commission-reports',
  '/fit-tours',
  '/git-tours',
  '/landtours',
];

const ignoredRequestPatterns = [
  /favicon\.ico/i,
  /chrome-extension:/i,
];

function safeName(route) {
  return (route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_')) || 'home';
}

function isBadConsole(message) {
  if (!['error', 'warning'].includes(message.type())) return false;
  const text = message.text();
  if (/Failed to load resource: the server responded with a status of 404.*favicon/i.test(text)) return false;
  if (/Download the React DevTools/i.test(text)) return false;
  return /error|failed|exception|typeerror|referenceerror|hydration|cannot read/i.test(text);
}

(async () => {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const issues = [];
  const currentRoute = { value: 'login' };

  page.on('console', (message) => {
    if (isBadConsole(message)) issues.push({ route: currentRoute.value, type: 'console', text: message.text() });
  });
  page.on('pageerror', (error) => issues.push({ route: currentRoute.value, type: 'pageerror', text: error.message }));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (ignoredRequestPatterns.some((pattern) => pattern.test(url))) return;
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    issues.push({ route: currentRoute.value, type: 'requestfailed', text: `${request.method()} ${url} ${request.failure()?.errorText || ''}` });
  });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500) issues.push({ route: currentRoute.value, type: 'http', text: `${status} ${url}` });
  });

  try {
    await page.goto(site + '/login', { waitUntil: 'networkidle', timeout: 45000 });
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/mật khẩu|mat khau|password/i).fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 }),
      page.getByRole('button', { name: new RegExp('\\u0111\\u0103ng nh\\u1eadp|dang nhap|login', 'i') }).click(),
    ]);

    const token = await page.evaluate(() => window.localStorage.getItem('smarttour.auth.token'));
    if (!token) throw new Error('Login did not persist smarttour.auth.token');
    console.log('LOGIN_BROWSER_OK');

    for (const route of routes) {
      currentRoute.value = route;
      const response = await page.goto(site + route, { waitUntil: 'networkidle', timeout: 45000 });
      const status = response?.status() || 0;
      if (status !== 200) throw new Error(`${route} returned HTTP ${status}`);
      if (page.url().includes('/login')) throw new Error(`${route} redirected to login`);
      await page.locator('body').waitFor({ state: 'visible', timeout: 15000 });
      const title = await page.title();
      const bodyText = await page.locator('body').innerText({ timeout: 15000 });
      if (bodyText.length < 50) throw new Error(`${route} rendered too little text`);
      if (/Application error|Internal Server Error|Unhandled Runtime Error|Cannot read properties|ReferenceError|TypeError/i.test(bodyText)) throw new Error(`${route} rendered an error signature`);
      await page.screenshot({ path: path.join(outDir, `${safeName(route)}.png`), fullPage: false });
      console.log(`200 BROWSER ${route} title=${JSON.stringify(title)} text=${bodyText.length}`);
    }

    if (issues.length) {
      await fs.writeFile(path.join(outDir, 'issues.json'), JSON.stringify(issues, null, 2));
      throw new Error(`Browser smoke captured ${issues.length} issue(s); see ${outDir}/issues.json`);
    }

    console.log(`SMOKE_UI_BROWSER_OK output=${outDir}`);
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, `failure-${safeName(currentRoute.value)}.png`), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(outDir, 'failure.txt'), error.stack || error.message).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
