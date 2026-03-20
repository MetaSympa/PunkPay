import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'PAYER' | 'RECIPIENT' | 'ADMIN';
    } & DefaultSession['user'];
  }

  interface User {
    role: 'PAYER' | 'RECIPIENT' | 'ADMIN';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'PAYER' | 'RECIPIENT' | 'ADMIN';
  }
}
