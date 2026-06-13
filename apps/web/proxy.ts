import { NextResponse, type NextRequest } from 'next/server';

const publicFile = /\.[^/]+$/;
const publicPrefixes = ['/login', '/_next', '/brand'];
const publicFiles = new Set(['/favicon.ico', '/favicon-32x32.png', '/icon-192.png']);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return NextResponse.next();
  if (publicFiles.has(pathname) || publicFile.test(pathname)) return NextResponse.next();

  const token = request.cookies.get('smarttour.auth.token')?.value;
  if (!token) return redirectToLogin(request, pathname, search);

  if (await isValidSession(request, token)) return NextResponse.next();

  const response = redirectToLogin(request, pathname, search);
  response.cookies.set('smarttour.auth.token', '', { path: '/', maxAge: 0 });
  return response;
}

async function isValidSession(request: NextRequest, token: string) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || request.nextUrl.origin;
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
      headers: { Cookie: `smarttour.auth.token=${encodeURIComponent(token)}` },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

function redirectToLogin(request: NextRequest, pathname: string, search: string) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!api).*)'],
};
