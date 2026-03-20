import { ReactNode } from 'react';

interface TerminalCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'amber' | 'red';
}

export function TerminalCard({ title, children, className = '', variant = 'default' }: TerminalCardProps) {
  const accent = {
    default: 'text-neon-green',
    amber:   'text-neon-amber',
    red:     'text-neon-red',
  }[variant];

  return (
    <div className={`pp-card ${className}`}>
      {title && (
        <div className="px-4 py-3 border-b border-cyber-border">
          <span className={`text-xs uppercase tracking-widest font-mono ${accent}`}>
            {title}
          </span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
