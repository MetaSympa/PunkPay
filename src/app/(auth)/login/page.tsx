'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonButton } from '@/components/ui/neon-button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await signIn('credentials', {
        email, password, totpCode: showTotp ? totpCode : undefined, redirect: false,
      });
      if (result?.error) setError('AUTH_FAILED: CHECK_CREDENTIALS');
      else router.push('/overview');
    } catch { setError('CONNECTION_ERROR'); } finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 relative">
      {/* Corner brackets */}
      <div className="absolute inset-4 sm:inset-8 pointer-events-none">
        <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-neon-purple/30" />
        <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-neon-purple/30" />
        <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-neon-purple/30" />
        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-neon-purple/30" />
      </div>

      <div className="w-full max-w-md sv-card overflow-hidden">
        <div className="px-6 py-4 border-b border-cyber-border border-l-2 border-l-neon-green">
          <span className="text-[11px] text-neon-green uppercase tracking-[0.15em] font-mono">AUTHENTICATION</span>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight">LOGIN</h1>
            <p className="text-cyber-muted text-xs font-mono mt-2 tracking-wider">IDENTIFY_YOURSELF</p>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="sv-label">EMAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="satoshi@bitcoin.org" className="sv-input text-neon-green" required />
            </div>
            <div>
              <label className="sv-label">PASSWORD</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••" className="sv-input text-neon-green" required />
            </div>
            {showTotp && (
              <div>
                <label className="sv-label">2FA_CODE</label>
                <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value)}
                  placeholder="000000" maxLength={6}
                  className="sv-input text-center text-xl tracking-[0.5em] text-neon-amber" />
              </div>
            )}
            <button type="button" onClick={() => setShowTotp(!showTotp)} className="text-xs text-cyber-muted hover:text-neon-amber transition-colors font-mono">
              {showTotp ? '- HIDE_2FA' : '+ ENABLE_2FA'}
            </button>
            <NeonButton type="submit" variant="primary" className="w-full" loading={loading}>
              AUTHENTICATE
            </NeonButton>
          </form>

          {error && (
            <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2.5">
              [ERROR] {error}
            </div>
          )}

          <p className="text-center text-xs text-cyber-muted font-mono">
            NO_IDENTITY?{' '}
            <Link href="/register" className="text-neon-green hover:underline">CREATE_ONE</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
