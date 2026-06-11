'use client';

export function authToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('smarttour.auth.token') || authCookieToken();
}

export function authJsonHeaders(): Record<string, string> {
  const token = authToken();
  return { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function authHeaders(): Record<string, string> {
  const token = authToken();
  return { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('smarttour.auth.token');
  window.localStorage.removeItem('smarttour.auth.user');
  document.cookie = 'smarttour.auth.token=; path=/; max-age=0; SameSite=Lax';
}

function authCookieToken() {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('smarttour.auth.token='));
  if (!cookie) return null;
  const encoded = cookie.slice('smarttour.auth.token='.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}
