'use client';

import { useQuery } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AdminMetricsResponse } from '@barbervp/types';

export function useAdminMetricsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async () => {
      const { data } = await client.get<AdminMetricsResponse>('/admin/metrics');
      return data;
    },
  });
}
