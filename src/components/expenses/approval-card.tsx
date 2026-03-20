'use client';

import { useApproveExpense } from '@/hooks/use-expenses';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';

interface ApprovalCardProps {
  expense: {
    id: string;
    amount: string;
    description: string;
    category: string | null;
    recipientAddress: string;
    submitter: { email: string };
    submittedAt: string;
  };
}

export function ApprovalCard({ expense }: ApprovalCardProps) {
  const approveExpense = useApproveExpense();

  return (
    <TerminalCard title="expense request" variant="amber">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-neon-amber font-mono text-xl font-bold">
              {BigInt(expense.amount).toLocaleString()} <span className="text-sm">sats</span>
            </p>
            <p className="text-sm text-cyber-text mt-1">{expense.description}</p>
            {expense.category && (
              <span className="text-xs text-cyber-muted border border-cyber-border rounded px-2 py-0.5 mt-2 inline-block">
                {expense.category}
              </span>
            )}
          </div>
          <div className="text-right text-xs text-cyber-muted">
            <p>{expense.submitter.email}</p>
            <p>{new Date(expense.submittedAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="text-xs text-cyber-muted font-mono truncate">
          Pay to: {expense.recipientAddress}
        </div>
        <div className="flex gap-2">
          <NeonButton
            variant="green"
            size="sm"
            onClick={() => approveExpense.mutate({ expenseId: expense.id, action: 'approve' })}
            loading={approveExpense.isPending}
          >
            Approve
          </NeonButton>
          <NeonButton
            variant="red"
            size="sm"
            onClick={() => approveExpense.mutate({ expenseId: expense.id, action: 'reject' })}
            loading={approveExpense.isPending}
          >
            Reject
          </NeonButton>
        </div>
      </div>
    </TerminalCard>
  );
}
