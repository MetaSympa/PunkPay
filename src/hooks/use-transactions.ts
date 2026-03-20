'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Transaction {
  id: string;
  txid: string | null;
  type: string;
  status: string;
  amountSats: string;
  feeSats: string | null;
  feeRate: number | null;
  recipientAddress: string | null;
  rbfEnabled: boolean;
  confirmations: number;
  createdAt: string;
  wallet: { name: string };
}

export function useTransactions(walletId?: string, status?: string) {
  return useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ['transactions', walletId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (walletId) params.set('walletId', walletId);
      if (status) params.set('status', status);
      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      walletId: string;
      recipientAddress: string;
      amountSats: string;
      feeRate: number;
    }) => {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Transaction creation failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}
