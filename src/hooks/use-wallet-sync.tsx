'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface SyncState {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

interface WalletSyncContextValue {
  /** Get sync state for a wallet */
  getSyncState: (walletId: string) => SyncState;
  /** Trigger an immediate sync for a wallet */
  syncWallet: (walletId: string) => Promise<void>;
  /** Register a wallet for auto-sync (called by pages that display wallet data) */
  registerWallet: (walletId: string) => void;
  /** Unregister a wallet from auto-sync */
  unregisterWallet: (walletId: string) => void;
  /** Global syncing indicator */
  isAnySyncing: boolean;
}

const WalletSyncContext = createContext<WalletSyncContextValue | null>(null);

const SYNC_INTERVAL_MS = 30_000; // 30s — server WebSocket handles real-time sync, this just refreshes display
const MIN_SYNC_GAP_MS = 10_000;  // Don't re-sync within 10s

export function WalletSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const registeredWallets = useRef<Set<string>>(new Set());
  const lastSyncTime = useRef<Record<string, number>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSyncs = useRef<Set<string>>(new Set());

  const updateSyncState = useCallback((walletId: string, update: Partial<SyncState>) => {
    setSyncStates(prev => ({
      ...prev,
      [walletId]: { ...( prev[walletId] ?? { isSyncing: false, lastSyncedAt: null, lastError: null }), ...update },
    }));
  }, []);

  const syncWallet = useCallback(async (walletId: string) => {
    // Prevent concurrent syncs for the same wallet
    if (activeSyncs.current.has(walletId)) return;

    // Respect minimum gap between syncs
    const now = Date.now();
    const lastSync = lastSyncTime.current[walletId] ?? 0;
    if (now - lastSync < MIN_SYNC_GAP_MS) return;

    activeSyncs.current.add(walletId);
    updateSyncState(walletId, { isSyncing: true, lastError: null });

    try {
      // Sync UTXOs
      const syncRes = await fetch(`/api/wallet/${walletId}/sync`, { method: 'POST' });
      if (!syncRes.ok) {
        const err = await syncRes.json().catch(() => ({ error: 'Sync failed' }));
        throw new Error(err.error || 'Sync failed');
      }

      lastSyncTime.current[walletId] = Date.now();
      updateSyncState(walletId, { isSyncing: false, lastSyncedAt: new Date(), lastError: null });

      // Invalidate all wallet queries atomically
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallets'] }),
        queryClient.invalidateQueries({ queryKey: ['wallet', walletId] }),
      ]);
    } catch (err: any) {
      updateSyncState(walletId, { isSyncing: false, lastError: err.message });
    } finally {
      activeSyncs.current.delete(walletId);
    }
  }, [queryClient, updateSyncState]);

  const registerWallet = useCallback((walletId: string) => {
    registeredWallets.current.add(walletId);
    // Trigger an immediate sync when a wallet is registered. MIN_SYNC_GAP_MS
    // prevents redundant syncs if registerWallet is called multiple times.
    syncWallet(walletId);
  }, [syncWallet]);

  const unregisterWallet = useCallback((walletId: string) => {
    registeredWallets.current.delete(walletId);
  }, []);

  // Auto-sync loop: re-sync all registered wallets every 60s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      for (const wid of registeredWallets.current) {
        syncWallet(wid);
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [syncWallet]);

  const getSyncState = useCallback((walletId: string): SyncState => {
    return syncStates[walletId] ?? { isSyncing: false, lastSyncedAt: null, lastError: null };
  }, [syncStates]);

  const isAnySyncing = Object.values(syncStates).some(s => s.isSyncing);

  return (
    <WalletSyncContext.Provider value={{ getSyncState, syncWallet, registerWallet, unregisterWallet, isAnySyncing }}>
      {children}
    </WalletSyncContext.Provider>
  );
}

export function useWalletSync(walletId?: string | null) {
  const ctx = useContext(WalletSyncContext);
  if (!ctx) throw new Error('useWalletSync must be used within WalletSyncProvider');

  // Auto-register/unregister on mount
  useEffect(() => {
    if (!walletId) return;
    ctx.registerWallet(walletId);
    return () => ctx.unregisterWallet(walletId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId]);

  const syncState = walletId ? ctx.getSyncState(walletId) : { isSyncing: false, lastSyncedAt: null, lastError: null };

  return {
    ...syncState,
    syncNow: walletId ? () => ctx.syncWallet(walletId) : async () => {},
    isAnySyncing: ctx.isAnySyncing,
  };
}
