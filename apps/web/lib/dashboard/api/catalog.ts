'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  PriceCalculatorState,
  ProductListItem,
  ProductListQuery,
  ProductListResponse,
  RestockProductDto,
  ServiceListItem,
  ServiceListQuery,
  ServiceListResponse,
  UpdatePriceCalculatorDto,
  UpsertProductDto,
  UpsertServiceDto,
} from '@barbervp/types';

/**
 * Um serviço não vive só nesta aba: mudar duração ou preço muda a grade de
 * horários do wizard público, o bloco da agenda e o preço que o balcão puxa
 * para a comanda. Todas essas leituras têm cache próprio no TanStack Query —
 * sem esta invalidação, o dono baixa o preço aqui e vende pelo antigo na
 * comanda aberta em outra aba do navegador.
 *
 * (O booking público não aparece na lista porque não tem cache de cliente: é
 * SSR e lê o banco a cada requisição.)
 */
const SERVICE_DEPENDENT_KEYS = [
  ['services'],
  ['staff-agenda'],
  ['staff-agenda-month'],
  ['staff-agenda-detail'],
  ['pos-catalog'],
  ['orders'],
  ['barbers'],
] as const;

const PRODUCT_DEPENDENT_KEYS = [
  ['products'],
  ['pos-catalog'],
  ['orders'],
  // O sino da home conta os produtos no mínimo — repor estoque tem de apagar
  // o alerta na mesma hora.
  ['dashboard-notifications'],
  ['dashboard-overview'],
] as const;

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

// ── Serviços ─────────────────────────────────────────────────────────────

export function useServicesQuery(query: ServiceListQuery, options: { enabled?: boolean } = {}) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    enabled: options.enabled ?? true,
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
    onSuccess: () => invalidateAll(queryClient, SERVICE_DEPENDENT_KEYS),
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
    onSuccess: () => invalidateAll(queryClient, SERVICE_DEPENDENT_KEYS),
  });
}

export function useDeleteServiceMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/services/${id}`);
    },
    onSuccess: () => invalidateAll(queryClient, SERVICE_DEPENDENT_KEYS),
  });
}

// ── Produtos ─────────────────────────────────────────────────────────────

export function useProductsQuery(query: ProductListQuery, options: { enabled?: boolean } = {}) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    enabled: options.enabled ?? true,
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
    onSuccess: () => invalidateAll(queryClient, PRODUCT_DEPENDENT_KEYS),
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
    onSuccess: () => invalidateAll(queryClient, PRODUCT_DEPENDENT_KEYS),
  });
}

export function useRestockProductMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: RestockProductDto }) => {
      const { data } = await client.post<ProductListItem>(`/products/${id}/restock`, dto);
      return data;
    },
    onSuccess: () => invalidateAll(queryClient, PRODUCT_DEPENDENT_KEYS),
  });
}

export function useDeleteProductMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/products/${id}`);
    },
    onSuccess: () => invalidateAll(queryClient, PRODUCT_DEPENDENT_KEYS),
  });
}

// ── Calculadora de preço (Avançado) ──────────────────────────────────────

export function usePriceCalculatorQuery(options: { enabled?: boolean } = {}) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['price-calculator'],
    queryFn: async () => {
      const { data } = await client.get<PriceCalculatorState>('/price-calculator');
      return data;
    },
    // O 403 do gate de plano é a resposta final, não uma falha passageira —
    // repetir só atrasa o paywall.
    retry: false,
    enabled: options.enabled ?? true,
  });
}

export function useSavePriceCalculatorMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdatePriceCalculatorDto) => {
      const { data } = await client.put<PriceCalculatorState>('/price-calculator', dto);
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(['price-calculator'], data),
  });
}

function invalidateAll(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: readonly (readonly string[])[],
): void {
  for (const key of keys) {
    void queryClient.invalidateQueries({ queryKey: [...key] });
  }
}
