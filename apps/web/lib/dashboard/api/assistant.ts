'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AiChatHistoryResponse, AiChatResponse } from '@barbervp/types';

export function useAiChatHistoryQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['assistant-messages'],
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assistant-messages'] }),
  });
}
