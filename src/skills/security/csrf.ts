import { randomBytes, timingSafeEqual } from 'crypto';

const TOKEN_LENGTH = 32;

export function generateCsrfToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('hex');
}

export function validateCsrfToken(token: string, expected: string): boolean {
  if (!token || !expected) return false;
  if (token.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
