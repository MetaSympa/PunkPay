'use client';

import { TerminalCard } from '@/components/ui/terminal-card';

interface Transaction {
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
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'border-cyber-border text-cyber-muted',
  SIGNED: 'border-neon-blue/30 text-neon-blue',
  BROADCAST: 'border-neon-amber/30 text-neon-amber',
  CONFIRMED: 'border-neon-green/30 text-neon-green',
  FAILED: 'border-neon-red/30 text-neon-red',
  REPLACED: 'border-neon-purple/30 text-neon-purple',
};

interface TxListProps {
  transactions: Transaction[];
}

export function TxList({ transactions }: TxListProps) {
  return (
    <TerminalCard title={`transactions (${transactions.length})`}>
      <div className="space-y-1">
        <div className="grid grid-cols-12 gap-2 text-xs text-cyber-muted uppercase tracking-wider pb-2 border-b border-cyber-border font-sans">
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-3">Amount</div>
          <div className="col-span-3">Recipient</div>
          <div className="col-span-2">Date</div>
        </div>
        {transactions.map(tx => (
          <div
            key={tx.id}
            className="grid grid-cols-12 gap-2 py-2 border-b border-cyber-border/20 hover:bg-cyber-card/30 transition-colors text-sm"
          >
            <div className="col-span-2">
              <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[tx.status] || ''}`}>
                {tx.status}
              </span>
            </div>
            <div className="col-span-2 text-cyber-text font-mono">{tx.type}</div>
            <div className="col-span-3 font-mono">
              <span className="text-neon-amber">{BigInt(tx.amountSats).toLocaleString()}</span>
              <span className="text-cyber-muted text-xs ml-1">sats</span>
            </div>
            <div className="col-span-3 font-mono text-xs text-cyber-muted truncate">
              {tx.recipientAddress || '—'}
            </div>
            <div className="col-span-2 text-xs text-cyber-muted">
              {new Date(tx.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
        {transactions.length === 0 && (
          <div className="text-center py-8 text-cyber-muted text-sm">
            No transactions found
          </div>
        )}
      </div>
    </TerminalCard>
  );
}
