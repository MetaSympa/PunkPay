import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

// Payer calls this to list all recipients who have set up a payment profile
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== 'PAYER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only payers can list recipients' }, { status: 403 });
  }

  // Fetch ALL users with RECIPIENT role, plus their profile if it exists
  const recipientUsers = await prisma.user.findMany({
    where: { role: 'RECIPIENT' },
    select: {
      id: true,
      email: true,
      recipientProfile: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(recipientUsers.map(u => {
    const profile = u.recipientProfile;

    if (!profile) {
      // Recipient exists but hasn't set up a payment profile yet
      return {
        id: u.id, // use the user id as fallback
        userId: u.id,
        email: u.email,
        xpub: null,
        xpubFingerprint: null,
        network: null,
        label: u.email,
        profileComplete: false,
      };
    }

    // Decrypt xpub — payers need it to derive payment addresses
    let xpub: string;
    try {
      xpub = decrypt(profile.xpub);
    } catch {
      // Fallback: xpub might be stored unencrypted from before the migration
      xpub = profile.xpub;
    }

    return {
      id: profile.id,
      userId: u.id,
      email: u.email,
      xpub, // Payers need the full xpub to derive fresh receive addresses
      xpubFingerprint: xpub.slice(0, 8) + '...' + xpub.slice(-8),
      network: profile.network,
      label: profile.label || u.email,
      profileComplete: true,
    };
  }));
}
