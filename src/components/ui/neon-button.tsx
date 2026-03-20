import { ButtonHTMLAttributes, ReactNode } from 'react';

interface NeonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'green' | 'amber' | 'red' | 'ghost' | 'primary';
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
    // Primary: solid green like the screenshots
    primary: 'bg-neon-green text-cyber-bg font-semibold hover:bg-neon-green/90 active:bg-neon-green/80 border-transparent',
    green:   'border-neon-green/40 text-neon-green hover:bg-neon-green/10 active:bg-neon-green/20',
    amber:   'border-neon-amber/40 text-neon-amber hover:bg-neon-amber/10 active:bg-neon-amber/20',
    red:     'border-neon-red/40 text-neon-red hover:bg-neon-red/10 active:bg-neon-red/20',
    ghost:   'border-cyber-border text-cyber-muted hover:text-cyber-text hover:border-cyber-muted',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-sm',
  };

  return (
    <button
      className={`
        border rounded font-mono uppercase tracking-wider
        transition-all duration-150
        disabled:opacity-30 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          <span>PROCESSING...</span>
        </span>
      ) : children}
    </button>
  );
}
