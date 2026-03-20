import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Payer calls this to list all recipients who have set up a payment profile
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== 'PAYER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only payers can list recipients' }, { status: 403 });
  }

  const recipients = await prisma.recipientProfile.findMany({
    include: {
      user: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(recipients.map(r => ({
    id: r.id,
    userId: r.userId,
    email: r.user.email,
    // Never expose full xpub — only fingerprint for identification
    xpubFingerprint: r.xpub.slice(0, 8) + '...' + r.xpub.slice(-8),
    hasXpub: true,
    network: r.network,
    label: r.label || r.user.email,
  })));
}
