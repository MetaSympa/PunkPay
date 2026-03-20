import { getMempoolApiUrl } from './networks';

export interface MempoolUtxo {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  value: number;
}

export interface FeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

/**
 * Shared fetch options to bypass Next.js server-side caching.
 * Next.js App Router caches fetch() by default — without this,
 * mempool.space responses get cached and return stale (empty) UTXO data.
 */
const NO_CACHE: RequestInit = { cache: 'no-store' };

/**
 * Fetch UTXOs for an address from mempool.space (with 8s timeout)
 */
export async function fetchUtxos(address: string, network?: string): Promise<MempoolUtxo[]> {
  const url = `${getMempoolApiUrl(network)}/address/${address}/utxo`;
  const res = await fetch(url, { ...NO_CACHE, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Failed to fetch UTXOs for ${address}: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch recommended fee rates
 */
export async function fetchFeeEstimates(network?: string): Promise<FeeEstimate> {
  const url = `${getMempoolApiUrl(network)}/v1/fees/recommended`;
  const res = await fetch(url, { ...NO_CACHE, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Failed to fetch fee estimates: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch transaction details
 */
export async function fetchTransaction(txid: string, network?: string): Promise<any> {
  const url = `${getMempoolApiUrl(network)}/tx/${txid}`;
  const res = await fetch(url, { ...NO_CACHE, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Failed to fetch transaction: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch transaction status
 */
export async function fetchTransactionStatus(txid: string, network?: string): Promise<{
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}> {
  const url = `${getMempoolApiUrl(network)}/tx/${txid}/status`;
  const res = await fetch(url, { ...NO_CACHE, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Failed to fetch tx status: ${res.statusText}`);
  return res.json();
}

/**
 * Broadcast a raw transaction
 */
export async function broadcastTransaction(rawHex: string, network?: string): Promise<string> {
  const url = `${getMempoolApiUrl(network)}/tx`;
  const res = await fetch(url, {
    ...NO_CACHE,
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawHex,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Broadcast failed: ${error}`);
  }
  return res.text(); // Returns txid
}

/**
 * Select UTXOs for a target amount using a simple largest-first algorithm
 * Returns selected UTXOs and the total value
 */
export function selectUtxos(
  utxos: Array<{ txid: string; vout: number; valueSats: bigint }>,
  targetSats: bigint,
  feeEstimateSats: bigint
): { selected: typeof utxos; totalSats: bigint } {
  // Sort by value descending (largest first)
  const sorted = [...utxos].sort((a, b) => {
    if (a.valueSats > b.valueSats) return -1;
    if (a.valueSats < b.valueSats) return 1;
    return 0;
  });

  const needed = targetSats + feeEstimateSats;
  const selected: typeof utxos = [];
  let totalSats = 0n;

  for (const utxo of sorted) {
    selected.push(utxo);
    totalSats += utxo.valueSats;
    if (totalSats >= needed) break;
  }

  if (totalSats < needed) {
    throw new Error(
      `Insufficient funds: have ${totalSats} sats, need ${needed} sats (${targetSats} + ${feeEstimateSats} fee)`
    );
  }

  return { selected, totalSats };
}
