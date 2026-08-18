'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEstablishmentAuth } from '@barbervp/ui';
import type {
  AccountListQuery,
  AccountPayableItem,
  AccountPayableListResponse,
  AccountReceivableItem,
  AccountReceivableListResponse,
  BankAccountItem,
  CashFlowResponse,
  CashRegisterStatusResponse,
  CloseCashRegisterDto,
  CreateAccountPayableDto,
  CreateAccountReceivableDto,
  OpenCashRegisterDto,
  UpsertBankAccountDto,
} from '@barbervp/types';

function qs(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

// ── Caixa ────────────────────────────────────────────────────────────────

export function useCashRegisterQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['cash-register'],
    queryFn: async () => {
      const { data } = await client.get<CashRegisterStatusResponse>('/finance/cash-register');
      return data;
    },
  });
}

export function useOpenCashMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: OpenCashRegisterDto) => {
      const { data } = await client.post<CashRegisterStatusResponse>('/finance/cash-register/open', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-register'] }),
  });
}

export function useCloseCashMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CloseCashRegisterDto) => {
      const { data } = await client.post<CashRegisterStatusResponse>('/finance/cash-register/close', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash-register'] }),
  });
}

// ── Contas a pagar/receber ───────────────────────────────────────────────

export function usePayablesQuery(query: AccountListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['payables', query],
    queryFn: async () => {
      const { data } = await client.get<AccountPayableListResponse>(`/finance/payables?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
    // 403 de plano não é falha transitória — repetir 3× só atrasa o upsell.
    retry: false,
  });
}

export function useCreatePayableMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateAccountPayableDto) => {
      const { data } = await client.post<AccountPayableItem>('/finance/payables', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payables'] }),
  });
}

export function usePayPayableMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.patch<AccountPayableItem>(`/finance/payables/${id}/pay`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payables'] }),
  });
}

export function useReceivablesQuery(query: AccountListQuery) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['receivables', query],
    queryFn: async () => {
      const { data } = await client.get<AccountReceivableListResponse>(`/finance/receivables?${qs(query)}`);
      return data;
    },
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useCreateReceivableMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateAccountReceivableDto) => {
      const { data } = await client.post<AccountReceivableItem>('/finance/receivables', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receivables'] }),
  });
}

export function useReceiveReceivableMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await client.patch<AccountReceivableItem>(`/finance/receivables/${id}/receive`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receivables'] }),
  });
}

// ── Contas bancárias ─────────────────────────────────────────────────────

export function useBankAccountsQuery() {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data } = await client.get<BankAccountItem[]>('/finance/bank-accounts');
      return data;
    },
    retry: false,
  });
}

export function useSaveBankAccountMutation() {
  const { client } = useEstablishmentAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id?: string; dto: UpsertBankAccountDto }) => {
      const { data } = id
        ? await client.patch<BankAccountItem>(`/finance/bank-accounts/${id}`, dto)
        : await client.post<BankAccountItem>('/finance/bank-accounts', dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-accounts'] }),
  });
}

// ── Fluxo de caixa ───────────────────────────────────────────────────────

export function useCashFlowQuery(months = 6) {
  const { client } = useEstablishmentAuth();
  return useQuery({
    queryKey: ['cash-flow', months],
    queryFn: async () => {
      const { data } = await client.get<CashFlowResponse>(`/finance/cash-flow?months=${months}`);
      return data;
    },
    retry: false,
  });
}
