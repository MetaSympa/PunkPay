'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTransactions } from '@/hooks/use-transactions';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     'border-cyber-border text-cyber-muted',
  SIGNED:    'border-blue-400/30 text-blue-400',
  BROADCAST: 'border-neon-amber/30 text-neon-amber',
  CONFIRMED: 'border-neon-green/30 text-neon-green',
  FAILED:    'border-neon-red/30 text-neon-red',
  REPLACED:  'border-purple-400/30 text-purple-400',
};

function ellipsis(str: string | null | undefined, head = 8, tail = 6): string {
  if (!str) return '—';
  if (str.length <= head + tail + 3) return str;
  return `${str.slice(0, head)}...${str.slice(-tail)}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Draft Sign & Broadcast Modal ─────────────────────────────────────────────

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
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-2xl bg-cyber-surface border border-cyber-border rounded-t-2xl sm:rounded-lg p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-neon-green font-mono font-bold text-lg">⚡ Sign & Broadcast</h2>
          <button onClick={onClose} className="text-cyber-muted hover:text-cyber-text font-mono">✕</button>
        </div>

        <div className="text-xs text-cyber-muted font-mono space-y-1">
          <p>Amount: <span className="text-neon-amber">{BigInt(tx.amountSats).toLocaleString()} sats</span></p>
          <p>Fee: <span className="text-cyber-text">{tx.feeSats ? BigInt(tx.feeSats).toLocaleString() : '—'} sats</span></p>
          <p>Recipient: <span className="text-neon-green break-all">{tx.recipientAddress}</span></p>
        </div>

        {tx.psbt && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-cyber-muted uppercase tracking-wider">PSBT (base64)</label>
              <button onClick={copyPsbt} className="text-xs text-neon-green font-mono hover:text-neon-green/70 transition-colors">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              readOnly value={tx.psbt}
              className="w-full h-20 bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-muted font-mono text-xs resize-none focus:outline-none"
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs text-cyber-muted uppercase tracking-wider">
            Signed Raw Tx Hex
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

// ─── Transaction Row ──────────────────────────────────────────────────────────

function TxRow({
  tx,
  index,
  expanded,
  onToggle,
  onSign,
  onDelete,
  deletingId,
}: {
  tx: any;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onSign: () => void;
  onDelete: () => void;
  deletingId: string | null;
}) {
  const status = tx.status as string;
  const isEven = index % 2 === 0;

  return (
    <div className={isEven ? 'bg-cyber-card/40' : 'bg-cyber-surface/40'}>
      {/* Summary row — clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-neon-green/5 transition-colors"
      >
        <span className={`text-[11px] px-2 py-0.5 rounded border shrink-0 ${STATUS_COLORS[status] || ''}`}>
          {status}
        </span>

        <span className="text-xs font-mono text-cyber-muted shrink-0 w-16">
          {tx.type}
        </span>

        <span className="flex-1 font-mono text-sm text-neon-amber text-right">
          {BigInt(tx.amountSats).toLocaleString()} <span className="text-[10px] text-cyber-muted">sats</span>
        </span>

        <span className="text-xs font-mono text-cyber-muted shrink-0 w-20 text-right hidden sm:block">
          {formatDate(tx.createdAt)}
        </span>

        <span className="text-cyber-muted text-xs shrink-0 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-cyber-border/20">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3">
            <div>
              <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Amount</p>
              <p className="text-sm font-mono text-neon-amber">{BigInt(tx.amountSats).toLocaleString()} sats</p>
            </div>
            <div>
              <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Fee</p>
              <p className="text-sm font-mono text-cyber-text">
                {tx.feeSats ? `${BigInt(tx.feeSats).toLocaleString()} sats` : '—'}
                {tx.feeRate ? <span className="text-cyber-muted text-xs ml-1">({tx.feeRate} sat/vB)</span> : null}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Date</p>
              <p className="text-xs font-mono text-cyber-text">{formatDateTime(tx.createdAt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Wallet</p>
              <p className="text-xs font-mono text-cyber-text">{tx.wallet?.name || '—'}</p>
            </div>
            {tx.recipientAddress && (
              <div className="col-span-2">
                <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Recipient</p>
                <p className="text-xs font-mono text-neon-green break-all">{tx.recipientAddress}</p>
              </div>
            )}
            {tx.txid && (
              <div className="col-span-2">
                <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Transaction ID</p>
                <a
                  href={`https://mempool.space/tx/${tx.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-neon-green hover:underline break-all"
                >
                  {tx.txid}
                </a>
              </div>
            )}
            {tx.confirmations > 0 && (
              <div>
                <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Confirmations</p>
                <p className="text-xs font-mono text-neon-green">{tx.confirmations}</p>
              </div>
            )}
            {tx.blockHeight && (
              <div>
                <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Block</p>
                <p className="text-xs font-mono text-cyber-text">{tx.blockHeight.toLocaleString()}</p>
              </div>
            )}
            {tx.broadcastAt && (
              <div>
                <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Broadcast</p>
                <p className="text-xs font-mono text-cyber-text">{formatDateTime(tx.broadcastAt)}</p>
              </div>
            )}
            {tx.confirmedAt && (
              <div>
                <p className="text-[10px] text-cyber-muted uppercase tracking-wider">Confirmed</p>
                <p className="text-xs font-mono text-cyber-text">{formatDateTime(tx.confirmedAt)}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {status === 'DRAFT' && (
            <div className="flex gap-2 pt-1">
              <NeonButton variant="amber" size="sm" onClick={onSign}>
                Sign & Broadcast
              </NeonButton>
              <NeonButton variant="red" size="sm"
                loading={deletingId === tx.id}
                onClick={onDelete}>
                Delete
              </NeonButton>
            </div>
          )}

          {/* Quick txid link for non-expanded context */}
          {tx.txid && (status === 'BROADCAST' || status === 'CONFIRMED') && (
            <a
              href={`https://mempool.space/tx/${tx.txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-mono text-neon-green border border-neon-green/30 rounded px-3 py-1.5 hover:bg-neon-green/10 transition-colors"
            >
              View on Mempool ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">Transactions</h1>
          <p className="text-cyber-muted text-xs font-mono mt-0.5">
            {data?.total || 0} found
          </p>
        </div>
      </div>

      {broadcastResult && (
        <div className="px-4 py-3 rounded border text-neon-green border-neon-green/30 bg-neon-green/5 font-mono text-xs">
          ✓ Broadcast successful — txid: <span className="break-all">{ellipsis(broadcastResult, 12, 12)}</span>
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
      <div className="pp-card overflow-hidden rounded-lg">
        {data?.transactions?.map((tx, i) => (
          <TxRow
            key={tx.id}
            tx={tx}
            index={i}
            expanded={expandedId === tx.id}
            onToggle={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
            onSign={() => setSelectedDraft(tx)}
            onDelete={() => handleDelete((tx as any).id)}
            deletingId={deletingId}
          />
        ))}

        {data?.transactions?.length === 0 && (
          <div className="px-4 py-10 text-center text-cyber-muted font-mono text-sm">
            No transactions found
          </div>
        )}
      </div>

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
