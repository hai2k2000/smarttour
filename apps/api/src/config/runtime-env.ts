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

export function smartTourEnvironment(raw = process.env.SMARTTOUR_ENV || process.env.APP_ENV || process.env.NODE_ENV): SmartTourEnvironment {
  const value = String(raw || 'development').trim().toLowerCase();
  return ENV_ALIASES[value] || 'development';
}

export function authEnforceEnabled(env = smartTourEnvironment(), raw = process.env.SMARTTOUR_AUTH_ENFORCE): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return env === 'production' || env === 'staging';
}

export function assertSecureRuntimeConfig() {
  const env = smartTourEnvironment();
  const enforce = authEnforceEnabled(env);
  if ((env === 'production' || env === 'staging') && !enforce) {
    throw new Error(`SMARTTOUR_AUTH_ENFORCE must be true when SMARTTOUR_ENV=${env}`);
  }
}
