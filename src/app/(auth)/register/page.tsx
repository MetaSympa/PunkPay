'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonButton } from '@/components/ui/neon-button';

type FieldErrors = Record<string, string[]>;

const PW_RULES = [
  { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { label: 'Uppercase letter',        test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter',        test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number',                  test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special character',       test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'PAYER' | 'RECIPIENT'>('RECIPIENT');
  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  async function handlePasswordRegister(e: React.FormEvent) {
    e.preventDefault();
    setGeneralError('');
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: ['Passwords do not match'] });
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
        if (data.issues?.length) {
          const errs: FieldErrors = {};
          for (const { path, message } of data.issues) {
            const key = path || 'general';
            if (!errs[key]) errs[key] = [];
            errs[key].push(message);
          }
          setFieldErrors(errs);
        } else {
          setGeneralError(data.error || 'REGISTRATION_FAILED');
        }
        return;
      }

      router.push('/login');
    } catch {
      setGeneralError('CONNECTION_ERROR');
    } finally {
      setLoading(false);
    }
  }

  const pwRulesVisible = pwFocused || password.length > 0;
  const allRulesMet = PW_RULES.every(r => r.test(password));

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

          <form onSubmit={handlePasswordRegister} className="space-y-4">
            {/* Email */}
            <div>
              <label className="sv-label">EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={`sv-input text-neon-green ${fieldErrors.email ? 'border-neon-red' : ''}`}
                required
              />
              {fieldErrors.email && (
                <p className="mt-1 text-[11px] font-mono text-neon-red">{fieldErrors.email.join(' · ')}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="sv-label">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setPwFocused(true)}
                onBlur={() => setPwFocused(false)}
                className={`sv-input text-neon-green ${fieldErrors.password ? 'border-neon-red' : ''}`}
                required
              />
              {fieldErrors.password && (
                <p className="mt-1 text-[11px] font-mono text-neon-red">{fieldErrors.password.join(' · ')}</p>
              )}
              {/* Password requirements checklist */}
              {pwRulesVisible && !allRulesMet && (
                <ul className="mt-2 space-y-0.5">
                  {PW_RULES.map(rule => {
                    const ok = rule.test(password);
                    return (
                      <li key={rule.label} className={`text-[11px] font-mono flex items-center gap-1.5 ${ok ? 'text-neon-green' : 'text-cyber-muted'}`}>
                        <span>{ok ? '✓' : '○'}</span>
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="sv-label">CONFIRM_PASSWORD</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={`sv-input text-neon-green ${fieldErrors.confirmPassword ? 'border-neon-red' : ''}`}
                required
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-[11px] font-mono text-neon-red">{fieldErrors.confirmPassword.join(' · ')}</p>
              )}
            </div>

            <NeonButton type="submit" variant="primary" className="w-full" loading={loading}>
              INITIALIZE IDENTITY
            </NeonButton>
          </form>

          {/* General / server error */}
          {generalError && (
            <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2.5">
              [ERROR] {generalError}
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
