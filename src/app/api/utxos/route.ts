import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const walletId = searchParams.get('walletId');

  if (!walletId) return NextResponse.json({ error: 'walletId required' }, { status: 400 });

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId: (session.user as any).id },
  });

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  const utxos = await prisma.utxo.findMany({
    where: { walletId },
    include: { address: { select: { address: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(utxos.map(u => ({
    ...u,
    valueSats: u.valueSats.toString(),
  })));
}
