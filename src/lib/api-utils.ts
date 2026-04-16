import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, type RateLimitConfig } from '@/lib/redis-rate-limit';

export type { RateLimitConfig };

/**
 * Build a rate-limit key. Prefer userId (stable across IP rotation) for
 * authenticated endpoints; fall back to IP for unauthenticated ones.
 */
export function getRateLimitKey(req: NextRequest, prefix: string, userId?: string): string {
  if (userId) return `${prefix}:user:${userId}`;
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  return `${prefix}:ip:${ip}`;
}

/**
 * Apply Redis-backed rate limiting to a request.
 * Returns a 429 NextResponse if the limit is exceeded, null if the request is allowed.
 * Pass userId for authenticated endpoints so limits are per-user, not per-IP.
 */
export async function applyRateLimit(
  req: NextRequest,
  prefix: string,
  config: RateLimitConfig,
  userId?: string,
): Promise<NextResponse | null> {
  const key = getRateLimitKey(req, prefix, userId);
  const result = await checkRateLimit(key, config);

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  return null;
}

// Strict config for auth endpoints (unauthenticated — keyed by IP)
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
};

// Payment and transaction creation — 10 per minute per user
export const PAYMENT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 10,
};

// Expense approve — tighter because each call may trigger a broadcast
export const APPROVE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 5,
};

// General API config
export const GENERAL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
};

// Sync endpoints — expensive external API calls
export const SYNC_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 6,
};
