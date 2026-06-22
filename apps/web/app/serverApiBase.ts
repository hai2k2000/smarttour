export function serverApiBase() {
  const internalApiBase = process.env.SMARTTOUR_SERVER_API_URL?.trim();
  if (internalApiBase) return internalApiBase.replace(/\/+$/, '');

  const publicApiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return 'http://api:4000';
  return publicApiBase;
}
