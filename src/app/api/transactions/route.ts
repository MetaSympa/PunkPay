import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { applyRateLimit, PAYMENT_RATE_LIMIT } from '@/lib/api-utils';
import { sendPaymentSchema } from '@/lib/validation';
import { decrypt } from '@/lib/crypto';
import { deriveAddress, selectUtxos, calculateFee, buildPsbt, serializePsbt } from '@/lib/bitcoin';
import { createAuditLog } from '@/skills/security/audit-log';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const walletId = searchParams.get('walletId');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  const where: any = {};
  if (walletId) {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId: (session.user as any).id },
    });
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    where.walletId = walletId;
  } else {
    where.wallet = { userId: (session.user as any).id };
  }
  if (status) where.status = status;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { wallet: { select: { name: true } } },
    }),
    prisma.transaction.count({ where }),
  ]);

  return NextResponse.json({
    transactions: transactions.map(tx => ({
      ...tx,
      amountSats: tx.amountSats.toString(),
      feeSats: tx.feeSats?.toString(),
    })),
    total,
    limit,
    offset,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimited = await applyRateLimit(req, 'create-tx', PAYMENT_RATE_LIMIT, (session.user as any).id);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const data = sendPaymentSchema.parse(body);

    const wallet = await prisma.wallet.findFirst({
      where: { id: data.walletId, userId: (session.user as any).id },
    });

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

    // Pre-generate the transaction ID so it can be stamped on UTXO locks before
    // the transaction record is written — avoids a chicken-and-egg problem with FK constraints.
    const txId = randomUUID();

    // Atomically SELECT and lock UTXOs — prevents double-lock under concurrent requests.
    // FOR UPDATE SKIP LOCKED acquires row locks during the read; a concurrent tx that
    // already holds locks on the same rows will simply not see them, ensuring each
    // request gets a disjoint UTXO set.
    const { selected, totalSats, utxoData } = await prisma.$transaction(async (tx) => {
      const available = await tx.$queryRaw<Array<{
        id: string; txid: string; vout: number; valueSats: bigint; scriptPubKey: string;
      }>>`
        SELECT id, txid, vout, "valueSats", "scriptPubKey"
        FROM "utxos"
        WHERE "walletId" = ${wallet.id}
          AND status = 'CONFIRMED'::"UtxoStatus"
          AND "isLocked" = false
        FOR UPDATE SKIP LOCKED
      `;

      const fee = calculateFee(2, 2, data.feeRate);
      const { selected, totalSats } = selectUtxos(available, data.amountSats, fee);

      const selectedIds = available
        .filter(u => selected.some(s => s.txid === u.txid && s.vout === u.vout))
        .map(u => u.id);

      await tx.utxo.updateMany({
        where: { id: { in: selectedIds } },
        data: { isLocked: true, lockedUntil: new Date(Date.now() + 30 * 60 * 1000), lockedByTxId: txId },
      });

      return { selected, totalSats, utxoData: available };
    });

    // Derive change address
    const decryptedXpub = decrypt(wallet.encryptedXpub);
    const changeAddr = deriveAddress(decryptedXpub, 1, wallet.nextChangeIndex);

    const actualFee = calculateFee(selected.length, 2, data.feeRate);
    const change = totalSats - data.amountSats - actualFee;

    const inputs = selected.map(s => ({
      txid: s.txid,
      vout: s.vout,
      valueSats: s.valueSats,
      scriptPubKey: utxoData.find(u => u.txid === s.txid && u.vout === s.vout)!.scriptPubKey,
    }));

    const outputs = [
      { address: data.recipientAddress, valueSats: data.amountSats },
      ...(change > 546n ? [{ address: changeAddr.address, valueSats: change }] : []),
    ];

    const psbt = buildPsbt(inputs, outputs, wallet.network);

    const tx = await prisma.transaction.create({
      data: {
        id: txId,
        walletId: data.walletId,
        type: 'SEND',
        status: 'DRAFT',
        amountSats: data.amountSats,
        feeSats: actualFee,
        feeRate: data.feeRate,
        recipientAddress: data.recipientAddress,
        psbt: serializePsbt(psbt),
        rbfEnabled: true,
      },
    });

    // Save the change address so future syncs can discover the change UTXO
    if (change > 546n) {
      await prisma.address.upsert({
        where: { address: changeAddr.address },
        update: {},
        create: {
          walletId: data.walletId,
          address: changeAddr.address,
          index: wallet.nextChangeIndex,
          chain: 'INTERNAL',
        },
      });
    }

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { nextChangeIndex: { increment: 1 } },
    });

    await createAuditLog({
      userId: (session.user as any).id,
      action: 'TRANSACTION_CREATED',
      entity: 'Transaction',
      entityId: tx.id,
      metadata: { amountSats: data.amountSats.toString(), recipientAddress: data.recipientAddress },
    });

    return NextResponse.json({
      id: tx.id,
      psbt: serializePsbt(psbt),
      amountSats: data.amountSats.toString(),
      feeSats: actualFee.toString(),
      status: 'DRAFT',
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    if (error.message?.includes('Insufficient funds')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Transaction creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
