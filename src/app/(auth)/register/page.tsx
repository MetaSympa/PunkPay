'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'PAYER' | 'RECIPIENT'>('RECIPIENT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.details?.length) {
          setError(data.details.map((d: any) => d.message).join(' · '));
        } else {
          setError(data.error || 'Registration failed');
        }
        return;
      }

      router.push('/login');
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <TerminalCard title="new identity" className="w-full max-w-md">
        <div className="space-y-6">
          <div className="text-center">
            <GlitchText text="REGISTER" as="h1" className="text-2xl font-bold text-neon-green" />
            <p className="text-cyber-muted text-sm mt-2">Create your identity</p>
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
                placeholder="Min 12 chars, upper, lower, number, special"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">
                Role
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="PAYER"
                    checked={role === 'PAYER'}
                    onChange={() => setRole('PAYER')}
                    className="accent-neon-green"
                  />
                  <span className="text-sm text-neon-green">Payer</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="RECIPIENT"
                    checked={role === 'RECIPIENT'}
                    onChange={() => setRole('RECIPIENT')}
                    className="accent-neon-amber"
                  />
                  <span className="text-sm text-neon-amber">Recipient</span>
                </label>
              </div>
            </div>

            {error && (
              <div className="text-neon-red text-sm font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">
                {error}
              </div>
            )}

            <NeonButton type="submit" variant="green" className="w-full" loading={loading}>
              Initialize Identity
            </NeonButton>
          </form>

          <p className="text-center text-sm text-cyber-muted">
            Already registered?{' '}
            <Link href="/login" className="text-neon-green hover:underline">
              Login
            </Link>
          </p>
        </div>
      </TerminalCard>
    </main>
  );
}
