/**
 * Shared payment helper — used by the expense approve route.
 * Builds, signs, and broadcasts a P2TR payment from a hot wallet.
 */

import { prisma } from '../db';
import { buildPsbt, calculateFee, serializePsbt } from './transaction';
import { deriveAddress, type AddressType } from './hd-wallet';
import { selectUtxos, fetchFeeEstimates } from './utxo';
import { decrypt } from '../crypto/encryption';
import { signPsbt, broadcastTx } from './signing';

export interface PayResult {
  txid: string;
  feeSats: bigint;
  feeRate: number;
}

export async function buildAndBroadcastPayment({
  walletId,
  recipientAddress,
  amountSats,
  maxFeeRate = 50,
}: {
  walletId: string;
  recipientAddress: string;
  amountSats: bigint;
  maxFeeRate?: number;
}): Promise<PayResult> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    include: {
      utxos: {
        where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] }, isLocked: false },
        include: { address: { select: { chain: true, index: true } } },
      },
    },
  });

  if (!wallet.hasSeed || !wallet.encryptedSeed) {
    throw new Error('Wallet has no stored seed — cannot auto-sign');
  }
  if (wallet.utxos.length === 0) {
    throw new Error('No spendable UTXOs in wallet');
  }

  const addrType = (wallet.addressType || 'P2TR') as AddressType;
  const decryptedXpub = decrypt(wallet.encryptedXpub);

  const fees = await fetchFeeEstimates(wallet.network).catch(() => null);
  const feeRate = Math.min(fees?.halfHourFee ?? 10, maxFeeRate);

  const utxoData = wallet.utxos.map(u => ({
    txid: u.txid,
    vout: u.vout,
    valueSats: u.valueSats,
    scriptPubKey: u.scriptPubKey,
    chain: (u as any).address.chain === 'INTERNAL' ? 1 : 0,
    index: (u as any).address.index,
  }));

  const estimatedFee = calculateFee(1, 2, feeRate);
  const { selected } = selectUtxos(utxoData, amountSats, estimatedFee);

  const selectedIds = wallet.utxos
    .filter(u => selected.some(s => s.txid === u.txid && s.vout === u.vout))
    .map(u => u.id);

  // Lock UTXOs for the duration of build+broadcast
  await prisma.utxo.updateMany({
    where: { id: { in: selectedIds } },
    data: { isLocked: true, lockedUntil: new Date(Date.now() + 30 * 60 * 1000) },
  });

  try {
    const changeAddr = deriveAddress(decryptedXpub, 1, wallet.nextChangeIndex, wallet.network, addrType);
    const actualFee = calculateFee(selected.length, 2, feeRate);
    const totalInput = selected.reduce((sum, u) => sum + u.valueSats, 0n);
    const change = totalInput - amountSats - actualFee;

    const inputs = selected.map(u => {
      const d = utxoData.find(d => d.txid === u.txid && d.vout === u.vout)!;
      const base = { txid: u.txid, vout: u.vout, valueSats: u.valueSats, scriptPubKey: d.scriptPubKey };
      if (addrType === 'P2TR') {
        const derived = deriveAddress(decryptedXpub, d.chain as 0 | 1, d.index, wallet.network, addrType);
        return { ...base, tapInternalKey: Buffer.from(derived.pubkey).subarray(1, 33) };
      }
      return base;
    });

    const outputs = [
      { address: recipientAddress, valueSats: amountSats },
      ...(change > 546n ? [{ address: changeAddr.address, valueSats: change }] : []),
    ];

    const psbt = buildPsbt(inputs, outputs, wallet.network);
    const psbtBase64 = serializePsbt(psbt);

    const mnemonic = decrypt(wallet.encryptedSeed!);
    const inputPaths = selected.map(s => {
      const d = utxoData.find(u => u.txid === s.txid && u.vout === s.vout)!;
      return { chain: d.chain, index: d.index };
    });
    const rawHex = await signPsbt(psbtBase64, mnemonic, inputPaths, addrType, wallet.network);
    const txid = await broadcastTx(rawHex, wallet.network);

    // Commit state on success
    await prisma.utxo.updateMany({
      where: { id: { in: selectedIds } },
      data: { status: 'SPENT', isLocked: false },
    });

    if (change > 546n) {
      await prisma.address.upsert({
        where: { address: changeAddr.address },
        update: {},
        create: { walletId, address: changeAddr.address, index: wallet.nextChangeIndex, chain: 'INTERNAL' },
      });
      await prisma.wallet.update({
        where: { id: walletId },
        data: { nextChangeIndex: { increment: 1 } },
      });
    }

    return { txid, feeSats: actualFee, feeRate };
  } catch (err) {
    // Unlock on failure so UTXOs can be retried
    await prisma.utxo.updateMany({
      where: { id: { in: selectedIds } },
      data: { isLocked: false, lockedUntil: null },
    });
    throw err;
  }
}
