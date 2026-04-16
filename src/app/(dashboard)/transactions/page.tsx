'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTransactions } from '@/hooks/use-transactions';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

/* ── Helpers ──────────────────────────────────────────────────────────── */

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'DRAFT',     color: 'text-cyber-muted',  bg: 'bg-cyber-muted/10 border-cyber-border' },
  SIGNED:    { label: 'SIGNED',    color: 'text-neon-blue',    bg: 'bg-neon-blue/10 border-neon-blue/30' },
  BROADCAST: { label: 'BROADCASTED', color: 'text-neon-green',   bg: 'bg-neon-green/10 border-neon-green/30' },
  CONFIRMED: { label: 'CONFIRMED', color: 'text-neon-green',   bg: 'bg-neon-green/10 border-neon-green/30' },
  FAILED:    { label: 'FAILED',    color: 'text-neon-red',     bg: 'bg-neon-red/10 border-neon-red/30' },
  REPLACED:  { label: 'REPLACED',  color: 'text-neon-purple',  bg: 'bg-neon-purple/10 border-neon-purple/30' },
};

function ellipsis(str: string | null | undefined, head = 8, tail = 6): string {
  if (!str) return '—';
  if (str.length <= head + tail + 3) return str;
  return `${str.slice(0, head)}...${str.slice(-tail)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

/* ── Draft Sign & Broadcast Modal ────────────────────────────────────── */

function DraftModal({ tx, onClose, onBroadcast }: { tx: any; onClose: () => void; onBroadcast: (txid: string) => void }) {
  const [rawHex, setRawHex] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleBroadcast() {
    if (!rawHex.trim()) return;
    setBroadcasting(true); setError('');
    try {
      const res = await fetch(`/api/transactions/${tx.id}/broadcast`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawHex: rawHex.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Broadcast failed');
      onBroadcast(data.txid);
    } catch (err: any) { setError(err.message); } finally { setBroadcasting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-2xl sv-card rounded-t-2xl sm:rounded-lg max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-cyber-border border-l-2 border-l-neon-green flex items-center justify-between">
          <span className="text-[11px] font-mono text-neon-green uppercase tracking-[0.15em]">⚡ SIGN_&_BROADCAST</span>
          <button onClick={onClose} className="text-cyber-muted hover:text-cyber-text font-mono">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="sv-stat-label">AMOUNT</p>
              <p className="text-neon-amber font-semibold mt-0.5">{BigInt(tx.amountSats).toLocaleString()} sats</p>
            </div>
            <div>
              <p className="sv-stat-label">FEE</p>
              <p className="text-cyber-text mt-0.5">{tx.feeSats ? BigInt(tx.feeSats).toLocaleString() : '—'} sats</p>
            </div>
          </div>
          {tx.recipientAddress && (
            <div>
              <p className="sv-stat-label">RECIPIENT</p>
              <p className="text-xs font-mono text-neon-green break-all mt-0.5">{tx.recipientAddress}</p>
            </div>
          )}
          {tx.psbt && (
            <div>
              <div className="flex items-center justify-between">
                <label className="sv-label">PSBT (BASE64)</label>
                <button onClick={() => { navigator.clipboard.writeText(tx.psbt); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="text-[10px] text-neon-green font-mono hover:text-neon-green/70 transition-colors tracking-wider">
                  {copied ? '✓ COPIED' : 'COPY'}
                </button>
              </div>
              <textarea readOnly value={tx.psbt}
                className="w-full h-20 bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-muted font-mono text-xs resize-none focus:outline-none" />
            </div>
          )}
          <div>
            <label className="sv-label">SIGNED_RAW_TX_HEX</label>
            <textarea value={rawHex} onChange={e => setRawHex(e.target.value)}
              className="sv-input h-20 resize-none text-neon-green" placeholder="0200000001..." />
          </div>
          {error && <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">[ERROR] {error}</div>}
          <div className="flex gap-3">
            <NeonButton variant="primary" onClick={handleBroadcast} loading={broadcasting} disabled={!rawHex.trim()}>BROADCAST</NeonButton>
            <NeonButton variant="ghost" onClick={onClose}>CANCEL</NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Transaction Row ─────────────────────────────────────────────────── */

function TxRow({ tx, expanded, onToggle, onSign, onDelete, deletingId }: {
  tx: any; expanded: boolean; onToggle: () => void; onSign: () => void; onDelete: () => void; deletingId: string | null;
}) {
  const st = STATUS_MAP[tx.status] || STATUS_MAP.DRAFT;
  const isOutgoing = tx.type === 'SEND' || tx.type === 'PAYMENT';
  const sats = BigInt(tx.amountSats);
  const amountDisplay = sats >= 1_000_000n
    ? `${(Number(sats) / 1e8).toFixed(6)} BTC`
    : `${sats.toLocaleString()} sats`;

  return (
    <div className="border-b border-cyber-border/20 last:border-0">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cyber-surface/50 transition-colors">
        {/* TXID */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-cyber-text truncate">
            {tx.txid || ellipsis(tx.id, 8, 6)}
          </p>
          <p className="text-[10px] font-mono text-cyber-muted mt-0.5">
            To: {tx.recipientAddress ? ellipsis(tx.recipientAddress, 10, 6) : '—'}
          </p>
        </div>

        {/* Amount */}
        <span className={`text-sm font-mono font-bold shrink-0 ${isOutgoing ? 'text-neon-amber' : 'text-neon-green'}`}>
          {isOutgoing ? '-' : '+'}{amountDisplay}
        </span>

        {/* Timestamp */}
        <span className="text-[10px] font-mono text-cyber-muted shrink-0 w-28 text-right hidden sm:block">
          {formatDate(tx.createdAt)} {formatTime(tx.createdAt)}
        </span>

        {/* Status */}
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${st.color} ${st.bg} tracking-wider`}>
          {st.label}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-cyber-border/10 bg-cyber-surface/30">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-3">
            <div>
              <p className="sv-stat-label">AMOUNT</p>
              <p className="text-sm font-mono text-neon-amber mt-0.5">{BigInt(tx.amountSats).toLocaleString()} sats</p>
            </div>
            <div>
              <p className="sv-stat-label">FEE</p>
              <p className="text-sm font-mono text-cyber-text mt-0.5">
                {tx.feeSats ? `${BigInt(tx.feeSats).toLocaleString()} sats` : '—'}
                {tx.feeRate ? <span className="text-cyber-muted text-[10px] ml-1">({tx.feeRate} sat/vB)</span> : null}
              </p>
            </div>
            <div>
              <p className="sv-stat-label">DATE</p>
              <p className="text-xs font-mono text-cyber-text mt-0.5">{formatDateTime(tx.createdAt)}</p>
            </div>
            <div>
              <p className="sv-stat-label">WALLET</p>
              <p className="text-xs font-mono text-cyber-text mt-0.5">{tx.wallet?.name || '—'}</p>
            </div>
            {tx.recipientAddress && (
              <div className="col-span-2">
                <p className="sv-stat-label">RECIPIENT</p>
                <p className="text-xs font-mono text-neon-green break-all mt-0.5">{tx.recipientAddress}</p>
              </div>
            )}
            {tx.txid && (
              <div className="col-span-2">
                <p className="sv-stat-label">TXID</p>
                <a href={`https://mutinynet.com/tx/${tx.txid}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-neon-green hover:underline break-all mt-0.5 inline-block">{tx.txid}</a>
              </div>
            )}
            {tx.confirmations > 0 && (
              <div>
                <p className="sv-stat-label">CONFIRMATIONS</p>
                <p className="text-xs font-mono text-neon-green mt-0.5">{tx.confirmations}</p>
              </div>
            )}
            {tx.blockHeight && (
              <div>
                <p className="sv-stat-label">BLOCK</p>
                <p className="text-xs font-mono text-cyber-text mt-0.5">{tx.blockHeight.toLocaleString()}</p>
              </div>
            )}
          </div>

          {tx.status === 'DRAFT' && (
            <div className="flex gap-2 pt-1">
              <NeonButton variant="primary" size="sm" onClick={onSign}>SIGN & BROADCAST</NeonButton>
              <NeonButton variant="red" size="sm" loading={deletingId === tx.id} onClick={onDelete}>DELETE</NeonButton>
            </div>
          )}

          {tx.txid && (tx.status === 'BROADCAST' || tx.status === 'CONFIRMED') && (
            <a href={`https://mutinynet.com/tx/${tx.txid}`} target="_blank" rel="noopener noreferrer"
              className="inline-block text-xs font-mono text-neon-green border border-neon-green/30 rounded px-3 py-1.5 hover:bg-neon-green/10 transition-colors tracking-wider">
              VIEW ON MUTINYNET ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function TransactionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useTransactions(undefined, statusFilter || undefined);
  const queryClient = useQueryClient();

  async function handleDelete(txId: string) {
    if (!confirm('Delete this draft? This will unlock reserved UTXOs.')) return;
    setDeletingId(txId);
    try {
      const res = await fetch(`/api/transactions/${txId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Delete failed'); return; }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } finally { setDeletingId(null); }
  }

  function handleBroadcast(txid: string) {
    setBroadcastResult(txid); setSelectedDraft(null);
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><LoadingSpinner text="Loading..." /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-mono font-bold text-cyber-text tracking-tight">Transactions</h1>
      </div>

      {/* Search bar */}
      <div className="sv-card flex items-center px-4 py-3 gap-3">
        <span className="text-neon-green font-mono text-sm">&gt;</span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by txid or address..."
          className="flex-1 bg-transparent text-cyber-muted font-mono text-sm focus:outline-none placeholder:text-cyber-muted/30" />
        <span className="w-0.5 h-5 bg-neon-green sv-cursor" />
      </div>

      {broadcastResult && (
        <div className="sv-card px-4 py-3 border-l-2 border-l-neon-green text-neon-green font-mono text-xs">
          Transaction broadcast — TXID: {ellipsis(broadcastResult, 12, 12)}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {['', 'DRAFT', 'BROADCAST', 'CONFIRMED', 'FAILED'].map(status => (
          <button key={status} onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-[10px] font-mono tracking-wider rounded border transition-all ${
              statusFilter === status
                ? 'bg-neon-green text-cyber-bg font-semibold border-neon-green'
                : 'border-cyber-border text-cyber-muted hover:text-cyber-text'
            }`}>
            {status || 'ALL'}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div className="sv-card overflow-hidden">
        <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-b border-cyber-border text-[10px] font-mono text-cyber-muted uppercase tracking-wider">
          <span className="flex-1">Transaction ID</span>
          <span className="w-28 text-right">AMOUNT</span>
          <span className="w-28 text-right">TIMESTAMP</span>
          <span className="w-24 text-right">STATUS</span>
        </div>

        {data?.transactions?.map((tx: any) => (
          <TxRow key={tx.id} tx={tx} expanded={expandedId === tx.id}
            onToggle={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
            onSign={() => setSelectedDraft(tx)}
            onDelete={() => handleDelete(tx.id)}
            deletingId={deletingId} />
        ))}

        {data?.transactions?.length === 0 && (
          <div className="px-4 py-10 text-center text-cyber-muted font-mono text-sm">No transactions yet</div>
        )}

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="px-4 py-3 border-t border-cyber-border flex items-center justify-between">
            <span className="text-[10px] font-mono text-cyber-muted tracking-wider">
              Showing {data.transactions?.length || 0} of {data.total}
            </span>
            <div className="flex gap-1">
              <button className="w-8 h-8 rounded border border-cyber-border text-xs font-mono text-cyber-muted hover:text-cyber-text">‹</button>
              <button className="w-8 h-8 rounded bg-neon-green text-cyber-bg text-xs font-mono font-semibold">01</button>
              <button className="w-8 h-8 rounded border border-cyber-border text-xs font-mono text-cyber-muted hover:text-cyber-text">02</button>
              <button className="w-8 h-8 rounded border border-cyber-border text-xs font-mono text-cyber-muted hover:text-cyber-text">03</button>
              <button className="w-8 h-8 rounded border border-cyber-border text-xs font-mono text-cyber-muted hover:text-cyber-text">›</button>
            </div>
          </div>
        )}
      </div>

      {selectedDraft && <DraftModal tx={selectedDraft} onClose={() => setSelectedDraft(null)} onBroadcast={handleBroadcast} />}
    </div>
  );
}
