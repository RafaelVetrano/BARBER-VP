'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  ClientBulkBlockDto,
  ClientBulkBlockResult,
  ClientBulkMessageDto,
  ClientBulkMessageResult,
  ClientDetail,
  ClientListItem,
  ClientListQuery,
  ClientListResponse,
  ClientStatus,
  CreateClientDto,
  UpdateClientProfileDto,
} from '@barbervp/types';

function toQueryString(query: ClientListQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.favoriteBarberId) params.set('favoriteBarberId', query.favoriteBarberId);
  if (query.blocked !== undefined) params.set('blocked', String(query.blocked));
  if (query.status) params.set('status', query.status);
  if (query.sort) params.set('sort', query.sort);
  if (query.order) params.set('order', query.order);
  if (query.page) params.set('page', String(query.page));
  if (query.perPage) params.set('perPage', String(query.perPage));
  return params.toString();
}

/**
 * `enabled` existe porque o papel `BARBER` toma 403 em `/clients` (`SPEC.md`
 * → RBAC): o modal de agendamento monta o hook mesmo assim, e sem o freio a
 * tela dele abriria com um erro que não tem conserto pelo lado do usuário.
 */
export function useClientsQuery(query: ClientListQuery, enabled = true) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['clients', query],
    enabled,
    queryFn: async () => {
      const { data } = await client.get<ClientListResponse>(`/clients?${toQueryString(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

/** Perfil do drawer — só busca quando há um cliente aberto. */
export function useClientDetailQuery(profileId: string | null) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['client-detail', profileId],
    enabled: profileId !== null,
    queryFn: async () => {
      const { data } = await client.get<ClientDetail>(`/clients/${profileId}`);
      return data;
    },
  });
}

/** Cadastro do balcão (agenda) e ficha completa (aba Clientes). */
export function useCreateClientMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateClientDto) => {
      const { data } = await client.post<ClientListItem>('/clients', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
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
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client-detail', variables.id] });
    },
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
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client-detail', variables.id] });
    },
  });
}

export function useBulkBlockClientsMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ClientBulkBlockDto) => {
      const { data } = await client.post<ClientBulkBlockResult>('/clients/bulk/block', dto);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client-detail'] });
    },
  });
}

export function useBulkMessageClientsMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async (dto: ClientBulkMessageDto) => {
      const { data } = await client.post<ClientBulkMessageResult>('/clients/bulk/message', dto);
      return data;
    },
  });
}

export interface ClientExportParams {
  search?: string;
  status?: ClientStatus;
  /** Seleção da barra de ações — quando presente, ignora busca e chip. */
  ids?: string[];
}

/**
 * Baixa o CSV pelo MESMO cliente axios das outras chamadas: o endpoint exige
 * `Authorization` + tenant, então um `<a href>` direto para a API baixaria um
 * 401 em formato de planilha.
 */
export function useExportClientsMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async (params: ClientExportParams) => {
      const query = new URLSearchParams();
      if (params.ids?.length) query.set('ids', params.ids.join(','));
      else {
        if (params.search) query.set('search', params.search);
        if (params.status) query.set('status', params.status);
      }

      const response = await client.get<Blob>(`/clients/export?${query.toString()}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
  });
}
