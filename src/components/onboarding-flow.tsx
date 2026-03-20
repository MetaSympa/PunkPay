'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateWalletFromSeed, useImportWallet } from '@/hooks/use-wallet';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';

type ActiveCard = 'none' | 'funding' | 'cold';

export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const [activeCard, setActiveCard] = useState<ActiveCard>('none');
  const qc = useQueryClient();

  // Funding wallet state
  const [mnemonic, setMnemonic] = useState('');
  const [seedName, setSeedName] = useState('My Funding Wallet');
  const [backedUp, setBackedUp] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [seedError, setSeedError] = useState('');
  const createFromSeed = useCreateWalletFromSeed();

  // Cold wallet state
  const [xpubName, setXpubName] = useState('');
  const [xpub, setXpub] = useState('');
  const [addressType, setAddressType] = useState('P2WPKH');
  const [importError, setImportError] = useState('');
  const importWallet = useImportWallet();

  async function generateMnemonic() {
    setGenerating(true);
    setSeedError('');
    try {
      const res = await fetch('/api/wallet/generate-mnemonic');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setMnemonic(data.mnemonic);
      setBackedUp(false);
    } catch { setSeedError('Failed to generate mnemonic'); }
    finally { setGenerating(false); }
  }

  async function handleCreateFunding() {
    setSeedError('');
    try {
      await createFromSeed.mutateAsync({ name: seedName, mnemonic, network: 'mainnet' });
      qc.invalidateQueries({ queryKey: ['wallets'] });
      onDone();
    } catch (err: any) { setSeedError(err.message); }
  }

  async function handleConnectCold() {
    setImportError('');
    try {
      await importWallet.mutateAsync({ name: xpubName, xpub: xpub.trim(), network: 'mainnet', addressType });
      qc.invalidateQueries({ queryKey: ['wallets'] });
      onDone();
    } catch (err: any) { setImportError(err.message); }
  }

  const words = mnemonic.split(' ').filter(Boolean);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center py-12 px-4">
      <div className="text-center mb-10 space-y-2">
        <GlitchText text="WELCOME TO PUNKPAY" as="h1" className="text-3xl font-bold text-neon-green" />
        <p className="text-cyber-muted text-sm font-mono">Set up your Bitcoin payment infrastructure</p>
      </div>

      {/* Wallet selection cards */}
      {activeCard === 'none' && (
        <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setActiveCard('funding')}
            className="group text-left p-6 bg-cyber-surface border border-cyber-border rounded-lg hover:border-neon-green/60 hover:bg-neon-green/5 transition-all"
          >
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-bold text-neon-green font-mono mb-2">Create Funding Wallet</h3>
            <p className="text-cyber-muted text-sm leading-relaxed">
              A hot wallet that stores an encrypted seed. PunkPay signs &amp; broadcasts payments automatically — no manual signing required.
            </p>
            <div className="mt-4 text-xs text-cyber-muted font-mono border-t border-cyber-border/50 pt-3 space-y-1">
              <p>✓ Auto-sign scheduled payments</p>
              <p>✓ Encrypted seed stored at rest</p>
              <p>✓ P2TR Taproot · BIP86</p>
            </div>
            <p className="mt-4 text-xs text-neon-green font-mono opacity-70 group-hover:opacity-100 transition-opacity">Select →</p>
          </button>

          <button
            onClick={() => setActiveCard('cold')}
            className="group text-left p-6 bg-cyber-surface border border-cyber-border rounded-lg hover:border-neon-amber/60 hover:bg-neon-amber/5 transition-all"
          >
            <div className="text-3xl mb-3">🔐</div>
            <h3 className="text-lg font-bold text-neon-amber font-mono mb-2">Connect Cold Wallet</h3>
            <p className="text-cyber-muted text-sm leading-relaxed">
              Import your xpub from Sparrow, Ledger, or any HD wallet. Fund your account while keeping private keys offline.
            </p>
            <div className="mt-4 text-xs text-cyber-muted font-mono border-t border-cyber-border/50 pt-3 space-y-1">
              <p>✓ Private keys never leave hardware</p>
              <p>✓ Compatible with Sparrow, Electrum</p>
              <p>✓ P2WPKH or P2TR address types</p>
            </div>
            <p className="mt-4 text-xs text-neon-amber font-mono opacity-70 group-hover:opacity-100 transition-opacity">Select →</p>
          </button>
        </div>
      )}

      {/* Funding Wallet Form */}
      {activeCard === 'funding' && (
        <div className="w-full max-w-lg space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setActiveCard('none')} className="text-cyber-muted hover:text-cyber-text text-sm font-mono">← Back</button>
            <h2 className="text-xl font-bold text-neon-green font-mono">Create Funding Wallet</h2>
          </div>
          <div className="bg-cyber-surface border border-cyber-border rounded-lg p-5 space-y-4">
            <div>
              <label className="text-xs text-cyber-muted uppercase tracking-wider block mb-1">Wallet Name</label>
              <input value={seedName} onChange={e => setSeedName(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none" />
            </div>
            <NeonButton variant="green" onClick={generateMnemonic} loading={generating} className="w-full">
              {mnemonic ? '↺ Regenerate Seed Phrase' : 'Generate 12-Word Seed Phrase'}
            </NeonButton>
            {mnemonic && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 p-3 bg-cyber-bg border border-neon-green/20 rounded">
                  {words.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-cyber-muted text-xs w-4 text-right">{i + 1}.</span>
                      <span className="text-neon-green font-mono text-sm">{w}</span>
                    </div>
                  ))}
                </div>
                <p className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">
                  ⚠ Write these 12 words offline. Anyone with this phrase controls your Bitcoin.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} className="accent-neon-green" />
                  <span className="text-xs text-cyber-muted font-mono">I have backed up my seed phrase securely</span>
                </label>
              </div>
            )}
            {seedError && <p className="text-neon-red text-xs font-mono">{seedError}</p>}
            <NeonButton variant="green" onClick={handleCreateFunding} loading={createFromSeed.isPending}
              disabled={!mnemonic || !backedUp || !seedName} className="w-full">
              Create Funding Wallet →
            </NeonButton>
          </div>
          <div className="text-center">
            <button onClick={onDone} className="text-xs text-cyber-muted hover:text-cyber-text font-mono underline">
              Skip — go to dashboard
            </button>
          </div>
        </div>
      )}

      {/* Cold Wallet Form */}
      {activeCard === 'cold' && (
        <div className="w-full max-w-lg space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setActiveCard('none')} className="text-cyber-muted hover:text-cyber-text text-sm font-mono">← Back</button>
            <h2 className="text-xl font-bold text-neon-amber font-mono">Connect Cold Wallet</h2>
          </div>
          <div className="bg-cyber-surface border border-cyber-border rounded-lg p-5 space-y-4">
            <div>
              <label className="text-xs text-cyber-muted uppercase tracking-wider block mb-1">Wallet Name</label>
              <input value={xpubName} onChange={e => setXpubName(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none"
                placeholder="Sparrow Wallet" />
            </div>
            <div>
              <label className="text-xs text-cyber-muted uppercase tracking-wider block mb-1">Extended Public Key (xpub)</label>
              <textarea value={xpub} onChange={e => setXpub(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none h-20 resize-none"
                placeholder="xpub6..." />
            </div>
            <div>
              <label className="text-xs text-cyber-muted uppercase tracking-wider block mb-1">Address Type</label>
              <select value={addressType} onChange={e => setAddressType(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none">
                <option value="P2WPKH">P2WPKH — Native SegWit (bc1q…) — Sparrow default</option>
                <option value="P2TR">P2TR — Taproot (bc1p…)</option>
              </select>
            </div>
            {importError && <p className="text-neon-red text-xs font-mono">{importError}</p>}
            <NeonButton variant="amber" onClick={handleConnectCold} loading={importWallet.isPending}
              disabled={!xpub.trim() || !xpubName} className="w-full">
              Connect Wallet →
            </NeonButton>
          </div>
          <div className="text-center">
            <button onClick={onDone} className="text-xs text-cyber-muted hover:text-cyber-text font-mono underline">
              Skip — go to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
