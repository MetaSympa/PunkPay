'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

            {form.derivedAddress && payType !== 'schedule' && (
              <div className="bg-cyber-bg border border-neon-green/20 rounded px-3 py-2">
                <p className="text-[10px] font-mono text-cyber-muted mb-0.5 tracking-wider">DERIVED_ADDRESS</p>
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

/* ── Schedule Table ──────────────────────────────────────────────────── */

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
    return { label: 'PENDING', state: 'overdue' };
  }
  return { label: formatDuration(diff), state: 'waiting' };
}

function DeleteConfirmModal({ schedule, onConfirm, onCancel, loading }: {
  schedule: any;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cyber-bg/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="sv-card w-full max-w-sm rounded-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-cyber-border border-l-2 border-l-neon-red">
          <span className="text-[11px] font-mono text-neon-red uppercase tracking-[0.15em]">CONFIRM_DELETE</span>
          <button onClick={onCancel} className="text-cyber-muted hover:text-cyber-text font-mono text-sm">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs font-mono text-cyber-muted">Delete this payment schedule?</p>

          {/* Schedule summary */}
          <div className="bg-cyber-bg border border-cyber-border rounded divide-y divide-cyber-border/40">
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-[10px] font-mono text-cyber-muted tracking-wider">RECIPIENT</span>
              <span className="text-xs font-mono text-cyber-text font-semibold uppercase">
                {schedule.recipientName?.replace(/\s/g, '_') || 'UNNAMED'}
              </span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-[10px] font-mono text-cyber-muted tracking-wider">AMOUNT</span>
              <span className="text-xs font-mono text-neon-green font-bold">
                {BigInt(schedule.amountSats).toLocaleString()} <span className="text-cyber-muted font-normal">SATS</span>
              </span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-[10px] font-mono text-cyber-muted tracking-wider">FREQUENCY</span>
              <span className="text-xs font-mono text-cyber-text">{cronLabel(schedule.cronExpression)}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-[10px] font-mono text-cyber-muted tracking-wider">WALLET</span>
              <span className="text-xs font-mono text-cyber-text">{schedule.wallet?.name || '—'}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className="text-[10px] font-mono text-cyber-muted tracking-wider">TOTAL_RUNS</span>
              <span className="text-xs font-mono text-cyber-text">{schedule._count.transactions}</span>
            </div>
          </div>

          <p className="text-[10px] font-mono text-neon-red/70">THIS_ACTION_CANNOT_BE_UNDONE</p>

          <div className="flex gap-2">
            <NeonButton variant="amber" size="sm" className="flex-1" onClick={onCancel}>
              CANCEL
            </NeonButton>
            <NeonButton variant="red" size="sm" className="flex-1" loading={loading} onClick={onConfirm}>
              DELETE
            </NeonButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleRow({ schedule }: { schedule: any }) {
  const toggle = useToggleSchedule();
  const del = useDeleteSchedule();
  const countdown = useCountdown(schedule.nextRunAt, schedule.isActive);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusColor = schedule.isActive ? 'text-neon-green' : 'text-neon-amber';

  return (
    <>
      <tr className="border-b border-cyber-border/30 hover:bg-cyber-surface/30 transition-colors">
        <td className="px-4 py-3">
          <p className="font-mono text-sm text-cyber-text font-semibold uppercase">
            {schedule.recipientName?.replace(/\s/g, '_') || 'UNNAMED'}
          </p>
          <p className="text-[10px] font-mono text-cyber-muted mt-0.5">{schedule.wallet?.name}</p>
        </td>
        <td className="px-4 py-3 text-right">
          <span className="font-mono text-sm font-bold text-neon-green">
            {BigInt(schedule.amountSats).toLocaleString()}
          </span>
          <span className="text-[10px] text-cyber-muted font-mono ml-1">SATS</span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="font-mono text-xs text-cyber-text tracking-wider">{cronLabel(schedule.cronExpression)}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <p className={`font-mono text-xs font-bold tracking-wider ${
            countdown.state === 'overdue' ? 'text-neon-amber animate-pulse' :
            countdown.state === 'halted' ? 'text-neon-amber' : 'text-neon-green'
          }`}>
            {countdown.label}
          </p>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="font-mono text-xs text-cyber-text">{schedule._count.transactions}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`text-[10px] font-mono ${statusColor} tracking-wider`}>
            {schedule.isActive ? '● ACTIVE' : '○ PAUSED'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1.5 justify-end">
            {schedule.isActive ? (
              <NeonButton variant="amber" size="sm" loading={toggle.isPending}
                onClick={() => toggle.mutate({ scheduleId: schedule.id, isActive: false })}>
                PAUSE
              </NeonButton>
            ) : (
              <NeonButton variant="primary" size="sm" loading={toggle.isPending}
                onClick={() => toggle.mutate({ scheduleId: schedule.id, isActive: true })}>
                RESUME
              </NeonButton>
            )}
            <NeonButton variant="red" size="sm" loading={del.isPending}
              onClick={() => setConfirmDelete(true)}>
              ✕
            </NeonButton>
          </div>
        </td>
      </tr>
      {schedule.lastError && (
        <tr>
          <td colSpan={7} className="px-4 pb-2">
            <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2 break-all">
              [ERROR] {schedule.lastError}
            </div>
          </td>
        </tr>
      )}
      {confirmDelete && createPortal(
        <DeleteConfirmModal
          schedule={schedule}
          loading={del.isPending}
          onConfirm={() => { del.mutate(schedule.id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />,
        document.body
      )}
    </>
  );
}

function ScheduleTable({ schedules }: { schedules: any[] }) {
  return (
    <div className="sv-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cyber-border">
              <th className="px-4 py-3 text-left text-[10px] font-mono text-cyber-muted uppercase tracking-[0.15em]">RECIPIENT</th>
              <th className="px-4 py-3 text-right text-[10px] font-mono text-cyber-muted uppercase tracking-[0.15em]">AMOUNT</th>
              <th className="px-4 py-3 text-center text-[10px] font-mono text-cyber-muted uppercase tracking-[0.15em]">FREQUENCY</th>
              <th className="px-4 py-3 text-center text-[10px] font-mono text-cyber-muted uppercase tracking-[0.15em]">NEXT RUN</th>
              <th className="px-4 py-3 text-center text-[10px] font-mono text-cyber-muted uppercase tracking-[0.15em]">RUNS</th>
              <th className="px-4 py-3 text-center text-[10px] font-mono text-cyber-muted uppercase tracking-[0.15em]">STATUS</th>
              <th className="px-4 py-3 text-right text-[10px] font-mono text-cyber-muted uppercase tracking-[0.15em]">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map(s => <ScheduleRow key={s.id} schedule={s} />)}
          </tbody>
        </table>
      </div>
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


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="sv-section-header">
          <h1 className="text-3xl font-mono font-bold tracking-tight text-cyber-text">Payment Schedules</h1>
        </div>
        <NeonButton variant="primary" size="md" onClick={() => setShowCreate(true)}>
          + Add New Schedule
        </NeonButton>
      </div>

      {/* Schedule table */}
      {!schedules?.length ? (
        <div className="sv-card px-4 py-10 text-center">
          <p className="text-cyber-muted font-mono text-sm mb-4">NO_PAYMENT_RULES_CONFIGURED</p>
          <NeonButton variant="primary" onClick={() => setShowCreate(true)}>+ Add New Schedule</NeonButton>
        </div>
      ) : (
        <ScheduleTable schedules={schedules} />
      )}

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}
    </div>
  );
}
