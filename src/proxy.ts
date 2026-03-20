import NextAuth from 'next-auth';
import { edgeAuthConfig } from '@/lib/auth/edge-config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const { auth } = NextAuth(edgeAuthConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!req.auth;

  // Protected pages & API routes
  const isProtectedPage = config.matcher.some((pattern) => {
    const regex = new RegExp('^' + pattern.replace(':path*', '.*'));
    return regex.test(nextUrl.pathname);
  });

  if (isProtectedPage && !isAuthenticated) {
    // API routes get 401, pages get redirected
    if (nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', nextUrl));
  }

  // Add security headers to all responses
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  return response;
});

export const config = {
  matcher: [
    '/overview/:path*',
    '/wallet/:path*',
    '/schedules/:path*',
    '/transactions/:path*',
    '/expenses/:path*',
    '/api/wallet/:path*',
    '/api/schedules/:path*',
    '/api/transactions/:path*',
    '/api/expenses/:path*',
    '/api/utxos/:path*',
    '/api/recipients/:path*',
    '/api/recipient/:path*',
    '/api/payments/:path*',
    '/api/fees/:path*',
    '/recipient/:path*',
    '/recipient',
  ],
};
