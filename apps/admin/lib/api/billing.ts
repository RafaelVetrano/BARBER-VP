'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AdminInvoiceListQuery, AdminInvoiceListResponse, RunBillingCycleResult } from '@barbervp/types';

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useAdminInvoicesQuery(query: AdminInvoiceListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-invoices', query],
    queryFn: async () => {
      const { data } = await client.get<AdminInvoiceListResponse>(`/admin/billing/invoices?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useRunBillingCycleMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.post<RunBillingCycleResult>('/admin/billing/run-cycle');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-invoices'] }),
  });
}

export function useApproveInvoiceMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.post(`/admin/billing/invoices/${id}/approve`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-invoices'] }),
  });
}

export function useRejectInvoiceMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.post<{ suspended: boolean }>(`/admin/billing/invoices/${id}/reject`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-invoices'] }),
  });
}
