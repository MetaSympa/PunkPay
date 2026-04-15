import { Job, UnrecoverableError } from 'bullmq';
import { paymentQueue } from '../scheduler/queues';
import { prisma } from '../db';
import { fetchUtxos, fetchTransactionStatus, broadcastTransaction, selectUtxos, fetchFeeEstimates } from '../bitcoin/utxo';
import { getMempoolApiUrl } from '../bitcoin/networks';
import { buildPsbt, calculateFee, extractRawTx, serializePsbt } from '../bitcoin/transaction';
import { deriveAddress, type AddressType } from '../bitcoin/hd-wallet';
import { syncWalletUtxos } from '../bitcoin/sync';
import { decrypt } from '../crypto/encryption';
import { signPsbt, broadcastTx } from '../bitcoin/signing';
import { sendSignalMessage } from '../signal/client';

export interface PaymentJobData {
  scheduleId: string;
  walletId: string;
  recipientAddress?: string;
  recipientXpub?: string;
  amountSats: string; // BigInt serialized as string
  maxFeeRate: number;
}

export interface UtxoSyncJobData {
  walletId: string;
}

export interface TxMonitorJobData {
  transactionId: string;
  txid: string;
}

export interface NotificationJobData {
  recipientNumber: string;
  message: string;
}

async function stopScheduleWithError(scheduleId: string, errorMsg: string) {
  await prisma.paymentSchedule.update({
    where: { id: scheduleId },
    data: { isActive: false, lastError: errorMsg },
  }).catch(() => {}); // ignore if schedule was already deleted
  await paymentQueue.removeJobScheduler(`sched:${scheduleId}`).catch(() => {});
  console.error(`[scheduler] Schedule ${scheduleId} stopped: ${errorMsg}`);
}

// Extract txid from a mempool RBF rejection error message, e.g.:
// "insufficient fee, rejecting replacement <txid>; new feerate ..."
function extractRbfTxid(msg: string): string | null {
  const m = msg.match(/rejecting replacement ([0-9a-f]{64})/i);
  return m ? m[1] : null;
}

/**
 * Execute a scheduled payment
 */
