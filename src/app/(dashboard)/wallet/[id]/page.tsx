'use client';

import { use, useState, useCallback, useEffect, useRef } from 'react';
import { useWallet, useDeleteWallet } from '@/hooks/use-wallet';
import { useQueryClient } from '@tanstack/react-query';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function truncateMiddle(str: string, start = 8, end = 6): string {
  if (str.length <= start + end + 3) return str;
  return `${str.slice(0, start)}…${str.slice(-end)}`;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-[10px] font-mono px-2 py-1 rounded border border-neon-green/30 text-neon-green hover:bg-neon-green/10 transition-colors shrink-0 active:scale-95 tracking-wider"
    >
      {copied ? '✓ COPIED' : label || 'COPY'}
    </button>
  );
}

function RelativeTime({ date }: { date: Date }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 10_000); return () => clearInterval(id); }, []);
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return <span>JUST_NOW</span>;
  if (secs < 60) return <span>{secs}S_AGO</span>;
  if (secs < 3600) return <span>{Math.floor(secs / 60)}M_AGO</span>;
  return <span>{Math.floor(secs / 3600)}H_AGO</span>;
}

export default function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: wallet, isLoading, error } = useWallet(id);
  const deleteWallet = useDeleteWallet();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const autoSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSyncedOnce = useRef(false);

  const handleSync = useCallback(async (silent = false) => {
    if (syncing) return;
    if (!silent) setSyncing(true);
    if (!silent) setSyncResult(null);
    try {
      const res = await fetch(`/api/wallet/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      const msg = `[SUCCESS] ${data.addressesChecked} ADDR` +
        (data.newUtxos > 0 ? ` · ${data.newUtxos} NEW` : '') +
        (data.spentUtxos > 0 ? ` · ${data.spentUtxos} SPENT` : '') +
        ` · ${Number(data.totalSats).toLocaleString()} SATS · ${data.elapsed}MS`;
      if (!silent) setSyncResult(msg);
      setLastSyncedAt(new Date());
      queryClient.invalidateQueries({ queryKey: ['wallet', id] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    } catch (err: any) {
      if (!silent) setSyncResult(`[ERROR] ${err.message}`);
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [id, syncing, queryClient]);

  useEffect(() => {
    if (!wallet || hasSyncedOnce.current) return;
    hasSyncedOnce.current = true;
    handleSync(true);
  }, [wallet, handleSync]);

  useEffect(() => {
    autoSyncRef.current = setInterval(() => handleSync(true), 45_000);
    return () => { if (autoSyncRef.current) clearInterval(autoSyncRef.current); };
  }, [handleSync]);

  async function handleUnlock() {
    setUnlocking(true);
    try {
      const res = await fetch(`/api/wallet/${id}/unlock`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unlock failed');
      setSyncResult(`[SUCCESS] UNLOCKED ${data.unlocked} UTXOS`);
      queryClient.invalidateQueries({ queryKey: ['wallet', id] });
    } catch (err: any) { setSyncResult(`[ERROR] ${err.message}`); } finally { setUnlocking(false); }
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><LoadingSpinner text="LOADING_NODE" /></div>;

  if (error || !wallet) {
    return (
      <div className="space-y-4">
        <Link href="/wallet"><NeonButton variant="ghost" size="sm">← BACK</NeonButton></Link>
        <div className="sv-card p-5 border-l-2 border-l-neon-red">
          <p className="text-neon-red font-mono text-sm">[ERROR] WALLET_NOT_FOUND</p>
        </div>
      </div>
    );
  }

  const balanceBtc = (Number(wallet.balance) / 1e8).toFixed(8);
  const confirmedBtc = (Number(wallet.confirmedBalance) / 1e8).toFixed(8);
  const pendingSats = Number(wallet.balance) - Number(wallet.confirmedBalance);
  const receiveAddr = (wallet as any).receiveAddress;

  async function handleDelete() {
    if (!confirm(`Delete wallet "${wallet!.name}"? This cannot be undone.`)) return;
    await deleteWallet.mutateAsync(id);
    router.push('/wallet');
  }

  return (
    <div className="space-y-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/wallet"><NeonButton variant="ghost" size="sm">←</NeonButton></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-mono font-bold text-cyber-text tracking-tight uppercase">
              {wallet.name.replace(/\s/g, '_')}
            </h1>
            {(wallet as any).hasSeed && (
              <span className="text-[10px] bg-neon-green/10 text-neon-green border border-neon-green/30 rounded px-2 py-0.5 font-mono tracking-wider">⚡ HOT</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-cyber-muted tracking-wider flex-wrap">
            <span>{wallet.xpubFingerprint}</span>
            {lastSyncedAt && <span>SYNCED <RelativeTime date={lastSyncedAt} /></span>}
            <span>{wallet.network.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <NeonButton variant="primary" size="sm" onClick={() => handleSync(false)} loading={syncing}>↺ SYNC</NeonButton>
        <NeonButton variant="amber" size="sm" onClick={handleUnlock} loading={unlocking}>🔓 UNLOCK</NeonButton>
        <NeonButton variant="red" size="sm" onClick={handleDelete} loading={deleteWallet.isPending}>DELETE</NeonButton>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={`sv-card px-4 py-2.5 font-mono text-xs break-words border-l-2 ${syncResult.includes('SUCCESS') ? 'border-l-neon-green text-neon-green' : 'border-l-neon-red text-neon-red'}`}>
          {syncResult}
        </div>
      )}

      {/* Receive Address */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-green flex items-center justify-between">
          <span className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">RECEIVE_BITCOIN</span>
          <span className="text-[10px] text-cyber-muted font-mono tracking-wider">AUTO_ROTATE_ON_RECEIVE</span>
        </div>
        <div className="p-4">
          {receiveAddr ? (
            <div className="space-y-2">
              <p className="text-[10px] text-cyber-muted font-mono tracking-wider">DEPOSIT_ADDRESS — INDEX #{receiveAddr.index}</p>
              <div className="flex items-center gap-2 p-3 bg-cyber-bg border border-neon-green/30 rounded min-w-0">
                <span className="text-neon-green font-mono text-xs sm:text-sm flex-1 break-all leading-relaxed">{receiveAddr.address}</span>
                <CopyButton text={receiveAddr.address} />
              </div>
            </div>
          ) : (
            <p className="text-cyber-muted text-sm font-mono text-center py-4">NO_RECEIVE_ADDRESS — CLICK_SYNC</p>
          )}
        </div>
      </div>

      {/* Balance row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="sv-card p-4 border-l-2 border-l-neon-green">
          <p className="sv-stat-label">TOTAL</p>
          <p className="text-lg sm:text-2xl font-mono font-bold text-neon-green mt-1 truncate">{balanceBtc}</p>
          <p className="text-[10px] text-cyber-muted font-mono mt-0.5">{Number(wallet.balance).toLocaleString()} SAT</p>
        </div>
        <div className="sv-card p-4 border-l-2 border-l-neon-amber">
          <p className="sv-stat-label">CONFIRMED</p>
          <p className="text-lg sm:text-2xl font-mono font-bold text-neon-amber mt-1 truncate">{confirmedBtc}</p>
          <p className="text-[10px] text-cyber-muted font-mono mt-0.5">{Number(wallet.confirmedBalance).toLocaleString()} SAT</p>
        </div>
        <div className="sv-card p-4 border-l-2 border-l-cyber-border">
          <p className="sv-stat-label">PENDING</p>
          <p className="text-lg sm:text-2xl font-mono font-bold text-cyber-text mt-1 truncate">{(pendingSats / 1e8).toFixed(8)}</p>
          <p className="text-[10px] text-cyber-muted font-mono mt-0.5">{pendingSats.toLocaleString()} SAT</p>
        </div>
      </div>

      {/* Wallet Info */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-cyber-border">
          <span className="text-[11px] text-cyber-muted font-mono uppercase tracking-[0.15em]">WALLET_INFO</span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'NETWORK', value: wallet.network.toUpperCase(), color: 'text-neon-amber' },
            { label: 'PATH', value: wallet.derivationPath, color: 'text-cyber-text' },
            { label: 'TRANSACTIONS', value: String((wallet as any)._count?.transactions ?? 0), color: 'text-cyber-text' },
            { label: 'NEXT_INDEX', value: String(wallet.nextReceiveIndex), color: 'text-cyber-text' },
          ].map(({ label, value, color }) => (
            <div key={label} className="min-w-0">
              <p className="sv-stat-label">{label}</p>
              <p className={`font-mono text-sm ${color} truncate mt-0.5`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* UTXOs */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-green flex items-center justify-between">
          <span className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">UTXOS ({wallet.utxos.length})</span>
        </div>
        {wallet.utxos.length === 0 ? (
          <p className="px-4 py-6 text-cyber-muted text-sm font-mono text-center">NO_UTXOS — FUND_THE_RECEIVE_ADDRESS</p>
        ) : (
          <div className="divide-y divide-cyber-border/20">
            {wallet.utxos.map((u: any) => (
              <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono border tracking-wider ${
                    u.status === 'CONFIRMED'
                      ? 'text-neon-green border-neon-green/30 bg-neon-green/5'
                      : 'text-neon-amber border-neon-amber/30 bg-neon-amber/5'
                  }`}>{u.status === 'CONFIRMED' ? 'CONF' : 'PEND'}</span>
                  {u.isLocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono border text-neon-red border-neon-red/30 bg-neon-red/5 tracking-wider">LOCKED</span>
                  )}
                  <span className="text-xs text-cyber-muted font-mono truncate">{truncateMiddle(u.txid, 10, 6)}:{u.vout}</span>
                  <CopyButton text={`${u.txid}:${u.vout}`} label="⧉" />
                </div>
                <span className="text-sm font-mono text-neon-amber font-bold shrink-0">{Number(u.valueSats).toLocaleString()} <span className="text-[10px] text-cyber-muted font-normal">SAT</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Addresses */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-cyber-border">
          <span className="text-[11px] text-cyber-muted font-mono uppercase tracking-[0.15em]">
            ADDRESSES ({wallet.addresses.filter((a: any) => a.chain === 'EXTERNAL').length})
          </span>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-cyber-border/10">
          {wallet.addresses
            .filter((a: any) => a.chain === 'EXTERNAL')
            .sort((a: any, b: any) => a.index - b.index)
            .map((a: any) => {
              const isReceiveAddr = receiveAddr && a.address === receiveAddr.address;
              return (
                <div key={a.id} className={`flex items-center gap-2 px-4 py-2.5 ${isReceiveAddr ? 'bg-neon-green/5' : ''}`}>
                  <span className="text-[10px] text-cyber-muted font-mono w-6 shrink-0 text-right">#{a.index}</span>
                  <span className={`text-xs font-mono min-w-0 flex-1 truncate ${isReceiveAddr ? 'text-neon-green font-semibold' : a.isUsed ? 'text-cyber-muted' : 'text-neon-green'}`}>
                    {truncateMiddle(a.address, 10, 8)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isReceiveAddr && <span className="text-[10px] text-neon-green font-mono font-semibold tracking-wider">← CURRENT</span>}
                    {a.isUsed && !isReceiveAddr && <span className="text-[10px] text-cyber-muted font-mono tracking-wider">USED</span>}
                    <CopyButton text={a.address} label="⧉" />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Connection log */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
          <span className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">LIVE_CONNECTION_LOG</span>
          <span className="text-[10px] text-cyber-muted font-mono tracking-wider">T: {Math.floor(Date.now() / 1000)}</span>
        </div>
        <div className="p-4 space-y-1 font-mono text-xs">
          <p className="text-cyber-muted"><span className="text-neon-green">[INFO]</span> Wallet {wallet.name} verification success (0ms).</p>
          <p className="text-cyber-muted"><span className="text-neon-green">[INFO]</span> {wallet.utxos.length} UTXOs tracked. Balance: {Number(wallet.balance).toLocaleString()} sats.</p>
          {lastSyncedAt && <p className="text-cyber-muted"><span className="text-neon-green">[INFO]</span> Last sync completed at {lastSyncedAt.toISOString()}.</p>}
          <span className="inline-block w-2 h-3 bg-neon-green/60 sv-cursor" />
        </div>
      </div>
    </div>
  );
}
