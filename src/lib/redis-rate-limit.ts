import { Redis } from 'ioredis';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// Lazy singleton — separate connection from BullMQ.
// BullMQ requires maxRetriesPerRequest: null; this client uses the default
// so rate-limit checks fail fast rather than blocking the request thread.
let _client: Redis | null = null;

function getClient(): Redis {
  if (!_client) {
    const url = process.env.REDIS_URL;
    _client = url
      ? new Redis(url, { enableOfflineQueue: false, lazyConnect: true })
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
          enableOfflineQueue: false,
          lazyConnect: true,
        });
    _client.on('error', (err: Error) => {
      // Log but do not crash — rate limiting is best-effort
      console.error('[rate-limit] Redis error:', err.message);
    });
  }
  return _client;
}

// Atomically increment the fixed-window counter and set the expiry only when
// the key is first created. Works on Redis 6+ without needing EXPIRE NX.
const INCR_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

/**
 * Redis-backed fixed-window rate limiter.
 *
 * Fails open if Redis is unreachable — rate limiting is best-effort and
 * must not block legitimate requests when the store is temporarily down.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const windowStart = Math.floor(Date.now() / config.windowMs);
  const windowKey = `rl:${key}:${windowStart}`;
  const windowExpirySecs = Math.ceil(config.windowMs / 1000);
  const resetAt = (windowStart + 1) * config.windowMs;

  try {
    const count = await getClient().eval(
      INCR_SCRIPT,
      1,            // number of keys
      windowKey,    // KEYS[1]
      windowExpirySecs, // ARGV[1]
    ) as number;

    return {
      allowed: count <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      resetAt,
    };
  } catch {
    // Redis unavailable — fail open so requests are not blocked
    return { allowed: true, remaining: config.maxRequests, resetAt };
  }
}
