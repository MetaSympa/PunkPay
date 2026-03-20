'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import {
  useWallets, useWallet, useImportWallet, useDeleteWallet, useCreateWalletFromSeed,
} from '@/hooks/use-wallet';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAutoSync } from '@/hooks/use-utxo-sync';
import Link from 'next/link';

function formatRelative(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useRecipientProfile() {
  return useQuery({
    queryKey: ['recipient-profile'],
    queryFn: async () => {
      const res = await fetch('/api/recipient/profile');
      return res.ok ? res.json() : null;
    },
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
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipient-profile'] }),
  });
}

function useRecipients() {
  return useQuery({
    queryKey: ['recipients'],
    queryFn: async () => {
      const res = await fetch('/api/recipients');
      return res.ok ? res.json() : [];
    },
  });
}

// ─── Sync progress bar ───────────────────────────────────────────────────────

function SyncBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="h-0.5 w-full overflow-hidden rounded-t-lg bg-cyber-border">
      <div
        className="h-full bg-neon-green"
        style={{
          width: '40%',
          animation: 'sync-scan 1.4s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes sync-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}

// ─── Wallet card ──────────────────────────────────────────────────────────────

function WalletCard({ wallet, onDelete, deleting }: { wallet: any; onDelete: () => void; deleting: boolean }) {
  const { data: detail } = useWallet(wallet.id);
  const { syncNow, isSyncing, isUnlocking, lastSyncedAt, lastResult } = useAutoSync(wallet.id);

  const satsDisplay = (s: string | undefined) => {
    if (!s) return '—';
    const n = BigInt(s);
    return n === 0n ? '0 sats' : `${n.toLocaleString()} sats`;
  };

  const nextExternal = detail?.addresses?.find((a: any) => a.chain === 'EXTERNAL' && !a.isUsed);

  const syncStatus = isSyncing
    ? 'Syncing addresses...'
    : isUnlocking
    ? 'Unlocking UTXOs...'
    : lastSyncedAt
    ? `Synced ${formatRelative(lastSyncedAt)}`
    : null;

  return (
    <div className="pp-card overflow-hidden">
      <SyncBar active={isSyncing || isUnlocking} />
      <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
        <div>
          <span className="font-mono text-sm text-cyber-text font-medium">{wallet.name}</span>
          <span className="ml-2 text-xs font-mono text-cyber-muted">
            {wallet.addressType === 'P2WPKH' ? 'P2WPKH' : 'P2TR'} · {wallet.network}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {syncStatus && (
            <span className={`text-xs font-mono ${isSyncing || isUnlocking ? 'text-neon-amber' : 'text-cyber-muted'}`}>
              {isSyncing || isUnlocking ? (
                <span style={{ animation: 'pulse-dot 1s ease-in-out infinite' }}>{syncStatus}</span>
              ) : syncStatus}
            </span>
          )}
          {wallet.hasSeed && (
            <span className="text-xs font-mono text-neon-green border border-neon-green/30 rounded px-1.5 py-0.5">Hot</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <p className="text-xs text-cyber-muted font-mono">Balance</p>
            <p className="text-sm font-mono text-neon-green mt-0.5">{satsDisplay(detail?.balance)}</p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-mono">Confirmed</p>
            <p className="text-sm font-mono text-cyber-text mt-0.5">{satsDisplay(detail?.confirmedBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-mono">UTXOs</p>
            <p className="text-sm font-mono text-cyber-text mt-0.5">{wallet._count.utxos}</p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-mono">Fingerprint</p>
            <p className="text-xs font-mono text-cyber-muted mt-0.5">{wallet.xpubFingerprint}</p>
          </div>
        </div>

        {nextExternal && (
          <div>
            <p className="text-xs text-cyber-muted font-mono mb-1">Receive address</p>
            <p className="text-xs font-mono text-neon-green break-all bg-cyber-bg rounded px-2 py-1.5">
              {nextExternal.address}
            </p>
          </div>
        )}

        {lastResult && lastResult.utxosFound > 0 && (
          <p className="text-xs font-mono text-neon-green">
            {lastResult.utxosFound} UTXO{lastResult.utxosFound !== 1 ? 's' : ''} found · {lastResult.addressesChecked} addresses checked
          </p>
        )}

        <div className="flex gap-2 pt-1 flex-wrap">
          <Link href={`/wallet/${wallet.id}`}>
            <NeonButton variant="green" size="sm">Details</NeonButton>
          </Link>
          <NeonButton variant="ghost" size="sm" onClick={syncNow} loading={isSyncing || isUnlocking}>
            {isSyncing ? 'Syncing...' : isUnlocking ? 'Unlocking...' : 'Sync'}
          </NeonButton>
          <NeonButton variant="red" size="sm"
            onClick={() => { if (confirm('Delete this wallet?')) onDelete(); }}
            loading={deleting}>
            Delete
          </NeonButton>
        </div>
      </div>
    </div>
  );
}

// ─── Add wallet modal ─────────────────────────────────────────────────────────

type ModalMode = 'xpub' | 'seed-generate' | 'seed-import';

function AddWalletModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<ModalMode>('xpub');
  const importWallet = useImportWallet();
  const createFromSeed = useCreateWalletFromSeed();

  // xpub state
  const [xName, setXName] = useState('');
  const [xKey, setXKey] = useState('');
  const [xNetwork, setXNetwork] = useState('mainnet');
  const [xAddrType, setXAddrType] = useState('P2TR');
  const [xErr, setXErr] = useState('');

  // seed state
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
      setMnemonic(d.mnemonic);
      setBackedUp(false);
    } catch { setSErr('Failed to generate.'); }
    finally { setGenerating(false); }
  }

  async function handleXpub(e: React.FormEvent) {
    e.preventDefault(); setXErr('');
    try {
      await importWallet.mutateAsync({ name: xName, xpub: xKey.trim(), network: xNetwork, addressType: xAddrType });
      onClose();
    } catch (err: any) { setXErr(err.message); }
  }

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault(); setSErr('');
    const phrase = mode === 'seed-generate' ? mnemonic : imported;
    if (!phrase) { setSErr('Provide a seed phrase.'); return; }
    try {
      await createFromSeed.mutateAsync({ name: sName, mnemonic: phrase, network: sNetwork, passphrase: passphrase || undefined });
      onClose();
    } catch (err: any) { setSErr(err.message); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-cyber-bg/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pp-card w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex border-b border-cyber-border">
          {([
            { id: 'xpub' as ModalMode, label: 'Import xpub' },
            { id: 'seed-generate' as ModalMode, label: 'New seed' },
            { id: 'seed-import' as ModalMode, label: 'Import seed' },
          ]).map(t => (
            <button key={t.id} onClick={() => { setMode(t.id); setSErr(''); setXErr(''); }}
              className={`flex-1 py-3 text-xs font-mono transition-colors ${
                mode === t.id ? 'text-neon-green border-b-2 border-neon-green' : 'text-cyber-muted hover:text-cyber-text'
              }`}>
              {t.label}
            </button>
          ))}
          <button onClick={onClose} className="px-4 text-cyber-muted hover:text-cyber-text font-mono text-sm">✕</button>
        </div>

        <div className="p-4">
          {/* Import xpub */}
          {mode === 'xpub' && (
            <form onSubmit={handleXpub} className="space-y-3">
              <div>
                <label className="pp-label">Name</label>
                <input type="text" value={xName} onChange={e => setXName(e.target.value)}
                  className="pp-input" placeholder="My Sparrow Wallet" required />
              </div>
              <div>
                <label className="pp-label">xpub / tpub</label>
                <textarea value={xKey} onChange={e => setXKey(e.target.value)}
                  className="pp-input h-20 resize-none" placeholder="xpub..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="pp-label">Network</label>
                  <select value={xNetwork} onChange={e => setXNetwork(e.target.value)} className="pp-input">
                    <option value="mainnet">Mainnet</option>
                    <option value="signet">Signet</option>
                    <option value="testnet">Testnet</option>
                  </select>
                </div>
                <div>
                  <label className="pp-label">Type</label>
                  <select value={xAddrType} onChange={e => setXAddrType(e.target.value)} className="pp-input">
                    <option value="P2TR">P2TR (bc1p)</option>
                    <option value="P2WPKH">P2WPKH (bc1q)</option>
                  </select>
                </div>
              </div>
              {xErr && <p className="text-xs font-mono text-neon-red bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">{xErr}</p>}
              <NeonButton type="submit" variant="amber" className="w-full" loading={importWallet.isPending}>
                Import Wallet
              </NeonButton>
            </form>
          )}

          {/* New seed */}
          {mode === 'seed-generate' && (
            <form onSubmit={handleSeed} className="space-y-3">
              <NeonButton type="button" variant="green" className="w-full" onClick={generate} loading={generating}>
                {mnemonic ? 'Regenerate' : 'Generate Seed Phrase'}
              </NeonButton>
              {mnemonic && (
                <>
                  <div className="grid grid-cols-3 gap-2 p-3 bg-cyber-bg border border-cyber-border rounded">
                    {mnemonic.split(' ').map((word, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-cyber-muted text-xs w-4 text-right shrink-0">{i + 1}</span>
                        <span className="text-neon-green font-mono text-sm">{word}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-mono text-neon-red border border-neon-red/20 bg-neon-red/5 rounded px-3 py-2">
                    Write these 12 words down offline. Never share them.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} className="accent-neon-green" />
                    <span className="text-xs font-mono text-cyber-muted">I have backed up my seed phrase</span>
                  </label>
                </>
              )}
              <div>
                <label className="pp-label">Wallet Name</label>
                <input type="text" value={sName} onChange={e => setSName(e.target.value)}
                  className="pp-input" placeholder="My Wallet" required />
              </div>
              <div>
                <label className="pp-label">Network</label>
                <select value={sNetwork} onChange={e => setSNetwork(e.target.value)} className="pp-input">
                  <option value="signet">Signet</option>
                  <option value="testnet">Testnet</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              </div>
              {sErr && <p className="text-xs font-mono text-neon-red bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">{sErr}</p>}
              <NeonButton type="submit" variant="green" className="w-full"
                loading={createFromSeed.isPending}
                disabled={!backedUp || !sName || !mnemonic}>
                Create Wallet
              </NeonButton>
            </form>
          )}

          {/* Import seed */}
          {mode === 'seed-import' && (
            <form onSubmit={handleSeed} className="space-y-3">
              <div>
                <label className="pp-label">Seed Phrase (12 or 24 words)</label>
                <textarea value={imported} onChange={e => setImported(e.target.value)}
                  className="pp-input h-20 resize-none" placeholder="word1 word2 word3 ..." />
              </div>
              <div>
                <label className="pp-label">Wallet Name</label>
                <input type="text" value={sName} onChange={e => setSName(e.target.value)}
                  className="pp-input" placeholder="My Wallet" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="pp-label">Network</label>
                  <select value={sNetwork} onChange={e => setSNetwork(e.target.value)} className="pp-input">
                    <option value="signet">Signet</option>
                    <option value="testnet">Testnet</option>
                    <option value="mainnet">Mainnet</option>
                  </select>
                </div>
                <div>
                  <label className="pp-label">Passphrase</label>
                  <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)}
                    className="pp-input" placeholder="Optional" />
                </div>
              </div>
              {sErr && <p className="text-xs font-mono text-neon-red bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">{sErr}</p>}
              <NeonButton type="submit" variant="green" className="w-full"
                loading={createFromSeed.isPending}
                disabled={!sName || !imported}>
                Import Wallet
              </NeonButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Recipient wallet page ────────────────────────────────────────────────────

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

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault(); setProfileMsg('');
    try {
      await saveProfile.mutateAsync({ xpub: profileForm.xpub.trim(), network: profileForm.network, label: profileForm.label });
      setProfileMsg('Saved.');
      setShowProfileForm(false);
      setProfileForm({ xpub: '', network: 'mainnet', label: '' });
    } catch (err: any) { setProfileMsg(`Error: ${err.message}`); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">
          Wallets <span className="text-cyber-muted text-sm">({wallets?.length ?? 0}/3)</span>
        </h1>
        <NeonButton variant="green" size="sm" onClick={() => setShowAdd(true)} disabled={maxReached}>
          {maxReached ? 'Max reached' : 'Add Wallet'}
        </NeonButton>
      </div>

      {/* Wallet cards */}
      {!wallets?.length ? (
        <div className="pp-card px-4 py-8 text-center">
          <p className="text-cyber-muted font-mono text-sm mb-3">No wallets added</p>
          <NeonButton variant="green" onClick={() => setShowAdd(true)}>Add Wallet</NeonButton>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map(w => (
            <WalletCard key={w.id} wallet={w}
              onDelete={() => deleteWallet.mutate(w.id)}
              deleting={deleteWallet.isPending} />
          ))}
          {!maxReached && (
            <button onClick={() => setShowAdd(true)}
              className="w-full pp-card px-4 py-3 text-sm font-mono text-cyber-muted hover:text-neon-green transition-colors text-center border-dashed">
              Add wallet ({wallets.length}/3)
            </button>
          )}
        </div>
      )}

      {/* Payment profile */}
      <div className="pp-card">
        <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
          <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">Payment Profile</span>
          <NeonButton variant="ghost" size="sm" onClick={() => { setShowProfileForm(v => !v); setProfileMsg(''); }}>
            {showProfileForm ? 'Cancel' : profile ? 'Update' : 'Set up'}
          </NeonButton>
        </div>

        {profile && !showProfileForm && (
          <div className="px-4 py-3 space-y-1.5">
            {profile.label && <p className="text-sm font-mono text-cyber-text">{profile.label}</p>}
            <p className="text-xs font-mono text-neon-amber uppercase">{profile.network}</p>
            <p className="text-xs font-mono text-cyber-muted break-all">
              {profile.xpub.slice(0, 20)}...{profile.xpub.slice(-10)}
            </p>
            {profileMsg && <p className="text-xs font-mono text-neon-green">{profileMsg}</p>}
          </div>
        )}

        {!profile && !showProfileForm && (
          <p className="px-4 py-3 text-xs font-mono text-cyber-muted">
            Register your xpub so payers can send to fresh Taproot addresses automatically.
          </p>
        )}

        {showProfileForm && (
          <form onSubmit={handleSaveProfile} className="p-4 space-y-3">
            <div>
              <label className="pp-label">Your xpub</label>
              <textarea value={profileForm.xpub} onChange={e => setProfileForm(f => ({ ...f, xpub: e.target.value }))}
                className="pp-input h-20 resize-none" placeholder="xpub... or tpub..." required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="pp-label">Network</label>
                <select value={profileForm.network} onChange={e => setProfileForm(f => ({ ...f, network: e.target.value }))} className="pp-input">
                  <option value="mainnet">Mainnet</option>
                  <option value="signet">Signet</option>
                  <option value="testnet">Testnet</option>
                </select>
              </div>
              <div>
                <label className="pp-label">Label</label>
                <input type="text" value={profileForm.label} onChange={e => setProfileForm(f => ({ ...f, label: e.target.value }))}
                  className="pp-input" placeholder="Optional" />
              </div>
            </div>
            {profileMsg && (
              <p className={`text-xs font-mono ${profileMsg.startsWith('Error') ? 'text-neon-red' : 'text-neon-green'}`}>{profileMsg}</p>
            )}
            <NeonButton type="submit" variant="amber" className="w-full" loading={saveProfile.isPending}>
              Save Profile
            </NeonButton>
          </form>
        )}
      </div>

      {showAdd && <AddWalletModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ─── Payer wallet page ────────────────────────────────────────────────────────

function PayerWalletPage() {
  const { data: wallets, isLoading } = useWallets();
  const { data: recipients } = useRecipients();
  const deleteWallet = useDeleteWallet();
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<'wallet' | 'recipients'>('wallet');

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">Wallets</h1>

      <div className="flex gap-0 border-b border-cyber-border">
        {([
          { id: 'wallet' as const, label: 'Funding Wallet' },
          { id: 'recipients' as const, label: `Recipients (${recipients?.length ?? 0})` },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-mono transition-colors ${
              tab === t.id ? 'text-neon-green border-b-2 border-neon-green -mb-px' : 'text-cyber-muted hover:text-cyber-text'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wallet' && (
        <div className="space-y-3">
          {!wallets?.length ? (
            <div className="pp-card px-4 py-8 text-center space-y-3">
              <p className="text-cyber-muted font-mono text-sm">No funding wallet</p>
              <NeonButton variant="green" onClick={() => setShowAdd(true)}>Create Wallet</NeonButton>
            </div>
          ) : (
            wallets.map(w => (
              <WalletCard key={w.id} wallet={w}
                onDelete={() => deleteWallet.mutate(w.id)}
                deleting={deleteWallet.isPending} />
            ))
          )}
          {wallets && wallets.length > 0 && (
            <NeonButton variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
              Add another wallet
            </NeonButton>
          )}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="space-y-3">
          {!recipients?.length ? (
            <div className="pp-card px-4 py-6 text-center">
              <p className="text-cyber-muted font-mono text-sm">No recipients configured</p>
            </div>
          ) : (
            recipients.map((r: any) => (
              <div key={r.id} className="pp-card">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-cyber-text">{r.label || r.email}</p>
                    <p className="text-xs font-mono text-cyber-muted mt-0.5">{r.email}</p>
                  </div>
                  <span className="text-xs font-mono text-neon-amber uppercase">{r.network}</span>
                </div>
                <div className="px-4 pb-3">
                  <p className="text-xs font-mono text-cyber-muted break-all">
                    {r.xpub.slice(0, 20)}...{r.xpub.slice(-10)}
                  </p>
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

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  if (role === 'RECIPIENT') return <RecipientWalletPage />;
  return <PayerWalletPage />;
}
