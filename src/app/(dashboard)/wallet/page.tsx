'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import {
  useWallets, useImportWallet, useDeleteWallet, useCreateWalletFromSeed,
} from '@/hooks/use-wallet';
import { useWalletSync } from '@/hooks/use-wallet-sync';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import Link from 'next/link';

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatRelative(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function useRecipientProfile() {
  return useQuery({
    queryKey: ['recipient-profile'],
    queryFn: async () => { const res = await fetch('/api/recipient/profile'); return res.ok ? res.json() : null; },
  });
}

function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { xpub?: string; walletId?: string; network?: string; label?: string }) => {
      const res = await fetch('/api/recipient/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipient-profile'] }),
  });
}

function useRecipients() {
  return useQuery({
    queryKey: ['recipients'],
    queryFn: async () => { const res = await fetch('/api/recipients'); return res.ok ? res.json() : []; },
  });
}

/* ── Wallet Card ─────────────────────────────────────────────────────── */

function WalletCard({ wallet, onDelete, deleting }: { wallet: any; onDelete: () => void; deleting: boolean }) {
  const { isSyncing, lastSyncedAt, syncNow } = useWalletSync(wallet.id);

  const satsDisplay = (s: string | undefined) => {
    if (!s) return '—';
    const n = BigInt(s);
    return n === 0n ? '0' : n.toLocaleString();
  };

  const btcDisplay = (s: string | undefined) => {
    if (!s) return '0.00000000';
    return (Number(s) / 1e8).toFixed(8);
  };

  const syncStatus = isSyncing ? 'SYNCING...' : lastSyncedAt ? `SYNCED_${formatRelative(lastSyncedAt).toUpperCase().replace(/\s/g, '_')}` : null;

  return (
    <div className="sv-card overflow-hidden">
      {/* Sync progress bar */}
      {isSyncing && (
        <div className="h-0.5 w-full overflow-hidden bg-cyber-border">
          <div className="h-full bg-neon-green" style={{ width: '40%', animation: 'scan-line 1.4s ease-in-out infinite' }} />
        </div>
      )}

      {/* Header */}
      <div className="px-5 py-4 border-b border-cyber-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Wallet icon */}
          <div className="w-10 h-10 rounded-lg bg-cyber-surface border border-cyber-border flex items-center justify-center">
            <span className="text-neon-green text-lg">₿</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-cyber-text font-semibold uppercase">{wallet.name.replace(/\s/g, '_')}</span>
              {wallet.hasSeed && (
                <span className="text-[10px] font-mono text-neon-green border border-neon-green/30 rounded px-1.5 py-0.5 bg-neon-green/5 tracking-wider">HOT</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-mono text-cyber-muted tracking-wider">
                {wallet.addressType === 'P2WPKH' ? 'P2WPKH' : 'P2TR'} · {wallet.network.toUpperCase()}
              </span>
              {syncStatus && (
                <span className="text-[10px] font-mono text-cyber-muted">
                  ■ <span className={isSyncing ? 'text-neon-amber' : 'text-neon-green'}>{syncStatus}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-mono font-bold text-cyber-text">{btcDisplay(wallet.balance)}</p>
          <p className="text-[10px] font-mono text-cyber-muted tracking-wider">BTC</p>
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="sv-stat-label">BALANCE</p>
          <p className="text-sm font-mono text-neon-green mt-0.5">{satsDisplay(wallet.balance)} <span className="text-[10px] text-cyber-muted">SATS</span></p>
        </div>
        <div>
          <p className="sv-stat-label">CONFIRMED</p>
          <p className="text-sm font-mono text-cyber-text mt-0.5">{satsDisplay(wallet.confirmedBalance)} <span className="text-[10px] text-cyber-muted">SATS</span></p>
        </div>
        <div>
          <p className="sv-stat-label">UTXOS</p>
          <p className="text-sm font-mono text-cyber-text mt-0.5">{wallet._count.utxos}</p>
        </div>
        <div>
          <p className="sv-stat-label">xPub</p>
          <p className="text-xs font-mono text-cyber-muted mt-0.5">{wallet.xpubFingerprint}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-cyber-border/50 flex gap-2 flex-wrap">
        <Link href={`/wallet/${wallet.id}`}>
          <NeonButton variant="green" size="sm">Details</NeonButton>
        </Link>
        <NeonButton variant="ghost" size="sm" onClick={syncNow} loading={isSyncing}>
          {isSyncing ? 'Syncing...' : 'Sync'}
        </NeonButton>
        <div className="flex-1" />
        <NeonButton variant="red" size="sm"
          onClick={() => { if (confirm('Delete this wallet? This cannot be undone.')) onDelete(); }}
          loading={deleting}>
          Delete
        </NeonButton>
      </div>
    </div>
  );
}

/* ── Add Wallet Modal ────────────────────────────────────────────────── */

type ModalMode = 'xpub' | 'seed-generate' | 'seed-import';

function AddWalletModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<ModalMode>('xpub');
  const importWallet = useImportWallet();
  const createFromSeed = useCreateWalletFromSeed();

  const [xName, setXName] = useState('');
  const [xKey, setXKey] = useState('');
  const [xNetwork, setXNetwork] = useState('mainnet');
  const [xErr, setXErr] = useState('');

  const [sName, setSName] = useState('');
  const [sNetwork, setSNetwork] = useState('mainnet');
  const [mnemonic, setMnemonic] = useState('');
  const [imported, setImported] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [backedUp, setBackedUp] = useState(false);
  const [sErr, setSErr] = useState('');
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/wallet/generate-mnemonic');
      const d = await res.json();
      setMnemonic(d.mnemonic); setBackedUp(false);
    } catch { setSErr('GENERATION_FAILED'); } finally { setGenerating(false); }
  }

  async function handleXpub(e: React.FormEvent) {
    e.preventDefault(); setXErr('');
    try {
      await importWallet.mutateAsync({ name: xName, xpub: xKey.trim(), network: xNetwork, addressType: 'P2TR' });
      onClose();
    } catch (err: any) { setXErr(err.message); }
  }

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault(); setSErr('');
    const phrase = mode === 'seed-generate' ? mnemonic : imported;
    if (!phrase) { setSErr('PROVIDE_SEED_PHRASE'); return; }
    try {
      await createFromSeed.mutateAsync({ name: sName, mnemonic: phrase, network: sNetwork, passphrase: passphrase || undefined });
      onClose();
    } catch (err: any) { setSErr(err.message); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-cyber-bg/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sv-card w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[92vh] overflow-y-auto">
        {/* Tabs */}
        <div className="flex border-b border-cyber-border">
          {([
            { id: 'xpub' as ModalMode, label: 'Watch-only' },
            { id: 'seed-generate' as ModalMode, label: 'New Wallet' },
            { id: 'seed-import' as ModalMode, label: 'Import Wallet' },
          ]).map(t => (
            <button key={t.id} onClick={() => { setMode(t.id); setSErr(''); setXErr(''); }}
              className={`flex-1 py-3 text-[10px] font-mono tracking-wider transition-all ${
                mode === t.id ? 'text-cyber-bg bg-neon-green font-semibold' : 'text-cyber-muted hover:text-cyber-text'
              }`}>
              {t.label}
            </button>
          ))}
          <button onClick={onClose} className="px-4 text-cyber-muted hover:text-cyber-text font-mono text-sm">✕</button>
        </div>

        <div className="p-5">
          {/* Import xpub */}
          {mode === 'xpub' && (
            <form onSubmit={handleXpub} className="space-y-4">
              <div>
                <label className="sv-label">NAME</label>
                <input type="text" value={xName} onChange={e => setXName(e.target.value)}
                  className="sv-input" placeholder="MY_SPARROW_WALLET" required />
              </div>
              <div>
                <label className="sv-label">XPUB / TPUB</label>
                <textarea value={xKey} onChange={e => setXKey(e.target.value)}
                  className="sv-input h-20 resize-none" placeholder="xpub..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="sv-label">NETWORK</label>
                  <select value={xNetwork} onChange={e => setXNetwork(e.target.value)} className="sv-input">
                    <option value="mainnet">MAINNET</option>
                    <option value="signet">SIGNET</option>
                    <option value="testnet">TESTNET</option>
                  </select>
                </div>
                <div>
                  <label className="sv-label">TYPE</label>
                  <div className="sv-input text-neon-green/70 select-none cursor-default">P2TR — Taproot</div>
                </div>
              </div>
              {xErr && <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">[ERROR] {xErr}</div>}
              <NeonButton type="submit" variant="primary" className="w-full" loading={importWallet.isPending}>
                IMPORT WALLET
              </NeonButton>
            </form>
          )}

          {/* New seed */}
          {mode === 'seed-generate' && (
            <form onSubmit={handleSeed} className="space-y-4">
              <NeonButton type="button" variant="primary" className="w-full" onClick={generate} loading={generating}>
                {mnemonic ? 'REGENERATE' : 'GENERATE SEED PHRASE'}
              </NeonButton>
              {mnemonic && (
                <>
                  <div className="grid grid-cols-3 gap-2 p-3 bg-cyber-bg border border-neon-green/20 rounded">
                    {mnemonic.split(' ').map((word, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-cyber-muted text-[10px] w-4 text-right shrink-0">{i + 1}</span>
                        <span className="text-neon-green font-mono text-sm">{word}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-neon-red text-xs font-mono border border-neon-red/20 bg-neon-red/5 rounded px-3 py-2">
                    [WARNING] WRITE THESE 12 WORDS OFFLINE. NEVER SHARE THEM.
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} className="accent-[#00FF41]" />
                    <span className="text-xs font-mono text-cyber-muted">I have backed up my seed phrase offline</span>
                  </label>
                </>
              )}
              <div>
                <label className="sv-label">WALLET_NAME</label>
                <input type="text" value={sName} onChange={e => setSName(e.target.value)}
                  className="sv-input" placeholder="MY_WALLET" required />
              </div>
              <div>
                <label className="sv-label">NETWORK</label>
                <select value={sNetwork} onChange={e => setSNetwork(e.target.value)} className="sv-input">
                  <option value="signet">SIGNET</option>
                  <option value="testnet">TESTNET</option>
                  <option value="mainnet">MAINNET</option>
                </select>
              </div>
              {sErr && <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">[ERROR] {sErr}</div>}
              <NeonButton type="submit" variant="primary" className="w-full"
                loading={createFromSeed.isPending} disabled={!backedUp || !sName || !mnemonic}>
                CREATE WALLET
              </NeonButton>
            </form>
          )}

          {/* Import seed */}
          {mode === 'seed-import' && (
            <form onSubmit={handleSeed} className="space-y-4">
              <div>
                <label className="sv-label">SEED_PHRASE (12 OR 24 WORDS)</label>
                <textarea value={imported} onChange={e => setImported(e.target.value)}
                  className="sv-input h-20 resize-none" placeholder="word1 word2 word3 ..." />
              </div>
              <div>
                <label className="sv-label">WALLET_NAME</label>
                <input type="text" value={sName} onChange={e => setSName(e.target.value)}
                  className="sv-input" placeholder="MY_WALLET" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="sv-label">NETWORK</label>
                  <select value={sNetwork} onChange={e => setSNetwork(e.target.value)} className="sv-input">
                    <option value="signet">SIGNET</option>
                    <option value="testnet">TESTNET</option>
                    <option value="mainnet">MAINNET</option>
                  </select>
                </div>
                <div>
                  <label className="sv-label">PASSPHRASE</label>
                  <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)}
                    className="sv-input" placeholder="Optional" />
                </div>
              </div>
              {sErr && <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">[ERROR] {sErr}</div>}
              <NeonButton type="submit" variant="primary" className="w-full"
                loading={createFromSeed.isPending} disabled={!sName || !imported}>
                IMPORT WALLET
              </NeonButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Recipient wallet page ───────────────────────────────────────────── */

function RecipientWalletPage() {
  const { data: wallets, isLoading } = useWallets();
  const deleteWallet = useDeleteWallet();
  const { data: profile } = useRecipientProfile();
  const saveProfile = useSaveProfile();
  const [showAdd, setShowAdd] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileForm, setProfileForm] = useState({ xpub: '', network: 'mainnet', label: '' });
  const [profileMsg, setProfileMsg] = useState('');
  const maxReached = (wallets?.length ?? 0) >= 3;

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="LOADING_NODES" /></div>;

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault(); setProfileMsg('');
    try {
      await saveProfile.mutateAsync({ xpub: profileForm.xpub.trim(), network: profileForm.network, label: profileForm.label });
      setProfileMsg('SAVED'); setShowProfileForm(false); setProfileForm({ xpub: '', network: 'mainnet', label: '' });
    } catch (err: any) { setProfileMsg(`ERROR: ${err.message}`); }
  }

  async function handleUseWallet(walletId: string, walletLabel: string) {
    setProfileMsg('');
    try {
      await saveProfile.mutateAsync({ walletId, label: walletLabel || 'Wallet Profile' } as any);
      setProfileMsg('LINKED'); setShowProfileForm(false);
    } catch (err: any) { setProfileMsg(`ERROR: ${err.message}`); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="sv-section-header">
          <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">Wallets</p>
          <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight mt-1">
            My Wallets
          </h1>
        </div>
        <NeonButton variant="primary" size="sm" onClick={() => setShowAdd(true)} disabled={maxReached}>
          {maxReached ? 'MAX_REACHED' : '+ ADD NODE'}
        </NeonButton>
      </div>

      {!wallets?.length ? (
        <div className="sv-card px-4 py-10 text-center">
          <p className="text-cyber-muted font-mono text-sm mb-4">NO_WALLETS_FOUND</p>
          <NeonButton variant="primary" onClick={() => setShowAdd(true)}>+ ADD WALLET</NeonButton>
        </div>
      ) : (
        <div className="space-y-4">
          {wallets.map(w => (
            <div key={w.id} className="space-y-1">
              <WalletCard wallet={w} onDelete={() => deleteWallet.mutate(w.id)} deleting={deleteWallet.isPending} />
              <NeonButton variant="ghost" size="sm" onClick={() => handleUseWallet(w.id, (w as any).label || w.name || '')}
                loading={saveProfile.isPending} className="ml-4 text-[10px]">
                ⚡ USE_AS_PAYMENT_PROFILE
              </NeonButton>
            </div>
          ))}
        </div>
      )}


      {/* Payment profile */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-amber flex items-center justify-between">
          <span className="text-[11px] font-mono text-neon-amber uppercase tracking-[0.15em]">Receive Profile</span>
          <NeonButton variant="ghost" size="sm" onClick={() => { setShowProfileForm(v => !v); setProfileMsg(''); }}>
            {showProfileForm ? 'CANCEL' : profile ? 'UPDATE' : 'SET UP'}
          </NeonButton>
        </div>
        {profile && !showProfileForm && (
          <div className="px-4 py-3 space-y-1.5">
            {profile.label && <p className="text-sm font-mono text-cyber-text">{profile.label}</p>}
            <p className="text-[10px] font-mono text-neon-amber uppercase tracking-wider">{profile.network}</p>
            <p className="text-xs font-mono text-cyber-muted break-all">{profile.xpub.slice(0, 20)}...{profile.xpub.slice(-10)}</p>
          </div>
        )}
        {!profile && !showProfileForm && (
          <p className="px-4 py-4 text-xs font-mono text-cyber-muted">
            Link your xPub to auto-rotate receive addresses with each payment
          </p>
        )}
        {showProfileForm && (
          <form onSubmit={handleSaveProfile} className="p-4 space-y-3">
            <div>
              <label className="sv-label">YOUR_XPUB</label>
              <textarea value={profileForm.xpub} onChange={e => setProfileForm(f => ({ ...f, xpub: e.target.value }))}
                className="sv-input h-20 resize-none" placeholder="xpub... or tpub..." required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="sv-label">NETWORK</label>
                <select value={profileForm.network} onChange={e => setProfileForm(f => ({ ...f, network: e.target.value }))} className="sv-input">
                  <option value="mainnet">MAINNET</option><option value="signet">SIGNET</option><option value="testnet">TESTNET</option>
                </select>
              </div>
              <div>
                <label className="sv-label">LABEL</label>
                <input type="text" value={profileForm.label} onChange={e => setProfileForm(f => ({ ...f, label: e.target.value }))}
                  className="sv-input" placeholder="Optional" />
              </div>
            </div>
            {profileMsg && <p className={`text-xs font-mono ${profileMsg.startsWith('ERROR') ? 'text-neon-red' : 'text-neon-green'}`}>[{profileMsg}]</p>}
            <NeonButton type="submit" variant="primary" className="w-full" loading={saveProfile.isPending}>SAVE PROFILE</NeonButton>
          </form>
        )}
      </div>

      {showAdd && <AddWalletModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

/* ── Payer wallet page ───────────────────────────────────────────────── */

function PayerWalletPage() {
  const { data: wallets, isLoading } = useWallets();
  const { data: recipients } = useRecipients();
  const deleteWallet = useDeleteWallet();
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<'wallet' | 'recipients'>('wallet');

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="LOADING_NODES" /></div>;

  // Total value
  const totalBtc = wallets?.reduce((s, w) => s + Number(w.balance || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="sv-section-header">
          <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">Wallets</p>
          <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight mt-1">My Wallets</h1>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">TOTAL_VALUE: {(totalBtc / 1e8).toFixed(6)} BTC</p>
          <p className="text-[10px] text-cyber-muted font-mono tracking-wider mt-0.5">
            {(totalBtc / 1e8).toFixed(6)} BTC total
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-cyber-border">
        {([
          { id: 'wallet' as const, label: 'My Wallets' },
          { id: 'recipients' as const, label: `Recipients (${recipients?.length ?? 0})` },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-mono tracking-wider transition-all ${
              tab === t.id
                ? 'text-cyber-bg bg-neon-green font-semibold rounded-t -mb-px'
                : 'text-cyber-muted hover:text-cyber-text'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wallet' && (
        <div className="space-y-4">
          {!wallets?.length ? (
            <div className="sv-card px-4 py-10 text-center space-y-4">
              <p className="text-cyber-muted font-mono text-sm">NO_FUNDING_WALLET</p>
              <NeonButton variant="primary" onClick={() => setShowAdd(true)}>+ CREATE WALLET</NeonButton>
            </div>
          ) : (
            wallets.map(w => (
              <WalletCard key={w.id} wallet={w} onDelete={() => deleteWallet.mutate(w.id)} deleting={deleteWallet.isPending} />
            ))
          )}
          {wallets && wallets.length > 0 && (
            <NeonButton variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
              + ADD_ANOTHER_WALLET
            </NeonButton>
          )}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="space-y-3">
          {!recipients?.length ? (
            <div className="sv-card px-4 py-8 text-center">
              <p className="text-cyber-muted font-mono text-sm">NO_RECIPIENTS_CONFIGURED</p>
            </div>
          ) : (
            recipients.map((r: any) => (
              <div key={r.id} className="sv-card overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-cyber-surface border border-cyber-border flex items-center justify-center">
                      <span className="text-neon-amber text-sm">⚡</span>
                    </div>
                    <div>
                      <p className="font-mono text-sm text-cyber-text font-semibold">{r.label || r.email}</p>
                      <p className="text-[10px] font-mono text-cyber-muted mt-0.5">{r.email}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-neon-amber uppercase tracking-wider border border-neon-amber/30 rounded px-2 py-0.5">{r.network}</span>
                </div>
                <div className="px-5 pb-4">
                  <p className="text-xs font-mono text-cyber-muted break-all">{r.xpub.slice(0, 20)}...{r.xpub.slice(-10)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showAdd && <AddWalletModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────── */

export default function WalletPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  if (role === 'RECIPIENT') return <RecipientWalletPage />;
  return <PayerWalletPage />;
}
