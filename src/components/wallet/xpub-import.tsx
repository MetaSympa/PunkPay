'use client';

import { useState } from 'react';
import { useImportWallet } from '@/hooks/use-wallet';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';

interface XpubImportProps {
  onSuccess?: () => void;
}

export function XpubImport({ onSuccess }: XpubImportProps) {
  const importWallet = useImportWallet();
  const [name, setName] = useState('');
  const [xpub, setXpub] = useState('');
  const [network, setNetwork] = useState('signet');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await importWallet.mutateAsync({ name, xpub, network });
      setName('');
      setXpub('');
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <TerminalCard title="import xpub" variant="amber">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
            Wallet Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
            placeholder="My Taproot Wallet"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
            Extended Public Key
          </label>
          <textarea
            value={xpub}
            onChange={e => setXpub(e.target.value)}
            className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none transition-colors h-20 resize-none"
            placeholder="tpub..."
            required
          />
        </div>
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
            Network
          </label>
          <select
            value={network}
            onChange={e => setNetwork(e.target.value)}
            className="bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
          >
            <option value="signet">Signet</option>
            <option value="testnet">Testnet</option>
            <option value="mainnet">Mainnet</option>
          </select>
        </div>
        {error && (
          <div className="text-neon-red text-sm font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">
            {error}
          </div>
        )}
        <NeonButton type="submit" variant="amber" loading={importWallet.isPending}>
          Import
        </NeonButton>
      </form>
    </TerminalCard>
  );
}
