'use client';

import { useQuery } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  DashboardOverviewResponse,
  DashboardPeriod,
  DashboardShellResponse,
  GlobalSearchResponse,
  NotificationsResponse,
} from '@barbervp/types';

/**
 * A casca (`/dashboard/shell`) é pedida por TODAS as telas do painel, então
 * fica cacheada por 5 minutos: plano, features e unidades não mudam entre um
 * clique de menu e outro, e sem isso cada navegação repetiria a chamada.
 */
const SHELL_STALE_MS = 5 * 60 * 1_000;

export function useDashboardShellQuery() {
  const { client, status } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['dashboard-shell'],
    enabled: status === 'authenticated',
    staleTime: SHELL_STALE_MS,
    queryFn: async () => {
      const { data } = await client.get<DashboardShellResponse>('/dashboard/shell');
      return data;
    },
  });
}

export function useDashboardOverviewQuery(period: DashboardPeriod) {
  const { client, status } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['dashboard-overview', period],
    enabled: status === 'authenticated',
    // Trocar de recorte não deve piscar a página inteira em esqueleto: o
    // gráfico anterior fica no lugar até o novo chegar.
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data } = await client.get<DashboardOverviewResponse>(
        `/dashboard/overview?period=${period}`,
      );
      return data;
    },
  });
}

export function useNotificationsQuery() {
  const { client, status } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['dashboard-notifications'],
    enabled: status === 'authenticated',
    staleTime: 60 * 1_000,
    queryFn: async () => {
      const { data } = await client.get<NotificationsResponse>('/notifications');
      return data;
    },
  });
}

/** Busca global da topbar. `q` com menos de 2 caracteres não chega à API. */
export function useGlobalSearchQuery(query: string) {
  const { client, status } = useEstablishmentAuth();
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['global-search', trimmed],
    enabled: status === 'authenticated' && trimmed.length >= 2,
    staleTime: 30 * 1_000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data } = await client.get<GlobalSearchResponse>(
        `/search?q=${encodeURIComponent(trimmed)}`,
      );
      return data;
    },
  });
}
