'use client';

import { useQuery } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AdminOutboxListQuery, AdminOutboxListResponse } from '@barbervp/types';

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

/** "Mensagens enviadas" — a trilha dos adapters de WhatsApp e e-mail. */
export function useAdminOutboxQuery(query: AdminOutboxListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['admin-outbox', query],
    queryFn: async () => {
      const { data } = await client.get<AdminOutboxListResponse>(`/admin/outbox?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}
