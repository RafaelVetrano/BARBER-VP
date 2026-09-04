'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  AdminTenantDetail,
  AdminTenantListQuery,
  AdminTenantListResponse,
  ChangeTenantPlanDto,
  ImpersonateResultDto,
} from '@barbervp/types';

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useAdminTenantsQuery(query: AdminTenantListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-tenants', query],
    queryFn: async () => {
      const { data } = await client.get<AdminTenantListResponse>(`/admin/tenants?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useAdminTenantQuery(id: string | null) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-tenant', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await client.get<AdminTenantDetail>(`/admin/tenants/${id}`);
      return data;
    },
  });
}

function useInvalidateTenants(id: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['admin-tenant', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
  };
}

export function useSuspendTenantMutation(id: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateTenants(id);
  return useMutation({
    mutationFn: async () => {
      await client.patch(`/admin/tenants/${id}/suspend`);
    },
    onSuccess: invalidate,
  });
}

export function useReactivateTenantMutation(id: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateTenants(id);
  return useMutation({
    mutationFn: async () => {
      await client.patch(`/admin/tenants/${id}/reactivate`);
    },
    onSuccess: invalidate,
  });
}

export function useChangeTenantPlanMutation(id: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateTenants(id);
  return useMutation({
    mutationFn: async (dto: ChangeTenantPlanDto) => {
      await client.patch(`/admin/tenants/${id}/plan`, dto);
    },
    onSuccess: invalidate,
  });
}

export function useImpersonateMutation(id: string) {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.post<ImpersonateResultDto>(`/admin/tenants/${id}/impersonate`);
      return data;
    },
  });
}

/**
 * Encerra à força a impersonação em curso. Vale NA HORA — o `JwtAuthGuard`
 * confere a `AuthSession` a cada requisição, então o access token já emitido
 * morre junto, sem esperar os 900s.
 */
export function useRevokeImpersonationMutation(id: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateTenants(id);
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.post<{ revoked: number }>(
        `/admin/tenants/${id}/impersonate/revoke`,
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

/**
 * Desfaz a exclusão de conta agendada. É a única saída quando o dono perde o
 * acesso ao próprio login dentro dos 30 dias — sem isto a `MaintenanceService`
 * apagava a barbearia no vencimento e ninguém podia impedir.
 */
export function useCancelTenantDeletionMutation(id: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateTenants(id);
  return useMutation({
    mutationFn: async () => {
      await client.post(`/admin/tenants/${id}/deletion/cancel`);
    },
    onSuccess: invalidate,
  });
}
