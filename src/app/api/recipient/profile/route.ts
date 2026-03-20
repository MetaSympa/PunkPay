import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateXpub } from '@/lib/bitcoin/hd-wallet';
import { encrypt, decrypt } from '@/lib/crypto';

const profileSchema = z.object({
  xpub: z.string().min(50, 'Invalid xpub'),
  network: z.enum(['mainnet', 'testnet', 'signet', 'regtest']).default('mainnet'),
  label: z.string().max(100).optional(),
});

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

    if (!validateXpub(data.xpub, data.network)) {
      return NextResponse.json({ error: 'Invalid xpub for this network' }, { status: 400 });
    }

    // Encrypt xpub at rest — same as wallet xpubs
    const encryptedXpub = encrypt(data.xpub);

    const profile = await prisma.recipientProfile.upsert({
      where: { userId: (session.user as any).id },
      update: { xpub: encryptedXpub, network: data.network, label: data.label },
      create: { userId: (session.user as any).id, xpub: encryptedXpub, network: data.network, label: data.label },
    });

    return NextResponse.json(profile);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
