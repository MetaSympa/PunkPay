import { prisma } from '@/lib/db';
import { fetchUtxos } from './utxo';
import { getMempoolApiUrl } from './networks';

interface SyncResult {
  addressesChecked: number;
  utxosFound: number;
  totalSats: bigint;
}

/**
 * Smart UTXO sync — walks addresses in index order per chain (external/internal).
 * Stops after 1 consecutive empty (no UTXOs, never used) address past the last
 * used one. This avoids hammering mempool.space with 20+ requests when only
 * a handful of addresses have ever been used.
 *
 * Flow for each chain:
 *   index 0 → has UTXOs → sync ✓
 *   index 1 → has UTXOs → sync ✓
 *   index 2 → has UTXOs → sync ✓
 *   index 3 → empty, never used → gap hit, stop ✗
 */
export async function syncWalletUtxos(walletId: string, network: string): Promise<SyncResult> {
  const baseUrl = getMempoolApiUrl(network);

  // Load addresses grouped by chain, sorted by index
  const addresses = await prisma.address.findMany({
    where: { walletId },
    orderBy: { index: 'asc' },
  });

  const external = addresses.filter(a => a.chain === 'EXTERNAL');
  const internal = addresses.filter(a => a.chain === 'INTERNAL');

  let addressesChecked = 0;
  let utxosFound = 0;

  async function syncChain(chain: typeof external) {
    let consecutiveEmpty = 0;
    const GAP_LIMIT = 1; // stop after 1 empty address past the last used

    for (const addr of chain) {
      // Already past the gap — skip remaining
      if (consecutiveEmpty >= GAP_LIMIT) break;

      addressesChecked++;

      let utxos;
      try {
        utxos = await fetchUtxos(addr.address, network);
      } catch {
        // Rate limited or network error — stop scanning this chain
        break;
      }

      if (utxos.length === 0 && !addr.isUsed) {
        // Empty address that was never used — count towards gap
        consecutiveEmpty++;
        continue;
      }

      // This address has activity — reset the gap counter
      consecutiveEmpty = 0;

      // Mark as used
      if (!addr.isUsed) {
        await prisma.address.update({
          where: { id: addr.id },
          data: { isUsed: true },
        });
      }

      // Upsert each UTXO
      for (const utxo of utxos) {
        let scriptPubKey = '';
        try {
          const txRes = await fetch(`${baseUrl}/tx/${utxo.txid}`);
          if (txRes.ok) {
            const txData = await txRes.json();
            scriptPubKey = txData?.vout?.[utxo.vout]?.scriptpubkey || '';
          }
        } catch {
          // Non-fatal — will be fetched on next sync
        }

        await prisma.utxo.upsert({
          where: { txid_vout: { txid: utxo.txid, vout: utxo.vout } },
          update: {
            status: utxo.status.confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
            valueSats: BigInt(utxo.value),
            ...(scriptPubKey ? { scriptPubKey } : {}),
          },
          create: {
            walletId,
            addressId: addr.id,
            txid: utxo.txid,
            vout: utxo.vout,
            valueSats: BigInt(utxo.value),
            status: utxo.status.confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
            scriptPubKey,
          },
        });
        utxosFound++;
      }

      // Small delay between addresses to respect rate limits
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Sync external (receive) addresses first, then internal (change)
  await syncChain(external);
  await syncChain(internal);

  // Calculate total balance
  const allUtxos = await prisma.utxo.findMany({
    where: { walletId, status: { in: ['CONFIRMED', 'UNCONFIRMED'] } },
  });
  const totalSats = allUtxos.reduce((s, u) => s + u.valueSats, 0n);

  return { addressesChecked, utxosFound, totalSats };
}
