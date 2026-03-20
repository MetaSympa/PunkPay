/**
 * Validate required environment variables at startup.
 * Import this file early (e.g., in layout.tsx or worker entry) to fail fast.
 */

const REQUIRED_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'AUTH_SECRET',
  'BITCOIN_NETWORK',
  'MASTER_ENCRYPTION_KEY',
] as const;

const OPTIONAL_VARS = [
  'MEMPOOL_API_URL',
  'SIGNAL_API_URL',
  'SIGNAL_SENDER_NUMBER',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join('\n  ')}\n\nCopy .env.example to .env and fill in the values.`
    );
  }

  // Validate MASTER_ENCRYPTION_KEY format
  const masterKey = process.env.MASTER_ENCRYPTION_KEY!;
  if (!/^[0-9a-f]{64}$/i.test(masterKey)) {
    throw new Error('MASTER_ENCRYPTION_KEY must be 64 hex characters. Generate with: openssl rand -hex 32');
  }

  // Validate network value
  const validNetworks = ['mainnet', 'testnet', 'signet', 'regtest'];
  if (!validNetworks.includes(process.env.BITCOIN_NETWORK!)) {
    throw new Error(`Invalid BITCOIN_NETWORK: "${process.env.BITCOIN_NETWORK}". Must be one of: ${validNetworks.join(', ')}`);
  }
}

// Validate lazily — called by db.ts and encryption.ts on first use.
// Don't auto-run at import time; Next.js evaluates modules during build & dev
// before env vars may be fully loaded.
