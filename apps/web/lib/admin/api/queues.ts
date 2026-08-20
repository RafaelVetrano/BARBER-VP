'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AdminQueueDetail, AdminQueuesResponse } from '@barbervp/types';

/**
 * Painel de jobs (fase 09).
 *
 * O resumo se atualiza sozinho a cada 10s: a fila do outbox roda a cada
 * minuto, e uma tela de operação que só muda quando alguém aperta F5 não serve
 * para acompanhar um job em andamento.
 */
export function useAdminQueuesQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-queues'],
    queryFn: async () => {
      const { data } = await client.get<AdminQueuesResponse>('/admin/queues');
      return data;
    },
    refetchInterval: 10_000,
  });
}

export function useAdminQueueDetailQuery(name: string | null) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-queue', name],
    enabled: name !== null,
    queryFn: async () => {
      const { data } = await client.get<AdminQueueDetail>(`/admin/queues/${name}?limit=20`);
      return data;
    },
    refetchInterval: 10_000,
  });
}

export function useRunQueueMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await client.post<{ enqueued: true; jobId: string }>(
        `/admin/queues/${name}/run`,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-queues'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-queue'] });
    },
  });
}

export function useRetryJobMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, jobId }: { name: string; jobId: string }) => {
      await client.post(`/admin/queues/${name}/jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-queues'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-queue'] });
    },
  });
}
