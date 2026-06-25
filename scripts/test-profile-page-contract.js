#!/usr/bin/env node
const fs = require('fs');
const failures = [];
function read(path) {
  if (!fs.existsSync(path)) {
    failures.push(`${path} is missing`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}
function requireToken(source, token, label) {
  if (!source.includes(token)) failures.push(label || `missing ${token}`);
}

const appShell = read('apps/web/app/AppShell.tsx');
const menuStart = appShell.indexOf('<span>Thông tin người dùng</span>');
const menuBlock = menuStart === -1 ? '' : appShell.slice(Math.max(0, menuStart - 220), menuStart + 80);
requireToken(menuBlock, 'href="/profile"', 'account menu user info item must link to /profile');
requireToken(appShell, "href: '/profile'", 'AppShell route metadata must include /profile');
requireToken(appShell, "label: 'Hồ sơ cá nhân'", 'AppShell route label must identify the profile page');

const page = read('apps/web/app/profile/page.tsx');
requireToken(page, "import ProfileClient from './ProfileClient';", 'profile page must render ProfileClient');
requireToken(page, 'dynamic = \'force-dynamic\'', 'profile page must be dynamic for authenticated user state');

const client = read('apps/web/app/profile/ProfileClient.tsx');
for (const token of [
  'Hồ sơ cá nhân',
  'Thông tin tài khoản',
  'Đổi mật khẩu',
  '/api/auth/me',
  '/api/auth/change-password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'credentials: \'include\'',
  'updateAuthSession',
  'Mật khẩu mới phải khác mật khẩu hiện tại.',
]) {
  requireToken(client, token, `profile client missing ${token}`);
}

const css = read('apps/web/app/globals.css');
requireToken(css, '.profilePage', 'profile page must have scoped layout styles');
requireToken(css, '.profilePasswordPanel', 'profile password panel must have scoped styles');

if (failures.length) {
  console.error('FAIL_PROFILE_PAGE_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_PROFILE_PAGE_CONTRACT_OK');
