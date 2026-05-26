#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');

const site = process.env.SITE_URL || 'https://quanly.dunientravel.com';
const email = process.env.ADMIN_EMAIL || 'admin@smarttour.local';
const password = process.env.ADMIN_PASSWORD;
const outDir = process.env.OUT_DIR || '/tmp/smarttour-ui-interactions-smoke';

if (!password) {
  console.error('Set ADMIN_PASSWORD to the current admin password');
  process.exit(1);
}

function safeName(name) {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'step';
}

function isBadConsole(message) {
  if (!['error', 'warning'].includes(message.type())) return false;
  const text = message.text();
  if (/Failed to load resource: the server responded with a status of 404.*favicon/i.test(text)) return false;
  if (/Download the React DevTools/i.test(text)) return false;
  return /error|failed|exception|typeerror|referenceerror|hydration|cannot read/i.test(text);
}

async function visibleText(page, needle) {
  await page.getByText(needle, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${safeName(name)}.png`), fullPage: false });
}

async function clickIfVisible(locator) {
  if (await locator.count()) {
    const first = locator.first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      return true;
    }
  }
  return false;
}

(async () => {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const issues = [];
  const step = { value: 'login' };

  page.on('console', (message) => {
    if (isBadConsole(message)) issues.push({ step: step.value, type: 'console', text: message.text() });
  });
  page.on('pageerror', (error) => issues.push({ step: step.value, type: 'pageerror', text: error.message }));
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    if (/favicon\.ico/i.test(request.url())) return;
    issues.push({ step: step.value, type: 'requestfailed', text: `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}` });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) issues.push({ step: step.value, type: 'http', text: `${response.status()} ${response.url()}` });
  });

  async function run(name, fn) {
    step.value = name;
    await fn();
    await page.waitForTimeout(250);
    await screenshot(page, name);
    console.log(`OK INTERACTION ${name}`);
  }

  try {
    await page.goto(site + '/login', { waitUntil: 'networkidle', timeout: 45000 });
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/mật khẩu|mat khau|password/i).fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 }),
      page.getByRole('button', { name: new RegExp('\\u0111\\u0103ng nh\\u1eadp|dang nhap|login', 'i') }).click(),
    ]);
    console.log('LOGIN_INTERACTION_OK');

    await run('finance tabs and search', async () => {
      await page.goto(site + '/finance', { waitUntil: 'networkidle', timeout: 45000 });
      await visibleText(page, 'Tổng quan tài chính');
      for (const tab of ['Phiếu thu', 'Phiếu chi', 'Hóa đơn VAT', 'Dòng tiền']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await page.waitForTimeout(300);
      }
      const search = page.getByPlaceholder(/Tên, SĐT, email, mã chứng từ, mã tour/i);
      await search.fill('SMOKE-FIN');
      await page.waitForTimeout(500);
      await search.fill('');
    });

    await run('operations tabs and search', async () => {
      await page.goto(site + '/operations', { waitUntil: 'networkidle', timeout: 45000 });
      await visibleText(page, 'Vận hành tour');
      await page.getByRole('button', { name: /Thanh toán NCC/i }).click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /Phiếu điều hành/i }).click();
      const search = page.getByPlaceholder(/Booking, order, tour, mã yêu cầu/i);
      await search.fill('SMOKE-BIZ');
      await page.waitForTimeout(500);
      await search.fill('');
    });

    await run('operation vouchers form controls', async () => {
      await page.goto(site + '/operation-vouchers', { waitUntil: 'networkidle', timeout: 45000 });
      await visibleText(page, 'Danh sách phiếu điều hành dịch vụ');
      await page.getByPlaceholder(/Tìm mã phiếu, NCC, dịch vụ/i).fill('SMOKE-BIZ');
      await page.waitForTimeout(500);
      await clickIfVisible(page.getByRole('button', { name: /Thêm dòng/i }));
      await page.waitForTimeout(250);
      await clickIfVisible(page.locator('button.dangerButton.iconButton').last());
    });

    await run('security validation controls', async () => {
      await page.goto(site + '/security', { waitUntil: 'networkidle', timeout: 45000 });
      await visibleText(page, 'Người dùng, vai trò và quyền');
      const current = page.locator('input[name="currentPassword"]').first();
      const next = page.locator('input[name="newPassword"]').first();
      await current.fill('wrong-password');
      await next.fill('short');
      await page.getByRole('button', { name: /Đổi mật khẩu/i }).click();
      await page.waitForTimeout(500);
    });

    await run('global search and navigation links', async () => {
      await page.goto(site + '/', { waitUntil: 'networkidle', timeout: 45000 });
      const globalSearch = page.getByPlaceholder(/Tìm module, đơn hàng, khách hàng/i);
      await globalSearch.fill('finance');
      await page.waitForTimeout(300);
      await globalSearch.fill('');
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: /CRM/i }).first().click();
      await page.waitForURL(/\/customers/, { timeout: 15000 });
      await visibleText(page, 'CRM');
    });

    if (issues.length) {
      await fs.writeFile(path.join(outDir, 'issues.json'), JSON.stringify(issues, null, 2));
      throw new Error(`Interaction smoke captured ${issues.length} issue(s); see ${outDir}/issues.json`);
    }

    console.log(`SMOKE_UI_INTERACTIONS_OK output=${outDir}`);
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
