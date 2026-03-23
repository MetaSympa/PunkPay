import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { parseExpression } from 'cron-parser';

const updateScheduleSchema = z.object({
  isActive: z.boolean().optional(),
  maxFeeRate: z.number().positive().max(1000).optional(),
  recipientName: z.string().max(100).optional(),
}).strict(); // Reject any extra fields

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { scheduleId } = await params;

  const schedule = await prisma.paymentSchedule.findFirst({
    where: { id: scheduleId, userId: (session.user as any).id },
    include: {
      wallet: { select: { name: true } },
      transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });

  return NextResponse.json({
    ...schedule,
    amountSats: schedule.amountSats.toString(),
    transactions: schedule.transactions.map(tx => ({
      ...tx,
      amountSats: tx.amountSats.toString(),
      feeSats: tx.feeSats?.toString(),
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { scheduleId } = await params;

  const schedule = await prisma.paymentSchedule.findFirst({
    where: { id: scheduleId, userId: (session.user as any).id },
  });

  if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });

  const body = await req.json();
  const data = updateScheduleSchema.parse(body);

  // Recompute nextRunAt when resuming
  let nextRunAt: Date | undefined;
  if (data.isActive === true) {
    try {
      nextRunAt = parseExpression(schedule.cronExpression, { tz: schedule.timezone }).next().toDate();
    } catch {}
  }

  const updated = await prisma.paymentSchedule.update({
    where: { id: scheduleId },
    data: {
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.maxFeeRate !== undefined && { maxFeeRate: data.maxFeeRate }),
      ...(data.recipientName !== undefined && { recipientName: data.recipientName }),
      ...(nextRunAt && { nextRunAt }),
    },
  });

  return NextResponse.json({
    ...updated,
    amountSats: updated.amountSats.toString(),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { scheduleId } = await params;

  const schedule = await prisma.paymentSchedule.findFirst({
    where: { id: scheduleId, userId: (session.user as any).id },
  });

  if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });

  await prisma.paymentSchedule.delete({ where: { id: scheduleId } });

  return NextResponse.json({ success: true });
}