export async function handlePayment(job: Job<PaymentJobData>): Promise<void> {
  const { scheduleId, walletId, amountSats, maxFeeRate } = job.data;
  const amount = BigInt(amountSats);
  try {

  // Skip this run if a broadcast-pending tx already exists for the schedule.
  // This prevents double-spend retries that would trigger RBF rejection.
  const pendingBroadcast = await prisma.transaction.findFirst({
    where: { scheduleId, status: 'BROADCAST' },
    orderBy: { createdAt: 'desc' },
  });
  if (pendingBroadcast) {
    job.log(`[scheduler] Skipping: pending tx ${pendingBroadcast.txid} already in mempool for schedule ${scheduleId}`);
    return;
  }

  // Release expired UTXO locks
  await prisma.utxo.updateMany({
    where: { walletId, isLocked: true, lockedUntil: { lt: new Date() } },
    data: { isLocked: false, lockedUntil: null },
  });

  // Get wallet first so we have network for all bitcoin calls
  let wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    include: {
      utxos: {
        where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] }, isLocked: false },
        include: { address: { select: { chain: true, index: true } } },
      },
    },
  });

  // If no UTXOs in DB, try a fresh sync before failing — DB may be stale
  if (wallet.utxos.length === 0) {
    await syncWalletUtxos(walletId, wallet.network);
    wallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
      include: {
        utxos: {
          where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] }, isLocked: false },
          include: { address: { select: { chain: true, index: true } } },
        },
      },
    });
  }

  // Resolve recipient address: derive fresh Taproot address from xpub, or use static address
  let recipientAddress: string;
  if (job.data.recipientXpub) {
    const schedule = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    const derived = deriveAddress(job.data.recipientXpub, 0, schedule.recipientXpubIndex, wallet.network);
    recipientAddress = derived.address;
    // Increment index so next payment uses a fresh address
    await prisma.paymentSchedule.update({
      where: { id: scheduleId },
      data: { recipientXpubIndex: { increment: 1 } },
    });
    job.log(`Derived recipient address index ${schedule.recipientXpubIndex}: ${recipientAddress}`);
  } else if (job.data.recipientAddress) {
    recipientAddress = job.data.recipientAddress;
  } else {
    throw new Error('Schedule has no recipientAddress or recipientXpub');
  }

  if (wallet.utxos.length === 0) {
    throw new Error('No spendable UTXOs — wallet needs funding');
  }

  // Fetch current fee estimates — fall back to a conservative rate if API is unreachable
  const fees = await fetchFeeEstimates(wallet.network).catch(() => null);
  const feeRate = Math.min(fees?.halfHourFee ?? 10, maxFeeRate);

  const addrType = (wallet.addressType || 'P2TR') as AddressType;

  // Select UTXOs
  const utxoData = wallet.utxos.map(u => ({
    txid: u.txid,
    vout: u.vout,
    valueSats: u.valueSats,
    scriptPubKey: u.scriptPubKey,
    chain: (u as any).address.chain === 'INTERNAL' ? 1 : 0,
    index: (u as any).address.index,
  }));

  // First pass: estimate fee with 1 input (optimistic) so UTXO selection can succeed,
  // then recalculate with actual selected count below.
  const estimatedFee = calculateFee(1, 2, feeRate);
  const { selected } = selectUtxos(utxoData, amount, estimatedFee);

  // Lock selected UTXOs
  await prisma.utxo.updateMany({
    where: { id: { in: wallet.utxos.filter(u => selected.some(s => s.txid === u.txid && s.vout === u.vout)).map(u => u.id) } },
    data: { isLocked: true, lockedUntil: new Date(Date.now() + 30 * 60 * 1000) },
  });

  // Derive change address
  const decryptedXpub = decrypt(wallet.encryptedXpub);
  const changeAddr = deriveAddress(decryptedXpub, 1, wallet.nextChangeIndex, wallet.network, addrType);

  // Calculate actual fee
  const actualFee = calculateFee(selected.length, 2, feeRate);
  const totalInput = selected.reduce((sum, u) => sum + u.valueSats, 0n);
  const change = totalInput - amount - actualFee;

  // Build PSBT
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
    { address: recipientAddress, valueSats: amount },
    ...(change > 546n ? [{ address: changeAddr.address, valueSats: change }] : []),
  ];

  const psbt = buildPsbt(inputs, outputs, wallet.network);
  const psbtBase64 = serializePsbt(psbt);

  // Auto-sign and broadcast if wallet has seed stored
  let txStatus: 'DRAFT' | 'BROADCAST' = 'DRAFT';
  let broadcastedTxid: string | undefined;

  if (wallet.hasSeed && wallet.encryptedSeed) {
    const mnemonic = decrypt(wallet.encryptedSeed);
    const inputPaths = selected.map(s => {
      const d = utxoData.find(u => u.txid === s.txid && u.vout === s.vout)!;
      return { chain: d.chain, index: d.index };
    });
    const rawHex = await signPsbt(psbtBase64, mnemonic, inputPaths, addrType, wallet.network);

    try {
      broadcastedTxid = await broadcastTx(rawHex, wallet.network);
      txStatus = 'BROADCAST';
    } catch (broadcastErr: any) {
      const errMsg: string = broadcastErr.message ?? String(broadcastErr);
      const rbfTxid = extractRbfTxid(errMsg);
      if (rbfTxid) {
        // TX already in mempool (retry hit an existing unconfirmed tx with same inputs).
        // Treat the original broadcast as the canonical one — record it and move on.
        job.log(`[scheduler] RBF rejection: tx ${rbfTxid} already in mempool. Adopting it.`);
        broadcastedTxid = rbfTxid;
        txStatus = 'BROADCAST';
      } else {
        throw broadcastErr;
      }
    }

    // Mark UTXOs as spent
    const selectedIds = wallet.utxos
      .filter(u => selected.some(s => s.txid === u.txid && s.vout === u.vout))
      .map(u => u.id);
    await prisma.utxo.updateMany({
      where: { id: { in: selectedIds } },
      data: { status: 'SPENT', isLocked: false },
    });
  }

  // Create transaction record
  await prisma.transaction.create({
    data: {
      walletId,
      txid: broadcastedTxid ?? null,
      type: 'SCHEDULED',
      status: txStatus,
      amountSats: amount,
      feeSats: actualFee,
      feeRate,
      recipientAddress,
      psbt: txStatus === 'DRAFT' ? psbtBase64 : null,
      rbfEnabled: true,
      scheduleId,
      broadcastAt: txStatus === 'BROADCAST' ? new Date() : undefined,
    },
  });

  // Save the change address so future syncs can discover the change UTXO
  if (change > 546n) {
    await prisma.address.upsert({
      where: { address: changeAddr.address },
      update: {},
      create: {
        walletId,
        address: changeAddr.address,
        index: wallet.nextChangeIndex,
        chain: 'INTERNAL',
      },
    });
  }

  // Update wallet change index
  await prisma.wallet.update({
    where: { id: walletId },
    data: { nextChangeIndex: { increment: 1 } },
  });

  // Update schedule timing — compute interval so each schedule keeps its own independent cadence
  const { parseExpression } = await import('cron-parser');
  const sched = await prisma.paymentSchedule.findUnique({ where: { id: scheduleId } });
  if (sched) {
    let nextRunAt: Date | null = null;
    try {
      const expr = parseExpression(sched.cronExpression, { tz: sched.timezone });
      const first = expr.next().toDate();
      const second = expr.next().toDate();
      const intervalMs = second.getTime() - first.getTime();
      nextRunAt = new Date(Date.now() + intervalMs);
    } catch {}
    await prisma.paymentSchedule.update({
      where: { id: scheduleId },
      data: { lastRunAt: new Date(), ...(nextRunAt && { nextRunAt }) },
    });
  }

  job.log(`Scheduled payment ${txStatus} — ${amount} sats to ${recipientAddress}${broadcastedTxid ? ` txid: ${broadcastedTxid}` : ''}`);
  } catch (err: any) {
    const msg: string = err.message ?? String(err);
    // Transient errors (network timeouts, API failures, insufficient funds) should
    // let BullMQ retry the job — don't permanently deactivate the schedule.
    const isTransient =
      err.name === 'AbortError' ||
      msg.includes('timeout') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('fetch failed') ||
      msg.includes('No spendable UTXOs') ||
      msg.includes('Insufficient funds');  // wallet may receive more funds later
    if (isTransient) {
      // Rethrow as a plain Error so BullMQ retries per the queue's backoff config
      throw new Error(msg);
    }
    // Permanent failures (bad config, decryption error, missing recipient) stop the schedule
    await stopScheduleWithError(scheduleId, msg);
    throw new UnrecoverableError(msg);
  }
}

