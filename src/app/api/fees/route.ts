import { NextResponse } from 'next/server';
import { fetchFeeEstimates } from '@/lib/bitcoin';

export async function GET() {
  try {
    const fees = await fetchFeeEstimates();
    return NextResponse.json(fees);
  } catch (error) {
    console.error('Fee estimation error:', error);
    return NextResponse.json({ error: 'Failed to fetch fee estimates' }, { status: 502 });
  }
}
