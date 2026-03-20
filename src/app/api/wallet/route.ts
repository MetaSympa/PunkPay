import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { importXpubSchema } from '@/lib/validation';
import { encrypt } from '@/lib/crypto';
import { validateXpub, getXpubFingerprint, deriveAddresses } from '@/lib/bitcoin';
import { createAuditLog } from '@/skills/security/audit-log';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallets = await prisma.wallet.findMany({
    where: { userId: (session.user as any).id },
    select: {
      id: true,
      name: true,
      xpubFingerprint: true,
      derivationPath: true,
      nextReceiveIndex: true,
      network: true,
      hasSeed: true,
      addressType: true,
      createdAt: true,
      _count: { select: { addresses: true, utxos: { where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] } } } } },
      utxos: {
        where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] } },
        select: { valueSats: true, status: true },
      },
    },
  });

  const result = wallets.map(({ utxos, ...wallet }) => {
    const balance = utxos.reduce((sum, u) => sum + u.valueSats, 0n);
    const confirmedBalance = utxos
      .filter(u => u.status === 'CONFIRMED')
      .reduce((sum, u) => sum + u.valueSats, 0n);
    return {
      ...wallet,
      balance: balance.toString(),
      confirmedBalance: confirmedBalance.toString(),
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  // All roles can import their own wallet (recipients use it to receive payments)

  try {
    const body = await req.json();
    const data = importXpubSchema.parse(body);

    if (!validateXpub(data.xpub, data.network)) {
      return NextResponse.json({ error: 'Invalid xpub for network' }, { status: 400 });
    }

    const encryptedXpub = encrypt(data.xpub);
    const fingerprint = getXpubFingerprint(data.xpub);
    const addressType = data.addressType ?? 'P2TR';
    const derivationPath = addressType === 'P2WPKH' ? "m/84'/0'/0'" : "m/86'/0'/0'";

    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: data.name,
        encryptedXpub,
        xpubFingerprint: fingerprint,
        network: data.network,
        addressType,
        derivationPath,
      },
    });

    // Pre-derive first 20 receive addresses
    const addresses = deriveAddresses(data.xpub, 0, 0, 20, data.network, addressType);
    await prisma.address.createMany({
      data: addresses.map(a => ({
        walletId: wallet.id,
        address: a.address,
        index: a.index,
        chain: 'EXTERNAL' as const,
      })),
    });

    // Pre-derive first 5 change addresses
    const changeAddresses = deriveAddresses(data.xpub, 1, 0, 5, data.network, addressType);
    await prisma.address.createMany({
      data: changeAddresses.map(a => ({
        walletId: wallet.id,
        address: a.address,
        index: a.index,
        chain: 'INTERNAL' as const,
      })),
    });

    // nextReceiveIndex stays at 0 — first unused address is the receive address.
    // nextChangeIndex stays at 0 — change addresses derived on demand.
    // The pre-derived addresses are just a scan buffer for sync.

    await createAuditLog({
      userId,
      action: 'WALLET_IMPORTED',
      entity: 'Wallet',
      entityId: wallet.id,
      metadata: { fingerprint, network: data.network },
    });

    return NextResponse.json({
      id: wallet.id,
      name: wallet.name,
      xpubFingerprint: fingerprint,
      network: data.network,
      addressCount: 20,
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Wallet import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