/**
 * Sync UTXOs for a wallet — uses smart gap-limit scan
 */
export async function handleUtxoSync(job: Job<UtxoSyncJobData>): Promise<void> {
  const { walletId } = job.data;

  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
  });

  const result = await syncWalletUtxos(walletId, wallet.network);
  job.log(`UTXO sync complete — checked ${result.addressesChecked} addresses, ${result.newUtxos} new UTXOs, ${result.spentUtxos} spent, balance: ${result.totalSats} sats (${result.elapsed}ms)`);
}

/**
 * Monitor transaction confirmations
 */
export async function handleTxMonitor(job: Job<TxMonitorJobData>): Promise<void> {
  const { transactionId, txid } = job.data;

  const status = await fetchTransactionStatus(txid);

  if (status.confirmed) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'CONFIRMED',
        confirmations: 1,
        blockHeight: status.block_height,
        confirmedAt: new Date(),
      },
    });

    // Mark spent UTXOs
    // This would need more logic to identify which UTXOs were spent

    job.log(`Transaction ${txid} confirmed at block ${status.block_height}`);
  } else {
    // Re-check later
    throw new Error('Transaction not yet confirmed');
  }
}

/**
 * Send Signal notification
 */
export async function handleNotification(job: Job<NotificationJobData>): Promise<void> {
  const { recipientNumber, message } = job.data;
  await sendSignalMessage(recipientNumber, message);
  job.log(`Notification sent to ${recipientNumber}`);
}
