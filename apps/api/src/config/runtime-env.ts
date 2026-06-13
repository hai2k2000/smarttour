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
  'SMARTTOUR_WEB_URL',
  'WEB_ORIGIN',
] as const;

const CORS_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

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
      CORS_ORIGIN_ENV_NAMES.flatMap((name) =>
        String(source[name] || '')
          .split(',')
          .map((value) => normalizeOrigin(value, name))
          .filter(Boolean),
      ),
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
    throw new Error(`SMARTTOUR_CORS_ORIGINS, CORS_ORIGINS, SMARTTOUR_WEB_URL, or WEB_ORIGIN must be configured when SMARTTOUR_ENV=${env}`);
  }
}

function normalizeOrigin(value: string, envName: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === '*') throw new Error(`${envName} must use explicit http(s) origins; wildcard is not allowed`);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${envName} contains an invalid CORS origin: ${trimmed}`);
  }

  if (!CORS_ALLOWED_PROTOCOLS.has(url.protocol)) throw new Error(`${envName} origin must use http or https: ${trimmed}`);
  if (url.username || url.password) throw new Error(`${envName} origin must not include credentials: ${trimmed}`);
  if (url.pathname && url.pathname !== '/') throw new Error(`${envName} origin must not include a path: ${trimmed}`);
  if (url.search) throw new Error(`${envName} origin must not include a query string: ${trimmed}`);
  if (url.hash) throw new Error(`${envName} origin must not include a fragment: ${trimmed}`);

  return url.origin;
}
