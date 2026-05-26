import { cookies } from 'next/headers';

export async function serverAuthJsonHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get('smarttour.auth.token')?.value;
  return { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function serverAuthHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get('smarttour.auth.token')?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
