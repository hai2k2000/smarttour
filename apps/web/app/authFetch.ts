'use client';

export function authToken() {
  return typeof window !== 'undefined' ? window.localStorage.getItem('smarttour.auth.token') : null;
}

export function authJsonHeaders(): Record<string, string> {
  const token = authToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function authHeaders(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
