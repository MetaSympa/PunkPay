import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram/client';
import { applyRateLimit, AUTH_RATE_LIMIT } from '@/lib/api-utils';

// In-memory OTP store — Map<telegramChatId, { code, expiresAt }>
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export { otpStore };

const sendOtpSchema = z.object({
  telegramChatId: z.string().min(1, 'Telegram chat ID required'),
  purpose: z.enum(['register', 'login']),
});

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(req, 'send-otp', AUTH_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const { telegramChatId, purpose } = sendOtpSchema.parse(body);

    // For login, check user exists
    if (purpose === 'login') {
      const user = await prisma.user.findFirst({ where: { signalNumber: telegramChatId } });
      if (!user) {
        return NextResponse.json({ error: 'No account with this Telegram ID' }, { status: 404 });
      }
    }

    // For register, check not already taken
    if (purpose === 'register') {
      const existing = await prisma.user.findFirst({ where: { signalNumber: telegramChatId } });
      if (existing) {
        return NextResponse.json({ error: 'Telegram ID already registered' }, { status: 409 });
      }
    }

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(telegramChatId, { code, expiresAt: Date.now() + 5 * 60 * 1000 });

    await sendTelegramMessage(telegramChatId, `🔐 <b>PunkPay OTP:</b> <code>${code}</code>\nExpires in 5 minutes.\nDo not share this code.`);

    return NextResponse.json({ sent: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Send OTP error:', error);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
