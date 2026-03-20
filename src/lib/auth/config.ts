import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '../db';
import argon2 from 'argon2';
import { edgeAuthConfig } from './edge-config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...edgeAuthConfig,
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: 'TOTP Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const valid = await argon2.verify(
          user.passwordHash,
          credentials.password as string
        );
        if (!valid) return null;

        // If TOTP is enabled, verify the code
        if (user.totpEnabled && user.totpSecret) {
          if (!credentials.totpCode) return null;
          const { TOTPAuth } = await import('./totp');
          const isValidTotp = TOTPAuth.verify(user.totpSecret, credentials.totpCode as string);
          if (!isValidTotp) return null;
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
