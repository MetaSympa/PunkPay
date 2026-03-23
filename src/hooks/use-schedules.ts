'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Schedule {
  id: string;
  recipientAddress: string | null;
  recipientXpub: string | null;
  recipientXpubIndex: number;
  recipientName: string | null;
  amountSats: string;
  cronExpression: string;
  timezone: string;
  maxFeeRate: number;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  wallet: { name: string; xpubFingerprint: string };
  _count: { transactions: number };
}

export function useSchedules() {
  return useQuery<Schedule[]>({
    queryKey: ['schedules'],
    queryFn: async () => {
      const res = await fetch('/api/schedules');
      if (!res.ok) throw new Error('Failed to fetch schedules');
      return res.json();
    },
    refetchInterval: 15_000, // refresh every 15s to pick up nextRunAt updates
  });
}

export function useSchedule(scheduleId: string) {
  return useQuery({
    queryKey: ['schedule', scheduleId],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/${scheduleId}`);
      if (!res.ok) throw new Error('Failed to fetch schedule');
      return res.json();
    },
    enabled: !!scheduleId,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      walletId: string;
      recipientAddress?: string;
      recipientXpub?: string;
      recipientName?: string;
      amountSats: string;
      cronExpression: string;
      timezone?: string;
      maxFeeRate?: number;
    }) => {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Schedule creation failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useToggleSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ scheduleId, isActive }: { scheduleId: string; isActive: boolean }) => {
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error('Update failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

export function useSendNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      walletId: string;
      recipientXpub?: string;
      recipientAddress?: string;
      recipientName?: string;
      amountSats: string;
      maxFeeRate?: number;
    }) => {
      const res = await fetch('/api/payments/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Transfer failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
