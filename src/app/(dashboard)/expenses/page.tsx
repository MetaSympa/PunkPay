'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useExpenses, useApproveExpense, useSubmitExpense } from '@/hooks/use-expenses';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  PENDING:  { color: 'text-neon-amber', bg: 'bg-neon-amber/10 border-neon-amber/30' },
  APPROVED: { color: 'text-neon-green',  bg: 'bg-neon-green/10 border-neon-green/30' },
  REJECTED: { color: 'text-neon-red',    bg: 'bg-neon-red/10 border-neon-red/30' },
  PAID:     { color: 'text-cyber-muted', bg: 'bg-cyber-muted/10 border-cyber-border' },
};

/* ── Payer View ───────────────────────────────────────────────────────── */

function PayerExpenses() {
  const { data: expenses, isLoading } = useExpenses();
  const approve = useApproveExpense();

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="LOADING_CLAIMS" /></div>;

  const pending  = expenses?.filter(e => e.status === 'PENDING')  ?? [];
  const reviewed = expenses?.filter(e => e.status !== 'PENDING')  ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="sv-section-header">
          <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">SYSTEM // CLAIMS</p>
          <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight mt-1">EXPENSE_INDEX</h1>
        </div>
        {pending.length > 0 && (
          <span className="text-xs font-mono text-neon-amber border border-neon-amber/30 bg-neon-amber/10 rounded px-2 py-1 tracking-wider">
            {pending.length} PENDING
          </span>
        )}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="sv-card overflow-hidden">
          <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-amber">
            <span className="text-[11px] font-mono text-neon-amber uppercase tracking-[0.15em]">PENDING_APPROVAL</span>
          </div>
          <div className="divide-y divide-cyber-border/30">
            {pending.map(exp => (
              <div key={exp.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-cyber-text font-semibold">{exp.description}</p>
                    <p className="text-[10px] font-mono text-cyber-muted mt-0.5">{exp.submitter.email}</p>
                    {exp.category && (
                      <span className="inline-block mt-1 text-[10px] font-mono text-cyber-muted border border-cyber-border rounded px-1.5 py-0.5 tracking-wider">
                        {exp.category.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xl font-bold text-neon-amber">
                      {BigInt(exp.amount).toLocaleString()}
                    </p>
                    <p className="text-[10px] font-mono text-cyber-muted tracking-wider">SATS</p>
                    <p className="text-[10px] font-mono text-cyber-muted mt-1">{new Date(exp.submittedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {exp.recipientAddress && (
                  <p className="text-xs font-mono text-cyber-muted break-all bg-cyber-bg rounded px-2 py-1.5 border border-cyber-border/50">
                    {exp.recipientAddress}
                  </p>
                )}
                <div className="flex gap-2">
                  <NeonButton variant="primary" size="sm"
                    loading={approve.isPending}
                    onClick={() => approve.mutate({ expenseId: exp.id, action: 'approve' })}>
                    APPROVE
                  </NeonButton>
                  <NeonButton variant="red" size="sm"
                    loading={approve.isPending}
                    onClick={() => approve.mutate({ expenseId: exp.id, action: 'reject' })}>
                    REJECT
                  </NeonButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-cyber-border">
          <span className="text-[11px] font-mono text-cyber-muted uppercase tracking-[0.15em]">HISTORY</span>
        </div>
        {reviewed.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs font-mono text-cyber-muted">
            {expenses?.length === 0 ? 'NO_EXPENSES_FOUND' : 'NO_REVIEWED_EXPENSES'}
          </p>
        ) : (
          <div className="divide-y divide-cyber-border/20">
            {reviewed.map(exp => {
              const st = STATUS_COLOR[exp.status] || STATUS_COLOR.PAID;
              return (
                <div key={exp.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                    <p className="text-[10px] font-mono text-cyber-muted">{exp.submitter.email}</p>
                  </div>
                  <p className="text-sm font-mono text-neon-amber font-semibold shrink-0">
                    {BigInt(exp.amount).toLocaleString()} <span className="text-[10px] font-normal text-cyber-muted">SATS</span>
                  </p>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${st.color} ${st.bg} tracking-wider`}>
                    {exp.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Recipient View ───────────────────────────────────────────────────── */

function RecipientExpenses() {
  const { data: expenses, isLoading } = useExpenses();
  const submit = useSubmitExpense();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', category: '', recipientAddress: '', receiptUrl: '' });
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      await submit.mutateAsync(form);
      setShowForm(false);
      setForm({ amount: '', description: '', category: '', recipientAddress: '', receiptUrl: '' });
    } catch (err: any) { setError(err.message); }
  }

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="LOADING_CLAIMS" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="sv-section-header">
          <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">SYSTEM // CLAIMS</p>
          <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight mt-1">MY_CLAIMS</h1>
        </div>
        <NeonButton variant="primary" size="sm" onClick={() => { setShowForm(v => !v); setError(''); }}>
          {showForm ? 'CANCEL' : '+ NEW CLAIM'}
        </NeonButton>
      </div>

      {showForm && (
        <div className="sv-card overflow-hidden">
          <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-amber">
            <span className="text-[11px] font-mono text-neon-amber uppercase tracking-[0.15em]">SUBMIT_EXPENSE</span>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="sv-label">AMOUNT (SATS)</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="sv-input" placeholder="50000" required />
              </div>
              <div>
                <label className="sv-label">CATEGORY</label>
                <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="sv-input" placeholder="e.g. design" />
              </div>
            </div>
            <div>
              <label className="sv-label">DESCRIPTION</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="sv-input h-16 resize-none" required />
            </div>
            <div>
              <label className="sv-label">YOUR_P2TR_ADDRESS</label>
              <input type="text" value={form.recipientAddress} onChange={e => setForm(f => ({ ...f, recipientAddress: e.target.value }))}
                className="sv-input text-neon-green" placeholder="bc1p..." required />
            </div>
            {error && <div className="text-neon-red text-xs font-mono bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">[ERROR] {error}</div>}
            <NeonButton type="submit" variant="primary" className="w-full" loading={submit.isPending}>
              SUBMIT CLAIM
            </NeonButton>
          </form>
        </div>
      )}

      {/* History */}
      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-cyber-border">
          <span className="text-[11px] font-mono text-cyber-muted uppercase tracking-[0.15em]">HISTORY</span>
        </div>
        {!expenses?.length ? (
          <p className="px-4 py-8 text-center text-xs font-mono text-cyber-muted">NO_EXPENSES_SUBMITTED</p>
        ) : (
          <div className="divide-y divide-cyber-border/20">
            {expenses.map(exp => {
              const st = STATUS_COLOR[exp.status] || STATUS_COLOR.PAID;
              return (
                <div key={exp.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${st.color} ${st.bg} tracking-wider`}>{exp.status}</span>
                      {exp.category && <span className="text-[10px] font-mono text-cyber-muted">{exp.category.toUpperCase()}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono text-neon-amber font-semibold">{Number(exp.amount).toLocaleString()} <span className="text-[10px] font-normal text-cyber-muted">SATS</span></p>
                    <p className="text-[10px] font-mono text-cyber-muted/60">{new Date(exp.submittedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────── */

export default function ExpensesPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  if (role === 'RECIPIENT') return <RecipientExpenses />;
  return <PayerExpenses />;
}
