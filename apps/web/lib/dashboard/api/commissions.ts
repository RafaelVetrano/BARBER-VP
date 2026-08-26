'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  ClosePeriodDto,
  CommissionPeriodQuery,
  CommissionPeriodResponse,
  CommissionReportQuery,
  CommissionRuleItem,
  CreateValeDto,
  UpsertCommissionRuleDto,
  ValeItem,
} from '@barbervp/types';

/** `?type=WEEKLY&anchor=2026-08-17` — só os campos presentes entram. */
function periodParams(query: CommissionPeriodQuery & { barberId?: string }): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

export function useCommissionRulesQuery(options?: { enabled?: boolean }) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['commission-rules'],
    queryFn: async () => {
      const { data } = await client.get<CommissionRuleItem[]>('/commissions/rules');
      return data;
    },
    // A rota é só de OWNER/MANAGER — quem não pode administrar regras nem pede.
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function useSaveCommissionRuleMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertCommissionRuleDto }) => {
      const { data } = id
        ? await client.patch<CommissionRuleItem>(`/commissions/rules/${id}`, dto)
        : await client.post<CommissionRuleItem>('/commissions/rules', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-rules'] }),
  });
}

export function useCommissionPeriodQuery(query: CommissionPeriodQuery) {
  const { client } = useEstablishmentAuth();
  const search = periodParams(query);
  return useQuery({
    queryKey: ['commissions', 'period', search],
    queryFn: async () => {
      const { data } = await client.get<CommissionPeriodResponse>(`/commissions/period?${search}`);
      return data;
    },
    // 403 de plano não é falha transitória — repetir 3× só atrasa o upsell.
    retry: false,
    // O stepper de período troca a chave a cada clique; sem isto a tabela
    // pisca vazia entre uma semana e a seguinte.
    placeholderData: (previous) => previous,
  });
}

/**
 * "Baixar PDF" do `modalPdfOpen`. O arquivo vem pelo cliente autenticado (a
 * rota exige Bearer, então um `<a href>` simples baixaria um 401) e o
 * download é disparado por um link efêmero sobre o blob.
 */
export function useCommissionReportMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async (query: CommissionReportQuery) => {
      const response = await client.get<Blob>(`/commissions/period/report.pdf?${periodParams(query)}`, {
        responseType: 'blob',
      });
      const disposition = String(response.headers['content-disposition'] ?? '');
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'relatorio-comissao.pdf';

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

export function useClosePeriodMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ClosePeriodDto) => {
      const { data } = await client.post<CommissionPeriodResponse>('/commissions/period/close', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commissions'] }),
  });
}

export function useValesQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['vales'],
    queryFn: async () => {
      const { data } = await client.get<ValeItem[]>('/commissions/vales');
      return data;
    },
    retry: false,
  });
}

export function useCreateValeMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateValeDto) => {
      const { data } = await client.post<ValeItem>('/commissions/vales', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vales'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
    },
  });
}
