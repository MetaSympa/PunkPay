'use client';

import { TerminalCard } from '@/components/ui/terminal-card';

interface Utxo {
  id: string;
  txid: string;
  vout: number;
  valueSats: string;
  status: string;
  isLocked: boolean;
  address?: { address: string };
}

interface UtxoListProps {
  utxos: Utxo[];
}

export function UtxoList({ utxos }: UtxoListProps) {
  return (
    <TerminalCard title={`utxos (${utxos.length})`}>
      <div className="space-y-1">
        <div className="grid grid-cols-12 gap-2 text-xs text-cyber-muted uppercase tracking-wider pb-2 border-b border-cyber-border font-sans">
          <div className="col-span-5">Outpoint</div>
          <div className="col-span-3">Value</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Lock</div>
        </div>
        {utxos.map(utxo => (
          <div
            key={utxo.id}
            className="grid grid-cols-12 gap-2 py-1.5 border-b border-cyber-border/20 text-xs font-mono"
          >
            <div className="col-span-5 text-cyber-muted truncate">
              {utxo.txid.slice(0, 16)}...:{utxo.vout}
            </div>
            <div className="col-span-3 text-neon-amber">
              {BigInt(utxo.valueSats).toLocaleString()} sats
            </div>
            <div className="col-span-2">
              <span className={
                utxo.status === 'CONFIRMED' ? 'text-neon-green' :
                utxo.status === 'UNCONFIRMED' ? 'text-neon-amber' :
                utxo.status === 'SPENT' ? 'text-cyber-muted' :
                'text-neon-red'
              }>
                {utxo.status}
              </span>
            </div>
            <div className="col-span-2">
              {utxo.isLocked && <span className="text-neon-red">LOCKED</span>}
            </div>
          </div>
        ))}
        {utxos.length === 0 && (
          <p className="text-cyber-muted text-center py-4 text-sm">No UTXOs found</p>
        )}
      </div>
    </TerminalCard>
  );
}
