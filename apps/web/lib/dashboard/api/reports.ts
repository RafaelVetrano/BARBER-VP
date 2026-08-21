'use client';

import { useQuery } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { ReportPeriodQuery, ReportsAdvancedResponse, ReportsSummaryResponse } from '@barbervp/types';

function qs(query: ReportPeriodQuery): string {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return params.toString();
}

export function useReportsSummaryQuery(query: ReportPeriodQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['reports-summary', query],
    queryFn: async () => {
      const { data } = await client.get<ReportsSummaryResponse>(`/reports/summary?${qs(query)}`);
      return data;
    },
  });
}

export function useReportsAdvancedQuery(query: ReportPeriodQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['reports-advanced', query],
    queryFn: async () => {
      const { data } = await client.get<ReportsAdvancedResponse>(`/reports/advanced?${qs(query)}`);
      return data;
    },
    retry: false,
  });
}
