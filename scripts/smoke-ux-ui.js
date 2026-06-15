#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');

const site = process.env.SITE_URL || 'https://aitour.io.vn';
const adminToken = process.env.ADMIN_TOKEN;
const viewToken = process.env.VIEW_TOKEN;
const outDir = process.env.OUT_DIR || '/tmp/smarttour-ux-ui-smoke';

if (!adminToken || !viewToken) {
  console.error('ADMIN_TOKEN and VIEW_TOKEN are required');
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function user(id, name, permissions) {
  return {
    id,
    username: id,
    email: `${id}@smarttour.local`,
    name,
    status: 'ACTIVE',
    branch: 'UX',
    department: 'QA',
    dataScope: 'all',
    roles: [],
    permissions,
  };
}

const adminUser = user(process.env.ADMIN_USER_ID || 'ux-admin', 'UX UI Admin', ['*']);
const viewUser = user(process.env.VIEW_USER_ID || 'ux-view', 'UX UI Viewer', ['customer.view', 'data.scope.all']);

function customerRows() {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `ux-customer-${index + 1}`,
    code: `UX-${String(index + 1).padStart(3, '0')}-MA-KHACH-HANG-RAT-DAI`,
    fullName: `Khách hàng kiểm thử giao diện có tên rất dài số ${index + 1} để xác minh nội dung không chồng lấn`,
    phone: `090000${String(index + 1).padStart(4, '0')}`,
    email: `ux-long-customer-${index + 1}@smarttour.local`,
    kind: 'INDIVIDUAL',
    status: 'ACTIVE',
    source: 'Chiến dịch kiểm thử trải nghiệm người dùng',
    market: 'Thị trường tên rất dài',
    owner: 'Nhân viên phụ trách có tên rất dài',
    branch: 'Chi nhánh kiểm thử',
    department: 'Phòng đảm bảo chất lượng',
    type: { id: 'type-ux', name: 'Khách hàng thân thiết' },
    campaign: null,
    tags: [{ tag: { id: `tag-${index + 1}`, name: `Nhãn dài ${index + 1}` } }],
    contacts: [],
    careTasks: [],
    opportunities: [],
    files: [],
  }));
}

function customerList(search) {
  const rows = search === 'UX_EMPTY' ? [] : customerRows();
  return {
    rows,
    dashboard: {
      totalCustomers: rows.length,
      newToday: 2,
      newThisMonth: rows.length,
      oneTimeCustomers: 5,
      repeatCustomers: 7,
      totalRevenue: 987654321012345,
      totalDebt: 123456789012345,
    },
    types: [{ id: 'type-ux', name: 'Khách hàng thân thiết' }],
    tags: [{ id: 'tag-ux', name: 'Nhãn kiểm thử' }],
    campaigns: [],
  };
}

async function createContext(browser, token, storedUser, viewport) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, acceptDownloads: true });
  await context.addCookies([{
    name: 'smarttour.auth.token',
    value: token,
    url: site,
    httpOnly: true,
    secure: site.startsWith('https:'),
    sameSite: 'Lax',
  }]);
  await context.addInitScript((value) => {
    window.localStorage.setItem('smarttour.auth.user', JSON.stringify(value));
  }, storedUser);
  return context;
}

async function installCustomerMock(page, state) {
  await page.route('**/api/customers**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/customers/export') {
      const body = '\uFEFFcode,fullName,phone\r\n"UX-001","Khách hàng tiếng Việt","0900000001"\r\n';
      await route.fulfill({
        status: 200,
        body,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="smarttour-customers.csv"',
        },
      });
      return;
    }
    if (url.pathname !== '/api/customers') {
      await route.continue();
      return;
    }
    if (request.method() === 'POST') {
      state.customerPosts += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'unexpected-post' }) });
      return;
    }
    const search = url.searchParams.get('search') || '';
    state.listQueries.push(url.search);
    if (search === 'UX_SLOW') await new Promise((resolve) => setTimeout(resolve, 900));
    if (search === 'UX_ERROR') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Máy chủ kiểm thử tạm thời không phản hồi.' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(customerList(search)) });
  });
}

async function waitForCustomerRows(page) {
  await page.locator('table.customerTable tbody tr').nth(11).waitFor({ state: 'visible', timeout: 20000 });
  try {
    await page.waitForFunction(
      () => document.querySelector('.customerNameCell')?.getAttribute('title')?.includes('Khách hàng kiểm thử giao diện'),
      null,
      { timeout: 5000 },
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      matchingCells: document.querySelectorAll('.fitTableWrap table.customerTable th, .fitTableWrap table.customerTable td').length,
      firstRowTabIndex: document.querySelector('table.customerTable tbody tr')?.getAttribute('tabindex'),
      firstRowAria: document.querySelector('table.customerTable tbody tr')?.getAttribute('aria-label'),
      cellTitles: Array.from(document.querySelectorAll('table.customerTable tbody tr:first-child td')).map((cell) => cell.getAttribute('title')),
      bodyText: document.body.innerText.slice(0, 500),
    }));
    throw new Error(`Customer table bindings missing: ${JSON.stringify(diagnostics)}; ${error.message}`);
  }
}

