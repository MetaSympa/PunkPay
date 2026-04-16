/**
 * Shared payment helper — used by the expense approve route.
 * Builds, signs, and broadcasts a P2TR payment from a hot wallet.
 */

import * as bitcoin from 'bitcoinjs-lib';
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
  // Fetch wallet metadata only — UTXOs are selected atomically below
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
  });

  if (!wallet.hasSeed || !wallet.encryptedSeed) {
    throw new Error('Wallet has no stored seed — cannot auto-sign');
  }

  const addrType = (wallet.addressType || 'P2TR') as AddressType;
  const decryptedXpub = decrypt(wallet.encryptedXpub);

  const fees = await fetchFeeEstimates(wallet.network).catch(() => null);
  const feeRate = Math.min(fees?.halfHourFee ?? 10, maxFeeRate);

  // Atomically SELECT and lock UTXOs — prevents double-lock under concurrent requests.
  // FOR UPDATE SKIP LOCKED acquires row locks during the read; a concurrent transaction
  // that already holds locks on the same rows will simply not see them, ensuring each
  // caller gets a disjoint UTXO set.
  const { selected, selectedIds, utxoData } = await prisma.$transaction(async (tx) => {
    const available = await tx.$queryRaw<Array<{
      id: string; txid: string; vout: number; valueSats: bigint;
      scriptPubKey: string; chain: string; index: number;
    }>>`
      SELECT u.id, u.txid, u.vout, u."valueSats", u."scriptPubKey", a.chain::text, a.index
      FROM "utxos" u
      JOIN "addresses" a ON u."addressId" = a.id
      WHERE u."walletId" = ${walletId}
        AND u.status IN ('CONFIRMED'::"UtxoStatus", 'UNCONFIRMED'::"UtxoStatus")
        AND u."isLocked" = false
      FOR UPDATE SKIP LOCKED
    `;

    if (available.length === 0) {
      throw new Error('No spendable UTXOs in wallet');
    }

    const estimatedFee = calculateFee(1, 2, feeRate);
    const { selected } = selectUtxos(
      available.map(u => ({
        txid: u.txid,
        vout: u.vout,
        valueSats: u.valueSats,
        scriptPubKey: u.scriptPubKey,
      })),
      amountSats,
      estimatedFee,
    );

    const selectedIds = available
      .filter(u => selected.some(s => s.txid === u.txid && s.vout === u.vout))
      .map(u => u.id);

    await tx.utxo.updateMany({
      where: { id: { in: selectedIds } },
      data: { isLocked: true, lockedUntil: new Date(Date.now() + 30 * 60 * 1000) },
    });

    return {
      selected,
      selectedIds,
      utxoData: available.map(u => ({
        txid: u.txid,
        vout: u.vout,
        valueSats: u.valueSats,
        scriptPubKey: u.scriptPubKey,
        chain: u.chain === 'INTERNAL' ? 1 : 0,
        index: u.index,
      })),
    };
  });

  try {
    // Atomically claim the next change index — PostgreSQL serializes concurrent UPDATEs
    // on the same row, so two payments racing here each get a distinct index and derive
    // a distinct change address. Any gap left by a failed payment is harmless.
    const [{ change_index }] = await prisma.$queryRaw<[{ change_index: number }]>`
      UPDATE "wallets"
      SET "nextChangeIndex" = "nextChangeIndex" + 1
      WHERE id = ${walletId}
      RETURNING "nextChangeIndex" - 1 AS change_index
    `;
    const changeAddr = deriveAddress(decryptedXpub, 1, change_index, wallet.network, addrType);
    let actualFee = calculateFee(selected.length, 2, feeRate);
    const totalInput = selected.reduce((sum, u) => sum + u.valueSats, 0n);
    let change = totalInput - amountSats - actualFee;

    const inputs = selected.map(u => {
      const d = utxoData.find(d => d.txid === u.txid && d.vout === u.vout)!;
      const base = { txid: u.txid, vout: u.vout, valueSats: u.valueSats, scriptPubKey: d.scriptPubKey };
      if (addrType === 'P2TR') {
        const derived = deriveAddress(decryptedXpub, d.chain as 0 | 1, d.index, wallet.network, addrType);
        return { ...base, tapInternalKey: Buffer.from(derived.pubkey).subarray(1, 33) };
      }
      return base;
    });

    let outputs = [
      { address: recipientAddress, valueSats: amountSats },
      ...(change > 330n ? [{ address: changeAddr.address, valueSats: change }] : []),
    ];

    const inputPaths = selected.map(s => {
      const d = utxoData.find(u => u.txid === s.txid && u.vout === s.vout)!;
      return { chain: d.chain, index: d.index };
    });

    // Scope the mnemonic to the narrowest possible block — it goes out of reference
    // at the closing brace, before broadcastTx and all DB writes. JS strings are
    // immutable so we cannot zero the underlying bytes, but dropping the only
    // reference makes it GC-eligible before any async I/O that could extend lifetime.
    let rawHex: string;
    {
      const mnemonic = decrypt(wallet.encryptedSeed!);
      rawHex = await signPsbt(serializePsbt(buildPsbt(inputs, outputs, wallet.network)), mnemonic, inputPaths, addrType, wallet.network);

      // Verify fee against actual vsize — estimate can be off by 1-2 vbytes.
      // If underpaying, rebuild with the exact fee and resign (one pass is enough).
      const realFee = BigInt(Math.ceil(bitcoin.Transaction.fromHex(rawHex).virtualSize() * feeRate));
      if (realFee > actualFee) {
        actualFee = realFee;
        change = totalInput - amountSats - actualFee;
        outputs = [
          { address: recipientAddress, valueSats: amountSats },
          ...(change > 330n ? [{ address: changeAddr.address, valueSats: change }] : []),
        ];
        rawHex = await signPsbt(serializePsbt(buildPsbt(inputs, outputs, wallet.network)), mnemonic, inputPaths, addrType, wallet.network);
      }
    } // mnemonic reference dropped here — before network broadcast and DB work

    const txid = await broadcastTx(rawHex, wallet.network);

    // Commit state on success
    await prisma.utxo.updateMany({
      where: { id: { in: selectedIds } },
      data: { status: 'SPENT', isLocked: false },
    });

    if (change > 330n) { // change may have been revised by fee adjustment above
      await prisma.address.upsert({
        where: { address: changeAddr.address },
        update: {},
        create: { walletId, address: changeAddr.address, index: change_index, chain: 'INTERNAL' },
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
