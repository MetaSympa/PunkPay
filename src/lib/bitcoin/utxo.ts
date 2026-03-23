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
  const res = await fetch(url, { ...NO_CACHE, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Failed to fetch UTXOs for ${address}: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch recommended fee rates.
 * Handles both mempool.space (/v1/fees/recommended) and Esplora (/fee-estimates) formats.
 */
export async function fetchFeeEstimates(network?: string): Promise<FeeEstimate> {
  const base = getMempoolApiUrl(network);

  // Try mempool.space format first
  const mempoolUrl = `${base}/v1/fees/recommended`;
  const res = await fetch(mempoolUrl, { ...NO_CACHE, signal: AbortSignal.timeout(4000) })
    .catch(() => null);

  if (res?.ok) {
    const data = await res.json();
    // mempool.space returns { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }
    if (data.fastestFee != null) return data as FeeEstimate;
  }

  // Fall back to Esplora format (/fee-estimates returns { "1": rate, "3": rate, ... })
  const esploraUrl = `${base}/fee-estimates`;
  const res2 = await fetch(esploraUrl, { ...NO_CACHE, signal: AbortSignal.timeout(4000) });
  if (!res2.ok) throw new Error(`Failed to fetch fee estimates: ${res2.statusText}`);
  const data2: Record<string, number> = await res2.json();
  return {
    fastestFee:  Math.ceil(data2['1']   ?? data2['2']   ?? 20),
    halfHourFee: Math.ceil(data2['3']   ?? data2['6']   ?? 10),
    hourFee:     Math.ceil(data2['6']   ?? data2['10']  ?? 5),
    economyFee:  Math.ceil(data2['144'] ?? data2['504'] ?? 2),
    minimumFee:  Math.ceil(data2['1008'] ?? 1),
  };
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
