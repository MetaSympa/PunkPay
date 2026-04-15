import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { broadcastTx } from '@/lib/bitcoin/signing';
import { z } from 'zod';
import * as bitcoin from 'bitcoinjs-lib';

const schema = z.object({ rawHex: z.string().min(10) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ txId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { txId } = await params;
  const userId = (session.user as any).id;

  const tx = await prisma.transaction.findFirst({
    where: { id: txId, wallet: { userId } },
    include: { wallet: { select: { network: true } } },
  });

  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  if (tx.status !== 'DRAFT') return NextResponse.json({ error: 'Transaction is not in DRAFT status' }, { status: 400 });

  try {
    const { rawHex } = schema.parse(await req.json());
    const txid = await broadcastTx(rawHex, tx.wallet.network);

    await prisma.transaction.update({
      where: { id: txId },
      data: { txid, status: 'BROADCAST', psbt: null, broadcastAt: new Date() },
    });

    // Parse the raw transaction to identify exactly which UTXOs were consumed
    const parsedTx = bitcoin.Transaction.fromHex(rawHex);
    const spentOutpoints = parsedTx.ins.map(inp => ({
      txid: Buffer.from(inp.hash).reverse().toString('hex'),
      vout: inp.index,
    }));

    // Mark only the UTXOs actually spent in this transaction
    for (const outpoint of spentOutpoints) {
      await prisma.utxo.updateMany({
        where: { walletId: tx.walletId, txid: outpoint.txid, vout: outpoint.vout },
        data: { status: 'SPENT', isLocked: false },
      });
    }

    return NextResponse.json({ txid });
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'rawHex is required' }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
