'use client';

import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useWallets } from '@/hooks/use-wallet';
import { useSchedules } from '@/hooks/use-schedules';
import { useExpenses, useApproveExpense } from '@/hooks/use-expenses';
import { useTransactions } from '@/hooks/use-transactions';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { NeonButton } from '@/components/ui/neon-button';
import { useAutoSync } from '@/hooks/use-utxo-sync';

// ─── BTC price ───────────────────────────────────────────────────────────────

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
    queryFn: async () => {
      const r = await fetch('/api/recipients');
      return r.ok ? r.json() : [];
    },
  });
}

function useRecipientProfile() {
  return useQuery({
    queryKey: ['recipient-profile'],
    queryFn: async () => {
      const res = await fetch('/api/recipient/profile');
      return res.ok ? res.json() : null;
    },
  });
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const W = 200, H = 32;
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * W},${H - ((p - min) / range) * (H - 4) - 2}`).join(' ');
  const isUp = prices[prices.length - 1] >= prices[0];
  const c = isUp ? 'var(--color-neon-green)' : 'var(--color-neon-red)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

// ─── Status color maps ────────────────────────────────────────────────────────

const TX_COLOR: Record<string, string> = {
  CONFIRMED: 'text-neon-green',
  BROADCAST: 'text-neon-amber',
  DRAFT:     'text-cyber-muted',
  FAILED:    'text-neon-red',
};
const EXP_COLOR: Record<string, string> = {
  PENDING:  'text-neon-amber',
  APPROVED: 'text-neon-green',
  REJECTED: 'text-neon-red',
  PAID:     'text-cyber-muted',
};

// ─── PAYER ───────────────────────────────────────────────────────────────────

function PayerDashboard() {
  const { data: wallets, isLoading } = useWallets();
  const { data: schedules } = useSchedules();
  const { data: expenses } = useExpenses();
  const { data: txData } = useTransactions();
  const { data: btc } = useBtcData();
  const { data: recipients } = useRecipients();
  const approveExpense = useApproveExpense();

  // Auto-sync first wallet
  const firstWalletId = wallets?.[0]?.id ?? null;
  const { isSyncing, syncNow } = useAutoSync(firstWalletId);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;

  const activeSchedules = schedules?.filter(s => s.isActive) ?? [];
  const pendingExpenses = expenses?.filter(e => e.status === 'PENDING') ?? [];
  const recentTxs = txData?.transactions?.slice(0, 5) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">Overview</h1>
        <span className="text-xs text-cyber-muted font-mono">
          {isSyncing ? 'Syncing...' : (
            <button onClick={syncNow} className="hover:text-neon-green transition-colors">Sync</button>
          )}
        </span>
      </div>

      {/* BTC + stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* BTC price */}
        <div className="pp-card p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-cyber-muted font-mono mb-1">BTC</p>
          {btc ? (
            <>
              <p className="text-xl font-mono font-semibold text-cyber-text leading-tight">
                ${btc.price.toLocaleString()}
              </p>
              <p className={`text-xs font-mono mt-0.5 ${btc.change24h >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                {btc.change24h >= 0 ? '+' : ''}{btc.change24h.toFixed(2)}%
              </p>
              {btc.chartPrices && <div className="mt-2"><Sparkline prices={btc.chartPrices} /></div>}
            </>
          ) : (
            <p className="text-cyber-muted font-mono text-sm">—</p>
          )}
        </div>

        {/* Wallets */}
        <Link href="/wallet" className="pp-card p-3 hover:border-neon-green/40 transition-colors">
          <p className="text-xs text-cyber-muted font-mono mb-1">Wallets</p>
          <p className="text-2xl font-mono font-semibold text-neon-green">{wallets?.length ?? 0}</p>
          <p className="text-xs text-cyber-muted font-mono mt-0.5">
            {wallets?.reduce((s, w) => s + w._count.utxos, 0) ?? 0} UTXOs
          </p>
        </Link>

        {/* Schedules */}
        <Link href="/schedules" className="pp-card p-3 hover:border-neon-green/40 transition-colors">
          <p className="text-xs text-cyber-muted font-mono mb-1">Schedules</p>
          <p className="text-2xl font-mono font-semibold text-neon-green">{activeSchedules.length}</p>
          <p className="text-xs text-cyber-muted font-mono mt-0.5">{schedules?.length ?? 0} total</p>
        </Link>

        {/* Pending expenses */}
        <Link href="/expenses" className="pp-card p-3 hover:border-neon-amber/40 transition-colors">
          <p className="text-xs text-cyber-muted font-mono mb-1">Pending</p>
          <p className={`text-2xl font-mono font-semibold ${pendingExpenses.length > 0 ? 'text-neon-amber' : 'text-cyber-muted'}`}>
            {pendingExpenses.length}
          </p>
          <p className="text-xs text-cyber-muted font-mono mt-0.5">{expenses?.length ?? 0} total</p>
        </Link>
      </div>

      {/* Pending expense approvals */}
      {pendingExpenses.length > 0 && (
        <div className="pp-card">
          <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
            <span className="text-xs font-mono text-neon-amber uppercase tracking-wider">Pending Approval</span>
            <span className="text-xs font-mono text-cyber-muted">{pendingExpenses.length}</span>
          </div>
          <div className="divide-y divide-cyber-border/40">
            {pendingExpenses.map(exp => (
              <div key={exp.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                  <p className="text-xs font-mono text-cyber-muted mt-0.5">{exp.submitter.email}</p>
                </div>
                <p className="text-sm font-mono text-neon-amber shrink-0">
                  {BigInt(exp.amount).toLocaleString()} sats
                </p>
                <div className="flex gap-2 shrink-0">
                  <NeonButton
                    variant="green" size="sm"
                    loading={approveExpense.isPending}
                    onClick={() => approveExpense.mutate({ expenseId: exp.id, action: 'approve' })}
                  >
                    Approve
                  </NeonButton>
                  <NeonButton
                    variant="red" size="sm"
                    loading={approveExpense.isPending}
                    onClick={() => approveExpense.mutate({ expenseId: exp.id, action: 'reject' })}
                  >
                    Reject
                  </NeonButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallets + Recipients row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* My wallets */}
        <div className="pp-card">
          <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
            <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">My Wallets</span>
            <Link href="/wallet" className="text-xs font-mono text-neon-green hover:underline">Manage</Link>
          </div>
          {!wallets?.length ? (
            <div className="px-4 py-4">
              <Link href="/wallet">
                <NeonButton variant="green" size="sm">Create Wallet</NeonButton>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-cyber-border/30">
              {wallets.map(w => (
                <Link key={w.id} href={`/wallet/${w.id}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-neon-green/5 transition-colors">
                  <div>
                    <p className="text-sm font-mono text-cyber-text">{w.name}</p>
                    <p className="text-xs font-mono text-cyber-muted">{w.network} · {w._count.utxos} UTXOs</p>
                  </div>
                  <span className="text-xs font-mono text-cyber-muted">View</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recipients */}
        <div className="pp-card">
          <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
            <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">Recipients</span>
            <Link href="/wallet" className="text-xs font-mono text-neon-green hover:underline">View all</Link>
          </div>
          {!recipients?.length ? (
            <p className="px-4 py-4 text-xs font-mono text-cyber-muted">None configured</p>
          ) : (
            <div className="divide-y divide-cyber-border/30">
              {recipients.slice(0, 4).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm font-mono text-cyber-text truncate">{r.label || r.email}</p>
                  <span className="text-xs font-mono text-cyber-muted uppercase shrink-0 ml-2">{r.network}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      {recentTxs.length > 0 && (
        <div className="pp-card">
          <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
            <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">Recent Transactions</span>
            <Link href="/transactions" className="text-xs font-mono text-neon-green hover:underline">All</Link>
          </div>
          <div className="divide-y divide-cyber-border/30">
            {recentTxs.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${TX_COLOR[tx.status] || 'text-cyber-muted'}`}>
                    {tx.status}
                  </span>
                  <span className="text-xs font-mono text-cyber-muted">{tx.type}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-neon-amber">{BigInt(tx.amountSats).toLocaleString()} sats</p>
                  <p className="text-xs text-cyber-muted/60 font-mono">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RECIPIENT ────────────────────────────────────────────────────────────────

function RecipientDashboard() {
  const { data: wallets, isLoading } = useWallets();
  const { data: expenses } = useExpenses();
  const { data: profile } = useRecipientProfile();

  const firstWalletId = wallets?.[0]?.id ?? null;
  useAutoSync(firstWalletId);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">Overview</h1>

      {/* Payment profile status */}
      {profile && (
        <div className="pp-card px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-cyber-muted uppercase tracking-wider mb-0.5">Payment Profile</p>
            <p className="text-sm font-mono text-neon-green">{profile.label || 'Active'}</p>
            <p className="text-xs font-mono text-cyber-muted">{profile.network} · {profile.xpub.slice(0,12)}...{profile.xpub.slice(-8)}</p>
          </div>
          <Link href="/wallet">
            <NeonButton variant="ghost" size="sm">Edit</NeonButton>
          </Link>
        </div>
      )}
      {!profile && (
        <div className="pp-card px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-cyber-muted uppercase tracking-wider mb-0.5">Payment Profile</p>
            <p className="text-sm font-mono text-neon-amber">Not configured</p>
          </div>
          <Link href="/wallet">
            <NeonButton variant="amber" size="sm">Set up</NeonButton>
          </Link>
        </div>
      )}

      {/* Wallets */}
      <div className="pp-card">
        <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
          <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">
            My Wallets <span className="text-cyber-muted/50">({wallets?.length ?? 0}/3)</span>
          </span>
          <Link href="/wallet" className="text-xs font-mono text-neon-green hover:underline">Manage</Link>
        </div>
        {!wallets?.length ? (
          <div className="px-4 py-4">
            <Link href="/wallet"><NeonButton variant="green" size="sm">Add Wallet</NeonButton></Link>
          </div>
        ) : (
          <div className="divide-y divide-cyber-border/30">
            {wallets.map(w => (
              <Link key={w.id} href={`/wallet/${w.id}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-neon-green/5 transition-colors">
                <div>
                  <p className="text-sm font-mono text-cyber-text">{w.name}</p>
                  <p className="text-xs font-mono text-cyber-muted">{(w as any).addressType} · {w.network} · {w._count.utxos} UTXOs</p>
                </div>
                <span className="text-xs font-mono text-cyber-muted">View</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent expenses */}
      {expenses && expenses.length > 0 && (
        <div className="pp-card">
          <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
            <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">Expenses</span>
            <Link href="/expenses" className="text-xs font-mono text-neon-green hover:underline">All</Link>
          </div>
          <div className="divide-y divide-cyber-border/30">
            {expenses.slice(0, 5).map(exp => (
              <div key={exp.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                  <span className={`text-xs font-mono ${EXP_COLOR[exp.status] || 'text-cyber-muted'}`}>{exp.status}</span>
                </div>
                <p className="text-xs font-mono text-neon-amber shrink-0 ml-2">
                  {Number(exp.amount).toLocaleString()} sats
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;

  if (status === 'loading') return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;
  if (role === 'RECIPIENT') return <RecipientDashboard />;
  return <PayerDashboard />;
}
