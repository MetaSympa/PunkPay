import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { validateMnemonic, mnemonicToXpub } from '@/lib/bitcoin/seed-wallet';
import { getXpubFingerprint, deriveAddresses } from '@/lib/bitcoin';
import { createAuditLog } from '@/skills/security/audit-log';
import { z } from 'zod';

const createFromSeedSchema = z.object({
  name: z.string().min(1).max(100),
  mnemonic: z.string().min(1),
  network: z.enum(['mainnet', 'testnet', 'signet', 'regtest']).default('signet'),
  passphrase: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).role !== 'PAYER') {
    return NextResponse.json({ error: 'Forbidden — only PAYERs can create funding wallets' }, { status: 403 });
  }

  const userId = (session.user as any).id;

  try {
    const body = await req.json();
    const data = createFromSeedSchema.parse(body);

    const normalizedMnemonic = data.mnemonic.trim().toLowerCase();
    if (!validateMnemonic(normalizedMnemonic)) {
      return NextResponse.json({ error: 'Invalid BIP39 mnemonic phrase' }, { status: 400 });
    }

    const xpub = await mnemonicToXpub(normalizedMnemonic, data.network, data.passphrase);
    const encryptedXpub = encrypt(xpub);
    const encryptedSeed = encrypt(normalizedMnemonic);
    const fingerprint = getXpubFingerprint(xpub);

    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: data.name,
        encryptedXpub,
        xpubFingerprint: fingerprint,
        network: data.network,
        encryptedSeed,
        hasSeed: true,
      },
    });

    // Pre-derive first 20 receive addresses
    const addresses = deriveAddresses(xpub, 0, 0, 20, data.network);
    await prisma.address.createMany({
      data: addresses.map(a => ({
        walletId: wallet.id,
        address: a.address,
        index: a.index,
        chain: 'EXTERNAL' as const,
      })),
    });

    // Pre-derive first 5 change addresses
    const changeAddresses = deriveAddresses(xpub, 1, 0, 5, data.network);
    await prisma.address.createMany({
      data: changeAddresses.map(a => ({
        walletId: wallet.id,
        address: a.address,
        index: a.index,
        chain: 'INTERNAL' as const,
      })),
    });

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { nextReceiveIndex: 20, nextChangeIndex: 5 },
    });

    await createAuditLog({
      userId,
      action: 'WALLET_CREATED_FROM_SEED',
      entity: 'Wallet',
      entityId: wallet.id,
      metadata: { fingerprint, network: data.network, hasSeed: true },
    });

    return NextResponse.json({
      id: wallet.id,
      name: wallet.name,
      xpubFingerprint: fingerprint,
      network: data.network,
      hasSeed: true,
      addressCount: 20,
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Wallet create-from-seed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
