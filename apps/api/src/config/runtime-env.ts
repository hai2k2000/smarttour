export type SmartTourEnvironment = 'development' | 'staging' | 'production';

const ENV_ALIASES: Record<string, SmartTourEnvironment> = {
  dev: 'development',
  development: 'development',
  local: 'development',
  stage: 'staging',
  staging: 'staging',
  prod: 'production',
  production: 'production',
};

const CORS_ORIGIN_ENV_NAMES = [
  'SMARTTOUR_CORS_ORIGINS',
  'CORS_ORIGINS',
  'NEXT_PUBLIC_API_URL',
  'SMARTTOUR_WEB_URL',
  'WEB_ORIGIN',
] as const;

export function smartTourEnvironment(raw = process.env.SMARTTOUR_ENV || process.env.APP_ENV || process.env.NODE_ENV): SmartTourEnvironment {
  const value = String(raw || 'development').trim().toLowerCase();
  return ENV_ALIASES[value] || 'development';
}

export function authEnforceEnabled(env = smartTourEnvironment(), raw = process.env.SMARTTOUR_AUTH_ENFORCE): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return env === 'production' || env === 'staging';
}

export function configuredCorsOrigins(source: NodeJS.ProcessEnv = process.env) {
  return Array.from(
    new Set(
      CORS_ORIGIN_ENV_NAMES.flatMap((name) => String(source[name] || '').split(','))
        .map((value) => normalizeOrigin(value))
        .filter(Boolean),
    ),
  );
}

export function assertSecureRuntimeConfig() {
  const env = smartTourEnvironment();
  const enforce = authEnforceEnabled(env);
  if ((env === 'production' || env === 'staging') && !enforce) {
    throw new Error(`SMARTTOUR_AUTH_ENFORCE must be true when SMARTTOUR_ENV=${env}`);
  }
  if ((env === 'production' || env === 'staging') && configuredCorsOrigins().length === 0) {
    throw new Error(`SMARTTOUR_CORS_ORIGINS or WEB_ORIGIN must be configured when SMARTTOUR_ENV=${env}`);
  }
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}
