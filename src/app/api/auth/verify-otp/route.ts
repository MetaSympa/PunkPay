import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { otpStore } from '../send-otp/route';
import { createAuditLog } from '@/skills/security/audit-log';
import { applyRateLimit, AUTH_RATE_LIMIT } from '@/lib/api-utils';

const verifyOtpSchema = z.object({
  telegramChatId: z.string().min(1),
  code: z.string().length(6),
  purpose: z.enum(['register', 'login']),
  email: z.string().email().optional(),
  role: z.enum(['PAYER', 'RECIPIENT']).default('RECIPIENT'),
});

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(req, 'verify-otp', AUTH_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const data = verifyOtpSchema.parse(body);

    // Verify OTP
    const stored = otpStore.get(data.telegramChatId);
    if (!stored) {
      return NextResponse.json({ error: 'No OTP found — request a new one' }, { status: 400 });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(data.telegramChatId);
      return NextResponse.json({ error: 'OTP expired' }, { status: 400 });
    }
    if (stored.code !== data.code) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    // OTP valid — consume it
    otpStore.delete(data.telegramChatId);

    if (data.purpose === 'register') {
      if (!data.email) {
        return NextResponse.json({ error: 'Email required for registration' }, { status: 400 });
      }

      const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingEmail) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
      }

      // Create user without password (Telegram-verified)
      // Store telegramChatId in signalNumber field (reusing existing column)
      const user = await prisma.user.create({
        data: {
          email: data.email,
          passwordHash: '__telegram_otp_user__',
          role: data.role,
          signalNumber: data.telegramChatId,
        },
        select: { id: true, email: true, role: true, signalNumber: true, createdAt: true },
      });

      await createAuditLog({
        userId: user.id,
        action: 'USER_REGISTERED_TELEGRAM',
        entity: 'User',
        entityId: user.id,
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      });

      return NextResponse.json({ ...user, registered: true }, { status: 201 });
    }

    // Login
    const user = await prisma.user.findFirst({
      where: { signalNumber: data.telegramChatId },
      select: { id: true, email: true, role: true, signalNumber: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ ...user, verified: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Verify OTP error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
