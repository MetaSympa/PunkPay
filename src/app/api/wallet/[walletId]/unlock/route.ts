import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const unlockSchema = z.object({
  transactionId: z.string().cuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { walletId } = await params;
  const userId = (session.user as any).id;

  let transactionId: string;
  try {
    const body = await req.json();
    ({ transactionId } = unlockSchema.parse(body));
  } catch {
    return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
  }

  // Verify wallet ownership
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  // Verify the transaction belongs to this wallet and is still a DRAFT — broadcast
  // and confirmed transactions have already moved their UTXOs to SPENT.
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, walletId, status: 'DRAFT' },
  });
  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  // Unlock only the UTXOs that were locked for this specific transaction.
  const { count } = await prisma.utxo.updateMany({
    where: { walletId, lockedByTxId: transactionId },
    data: { isLocked: false, lockedUntil: null, lockedByTxId: null },
  });

  return NextResponse.json({ unlocked: count });
}
