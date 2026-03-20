interface StatDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  variant?: 'green' | 'amber' | 'red' | 'default';
}

export function StatDisplay({ label, value, unit, variant = 'default' }: StatDisplayProps) {
  const colors = {
    green: 'text-neon-green',
    amber: 'text-neon-amber',
    red: 'text-neon-red',
    default: 'text-cyber-text',
  };

  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-widest text-cyber-muted font-sans">{label}</p>
      <p className={`text-2xl font-mono font-bold ${colors[variant]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-sm text-cyber-muted ml-1">{unit}</span>}
      </p>
    </div>
  );
}
