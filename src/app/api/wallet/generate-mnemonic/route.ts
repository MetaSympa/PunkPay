import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateMnemonic } from '@/lib/bitcoin/seed-wallet';
import { applyRateLimit } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, 'gen-mnemonic', { windowMs: 60_000, maxRequests: 5 });
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as any).role !== 'PAYER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mnemonic = generateMnemonic();

  // Security: Set no-cache headers — mnemonic must never be cached
  return NextResponse.json({ mnemonic }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
