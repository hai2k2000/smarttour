import { cookies } from 'next/headers';

export async function serverAuthJsonHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get('smarttour.auth.token')?.value;
  return { 'content-type': 'application/json', ...(token ? { Cookie: authCookieHeader(token) } : {}) };
}

export async function serverAuthHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get('smarttour.auth.token')?.value;
  return token ? { Cookie: authCookieHeader(token) } : {};
}

function authCookieHeader(token: string) {
  return `smarttour.auth.token=${encodeURIComponent(token)}`;
}
