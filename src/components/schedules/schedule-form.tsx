'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreateSchedule } from '@/hooks/use-schedules';
import { useWallets } from '@/hooks/use-wallet';
import { deriveAddress } from '@/lib/bitcoin/hd-wallet';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';

type RecipientMode = 'xpub-select' | 'xpub-manual' | 'address';
type SchedMode = 'datetime' | 'presets' | 'cron';
type DtFreq = 'daily' | 'weekly' | 'monthly';

const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const ordinal = (n: number) => {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const PRESETS = [
  { label: 'DAILY',     cron: '0 9 * * *'   },
  { label: 'WEEKLY',    cron: '0 9 * * 1'   },
  { label: 'MONTHLY',   cron: '0 9 1 * *'   },
  { label: 'QUARTERLY', cron: '0 9 1 */3 *' },
  { label: 'YEARLY',    cron: '0 9 1 1 *'   },
];

const TIMEZONES = [
  'UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Sao_Paulo','Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow',
  'Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney',
];

function dtToCron(freq: DtFreq, dom: number, dow: number, hour: number, minute: number): string {
  switch (freq) {
    case 'daily':   return `${minute} ${hour} * * *`;
    case 'weekly':  return `${minute} ${hour} * * ${dow}`;
    case 'monthly': return `${minute} ${hour} ${dom} * *`;
  }
}

function dtDescription(freq: DtFreq, dom: number, dow: number, hour: number, minute: number, tz: string): string {
  const t = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${tz}`;
  switch (freq) {
    case 'daily':   return `Every day at ${t}`;
    case 'weekly':  return `Every ${DOW[dow]} at ${t}`;
    case 'monthly': return `${ordinal(dom)} of every month at ${t}`;
  }
}

function useRecipients() {
  return useQuery({
    queryKey: ['recipients'],
    queryFn: async () => {
      const res = await fetch('/api/recipients');
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export interface ScheduleFormProps {
  onSuccess?: () => void;
}

export function ScheduleForm({ onSuccess }: ScheduleFormProps) {
  const { data: wallets } = useWallets();
  const { data: recipients } = useRecipients();
  const createSchedule = useCreateSchedule();

  // Recipient
  const [mode, setMode] = useState<RecipientMode>('xpub-select');
  const [selectedXpub, setSelectedXpub] = useState('');
  const [manualXpub, setManualXpub] = useState('');
  const [staticAddress, setStaticAddress] = useState('');
  const [previewAddress, setPreviewAddress] = useState('');
  const [previewError, setPreviewError] = useState('');

  // Base fields
  const [walletId, setWalletId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [amountSats, setAmountSats] = useState('');
  const [maxFeeRate, setMaxFeeRate] = useState('50');
  const [timezone, setTimezone] = useState('UTC');

  // Schedule mode
  const [schedMode, setSchedMode] = useState<SchedMode>('datetime');
  const [cronExpression, setCronExpression] = useState('0 9 1 * *');

  // Date/time state
  const [dtFreq, setDtFreq]       = useState<DtFreq>('monthly');
  const [dtDom, setDtDom]         = useState(1);   // day of month
  const [dtDow, setDtDow]         = useState(1);   // day of week (1=Mon)
  const [dtHour, setDtHour]       = useState(9);
  const [dtMinute, setDtMinute]   = useState(0);

  // Keep cronExpression in sync with datetime inputs
  useEffect(() => {
    if (schedMode === 'datetime') {
      setCronExpression(dtToCron(dtFreq, dtDom, dtDow, dtHour, dtMinute));
    }
  }, [schedMode, dtFreq, dtDom, dtDow, dtHour, dtMinute]);

  function getActiveXpub() {
    return mode === 'xpub-select' ? selectedXpub : mode === 'xpub-manual' ? manualXpub : '';
  }

  function handleXpubChange(xpub: string) {
    setPreviewAddress(''); setPreviewError('');
    if (!xpub) return;
    try { setPreviewAddress(deriveAddress(xpub, 0, 0).address); }
    catch { setPreviewError('Invalid xpub — cannot derive address'); }
  }

  function handleRecipientSelect(id: string) {
    const r = recipients?.find((x: any) => x.id === id);
    if (r) { setSelectedXpub(r.xpub); setRecipientName(r.label || r.email); handleXpubChange(r.xpub); }
    else { setSelectedXpub(''); setPreviewAddress(''); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const xpub = getActiveXpub();
      await createSchedule.mutateAsync({
        walletId, recipientName, amountSats,
        cronExpression, timezone,
        maxFeeRate: parseFloat(maxFeeRate),
        recipientXpub: xpub || undefined,
        recipientAddress: mode === 'address' ? staticAddress : undefined,
      });
      onSuccess?.();
    } catch (err: any) { alert(err.message); }
  }

  return (
    <TerminalCard title="new schedule" variant="amber">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Wallet + Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Sending Wallet</label>
            <select value={walletId} onChange={e => setWalletId(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none" required>
              <option value="">Select wallet...</option>
              {wallets?.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Recipient Name</label>
            <input type="text" value={recipientName} onChange={e => setRecipientName(e.target.value)}
              placeholder="Alice, Contractor..."
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none" />
          </div>
        </div>

        {/* Recipient Mode */}
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-2">Recipient Type</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'xpub-select', label: '⇄ Select Recipient' },
              { id: 'xpub-manual', label: '✎ Paste xpub' },
              { id: 'address',     label: '⊕ Static Address' },
            ].map(opt => (
              <button key={opt.id} type="button"
                onClick={() => { setMode(opt.id as RecipientMode); setPreviewAddress(''); setPreviewError(''); }}
                className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                  mode === opt.id ? 'border-neon-amber text-neon-amber bg-neon-amber/10' : 'border-cyber-border text-cyber-muted hover:border-cyber-text'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'xpub-select' && (
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Select Recipient</label>
            <select onChange={e => handleRecipientSelect(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none"
              required={mode === 'xpub-select'}>
              <option value="">Choose recipient...</option>
              {recipients?.filter((r: any) => r.profileComplete).map((r: any) => (
                <option key={r.id} value={r.id}>{r.label || r.email}</option>
              ))}
            </select>
          </div>
        )}

        {mode === 'xpub-manual' && (
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Recipient xpub</label>
            <textarea value={manualXpub} onChange={e => { setManualXpub(e.target.value); handleXpubChange(e.target.value.trim()); }}
              placeholder="xpub... or tpub..." rows={2}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none resize-none"
              required={mode === 'xpub-manual'} />
          </div>
        )}

        {mode === 'address' && (
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Recipient Address (P2TR)</label>
            <input type="text" value={staticAddress} onChange={e => setStaticAddress(e.target.value)}
              placeholder="tb1p..."
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none"
              required={mode === 'address'} />
            <p className="text-xs text-neon-amber mt-1">⚠ Address reuse reduces privacy. Use xpub mode for recurring payments.</p>
          </div>
        )}

        {(mode === 'xpub-select' || mode === 'xpub-manual') && (previewAddress || previewError) && (
          <div className={`text-xs font-mono px-3 py-2 rounded border ${previewError ? 'border-neon-red/30 text-neon-red bg-neon-red/5' : 'border-neon-green/30 text-neon-green bg-neon-green/5'}`}>
            {previewError || <><span className="text-cyber-muted">First payment address: </span>{previewAddress}</>}
          </div>
        )}

        {/* Amount + Fee */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Amount (sats)</label>
            <input type="number" value={amountSats} onChange={e => setAmountSats(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono focus:border-neon-amber focus:outline-none" required />
          </div>
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Max Fee (sat/vB)</label>
            <input type="number" value={maxFeeRate} onChange={e => setMaxFeeRate(e.target.value)}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none" />
          </div>
        </div>

        {/* ── Scheduling ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-cyber-muted uppercase tracking-wider">Schedule</label>
            {/* Mode tabs */}
            <div className="flex text-[10px] font-mono rounded overflow-hidden border border-cyber-border">
              {([
                { id: 'datetime', label: 'DATE & TIME' },
                { id: 'presets',  label: 'PRESETS'     },
                { id: 'cron',     label: 'CRON'        },
              ] as { id: SchedMode; label: string }[]).map(tab => (
                <button key={tab.id} type="button" onClick={() => setSchedMode(tab.id)}
                  className={`px-2.5 py-1 transition-colors ${
                    schedMode === tab.id ? 'bg-neon-amber text-cyber-bg font-semibold' : 'text-cyber-muted hover:text-cyber-text'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* DATE & TIME */}
          {schedMode === 'datetime' && (
            <div className="space-y-3 p-3 bg-cyber-bg rounded border border-cyber-border/50">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Recurrence */}
                <div>
                  <label className="block text-[10px] text-cyber-muted uppercase tracking-wider mb-1">Recurs</label>
                  <select value={dtFreq} onChange={e => setDtFreq(e.target.value as DtFreq)}
                    className="w-full bg-cyber-surface border border-cyber-border rounded px-2 py-1.5 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Day of month */}
                {dtFreq === 'monthly' && (
                  <div>
                    <label className="block text-[10px] text-cyber-muted uppercase tracking-wider mb-1">Day of Month</label>
                    <select value={dtDom} onChange={e => setDtDom(Number(e.target.value))}
                      className="w-full bg-cyber-surface border border-cyber-border rounded px-2 py-1.5 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{ordinal(d)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Day of week */}
                {dtFreq === 'weekly' && (
                  <div>
                    <label className="block text-[10px] text-cyber-muted uppercase tracking-wider mb-1">Day of Week</label>
                    <select value={dtDow} onChange={e => setDtDow(Number(e.target.value))}
                      className="w-full bg-cyber-surface border border-cyber-border rounded px-2 py-1.5 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none">
                      {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}

                {/* Time */}
                <div>
                  <label className="block text-[10px] text-cyber-muted uppercase tracking-wider mb-1">Time</label>
                  <input type="time"
                    value={`${String(dtHour).padStart(2,'0')}:${String(dtMinute).padStart(2,'0')}`}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      setDtHour(h); setDtMinute(m);
                    }}
                    className="w-full bg-cyber-surface border border-cyber-border rounded px-2 py-1.5 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none" />
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-[10px] text-cyber-muted uppercase tracking-wider mb-1">Timezone</label>
                  <select value={timezone} onChange={e => setTimezone(e.target.value)}
                    className="w-full bg-cyber-surface border border-cyber-border rounded px-2 py-1.5 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none">
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>

              {/* Human-readable preview */}
              <p className="text-[11px] font-mono text-neon-amber">
                → {dtDescription(dtFreq, dtDom, dtDow, dtHour, dtMinute, timezone)}
                <span className="text-cyber-muted ml-2">[{cronExpression}]</span>
              </p>
            </div>
          )}

          {/* PRESETS */}
          {schedMode === 'presets' && (
            <div className="flex flex-wrap gap-2 p-3 bg-cyber-bg rounded border border-cyber-border/50">
              {PRESETS.map(p => (
                <button key={p.cron} type="button" onClick={() => setCronExpression(p.cron)}
                  className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                    cronExpression === p.cron
                      ? 'border-neon-amber text-neon-amber bg-neon-amber/10'
                      : 'border-cyber-border text-cyber-muted hover:border-cyber-text hover:text-cyber-text'
                  }`}>
                  {p.label}
                </button>
              ))}
              <p className="w-full text-[10px] font-mono text-cyber-muted mt-1">
                Selected: <span className="text-neon-green">{cronExpression}</span>
              </p>
            </div>
          )}

          {/* RAW CRON */}
          {schedMode === 'cron' && (
            <div className="p-3 bg-cyber-bg rounded border border-cyber-border/50">
              <input type="text" value={cronExpression} onChange={e => setCronExpression(e.target.value)}
                className="w-full bg-cyber-surface border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none"
                placeholder="0 9 1 * *" required />
              <p className="text-[10px] text-cyber-muted mt-1">
                Standard 5-field cron (min hour dom month dow). Example: monthly on the 1st at 09:00 = <span className="text-neon-green">0 9 1 * *</span>
              </p>
            </div>
          )}
        </div>

        <NeonButton type="submit" variant="amber" loading={createSchedule.isPending} className="w-full">
          Create Schedule
        </NeonButton>
      </form>
    </TerminalCard>
  );
}
