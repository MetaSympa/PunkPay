'use client';

import { use, useState } from 'react';
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

export default function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: wallet, isLoading, error } = useWallet(id);
  const deleteWallet = useDeleteWallet();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

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

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/wallet/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult(`✓ Synced ${data.addressesChecked} addresses · ${data.utxosFound} UTXOs · ${Number(data.totalSats).toLocaleString()} sats total`);
      queryClient.invalidateQueries({ queryKey: ['wallet', id] });
    } catch (err: any) {
      setSyncResult(`✗ ${err.message}`);
    } finally {
      setSyncing(false);
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
            <p className="text-cyber-muted text-xs font-mono mt-0.5">{wallet.xpubFingerprint}</p>
          </div>
          {(wallet as any).hasSeed && (
            <span className="text-xs bg-neon-green/10 text-neon-green border border-neon-green/30 rounded px-2 py-1 font-mono shrink-0 hidden sm:inline">
              ⚡ Hot
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <NeonButton variant="green" size="sm" onClick={handleSync} loading={syncing}>
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

      {/* Receive Address — prominent */}
      {(() => {
        const nextAddr = wallet.addresses
          .filter((a: any) => a.chain === 'EXTERNAL' && !a.isUsed)
          .sort((a: any, b: any) => a.index - b.index)[0];
        return (
          <TerminalCard title="receive bitcoin">
            {nextAddr ? (
              <div className="space-y-2">
                <p className="text-xs text-cyber-muted font-mono">Deposit to this address — index #{nextAddr.index}</p>
                <div className="flex items-center gap-3 p-3 bg-cyber-bg border border-neon-green/30 rounded">
                  <span className="text-neon-green font-mono text-sm flex-1 break-all">{nextAddr.address}</span>
                  <CopyButton text={nextAddr.address} />
                </div>
                <p className="text-xs text-cyber-muted font-mono">Address rotates after each received transaction. Sync UTXOs to detect incoming funds.</p>
              </div>
            ) : (
              <p className="text-cyber-muted text-sm font-mono">No addresses found — click "Sync UTXOs" to generate receive addresses.</p>
            )}
          </TerminalCard>
        );
      })()}

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
          <p className="text-cyber-muted text-sm font-mono text-center py-4">No UTXOs — fund this address to get started</p>
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

      {/* Addresses */}
      <TerminalCard title={`receive addresses (${wallet.addresses.filter((a: any) => a.chain === 'EXTERNAL').length} shown)`}>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {wallet.addresses
            .filter((a: any) => a.chain === 'EXTERNAL')
            .sort((a: any, b: any) => a.index - b.index)
            .map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-cyber-border/50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-cyber-muted font-mono w-5 shrink-0">#{a.index}</span>
                  <span className="text-xs text-neon-green font-mono truncate">{a.address}</span>
                </div>
                {a.isUsed && (
                  <span className="text-xs text-cyber-muted font-mono shrink-0">used</span>
                )}
              </div>
            ))}
        </div>
      </TerminalCard>
    </div>
  );
}
