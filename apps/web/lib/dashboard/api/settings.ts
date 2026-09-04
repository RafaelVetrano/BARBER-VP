'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  BarbershopSettings,
  ChangePlanDto,
  CurrentPlanResponse,
  PlanChangePreview,
  PreferencesSettings,
  UnitItem,
  UpdateBarbershopSettingsDto,
  UpdatePreferencesDto,
  UpsertUnitDto,
} from '@barbervp/types';

export function useBarbershopSettingsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['settings-barbershop'],
    queryFn: async () => {
      const { data } = await client.get<BarbershopSettings>('/settings/barbershop');
      return data;
    },
  });
}

export function useUpdateBarbershopSettingsMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateBarbershopSettingsDto) => {
      const { data } = await client.patch<BarbershopSettings>('/settings/barbershop', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-barbershop'] }),
  });
}

export function useUnitsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['settings-units'],
    queryFn: async () => {
      const { data } = await client.get<UnitItem[]>('/settings/units');
      return data;
    },
    retry: false,
  });
}

export function useSaveUnitMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertUnitDto }) => {
      const { data } = id
        ? await client.patch<UnitItem>(`/settings/units/${id}`, dto)
        : await client.post<UnitItem>('/settings/units', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-units'] }),
  });
}

export function useCurrentPlanQuery(enabled = true) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['settings-plan'],
    queryFn: async () => {
      const { data } = await client.get<CurrentPlanResponse>('/settings/plan');
      return data;
    },
    enabled,
    retry: false,
  });
}

/**
 * Ganhos e perdas da troca (`modalTrocarPlano`). Só busca quando um plano foi
 * escolhido: é a abertura do modal que dispara a chamada, e o modal só mostra
 * os botões depois que a resposta chega — confirmar uma troca cujo impacto
 * ainda não foi calculado seria assinar em branco.
 */
export function usePlanChangePreviewQuery(planId: string | null) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['settings-plan-preview', planId],
    queryFn: async () => {
      const { data } = await client.get<PlanChangePreview>(`/settings/plan/preview/${planId}`);
      return data;
    },
    enabled: planId !== null,
    retry: false,
  });
}

/**
 * O link "PDF" do histórico de faturas. Mesmo caminho do relatório de
 * comissões: a rota exige Bearer, então um `<a href>` cru baixaria um 401.
 */
export function useInvoicePdfMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await client.get<Blob>(`/settings/plan/invoices/${invoiceId}.pdf`, {
        responseType: 'blob',
      });
      const disposition = String(response.headers['content-disposition'] ?? '');
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'fatura.pdf';

      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return filename;
    },
  });
}

export function useChangePlanMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ChangePlanDto) => {
      const { data } = await client.post<CurrentPlanResponse>('/settings/plan/change', dto);
      return data;
    },
    // A troca mexe em muito mais do que a aba Plano: o `shell` carrega as
    // features (cadeados de TODA a casca), a Equipe ganha/perde barbeiros
    // "Inativo pelo plano" e as unidades passam a existir ou não. Invalidar só
    // `settings-plan` deixava a topbar anunciando o plano antigo.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings-plan'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-shell'] }),
        queryClient.invalidateQueries({ queryKey: ['settings-units'] }),
        queryClient.invalidateQueries({ queryKey: ['barbers'] }),
        queryClient.invalidateQueries({ queryKey: ['team-plan-usage'] }),
      ]),
  });
}

export function usePreferencesQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['settings-preferences'],
    queryFn: async () => {
      const { data } = await client.get<PreferencesSettings>('/settings/preferences');
      return data;
    },
  });
}

export function useUpdatePreferencesMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdatePreferencesDto) => {
      const { data } = await client.patch<PreferencesSettings>('/settings/preferences', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-preferences'] }),
  });
}

// A calculadora de preço saiu de Configurações — vive no catálogo
// (`api/catalog.ts`, `usePriceCalculatorQuery`), onde o protótipo a desenha.
