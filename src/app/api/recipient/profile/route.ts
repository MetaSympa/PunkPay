import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateXpub } from '@/lib/bitcoin/hd-wallet';
import { encrypt, decrypt } from '@/lib/crypto';

const profileSchema = z.object({
  xpub: z.string().min(50, 'Invalid xpub').optional(),
  walletId: z.string().cuid().optional(),
  network: z.enum(['mainnet', 'testnet', 'signet', 'regtest']).default('mainnet'),
  label: z.string().max(100).optional(),
}).refine(d => d.xpub || d.walletId, { message: 'Either xpub or walletId is required' });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.recipientProfile.findUnique({
    where: { userId: (session.user as any).id },
  });

  return NextResponse.json(profile);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = profileSchema.parse(body);
    const userId = (session.user as any).id;

    let xpubPlain: string;

    if (data.walletId) {
      // Use xpub from an existing wallet owned by this user
      const wallet = await prisma.wallet.findFirst({ where: { id: data.walletId, userId } });
      if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
      xpubPlain = decrypt(wallet.encryptedXpub);
      data.network = wallet.network as any;
    } else {
      xpubPlain = data.xpub!;
    }

    if (!validateXpub(xpubPlain, data.network)) {
      return NextResponse.json({ error: 'Invalid xpub for this network' }, { status: 400 });
    }

    const encryptedXpub = encrypt(xpubPlain);

    const profile = await prisma.recipientProfile.upsert({
      where: { userId },
      update: { xpub: encryptedXpub, network: data.network, label: data.label },
      create: { userId, xpub: encryptedXpub, network: data.network, label: data.label },
    });

    return NextResponse.json(profile);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
