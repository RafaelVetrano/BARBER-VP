'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  ReportPeriodQuery,
  ReportsAdvancedResponse,
  ReportsSummaryResponse,
} from '@barbervp/types';

function qs(query: ReportPeriodQuery): string {
  const params = new URLSearchParams();
  if (query.period) params.set('period', query.period);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.unitId) params.set('unitId', query.unitId);
  // Chave repetida, não lista separada por vírgula: é o que o `URLSearchParams`
  // do navegador e o `ParseArrayPipe` do Nest concordam em ler.
  for (const barberId of query.barberIds ?? []) params.append('barberIds', barberId);
  return params.toString();
}

export function useReportsSummaryQuery(query: ReportPeriodQuery, options?: { enabled?: boolean }) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['reports', 'summary', query],
    queryFn: async () => {
      const { data } = await client.get<ReportsSummaryResponse>(`/reports/summary?${qs(query)}`);
      return data;
    },
    enabled: options?.enabled ?? true,
    // Trocar de pílula troca a chave; sem isto os cards piscam vazios entre
    // um período e o seguinte e o layout salta.
    placeholderData: (previous) => previous,
  });
}

export function useReportsAdvancedQuery(query: ReportPeriodQuery, options?: { enabled?: boolean }) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['reports', 'advanced', query],
    queryFn: async () => {
      const { data } = await client.get<ReportsAdvancedResponse>(`/reports/advanced?${qs(query)}`);
      return data;
    },
    enabled: options?.enabled ?? true,
    // 403 de plano não é falha transitória — repetir 3× só atrasa o upsell.
    retry: false,
    placeholderData: (previous) => previous,
  });
}

/**
 * "Exportar PDF" / "Exportar CSV". O arquivo vem pelo cliente autenticado (a
 * rota exige Bearer, então um `<a href>` baixaria um 401) e o download é
 * disparado por um link efêmero sobre o blob — mesmo caminho do relatório de
 * comissão.
 */
export function useReportExportMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async ({ format, query }: { format: 'pdf' | 'csv'; query: ReportPeriodQuery }) => {
      const response = await client.get<Blob>(`/reports/export.${format}?${qs(query)}`, {
        responseType: 'blob',
      });
      const disposition = String(response.headers['content-disposition'] ?? '');
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `relatorio.${format}`;

      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return filename;
    },
  });
}
