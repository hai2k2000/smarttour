'use client';

import { LogIn, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function LoginClient() {
  const router = useRouter();
  const [message, setMessage] = useState('');

  async function login(formData: FormData) {
    setMessage('');
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: text(formData.get('email')), password: text(formData.get('password')) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message || 'Dang nhap khong thanh cong');
      return;
    }
    window.localStorage.setItem('smarttour.auth.token', data.token);
    window.localStorage.setItem('smarttour.auth.user', JSON.stringify(data.user));
    document.cookie = `smarttour.auth.token=${encodeURIComponent(data.token)}; path=/; max-age=${60 * 60 * 24 * 14}; samesite=lax`;
    router.push('/');
    router.refresh();
  }

  return (
    <section className="workspace loginPage">
      <div className="loginPanel">
        <div className="loginBrand">
          <ShieldCheck size={28} />
          <div>
            <p className="eyebrow">SmartTour</p>
            <h1>Dang nhap he thong</h1>
          </div>
        </div>
        <form action={login} className="loginForm">
          <label>Email<input name="email" type="email" required autoComplete="email" placeholder="admin@dunientravel.com" /></label>
          <label>Mat khau<input name="password" type="password" required autoComplete="current-password" /></label>
          {message ? <span className="formErrors">{message}</span> : null}
          <button type="submit"><LogIn size={16} /> Dang nhap</button>
        </form>
      </div>
    </section>
  );
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}
