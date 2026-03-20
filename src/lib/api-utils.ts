import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, type RateLimitConfig } from '@/skills/security/rate-limiter';

/**
 * Extract a rate-limit key from the request (IP-based)
 */
export function getRateLimitKey(req: NextRequest, prefix: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  return `${prefix}:${ip}`;
}

/**
 * Apply rate limiting to a request. Returns a 429 response if exceeded, or null if allowed.
 */
export function applyRateLimit(
  req: NextRequest,
  prefix: string,
  config?: RateLimitConfig
): NextResponse | null {
  const key = getRateLimitKey(req, prefix);
  const result = checkRateLimit(key, config);

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

// Strict config for auth endpoints
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,           // 10 attempts per 15 min
};

// Moderate config for payment/transaction endpoints
export const PAYMENT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 10,
};

// General API config
export const GENERAL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
};
