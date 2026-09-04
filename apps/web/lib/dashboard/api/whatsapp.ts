'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  UpdateWhatsappAutomationDto,
  WhatsappAutomationItem,
  WhatsappAutomationsResponse,
  WhatsappConnection,
  WhatsappEvent,
  WhatsappHistoryPage,
  WhatsappReactivationResult,
  WhatsappReactivationSummary,
} from '@barbervp/types';

/**
 * Aba WhatsApp — um bloco, uma consulta.
 *
 * São quatro chamadas em vez de um `overview` só de propósito: o enunciado
 * pede erro e retry POR BLOCO, e um endpoint agregado faria a faixa de
 * reativação cair junto com o histórico.
 */

export const WHATSAPP_KEYS = {
  automations: ['whatsapp-config'] as const,
  connection: ['whatsapp-config', 'connection'] as const,
  history: ['whatsapp-config', 'history'] as const,
  reactivation: ['whatsapp-config', 'reactivation'] as const,
};

export function useWhatsappAutomationsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: WHATSAPP_KEYS.automations,
    queryFn: async () => {
      const { data } = await client.get<WhatsappAutomationsResponse>('/whatsapp-config');
      return data;
    },
  });
}

export function useWhatsappConnectionQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: WHATSAPP_KEYS.connection,
    queryFn: async () => {
      const { data } = await client.get<WhatsappConnection>('/whatsapp-config/connection');
      return data;
    },
  });
}

export function useWhatsappHistoryQuery(limit = 25) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: [...WHATSAPP_KEYS.history, limit],
    queryFn: async () => {
      const { data } = await client.get<WhatsappHistoryPage>('/whatsapp-config/history', {
        params: { limit },
      });
      return data;
    },
  });
}

export function useWhatsappReactivationQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: WHATSAPP_KEYS.reactivation,
    queryFn: async () => {
      const { data } = await client.get<WhatsappReactivationSummary>(
        '/whatsapp-config/reactivation',
      );
      return data;
    },
  });
}

export function useUpdateWhatsappAutomationMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ event, dto }: { event: WhatsappEvent; dto: UpdateWhatsappAutomationDto }) => {
      const { data } = await client.patch<WhatsappAutomationItem>(`/whatsapp-config/${event}`, dto);
      return data;
    },
    // A janela da reativação vive na automação: mudar "Após 45 dias" muda a
    // contagem da faixa dourada, então as duas consultas caem juntas.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_KEYS.automations });
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_KEYS.reactivation });
    },
  });
}

export function useSendWhatsappReactivationMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.post<WhatsappReactivationResult>(
        '/whatsapp-config/reactivation/send',
      );
      return data;
    },
    // O disparo escreve no outbox — o histórico logo abaixo mostra as linhas
    // novas sem que o dono precise recarregar a página.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_KEYS.history });
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_KEYS.connection });
    },
  });
}
