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

  // Unlock only the UTXOs that were locked for this specific transaction.
  // Filtering by lockedByTxId (not by time) ensures we never accidentally free
  // UTXOs held by a concurrently-running transaction B when deleting transaction A.
  await prisma.utxo.updateMany({
    where: {
      walletId: tx.walletId,
      lockedByTxId: txId,
    },
    data: { isLocked: false, lockedUntil: null, lockedByTxId: null },
  });

  await prisma.transaction.delete({ where: { id: txId } });

  return NextResponse.json({ success: true });
}
