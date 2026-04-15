'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Expense {
  id: string;
  amount: string;
  description: string;
  category: string | null;
  recipientAddress: string;
  receiptUrl: string | null;
  status: string;
  paidTxid: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
  submitter: { email: string };
  approver: { email: string } | null;
}

export function useExpenses(status?: string) {
  return useQuery<Expense[]>({
    queryKey: ['expenses', status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const res = await fetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch expenses');
      return res.json();
    },
  });
}

export function useSubmitExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      amount: string;
      description: string;
      category?: string;
      recipientAddress: string;
      receiptUrl?: string;
    }) => {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Submission failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useApproveExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ expenseId, action, walletId }: { expenseId: string; action: 'approve' | 'reject'; walletId?: string }) => {
      const res = await fetch(`/api/expenses/${expenseId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, walletId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Action failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}
