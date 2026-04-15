import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { deriveAddresses } from '@/lib/bitcoin/hd-wallet';

// Derive N addresses from the recipient's xpub and find matching transactions
const SCAN_DEPTH = 50;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;

  const profile = await prisma.recipientProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ transactions: [] });

  let addresses: string[] = [];
  try {
    const xpub = decrypt(profile.xpub);
    const derived = deriveAddresses(xpub, 0, 0, SCAN_DEPTH, profile.network);
    addresses = derived.map(d => d.address);
  } catch {
    return NextResponse.json({ error: 'Failed to derive addresses' }, { status: 500 });
  }

  // Transactions sent to any of the recipient's derived addresses
  const byAddress = await prisma.transaction.findMany({
    where: { recipientAddress: { in: addresses } },
    orderBy: { createdAt: 'desc' },
    include: { wallet: { select: { name: true } } },
  });

  // Expense-linked transactions where this user is the submitter
  const byExpense = await prisma.transaction.findMany({
    where: {
      expenseId: { not: null },
      expense: { submitterId: userId },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      wallet: { select: { name: true } },
      expense: { select: { description: true, amount: true } },
    },
  });

  // Merge, deduplicate by id, sort by date
  const seen = new Set<string>();
  const all = [...byAddress, ...byExpense]
    .filter(tx => { if (seen.has(tx.id)) return false; seen.add(tx.id); return true; })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    transactions: all.map(tx => ({
      id: tx.id,
      txid: tx.txid,
      type: tx.type,
      status: tx.status,
      amountSats: tx.amountSats.toString(),
      feeSats: tx.feeSats?.toString() ?? null,
      feeRate: tx.feeRate,
      recipientAddress: tx.recipientAddress,
      confirmations: tx.confirmations,
      broadcastAt: tx.broadcastAt,
      confirmedAt: tx.confirmedAt,
      createdAt: tx.createdAt,
      walletName: (tx as any).wallet?.name ?? null,
      expenseDescription: (tx as any).expense?.description ?? null,
    })),
  });
}
