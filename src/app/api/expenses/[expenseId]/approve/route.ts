import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/skills/security/audit-log';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ expenseId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== 'PAYER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only payers can approve expenses' }, { status: 403 });
  }

  const { expenseId } = await params;
  const body = await req.json();
  const action = body.action as 'approve' | 'reject';

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  if (expense.status !== 'PENDING') {
    return NextResponse.json({ error: 'Expense already reviewed' }, { status: 409 });
  }

  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: action === 'approve' ? 'APPROVED' : 'REJECTED',
      approverId: (session.user as any).id,
      reviewedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: (session.user as any).id,
    action: action === 'approve' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
    entity: 'Expense',
    entityId: expenseId,
  });

  return NextResponse.json({
    ...updated,
    amount: updated.amount.toString(),
  });
}
