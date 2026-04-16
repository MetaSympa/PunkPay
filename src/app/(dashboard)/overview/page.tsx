'use client';

import { useSession } from 'next-auth/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useWallets } from '@/hooks/use-wallet';
import { useSchedules } from '@/hooks/use-schedules';
import { useExpenses, useApproveExpense } from '@/hooks/use-expenses';
import { useTransactions } from '@/hooks/use-transactions';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { NeonButton } from '@/components/ui/neon-button';
import { useWalletSync } from '@/hooks/use-wallet-sync';

/* ── BTC data ─────────────────────────────────────────────────────────── */

function useBtcData() {
  return useQuery({
    queryKey: ['btc-price'],
    queryFn: async () => {
      const [pr, cr] = await Promise.all([
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'),
        fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=daily'),
      ]);
      const price = await pr.json();
      const chart = await cr.json();
      return {
        price: price.bitcoin.usd as number,
        change24h: price.bitcoin.usd_24h_change as number,
        chartPrices: (chart.prices as [number, number][]).map(([, p]) => p),
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function useRecipients() {
  return useQuery({
    queryKey: ['recipients'],
    queryFn: async () => { const r = await fetch('/api/recipients'); return r.ok ? r.json() : []; },
  });
}

function useRecipientProfile() {
  return useQuery({
    queryKey: ['recipient-profile'],
    queryFn: async () => { const res = await fetch('/api/recipient/profile'); return res.ok ? res.json() : null; },
  });
}

/* ── Sparkline chart ──────────────────────────────────────────────────── */

function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const W = 280, H = 80;
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * W},${H - ((p - min) / range) * (H - 8) - 4}`).join(' ');
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#00FF41' : '#FF3333';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${H} ${pts} ${W},${H}`}
        fill="url(#spark-fill)"
      />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Status maps ──────────────────────────────────────────────────────── */

const TX_STATUS: Record<string, { label: string; color: string }> = {
  CONFIRMED: { label: 'Confirmed', color: 'text-neon-green' },
  BROADCAST: { label: 'Broadcast', color: 'text-neon-amber' },
  DRAFT:     { label: 'Draft',     color: 'text-cyber-muted' },
  FAILED:    { label: 'Failed',    color: 'text-neon-red' },
};
const EXP_COLOR: Record<string, string> = {
  PENDING: 'text-neon-amber', APPROVED: 'text-neon-green', REJECTED: 'text-neon-red', PAID: 'text-cyber-muted',
};

/* ── Receive Modal ────────────────────────────────────────────────────── */

function ReceiveModal({ wallets, onClose }: { wallets: any[]; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(wallets.length === 1 ? wallets[0].id : '');
  const [address, setAddress] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setAddress(null);
    setQrDataUrl(null);
    fetch(`/api/wallet/${selectedId}`)
      .then(r => r.json())
      .then(async (data) => {
        if (cancelled) return;
        const addr: string | undefined = data.receiveAddress?.address;
        if (addr) {
          setAddress(addr);
          const url = await QRCode.toDataURL(`bitcoin:${addr}`, {
            width: 200, margin: 2,
            color: { dark: '#00FF41', light: '#0d0d0d' },
          });
          if (!cancelled) setQrDataUrl(url);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm sv-card">
        <div className="px-5 py-4 border-b border-cyber-border border-l-2 border-l-neon-green flex items-center justify-between">
          <span className="text-[11px] font-mono text-neon-green uppercase tracking-[0.15em]">↓ Receive Bitcoin</span>
          <button onClick={onClose} className="text-cyber-muted hover:text-cyber-text font-mono text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {wallets.length > 1 && (
            <div>
              <label className="sv-label">Select Wallet</label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="sv-input mt-1"
              >
                <option value="">-- select wallet --</option>
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner text="DERIVING_ADDRESS" />
            </div>
          )}

          {!loading && address && qrDataUrl && (
            <>
              <div className="flex justify-center p-4 bg-black border border-cyber-border/50 rounded">
                <img src={qrDataUrl} alt="Receive address QR" className="w-48 h-48 rounded" />
              </div>
              <div>
                <p className="sv-stat-label mb-1">Receive Address</p>
                <div className="flex items-start gap-2 bg-black/40 border border-cyber-border rounded px-3 py-2">
                  <p className="text-[11px] font-mono text-neon-green break-all flex-1 leading-relaxed">{address}</p>
                  <button
                    onClick={handleCopy}
                    className="text-[10px] font-mono text-cyber-muted hover:text-neon-green transition-colors shrink-0 mt-0.5"
                  >
                    {copied ? '✓ COPIED' : 'COPY'}
                  </button>
                </div>
              </div>
            </>
          )}

          {!loading && wallets.length > 1 && !selectedId && (
            <p className="text-xs font-mono text-cyber-muted text-center py-4">Select a wallet to show its receive address</p>
          )}

          {!loading && selectedId && !address && !loading && (
            <p className="text-xs font-mono text-neon-amber text-center py-4">No receive address available — try syncing the wallet</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Quick Transfer Modal ─────────────────────────────────────────────── */

function QuickTransferModal({ wallets, onClose }: { wallets: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const hotWallets = wallets.filter(w => w.hasSeed);
  const [form, setForm] = useState({
    toAddress: '',
    amountSats: '',
    feeRate: '5',
    walletId: hotWallets[0]?.id ?? '',
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError('');
    try {
      const res = await fetch('/api/recipient/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toAddress: form.toAddress.trim(),
          amountSats: parseInt(form.amountSats),
          walletId: form.walletId,
          feeRate: parseInt(form.feeRate),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setTxid(data.txid);
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['wallets'] });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md sv-card rounded-t-2xl sm:rounded-lg">
        <div className="px-5 py-4 border-b border-cyber-border border-l-2 border-l-neon-green flex items-center justify-between">
          <span className="text-[11px] font-mono text-neon-green uppercase tracking-[0.15em]">⚡ Quick Transfer</span>
          <button onClick={onClose} className="text-cyber-muted hover:text-cyber-text font-mono">✕</button>
        </div>
        <div className="p-5">
          {txid ? (
            <div className="space-y-4">
              <p className="text-neon-green font-mono text-sm">✓ Broadcast successful</p>
              <div>
                <p className="sv-stat-label">TXID</p>
                <a href={`https://mutinynet.com/tx/${txid}`} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs text-neon-green break-all hover:underline mt-1 inline-block">{txid}</a>
              </div>
              <NeonButton variant="primary" onClick={onClose} className="w-full">Done</NeonButton>
            </div>
          ) : hotWallets.length === 0 ? (
            <div className="space-y-4">
              <p className="text-neon-amber text-sm font-mono">No hot wallet found. Import a wallet with a seed phrase to send.</p>
              <NeonButton variant="ghost" onClick={onClose} className="w-full">Close</NeonButton>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {hotWallets.length > 1 && (
                <div>
                  <label className="sv-label">From Wallet</label>
                  <select value={form.walletId} onChange={e => setForm({ ...form, walletId: e.target.value })}
                    className="sv-input mt-1">
                    {hotWallets.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="sv-label">To Address</label>
                <input type="text" value={form.toAddress} onChange={e => setForm({ ...form, toAddress: e.target.value })}
                  placeholder="tb1p… or bc1p…" className="sv-input mt-1 text-xs" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="sv-label">Amount (sats)</label>
                  <input type="number" value={form.amountSats} onChange={e => setForm({ ...form, amountSats: e.target.value })}
                    min="546" className="sv-input mt-1" required />
                </div>
                <div>
                  <label className="sv-label">Fee (sat/vB)</label>
                  <input type="number" value={form.feeRate} onChange={e => setForm({ ...form, feeRate: e.target.value })}
                    min="1" max="1000" className="sv-input mt-1" />
                </div>
              </div>
              {error && <p className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">{error}</p>}
              <div className="flex gap-3">
                <NeonButton type="submit" variant="primary" loading={sending} disabled={!form.toAddress || !form.amountSats} className="flex-1">
                  Send
                </NeonButton>
                <NeonButton type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</NeonButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── PAYER DASHBOARD ──────────────────────────────────────────────────── */

function PayerDashboard() {
  const { data: wallets, isLoading } = useWallets();
  const { data: schedules } = useSchedules();
  const { data: expenses } = useExpenses();
  const { data: txData } = useTransactions();
  const { data: btc } = useBtcData();
  const { data: recipients } = useRecipients();
  const approveExpense = useApproveExpense();
  const [showQuickTransfer, setShowQuickTransfer] = useState(false);
  const [showReceive, setShowReceive] = useState(false);

  const firstWalletId = wallets?.[0]?.id ?? null;
  const { isSyncing, syncNow } = useWalletSync(firstWalletId);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="LOADING_TERMINAL" /></div>;

  const activeSchedules = schedules?.filter(s => s.isActive) ?? [];
  const pendingExpenses = expenses?.filter(e => e.status === 'PENDING') ?? [];
  const recentTxs = txData?.transactions?.slice(0, 5) ?? [];

  // Total balance across all wallets
  const totalSats = wallets?.reduce((sum, w) => sum + Number(w.balance || 0), 0) ?? 0;
  const totalBtc = (totalSats / 1e8).toFixed(8);
  const totalUsd = btc ? (totalSats / 1e8 * btc.price) : 0;

  return (
    <div className="space-y-6">
      {/* ── Hero balance + BTC price ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main balance card */}
        <div className="lg:col-span-2 sv-card p-6 relative overflow-hidden">
          <p className="sv-stat-label">Balance</p>
          <div className="mt-2">
            <span className="text-4xl sm:text-5xl font-mono font-bold text-cyber-text tracking-tight">
              {totalBtc}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-neon-green font-mono text-sm font-semibold">BTC</span>
            <span className="text-cyber-muted font-mono text-sm">
              ≈ ${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
            </span>
          </div>
          <div className="flex gap-3 mt-6">
            <NeonButton variant="primary" size="md" onClick={() => setShowQuickTransfer(true)}>⚡ Quick Transfer</NeonButton>
            <NeonButton variant="ghost" size="md" onClick={() => setShowReceive(true)}>Receive</NeonButton>
          </div>
          {/* Sync indicator */}
          <div className="absolute top-6 right-6">
            <button onClick={syncNow} className="text-[10px] font-mono text-cyber-muted hover:text-neon-green transition-colors tracking-wider">
              {isSyncing ? 'SYNCING...' : '↻ SYNC'}
            </button>
          </div>
        </div>

        {/* BTC price chart */}
        <div className="sv-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">Bitcoin</span>
            <span className="text-[10px] text-cyber-muted font-mono tracking-wider">7-day chart</span>
          </div>
          <div className="mt-3 flex-1">
            {btc?.chartPrices && <Sparkline prices={btc.chartPrices} />}
          </div>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-mono font-bold text-cyber-text">
              ${btc?.price.toLocaleString() ?? '—'}
            </span>
            {btc && (
              <span className={`text-sm font-mono font-semibold ${btc.change24h >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                {btc.change24h >= 0 ? '+' : ''}{btc.change24h.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/wallet" className="sv-stat hover:border-neon-green/30 transition-colors">
          <p className="sv-stat-label">Total Sats</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-neon-green">◇</span>
            <span className="sv-stat-value">{totalSats.toLocaleString()}</span>
          </div>
        </Link>

        <Link href="/transactions" className="sv-stat hover:border-neon-green/30 transition-colors">
          <p className="sv-stat-label">Transactions</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-neon-green">⟳</span>
            <span className="sv-stat-value">{txData?.total ?? 0}</span>
          </div>
        </Link>

        <div className="sv-stat">
          <p className="sv-stat-label">Network Fee</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-neon-green">⊘</span>
            <span className="sv-stat-value">12 <span className="text-sm text-cyber-muted">sat/vB</span></span>
          </div>
        </div>

        <Link href="/schedules" className="sv-stat hover:border-neon-green/30 transition-colors">
          <p className="sv-stat-label">Active Schedules</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-neon-green">⚙</span>
            <span className="sv-stat-value">{activeSchedules.length}</span>
          </div>
        </Link>
      </div>

      {/* ── Pending expense approvals ────────────────────────────────── */}
      {pendingExpenses.length > 0 && (
        <div className="sv-card overflow-hidden">
          <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-amber flex items-center justify-between">
            <span className="text-[11px] font-mono text-neon-amber uppercase tracking-[0.15em]">Needs Approval</span>
            <span className="text-[10px] font-mono text-cyber-muted">{pendingExpenses.length}</span>
          </div>
          <div className="divide-y divide-cyber-border/30">
            {pendingExpenses.map(exp => (
              <div key={exp.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                  <p className="text-[10px] font-mono text-cyber-muted mt-0.5">{exp.submitter.email}</p>
                </div>
                <p className="text-sm font-mono text-neon-amber shrink-0 font-semibold">
                  {BigInt(exp.amount).toLocaleString()} <span className="text-[10px] font-normal">SATS</span>
                </p>
                <div className="flex gap-2 shrink-0">
                  <NeonButton variant="green" size="sm"
                    loading={approveExpense.isPending}
                    onClick={() => approveExpense.mutate({ expenseId: exp.id, action: 'approve' })}>
                    APPROVE
                  </NeonButton>
                  <NeonButton variant="red" size="sm"
                    loading={approveExpense.isPending}
                    onClick={() => approveExpense.mutate({ expenseId: exp.id, action: 'reject' })}>
                    REJECT
                  </NeonButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Protocol Logs (transactions) ──────────────────────── */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-green flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-neon-green rounded-sm" />
            <span className="text-[11px] font-mono text-cyber-text uppercase tracking-[0.15em]">Recent Transactions</span>
          </div>
          <Link href="/transactions" className="text-[10px] font-mono text-neon-green hover:underline tracking-wider">View all</Link>
        </div>
        {recentTxs.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs font-mono text-cyber-muted">No transactions yet</p>
          </div>
        ) : (
          <div>
            {recentTxs.map((tx: any) => {
              const st = TX_STATUS[tx.status] || { label: `[${tx.status}]`, color: 'text-cyber-muted' };
              const isOutgoing = tx.type === 'SEND' || tx.type === 'PAYMENT';
              return (
                <div key={tx.id} className="sv-log-line hover:bg-cyber-surface/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-mono font-semibold ${st.color} shrink-0`}>{st.label}</span>
                    <span className="text-xs font-mono text-cyber-muted truncate">
                      TXID: {tx.txid ? `${tx.txid.slice(0, 4)}...${tx.txid.slice(-4)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-mono font-semibold ${isOutgoing ? 'text-neon-amber' : 'text-neon-green'}`}>
                      {isOutgoing ? '-' : '+'}{Number(tx.amountSats) >= 100_000
                        ? `${(Number(tx.amountSats) / 1e8).toFixed(5)} BTC`
                        : `${Number(tx.amountSats).toLocaleString()} sats`}
                    </span>
                    <span className="text-[10px] font-mono text-cyber-muted hidden sm:block">
                      {new Date(tx.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showQuickTransfer && (
        <QuickTransferModal wallets={wallets ?? []} onClose={() => setShowQuickTransfer(false)} />
      )}
      {showReceive && (
        <ReceiveModal wallets={wallets ?? []} onClose={() => setShowReceive(false)} />
      )}
    </div>
  );
}

/* ── RECIPIENT DASHBOARD ──────────────────────────────────────────────── */

function RecipientDashboard() {
  const { data: wallets, isLoading } = useWallets();
  const { data: expenses } = useExpenses();
  const { data: profile } = useRecipientProfile();
  const firstWalletId = wallets?.[0]?.id ?? null;
  useWalletSync(firstWalletId);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="LOADING_TERMINAL" /></div>;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="sv-section-header">
        <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">SYSTEM_STATUS: ACTIVE</p>
        <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight mt-1">RECIPIENT_TERMINAL</h1>
      </div>

      {/* Payment profile */}
      {profile ? (
        <div className="sv-card p-4 flex items-center justify-between">
          <div>
            <p className="sv-stat-label">PAYMENT_PROFILE</p>
            <p className="text-sm font-mono text-neon-green mt-1">{profile.label || 'ACTIVE'}</p>
            <p className="text-xs font-mono text-cyber-muted mt-0.5">{profile.network} · {profile.xpub.slice(0,12)}...{profile.xpub.slice(-8)}</p>
          </div>
          <Link href="/wallet">
            <NeonButton variant="ghost" size="sm">EDIT</NeonButton>
          </Link>
        </div>
      ) : (
        <div className="sv-card p-4 flex items-center justify-between border-l-2 border-l-neon-amber">
          <div>
            <p className="sv-stat-label">PAYMENT_PROFILE</p>
            <p className="text-sm font-mono text-neon-amber mt-1">NOT_CONFIGURED</p>
          </div>
          <Link href="/wallet">
            <NeonButton variant="amber" size="sm">SET UP</NeonButton>
          </Link>
        </div>
      )}

      {/* Wallets */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-green flex items-center justify-between">
          <span className="text-[11px] font-mono text-neon-green uppercase tracking-[0.15em]">MY_WALLETS</span>
          <Link href="/wallet" className="text-[10px] font-mono text-neon-green hover:underline tracking-wider">MANAGE</Link>
        </div>
        {!wallets?.length ? (
          <div className="px-4 py-6 text-center">
            <Link href="/wallet"><NeonButton variant="primary" size="sm">+ ADD WALLET</NeonButton></Link>
          </div>
        ) : (
          <div className="divide-y divide-cyber-border/30">
            {wallets.map(w => (
              <Link key={w.id} href={`/wallet/${w.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neon-green/5 transition-colors">
                <div>
                  <p className="text-sm font-mono text-cyber-text">{w.name}</p>
                  <p className="text-[10px] font-mono text-cyber-muted mt-0.5">{(w as any).addressType} · {w.network} · {w._count.utxos} UTXOs</p>
                </div>
                <span className="text-[10px] font-mono text-cyber-muted tracking-wider">VIEW →</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Expenses */}
      {expenses && expenses.length > 0 && (
        <div className="sv-card overflow-hidden">
          <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-amber flex items-center justify-between">
            <span className="text-[11px] font-mono text-neon-amber uppercase tracking-[0.15em]">EXPENSE_LOG</span>
            <Link href="/expenses" className="text-[10px] font-mono text-neon-green hover:underline tracking-wider">VIEW_ALL</Link>
          </div>
          <div className="divide-y divide-cyber-border/30">
            {expenses.slice(0, 5).map(exp => (
              <div key={exp.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                  <span className={`text-[10px] font-mono ${EXP_COLOR[exp.status] || 'text-cyber-muted'}`}>[{exp.status}]</span>
                </div>
                <p className="text-sm font-mono text-neon-amber shrink-0 ml-2 font-semibold">
                  {Number(exp.amount).toLocaleString()} <span className="text-[10px] font-normal">SATS</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────── */

export default function OverviewPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  if (status === 'loading') return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="INITIALIZING" /></div>;
  if (role === 'RECIPIENT') return <RecipientDashboard />;
  return <PayerDashboard />;
}
