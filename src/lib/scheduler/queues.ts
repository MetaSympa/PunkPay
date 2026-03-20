import { Queue } from 'bullmq';

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
      // Fall through
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null as null,
  };
}

const connection = parseRedisConnection();

// Payment execution queue
export const paymentQueue = new Queue('payment', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// UTXO sync queue
export const utxoSyncQueue = new Queue('utxo-sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Transaction confirmation monitoring queue
export const txMonitorQueue = new Queue('tx-monitor', {
  connection,
  defaultJobOptions: {
    attempts: 10,
    backoff: { type: 'exponential' as const, delay: 30000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Signal notification queue
export const notificationQueue = new Queue('notification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export { connection as redisConnection };
