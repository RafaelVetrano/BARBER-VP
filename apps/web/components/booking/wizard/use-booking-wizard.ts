'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  NO_PREFERENCE_BARBER,
  type AvailabilityResponse,
  type BookingQuote,
  type PublicBarbershop,
} from '@barbervp/types';
import { useClientAuth } from '@barbervp/ui';
import { bookingApi } from '@/lib/booking/booking-api';

export type WizardStep = 1 | 2 | 3 | 4;

/** Dados de visitante guardados no aparelho ("Lembrar meus dados"). */
const GUEST_STORAGE_KEY = 'bvp:guest';

interface StoredGuest {
  name: string;
  phone: string;
}

function readStoredGuest(): StoredGuest | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGuest>;
    return parsed.name && parsed.phone ? { name: parsed.name, phone: parsed.phone } : null;
  } catch {
    // Storage bloqueado (aba anônima, política do navegador) não é erro de
    // agendamento: segue sem preencher.
    return null;
  }
}

export interface BookingWizardState {
  step: WizardStep;
  /** Direção do último movimento — decide o lado de onde o passo entra. */
  direction: 'forward' | 'backward';
  serviceIds: string[];
  /** `null` = ainda não escolheu; `'none'` = "Sem preferência". */
  barberId: string | null;
  date: string | null;
  /** ISO/UTC do horário escolhido. */
  startsAt: string | null;
  notes: string;
  guestName: string;
  guestPhone: string;
  rememberMe: boolean;
}

const INITIAL: BookingWizardState = {
  step: 1,
  direction: 'forward',
  serviceIds: [],
  barberId: null,
  date: null,
  startsAt: null,
  notes: '',
  guestName: '',
  guestPhone: '',
  rememberMe: true,
};

/**
 * Estado do wizard de 4 passos.
 *
 * A regra de ouro aqui é que o wizard NÃO calcula nada de negócio: preço,
 * combo, duração, quem atende e quais horários existem vêm do servidor
 * (`/quote` e `/availability`). O protótipo fazia tudo no cliente com
 * `SERVICES`/`BARBERS`/`SLOT_PATTERNS`; manter essa conta aqui significaria
 * duas implementações da mesma regra, e a do navegador é a que o usuário pode
 * editar.
 */
