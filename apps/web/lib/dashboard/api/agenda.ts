'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  AgendaView,
  CancelStaffAppointmentDto,
  CreateStaffAgendaBlockDto,
  CreateStaffAppointmentDto,
  MoveStaffAppointmentDto,
  StaffAgendaBlockItem,
  StaffAgendaMonthResponse,
  StaffAgendaResponse,
  StaffAgendaSlotsResponse,
  StaffAppointmentDetail,
  StaffAppointmentItem,
} from '@barbervp/types';

export interface StaffAgendaParams {
  date: string;
  view: AgendaView;
  /** Multi-seleção do dropdown de barbeiros. Vazio = todos. */
  barberIds?: string[];
}

function qs(params: StaffAgendaParams): string {
  const search = new URLSearchParams({ date: params.date, view: params.view });
  if (params.barberIds && params.barberIds.length > 0) {
    search.set('barberIds', params.barberIds.join(','));
  }
  return search.toString();
}

/** Invalida tudo que muda quando um agendamento muda de estado. */
function invalidateAgenda(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['staff-agenda'] });
  void queryClient.invalidateQueries({ queryKey: ['staff-agenda-month'] });
  void queryClient.invalidateQueries({ queryKey: ['staff-agenda-detail'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard-notifications'] });
}

export function useStaffAgendaQuery(params: StaffAgendaParams, enabled = true) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['staff-agenda', params],
    enabled,
    queryFn: async () => {
      const { data } = await client.get<StaffAgendaResponse>(`/staff-agenda?${qs(params)}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useStaffAgendaMonthQuery(
  params: { date: string; barberIds?: string[] },
  enabled = true,
) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['staff-agenda-month', params],
    enabled,
    queryFn: async () => {
      const search = new URLSearchParams({ date: params.date });
      if (params.barberIds && params.barberIds.length > 0) {
        search.set('barberIds', params.barberIds.join(','));
      }
      const { data } = await client.get<StaffAgendaMonthResponse>(`/staff-agenda/month?${search}`);
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

/**
 * Horários do dia para o modal de criação/remarcação.
 *
 * Só dispara com barbeiro e serviços escolhidos — a duração total muda a
 * grade, então perguntar antes disso devolveria horários errados.
 */
export function useStaffAgendaSlotsQuery(params: {
  date: string;
  barberId: string | null;
  serviceIds: string[];
  ignoreAppointmentId?: string;
}) {
  const { client } = useEstablishmentAuth();
  const enabled = Boolean(params.barberId) && params.serviceIds.length > 0;

  return useQuery({
    queryKey: ['staff-agenda-slots', params],
    enabled,
    queryFn: async () => {
      const search = new URLSearchParams({
        date: params.date,
        barberId: params.barberId!,
        serviceIds: params.serviceIds.join(','),
      });
      if (params.ignoreAppointmentId) search.set('ignoreAppointmentId', params.ignoreAppointmentId);
      const { data } = await client.get<StaffAgendaSlotsResponse>(`/staff-agenda/slots?${search}`);
      return data;
    },
  });
}

/** Detalhe do drawer — só busca quando um agendamento está aberto. */
export function useStaffAppointmentDetailQuery(appointmentId: string | null) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['staff-agenda-detail', appointmentId],
    enabled: appointmentId !== null,
    queryFn: async () => {
      const { data } = await client.get<StaffAppointmentDetail>(`/staff-agenda/${appointmentId}`);
      return data;
    },
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
    onSuccess: () => invalidateAgenda(queryClient),
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
    onSuccess: () => invalidateAgenda(queryClient),
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
    onSuccess: () => invalidateAgenda(queryClient),
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
    onSuccess: () => invalidateAgenda(queryClient),
  });
}

/**
 * "Concluir" — o atendimento aconteceu (agente 31).
 *
 * Independente de abrir comanda: marca `DONE` e nada mais. O relatório é
 * invalidado junto porque "Atendimentos" passou a contar o agendamento
 * concluído sem comanda.
 */
export function useDoneStaffAppointmentMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.patch<StaffAppointmentItem>(`/staff-agenda/${id}/done`, {});
      return data;
    },
    onSuccess: () => {
      invalidateAgenda(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

/** "Marcar falta" — muda o status E incrementa o contador do cliente. */
export function useNoShowStaffAppointmentMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.patch<StaffAppointmentItem>(`/staff-agenda/${id}/no-show`, {});
      return data;
    },
    onSuccess: () => {
      invalidateAgenda(queryClient);
      // O bloqueio automático por faltas altera a ficha na aba Clientes.
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useCreateAgendaBlockMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateStaffAgendaBlockDto) => {
      const { data } = await client.post<StaffAgendaBlockItem>('/staff-agenda/blocks', dto);
      return data;
    },
    onSuccess: () => invalidateAgenda(queryClient),
  });
}

export function useDeleteAgendaBlockMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/staff-agenda/blocks/${id}`);
    },
    onSuccess: () => invalidateAgenda(queryClient),
  });
}
