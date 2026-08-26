'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  BarberListItem,
  CreateBarberDto,
  CreateScheduleExceptionDto,
  CreateStaffInviteDto,
  ScheduleExceptionItem,
  StaffInviteLink,
  StaffInviteListItem,
  TeamPlanUsage,
  UpdateBarberDto,
} from '@barbervp/types';

/**
 * Tudo que a aba Equipe mexe muda o teto do plano junto: convidar ocupa vaga,
 * aceitar troca a vaga de lugar, reativar disputa a mesma. Invalidar as três
 * chaves de uma vez evita cabeçalho "2 de 2" com três cards na tela.
 */
const TEAM_KEYS = [['barbers'], ['staff-invites'], ['team-plan-usage']] as const;

// ── Barbeiros ────────────────────────────────────────────────────────────

export function useBarbersQuery(options?: { enabled?: boolean }) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['barbers'],
    queryFn: async () => {
      const { data } = await client.get<BarberListItem[]>('/barbers');
      return data;
    },
    // `/barbers` é OWNER/MANAGER: telas que o `BARBER` também abre desligam a
    // consulta em vez de colecionar 403 no console.
    enabled: options?.enabled ?? true,
  });
}

/** "Barbeiros: X de Y", a barra de uso e o banner de downgrade. */
export function useTeamPlanUsageQuery(options?: { enabled?: boolean }) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['team-plan-usage'],
    queryFn: async () => {
      const { data } = await client.get<TeamPlanUsage>('/barbers/plan-usage');
      return data;
    },
    enabled: options?.enabled ?? true,
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
    onSuccess: () => invalidateTeam(queryClient),
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
    onSuccess: () => invalidateTeam(queryClient),
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
    onSuccess: () => invalidateTeam(queryClient),
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
    onSuccess: () => invalidateTeam(queryClient),
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
    onSuccess: () => invalidateTeam(queryClient),
  });
}

/**
 * "Gerar link de cadastro" — reemite o token e devolve a URL do
 * `CadastroFuncionario`. O link anterior (o do e-mail) deixa de valer, então a
 * tela avisa isso na confirmação.
 */
export function useIssueInviteLinkMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.post<StaffInviteLink>(`/team/invites/${id}/link`);
      return data;
    },
    onSuccess: () => invalidateTeam(queryClient),
  });
}

function invalidateTeam(queryClient: ReturnType<typeof useQueryClient>): void {
  for (const queryKey of TEAM_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
