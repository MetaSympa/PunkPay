'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';

type AuthMethod = 'password' | 'telegram';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>('telegram');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Telegram state
  const [botUrl, setBotUrl] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [tgUsername, setTgUsername] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgLinked, setTgLinked] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  async function startLink() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/telegram-link');
      const data = await res.json();
      setLinkToken(data.token);
      setBotUrl(data.botUrl);
      window.open(data.botUrl, '_blank');

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
          setTgLinked(true);
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
        body: JSON.stringify({ telegramChatId: tgChatId, purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setOtpSent(true);
    } catch {
      setError('Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleTelegramLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('telegram-otp', {
        telegramChatId: tgChatId,
        code: otpCode,
        redirect: false,
      });
      if (result?.error) {
        setError('Invalid or expired OTP');
      } else {
        router.push('/overview');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email, password,
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

          {/* Telegram login */}
          {method === 'telegram' && (
            <>
              {!tgLinked && (
                <div className="space-y-4">
                  <p className="text-sm text-cyber-muted font-mono text-center">
                    Verify via Telegram to login
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

              {tgLinked && (
                <form onSubmit={handleTelegramLogin} className="space-y-4">
                  <div className="pp-card px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-neon-green rounded-full" />
                    <span className="text-sm text-neon-green font-mono">@{tgUsername}</span>
                    <span className="text-xs text-cyber-muted font-mono ml-auto">linked</span>
                  </div>

                  {!otpSent ? (
                    <NeonButton type="button" variant="amber" className="w-full" loading={loading} onClick={handleSendOtp}>
                      Send OTP to Telegram
                    </NeonButton>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">OTP Code</label>
                        <input type="text" value={otpCode}
                          onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6-digit code"
                          className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-center text-xl tracking-[0.5em] focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors"
                          maxLength={6} required />
                        <p className="text-xs text-cyber-muted mt-1 font-mono">Check your Telegram</p>
                      </div>
                      <NeonButton type="submit" variant="green" className="w-full" loading={loading}>
                        Authenticate
                      </NeonButton>
                    </>
                  )}
                </form>
              )}
            </>
          )}

          {/* Password login */}
          {method === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="satoshi@bitcoin.org"
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors" required />
              </div>
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-green focus:outline-none focus:ring-1 focus:ring-neon-green/50 transition-colors" required />
              </div>
              {showTotp && (
                <div>
                  <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">2FA Code</label>
                  <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value)}
                    placeholder="000000" maxLength={6}
                    className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono tracking-[0.5em] text-center focus:border-neon-amber focus:outline-none focus:ring-1 focus:ring-neon-amber/50 transition-colors" />
                </div>
              )}
              <button type="button" onClick={() => setShowTotp(!showTotp)} className="text-xs text-cyber-muted hover:text-neon-amber transition-colors">
                {showTotp ? '- Hide 2FA' : '+ I have 2FA enabled'}
              </button>
              <NeonButton type="submit" variant="green" className="w-full" loading={loading}>
                Authenticate
              </NeonButton>
            </form>
          )}

          {error && (
            <div className="text-neon-red text-sm font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <p className="text-center text-sm text-cyber-muted">
            No identity?{' '}
            <Link href="/register" className="text-neon-green hover:underline">Create one</Link>
          </p>
        </div>
      </TerminalCard>
    </main>
  );
}
