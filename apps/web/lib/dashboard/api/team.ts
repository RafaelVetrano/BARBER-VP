'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  BarberListItem,
  CreateBarberDto,
  CreateScheduleExceptionDto,
  CreateStaffInviteDto,
  ScheduleExceptionItem,
  StaffInviteListItem,
  UpdateBarberDto,
  UpdateWorkScheduleDto,
  WorkScheduleDay,
} from '@barbervp/types';

// ── Barbeiros ────────────────────────────────────────────────────────────

export function useBarbersQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['barbers'],
    queryFn: async () => {
      const { data } = await client.get<BarberListItem[]>('/barbers');
      return data;
    },
  });
}

export function useCreateBarberMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateBarberDto) => {
      const { data } = await client.post<BarberListItem>('/barbers', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barbers'] }),
  });
}

export function useUpdateBarberMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateBarberDto }) => {
      const { data } = await client.patch<BarberListItem>(`/barbers/${id}`, dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barbers'] }),
  });
}

export function useUpdateWorkScheduleMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ barberId, dto }: { barberId: string; dto: UpdateWorkScheduleDto }) => {
      const { data } = await client.put<WorkScheduleDay[]>(`/barbers/${barberId}/work-schedule`, dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['barbers'] }),
  });
}

// ── Exceções (folga/férias/feriado) ────────────────────────────────────────

export function useScheduleExceptionsQuery(barberId?: string) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['schedule-exceptions', barberId ?? null],
    queryFn: async () => {
      const { data } = await client.get<ScheduleExceptionItem[]>(
        `/barbers/exceptions${barberId ? `?barberId=${barberId}` : ''}`,
      );
      return data;
    },
  });
}

export function useCreateScheduleExceptionMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateScheduleExceptionDto) => {
      const { data } = await client.post<ScheduleExceptionItem>('/barbers/exceptions', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedule-exceptions'] }),
  });
}

export function useDeleteScheduleExceptionMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/barbers/exceptions/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedule-exceptions'] }),
  });
}

// ── Convites ─────────────────────────────────────────────────────────────

export function useStaffInvitesQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['staff-invites'],
    queryFn: async () => {
      const { data } = await client.get<StaffInviteListItem[]>('/team/invites');
      return data;
    },
  });
}

export function useCreateStaffInviteMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateStaffInviteDto) => {
      const { data } = await client.post<StaffInviteListItem>('/team/invites', dto);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-invites'] });
      void queryClient.invalidateQueries({ queryKey: ['barbers'] });
    },
  });
}

export function useResendStaffInviteMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.post<StaffInviteListItem>(`/team/invites/${id}/resend`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-invites'] }),
  });
}

export function useRevokeStaffInviteMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.post<StaffInviteListItem>(`/team/invites/${id}/revoke`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-invites'] }),
  });
}
