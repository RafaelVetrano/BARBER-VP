'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  AddOrderItemDto,
  ApplyOrderDiscountDto,
  AssignOrderDto,
  CloseOrderDto,
  OpenOrderDto,
  OrderDetail,
  OrderListQuery,
  OrderListResponse,
  PosCatalogResponse,
  RedeemOrderLoyaltyDto,
  ReopenOrderDto,
  UpdateOrderItemDto,
} from '@barbervp/types';

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

/**
 * Catálogo do balcão. `enabled` porque ele só interessa com a comanda aberta:
 * a lista de comandas não mostra serviço nem produto, e buscá-lo no load da
 * página é uma requisição a mais concorrendo com a renovação de sessão.
 */
export function usePosCatalogQuery(options?: { enabled?: boolean }) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['pos-catalog'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data } = await client.get<PosCatalogResponse>('/orders/catalog');
      return data;
    },
  });
}

/**
 * `enabled` existe porque a aba "Todas" mantém as duas consultas montadas
 * (abertas e fechadas) e as outras duas abas desligam a que não mostram —
 * desmontar o hook perderia a página e a busca ao voltar.
 */
export function useOrdersQuery(query: OrderListQuery, options?: { enabled?: boolean }) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['orders', query],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data } = await client.get<OrderListResponse>(`/orders?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
}

export function useOrderQuery(id: string | null) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await client.get<OrderDetail>(`/orders/${id}`);
      return data;
    },
  });
}

function useInvalidateOrder(id: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['order', id] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['pos-catalog'] });
  };
}

export function useOpenOrderMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: OpenOrderDto) => {
      const { data } = await client.post<OrderDetail>('/orders', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}

/** "trocar" do cabeçalho da comanda — cliente e/ou barbeiro. */
export function useAssignOrderMutation(orderId: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async (dto: AssignOrderDto) => {
      const { data } = await client.patch<OrderDetail>(`/orders/${orderId}`, dto);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useAddOrderItemMutation(orderId: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async (dto: AddOrderItemDto) => {
      const { data } = await client.post<OrderDetail>(`/orders/${orderId}/items`, dto);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateOrderItemMutation(orderId: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async ({ itemId, dto }: { itemId: string; dto: UpdateOrderItemDto }) => {
      const { data } = await client.patch<OrderDetail>(`/orders/${orderId}/items/${itemId}`, dto);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveOrderItemMutation(orderId: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data } = await client.delete<OrderDetail>(`/orders/${orderId}/items/${itemId}`);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useApplyDiscountMutation(orderId: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async (dto: ApplyOrderDiscountDto) => {
      const { data } = await client.patch<OrderDetail>(`/orders/${orderId}/discount`, dto);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRedeemLoyaltyMutation(orderId: string) {
  const { client } = useEstablishmentAuth();
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async (dto: RedeemOrderLoyaltyDto) => {
      const { data } = await client.patch<OrderDetail>(`/orders/${orderId}/loyalty`, dto);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCloseOrderMutation(orderId: string) {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CloseOrderDto) => {
      const { data } = await client.post<OrderDetail>(`/orders/${orderId}/close`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pos-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

/**
 * "Cancelar comanda" — a saída que faltava para a comanda aberta por engano
 * (agente 31). Sem lançamento financeiro nenhum atrás: só comanda ABERTA
 * cancela, e comanda aberta não gerou pagamento, caixa nem comissão.
 */
export function useCancelOrderMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.post<OrderDetail>(`/orders/${id}/cancel`, {});
      return data;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // A comanda podia ter nascido de um agendamento — o drawer da Agenda
      // volta a oferecer "Abrir comanda".
      queryClient.invalidateQueries({ queryKey: ['staff-agenda-detail'] });
    },
  });
}

export function useReopenOrderMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: ReopenOrderDto }) => {
      const { data } = await client.post<OrderDetail>(`/orders/${id}/reopen`, dto);
      return data;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // A reabertura desfaz baixa de estoque e comissão — as duas telas que
      // leem esses números ficariam mostrando o mundo de antes.
      queryClient.invalidateQueries({ queryKey: ['pos-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
    },
  });
}
