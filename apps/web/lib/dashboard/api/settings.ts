'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  BarbershopSettings,
  ChangePlanDto,
  CurrentPlanResponse,
  PreferencesSettings,
  PriceCalculatorDto,
  PriceCalculatorResult,
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

export function useCurrentPlanQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['settings-plan'],
    queryFn: async () => {
      const { data } = await client.get<CurrentPlanResponse>('/settings/plan');
      return data;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-plan'] }),
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

export function usePriceCalculatorMutation() {
  const { client } = useEstablishmentAuth();
  return useMutation({
    mutationFn: async (dto: PriceCalculatorDto) => {
      const { data } = await client.post<PriceCalculatorResult>('/settings/price-calculator', dto);
      return data;
    },
  });
}
