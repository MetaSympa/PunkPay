import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { deriveAddress, type AddressType } from '@/lib/bitcoin/hd-wallet';
import { selectUtxos, calculateFee, buildPsbt, serializePsbt } from '@/lib/bitcoin';
import { signPsbt, broadcastTx } from '@/lib/bitcoin/signing';
import { z } from 'zod';
import { btcAddressRegex } from '@/lib/validation';

const sendSchema = z.object({
  toAddress: z.string().regex(btcAddressRegex, 'Invalid Bitcoin address'),
  amountSats: z.coerce.bigint().positive(),
  walletId: z.string().cuid(),
  feeRate: z.coerce.number().int().min(1).max(1000).default(5),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;

  try {
    const body = await req.json();
    const data = sendSchema.parse(body);

    const wallet = await prisma.wallet.findFirst({
      where: { id: data.walletId, userId },
      include: {
        utxos: {
          where: { status: 'CONFIRMED', isLocked: false },
          include: { address: { select: { chain: true, index: true } } },
        },
      },
    });

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    if (!wallet.hasSeed || !wallet.encryptedSeed) {
      return NextResponse.json({ error: 'Wallet has no seed — cannot sign transactions' }, { status: 400 });
    }
    if (wallet.utxos.length === 0) {
      return NextResponse.json({ error: 'No spendable UTXOs' }, { status: 400 });
    }

    const addrType = (wallet.addressType || 'P2TR') as AddressType;
    const decryptedXpub = decrypt(wallet.encryptedXpub);

    const utxoData = wallet.utxos.map(u => ({
      txid: u.txid,
      vout: u.vout,
      valueSats: u.valueSats,
      scriptPubKey: u.scriptPubKey,
      chain: u.address?.chain === 'INTERNAL' ? 1 : 0,
      index: u.address?.index ?? 0,
    }));

    const estimatedFee = calculateFee(1, 2, data.feeRate);
    const { selected, totalSats } = selectUtxos(utxoData, data.amountSats, estimatedFee);

    const actualFee = calculateFee(selected.length, 2, data.feeRate);
    const change = totalSats - data.amountSats - actualFee;

    const changeAddr = deriveAddress(decryptedXpub, 1, wallet.nextChangeIndex, wallet.network, addrType);

    const inputs = selected.map(s => {
      const d = utxoData.find(u => u.txid === s.txid && u.vout === s.vout)!;
      const base = { txid: s.txid, vout: s.vout, valueSats: s.valueSats, scriptPubKey: d.scriptPubKey };
      if (addrType === 'P2TR') {
        const derived = deriveAddress(decryptedXpub, d.chain as 0 | 1, d.index, wallet.network, addrType);
        return { ...base, tapInternalKey: Buffer.from(derived.pubkey).subarray(1, 33) };
      }
      return base;
    });

    const outputs = [
      { address: data.toAddress, valueSats: data.amountSats },
      ...(change > 546n ? [{ address: changeAddr.address, valueSats: change }] : []),
    ];

    const psbt = buildPsbt(inputs, outputs, wallet.network);
    const psbtBase64 = serializePsbt(psbt);

    const mnemonic = decrypt(wallet.encryptedSeed);
    const inputPaths = selected.map(s => {
      const d = utxoData.find(u => u.txid === s.txid && u.vout === s.vout)!;
      return { chain: d.chain, index: d.index };
    });

    const rawHex = await signPsbt(psbtBase64, mnemonic, inputPaths, addrType, wallet.network);
    const txid = await broadcastTx(rawHex, wallet.network);

    // Mark UTXOs spent
    const selectedIds = wallet.utxos
      .filter(u => selected.some(s => s.txid === u.txid && s.vout === u.vout))
      .map(u => u.id);
    await prisma.utxo.updateMany({
      where: { id: { in: selectedIds } },
      data: { status: 'SPENT', isLocked: false },
    });

    // Save change address
    if (change > 546n) {
      await prisma.address.upsert({
        where: { address: changeAddr.address },
        update: {},
        create: { walletId: wallet.id, address: changeAddr.address, index: wallet.nextChangeIndex, chain: 'INTERNAL' },
      });
      await prisma.wallet.update({ where: { id: wallet.id }, data: { nextChangeIndex: { increment: 1 } } });
    }

    // Record transaction
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        txid,
        type: 'SEND',
        status: 'BROADCAST',
        amountSats: data.amountSats,
        feeSats: actualFee,
        feeRate: data.feeRate,
        recipientAddress: data.toAddress,
        rbfEnabled: true,
        broadcastAt: new Date(),
      },
    });

    return NextResponse.json({ txid, amountSats: data.amountSats.toString(), feeSats: actualFee.toString() });
  } catch (err: any) {
    if (err.name === 'ZodError') return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 });
    if (err.message?.includes('Insufficient funds')) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[recipient/send]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
