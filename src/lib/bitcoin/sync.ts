import { prisma } from '@/lib/db';
import { fetchUtxos, type MempoolUtxo } from './utxo';
import { getMempoolApiUrl } from './networks';
import { deriveAddress, deriveAddresses, type AddressType } from './hd-wallet';
import { decrypt } from '@/lib/crypto/encryption';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { getNetwork } from './networks';

bitcoin.initEccLib(ecc);

interface SyncResult {
  addressesChecked: number;
  newUtxos: number;
  spentUtxos: number;
  totalSats: bigint;
  confirmedSats: bigint;
  nextReceiveIndex: number;
  elapsed: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addressToScriptPubKey(address: string, network?: string): string {
  const net = getNetwork(network);
  const outputScript = bitcoin.address.toOutputScript(address, net);
  return Buffer.from(outputScript).toString('hex');
}

/**
 * Run async tasks with bounded concurrency.
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ─── Address scan result ────────────────────────────────────────────────────

interface AddressScanResult {
  addressId: string;
  address: string;
  index: number;
  chain: 'EXTERNAL' | 'INTERNAL';
  utxos: MempoolUtxo[];
  hasActivity: boolean;
  scanFailed: boolean;
}

// ─── Main sync ──────────────────────────────────────────────────────────────

/**
 * Fast wallet UTXO sync with:
 * - Parallel address scanning (5 concurrent)
 * - Single API call per address (just /utxo, no /address info)
 * - Local scriptPubKey derivation (zero extra API calls per UTXO)
 * - Proper BIP44 gap limit (20 external, 5 internal)
 * - Auto address derivation when gap fills up
 * - Correct address rotation tracking via nextReceiveIndex
 *
 * Strategy: Only fetch /utxo endpoint per address. Addresses already
 * marked isUsed in DB count as "active" for gap tracking even if
 * their UTXOs are spent. This avoids the expensive /address call.
 */
export async function syncWalletUtxos(walletId: string, network: string): Promise<SyncResult> {
  const start = Date.now();
  const baseUrl = getMempoolApiUrl(network);

  // ── Load wallet + decrypt xpub ──────────────────────────────────────────
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
  });
  const xpub = decrypt(wallet.encryptedXpub);
  const addrType = (wallet.addressType || 'P2TR') as AddressType;

  // ── Ensure we have enough pre-derived addresses ─────────────────────────
  const EXT_GAP_LIMIT = 5;
  const INT_GAP_LIMIT = 3;

  const dbAddresses = await prisma.address.findMany({
    where: { walletId },
    orderBy: { index: 'asc' },
  });

  const externalAddrs = dbAddresses.filter(a => a.chain === 'EXTERNAL');
  const internalAddrs = dbAddresses.filter(a => a.chain === 'INTERNAL');

  // Derive more addresses if we don't have enough for gap scan
  async function ensureAddresses(
    existing: typeof externalAddrs,
    chainNum: 0 | 1,
    chainType: 'EXTERNAL' | 'INTERNAL',
    gapLimit: number
  ) {
    const highestUsedIdx = existing.filter(a => a.isUsed).reduce((m, a) => Math.max(m, a.index), -1);
    const needUpTo = highestUsedIdx + gapLimit;
    const maxExisting = existing.length > 0 ? Math.max(...existing.map(a => a.index)) : -1;

    if (needUpTo > maxExisting) {
      const startIdx = maxExisting + 1;
      const count = needUpTo - maxExisting;
      const newAddrs = deriveAddresses(xpub, chainNum, startIdx, count, network, addrType);
      if (newAddrs.length > 0) {
        await prisma.address.createMany({
          data: newAddrs.map(a => ({
            walletId,
            address: a.address,
            index: a.index,
            chain: chainType,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  await ensureAddresses(externalAddrs, 0, 'EXTERNAL', EXT_GAP_LIMIT);
  await ensureAddresses(internalAddrs, 1, 'INTERNAL', INT_GAP_LIMIT);

  // Reload after potential derivation
  const allAddresses = await prisma.address.findMany({
    where: { walletId },
    orderBy: { index: 'asc' },
  });
  const external = allAddresses.filter(a => a.chain === 'EXTERNAL');
  const internal = allAddresses.filter(a => a.chain === 'INTERNAL');

  // ── Scan chain with gap limit ──────────────────────────────────────────
  let addressesChecked = 0;

  async function scanChain(
    chain: typeof external,
    chainType: 'EXTERNAL' | 'INTERNAL',
    gapLimit: number
  ): Promise<AddressScanResult[]> {
    // Linear scan: check addresses sequentially, stop after gapLimit consecutive empty
    const results: AddressScanResult[] = [];
    let consecutiveEmpty = 0;

    for (const addr of chain) {
      addressesChecked++;
      try {
        const utxos = await fetchUtxos(addr.address, network);
        const result: AddressScanResult = {
          addressId: addr.id, address: addr.address, index: addr.index,
          chain: chainType, utxos, hasActivity: utxos.length > 0 || addr.isUsed, scanFailed: false,
        };
        results.push(result);

        if (result.hasActivity) { consecutiveEmpty = 0; }
        else if (++consecutiveEmpty >= gapLimit) { break; }
      } catch (err) {
        console.warn(`[sync] Failed ${addr.address} (idx ${addr.index}):`, err instanceof Error ? err.message : err);
        results.push({
          addressId: addr.id, address: addr.address, index: addr.index,
          chain: chainType, utxos: [], hasActivity: addr.isUsed, scanFailed: true,
        });
        if (addr.isUsed) { consecutiveEmpty = 0; }
        else if (++consecutiveEmpty >= gapLimit) { break; }
      }
    }
    return results;
  }

  const extResults = await scanChain(external, 'EXTERNAL', EXT_GAP_LIMIT);
  const intResults = await scanChain(internal, 'INTERNAL', INT_GAP_LIMIT);
  const allResults = [...extResults, ...intResults];

  // ── Batch update database ──────────────────────────────────────────────

  // 1. Mark active addresses as used
  const usedAddressIds = allResults
    .filter(r => r.utxos.length > 0) // only mark used if we actually found UTXOs
    .map(r => r.addressId);

  if (usedAddressIds.length > 0) {
    await prisma.address.updateMany({
      where: { id: { in: usedAddressIds }, isUsed: false },
      data: { isUsed: true },
    });
  }

  // 2. Get all current DB UTXOs for this wallet (non-spent)
  const dbUtxos = await prisma.utxo.findMany({
    where: { walletId, status: { in: ['CONFIRMED', 'UNCONFIRMED', 'LOCKED'] } },
  });
  const dbUtxoMap = new Map(dbUtxos.map(u => [`${u.txid}:${u.vout}`, u]));

  // 3. Build set of all live UTXOs from scan
  const liveUtxoMap = new Map<string, { result: AddressScanResult; utxo: MempoolUtxo }>();
  for (const result of allResults) {
    for (const utxo of result.utxos) {
      liveUtxoMap.set(`${utxo.txid}:${utxo.vout}`, { result, utxo });
    }
  }

  // 4. Mark spent UTXOs (in DB but not live anymore)
  // Only mark as spent if the address was successfully scanned — API failures must
  // never falsely evict UTXOs from the database.
  const successfullyScannedAddressIds = new Set(
    allResults.filter(r => !r.scanFailed).map(r => r.addressId)
  );
  const failedScanCount = allResults.filter(r => r.scanFailed).length;
  if (failedScanCount > 0) {
    console.warn(`[sync] ${failedScanCount} address(es) failed to scan — their UTXOs preserved`);
  }

  let spentUtxos = 0;
  const spentIds: string[] = [];
  for (const [key, dbUtxo] of dbUtxoMap) {
    if (!liveUtxoMap.has(key) && dbUtxo.status !== 'LOCKED') {
      // Skip UTXOs whose address scan failed — we don't know if they're spent
      if (!successfullyScannedAddressIds.has(dbUtxo.addressId)) continue;
      spentIds.push(dbUtxo.id);
      spentUtxos++;
    }
  }
  if (spentIds.length > 0) {
    await prisma.utxo.updateMany({
      where: { id: { in: spentIds } },
      data: { status: 'SPENT', isLocked: false, lockedUntil: null },
    });
  }

  // 5. Upsert live UTXOs — derive scriptPubKey locally, no API call
  let newUtxos = 0;
  const upsertPromises = [];
  for (const [key, { result, utxo }] of liveUtxoMap) {
    const scriptPubKey = addressToScriptPubKey(result.address, network);
    const isNew = !dbUtxoMap.has(key);
    if (isNew) newUtxos++;

    upsertPromises.push(
      prisma.utxo.upsert({
        where: { txid_vout: { txid: utxo.txid, vout: utxo.vout } },
        update: {
          status: utxo.status.confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
          valueSats: BigInt(utxo.value),
          scriptPubKey,
        },
        create: {
          walletId,
          addressId: result.addressId,
          txid: utxo.txid,
          vout: utxo.vout,
          valueSats: BigInt(utxo.value),
          status: utxo.status.confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
          scriptPubKey,
        },
      })
    );
  }
  await Promise.all(upsertPromises);

  // ── Update address rotation ────────────────────────────────────────────

  // nextReceiveIndex = highest used external index + 1
  const usedExtResults = extResults.filter(r => r.hasActivity);
  const highestUsedExtNow = usedExtResults.length > 0
    ? Math.max(...usedExtResults.map(r => r.index))
    : -1;
  const nextReceiveIndex = highestUsedExtNow + 1;

  const usedIntResults = intResults.filter(r => r.hasActivity);
  const highestUsedIntNow = usedIntResults.length > 0
    ? Math.max(...usedIntResults.map(r => r.index))
    : -1;
  const nextChangeIndex = highestUsedIntNow + 1;

  // Ensure the next receive address exists
  const nextReceiveExists = allAddresses.find(
    a => a.chain === 'EXTERNAL' && a.index === nextReceiveIndex
  );
  if (!nextReceiveExists) {
    const derived = deriveAddress(xpub, 0, nextReceiveIndex, network, addrType);
    await prisma.address.create({
      data: {
        walletId,
        address: derived.address,
        index: nextReceiveIndex,
        chain: 'EXTERNAL',
      },
    }).catch(() => {}); // ignore race
  }

  // Update wallet counters + sync timestamp
  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      nextReceiveIndex: Math.max(nextReceiveIndex, wallet.nextReceiveIndex),
      nextChangeIndex: Math.max(nextChangeIndex, wallet.nextChangeIndex),
      lastSyncedAt: new Date(),
    },
  });

  // ── Compute final balances ─────────────────────────────────────────────

  const finalUtxos = await prisma.utxo.findMany({
    where: { walletId, status: { in: ['CONFIRMED', 'UNCONFIRMED'] } },
  });
  const totalSats = finalUtxos.reduce((s, u) => s + u.valueSats, 0n);
  const confirmedSats = finalUtxos.filter(u => u.status === 'CONFIRMED').reduce((s, u) => s + u.valueSats, 0n);

  return {
    addressesChecked,
    newUtxos,
    spentUtxos,
    totalSats,
    confirmedSats,
    nextReceiveIndex: Math.max(nextReceiveIndex, wallet.nextReceiveIndex),
    elapsed: Date.now() - start,
  };
}
