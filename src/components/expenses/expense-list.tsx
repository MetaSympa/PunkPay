'use client';

import { TerminalCard } from '@/components/ui/terminal-card';

interface Expense {
  id: string;
  amount: string;
  description: string;
  category: string | null;
  status: string;
  submittedAt: string;
  submitter: { email: string };
}

interface ExpenseListProps {
  expenses: Expense[];
}

export function ExpenseList({ expenses }: ExpenseListProps) {
  return (
    <div className="space-y-3">
      {expenses.map(expense => (
        <TerminalCard key={expense.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-cyber-text">{expense.description}</p>
              <p className="text-xs text-cyber-muted">{expense.submitter.email}</p>
              {expense.category && (
                <span className="text-xs text-cyber-muted border border-cyber-border rounded px-2 py-0.5 mt-1 inline-block">
                  {expense.category}
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-neon-amber">
                {BigInt(expense.amount).toLocaleString()} sats
              </p>
              <span className={`text-xs ${
                expense.status === 'PENDING' ? 'text-neon-amber' :
                expense.status === 'APPROVED' ? 'text-neon-green' :
                expense.status === 'REJECTED' ? 'text-neon-red' :
                expense.status === 'PAID' ? 'text-neon-blue' :
                'text-cyber-muted'
              }`}>
                {expense.status}
              </span>
            </div>
          </div>
        </TerminalCard>
      ))}
    </div>
  );
}
