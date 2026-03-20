'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState, useEffect } from 'react';

/* ── Nav icons (inline SVG for each tab) ─────────────────────────────── */

function IconTerminal({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconNodes({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function IconAutoPay({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}

function IconLogs({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconExpenses({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

/* ── Layout config ────────────────────────────────────────────────────── */

const payerNav = [
  { href: '/overview',      label: 'TERMINAL',  icon: IconTerminal },
  { href: '/wallet',        label: 'NODES',     icon: IconNodes },
  { href: '/schedules',     label: 'AUTOPAY',   icon: IconAutoPay },
  { href: '/expenses',      label: 'CLAIMS',    icon: IconExpenses },
  { href: '/transactions',  label: 'LOGS',      icon: IconLogs },
];

const recipientNav = [
  { href: '/overview',  label: 'TERMINAL',  icon: IconTerminal },
  { href: '/wallet',    label: 'NODES',     icon: IconNodes },
  { href: '/expenses',  label: 'CLAIMS',    icon: IconExpenses },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [latency, setLatency] = useState(14);
  const role = (session?.user as any)?.role;
  const navItems = role === 'RECIPIENT' ? recipientNav : payerNav;

  // Simulate latency ping
  useEffect(() => {
    const id = setInterval(() => setLatency(Math.floor(8 + Math.random() * 20)), 5000);
    return () => clearInterval(id);
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-neon-green font-mono text-sm animate-pulse">INITIALIZING_SYSTEM...</span>
      </div>
    );
  }

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-cyber-bg flex flex-col">
      {/* ── Top status bar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-cyber-border bg-cyber-surface/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-neon-green flex items-center justify-center">
              <span className="text-neon-green text-[10px] font-bold">₿</span>
            </div>
            <span className="text-neon-green font-mono font-semibold text-sm tracking-wider">
              PUNKPAY_V0.1
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-cyber-muted hidden sm:block">
              SYSTEM_HEALTH: <span className="text-neon-green">OPTIMAL</span>
            </span>
            <span className="text-xs font-mono text-neon-amber hidden sm:block">
              LATENCY: {latency}MS
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-cyber-muted hover:text-neon-red font-mono text-xs transition-colors"
              title="Sign out"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="6" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="19" cy="6" r="1.5" />
                <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
                <circle cx="5" cy="18" r="1.5" /><circle cx="12" cy="18" r="1.5" /><circle cx="19" cy="18" r="1.5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 pb-24">
        <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-6xl mx-auto">
          {children}
        </div>
      </main>

      {/* ── Bottom nav (Sovereign-style) ──────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-cyber-border bg-cyber-surface/95 backdrop-blur-sm">
        <div className="flex max-w-6xl mx-auto">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200 ${
                  isActive
                    ? 'sv-nav-active rounded-lg mx-1 my-1.5'
                    : 'text-cyber-muted hover:text-cyber-text'
                }`}
              >
                <Icon active={isActive} />
                <span className="text-[10px] font-mono tracking-wider">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
