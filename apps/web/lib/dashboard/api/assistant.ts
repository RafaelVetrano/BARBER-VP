'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AiChatHistoryResponse, AiChatResponse } from '@barbervp/types';

const KEY = ['assistant-messages'] as const;

export function useAiChatHistoryQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await client.get<AiChatHistoryResponse>('/assistant/messages');
      return data;
    },
  });
}

export function useSendAiChatMessageMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const { data } = await client.post<AiChatResponse>('/assistant/messages', { content });
      return data;
    },
    // A resposta já traz a mensagem e o uso atualizados: escrever no cache
    // evita o "pisca" de um refetch inteiro do histórico a cada pergunta.
    onSuccess: (data) => {
      queryClient.setQueryData<AiChatHistoryResponse>(KEY, (previous) =>
        previous
          ? { ...previous, messages: [...previous.messages, data.message], usage: data.usage }
          : previous,
      );
    },
    // O 403 de cota tem de repercutir na barra e no banner: o contador do
    // servidor é a verdade, não o que a tela achava que tinha sobrado.
    onError: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useClearAiChatMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.delete<AiChatHistoryResponse>('/assistant/messages');
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
}
