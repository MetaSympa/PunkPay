import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { walletId } = await params;
  const userId = (session.user as any).id;

  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  const { count } = await prisma.utxo.updateMany({
    where: { walletId, isLocked: true },
    data: { isLocked: false, lockedUntil: null, lockedByTxId: null },
  });

  return NextResponse.json({ unlocked: count });
}
