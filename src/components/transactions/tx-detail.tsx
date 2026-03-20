'use client';

import { TerminalCard } from '@/components/ui/terminal-card';

interface TxDetailProps {
  transaction: {
    id: string;
    txid: string | null;
    type: string;
    status: string;
    amountSats: string;
    feeSats: string | null;
    feeRate: number | null;
    recipientAddress: string | null;
    rbfEnabled: boolean;
    confirmations: number;
    broadcastAt: string | null;
    confirmedAt: string | null;
    createdAt: string;
    psbt: string | null;
  };
}

export function TxDetail({ transaction: tx }: TxDetailProps) {
  return (
    <TerminalCard title="transaction detail">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-cyber-muted font-sans">Status</p>
            <p className={
              tx.status === 'CONFIRMED' ? 'text-neon-green' :
              tx.status === 'BROADCAST' ? 'text-neon-amber' :
              tx.status === 'FAILED' ? 'text-neon-red' :
              'text-cyber-text'
            }>{tx.status}</p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-sans">Type</p>
            <p className="text-cyber-text">{tx.type}</p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-sans">Amount</p>
            <p className="text-neon-amber font-mono">{BigInt(tx.amountSats).toLocaleString()} sats</p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-sans">Fee</p>
            <p className="text-cyber-text font-mono">
              {tx.feeSats ? `${BigInt(tx.feeSats).toLocaleString()} sats` : '—'}
              {tx.feeRate && <span className="text-cyber-muted text-xs ml-1">({tx.feeRate} sat/vB)</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-sans">RBF</p>
            <p className={tx.rbfEnabled ? 'text-neon-green' : 'text-cyber-muted'}>
              {tx.rbfEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div>
            <p className="text-xs text-cyber-muted font-sans">Confirmations</p>
            <p className="text-cyber-text">{tx.confirmations}</p>
          </div>
        </div>

        {tx.txid && (
          <div>
            <p className="text-xs text-cyber-muted font-sans">TxID</p>
            <p className="text-xs text-neon-green font-mono break-all">{tx.txid}</p>
          </div>
        )}

        {tx.recipientAddress && (
          <div>
            <p className="text-xs text-cyber-muted font-sans">Recipient</p>
            <p className="text-xs text-cyber-text font-mono break-all">{tx.recipientAddress}</p>
          </div>
        )}
      </div>
    </TerminalCard>
  );
}
