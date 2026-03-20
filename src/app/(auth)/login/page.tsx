'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        totpCode: showTotp ? totpCode : undefined,
        redirect: false,
      });

      if (result?.error) {
        setError('Authentication failed. Check credentials.');
      } else {
        router.push('/overview');
      }
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <TerminalCard title="authentication" className="w-full max-w-md">
        <div className="space-y-6">
          <div className="text-center">
            <GlitchText text="LOGIN" as="h1" className="text-2xl font-bold text-neon-green" />
            <p className="text-cyber-muted text-sm mt-2">Identify yourself</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors"
                placeholder="satoshi@bitcoin.org"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors"
                placeholder="••••••••••••"
                required
              />
            </div>

            {showTotp && (
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
                  2FA Code
                </label>
                <input
                  type="text"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono tracking-[0.5em] text-center focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber/50 transition-colors"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowTotp(!showTotp)}
              className="text-xs text-cyber-muted hover:text-neon-amber transition-colors"
            >
              {showTotp ? '- Hide 2FA' : '+ I have 2FA enabled'}
            </button>

            {error && (
              <div className="text-neon-red text-sm font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">
                {error}
              </div>
            )}

            <NeonButton type="submit" variant="green" className="w-full" loading={loading}>
              Authenticate
            </NeonButton>
          </form>

          <p className="text-center text-sm text-cyber-muted">
            No identity?{' '}
            <Link href="/register" className="text-neon-green hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </TerminalCard>
    </main>
  );
}
