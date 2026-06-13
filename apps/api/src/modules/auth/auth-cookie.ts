import { smartTourEnvironment } from '../../config/runtime-env';
import { AUTH_TOKEN_COOKIE } from './auth-token';

type AuthCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  expires?: Date;
  maxAge?: number;
};

type AuthCookieClearOptions = Omit<AuthCookieOptions, 'expires' | 'maxAge'>;

export type AuthCookieResponse = {
  cookie(name: string, value: string, options: AuthCookieOptions): unknown;
  clearCookie(name: string, options: AuthCookieClearOptions): unknown;
};

export function setAuthCookie(response: AuthCookieResponse, token: string, expiresAt: Date | string) {
  const expires = normalizeExpiresAt(expiresAt);
  response.cookie(AUTH_TOKEN_COOKIE, token, {
    ...baseAuthCookieOptions(),
    expires,
    maxAge: Math.max(expires.getTime() - Date.now(), 0),
  });
}

export function clearAuthCookie(response: AuthCookieResponse) {
  response.clearCookie(AUTH_TOKEN_COOKIE, baseAuthCookieOptions());
}

function baseAuthCookieOptions(): AuthCookieClearOptions {
  return {
    httpOnly: true,
    secure: authCookieSecure(),
    sameSite: 'lax',
    path: '/',
  };
}

function authCookieSecure() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const appEnv = smartTourEnvironment();
  return nodeEnv === 'production' || nodeEnv === 'staging' || appEnv === 'production' || appEnv === 'staging';
}

function normalizeExpiresAt(value: Date | string) {
  const expires = value instanceof Date ? value : new Date(value);
  return Number.isFinite(expires.getTime()) ? expires : new Date();
}
