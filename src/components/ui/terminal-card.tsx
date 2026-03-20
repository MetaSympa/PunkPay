import { ReactNode } from 'react';

interface TerminalCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'amber' | 'red' | 'green';
  rightLabel?: string;
}

export function TerminalCard({ title, children, className = '', variant = 'default', rightLabel }: TerminalCardProps) {
  const accents = {
    default: 'border-l-cyber-border',
    green:   'border-l-neon-green',
    amber:   'border-l-neon-amber',
    red:     'border-l-neon-red',
  };

  return (
    <div className={`sv-card overflow-hidden ${className}`}>
      {title && (
        <div className={`px-4 py-3 border-b border-cyber-border flex items-center justify-between ${title ? 'border-l-2 ' + accents[variant] : ''}`}>
          <span className="text-[11px] uppercase tracking-[0.15em] font-mono text-neon-green">
            {title}
          </span>
          {rightLabel && (
            <span className="text-[10px] uppercase tracking-wider font-mono text-cyber-muted">
              {rightLabel}
            </span>
          )}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