export function useBookingWizard(shop: PublicBarbershop, open: boolean) {
  const { api, client, status } = useClientAuth();
  const [state, setState] = useState<BookingWizardState>(INITIAL);
  /** Serviço pré-selecionado pelo botão "Agendar" de um card. */
  const pendingServiceRef = useRef<string | null>(null);

  const patch = useCallback((next: Partial<BookingWizardState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  const reset = useCallback(() => {
    const stored = readStoredGuest();
    setState({
      ...INITIAL,
      guestName: stored?.name ?? '',
      guestPhone: stored?.phone ?? '',
    });
  }, []);

  // Abrir o wizard sempre recomeça — inclusive depois de um agendamento feito.
  useEffect(() => {
    if (open) {
      const preselected = pendingServiceRef.current;
      pendingServiceRef.current = null;
      const stored = readStoredGuest();
      setState({
        ...INITIAL,
        serviceIds: preselected ? [preselected] : [],
        guestName: stored?.name ?? '',
        guestPhone: stored?.phone ?? '',
      });
    }
  }, [open]);

  const preselectService = useCallback((serviceId: string | null) => {
    pendingServiceRef.current = serviceId;
  }, []);

  // ── Cotação: combo, preço e cobertura de assinatura ──────────────────────

  const quoteQuery = useQuery<BookingQuote>({
    queryKey: ['booking', 'quote', shop.slug, state.serviceIds, client?.id ?? null],
    queryFn: () => bookingApi.quote(api, shop.slug, state.serviceIds),
    enabled: open && state.serviceIds.length > 0,
    // Preço e cobertura mudam pouco durante um agendamento de 1 minuto.
    staleTime: 30_000,
  });

  const quote = quoteQuery.data ?? null;

  /** Ids efetivamente reservados — o combo pode ter trocado a seleção. */
  const resolvedServiceIds = useMemo(
    () => quote?.resolvedServiceIds ?? state.serviceIds,
    [quote, state.serviceIds],
  );

  // ── Grade de horários ────────────────────────────────────────────────────

  const barberFilter = state.barberId === NO_PREFERENCE_BARBER ? null : state.barberId;

  const availabilityQuery = useQuery<AvailabilityResponse>({
    queryKey: [
      'booking',
      'availability',
      shop.slug,
      resolvedServiceIds,
      barberFilter,
      state.date,
    ],
    queryFn: () =>
      bookingApi.availability(api, shop.slug, {
        serviceIds: resolvedServiceIds,
        barberId: barberFilter,
        date: state.date ?? undefined,
      }),
    enabled: open && state.step >= 3 && resolvedServiceIds.length > 0,
    // Horário livre some rápido quando o link circula: nada de cache longo.
    staleTime: 0,
    gcTime: 0,
  });

  const availability = availabilityQuery.data ?? null;

  // O servidor escolhe o primeiro dia com vaga quando o cliente ainda não
  // escolheu; adotar essa resposta evita a faixa de dias abrir "vazia".
  useEffect(() => {
    if (availability && !state.date) {
      setState((current) =>
        current.date ? current : { ...current, date: availability.selectedDate },
      );
    }
  }, [availability, state.date]);

  // ── Navegação ────────────────────────────────────────────────────────────

  const toggleService = useCallback((serviceId: string) => {
    setState((current) => {
      const selected = new Set(current.serviceIds);
      if (selected.has(serviceId)) {
        selected.delete(serviceId);
      } else {
        selected.add(serviceId);
      }
      // Mexer nos serviços invalida barbeiro e horário: quem estava escolhido
      // pode não atender a nova seleção, e a duração mudou.
      return {
        ...current,
        serviceIds: [...selected],
        barberId: null,
        date: null,
        startsAt: null,
      };
    });
  }, []);

  const selectBarber = useCallback((barberId: string) => {
    setState((current) => ({
      ...current,
      barberId,
      // Cada barbeiro tem a sua agenda — o horário escolhido não sobrevive.
      date: null,
      startsAt: null,
    }));
  }, []);

  const selectDate = useCallback((date: string) => {
    setState((current) => ({ ...current, date, startsAt: null }));
  }, []);

  const goTo = useCallback((step: WizardStep) => {
    setState((current) => ({
      ...current,
      step,
      direction: step > current.step ? 'forward' : 'backward',
    }));
  }, []);

  const canContinue = useMemo(() => {
    switch (state.step) {
      case 1:
        return state.serviceIds.length > 0;
      case 2:
        return state.barberId !== null;
      case 3:
        return state.startsAt !== null;
      case 4:
        return client
          ? true
          : state.guestName.trim().length > 1 &&
              state.guestPhone.replace(/\D/g, '').length >= 10;
      default:
        return false;
    }
  }, [state, client]);

  const next = useCallback(() => {
    if (state.step < 4) {
      goTo((state.step + 1) as WizardStep);
    }
  }, [state.step, goTo]);

  const back = useCallback(() => {
    if (state.step > 1) {
      goTo((state.step - 1) as WizardStep);
    }
  }, [state.step, goTo]);

  /** Guarda (ou apaga) os dados do visitante conforme o interruptor da tela. */
  const persistGuest = useCallback(() => {
    if (typeof window === 'undefined' || client) return;
    try {
      if (state.rememberMe && state.guestName && state.guestPhone) {
        window.localStorage.setItem(
          GUEST_STORAGE_KEY,
          JSON.stringify({ name: state.guestName, phone: state.guestPhone }),
        );
      } else {
        window.localStorage.removeItem(GUEST_STORAGE_KEY);
      }
    } catch {
      // Sem storage, o agendamento acontece do mesmo jeito.
    }
  }, [client, state.rememberMe, state.guestName, state.guestPhone]);

  /** Havia escolha suficiente para valer o "quer mesmo sair?" do protótipo. */
  const hasProgress = state.serviceIds.length > 0 || state.barberId !== null;

  return {
    state,
    patch,
    reset,
    preselectService,
    quote,
    quoteLoading: quoteQuery.isPending && state.serviceIds.length > 0,
    availability,
    availabilityLoading: availabilityQuery.isFetching,
    refetchAvailability: availabilityQuery.refetch,
    resolvedServiceIds,
    toggleService,
    selectBarber,
    selectDate,
    goTo,
    next,
    back,
    canContinue,
    hasProgress,
    persistGuest,
    client,
    authStatus: status,
    api,
  };
}

export type BookingWizardController = ReturnType<typeof useBookingWizard>;
