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
      id: 'credentials',
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

        // Signal-only users can't login with password
        if (user.passwordHash === '__signal_otp_user__') return null;

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
    Credentials({
      id: 'telegram-otp',
      name: 'Telegram OTP',
      credentials: {
        telegramChatId: { label: 'Telegram Chat ID', type: 'text' },
        code: { label: 'OTP Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.telegramChatId || !credentials?.code) return null;

        const { otpStore } = await import('@/app/api/auth/send-otp/route');

        const stored = otpStore.get(credentials.telegramChatId as string);
        if (!stored) return null;
        if (Date.now() > stored.expiresAt) {
          otpStore.delete(credentials.telegramChatId as string);
          return null;
        }
        if (stored.code !== credentials.code) return null;

        otpStore.delete(credentials.telegramChatId as string);

        const user = await prisma.user.findFirst({
          where: { signalNumber: credentials.telegramChatId as string },
        });

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
