'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonButton } from '@/components/ui/neon-button';

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
          setTgUsername(result.username); setTgChatId(result.chatId); setTgLinked(true);
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
        body: JSON.stringify({ telegramChatId: tgChatId, purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setOtpSent(true);
    } catch { setError('OTP_SEND_FAILED'); } finally { setLoading(false); }
  }

  async function handleTelegramLogin(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await signIn('telegram-otp', { telegramChatId: tgChatId, code: otpCode, redirect: false });
      if (result?.error) setError('INVALID_OTP');
      else router.push('/overview');
    } catch { setError('CONNECTION_ERROR'); } finally { setLoading(false); }
  }

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
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyber-border border-l-2 border-l-neon-green">
          <span className="text-[11px] text-neon-green uppercase tracking-[0.15em] font-mono">AUTHENTICATION</span>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight">LOGIN</h1>
            <p className="text-cyber-muted text-xs font-mono mt-2 tracking-wider">IDENTIFY_YOURSELF</p>
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

          {/* Telegram login */}
          {method === 'telegram' && (
            <>
              {!tgLinked && (
                <div className="space-y-4">
                  <p className="text-xs text-cyber-muted font-mono text-center tracking-wider">
                    VERIFY_VIA_TELEGRAM_TO_LOGIN
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
                      <a href={botUrl} target="_blank" className="text-xs text-cyber-muted hover:text-neon-green font-mono underline">
                        Click here if it didn&apos;t open
                      </a>
                    </div>
                  )}
                </div>
              )}
              {tgLinked && (
                <form onSubmit={handleTelegramLogin} className="space-y-4">
                  <div className="sv-card px-3 py-2.5 flex items-center gap-2">
                    <span className="w-2 h-2 bg-neon-green rounded-full" />
                    <span className="text-sm text-neon-green font-mono">@{tgUsername}</span>
                    <span className="text-[10px] text-cyber-muted font-mono ml-auto tracking-wider">LINKED</span>
                  </div>
                  {!otpSent ? (
                    <NeonButton type="button" variant="amber" className="w-full" loading={loading} onClick={handleSendOtp}>
                      SEND OTP TO TELEGRAM
                    </NeonButton>
                  ) : (
                    <>
                      <div>
                        <label className="sv-label">OTP_CODE</label>
                        <input type="text" value={otpCode}
                          onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          className="sv-input text-center text-xl tracking-[0.5em] text-neon-green"
                          maxLength={6} required />
                        <p className="text-[10px] text-cyber-muted mt-1.5 font-mono tracking-wider">CHECK_YOUR_TELEGRAM</p>
                      </div>
                      <NeonButton type="submit" variant="primary" className="w-full" loading={loading}>
                        AUTHENTICATE
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
          )}

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
