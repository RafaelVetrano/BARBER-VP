'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  AgendaView,
  CancelStaffAppointmentDto,
  CreateStaffAppointmentDto,
  MoveStaffAppointmentDto,
  StaffAgendaResponse,
  StaffAppointmentItem,
} from '@barbervp/types';

export interface StaffAgendaParams {
  date: string;
  view: AgendaView;
  barberId?: string;
}

function qs(params: StaffAgendaParams): string {
  const search = new URLSearchParams({ date: params.date, view: params.view });
  if (params.barberId) search.set('barberId', params.barberId);
  return search.toString();
}

export function useStaffAgendaQuery(params: StaffAgendaParams) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['staff-agenda', params],
    queryFn: async () => {
      const { data } = await client.get<StaffAgendaResponse>(`/staff-agenda?${qs(params)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useCreateStaffAppointmentMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateStaffAppointmentDto) => {
      const { data } = await client.post<StaffAppointmentItem>('/staff-agenda', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-agenda'] }),
  });
}

export function useMoveStaffAppointmentMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: MoveStaffAppointmentDto }) => {
      const { data } = await client.patch<StaffAppointmentItem>(`/staff-agenda/${id}/move`, dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-agenda'] }),
  });
}

export function useConfirmStaffAppointmentMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.patch<StaffAppointmentItem>(`/staff-agenda/${id}/confirm`, {});
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-agenda'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] });
    },
  });
}

export function useCancelStaffAppointmentMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: CancelStaffAppointmentDto }) => {
      const { data } = await client.patch<StaffAppointmentItem>(`/staff-agenda/${id}/cancel`, dto);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-agenda'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
  });
}
