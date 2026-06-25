#!/usr/bin/env node
const fs = require('fs');
const source = fs.readFileSync('apps/web/app/login/LoginClient.tsx', 'utf8');
const failures = [];

for (const token of [
  'loginErrorMessage',
  'response.status === 429',
  'Thử lại sau ít phút.',
  'Thông tin đăng nhập không hợp lệ',
  'data?.messages',
]) {
  if (!source.includes(token)) failures.push(`LoginClient missing ${token}`);
}

if (source.includes("setMessage(data.message || 'Đăng nhập không thành công')")) {
  failures.push('LoginClient must not blindly display raw backend login failure strings');
}

if (failures.length) {
  console.error('FAIL_AUTH_LOGIN_UI_CONTRACT');
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('TEST_AUTH_LOGIN_UI_CONTRACT_OK');
