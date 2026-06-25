'use client';

import { LogIn } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toStoredAuthUser } from '../usePermissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const DEFAULT_AFTER_LOGIN_PATH = '/order-center';

export default function LoginClient() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');

  async function login(formData: FormData) {
    setMessage('');
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: text(formData.get('username')), password: text(formData.get('password')) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(response.status === 429 ? 'Thử lại sau ít phút.' : loginErrorMessage(response.status, data));
      return;
    }
    window.localStorage.removeItem('smarttour.auth.token');
    if (data.user) window.localStorage.setItem('smarttour.auth.user', JSON.stringify(toStoredAuthUser(data.user)));
    const nextPath = safeNextPath(searchParams.get('next'));
    window.location.assign(nextPath);
  }

  return (
    <section className="workspace loginPage">
      <div className="loginPanel">
        <div className="loginBrand">
          <span className="loginTextLogo">AI</span>
          <div>
            <p className="eyebrow">AI Tour Operations</p>
            <h1>Đăng nhập hệ thống</h1>
            <span>Nền tảng quản lý bán hàng, tour và vận hành</span>
          </div>
        </div>
        <form action={login} className="loginForm">
          <label>Tên đăng nhập<input name="username" required autoComplete="username" placeholder="admin" /></label>
          <label>Mật khẩu<input name="password" type="password" required autoComplete="current-password" /></label>
          {message ? <span className="formErrors">{message}</span> : null}
          <button type="submit"><LogIn size={16} /> Đăng nhập</button>
        </form>
      </div>
    </section>
  );
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }
  return value;
}


type LoginErrorData = { message?: unknown; messages?: unknown };

function loginErrorMessage(status: number, data?: LoginErrorData) {
  if (status === 429) return 'Thử lại sau ít phút.';
  if (status === 401) return 'Thông tin đăng nhập không hợp lệ';
  const messages = Array.isArray(data?.messages) ? data?.messages.map((item) => String(item)).filter(Boolean) : [];
  if (messages.length) return messages.join('; ');
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  return 'Đăng nhập không thành công';
}
