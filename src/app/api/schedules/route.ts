import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createScheduleSchema } from '@/lib/validation';
import { createAuditLog } from '@/skills/security/audit-log';
import { parseExpression } from 'cron-parser';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const schedules = await prisma.paymentSchedule.findMany({
    where: { userId: (session.user as any).id },
    include: {
      wallet: { select: { name: true, xpubFingerprint: true } },
      _count: { select: { transactions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(schedules.map(s => ({
    ...s,
    amountSats: s.amountSats.toString(),
  })));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!['PAYER', 'RECIPIENT', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data = createScheduleSchema.parse(body);

    const wallet = await prisma.wallet.findFirst({
      where: { id: data.walletId, userId },
    });
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

    // Compute interval from cron so each schedule gets its own independent timer
    // (not snapped to wall-clock boundaries like :00, :10, :20)
    const expr = parseExpression(data.cronExpression, { tz: data.timezone });
    const first = expr.next().toDate();
    const second = expr.next().toDate();
    const intervalMs = second.getTime() - first.getTime();
    const nextRun = new Date(Date.now() + intervalMs);

    const schedule = await prisma.paymentSchedule.create({
      data: {
        userId,
        walletId: data.walletId,
        recipientAddress: data.recipientAddress ?? null,
        recipientXpub: data.recipientXpub ?? null,
        recipientName: data.recipientName,
        amountSats: data.amountSats,
        cronExpression: data.cronExpression,
        timezone: data.timezone,
        maxFeeRate: data.maxFeeRate,
        rbfEnabled: data.rbfEnabled,
        nextRunAt: nextRun,
      },
    });

    await createAuditLog({
      userId,
      action: 'SCHEDULE_CREATED',
      entity: 'PaymentSchedule',
      entityId: schedule.id,
      metadata: { amountSats: data.amountSats.toString(), cronExpression: data.cronExpression },
    });

    return NextResponse.json({
      ...schedule,
      amountSats: schedule.amountSats.toString(),
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Schedule creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
