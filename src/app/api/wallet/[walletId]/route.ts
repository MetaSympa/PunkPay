import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/skills/security/audit-log';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { walletId } = await params;

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId: (session.user as any).id },
    include: {
      addresses: { orderBy: { index: 'desc' }, take: 20 },
      utxos: { where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] } } },
      _count: { select: { transactions: true } },
    },
  });

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  const balance = wallet.utxos.reduce((sum, u) => sum + u.valueSats, 0n);
  const confirmedBalance = wallet.utxos
    .filter(u => u.status === 'CONFIRMED')
    .reduce((sum, u) => sum + u.valueSats, 0n);

  return NextResponse.json({
    ...wallet,
    encryptedXpub: undefined,
    encryptedSeed: undefined,
    balance: balance.toString(),
    confirmedBalance: confirmedBalance.toString(),
    utxos: wallet.utxos.map(u => ({ ...u, valueSats: u.valueSats.toString(), lockedUntil: u.lockedUntil?.toISOString() ?? null })),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { walletId } = await params;

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId: (session.user as any).id },
  });

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  await prisma.wallet.delete({ where: { id: walletId } });

  await createAuditLog({
    userId: (session.user as any).id,
    action: 'WALLET_DELETED',
    entity: 'Wallet',
    entityId: walletId,
    metadata: { name: wallet.name, fingerprint: wallet.xpubFingerprint },
  });

  return NextResponse.json({ success: true });
}
