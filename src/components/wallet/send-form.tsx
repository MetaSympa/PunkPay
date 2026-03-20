'use client';

import { useState } from 'react';
import { useCreateTransaction } from '@/hooks/use-transactions';
import { useFeeEstimates } from '@/hooks/use-fees';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';

interface SendFormProps {
  walletId: string;
}

export function SendForm({ walletId }: SendFormProps) {
  const { data: fees } = useFeeEstimates();
  const createTx = useCreateTransaction();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amountSats, setAmountSats] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [result, setResult] = useState<{ psbt: string; feeSats: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    try {
      const data = await createTx.mutateAsync({
        walletId,
        recipientAddress,
        amountSats,
        feeRate: parseFloat(feeRate || String(fees?.halfHourFee || 5)),
      });
      setResult(data);
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <TerminalCard title="send bitcoin" variant="amber">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
            Recipient (P2TR)
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={e => setRecipientAddress(e.target.value)}
            className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none transition-colors"
            placeholder="tb1p..."
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
              Amount (sats)
            </label>
            <input
              type="number"
              value={amountSats}
              onChange={e => setAmountSats(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono focus:border-neon-amber focus:outline-none transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
              Fee Rate (sat/vB)
            </label>
            <input
              type="number"
              value={feeRate}
              onChange={e => setFeeRate(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
              placeholder={String(fees?.halfHourFee || 5)}
              step="0.1"
            />
            {fees && (
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => setFeeRate(String(fees.economyFee))} className="text-xs text-cyber-muted hover:text-neon-green">
                  Eco:{fees.economyFee}
                </button>
                <button type="button" onClick={() => setFeeRate(String(fees.halfHourFee))} className="text-xs text-cyber-muted hover:text-neon-amber">
                  Med:{fees.halfHourFee}
                </button>
                <button type="button" onClick={() => setFeeRate(String(fees.fastestFee))} className="text-xs text-cyber-muted hover:text-neon-red">
                  Fast:{fees.fastestFee}
                </button>
              </div>
            )}
          </div>
        </div>
        <NeonButton type="submit" variant="amber" loading={createTx.isPending}>
          Build Transaction
        </NeonButton>
      </form>

      {result && (
        <div className="mt-4 p-3 bg-cyber-bg rounded border border-neon-green/30">
          <p className="text-xs text-neon-green mb-1">PSBT Created (unsigned)</p>
          <p className="text-xs text-cyber-muted mb-2">Fee: {BigInt(result.feeSats).toLocaleString()} sats</p>
          <textarea
            readOnly
            value={result.psbt}
            className="w-full bg-cyber-bg text-xs font-mono text-cyber-text h-20 resize-none border-0 focus:outline-none"
          />
        </div>
      )}
    </TerminalCard>
  );
}
