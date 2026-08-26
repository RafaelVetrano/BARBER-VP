'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { ClientPlanAdminItem, SubscriberItem, UpsertClientPlanDto } from '@barbervp/types';

/**
 * Aba Fidelidade — só Assinaturas desde a revisão do protótipo (agente 21).
 *
 * As chamadas de pontos e sorteios saíram junto com as sub-abas: `/loyalty/
 * program` continua no servidor, mas sem tela nenhuma no painel, e `/loyalty/
 * raffles` deixou de existir.
 */

const PLANS_KEY = ['loyalty-plans'] as const;
const SUBSCRIBERS_KEY = ['loyalty-subscribers'] as const;

/** `enabled: false` para o `BARBER`, que toma 403 de papel nas duas rotas. */
export interface LoyaltyQueryOptions {
  enabled?: boolean;
}

export function useClientPlansQuery({ enabled = true }: LoyaltyQueryOptions = {}) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: PLANS_KEY,
    queryFn: async () => {
      const { data } = await client.get<ClientPlanAdminItem[]>('/loyalty/plans');
      return data;
    },
    enabled,
    retry: false,
  });
}

export function useSubscribersQuery({ enabled = true }: LoyaltyQueryOptions = {}) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: SUBSCRIBERS_KEY,
    queryFn: async () => {
      const { data } = await client.get<SubscriberItem[]>('/loyalty/subscribers');
      return data;
    },
    enabled,
    retry: false,
  });
}

/**
 * Toda escrita desta aba invalida os DOIS blocos: mudar o preço de um plano
 * mexe no MRR do card e na linha de quem assina, e pausar um assinante muda a
 * contagem que o card mostra.
 */
function useLoyaltyInvalidate() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PLANS_KEY }),
      queryClient.invalidateQueries({ queryKey: SUBSCRIBERS_KEY }),
    ]);
  };
}

export function useSaveClientPlanMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useLoyaltyInvalidate();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertClientPlanDto }) => {
      const { data } = id
        ? await client.patch<ClientPlanAdminItem>(`/loyalty/plans/${id}`, dto)
        : await client.post<ClientPlanAdminItem>('/loyalty/plans', dto);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useArchiveClientPlanMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useLoyaltyInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.patch<ClientPlanAdminItem>(`/loyalty/plans/${id}/archive`);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useReactivateClientPlanMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useLoyaltyInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.patch<ClientPlanAdminItem>(`/loyalty/plans/${id}/reactivate`);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteClientPlanMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useLoyaltyInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/loyalty/plans/${id}`);
    },
    onSuccess: invalidate,
  });
}

export type SubscriberAction = 'pause' | 'resume' | 'cancel';

export function useSubscriberActionMutation() {
  const { client } = useEstablishmentAuth();
  const invalidate = useLoyaltyInvalidate();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: SubscriberAction }) => {
      await client.patch(`/loyalty/subscribers/${id}/${action}`);
    },
    onSuccess: invalidate,
  });
}
