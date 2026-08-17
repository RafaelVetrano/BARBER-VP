'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type { AddTenantPhotoDto, MyPageSettings, UpdateMyPageDto } from '@barbervp/types';

export function useMyPageQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['my-page'],
    queryFn: async () => {
      const { data } = await client.get<MyPageSettings>('/my-page');
      return data;
    },
  });
}

export function useUpdateMyPageMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateMyPageDto) => {
      const { data } = await client.patch<MyPageSettings>('/my-page', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-page'] }),
  });
}

export function useAddPhotoMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: AddTenantPhotoDto) => {
      const { data } = await client.post<MyPageSettings>('/my-page/photos', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-page'] }),
  });
}

export function useRemovePhotoMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.delete<MyPageSettings>(`/my-page/photos/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-page'] }),
  });
}
