import { Worker } from 'bullmq';
import { prisma } from '../lib/db';
import { paymentQueue } from '../lib/scheduler/queues';
import { handlePayment, handleUtxoSync, handleTxMonitor, handleNotification } from '../lib/scheduler/handlers';
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

      await paymentQueue.upsertJobScheduler(
        `sched:${schedule.id}`,
        { pattern: schedule.cronExpression },
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

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down workers...');
  await Promise.all(workers.map(({ worker }) => worker.close()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Sync on startup, then every 30s to pick up new/paused schedules
syncSchedules();
setInterval(syncSchedules, 30_000);

console.log('All workers started.');
