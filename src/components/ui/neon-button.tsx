import { ButtonHTMLAttributes, ReactNode } from 'react';

interface NeonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'green' | 'amber' | 'red' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

export function NeonButton({
  variant = 'green',
  size = 'md',
  children,
  loading,
  disabled,
  className = '',
  ...props
}: NeonButtonProps) {
  const variants = {
    green: 'border-neon-green text-neon-green hover:bg-neon-green/10 active:bg-neon-green/20',
    amber: 'border-neon-amber text-neon-amber hover:bg-neon-amber/10 active:bg-neon-amber/20',
    red:   'border-neon-red   text-neon-red   hover:bg-neon-red/10   active:bg-neon-red/20',
    ghost: 'border-cyber-border text-cyber-muted hover:text-cyber-text hover:border-cyber-muted',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      className={`
        border rounded font-mono tracking-wide
        transition-colors duration-150
        disabled:opacity-30 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
