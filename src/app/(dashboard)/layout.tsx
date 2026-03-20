'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';

const payerNav = [
  { href: '/overview',      label: 'Overview' },
  { href: '/wallet',        label: 'Wallets' },
  { href: '/schedules',     label: 'Payments' },
  { href: '/expenses',      label: 'Expenses' },
  { href: '/transactions',  label: 'Txns' },
];

const recipientNav = [
  { href: '/overview',  label: 'Overview' },
  { href: '/wallet',    label: 'Wallets' },
  { href: '/expenses',  label: 'Expenses' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { theme, toggle } = useTheme();
  const role = (session?.user as any)?.role;
  const navItems = role === 'RECIPIENT' ? recipientNav : payerNav;

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-cyber-muted font-mono text-sm animate-pulse">Loading...</span>
      </div>
    );
  }

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-cyber-bg">

      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-48 flex-col border-r border-cyber-border bg-cyber-surface z-20">
        <div className="px-4 py-5 border-b border-cyber-border">
          <span className="text-cyber-text font-mono font-semibold tracking-widest text-sm">
            PUNKPAY
          </span>
          <p className="text-cyber-muted text-xs mt-0.5 font-mono">v0.1</p>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded text-sm font-mono transition-colors ${
                  isActive
                    ? 'bg-neon-green/8 text-neon-green'
                    : 'text-cyber-muted hover:text-cyber-text hover:bg-cyber-card'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-cyber-border space-y-3">
          <div>
            <p className="text-xs text-cyber-muted font-mono truncate">{session.user?.email}</p>
            <p className="text-xs text-neon-amber font-mono mt-0.5">{role}</p>
          </div>
          <button
            onClick={toggle}
            className="w-full text-left text-xs text-cyber-muted hover:text-cyber-text font-mono transition-colors py-0.5"
          >
            {theme === 'grain' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full text-left text-xs text-cyber-muted hover:text-neon-red font-mono transition-colors py-0.5"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 lg:ml-48 pb-20 lg:pb-0 min-h-screen">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-cyber-border bg-cyber-surface/95 backdrop-blur-sm">
          <span className="text-cyber-text font-mono font-semibold tracking-widest text-sm">PUNKPAY</span>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="text-xs text-cyber-muted hover:text-cyber-text font-mono transition-colors"
            >
              {theme === 'grain' ? 'Light' : 'Dark'}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-cyber-muted hover:text-neon-red font-mono transition-colors"
            >
              Out
            </button>
          </div>
        </div>

        <div className="px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 max-w-3xl mx-auto">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 border-t border-cyber-border bg-cyber-surface/95 backdrop-blur-sm">
        <div className="flex">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 py-3 text-center text-xs font-mono transition-colors ${
                  isActive
                    ? 'text-neon-green'
                    : 'text-cyber-muted hover:text-cyber-text'
                }`}
              >
                <span className={`block w-1 h-1 rounded-full mx-auto mb-1 transition-colors ${isActive ? 'bg-neon-green' : 'bg-transparent'}`} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}
