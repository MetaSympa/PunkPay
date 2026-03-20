import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { submitExpenseSchema, approveExpenseSchema } from '@/lib/validation';
import { createAuditLog } from '@/skills/security/audit-log';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const where: any = {};
  if (role === 'RECIPIENT') {
    where.submitterId = userId;
  }
  if (status) where.status = status;

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      submitter: { select: { email: true } },
      approver: { select: { email: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });

  return NextResponse.json(expenses.map(e => ({
    ...e,
    amount: e.amount.toString(),
  })));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = submitExpenseSchema.parse(body);

    const expense = await prisma.expense.create({
      data: {
        submitterId: (session.user as any).id,
        amount: data.amount,
        description: data.description,
        category: data.category,
        recipientAddress: data.recipientAddress,
        receiptUrl: data.receiptUrl,
      },
    });

    await createAuditLog({
      userId: (session.user as any).id,
      action: 'EXPENSE_SUBMITTED',
      entity: 'Expense',
      entityId: expense.id,
      metadata: { amount: data.amount.toString() },
    });

    return NextResponse.json({
      ...expense,
      amount: expense.amount.toString(),
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Expense submission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
