import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/skills/security/audit-log';
import { buildAndBroadcastPayment } from '@/lib/bitcoin/pay';

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
  const walletId = body.walletId as string | undefined;

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  if (expense.status !== 'PENDING') {
    return NextResponse.json({ error: 'Expense already reviewed' }, { status: 409 });
  }
  if (!expense.recipientAddress) {
    return NextResponse.json({ error: 'Expense has no recipient address' }, { status: 422 });
  }

  // ── Reject path ────────────────────────────────────────────────────────────
  if (action === 'reject') {
    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: { status: 'REJECTED', approverId: (session.user as any).id, reviewedAt: new Date() },
    });
    await createAuditLog({ userId: (session.user as any).id, action: 'EXPENSE_REJECTED', entity: 'Expense', entityId: expenseId });
    return NextResponse.json({ ...updated, amount: updated.amount.toString() });
  }

  // ── Approve path ───────────────────────────────────────────────────────────

  // If a hot wallet was provided, attempt auto-broadcast
  if (walletId) {
    // Verify the wallet belongs to the payer
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId: (session.user as any).id },
      select: { id: true, hasSeed: true },
    });
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    if (!wallet.hasSeed) return NextResponse.json({ error: 'Selected wallet has no seed — cannot auto-sign' }, { status: 422 });

    try {
      const { txid, feeSats } = await buildAndBroadcastPayment({
        walletId,
        recipientAddress: expense.recipientAddress,
        amountSats: expense.amount,
        maxFeeRate: 50,
      });

      const updated = await prisma.expense.update({
        where: { id: expenseId },
        data: {
          status: 'PAID',
          approverId: (session.user as any).id,
          reviewedAt: new Date(),
          paidTxid: txid,
          paidAt: new Date(),
        },
      });

      // Record the outgoing transaction
      await prisma.transaction.create({
        data: {
          walletId,
          txid,
          type: 'SEND',
          status: 'BROADCAST',
          amountSats: expense.amount,
          feeSats,
          feeRate: 0,
          recipientAddress: expense.recipientAddress,
          rbfEnabled: true,
          broadcastAt: new Date(),
        },
      });

      await createAuditLog({
        userId: (session.user as any).id,
        action: 'EXPENSE_APPROVED',
        entity: 'Expense',
        entityId: expenseId,
        metadata: { txid, autoPaid: true },
      });

      return NextResponse.json({ ...updated, amount: updated.amount.toString(), txid, autoPaid: true });
    } catch (err: any) {
      // Broadcast failed — still approve the expense so it can be paid manually
      const updated = await prisma.expense.update({
        where: { id: expenseId },
        data: { status: 'APPROVED', approverId: (session.user as any).id, reviewedAt: new Date() },
      });
      await createAuditLog({ userId: (session.user as any).id, action: 'EXPENSE_APPROVED', entity: 'Expense', entityId: expenseId });
      return NextResponse.json({
        ...updated,
        amount: updated.amount.toString(),
        autoPaid: false,
        broadcastError: err.message,
      });
    }
  }

  // No wallet provided — approve only, no auto-broadcast
  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: { status: 'APPROVED', approverId: (session.user as any).id, reviewedAt: new Date() },
  });
  await createAuditLog({ userId: (session.user as any).id, action: 'EXPENSE_APPROVED', entity: 'Expense', entityId: expenseId });
  return NextResponse.json({ ...updated, amount: updated.amount.toString(), autoPaid: false });
}
