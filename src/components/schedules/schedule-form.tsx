'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreateSchedule } from '@/hooks/use-schedules';
import { useWallets } from '@/hooks/use-wallet';
import { deriveAddress } from '@/lib/bitcoin/hd-wallet';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';

type RecipientMode = 'xpub-select' | 'xpub-manual' | 'address';

interface ScheduleFormProps {
  onSuccess?: () => void;
}

function useRecipients() {
  return useQuery({
    queryKey: ['recipients'],
    queryFn: async () => {
      const res = await fetch('/api/recipients');
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function ScheduleForm({ onSuccess }: ScheduleFormProps) {
  const { data: wallets } = useWallets();
  const { data: recipients } = useRecipients();
  const createSchedule = useCreateSchedule();

  const [mode, setMode] = useState<RecipientMode>('xpub-select');
  const [form, setForm] = useState({
    walletId: '',
    recipientName: '',
    amountSats: '',
    cronExpression: '0 0 1 * *',
    timezone: 'UTC',
    maxFeeRate: '50',
  });
  const [selectedXpub, setSelectedXpub] = useState('');
  const [manualXpub, setManualXpub] = useState('');
  const [staticAddress, setStaticAddress] = useState('');
  const [previewAddress, setPreviewAddress] = useState('');
  const [previewError, setPreviewError] = useState('');

  function getActiveXpub() {
    return mode === 'xpub-select' ? selectedXpub : mode === 'xpub-manual' ? manualXpub : '';
  }

  function handleXpubChange(xpub: string) {
    setPreviewAddress('');
    setPreviewError('');
    if (!xpub) return;
    try {
      const derived = deriveAddress(xpub, 0, 0);
      setPreviewAddress(derived.address);
    } catch {
      setPreviewError('Invalid xpub — cannot derive address');
    }
  }

  function handleRecipientSelect(recipientId: string) {
    const r = recipients?.find((x: any) => x.id === recipientId);
    if (r) {
      setSelectedXpub(r.xpub);
      setForm(f => ({ ...f, recipientName: r.label || r.email }));
      handleXpubChange(r.xpub);
    } else {
      setSelectedXpub('');
      setPreviewAddress('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const xpub = getActiveXpub();
      await createSchedule.mutateAsync({
        ...form,
        maxFeeRate: parseFloat(form.maxFeeRate),
        recipientXpub: xpub || undefined,
        recipientAddress: mode === 'address' ? staticAddress : undefined,
      });
      onSuccess?.();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <TerminalCard title="new schedule" variant="amber">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Wallet + Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Sending Wallet</label>
            <select
              value={form.walletId}
              onChange={e => setForm({ ...form, walletId: e.target.value })}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
              required
            >
              <option value="">Select wallet...</option>
              {wallets?.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Recipient Name</label>
            <input
              type="text"
              value={form.recipientName}
              onChange={e => setForm({ ...form, recipientName: e.target.value })}
              placeholder="Alice, Contractor..."
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Recipient Mode Toggle */}
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-2">Recipient Type</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'xpub-select', label: '⇄ Select Recipient (xpub)' },
              { id: 'xpub-manual', label: '✎ Paste xpub' },
              { id: 'address', label: '⊕ Static Address' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setMode(opt.id as RecipientMode); setPreviewAddress(''); setPreviewError(''); }}
                className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                  mode === opt.id
                    ? 'border-neon-amber text-neon-amber bg-neon-amber/10'
                    : 'border-cyber-border text-cyber-muted hover:border-cyber-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* xpub select from registered recipients */}
        {mode === 'xpub-select' && (
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Select Recipient</label>
            <select
              onChange={e => handleRecipientSelect(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
              required={mode === 'xpub-select'}
            >
              <option value="">Choose recipient...</option>
              {recipients?.map((r: any) => (
                <option key={r.id} value={r.id}>{r.label || r.email}</option>
              ))}
            </select>
            {recipients?.length === 0 && (
              <p className="text-xs text-neon-amber mt-1">No recipients have set up a payment profile yet.</p>
            )}
          </div>
        )}

        {/* Manual xpub paste */}
        {mode === 'xpub-manual' && (
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Recipient xpub</label>
            <textarea
              value={manualXpub}
              onChange={e => { setManualXpub(e.target.value); handleXpubChange(e.target.value.trim()); }}
              placeholder="xpub... or tpub..."
              rows={2}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none transition-colors resize-none"
              required={mode === 'xpub-manual'}
            />
          </div>
        )}

        {/* Static address */}
        {mode === 'address' && (
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Recipient Address (P2TR)</label>
            <input
              type="text"
              value={staticAddress}
              onChange={e => setStaticAddress(e.target.value)}
              placeholder="tb1p..."
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none transition-colors"
              required={mode === 'address'}
            />
            <p className="text-xs text-neon-amber mt-1">⚠ Address reuse reduces privacy. Use xpub mode for recurring payments.</p>
          </div>
        )}

        {/* Address preview for xpub modes */}
        {(mode === 'xpub-select' || mode === 'xpub-manual') && (previewAddress || previewError) && (
          <div className={`text-xs font-mono px-3 py-2 rounded border ${previewError ? 'border-neon-red/30 text-neon-red bg-neon-red/5' : 'border-neon-green/30 text-neon-green bg-neon-green/5'}`}>
            {previewError || (
              <>
                <span className="text-cyber-muted">First payment address: </span>
                {previewAddress}
              </>
            )}
          </div>
        )}

        {/* Amount, Cron, Fee */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Amount (sats)</label>
            <input
              type="number"
              value={form.amountSats}
              onChange={e => setForm({ ...form, amountSats: e.target.value })}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono focus:border-neon-amber focus:outline-none transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Cron Expression</label>
            <input
              type="text"
              value={form.cronExpression}
              onChange={e => setForm({ ...form, cronExpression: e.target.value })}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
              required
            />
            <p className="text-xs text-cyber-muted mt-1">Monthly: 0 0 1 * *</p>
          </div>
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Max Fee (sat/vB)</label>
            <input
              type="number"
              value={form.maxFeeRate}
              onChange={e => setForm({ ...form, maxFeeRate: e.target.value })}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
            />
          </div>
        </div>

        <NeonButton type="submit" variant="amber" loading={createSchedule.isPending} className="w-full">
          Create Schedule
        </NeonButton>
      </form>
    </TerminalCard>
  );
}
