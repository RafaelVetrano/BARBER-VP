'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  ClosePeriodDto,
  CommissionPeriodResponse,
  CommissionRuleItem,
  CreateValeDto,
  UpsertCommissionRuleDto,
  ValeItem,
} from '@barbervp/types';

export function useCommissionRulesQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['commission-rules'],
    queryFn: async () => {
      const { data } = await client.get<CommissionRuleItem[]>('/commissions/rules');
      return data;
    },
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

export function useCommissionPeriodQuery(month: string) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['commissions', 'period', month],
    queryFn: async () => {
      const { data } = await client.get<CommissionPeriodResponse>(`/commissions/period?month=${month}`);
      return data;
    },
    // 403 de plano não é falha transitória — repetir 3× só atrasa o upsell.
    retry: false,
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
