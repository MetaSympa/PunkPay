'use client';

import { useState } from 'react';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'next-auth/react';

const TX_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-cyber-muted',
  SIGNED: 'text-neon-blue',
  BROADCAST: 'text-neon-amber',
  CONFIRMED: 'text-neon-green',
  FAILED: 'text-neon-red',
  REPLACED: 'text-neon-purple',
};

function useRecipientTransactions() {
  return useQuery({
    queryKey: ['recipient-transactions'],
    queryFn: async () => {
      const res = await fetch('/api/recipient/transactions');
      if (!res.ok) return [];
      const data = await res.json();
      return data.transactions ?? [];
    },
  });
}

function useRecipientProfile() {
  return useQuery({
    queryKey: ['recipient-profile'],
    queryFn: async () => {
      const res = await fetch('/api/recipient/profile');
      if (!res.ok) return null;
      return res.json();
    },
  });
}

function useWallets() {
  return useQuery({
    queryKey: ['recipient-wallets'],
    queryFn: async () => {
      const res = await fetch('/api/wallet');
      if (!res.ok) return [];
      const data = await res.json();
      return data.wallets ?? [];
    },
  });
}

function useSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { toAddress: string; amountSats: string; walletId: string; feeRate: string }) => {
      const res = await fetch('/api/recipient/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, amountSats: parseInt(data.amountSats), feeRate: parseInt(data.feeRate) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Send failed');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipient-transactions'] }),
  });
}

function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { xpub: string; network: string; label?: string }) => {
      const res = await fetch('/api/recipient/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save profile');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipient-profile'] }),
  });
}

