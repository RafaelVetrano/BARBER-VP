'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  ProductListItem,
  ProductListQuery,
  ProductListResponse,
  ServiceListItem,
  ServiceListQuery,
  ServiceListResponse,
  UpsertProductDto,
  UpsertServiceDto,
} from '@barbervp/types';

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

// ── Serviços ─────────────────────────────────────────────────────────────

export function useServicesQuery(query: ServiceListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['services', query],
    queryFn: async () => {
      const { data } = await client.get<ServiceListResponse>(`/services?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useSaveServiceMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertServiceDto }) => {
      const { data } = id
        ? await client.patch<ServiceListItem>(`/services/${id}`, dto)
        : await client.post<ServiceListItem>('/services', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useSetServiceActiveMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data } = await client.patch<ServiceListItem>(
        `/services/${id}/${active ? 'activate' : 'deactivate'}`,
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });
}

// ── Produtos ─────────────────────────────────────────────────────────────

export function useProductsQuery(query: ProductListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['products', query],
    queryFn: async () => {
      const { data } = await client.get<ProductListResponse>(`/products?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useSaveProductMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertProductDto }) => {
      const { data } = id
        ? await client.patch<ProductListItem>(`/products/${id}`, dto)
        : await client.post<ProductListItem>('/products', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useSetProductActiveMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data } = await client.patch<ProductListItem>(
        `/products/${id}/${active ? 'activate' : 'deactivate'}`,
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}
