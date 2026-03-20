import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ txId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { txId } = await params;
  const userId = (session.user as any).id;

  const tx = await prisma.transaction.findFirst({
    where: { id: txId, wallet: { userId } },
  });

  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  if (tx.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT transactions can be deleted' }, { status: 400 });

  // Only unlock UTXOs whose locks have not yet expired (they belong to this tx).
  // NOTE: In a production system, we'd track which UTXOs belong to which transaction.
  // For now, only release locks that are still active for this wallet.
  await prisma.utxo.updateMany({
    where: {
      walletId: tx.walletId,
      isLocked: true,
      lockedUntil: { gt: new Date() },
    },
    data: { isLocked: false, lockedUntil: null },
  });

  await prisma.transaction.delete({ where: { id: txId } });

  return NextResponse.json({ success: true });
}
