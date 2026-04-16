import 'dotenv/config';
import { Worker } from 'bullmq';
import { prisma } from '../lib/db';
import { paymentQueue, utxoSyncQueue } from '../lib/scheduler/queues';
import { handlePayment, handleUtxoSync, handleTxMonitor, handleNotification, cronToIntervalMs } from '../lib/scheduler/handlers';
import { MempoolWsManager } from '../lib/bitcoin/mempool-ws';
import type { PaymentJobData } from '../lib/scheduler/handlers';

function parseRedisConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port || '6379'),
        password: parsed.password || undefined,
        maxRetriesPerRequest: null as null,
      };
    } catch {
      // Fall through to defaults
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null as null,
  };
}

const connection = parseRedisConnection();

console.log('Starting PunkPay workers...');

const paymentWorker = new Worker('payment', handlePayment, {
  connection,
  concurrency: 1,
  limiter: { max: 10, duration: 60000 },
});

const utxoSyncWorker = new Worker('utxo-sync', handleUtxoSync, {
  connection,
  concurrency: 3,
});

const txMonitorWorker = new Worker('tx-monitor', handleTxMonitor, {
  connection,
  concurrency: 5,
});

const notificationWorker = new Worker('notification', handleNotification, {
  connection,
  concurrency: 5,
});

const workers = [
  { name: 'payment', worker: paymentWorker },
  { name: 'utxo-sync', worker: utxoSyncWorker },
  { name: 'tx-monitor', worker: txMonitorWorker },
  { name: 'notification', worker: notificationWorker },
];

for (const { name, worker } of workers) {
  worker.on('completed', (job) => {
    console.log(`[${name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[${name}] Job ${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    console.error(`[${name}] Worker error:`, err.message);
  });
}

// ─── Schedule Sync ────────────────────────────────────────────────────────────

async function syncSchedules() {
  try {
    const activeSchedules = await prisma.paymentSchedule.findMany({
      where: { isActive: true },
    });

    const activeKeys = new Set(activeSchedules.map(s => `sched:${s.id}`));

    for (const schedule of activeSchedules) {
      const jobData: PaymentJobData = {
        scheduleId: schedule.id,
        walletId: schedule.walletId,
        recipientAddress: schedule.recipientAddress ?? undefined,
        recipientXpub: schedule.recipientXpub ?? undefined,
        amountSats: schedule.amountSats.toString(),
        maxFeeRate: schedule.maxFeeRate,
      };

      // Use `every + startDate` for simple interval crons so each schedule gets
      // its own independent phase anchored to creation time, rather than all
      // firing on the same wall-clock boundaries (e.g. :00, :10, :20...).
      const intervalMs = cronToIntervalMs(schedule.cronExpression);
      const repeat = intervalMs
        ? { every: intervalMs, startDate: schedule.createdAt }
        : { pattern: schedule.cronExpression };

      await paymentQueue.upsertJobScheduler(
        `sched:${schedule.id}`,
        repeat,
        { name: 'payment', data: jobData },
      );
    }

    // Remove schedulers for deleted/paused schedules
    const existing = await paymentQueue.getJobSchedulers();
    for (const s of existing) {
      if (!activeKeys.has(s.key)) {
        await paymentQueue.removeJobScheduler(s.key);
        console.log(`[scheduler] Removed: ${s.key}`);
      }
    }

    console.log(`[scheduler] ${activeSchedules.length} active schedule(s) synced`);
  } catch (err: any) {
    console.error('[scheduler] Sync error:', err.message);
  }
}

// ─── Mempool WebSocket — real-time UTXO sync ──────────────────────────────────

// One WsManager per Bitcoin network (most installs only use mainnet)
const wsManagers = new Map<string, MempoolWsManager>();

// Track when we last enqueued a sync per wallet to avoid hammering
const lastSyncEnqueued = new Map<string, number>();
const MIN_ENQUEUE_GAP_MS = 15_000; // don't enqueue more than once per 15s per wallet

async function onWalletActivity(walletId: string, _addresses: string[]) {
  const now = Date.now();
  const last = lastSyncEnqueued.get(walletId) ?? 0;
  if (now - last < MIN_ENQUEUE_GAP_MS) return;
  lastSyncEnqueued.set(walletId, now);

  try {
    // Use a fixed jobId so BullMQ silently drops duplicates still in the queue
    await utxoSyncQueue.add(
      'ws-triggered',
      { walletId },
      { jobId: `ws-sync-${walletId}`, priority: 1 },
    );
    console.log(`[mempool-ws] Enqueued sync for wallet ${walletId}`);
  } catch (err: any) {
    console.error(`[mempool-ws] Failed to enqueue sync for ${walletId}:`, err.message);
  }
}

function getOrCreateManager(network: string): MempoolWsManager {
  if (!wsManagers.has(network)) {
    const mgr = new MempoolWsManager(network, onWalletActivity);
    wsManagers.set(network, mgr);
    mgr.start();
  }
  return wsManagers.get(network)!;
}

/**
 * Load all wallets from DB, group by network, and subscribe their addresses
 * to the appropriate WebSocket manager.  Called on startup and every 5 minutes
 * to pick up newly derived addresses.
 */
async function refreshWsSubscriptions() {
  try {
    const wallets = await prisma.wallet.findMany({
      select: {
        id: true,
        network: true,
        addresses: { select: { address: true } },
      },
    });

    // Group by network
    const byNetwork = new Map<string, { walletId: string; addresses: string[] }[]>();
    for (const w of wallets) {
      const net = w.network || 'mainnet';
      if (!byNetwork.has(net)) byNetwork.set(net, []);
      byNetwork.get(net)!.push({
        walletId: w.id,
        addresses: w.addresses.map(a => a.address),
      });
    }

    for (const [network, entries] of byNetwork) {
      const mgr = getOrCreateManager(network);
      for (const { walletId, addresses } of entries) {
        if (addresses.length > 0) mgr.subscribeWallet(walletId, addresses);
      }
    }

    const total = wallets.reduce((s, w) => s + w.addresses.length, 0);
    console.log(`[mempool-ws] Refreshed subscriptions: ${wallets.length} wallets, ${total} addresses`);
  } catch (err: any) {
    console.error('[mempool-ws] Failed to refresh subscriptions:', err.message);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log('Shutting down workers...');
  for (const mgr of wsManagers.values()) mgr.destroy();
  await Promise.all(workers.map(({ worker }) => worker.close()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Startup ──────────────────────────────────────────────────────────────────

// Schedule sync: on startup + every 30s
syncSchedules();
setInterval(syncSchedules, 30_000);

// WebSocket subscriptions: on startup + refresh every 5 minutes for new addresses
refreshWsSubscriptions();
setInterval(refreshWsSubscriptions, 5 * 60_000);

console.log('All workers started.');
