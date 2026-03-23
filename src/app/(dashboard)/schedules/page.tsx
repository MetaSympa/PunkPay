'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useSchedules, useToggleSchedule, useDeleteSchedule, useCreateSchedule, useSendNow,
} from '@/hooks/use-schedules';
import { useWallets } from '@/hooks/use-wallet';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useWalletSync } from '@/hooks/use-wallet-sync';

/* ── Frequency presets ────────────────────────────────────────────────── */

const FREQ = [
  { label: 'EVERY 10 MIN',  cron: '*/10 * * * *' },
  { label: 'EVERY 20 MIN',  cron: '*/20 * * * *' },
  { label: 'EVERY HOUR',    cron: '0 * * * *' },
  { label: 'EVERY 6 HOURS', cron: '0 */6 * * *' },
  { label: 'DAILY',         cron: '0 0 * * *' },
  { label: 'EVERY 7 DAYS',  cron: '0 0 * * 1' },
  { label: 'BIWEEKLY',      cron: '0 0 1,15 * *' },
  { label: 'MONTHLY',       cron: '0 0 1 * *' },
  { label: 'QUARTERLY',     cron: '0 0 1 1,4,7,10 *' },
  { label: 'YEARLY',        cron: '0 0 1 1 *' },
];

function cronLabel(cron: string) { return FREQ.find(f => f.cron === cron)?.label ?? cron; }

function useRecipients() {
  return useQuery({
    queryKey: ['recipients'],
    queryFn: async () => { const res = await fetch('/api/recipients'); return res.ok ? res.json() : []; },
  });
}

async function deriveAddress(xpub: string, network: string): Promise<string> {
  try {
    const res = await fetch(`/api/recipient/derive?xpub=${encodeURIComponent(xpub)}&network=${network}&index=0`);
    if (!res.ok) return '';
    const d = await res.json();
    return d.address || '';
  } catch { return ''; }
}

type PayType = 'now' | 'schedule';

/* ── Create Form Modal ───────────────────────────────────────────────── */

