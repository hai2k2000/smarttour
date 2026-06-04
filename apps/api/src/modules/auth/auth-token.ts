export const AUTH_TOKEN_COOKIE = 'smarttour.auth.token';

export type AuthTokenHeaders = {
  authorization?: string | string[];
  cookie?: string | string[];
};

export function tokenFromHeaders(headers?: AuthTokenHeaders | null) {
  return bearerToken(headers?.authorization) || cookieToken(headers?.cookie);
}

export function bearerToken(value?: string | string[]) {
  const header = singleHeader(value)?.trim();
  if (!header) return undefined;
  return header.match(/^Bearer\s+([^\s]+)$/i)?.[1];
}

export function cookieToken(value?: string | string[]) {
  const header = Array.isArray(value) ? value.join(';') : value;
  if (!header) return undefined;
  const prefix = `${AUTH_TOKEN_COOKIE}=`;
  const cookie = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!cookie) return undefined;
  const encoded = cookie.slice(prefix.length);
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function singleHeader(value?: string | string[]) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}
