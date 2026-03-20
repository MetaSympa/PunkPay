'use client';

import { useQuery } from '@tanstack/react-query';

interface FeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export function useFeeEstimates() {
  return useQuery<FeeEstimate>({
    queryKey: ['fees'],
    queryFn: async () => {
      const res = await fetch('/api/fees');
      if (!res.ok) throw new Error('Failed to fetch fees');
      return res.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000,
  });
}
