'use client';

import { useState } from 'react';
import { useSubmitExpense } from '@/hooks/use-expenses';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';

interface ExpenseFormProps {
  onSuccess?: () => void;
}

export function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const submitExpense = useSubmitExpense();
  const [form, setForm] = useState({
    amount: '',
    description: '',
    category: '',
    recipientAddress: '',
    receiptUrl: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await submitExpense.mutateAsync(form);
      setForm({ amount: '', description: '', category: '', recipientAddress: '', receiptUrl: '' });
      onSuccess?.();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <TerminalCard title="submit expense" variant="amber">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Amount (sats)</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono focus:border-neon-amber focus:outline-none transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono focus:border-neon-amber focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-text font-mono focus:border-neon-amber focus:outline-none transition-colors h-20 resize-none"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1 font-sans">Your P2TR Address</label>
          <input
            type="text"
            value={form.recipientAddress}
            onChange={e => setForm({ ...form, recipientAddress: e.target.value })}
            className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none transition-colors"
            placeholder="tb1p..."
            required
          />
        </div>
        <NeonButton type="submit" variant="amber" loading={submitExpense.isPending}>
          Submit Expense
        </NeonButton>
      </form>
    </TerminalCard>
  );
}
