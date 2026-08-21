'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  ClientPlanAdminItem,
  CreateRaffleDto,
  LoyaltyClientBalance,
  LoyaltyProgramConfig,
  RaffleItem,
  SubscriberItem,
  UpdateLoyaltyProgramDto,
  UpsertClientPlanDto,
} from '@barbervp/types';

export function useLoyaltyProgramQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['loyalty-program'],
    queryFn: async () => {
      const { data } = await client.get<LoyaltyProgramConfig>('/loyalty/program');
      return data;
    },
    retry: false,
  });
}

export function useUpdateLoyaltyProgramMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateLoyaltyProgramDto) => {
      const { data } = await client.patch<LoyaltyProgramConfig>('/loyalty/program', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyalty-program'] }),
  });
}

export function useLoyaltyClientsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['loyalty-clients'],
    queryFn: async () => {
      const { data } = await client.get<LoyaltyClientBalance[]>('/loyalty/clients');
      return data;
    },
    retry: false,
  });
}

export function useRafflesQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['raffles'],
    queryFn: async () => {
      const { data } = await client.get<RaffleItem[]>('/loyalty/raffles');
      return data;
    },
    retry: false,
  });
}

export function useCreateRaffleMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateRaffleDto) => {
      const { data } = await client.post<RaffleItem>('/loyalty/raffles', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['raffles'] }),
  });
}

export function useDrawRaffleMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.post<RaffleItem>(`/loyalty/raffles/${id}/draw`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['raffles'] }),
  });
}

export function useClientPlansQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['loyalty-plans'],
    queryFn: async () => {
      const { data } = await client.get<ClientPlanAdminItem[]>('/loyalty/plans');
      return data;
    },
    retry: false,
  });
}

export function useSaveClientPlanMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertClientPlanDto }) => {
      const { data } = id
        ? await client.patch<ClientPlanAdminItem>(`/loyalty/plans/${id}`, dto)
        : await client.post<ClientPlanAdminItem>('/loyalty/plans', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyalty-plans'] }),
  });
}

export function useArchiveClientPlanMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.patch(`/loyalty/plans/${id}/archive`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyalty-plans'] }),
  });
}

export function useSubscribersQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['subscribers'],
    queryFn: async () => {
      const { data } = await client.get<SubscriberItem[]>('/loyalty/subscribers');
      return data;
    },
    retry: false,
  });
}
