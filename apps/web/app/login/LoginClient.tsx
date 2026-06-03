'use client';

import { LogIn } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function LoginClient() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');

  async function login(formData: FormData) {
    setMessage('');
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: text(formData.get('username')), password: text(formData.get('password')) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message || 'Đăng nhập không thành công');
      return;
    }
    window.localStorage.setItem('smarttour.auth.token', data.token);
    window.localStorage.setItem('smarttour.auth.user', JSON.stringify(data.user));
    document.cookie = `smarttour.auth.token=${encodeURIComponent(data.token)}; path=/; max-age=${60 * 60 * 24 * 14}; SameSite=Lax`;
    const nextPath = searchParams.get('next') || '/';
    window.location.assign(nextPath.startsWith('/') ? nextPath : '/');
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
