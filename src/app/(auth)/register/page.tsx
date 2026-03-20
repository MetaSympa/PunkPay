'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonButton } from '@/components/ui/neon-button';

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

  const [tgStep, setTgStep] = useState<TelegramStep>('link');
  const [botUrl, setBotUrl] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [tgUsername, setTgUsername] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  async function startLink() {
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/telegram-link');
      const data = await res.json();
      setLinkToken(data.token); setBotUrl(data.botUrl);
      window.open(data.botUrl, '_blank');
      pollRef.current = setInterval(async () => {
        const check = await fetch('/api/auth/telegram-link', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.token }),
        });
        const result = await check.json();
        if (result.linked) {
          clearInterval(pollRef.current!);
          setTgUsername(result.username); setTgChatId(result.chatId); setTgStep('otp');
        }
      }, 2000);
    } catch { setError('LINK_FAILED'); } finally { setLoading(false); }
  }

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  async function handleSendOtp() {
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: tgChatId, purpose: 'register' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
    } catch { setError('OTP_SEND_FAILED'); } finally { setLoading(false); }
  }

  async function handleTelegramRegister(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: tgChatId, code: otpCode, purpose: 'register', email, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      router.push('/login');
    } catch { setError('REGISTRATION_FAILED'); } finally { setLoading(false); }
  }

  async function handlePasswordRegister(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (password !== confirmPassword) { setError('PASSWORDS_DO_NOT_MATCH'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.details?.map((d: any) => d.message).join(' · ') || data.error || 'REGISTRATION_FAILED');
        return;
      }
      router.push('/login');
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
          <span className="text-[11px] text-neon-green uppercase tracking-[0.15em] font-mono">NEW_IDENTITY</span>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight">REGISTER</h1>
            <p className="text-cyber-muted text-xs font-mono mt-2 tracking-wider">CREATE_YOUR_IDENTITY</p>
          </div>

          {/* Method toggle */}
          <div className="flex rounded overflow-hidden border border-cyber-border">
            <button type="button" onClick={() => { setMethod('telegram'); setError(''); }}
              className={`flex-1 py-2.5 text-xs font-mono tracking-wider transition-all ${method === 'telegram' ? 'bg-neon-green text-cyber-bg font-semibold' : 'text-cyber-muted hover:text-cyber-text bg-cyber-surface'}`}>
              ⚡ TELEGRAM
            </button>
            <button type="button" onClick={() => { setMethod('password'); setError(''); }}
              className={`flex-1 py-2.5 text-xs font-mono tracking-wider transition-all ${method === 'password' ? 'bg-neon-green text-cyber-bg font-semibold' : 'text-cyber-muted hover:text-cyber-text bg-cyber-surface'}`}>
              🔑 PASSWORD
            </button>
          </div>

          {/* Role selector */}
          <div>
            <label className="sv-label">ROLE</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => setRole('PAYER')}
                className={`py-2.5 rounded border text-xs font-mono tracking-wider transition-all ${role === 'PAYER' ? 'border-neon-green bg-neon-green/10 text-neon-green' : 'border-cyber-border text-cyber-muted hover:text-cyber-text'}`}>
                PAYER
              </button>
              <button type="button" onClick={() => setRole('RECIPIENT')}
                className={`py-2.5 rounded border text-xs font-mono tracking-wider transition-all ${role === 'RECIPIENT' ? 'border-neon-amber bg-neon-amber/10 text-neon-amber' : 'border-cyber-border text-cyber-muted hover:text-cyber-text'}`}>
                RECIPIENT
              </button>
            </div>
          </div>

          {/* Telegram flow */}
          {method === 'telegram' && (
            <>
              {tgStep === 'link' && (
                <div className="space-y-4">
                  <p className="text-xs text-cyber-muted font-mono text-center tracking-wider">
                    LINK_TELEGRAM_TO_GET_STARTED
                  </p>
                  <NeonButton type="button" variant="primary" className="w-full" loading={loading} onClick={startLink}>
                    OPEN @PUNKPAYBOT
                  </NeonButton>
                  {botUrl && (
                    <div className="text-center space-y-2">
                      <div className="flex items-center gap-2 justify-center">
                        <span className="w-2 h-2 bg-neon-amber rounded-full animate-pulse" />
                        <span className="text-xs text-neon-amber font-mono">WAITING_FOR_BOT_MESSAGE...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tgStep === 'otp' && (
                <form onSubmit={handleTelegramRegister} className="space-y-4">
                  <div className="sv-card px-3 py-2.5 flex items-center gap-2">
                    <span className="w-2 h-2 bg-neon-green rounded-full" />
                    <span className="text-sm text-neon-green font-mono">@{tgUsername}</span>
                    <span className="text-[10px] text-cyber-muted font-mono ml-auto tracking-wider">LINKED</span>
                  </div>
                  <div>
                    <label className="sv-label">EMAIL</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      className="sv-input text-neon-green" required />
                  </div>
                  {!otpCode && (
                    <NeonButton type="button" variant="amber" className="w-full" loading={loading} onClick={handleSendOtp}>
                      SEND OTP TO TELEGRAM
                    </NeonButton>
                  )}
                  <div>
                    <label className="sv-label">OTP_CODE</label>
                    <input type="text" value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="sv-input text-center text-xl tracking-[0.5em] text-neon-green"
                      maxLength={6} required />
                  </div>
                  <NeonButton type="submit" variant="primary" className="w-full" loading={loading}>
                    VERIFY &amp; REGISTER
                  </NeonButton>
                </form>
              )}
            </>
          )}

          {/* Password form */}
          {method === 'password' && (
            <form onSubmit={handlePasswordRegister} className="space-y-4">
              <div>
                <label className="sv-label">EMAIL</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="sv-input text-neon-green" required />
              </div>
              <div>
                <label className="sv-label">PASSWORD</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 12 chars, upper, lower, number, special"
                  className="sv-input text-neon-green" required />
              </div>
              <div>
                <label className="sv-label">CONFIRM_PASSWORD</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="sv-input text-neon-green" required />
              </div>
              <NeonButton type="submit" variant="primary" className="w-full" loading={loading}>
                INITIALIZE IDENTITY
              </NeonButton>
            </form>
          )}

          {error && (
            <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2.5">
              [ERROR] {error}
            </div>
          )}

          <p className="text-center text-xs text-cyber-muted font-mono">
            ALREADY_REGISTERED?{' '}
            <Link href="/login" className="text-neon-green hover:underline">LOGIN</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
