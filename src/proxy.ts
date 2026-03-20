import NextAuth from 'next-auth';
import { edgeAuthConfig } from '@/lib/auth/edge-config';

export default NextAuth(edgeAuthConfig).auth;

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
    '/recipient/:path*',
    '/recipient',
  ],
};
