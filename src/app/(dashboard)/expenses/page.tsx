'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useExpenses, useApproveExpense, useSubmitExpense } from '@/hooks/use-expenses';
import { NeonButton } from '@/components/ui/neon-button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

const STATUS_COLOR: Record<string, string> = {
  PENDING:  'text-neon-amber',
  APPROVED: 'text-neon-green',
  REJECTED: 'text-neon-red',
  PAID:     'text-cyber-muted',
};

// ─── Payer ────────────────────────────────────────────────────────────────────

function PayerExpenses() {
  const { data: expenses, isLoading } = useExpenses();
  const approve = useApproveExpense();

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;

  const pending  = expenses?.filter(e => e.status === 'PENDING')  ?? [];
  const reviewed = expenses?.filter(e => e.status !== 'PENDING')  ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">Expenses</h1>
        {pending.length > 0 && (
          <span className="text-xs font-mono text-neon-amber">{pending.length} pending</span>
        )}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="pp-card">
          <div className="px-4 py-3 border-b border-cyber-border">
            <span className="text-xs font-mono text-neon-amber uppercase tracking-wider">Pending Approval</span>
          </div>
          <div className="divide-y divide-cyber-border/40">
            {pending.map(exp => (
              <div key={exp.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-cyber-text">{exp.description}</p>
                    <p className="text-xs font-mono text-cyber-muted mt-0.5">{exp.submitter.email}</p>
                    {exp.category && (
                      <span className="inline-block mt-1 text-xs font-mono text-cyber-muted border border-cyber-border rounded px-1.5 py-0.5">
                        {exp.category}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-base font-semibold text-neon-amber">
                      {BigInt(exp.amount).toLocaleString()}
                    </p>
                    <p className="text-xs font-mono text-cyber-muted">sats</p>
                    <p className="text-xs font-mono text-cyber-muted mt-1">{new Date(exp.submittedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {exp.recipientAddress && (
                  <p className="text-xs font-mono text-cyber-muted break-all bg-cyber-bg rounded px-2 py-1">
                    {exp.recipientAddress}
                  </p>
                )}
                <div className="flex gap-2">
                  <NeonButton variant="green" size="sm"
                    loading={approve.isPending}
                    onClick={() => approve.mutate({ expenseId: exp.id, action: 'approve' })}>
                    Approve
                  </NeonButton>
                  <NeonButton variant="red" size="sm"
                    loading={approve.isPending}
                    onClick={() => approve.mutate({ expenseId: exp.id, action: 'reject' })}>
                    Reject
                  </NeonButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="pp-card">
        <div className="px-4 py-3 border-b border-cyber-border">
          <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">History</span>
        </div>
        {reviewed.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs font-mono text-cyber-muted">
            {expenses?.length === 0 ? 'No expenses yet' : 'No reviewed expenses'}
          </p>
        ) : (
          <div className="divide-y divide-cyber-border/30">
            {reviewed.map(exp => (
              <div key={exp.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                  <p className="text-xs font-mono text-cyber-muted">{exp.submitter.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-neon-amber">{BigInt(exp.amount).toLocaleString()} sats</p>
                  <span className={`text-xs font-mono ${STATUS_COLOR[exp.status] || 'text-cyber-muted'}`}>
                    {exp.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recipient ────────────────────────────────────────────────────────────────

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

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner text="Loading" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold font-mono text-cyber-text tracking-wide">Expenses</h1>
        <NeonButton variant="amber" size="sm" onClick={() => { setShowForm(v => !v); setError(''); }}>
          {showForm ? 'Cancel' : 'New Claim'}
        </NeonButton>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="pp-card">
          <div className="px-4 py-3 border-b border-cyber-border">
            <span className="text-xs font-mono text-neon-amber uppercase tracking-wider">Submit Expense</span>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="pp-label">Amount (sats)</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="pp-input" placeholder="50000" required />
              </div>
              <div>
                <label className="pp-label">Category</label>
                <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="pp-input" placeholder="e.g. design" />
              </div>
            </div>
            <div>
              <label className="pp-label">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="pp-input h-16 resize-none" required />
            </div>
            <div>
              <label className="pp-label">Your P2TR Address</label>
              <input type="text" value={form.recipientAddress} onChange={e => setForm(f => ({ ...f, recipientAddress: e.target.value }))}
                className="pp-input" placeholder="bc1p..." required />
            </div>
            {error && (
              <p className="text-xs font-mono text-neon-red bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">{error}</p>
            )}
            <NeonButton type="submit" variant="amber" className="w-full" loading={submit.isPending}>
              Submit Claim
            </NeonButton>
          </form>
        </div>
      )}

      {/* Expense list */}
      <div className="pp-card">
        <div className="px-4 py-3 border-b border-cyber-border">
          <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">History</span>
        </div>
        {!expenses?.length ? (
          <p className="px-4 py-6 text-center text-xs font-mono text-cyber-muted">No expenses submitted yet</p>
        ) : (
          <div className="divide-y divide-cyber-border/30">
            {expenses.map(exp => (
              <div key={exp.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-cyber-text truncate">{exp.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-mono ${STATUS_COLOR[exp.status] || 'text-cyber-muted'}`}>{exp.status}</span>
                    {exp.category && <span className="text-xs font-mono text-cyber-muted">{exp.category}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-neon-amber">{Number(exp.amount).toLocaleString()} sats</p>
                  <p className="text-xs font-mono text-cyber-muted/60">{new Date(exp.submittedAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  if (role === 'RECIPIENT') return <RecipientExpenses />;
  return <PayerExpenses />;
}