async function assertCompactLayout(page, label) {
  const result = await page.evaluate(() => {
    const wrapper = document.querySelector('.customerList .compactListTableWrap');
    const table = wrapper?.querySelector('table');
    const rows = Array.from(table?.querySelectorAll('tbody tr') || []);
    const firstCell = rows[0]?.querySelector('td');
    const nameCell = rows[0]?.querySelector('.customerNameCell');
    if (!(wrapper instanceof HTMLElement) || !(table instanceof HTMLTableElement) || !(firstCell instanceof HTMLElement) || !(nameCell instanceof HTMLElement)) {
      return { error: 'missing compact customer table elements' };
    }
    const rowHeights = rows.map((row) => Math.round(row.getBoundingClientRect().height));
    const cellStyle = getComputedStyle(nameCell);
    const rowStyle = getComputedStyle(rows[0]);
    const firstRowCells = Array.from(rows[0].cells).map((cell) => ({
      text: (cell.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      height: cell.getBoundingClientRect().height,
      scrollHeight: cell.scrollHeight,
      childHeights: Array.from(cell.children).map((child) => ({
        tag: child.tagName,
        className: child.className,
        height: child.getBoundingClientRect().height,
        display: getComputedStyle(child).display,
        marginTop: getComputedStyle(child).marginTop,
        minHeight: getComputedStyle(child).minHeight,
      })),
    }));
    return {
      viewport: [window.innerWidth, window.innerHeight],
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wrapperHeight: Math.round(wrapper.getBoundingClientRect().height),
      wrapperScrollHeight: wrapper.scrollHeight,
      tableLayout: getComputedStyle(table).tableLayout,
      firstPosition: getComputedStyle(firstCell).position,
      nameWhiteSpace: getComputedStyle(nameCell).whiteSpace,
      rowHeights,
      title: nameCell.getAttribute('title') || '',
      cellBox: {
        height: cellStyle.height,
        minHeight: cellStyle.minHeight,
        maxHeight: cellStyle.maxHeight,
        paddingTop: cellStyle.paddingTop,
        paddingBottom: cellStyle.paddingBottom,
        boxSizing: cellStyle.boxSizing,
        lineHeight: cellStyle.lineHeight,
      },
      rowBox: {
        height: rowStyle.height,
        minHeight: rowStyle.minHeight,
        maxHeight: rowStyle.maxHeight,
        boxSizing: rowStyle.boxSizing,
      },
      firstRowCells,
    };
  });
  assert(!result.error, `${label}: ${result.error}`);
  assert(result.documentOverflow <= 1, `${label}: document overflows horizontally by ${result.documentOverflow}px`);
  assert(result.wrapperScrollHeight > result.wrapperHeight, `${label}: 12 rows should scroll inside the 10-row viewport`);
  assert(result.tableLayout === 'fixed', `${label}: compact table must use table-layout fixed`);
  assert(result.firstPosition === 'sticky', `${label}: first column must remain sticky`);
  assert(result.nameWhiteSpace === 'nowrap', `${label}: long customer text must stay on one line`);
  assert(result.rowHeights.every((height) => height <= 46), `${label}: row height exceeded compact limit: ${result.rowHeights.join(',')} cell=${JSON.stringify(result.cellBox)} row=${JSON.stringify(result.rowBox)} cells=${JSON.stringify(result.firstRowCells)}`);
  assert(result.title.includes('Khách hàng kiểm thử giao diện'), `${label}: truncated cell must expose full title`);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const issues = [];
  try {
    const adminContext = await createContext(browser, adminToken, adminUser, { width: 1366, height: 768 });
    const page = await adminContext.newPage();
    const state = { customerPosts: 0, listQueries: [] };
    page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Failed to load resource.*500/i.test(message.text())) issues.push(`console: ${message.text()}`);
    });
    await installCustomerMock(page, state);

    await page.goto(`${site}/customers`, { waitUntil: 'networkidle', timeout: 45000 });
    await waitForCustomerRows(page);
    await page.getByRole('button', { name: 'Tạo khách hàng', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Tạo khách hàng', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Hồ sơ khách hàng' });
    await dialog.getByLabel('Họ tên / Tên giao dịch').fill('Khách hàng validation');
    await dialog.getByLabel('SĐT', { exact: true }).fill('12');
    await dialog.getByLabel('Email', { exact: true }).fill('email-khong-hop-le');
    await dialog.getByRole('button', { name: 'Lưu khách hàng' }).click();
    await dialog.getByRole('alert').first().waitFor({ state: 'visible' });
    assert(state.customerPosts === 0, `Invalid customer form sent ${state.customerPosts} POST request(s)`);
    console.log('UX_VALIDATION_NO_API_OK');
    await dialog.getByRole('button', { name: 'Hủy' }).click();

    await assertCompactLayout(page, 'laptop');
    await page.screenshot({ path: path.join(outDir, 'customers-laptop.png'), fullPage: false });
    console.log('UX_COMPACT_TABLE_LAPTOP_OK');

    const search = page.getByPlaceholder('Tên, SĐT, email, mã khách');
    await search.fill('UX_FILTER');
    await page.waitForFunction(() => document.querySelector('input[placeholder="Tên, SĐT, email, mã khách"]')?.value === 'UX_FILTER');
    await page.waitForTimeout(300);
    assert(state.listQueries.some((query) => query.includes('search=UX_FILTER')), 'Search did not reload customers with the expected query');
    await page.getByRole('button', { name: 'Xóa lọc' }).click();
    await page.waitForFunction(() => document.querySelector('input[placeholder="Tên, SĐT, email, mã khách"]')?.value === '');
    await page.waitForTimeout(300);
    assert(state.listQueries.at(-1) === '', `Clear filter should reload without query, got ${state.listQueries.at(-1)}`);
    console.log('UX_FILTER_CLEAR_OK');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV', exact: true }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const bytes = await fs.readFile(downloadPath);
    const text = bytes.toString('utf8');
    assert(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, 'Downloaded CSV is missing UTF-8 BOM');
    assert(text.includes('\r\n') && text.includes('Khách hàng tiếng Việt'), 'Downloaded CSV is not Excel-compatible UTF-8 CSV');
    console.log('UX_EXPORT_EXCEL_OK');

    await search.fill('UX_SLOW');
    await page.getByText('Đang tải...', { exact: true }).first().waitFor({ state: 'visible', timeout: 3000 });
    await page.getByText('12 khách', { exact: false }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await search.fill('UX_EMPTY');
    await page.getByText('Chưa có khách hàng phù hợp với bộ lọc.').waitFor({ state: 'visible', timeout: 5000 });
    await search.fill('UX_ERROR');
    await page.getByRole('alert').filter({ hasText: 'Máy chủ kiểm thử tạm thời không phản hồi.' }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByText('Chưa có khách hàng phù hợp với bộ lọc.').waitFor({ state: 'visible', timeout: 5000 });
    console.log('UX_STATES_OK');

    await page.goto(`${site}/finance?tab=payments`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.getByRole('heading', { name: 'Thu, chi, hóa đơn và dòng tiền' }).waitFor({ state: 'visible' });
    await page.goBack({ waitUntil: 'networkidle', timeout: 45000 });
    await page.getByRole('heading', { name: 'Dữ liệu khách hàng' }).waitFor({ state: 'visible' });
    await page.goForward({ waitUntil: 'networkidle', timeout: 45000 });
    await page.getByRole('heading', { name: 'Thu, chi, hóa đơn và dòng tiền' }).waitFor({ state: 'visible' });
    assert(new URL(page.url()).searchParams.get('tab') === 'payments', 'Browser forward lost the finance tab state');
    console.log('UX_HISTORY_OK');

    const wideContext = await createContext(browser, adminToken, adminUser, { width: 1920, height: 1080 });
    const widePage = await wideContext.newPage();
    await installCustomerMock(widePage, { customerPosts: 0, listQueries: [] });
    await widePage.goto(`${site}/customers`, { waitUntil: 'networkidle', timeout: 45000 });
    await waitForCustomerRows(widePage);
    await assertCompactLayout(widePage, 'wide');
    await widePage.screenshot({ path: path.join(outDir, 'customers-wide.png'), fullPage: false });
    console.log('UX_COMPACT_TABLE_WIDE_OK');
    await wideContext.close();

    const viewContext = await createContext(browser, viewToken, viewUser, { width: 1366, height: 768 });
    const viewPage = await viewContext.newPage();
    await installCustomerMock(viewPage, { customerPosts: 0, listQueries: [] });
    await viewPage.goto(`${site}/customers`, { waitUntil: 'networkidle', timeout: 45000 });
    await waitForCustomerRows(viewPage);
    const createButtons = viewPage.getByRole('button', { name: /Tạo khách hàng|Tạo mới/ });
    const count = await createButtons.count();
    assert(count >= 2, 'Expected customer create actions for permission check');
    for (let index = 0; index < count; index += 1) {
      assert(await createButtons.nth(index).isDisabled(), `View-only create action ${index + 1} is enabled`);
    }
    console.log('UX_PERMISSION_OK');
    await viewContext.close();
    await adminContext.close();

    if (issues.length) throw new Error(`Browser issues captured:\n${issues.join('\n')}`);
    console.log(`SMOKE_UX_UI_OK output=${outDir}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