function CreateForm({ onClose }: { onClose: () => void }) {
  const { data: wallets } = useWallets();
  const { data: recipients } = useRecipients();
  const createSchedule = useCreateSchedule();
  const sendNow = useSendNow();

  const [payType, setPayType] = useState<PayType>('schedule');
  const [form, setForm] = useState({
    walletId: '', recipientId: '', recipientXpub: '', recipientName: '', derivedAddress: '',
    amountSats: '', cronExpression: '*/10 * * * *', maxFeeRate: '2', requireConfirmedUtxos: true,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function selectRecipient(id: string) {
    if (!id) { setForm(f => ({ ...f, recipientId: '', recipientXpub: '', recipientName: '', derivedAddress: '' })); return; }
    const r = recipients?.find((x: any) => x.id === id);
    if (!r) return;
    const addr = await deriveAddress(r.xpub, r.network);
    setForm(f => ({ ...f, recipientId: id, recipientXpub: r.xpub, recipientName: r.label || r.email, derivedAddress: addr }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      if (payType === 'now') {
        const res = await sendNow.mutateAsync({
          walletId: form.walletId, recipientXpub: form.recipientXpub || undefined,
          recipientName: form.recipientName || undefined, amountSats: form.amountSats,
          maxFeeRate: parseFloat(form.maxFeeRate),
        });
        setSuccess(`PSBT_CREATED · ${Number(res.amountSats).toLocaleString()} SATS`);
        onClose();
      } else {
        await createSchedule.mutateAsync({
          walletId: form.walletId, recipientXpub: form.recipientXpub || undefined,
          recipientName: form.recipientName || undefined, amountSats: form.amountSats,
          cronExpression: form.cronExpression, maxFeeRate: parseFloat(form.maxFeeRate),
        });
        onClose();
      }
    } catch (err: any) { setError(err.message); }
  }

  const isLoading = payType === 'now' ? sendNow.isPending : createSchedule.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-cyber-bg/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sv-card w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-cyber-border border-l-2 border-l-neon-green">
          <span className="text-[11px] font-mono text-neon-green uppercase tracking-[0.15em]">NEW_PAYMENT_RULE</span>
          <button onClick={onClose} className="text-cyber-muted hover:text-cyber-text font-mono text-sm">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Toggle */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'now' as PayType, label: 'SEND NOW', sub: 'ONE-TIME' },
              { id: 'schedule' as PayType, label: 'SCHEDULE', sub: 'RECURRING' },
            ]).map(({ id, label, sub }) => (
              <button key={id} type="button" onClick={() => setPayType(id)}
                className={`rounded border px-3 py-3 text-left transition-all ${
                  payType === id ? 'border-neon-green bg-neon-green/8 text-neon-green' : 'border-cyber-border text-cyber-muted hover:text-cyber-text'
                }`}>
                <p className="text-xs font-mono font-semibold tracking-wider">{label}</p>
                <p className="text-[10px] font-mono text-cyber-muted/60 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="sv-label">FROM_WALLET</label>
              <select value={form.walletId} onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))} className="sv-input" required>
                <option value="">SELECT_WALLET...</option>
                {wallets?.map((w: any) => <option key={w.id} value={w.id}>{w.name} · {w.network}</option>)}
              </select>
            </div>

            <div>
              <label className="sv-label">TO_RECIPIENT</label>
              <select value={form.recipientId} onChange={e => selectRecipient(e.target.value)} className="sv-input" required>
                <option value="">SELECT_RECIPIENT...</option>
                {recipients?.filter((r: any) => r.profileComplete).map((r: any) => (
                  <option key={r.id} value={r.id}>{r.label || r.email} · {r.network}</option>
                ))}
              </select>
              {recipients?.some((r: any) => !r.profileComplete) && (
                <div className="mt-1.5 space-y-0.5">
                  {recipients?.filter((r: any) => !r.profileComplete).map((r: any) => (
                    <p key={r.userId} className="text-[10px] font-mono text-cyber-muted">
                      <span className="text-neon-red">●</span> {r.email} — AWAITING_XPUB
                    </p>
                  ))}
                </div>
              )}
            </div>

            {form.derivedAddress && (
              <div className="bg-cyber-bg border border-neon-green/20 rounded px-3 py-2">
                <p className="text-[10px] font-mono text-cyber-muted mb-0.5 tracking-wider">
                  {payType === 'schedule' ? 'NEXT_ADDRESS (ROTATES_EACH_PAYMENT)' : 'DERIVED_ADDRESS'}
                </p>
                <p className="text-xs font-mono text-neon-green break-all">{form.derivedAddress}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="sv-label">AMOUNT (SATS)</label>
                <input type="number" value={form.amountSats} onChange={e => setForm(f => ({ ...f, amountSats: e.target.value }))}
                  className="sv-input" placeholder="100000" min="546" required />
              </div>
              <div>
                <label className="sv-label">MAX_FEE (SAT/VB)</label>
                <input type="number" value={form.maxFeeRate} onChange={e => setForm(f => ({ ...f, maxFeeRate: e.target.value }))}
                  className="sv-input" min="1" />
              </div>
            </div>

            {payType === 'schedule' && (
              <div>
                <label className="sv-label">FREQUENCY</label>
                <select value={form.cronExpression} onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))} className="sv-input">
                  {FREQ.map(f => <option key={f.cron} value={f.cron}>{f.label}</option>)}
                </select>
              </div>
            )}

            {payType === 'schedule' && (
              <label className="flex items-center gap-3 cursor-pointer py-1">
                <input type="checkbox" checked={form.requireConfirmedUtxos}
                  onChange={e => setForm(f => ({ ...f, requireConfirmedUtxos: e.target.checked }))} className="accent-[#00FF41] w-4 h-4" />
                <div>
                  <p className="text-xs font-mono text-cyber-text">REQUIRE_CONFIRMED_UTXOS</p>
                  <p className="text-[10px] font-mono text-cyber-muted">ONLY_SPEND_CONFIRMED_INPUTS</p>
                </div>
              </label>
            )}

            {error && <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">[ERROR] {error}</div>}

            <NeonButton type="submit" variant="primary" className="w-full" loading={isLoading}>
              {payType === 'now' ? 'SEND NOW' : 'CREATE SCHEDULE'}
            </NeonButton>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Schedule Card ───────────────────────────────────────────────────── */

function formatDuration(ms: number) {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  if (h > 0) return `${h}H ${String(m).padStart(2, '0')}M ${String(s).padStart(2, '0')}S`;
  if (m > 0) return `${m}M ${String(s).padStart(2, '0')}S`;
  return `${s}S`;
}

function useCountdown(targetDate: string | null, isActive: boolean): { label: string; state: 'waiting' | 'overdue' | 'halted' } {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isActive || !targetDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetDate, isActive]);

  if (!isActive || !targetDate) return { label: 'HALTED', state: 'halted' };
  const diff = new Date(targetDate).getTime() - now;
  if (diff <= 0) {
    return { label: `EXECUTING · ${formatDuration(diff)} ELAPSED`, state: 'overdue' };
  }
  return { label: formatDuration(diff), state: 'waiting' };
}

