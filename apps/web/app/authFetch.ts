'use client';

export function authJsonHeaders(): Record<string, string> {
  return { Accept: 'application/json', 'Content-Type': 'application/json' };
}

export function authHeaders(): Record<string, string> {
  return { Accept: 'application/json' };
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: 'include' });
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('smarttour.auth.token');
  window.localStorage.removeItem('smarttour.auth.user');
}
