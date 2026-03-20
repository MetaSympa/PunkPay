'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Wallet {
  id: string;
  name: string;
  xpubFingerprint: string;
  derivationPath: string;
  nextReceiveIndex: number;
  network: string;
  hasSeed?: boolean;
  addressType?: string;
  createdAt: string;
  balance: string;
  confirmedBalance: string;
  _count: { addresses: number; utxos: number };
}

export interface WalletDetail extends Wallet {
  receiveAddress: { address: string; index: number } | null;
  addresses: Array<{ id: string; address: string; index: number; chain: string; isUsed: boolean }>;
  utxos: Array<{ id: string; txid: string; vout: number; valueSats: string; status: string; isLocked: boolean; lockedUntil: string | null }>;
}

// ─── Query keys (centralized for consistency) ─────────────────────────────────

export const walletKeys = {
  all: ['wallets'] as const,
  detail: (id: string) => ['wallet', id] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useWallets() {
  const queryClient = useQueryClient();

  const query = useQuery<Wallet[]>({
    queryKey: walletKeys.all,
    queryFn: async () => {
      const res = await fetch('/api/wallet');
      if (!res.ok) throw new Error('Failed to fetch wallets');
      return res.json();
    },
  });

  // Seed individual wallet caches from list data so detail queries
  // have instant placeholder data (balance won't flash to 0)
  useEffect(() => {
    if (!query.data) return;
    for (const wallet of query.data) {
      const existing = queryClient.getQueryData<WalletDetail>(walletKeys.detail(wallet.id));
      if (existing) {
        // Update balance in cached detail if list has fresher data
        // (list is refetched after every sync)
        queryClient.setQueryData<WalletDetail>(walletKeys.detail(wallet.id), {
          ...existing,
          balance: wallet.balance,
          confirmedBalance: wallet.confirmedBalance,
          _count: { ...existing._count, utxos: wallet._count.utxos },
        });
      }
    }
  }, [query.data, queryClient]);

  return query;
}

export function useWallet(walletId: string) {
  const queryClient = useQueryClient();

  return useQuery<WalletDetail>({
    queryKey: walletKeys.detail(walletId),
    queryFn: async () => {
      const res = await fetch(`/api/wallet/${walletId}`);
      if (!res.ok) throw new Error('Failed to fetch wallet');
      return res.json();
    },
    enabled: !!walletId,
    // Use cached list data as placeholder so balance never flashes to 0
    placeholderData: () => {
      const wallets = queryClient.getQueryData<Wallet[]>(walletKeys.all);
      const match = wallets?.find(w => w.id === walletId);
      if (!match) return undefined;
      // Return a partial WalletDetail — enough to display balance immediately
      return {
        ...match,
        receiveAddress: null,
        addresses: [],
        utxos: [],
      } as WalletDetail;
    },
  });
}

export function useWalletBalance(walletId: string) {
  // Lightweight hook that returns just balance, works from cache
  const queryClient = useQueryClient();

  return useQuery<{ balance: string; confirmedBalance: string }>({
    queryKey: [...walletKeys.detail(walletId), 'balance'],
    queryFn: async () => {
      // Try to get from cached detail first
      const detail = queryClient.getQueryData<WalletDetail>(walletKeys.detail(walletId));
      if (detail) return { balance: detail.balance, confirmedBalance: detail.confirmedBalance };

      // Try from list cache
      const wallets = queryClient.getQueryData<Wallet[]>(walletKeys.all);
      const match = wallets?.find(w => w.id === walletId);
      if (match) return { balance: match.balance, confirmedBalance: match.confirmedBalance };

      // Fallback: fetch detail
      const res = await fetch(`/api/wallet/${walletId}`);
      if (!res.ok) throw new Error('Failed to fetch wallet');
      const data = await res.json();
      return { balance: data.balance, confirmedBalance: data.confirmedBalance };
    },
    enabled: !!walletId,
    staleTime: 2 * 60 * 1000, // Balance can be slightly stale — sync provider handles freshness
  });
}

export function useImportWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; xpub: string; network?: string; addressType?: string }) => {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Import failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
}

export function useDeleteWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (walletId: string) => {
      const res = await fetch(`/api/wallet/${walletId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      return res.json();
    },
    onSuccess: (_data, walletId) => {
      // Remove from cache immediately
      queryClient.removeQueries({ queryKey: walletKeys.detail(walletId) });
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
}

export function useCreateWalletFromSeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; mnemonic: string; network?: string; passphrase?: string }) => {
      const res = await fetch('/api/wallet/create-from-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Wallet creation failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
}
