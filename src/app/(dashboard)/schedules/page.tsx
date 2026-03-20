'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useSchedules, useToggleSchedule, useDeleteSchedule, useCreateSchedule, useSendNow,
} from '@/hooks/use-schedules';
import { useWallets } from '@/hooks/use-wallet';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAutoSync } from '@/hooks/use-utxo-sync';

// ─── Frequency presets ────────────────────────────────────────────────────────

const FREQ = [
  { label: 'Every 10 min',  cron: '*/10 * * * *' },
  { label: 'Every 20 min',  cron: '*/20 * * * *' },
  { label: 'Every hour',    cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily',         cron: '0 0 * * *' },
  { label: 'Weekly',        cron: '0 0 * * 1' },
  { label: 'Biweekly',      cron: '0 0 1,15 * *' },
  { label: 'Monthly',       cron: '0 0 1 * *' },
  { label: 'Quarterly',     cron: '0 0 1 1,4,7,10 *' },
  { label: 'Yearly',        cron: '0 0 1 1 *' },
];

function cronLabel(cron: string) {
  return FREQ.find(f => f.cron === cron)?.label ?? cron;
}

function useRecipients() {
  return useQuery({
    queryKey: ['recipients'],
    queryFn: async () => {
      const res = await fetch('/api/recipients');
      return res.ok ? res.json() : [];
    },
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

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const { data: wallets } = useWallets();
  const { data: recipients } = useRecipients();
  const createSchedule = useCreateSchedule();
  const sendNow = useSendNow();

  const [payType, setPayType] = useState<PayType>('schedule');
  const [form, setForm] = useState({
    walletId: '',
    recipientId: '',
    recipientXpub: '',
    recipientName: '',
    derivedAddress: '',
    amountSats: '',
    cronExpression: '*/10 * * * *',
    maxFeeRate: '2',
    requireConfirmedUtxos: true,
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
          walletId: form.walletId,
          recipientXpub: form.recipientXpub || undefined,
          recipientName: form.recipientName || undefined,
          amountSats: form.amountSats,
          maxFeeRate: parseFloat(form.maxFeeRate),
        });
        setSuccess(`PSBT created · ${Number(res.amountSats).toLocaleString()} sats · Check Transactions to sign and broadcast.`);
        onClose();
      } else {
        await createSchedule.mutateAsync({
          walletId: form.walletId,
          recipientXpub: form.recipientXpub || undefined,
          recipientName: form.recipientName || undefined,
          amountSats: form.amountSats,
          cronExpression: form.cronExpression,
          maxFeeRate: parseFloat(form.maxFeeRate),
        });
        onClose();
      }
    } catch (err: any) { setError(err.message); }
  }

  const isLoading = payType === 'now' ? sendNow.isPending : createSchedule.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-cyber-bg/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pp-card w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyber-border">
          <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">New Payment</span>
          <button onClick={onClose} className="text-cyber-muted hover:text-cyber-text font-mono text-sm">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Send now / Schedule toggle */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'now' as PayType, label: 'Send Now', sub: 'One-time' },
              { id: 'schedule' as PayType, label: 'Schedule', sub: 'Recurring' },
            ]).map(({ id, label, sub }) => (
              <button key={id} type="button"
                onClick={() => setPayType(id)}
                className={`rounded border px-3 py-2.5 text-left transition-colors ${
                  payType === id
                    ? 'border-neon-amber text-neon-amber bg-neon-amber/8'
                    : 'border-cyber-border text-cyber-muted hover:text-cyber-text'
                }`}>
                <p className="text-sm font-mono font-medium">{label}</p>
                <p className="text-xs font-mono text-cyber-muted/60 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Wallet */}
            <div>
              <label className="pp-label">From wallet</label>
              <select value={form.walletId} onChange={e => setForm(f => ({ ...f, walletId: e.target.value }))}
                className="pp-input" required>
                <option value="">Select wallet...</option>
                {wallets?.map((w: any) => (
                  <option key={w.id} value={w.id}>{w.name} · {w.network}</option>
                ))}
              </select>
            </div>

            {/* Recipient */}
            <div>
              <label className="pp-label">To recipient</label>
              <select value={form.recipientId} onChange={e => selectRecipient(e.target.value)}
                className="pp-input" required>
                <option value="">Select recipient...</option>
                {recipients?.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.label || r.email} · {r.network}</option>
                ))}
              </select>
            </div>

            {/* Derived address preview */}
            {form.derivedAddress && (
              <div className="bg-cyber-bg border border-cyber-border rounded px-3 py-2">
                <p className="text-xs font-mono text-cyber-muted mb-0.5">
                  {payType === 'schedule' ? 'Next address (rotates each payment)' : 'Address'}
                </p>
                <p className="text-xs font-mono text-neon-green break-all">{form.derivedAddress}</p>
              </div>
            )}

            {/* Amount + fee row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="pp-label">Amount (sats)</label>
                <input type="number" value={form.amountSats}
                  onChange={e => setForm(f => ({ ...f, amountSats: e.target.value }))}
                  className="pp-input" placeholder="100000" min="546" required />
              </div>
              <div>
                <label className="pp-label">Max fee (sat/vB)</label>
                <input type="number" value={form.maxFeeRate}
                  onChange={e => setForm(f => ({ ...f, maxFeeRate: e.target.value }))}
                  className="pp-input" min="1" />
              </div>
            </div>

            {/* Frequency (schedule only) */}
            {payType === 'schedule' && (
              <div>
                <label className="pp-label">Frequency</label>
                <select value={form.cronExpression}
                  onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))}
                  className="pp-input">
                  {FREQ.map(f => (
                    <option key={f.cron} value={f.cron}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* UTXO confirmation requirement */}
            {payType === 'schedule' && (
              <label className="flex items-center gap-3 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={form.requireConfirmedUtxos}
                  onChange={e => setForm(f => ({ ...f, requireConfirmedUtxos: e.target.checked }))}
                  className="accent-neon-green w-4 h-4"
                />
                <div>
                  <p className="text-sm font-mono text-cyber-text">Require confirmed UTXOs</p>
                  <p className="text-xs font-mono text-cyber-muted">Only spend confirmed inputs</p>
                </div>
              </label>
            )}

            {error && (
              <p className="text-xs font-mono text-neon-red bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">{error}</p>
            )}

            <NeonButton type="submit" variant="amber" className="w-full" loading={isLoading}>
              {payType === 'now' ? 'Send Now' : 'Create Schedule'}
            </NeonButton>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule card ────────────────────────────────────────────────────────────

function ScheduleCard({ schedule }: { schedule: any }) {
  const toggle = useToggleSchedule();
  const del = useDeleteSchedule();

  return (
    <div className="pp-card">
      <div className="px-4 py-3 border-b border-cyber-border flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-cyber-text truncate">
            {schedule.recipientName || 'Unnamed recipient'}
          </p>
          <p className="text-xs font-mono text-cyber-muted mt-0.5">{schedule.wallet?.name}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={`w-1.5 h-1.5 rounded-full ${schedule.isActive ? 'bg-neon-green' : 'bg-cyber-muted'}`}
            style={{ animation: schedule.isActive ? 'pulse-dot 2s ease-in-out infinite' : 'none' }} />
          <span className={`text-xs font-mono ${schedule.isActive ? 'text-neon-green' : 'text-cyber-muted'}`}>
            {schedule.isActive ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="text-base font-mono font-semibold text-neon-amber">
            {BigInt(schedule.amountSats).toLocaleString()} <span className="text-xs font-normal">sats</span>
          </p>
          <p className="text-xs font-mono text-cyber-muted">{cronLabel(schedule.cronExpression)}</p>
          {schedule.recipientXpub && (
            <p className="text-xs font-mono text-neon-green/70">Rotating address · #{schedule.recipientXpubIndex} next</p>
          )}
          <p className="text-xs font-mono text-cyber-muted">{schedule._count.transactions} runs</p>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <NeonButton
            variant={schedule.isActive ? 'amber' : 'green'} size="sm"
            loading={toggle.isPending}
            onClick={() => toggle.mutate({ scheduleId: schedule.id, isActive: !schedule.isActive })}>
            {schedule.isActive ? 'Pause' : 'Resume'}
          </NeonButton>
          <NeonButton variant="red" size="sm"
            loading={del.isPending}
            onClick={() => { if (confirm('Delete this schedule?')) del.mutate(schedule.id); }}>
            Delete
          </NeonButton>
        </div>
      </div>

      {schedule.lastError && (
        <div className="px-4 pb-3">
          <p className="text-xs font-mono text-neon-red bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2 break-all">
            {schedule.lastError}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules();
  const { data: wallets } = useWallets();
  const [showCreate, setShowCreate] = useState(false);

  // Auto-sync first available wallet
  const firstWalletId = wallets?.[0]?.id ?? null;
  useAutoSync(firstWalletId, 60_000);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;

  const active = schedules?.filter(s => s.isActive) ?? [];
  const paused = schedules?.filter(s => !s.isActive) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">Payments</h1>
        <NeonButton variant="green" size="sm" onClick={() => setShowCreate(true)}>
          New Payment
        </NeonButton>
      </div>

      {!schedules?.length && (
        <div className="pp-card px-4 py-8 text-center">
          <p className="text-cyber-muted font-mono text-sm mb-3">No payments scheduled</p>
          <NeonButton variant="green" onClick={() => setShowCreate(true)}>New Payment</NeonButton>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-cyber-muted uppercase tracking-wider px-0.5">
            Active <span className="text-neon-green">({active.length})</span>
          </p>
          {active.map(s => <ScheduleCard key={s.id} schedule={s} />)}
        </div>
      )}

      {paused.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-cyber-muted uppercase tracking-wider px-0.5">Paused</p>
          {paused.map(s => <ScheduleCard key={s.id} schedule={s} />)}
        </div>
      )}

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}
    </div>
  );
}
