'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTransactions } from '@/hooks/use-transactions';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'border-cyber-border text-cyber-muted',
  SIGNED: 'border-blue-400/30 text-blue-400',
  BROADCAST: 'border-neon-amber/30 text-neon-amber',
  CONFIRMED: 'border-neon-green/30 text-neon-green',
  FAILED: 'border-neon-red/30 text-neon-red',
  REPLACED: 'border-purple-400/30 text-purple-400',
};

interface DraftModalProps {
  tx: any;
  onClose: () => void;
  onBroadcast: (txid: string) => void;
}

function DraftModal({ tx, onClose, onBroadcast }: DraftModalProps) {
  const [rawHex, setRawHex] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleBroadcast() {
    if (!rawHex.trim()) return;
    setBroadcasting(true);
    setError('');
    try {
      const res = await fetch(`/api/transactions/${tx.id}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawHex: rawHex.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Broadcast failed');
      onBroadcast(data.txid);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBroadcasting(false);
    }
  }

  function copyPsbt() {
    navigator.clipboard.writeText(tx.psbt || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl bg-cyber-surface border border-cyber-border rounded-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-neon-green font-mono font-bold text-lg">⚡ Sign & Broadcast</h2>
          <button onClick={onClose} className="text-cyber-muted hover:text-cyber-text font-mono">✕</button>
        </div>

        <div className="text-xs text-cyber-muted font-mono space-y-1">
          <p>Amount: <span className="text-neon-amber">{BigInt(tx.amountSats).toLocaleString()} sats</span></p>
          <p>Fee: <span className="text-cyber-text">{tx.feeSats ? BigInt(tx.feeSats).toLocaleString() : '—'} sats</span></p>
          <p>Recipient: <span className="text-neon-green truncate">{tx.recipientAddress}</span></p>
        </div>

        {tx.psbt && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-cyber-muted uppercase tracking-wider">PSBT (base64) — paste into Sparrow to sign</label>
              <button onClick={copyPsbt} className="text-xs text-neon-green font-mono hover:text-neon-green/70 transition-colors">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              readOnly
              value={tx.psbt}
              className="w-full h-20 bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-muted font-mono text-xs resize-none focus:outline-none"
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs text-cyber-muted uppercase tracking-wider">
            Signed Raw Tx Hex — paste here after signing in Sparrow
          </label>
          <textarea
            value={rawHex}
            onChange={e => setRawHex(e.target.value)}
            className="w-full h-20 bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs resize-none focus:border-neon-green focus:outline-none transition-colors"
            placeholder="0200000001..."
          />
        </div>

        {error && (
          <p className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          <NeonButton variant="green" onClick={handleBroadcast} loading={broadcasting} disabled={!rawHex.trim()}>
            Broadcast
          </NeonButton>
          <NeonButton variant="ghost" onClick={onClose}>Cancel</NeonButton>
        </div>
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { data, isLoading } = useTransactions(undefined, statusFilter || undefined);
  const queryClient = useQueryClient();

  async function handleDelete(txId: string) {
    if (!confirm('Delete this draft transaction? This will also unlock any reserved UTXOs.')) return;
    setDeletingId(txId);
    try {
      const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || 'Delete failed');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } finally {
      setDeletingId(null);
    }
  }

  function handleBroadcast(txid: string) {
    setBroadcastResult(txid);
    setSelectedDraft(null);
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Loading transactions" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <GlitchText text="TRANSACTIONS" as="h1" className="text-3xl font-bold text-neon-green" />
        <p className="text-cyber-muted text-sm mt-1 terminal-prompt">
          {data?.total || 0} transactions found
        </p>
      </div>

      {broadcastResult && (
        <div className="px-4 py-3 rounded border text-neon-green border-neon-green/30 bg-neon-green/5 font-mono text-xs">
          ✓ Broadcast successful — txid: <span className="break-all">{broadcastResult}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['', 'DRAFT', 'BROADCAST', 'CONFIRMED', 'FAILED'].map(status => (
          <NeonButton
            key={status}
            variant={statusFilter === status ? 'green' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status || 'All'}
          </NeonButton>
        ))}
      </div>

      {/* Transaction List */}
      <TerminalCard title="transaction log">
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 text-xs text-cyber-muted uppercase tracking-wider pb-2 border-b border-cyber-border font-sans">
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-3">Amount</div>
            <div className="col-span-3">Recipient</div>
            <div className="col-span-2">Date</div>
          </div>

          {data?.transactions?.map(tx => (
            <div key={tx.id} className="space-y-0">
              <div className="grid grid-cols-12 gap-2 py-2 border-b border-cyber-border/20 hover:bg-cyber-card/30 transition-colors text-sm items-center">
                <div className="col-span-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[(tx as any).status] || ''}`}>
                    {(tx as any).status}
                  </span>
                </div>
                <div className="col-span-2 text-cyber-text font-mono">{(tx as any).type}</div>
                <div className="col-span-3 font-mono">
                  <span className="text-neon-amber">{BigInt(tx.amountSats).toLocaleString()}</span>
                  <span className="text-cyber-muted text-xs ml-1">sats</span>
                  {tx.feeSats && (
                    <span className="text-cyber-muted text-xs ml-2">
                      (fee: {BigInt(tx.feeSats).toLocaleString()})
                    </span>
                  )}
                </div>
                <div className="col-span-3 font-mono text-xs text-cyber-muted truncate">
                  {(tx as any).recipientAddress || '—'}
                </div>
                <div className="col-span-2 text-xs text-cyber-muted flex items-center gap-1">
                  <span>⏱</span>
                  <span>{new Date((tx as any).createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* DRAFT action row */}
              {(tx as any).status === 'DRAFT' && (
                <div className="px-2 py-1.5 bg-neon-amber/5 border-b border-cyber-border/20 flex items-center gap-3">
                  <span className="text-xs text-cyber-muted font-mono">
                    ⚠ Unsigned — sign in Sparrow then broadcast
                  </span>
                  <NeonButton variant="amber" size="sm" onClick={() => setSelectedDraft(tx)}>
                    Sign & Broadcast
                  </NeonButton>
                  <NeonButton
                    variant="red"
                    size="sm"
                    loading={deletingId === (tx as any).id}
                    onClick={() => handleDelete((tx as any).id)}
                  >
                    Delete
                  </NeonButton>
                </div>
              )}

              {/* BROADCAST/CONFIRMED txid row */}
              {((tx as any).status === 'BROADCAST' || (tx as any).status === 'CONFIRMED') && (tx as any).txid && (
                <div className="px-2 py-1.5 border-b border-cyber-border/20">
                  <span className="text-xs text-cyber-muted font-mono">txid: </span>
                  <a
                    href={`https://mempool.space/tx/${(tx as any).txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neon-green font-mono hover:underline break-all"
                  >
                    {(tx as any).txid}
                  </a>
                </div>
              )}
            </div>
          ))}

          {data?.transactions?.length === 0 && (
            <div className="text-center py-8 text-cyber-muted">
              No transactions found
            </div>
          )}
        </div>
      </TerminalCard>

      {selectedDraft && (
        <DraftModal
          tx={selectedDraft}
          onClose={() => setSelectedDraft(null)}
          onBroadcast={handleBroadcast}
        />
      )}
    </div>
  );
}
