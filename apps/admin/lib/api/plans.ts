'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AdminPlanItem, UpsertAdminPlanDto } from '@barbervp/types';

export function useAdminPlansQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data } = await client.get<AdminPlanItem[]>('/admin/plans');
      return data;
    },
  });
}

export function useSaveAdminPlanMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertAdminPlanDto }) => {
      const { data } = id
        ? await client.patch<AdminPlanItem>(`/admin/plans/${id}`, dto)
        : await client.post<AdminPlanItem>('/admin/plans', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-plans'] }),
  });
}

export function useArchiveAdminPlanMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.patch(`/admin/plans/${id}/archive`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-plans'] }),
  });
}
