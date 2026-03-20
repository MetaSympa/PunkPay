import { ReactNode } from 'react';

interface StatDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  variant?: 'green' | 'amber' | 'red' | 'default';
}

export function StatDisplay({ label, value, unit, icon, variant = 'default' }: StatDisplayProps) {
  const colors = {
    green:   'text-neon-green',
    amber:   'text-neon-amber',
    red:     'text-neon-red',
    default: 'text-cyber-text',
  };

  return (
    <div className="sv-card p-4">
      <p className="sv-stat-label">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        {icon && <span className="text-neon-green">{icon}</span>}
        <p className={`text-xl font-mono font-bold ${colors[variant]}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-xs text-cyber-muted ml-1.5 font-normal tracking-wider">{unit}</span>}
        </p>
      </div>
    </div>
  );
}
