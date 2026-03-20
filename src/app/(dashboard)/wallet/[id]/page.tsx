'use client';

import { use, useState, useCallback, useEffect, useRef } from 'react';
import { useWallet, useDeleteWallet } from '@/hooks/use-wallet';
import { useQueryClient } from '@tanstack/react-query';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-xs font-mono px-3 py-1 rounded border border-neon-green/30 text-neon-green hover:bg-neon-green/10 transition-colors shrink-0"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function RelativeTime({ date }: { date: Date }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return <span>just now</span>;
  if (secs < 60) return <span>{secs}s ago</span>;
  if (secs < 3600) return <span>{Math.floor(secs / 60)}m ago</span>;
  return <span>{Math.floor(secs / 3600)}h ago</span>;
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
      const msg = `✓ ${data.addressesChecked} addresses scanned` +
        (data.newUtxos > 0 ? ` · ${data.newUtxos} new UTXOs` : '') +
        (data.spentUtxos > 0 ? ` · ${data.spentUtxos} spent` : '') +
        ` · ${Number(data.totalSats).toLocaleString()} sats` +
        ` · ${data.elapsed}ms`;
      if (!silent) setSyncResult(msg);
      setLastSyncedAt(new Date());
      queryClient.invalidateQueries({ queryKey: ['wallet', id] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    } catch (err: any) {
      if (!silent) setSyncResult(`✗ ${err.message}`);
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [id, syncing, queryClient]);

  // Auto-sync: on mount + every 45s
  useEffect(() => {
    if (!wallet || hasSyncedOnce.current) return;
    hasSyncedOnce.current = true;
    handleSync(true);
  }, [wallet, handleSync]);

  useEffect(() => {
    autoSyncRef.current = setInterval(() => handleSync(true), 45_000);
    return () => {
      if (autoSyncRef.current) clearInterval(autoSyncRef.current);
    };
  }, [handleSync]);

  async function handleUnlock() {
    setUnlocking(true);
    try {
      const res = await fetch(`/api/wallet/${id}/unlock`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unlock failed');
      setSyncResult(`✓ Unlocked ${data.unlocked} UTXOs`);
      queryClient.invalidateQueries({ queryKey: ['wallet', id] });
    } catch (err: any) {
      setSyncResult(`✗ ${err.message}`);
    } finally {
      setUnlocking(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner text="Loading wallet" /></div>;
  }

  if (error || !wallet) {
    return (
      <div className="space-y-4">
        <Link href="/wallet"><NeonButton variant="ghost" size="sm">← Back</NeonButton></Link>
        <TerminalCard variant="red">
          <p className="text-neon-red font-mono">Wallet not found.</p>
        </TerminalCard>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Link href="/wallet"><NeonButton variant="ghost" size="sm">←</NeonButton></Link>
          <div className="min-w-0 flex-1">
            <GlitchText text={wallet.name.toUpperCase()} as="h1" className="text-lg sm:text-2xl font-bold text-neon-green truncate" />
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-cyber-muted text-xs font-mono">{wallet.xpubFingerprint}</p>
              {lastSyncedAt && (
                <p className="text-cyber-muted text-xs font-mono">
                  synced <RelativeTime date={lastSyncedAt} />
                </p>
              )}
            </div>
          </div>
          {(wallet as any).hasSeed && (
            <span className="text-xs bg-neon-green/10 text-neon-green border border-neon-green/30 rounded px-2 py-1 font-mono shrink-0 hidden sm:inline">
              ⚡ Hot
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <NeonButton variant="green" size="sm" onClick={() => handleSync(false)} loading={syncing}>
            ↺ Sync
          </NeonButton>
          <NeonButton variant="amber" size="sm" onClick={handleUnlock} loading={unlocking}>
            🔓 Unlock
          </NeonButton>
          <NeonButton variant="red" size="sm" onClick={handleDelete} loading={deleteWallet.isPending}>
            Delete
          </NeonButton>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={`px-4 py-2 rounded border font-mono text-xs ${syncResult.startsWith('✓') ? 'text-neon-green border-neon-green/30 bg-neon-green/5' : 'text-neon-red border-neon-red/30 bg-neon-red/5'}`}>
          {syncResult}
        </div>
      )}

      {/* Receive Address — prominent, uses server-computed receiveAddress */}
      <TerminalCard title="receive bitcoin">
        {receiveAddr ? (
          <div className="space-y-2">
            <p className="text-xs text-cyber-muted font-mono">
              Deposit to this address — index #{receiveAddr.index}
            </p>
            <div className="flex items-center gap-3 p-3 bg-cyber-bg border border-neon-green/30 rounded">
              <span className="text-neon-green font-mono text-sm flex-1 break-all">{receiveAddr.address}</span>
              <CopyButton text={receiveAddr.address} />
            </div>
            <p className="text-xs text-cyber-muted font-mono">
              Address auto-rotates when funds are received. Auto-syncs every 45s.
            </p>
          </div>
        ) : (
          <p className="text-cyber-muted text-sm font-mono">No receive address available — click Sync.</p>
        )}
      </TerminalCard>

      {/* Balance + Meta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TerminalCard title="total balance">
          <div className="text-xl sm:text-2xl font-mono text-neon-green font-bold truncate">{balanceBtc} <span className="text-xs sm:text-sm text-cyber-muted">BTC</span></div>
          <div className="text-xs text-cyber-muted mt-1">{Number(wallet.balance).toLocaleString()} sats</div>
        </TerminalCard>
        <TerminalCard title="confirmed">
          <div className="text-xl sm:text-2xl font-mono text-neon-amber font-bold truncate">{confirmedBtc} <span className="text-xs sm:text-sm text-cyber-muted">BTC</span></div>
          <div className="text-xs text-cyber-muted mt-1">{Number(wallet.confirmedBalance).toLocaleString()} sats</div>
        </TerminalCard>
        <TerminalCard title="pending">
          <div className="text-xl sm:text-2xl font-mono text-cyber-text font-bold truncate">
            {(pendingSats / 1e8).toFixed(8)} <span className="text-xs sm:text-sm text-cyber-muted">BTC</span>
          </div>
          <div className="text-xs text-cyber-muted mt-1">{pendingSats.toLocaleString()} sats</div>
        </TerminalCard>
      </div>

      {/* Wallet info */}
      <TerminalCard title="wallet info">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'Network', value: wallet.network.toUpperCase(), color: 'text-neon-amber' },
            { label: 'Path', value: wallet.derivationPath, color: 'text-cyber-text' },
            { label: 'Transactions', value: String((wallet as any)._count?.transactions ?? 0), color: 'text-cyber-text' },
            { label: 'Next Receive Index', value: String(wallet.nextReceiveIndex), color: 'text-cyber-text' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-xs text-cyber-muted uppercase tracking-wider mb-1">{label}</p>
              <p className={`font-mono text-sm ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </TerminalCard>

      {/* UTXOs */}
      <TerminalCard title={`utxos (${wallet.utxos.length})`}>
        {wallet.utxos.length === 0 ? (
          <p className="text-cyber-muted text-sm font-mono text-center py-4">No UTXOs — fund the receive address above to get started</p>
        ) : (
          <div className="space-y-2">
            {wallet.utxos.map((u: any) => (
              <div key={u.id} className="py-2 border-b border-cyber-border last:border-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono border shrink-0 ${
                      u.status === 'CONFIRMED'
                        ? 'text-neon-green border-neon-green/30 bg-neon-green/5'
                        : 'text-neon-amber border-neon-amber/30 bg-neon-amber/5'
                    }`}>{u.status}</span>
                    {u.isLocked && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-mono border text-neon-red border-neon-red/30 bg-neon-red/5 shrink-0">
                        LOCKED
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-mono text-neon-amber font-bold shrink-0">{Number(u.valueSats).toLocaleString()} sats</span>
                </div>
                <p className="text-xs text-cyber-muted font-mono truncate">{u.txid}:{u.vout}</p>
              </div>
            ))}
          </div>
        )}
      </TerminalCard>

      {/* Addresses — show used + next few unused */}
      <TerminalCard title={`receive addresses (${wallet.addresses.filter((a: any) => a.chain === 'EXTERNAL').length})`}>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {wallet.addresses
            .filter((a: any) => a.chain === 'EXTERNAL')
            .sort((a: any, b: any) => a.index - b.index)
            .map((a: any) => {
              const isReceiveAddr = receiveAddr && a.address === receiveAddr.address;
              return (
                <div key={a.id} className={`flex items-center justify-between gap-2 py-1.5 border-b border-cyber-border/50 last:border-0 ${isReceiveAddr ? 'bg-neon-green/5 -mx-2 px-2 rounded' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-cyber-muted font-mono w-5 shrink-0">#{a.index}</span>
                    <span className={`text-xs font-mono truncate ${isReceiveAddr ? 'text-neon-green font-bold' : a.isUsed ? 'text-cyber-muted' : 'text-neon-green'}`}>
                      {a.address}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isReceiveAddr && (
                      <span className="text-xs text-neon-green font-mono font-bold">← current</span>
                    )}
                    {a.isUsed && (
                      <span className="text-xs text-cyber-muted font-mono">used</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </TerminalCard>
    </div>
  );
}