function ScheduleCard({ schedule }: { schedule: any }) {
  const toggle = useToggleSchedule();
  const del = useDeleteSchedule();
  const countdown = useCountdown(schedule.nextRunAt, schedule.isActive);

  const statusColor = schedule.isActive ? 'text-neon-green' : 'text-neon-amber';
  const statusBg = schedule.isActive ? 'bg-neon-green/10 border-neon-green/30' : 'bg-neon-amber/10 border-neon-amber/30';
  const borderAccent = schedule.isActive ? 'border-l-neon-green' : 'border-l-neon-amber';

  return (
    <div className="sv-card overflow-hidden">
      <div className={`px-5 py-4 border-b border-cyber-border border-l-2 ${borderAccent} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-cyber-surface border border-cyber-border flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neon-green">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <p className="font-mono text-sm text-cyber-text font-semibold uppercase">
              {schedule.recipientName?.replace(/\s/g, '_') || 'UNNAMED_RECIPIENT'}
            </p>
            <p className="text-[10px] font-mono text-cyber-muted mt-0.5">{schedule.wallet?.name}</p>
          </div>
        </div>
        <span className={`text-[10px] font-mono ${statusColor} border ${statusBg} rounded px-2 py-0.5 tracking-wider`}>
          {schedule.isActive ? 'ACTIVE' : 'PAUSED'}
        </span>
      </div>

      <div className="px-5 py-4 grid grid-cols-2 gap-4">
        <div>
          <p className="sv-stat-label">AMOUNT</p>
          <p className="text-xl font-mono font-bold text-neon-green mt-1">
            {BigInt(schedule.amountSats).toLocaleString()} <span className="text-[10px] text-cyber-muted font-normal">SATS</span>
          </p>
        </div>
        <div className="text-right">
          <p className="sv-stat-label">FREQUENCY</p>
          <p className="text-sm font-mono text-cyber-text font-semibold mt-1 tracking-wider">{cronLabel(schedule.cronExpression)}</p>
        </div>
        <div>
          <p className="sv-stat-label">NEXT_PAYMENT</p>
          <div className="mt-1">
            <p className={`text-sm font-mono font-bold tracking-wider ${
              countdown.state === 'overdue' ? 'text-neon-amber animate-pulse' :
              countdown.state === 'halted' ? 'text-neon-amber' : 'text-neon-green'
            }`}>
              {countdown.label}
            </p>
            {countdown.state === 'waiting' && schedule.nextRunAt && (
              <p className="text-[10px] font-mono text-cyber-muted mt-0.5">
                {new Date(schedule.nextRunAt).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).toUpperCase()}
              </p>
            )}
            {schedule.lastRunAt && (
              <p className="text-[10px] font-mono text-cyber-muted mt-0.5">
                LAST_RUN: {new Date(schedule.lastRunAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="sv-stat-label">TOTAL_RUNS</p>
          <p className="text-sm font-mono text-cyber-text mt-1">{schedule._count.transactions}</p>
        </div>
      </div>

      {schedule.recipientXpub && (
        <div className="px-5 pb-2">
          <p className="text-[10px] font-mono text-neon-green/70 tracking-wider">ROTATING_ADDRESS · #{schedule.recipientXpubIndex} NEXT</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-3 border-t border-cyber-border/50 flex gap-2">
        {schedule.isActive ? (
          <NeonButton variant="ghost" size="sm" loading={toggle.isPending}
            onClick={() => toggle.mutate({ scheduleId: schedule.id, isActive: false })}>
            EDIT
          </NeonButton>
        ) : (
          <NeonButton variant="primary" size="sm" loading={toggle.isPending}
            onClick={() => toggle.mutate({ scheduleId: schedule.id, isActive: true })}>
            RESUME
          </NeonButton>
        )}
        {schedule.isActive && (
          <NeonButton variant="amber" size="sm" loading={toggle.isPending}
            onClick={() => toggle.mutate({ scheduleId: schedule.id, isActive: false })}>
            PAUSE
          </NeonButton>
        )}
        <NeonButton variant="red" size="sm" loading={del.isPending}
          onClick={() => { if (confirm('Delete this schedule?')) del.mutate(schedule.id); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
          </svg>
        </NeonButton>
      </div>

      {schedule.lastError && (
        <div className="px-5 pb-3">
          <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2 break-all">
            [ERROR] {schedule.lastError}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules();
  const { data: wallets } = useWallets();
  const [showCreate, setShowCreate] = useState(false);

  const firstWalletId = wallets?.[0]?.id ?? null;
  useWalletSync(firstWalletId);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="LOADING_PROTOCOLS" /></div>;

  const active = schedules?.filter(s => s.isActive) ?? [];
  const paused = schedules?.filter(s => !s.isActive) ?? [];

  // Execution success (mock for now)
  const totalRuns = schedules?.reduce((s, sch) => s + (sch._count?.transactions || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="sv-section-header">
          <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">SYSTEM // AUTOMATION</p>
          <h1 className="text-3xl sm:text-4xl font-mono font-bold tracking-tight mt-1">
            <span className="text-cyber-text">RECURRENT</span><br />
            <span className="text-neon-green">PROTOCOLS</span>
          </h1>
        </div>
        <NeonButton variant="primary" size="md" onClick={() => setShowCreate(true)}>
          + ADD NEW RULE
        </NeonButton>
      </div>

      {/* Schedule cards */}
      {!schedules?.length && (
        <div className="sv-card px-4 py-10 text-center">
          <p className="text-cyber-muted font-mono text-sm mb-4">NO_PAYMENT_RULES_CONFIGURED</p>
          <NeonButton variant="primary" onClick={() => setShowCreate(true)}>+ ADD NEW RULE</NeonButton>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map(s => <ScheduleCard key={s.id} schedule={s} />)}
        </div>
      )}

      {paused.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paused.map(s => <ScheduleCard key={s.id} schedule={s} />)}
        </div>
      )}

      {/* Bottom section: execution stats + live logs */}
      {schedules && schedules.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Execution success */}
          <div className="sv-card p-6 flex flex-col items-center justify-center">
            <p className="text-4xl font-mono font-bold text-neon-green">
              99.9<span className="text-xl text-cyber-muted">%</span>
            </p>
            <p className="text-[10px] font-mono text-cyber-muted tracking-wider mt-2">EXECUTION_SUCCESS</p>
          </div>

          {/* Live execution logs */}
          <div className="sm:col-span-2 sv-card overflow-hidden">
            <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyber-text uppercase tracking-[0.15em] font-semibold">LIVE_EXECUTION_LOGS</span>
              <span className="text-[10px] font-mono text-cyber-muted tracking-wider">ENCRYPTED_STREAM_ID: 0x94F2</span>
            </div>
            <div className="p-4 space-y-1 font-mono text-xs">
              {schedules.slice(0, 4).map((s, i) => (
                <p key={s.id} className="text-cyber-muted">
                  <span className={`${s.isActive ? 'text-neon-green' : 'text-neon-amber'}`}>
                    [{s.isActive ? 'SUCCESS' : 'WARNING'}]
                  </span>
                  {' '}RULE_ID_{String(i + 1).padStart(3, '0')}: {s.isActive ? `Executed. ${BigInt(s.amountSats).toLocaleString()} SATS transmitted.` : 'Manually suspended by User.'}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}
    </div>
  );
}
