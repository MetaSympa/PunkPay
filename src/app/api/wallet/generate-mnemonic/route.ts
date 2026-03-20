import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateMnemonic } from '@/lib/bitcoin/seed-wallet';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).role !== 'PAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mnemonic = generateMnemonic();
  return NextResponse.json({ mnemonic });
}
