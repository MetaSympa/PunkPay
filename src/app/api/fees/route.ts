import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchFeeEstimates } from '@/lib/bitcoin';
import { cache, FEE_CACHE_TTL } from '@/skills/optimization/cache';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Use cache to avoid hammering mempool.space
    const cached = cache.get<any>('fee-estimates');
    if (cached) return NextResponse.json(cached);

    const fees = await fetchFeeEstimates();
    cache.set('fee-estimates', fees, FEE_CACHE_TTL);
    return NextResponse.json(fees);
  } catch (error) {
    console.error('Fee estimation error:', error);
    return NextResponse.json({ error: 'Failed to fetch fee estimates' }, { status: 502 });
  }
}
