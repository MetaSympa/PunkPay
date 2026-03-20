import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deriveAddress } from '@/lib/bitcoin/hd-wallet';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const xpub = searchParams.get('xpub');
  const network = searchParams.get('network') || 'mainnet';
  const index = parseInt(searchParams.get('index') || '0', 10);

  if (!xpub) return NextResponse.json({ error: 'xpub required' }, { status: 400 });

  try {
    const derived = deriveAddress(xpub, 0, index, network);
    return NextResponse.json({ address: derived.address, index });
  } catch {
    return NextResponse.json({ error: 'Invalid xpub' }, { status: 400 });
  }
}
