'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  ClientListItem,
  ClientListQuery,
  ClientListResponse,
  UpdateClientProfileDto,
} from '@barbervp/types';

function toQueryString(query: ClientListQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.favoriteBarberId) params.set('favoriteBarberId', query.favoriteBarberId);
  if (query.blocked !== undefined) params.set('blocked', String(query.blocked));
  if (query.sort) params.set('sort', query.sort);
  if (query.order) params.set('order', query.order);
  if (query.page) params.set('page', String(query.page));
  if (query.perPage) params.set('perPage', String(query.perPage));
  return params.toString();
}

export function useClientsQuery(query: ClientListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['clients', query],
    queryFn: async () => {
      const { data } = await client.get<ClientListResponse>(`/clients?${toQueryString(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useUpdateClientMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateClientProfileDto }) => {
      const { data } = await client.patch<ClientListItem>(`/clients/${id}`, dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useSetClientBlockedMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) => {
      const { data } = await client.patch<ClientListItem>(`/clients/${id}/${blocked ? 'block' : 'unblock'}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}
