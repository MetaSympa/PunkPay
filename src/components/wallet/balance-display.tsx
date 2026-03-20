'use client';

import { TerminalCard } from '@/components/ui/terminal-card';

interface BalanceDisplayProps {
  balance: string;
  confirmedBalance: string;
  network: string;
}

export function BalanceDisplay({ balance, confirmedBalance, network }: BalanceDisplayProps) {
  const totalSats = BigInt(balance);
  const confirmedSats = BigInt(confirmedBalance);
  const pendingSats = totalSats - confirmedSats;

  return (
    <TerminalCard title="balance">
      <div className="space-y-3">
        <div>
          <p className="text-xs text-cyber-muted uppercase tracking-wider font-sans">Total Balance</p>
          <p className="text-3xl font-mono font-bold text-neon-green neon-text">
            {totalSats.toLocaleString()}
            <span className="text-sm text-cyber-muted ml-2">sats</span>
          </p>
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-cyber-muted font-sans">Confirmed</p>
            <p className="text-sm font-mono text-neon-green">{confirmedSats.toLocaleString()}</p>
          </div>
          {pendingSats > 0n && (
            <div>
              <p className="text-xs text-cyber-muted font-sans">Pending</p>
              <p className="text-sm font-mono text-neon-amber">{pendingSats.toLocaleString()}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-cyber-muted font-sans">Network</p>
            <p className="text-sm font-mono text-neon-amber uppercase">{network}</p>
          </div>
        </div>
      </div>
    </TerminalCard>
  );
}
