'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Wallet {
  id: string;
  name: string;
  xpubFingerprint: string;
  derivationPath: string;
  nextReceiveIndex: number;
  network: string;
  createdAt: string;
  _count: { addresses: number; utxos: number };
}

interface WalletDetail extends Wallet {
  balance: string;
  confirmedBalance: string;
  addresses: Array<{ id: string; address: string; index: number; chain: string; isUsed: boolean }>;
  utxos: Array<{ id: string; txid: string; vout: number; valueSats: string; status: string }>;
}

export function useWallets() {
  return useQuery<Wallet[]>({
    queryKey: ['wallets'],
    queryFn: async () => {
      const res = await fetch('/api/wallet');
      if (!res.ok) throw new Error('Failed to fetch wallets');
      return res.json();
    },
  });
}

export function useWallet(walletId: string) {
  return useQuery<WalletDetail>({
    queryKey: ['wallet', walletId],
    queryFn: async () => {
      const res = await fetch(`/api/wallet/${walletId}`);
      if (!res.ok) throw new Error('Failed to fetch wallet');
      return res.json();
    },
    enabled: !!walletId,
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
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
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
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}
