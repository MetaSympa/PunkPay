import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { syncWalletUtxos } from '@/lib/bitcoin/sync';
import { applyRateLimit, SYNC_RATE_LIMIT } from '@/lib/api-utils';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const rateLimited = applyRateLimit(req, 'wallet-sync', SYNC_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { walletId } = await params;
  const userId = (session.user as any).id;

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId },
  });

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  try {
    const result = await syncWalletUtxos(walletId, wallet.network);

    return NextResponse.json({
      addressesChecked: result.addressesChecked,
      newUtxos: result.newUtxos,
      spentUtxos: result.spentUtxos,
      totalSats: result.totalSats.toString(),
      confirmedSats: result.confirmedSats.toString(),
      nextReceiveIndex: result.nextReceiveIndex,
      elapsed: result.elapsed,
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}
