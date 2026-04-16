'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useSyncWallet(walletId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!walletId) return null;
      const res = await fetch(`/api/wallet/${walletId}/sync`, { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: () => {
      if (!walletId) return;
      qc.invalidateQueries({ queryKey: ['wallet', walletId] });
      qc.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}

export function useAutoSync(walletId: string | null, intervalMs = 60_000) {
  const sync = useSyncWallet(walletId);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastResult, setLastResult] = useState<{ addressesChecked: number; utxosFound: number; totalSats: string } | null>(null);

  async function run() {
    if (!walletId) return;
    try {
      const result = await sync.mutateAsync();
      if (result) {
        setLastResult(result);
        setLastSyncedAt(new Date());
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!walletId) return;
    run();
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId, intervalMs]);

  return {
    syncNow: run,
    isSyncing: sync.isPending,
    lastSyncedAt,
    lastResult,
    syncError: sync.error,
  };
}
