'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { UpdateWhatsappAutomationDto, WhatsappAutomationItem, WhatsappEvent } from '@barbervp/types';

export function useWhatsappAutomationsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: async () => {
      const { data } = await client.get<WhatsappAutomationItem[]>('/whatsapp-config');
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] }),
  });
}
