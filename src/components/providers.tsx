'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState, ReactNode } from 'react';
import { WalletSyncProvider } from '@/hooks/use-wallet-sync';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,       // 60s — data stays fresh longer
            gcTime: 5 * 60 * 1000,      // 5min — keep unused cache longer
            retry: 1,
            refetchOnWindowFocus: false, // Don't refetch on tab focus (sync provider handles freshness)
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <WalletSyncProvider>
          {children}
        </WalletSyncProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
