import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fetchUtxos, getMempoolApiUrl } from '@/lib/bitcoin';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { walletId } = await params;
  const userId = (session.user as any).id;

  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId },
    include: { addresses: true },
  });

  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });

  const baseUrl = getMempoolApiUrl(wallet.network);

  // ── Fetch UTXOs for all addresses in parallel ────────────────────────────
  const addressResults = await Promise.allSettled(
    wallet.addresses.map(async (addr) => {
      const utxos = await fetchUtxos(addr.address, wallet.network);

      // Fetch all raw txs for this address's UTXOs in parallel
      const utxosWithScript = await Promise.allSettled(
        utxos.map(async (utxo) => {
          const txRes = await fetch(`${baseUrl}/tx/${utxo.txid}`);
          if (!txRes.ok) return null;
          const txData = await txRes.json();
          const scriptPubKey: string = txData?.vout?.[utxo.vout]?.scriptpubkey;
          if (!scriptPubKey) return null;
          return { utxo, scriptPubKey };
        })
      );

      return { addr, utxos, utxosWithScript };
    })
  );

  // ── Write all results to DB ──────────────────────────────────────────────
  let addressesChecked = 0;
  let newUtxos = 0;

  await prisma.$transaction(async (tx) => {
    for (const result of addressResults) {
      if (result.status === 'rejected') continue;
      const { addr, utxos, utxosWithScript } = result.value;
      addressesChecked++;

      for (const utxoResult of utxosWithScript) {
        if (utxoResult.status === 'rejected' || !utxoResult.value) continue;
        const { utxo, scriptPubKey } = utxoResult.value;

        await tx.utxo.upsert({
          where: { txid_vout: { txid: utxo.txid, vout: utxo.vout } },
          update: {
            status: utxo.status.confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
            valueSats: BigInt(utxo.value),
            scriptPubKey,
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
        newUtxos++;
      }

      if (utxos.length > 0 && !addr.isUsed) {
        await tx.address.update({
          where: { id: addr.id },
          data: { isUsed: true },
        });
      }
    }
  });

  const utxos = await prisma.utxo.findMany({
    where: { walletId, status: { in: ['CONFIRMED', 'UNCONFIRMED'] } },
  });
  const totalSats = utxos.reduce((s, u) => s + u.valueSats, 0n);

  return NextResponse.json({
    addressesChecked,
    utxosFound: newUtxos,
    totalSats: totalSats.toString(),
  });
}