function SendModal({ wallets, onClose }: { wallets: any[]; onClose: () => void }) {
  const send = useSend();
  const seededWallets = wallets.filter((w: any) => w.hasSeed);
  const [form, setForm] = useState({
    toAddress: '',
    amountSats: '',
    feeRate: '5',
    walletId: seededWallets[0]?.id ?? '',
  });
  const [txid, setTxid] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await send.mutateAsync(form);
      setTxid(result.txid);
    } catch { /* error shown via send.error */ }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <TerminalCard title="send bitcoin" variant="amber" className="w-full max-w-md">
        {txid ? (
          <div className="space-y-4">
            <p className="text-neon-green font-mono text-sm">✓ Broadcast successful</p>
            <div>
              <p className="text-xs text-cyber-muted uppercase tracking-wider mb-1">Txid</p>
              <a
                href={`https://mutinynet.com/tx/${txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-neon-amber break-all hover:text-neon-amber/70 transition-colors"
              >
                {txid}
              </a>
            </div>
            <NeonButton variant="amber" onClick={onClose} className="w-full">Close</NeonButton>
          </div>
        ) : seededWallets.length === 0 ? (
          <div className="space-y-4">
            <p className="text-neon-red text-sm font-mono">No hot wallet found. Import a wallet with a seed to send.</p>
            <NeonButton variant="ghost" onClick={onClose} className="w-full">Close</NeonButton>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {seededWallets.length > 1 && (
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">From Wallet</label>
                <select
                  value={form.walletId}
                  onChange={e => setForm({ ...form, walletId: e.target.value })}
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono text-sm focus:border-neon-amber focus:outline-none"
                >
                  {seededWallets.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">To Address</label>
              <input
                type="text"
                value={form.toAddress}
                onChange={e => setForm({ ...form, toAddress: e.target.value })}
                placeholder="tb1p… or bc1p…"
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Amount (sats)</label>
                <input
                  type="number"
                  value={form.amountSats}
                  onChange={e => setForm({ ...form, amountSats: e.target.value })}
                  min="546"
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono text-sm focus:border-neon-amber focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Fee (sat/vB)</label>
                <input
                  type="number"
                  value={form.feeRate}
                  onChange={e => setForm({ ...form, feeRate: e.target.value })}
                  min="1"
                  max="1000"
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-text font-mono text-sm focus:border-neon-amber focus:outline-none"
                />
              </div>
            </div>
            {send.error && (
              <p className="text-neon-red text-xs font-mono">{(send.error as Error).message}</p>
            )}
            <div className="flex gap-3">
              <NeonButton type="submit" variant="amber" loading={send.isPending} className="flex-1">
                Send
              </NeonButton>
              <NeonButton type="button" variant="ghost" onClick={onClose} className="flex-1">
                Cancel
              </NeonButton>
            </div>
          </form>
        )}
      </TerminalCard>
    </div>
  );
}

export default function RecipientPage() {
  const { data: txs, isLoading: txsLoading } = useRecipientTransactions();
  const { data: profile, isLoading: profileLoading } = useRecipientProfile();
  const { data: wallets = [] } = useWallets();
  const saveProfile = useSaveProfile();

  const [showSend, setShowSend] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [xpubInput, setXpubInput] = useState('');
  const [networkInput, setNetworkInput] = useState('signet');
  const [labelInput, setLabelInput] = useState('');
  const [profileMsg, setProfileMsg] = useState('');

  const seededWallets = (wallets as any[]).filter(w => w.hasSeed);

  const totalReceived = (txs ?? [])
    .filter((tx: any) => tx.status === 'CONFIRMED')
    .reduce((sum: bigint, tx: any) => sum + BigInt(tx.amountSats), 0n);

  const pendingTotal = (txs ?? [])
    .filter((tx: any) => tx.status === 'BROADCAST')
    .reduce((sum: bigint, tx: any) => sum + BigInt(tx.amountSats), 0n);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg('');
    try {
      await saveProfile.mutateAsync({ xpub: xpubInput.trim(), network: networkInput, label: labelInput });
      setProfileMsg('Profile saved.');
      setXpubInput('');
      setShowProfileForm(false);
    } catch (err: any) {
      setProfileMsg(`Error: ${err.message}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <GlitchText text="RECIPIENT PORTAL" as="h1" className="text-2xl font-bold text-neon-amber" />
          <p className="text-cyber-muted text-xs mt-0.5 terminal-prompt">receive & send bitcoin</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-cyber-muted hover:text-neon-red font-mono text-xs transition-colors"
        >
          sign out
        </button>
      </div>

      {/* Balance + Send */}
      <TerminalCard title="balance" variant="amber">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-mono font-bold text-neon-amber">
              {totalReceived.toLocaleString()}
              <span className="text-base font-normal text-cyber-muted ml-2">sats confirmed</span>
            </p>
            {pendingTotal > 0n && (
              <p className="text-xs text-neon-amber/60 font-mono mt-1">
                + {pendingTotal.toLocaleString()} sats pending
              </p>
            )}
          </div>
          {seededWallets.length > 0 && (
            <NeonButton variant="amber" onClick={() => setShowSend(true)}>
              Send →
            </NeonButton>
          )}
        </div>
      </TerminalCard>

      {/* Received Transactions */}
      <TerminalCard title={`received payments (${txs?.length ?? 0})`} variant="amber">
        {txsLoading ? (
          <LoadingSpinner text="Scanning" />
        ) : txs?.length === 0 ? (
          <p className="text-center py-6 text-cyber-muted text-sm">No payments received yet</p>
        ) : (
          <div>
            {txs?.map((tx: any) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2.5 border-b border-cyber-border/20 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono ${TX_STATUS_COLORS[tx.status] ?? 'text-cyber-muted'}`}>
                    {tx.status}
                  </span>
                  {tx.txid && (
                    <a
                      href={`https://mutinynet.com/tx/${tx.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-cyber-muted hover:text-neon-amber transition-colors"
                    >
                      {tx.txid.slice(0, 8)}…{tx.txid.slice(-6)}
                    </a>
                  )}
                  {tx.expenseDescription && (
                    <span className="text-xs text-neon-green/70 font-mono">[{tx.expenseDescription}]</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-neon-amber">
                    {BigInt(tx.amountSats).toLocaleString()} <span className="text-cyber-muted text-xs">sats</span>
                  </p>
                  <p className="text-xs text-cyber-muted">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </TerminalCard>

      {/* Payment Profile */}
      <TerminalCard title="payment profile" variant="amber">
        {profileLoading ? (
          <LoadingSpinner text="Loading" />
        ) : (
          <div>
            <div className="flex items-center justify-between">
              {profile ? (
                <div>
                  <p className="text-xs text-neon-green font-mono">✓ Active — {profile.label || profile.network}</p>
                  <p className="font-mono text-xs text-cyber-muted mt-0.5">
                    {profile.xpub?.slice(0, 16)}…{profile.xpub?.slice(-8)}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-cyber-muted font-mono">No xpub set — payers cannot find your address</p>
              )}
              <button
                onClick={() => setShowProfileForm(!showProfileForm)}
                className="text-xs font-mono text-neon-amber hover:text-neon-amber/70 transition-colors ml-4"
              >
                {showProfileForm ? 'cancel' : profile ? 'update' : 'set xpub'}
              </button>
            </div>

            {showProfileForm && (
              <form onSubmit={handleSaveProfile} className="mt-4 space-y-3 border-t border-cyber-border pt-4">
                <div>
                  <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={labelInput}
                    onChange={e => setLabelInput(e.target.value)}
                    placeholder="e.g., My Sparrow Wallet"
                    className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-text font-mono text-sm focus:border-neon-amber focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Network</label>
                    <select
                      value={networkInput}
                      onChange={e => setNetworkInput(e.target.value)}
                      className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono text-sm focus:border-neon-amber focus:outline-none"
                    >
                      <option value="signet">signet</option>
                      <option value="mainnet">mainnet</option>
                      <option value="testnet">testnet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">xpub</label>
                    <input
                      type="text"
                      value={xpubInput}
                      onChange={e => setXpubInput(e.target.value)}
                      placeholder="xpub… or tpub…"
                      className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none"
                      required
                    />
                  </div>
                </div>
                {profileMsg && (
                  <p className={`text-xs font-mono ${profileMsg.startsWith('Error') ? 'text-neon-red' : 'text-neon-green'}`}>
                    {profileMsg}
                  </p>
                )}
                <NeonButton type="submit" variant="amber" loading={saveProfile.isPending} className="w-full">
                  Save Profile
                </NeonButton>
              </form>
            )}
          </div>
        )}
      </TerminalCard>

      {/* Send Modal */}
      {showSend && <SendModal wallets={wallets as any[]} onClose={() => setShowSend(false)} />}
    </div>
  );
}
