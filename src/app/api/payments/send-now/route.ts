import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { deriveAddress, type AddressType } from '@/lib/bitcoin/hd-wallet';
import { fetchFeeEstimates, selectUtxos } from '@/lib/bitcoin/utxo';
import { buildPsbt, calculateFee, serializePsbt } from '@/lib/bitcoin/transaction';
import { signPsbt, broadcastTx } from '@/lib/bitcoin/signing';
import { createAuditLog } from '@/skills/security/audit-log';
import { applyRateLimit, PAYMENT_RATE_LIMIT } from '@/lib/api-utils';
import { z } from 'zod';

const sendNowSchema = z.object({
  walletId: z.string().cuid(),
  recipientXpub: z.string().min(50).optional(),
  recipientAddress: z.string().min(10).optional(),
  recipientName: z.string().max(100).optional(),
  amountSats: z.coerce.bigint().positive(),
  maxFeeRate: z.number().positive().default(50),
}).refine(d => d.recipientAddress || d.recipientXpub, {
  message: 'Either recipientAddress or recipientXpub is required',
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['PAYER', 'RECIPIENT', 'ADMIN'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = (session.user as any).id;

  const rateLimited = await applyRateLimit(req, 'send-now', PAYMENT_RATE_LIMIT, userId);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const data = sendNowSchema.parse(body);
    const amount = data.amountSats;

    // Release any expired locks first
    await prisma.utxo.updateMany({
      where: { walletId: data.walletId, isLocked: true, lockedUntil: { lt: new Date() } },
      data: { isLocked: false, lockedUntil: null, lockedByTxId: null },
    });

    // Pre-generate the transaction ID so it can be stamped on UTXO locks before
    // the transaction record is written — avoids a chicken-and-egg problem with FK constraints.
    const txId = randomUUID();

    // Load wallet with UTXOs + their address info (needed for signing key derivation)
    const wallet = await prisma.wallet.findFirst({
      where: { id: data.walletId, userId },
      include: {
        utxos: {
          where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] }, isLocked: false },
          include: { address: { select: { chain: true, index: true } } },
        },
      },
    });

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

    const network = wallet.network;
    const addrType = (wallet.addressType || 'P2TR') as AddressType;

    // Resolve recipient address
    let recipientAddress: string;
    if (data.recipientXpub) {
      const derived = deriveAddress(data.recipientXpub, 0, 0, network, 'P2TR');
      recipientAddress = derived.address;
    } else {
      recipientAddress = data.recipientAddress!;
    }

    if (wallet.utxos.length === 0) {
      return NextResponse.json({ error: 'No spendable UTXOs available — sync the wallet first' }, { status: 400 });
    }

    // Fee estimation
    const fees = await fetchFeeEstimates(network);
    const feeRate = Math.min(fees.halfHourFee, data.maxFeeRate);
    const estimatedFee = calculateFee(2, 2, feeRate);

    const utxoData = wallet.utxos.map(u => ({
      txid: u.txid,
      vout: u.vout,
      valueSats: u.valueSats,
      scriptPubKey: u.scriptPubKey,
      chain: u.address.chain === 'INTERNAL' ? 1 : 0,
      index: u.address.index,
    }));

    const { selected } = selectUtxos(utxoData, amount, estimatedFee);

    // Lock selected UTXOs
    const selectedIds = wallet.utxos
      .filter(u => selected.some(s => s.txid === u.txid && s.vout === u.vout))
      .map(u => u.id);

    await prisma.utxo.updateMany({
      where: { id: { in: selectedIds } },
      data: { isLocked: true, lockedUntil: new Date(Date.now() + 30 * 60 * 1000), lockedByTxId: txId },
    });

    // Change address
    const decryptedXpub = decrypt(wallet.encryptedXpub);
    const changeAddr = deriveAddress(decryptedXpub, 1, wallet.nextChangeIndex, network, addrType);
    const actualFee = calculateFee(selected.length, 2, feeRate);
    const totalInput = selected.reduce((sum, u) => sum + u.valueSats, 0n);
    const change = totalInput - amount - actualFee;

    const inputs = selected.map(u => {
      const d = utxoData.find(d => d.txid === u.txid && d.vout === u.vout)!;
      const base = { txid: u.txid, vout: u.vout, valueSats: u.valueSats, scriptPubKey: d.scriptPubKey };
      if (addrType === 'P2TR') {
        const derived = deriveAddress(decryptedXpub, d.chain as 0 | 1, d.index, network, addrType);
        return { ...base, tapInternalKey: Buffer.from(derived.pubkey).subarray(1, 33) };
      }
      return base;
    });

    const outputs = [
      { address: recipientAddress, valueSats: amount },
      ...(change > 546n ? [{ address: changeAddr.address, valueSats: change }] : []),
    ];

    const psbt = buildPsbt(inputs, outputs, wallet.network);
    const psbtBase64 = serializePsbt(psbt);

    // Auto-sign and broadcast if this is a hot wallet (seed stored)
    let txStatus: 'DRAFT' | 'BROADCAST' = 'DRAFT';
    let broadcastedTxid: string | undefined;

    if (wallet.hasSeed && wallet.encryptedSeed) {
      const mnemonic = decrypt(wallet.encryptedSeed);
      const inputPaths = selected.map(s => {
        const d = utxoData.find(u => u.txid === s.txid && u.vout === s.vout)!;
        return { chain: d.chain, index: d.index };
      });
      const rawHex = await signPsbt(psbtBase64, mnemonic, inputPaths, addrType, network);
      broadcastedTxid = await broadcastTx(rawHex, network);
      txStatus = 'BROADCAST';

      // Mark UTXOs as spent
      await prisma.utxo.updateMany({
        where: { id: { in: selectedIds } },
        data: { status: 'SPENT' },
      });
    }

    const tx = await prisma.transaction.create({
      data: {
        id: txId,
        walletId: wallet.id,
        txid: broadcastedTxid ?? null,
        type: 'SEND',
        status: txStatus,
        amountSats: amount,
        feeSats: actualFee,
        feeRate,
        recipientAddress,
        psbt: txStatus === 'DRAFT' ? psbtBase64 : null,
        rawHex: broadcastedTxid ? undefined : undefined,
        rbfEnabled: true,
        broadcastAt: txStatus === 'BROADCAST' ? new Date() : undefined,
      },
    });

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { nextChangeIndex: { increment: 1 } },
    });

    await createAuditLog({
      userId,
      action: txStatus === 'BROADCAST' ? 'IMMEDIATE_TRANSFER_BROADCAST' : 'IMMEDIATE_TRANSFER_CREATED',
      entity: 'Transaction',
      entityId: tx.id,
      metadata: { amountSats: amount.toString(), recipientAddress, feeRate, txid: broadcastedTxid },
    });

    return NextResponse.json({
      id: tx.id,
      status: tx.status,
      txid: broadcastedTxid,
      amountSats: tx.amountSats.toString(),
      feeSats: tx.feeSats?.toString(),
      feeRate: tx.feeRate,
      recipientAddress,
      psbt: txStatus === 'DRAFT' ? psbtBase64 : undefined,
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    console.error('Send-now error:', error);
    // Never expose internal error details to the client
    const safeMessage = error.message?.includes('Insufficient funds')
      ? error.message
      : 'Internal server error';
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}
