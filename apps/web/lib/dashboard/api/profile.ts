'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { ExportedUserData, MyProfile, UpdateMyProfileDto } from '@barbervp/types';

export const MY_PROFILE_KEY = ['my-profile'] as const;

export function useMyProfileQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: MY_PROFILE_KEY,
    queryFn: async () => {
      const { data } = await client.get<MyProfile>('/me');
      return data;
    },
  });
}

/**
 * O `PATCH` devolve o perfil já resolvido, então o cache é ESCRITO com a
 * resposta em vez de invalidado: uma segunda ida ao servidor só para reler o
 * que acabou de voltar faria o nome piscar entre o antigo e o novo.
 *
 * A sessão também é renovada — o nome e a foto aparecem no menu do avatar da
 * topbar, e ele lê de `useEstablishmentAuth`, não desta query.
 */
function useProfileWriter() {
  const queryClient = useQueryClient();
  const { refresh } = useEstablishmentAuth();
  return async (profile: MyProfile) => {
    queryClient.setQueryData<MyProfile>(MY_PROFILE_KEY, profile);
    await refresh();
    return profile;
  };
}

export function useUpdateMyProfileMutation() {
  const { client } = useEstablishmentAuth();
  const write = useProfileWriter();
  return useMutation({
    mutationFn: async (dto: UpdateMyProfileDto) => {
      const { data } = await client.patch<MyProfile>('/me', dto);
      return write(data);
    },
  });
}

export function useUploadAvatarMutation() {
  const { client } = useEstablishmentAuth();
  const write = useProfileWriter();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      // Sem `Content-Type` explícito: o boundary do multipart é gerado pelo
      // browser, e fixá-lo à mão quebra o parser do multer.
      const { data } = await client.post<MyProfile>('/me/avatar', body);
      return write(data);
    },
  });
}

export function useRemoveAvatarMutation() {
  const { client } = useEstablishmentAuth();
  const write = useProfileWriter();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.delete<MyProfile>('/me/avatar');
      return write(data);
    },
  });
}

/**
 * "Baixar meus dados" — o JSON vem no corpo e vira arquivo por um link
 * efêmero sobre o blob (a rota exige Bearer; um `<a href>` cru baixaria 401).
 */
export function useExportMyDataMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.get<ExportedUserData>('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `meus-dados-barbervp-${data.exportedAt.slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
  });
}

/** Gerente/barbeiro: encaminha ao dono o pedido de exclusão dos dados. */
export function useRequestDataDeletionMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async () => {
      await client.post('/me/data-deletion-request');
    },
  });
}

export function useRequestAccountDeletionMutation() {
  const { client } = useEstablishmentAuth();
  const write = useProfileWriter();
  return useMutation({
    mutationFn: async (confirm: string) => {
      const { data } = await client.post<MyProfile>('/me/account-deletion', { confirm });
      return write(data);
    },
  });
}

export function useCancelAccountDeletionMutation() {
  const { client } = useEstablishmentAuth();
  const write = useProfileWriter();
  return useMutation({
    mutationFn: async () => {
      const { data } = await client.delete<MyProfile>('/me/account-deletion');
      return write(data);
    },
  });
}
