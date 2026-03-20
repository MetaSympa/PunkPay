'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';

type AuthMethod = 'password' | 'telegram';
type TelegramStep = 'link' | 'otp' | 'done';

export default function RegisterPage() {
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>('telegram');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'PAYER' | 'RECIPIENT'>('RECIPIENT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Telegram state
  const [tgStep, setTgStep] = useState<TelegramStep>('link');
  const [botUrl, setBotUrl] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [tgUsername, setTgUsername] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Start telegram link flow
  async function startLink() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/telegram-link');
      const data = await res.json();
      setLinkToken(data.token);
      setBotUrl(data.botUrl);
      window.open(data.botUrl, '_blank');

      // Poll every 2s to check if user clicked the bot link
      pollRef.current = setInterval(async () => {
        const check = await fetch('/api/auth/telegram-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.token }),
        });
        const result = await check.json();
        if (result.linked) {
          clearInterval(pollRef.current!);
          setTgUsername(result.username);
          setTgChatId(result.chatId);
          setTgStep('otp');
        }
      }, 2000);
    } catch {
      setError('Failed to start Telegram link');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleSendOtp() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: tgChatId, purpose: 'register' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
    } catch {
      setError('Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleTelegramRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: tgChatId, code: otpCode, purpose: 'register', email, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      router.push('/login');
    } catch {
      setError('Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.details?.map((d: any) => d.message).join(' · ') || data.error || 'Registration failed');
        return;
      }
      router.push('/login');
    } catch {
      setError('Connection error');
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

          {/* Method toggle */}
          <div className="flex border border-cyber-border rounded overflow-hidden">
            <button type="button" onClick={() => { setMethod('telegram'); setError(''); }}
              className={`flex-1 py-2 text-xs font-mono tracking-wider transition-colors ${method === 'telegram' ? 'bg-neon-green/10 text-neon-green border-r border-cyber-border' : 'text-cyber-muted hover:text-cyber-text border-r border-cyber-border'}`}>
              ⚡ Telegram
            </button>
            <button type="button" onClick={() => { setMethod('password'); setError(''); }}
              className={`flex-1 py-2 text-xs font-mono tracking-wider transition-colors ${method === 'password' ? 'bg-neon-green/10 text-neon-green' : 'text-cyber-muted hover:text-cyber-text'}`}>
              🔑 Password
            </button>
          </div>

          {/* Telegram flow */}
          {method === 'telegram' && (
            <>
              {/* Step 1: Link telegram */}
              {tgStep === 'link' && (
                <div className="space-y-4">
                  <p className="text-sm text-cyber-muted font-mono text-center">
                    Link your Telegram account to get started
                  </p>
                  <NeonButton type="button" variant="green" className="w-full" loading={loading} onClick={startLink}>
                    {loading ? 'Waiting for Telegram...' : 'Open @PunkPaybot'}
                  </NeonButton>
                  {botUrl && (
                    <div className="text-center space-y-2">
                      <div className="flex items-center gap-2 justify-center">
                        <span className="w-2 h-2 bg-neon-amber rounded-full animate-pulse" />
                        <span className="text-xs text-neon-amber font-mono">Waiting for you to message the bot...</span>
                      </div>
                      <a href={botUrl} target="_blank" className="text-xs text-cyber-muted hover:text-neon-green font-mono underline">
                        Click here if it didn&apos;t open
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Enter details + OTP */}
              {tgStep === 'otp' && (
                <form onSubmit={handleTelegramRegister} className="space-y-4">
                  <div className="pp-card px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-neon-green rounded-full" />
                    <span className="text-sm text-neon-green font-mono">@{tgUsername}</span>
                    <span className="text-xs text-cyber-muted font-mono ml-auto">linked</span>
                  </div>

                  <div>
                    <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors" required />
                  </div>

                  <div>
                    <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Role</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="role" value="PAYER" checked={role === 'PAYER'} onChange={() => setRole('PAYER')} className="accent-neon-green" />
                        <span className="text-sm text-neon-green">Payer</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="role" value="RECIPIENT" checked={role === 'RECIPIENT'} onChange={() => setRole('RECIPIENT')} className="accent-neon-amber" />
                        <span className="text-sm text-neon-amber">Recipient</span>
                      </label>
                    </div>
                  </div>

                  {!otpCode && (
                    <NeonButton type="button" variant="amber" className="w-full" loading={loading} onClick={handleSendOtp}>
                      Send OTP to Telegram
                    </NeonButton>
                  )}

                  <div>
                    <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">OTP Code</label>
                    <input type="text" value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit code from Telegram"
                      className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-center text-xl tracking-[0.5em] focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors"
                      maxLength={6} required />
                  </div>

                  <NeonButton type="submit" variant="green" className="w-full" loading={loading}>
                    Verify &amp; Register
                  </NeonButton>
                </form>
              )}
            </>
          )}

          {/* Password form */}
          {method === 'password' && (
            <form onSubmit={handlePasswordRegister} className="space-y-4">
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors" required />
              </div>
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 12 chars, upper, lower, number, special"
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors" required />
              </div>
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors" required />
              </div>
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Role</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="role" value="PAYER" checked={role === 'PAYER'} onChange={() => setRole('PAYER')} className="accent-neon-green" />
                    <span className="text-sm text-neon-green">Payer</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="role" value="RECIPIENT" checked={role === 'RECIPIENT'} onChange={() => setRole('RECIPIENT')} className="accent-neon-amber" />
                    <span className="text-sm text-neon-amber">Recipient</span>
                  </label>
                </div>
              </div>
              <NeonButton type="submit" variant="green" className="w-full" loading={loading}>
                Initialize Identity
              </NeonButton>
            </form>
          )}

          {error && (
            <div className="text-neon-red text-sm font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <p className="text-center text-sm text-cyber-muted">
            Already registered?{' '}
            <Link href="/login" className="text-neon-green hover:underline">Login</Link>
          </p>
        </div>
      </TerminalCard>
    </main>
  );
}
