import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto/encryption';
import { deriveAddress } from '@/lib/bitcoin/hd-wallet';
import type { AddressType } from '@/lib/bitcoin/hd-wallet';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { walletId } = await params;
  const userId = (session.user as any).id;

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId },
  });
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  try {
    const xpub = decrypt(wallet.encryptedXpub);
    const addrType = (wallet.addressType || 'P2TR') as AddressType;
    const nextIndex = wallet.nextReceiveIndex + 1;

    // Derive the new address
    const derived = deriveAddress(xpub, 0, nextIndex, wallet.network, addrType);

    // Upsert into DB
    await prisma.address.upsert({
      where: { walletId_chain_index: { walletId, chain: 'EXTERNAL', index: nextIndex } },
      update: {},
      create: {
        walletId,
        address: derived.address,
        index: nextIndex,
        chain: 'EXTERNAL',
      },
    });

    // Advance the wallet pointer
    await prisma.wallet.update({
      where: { id: walletId },
      data: { nextReceiveIndex: nextIndex },
    });

    console.log(`[next-address] wallet=${walletId} advanced to index=${nextIndex}`);

    return NextResponse.json({ address: derived.address, index: nextIndex });
  } catch (err: any) {
    console.error('[next-address] error:', err instanceof Error ? err.stack : err);
    return NextResponse.json({ error: err.message || 'Failed to derive address' }, { status: 500 });
  }
}
