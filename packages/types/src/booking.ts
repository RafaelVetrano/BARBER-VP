/**
 * Contratos do booking público (fase 04).
 *
 * Mesma regra das demais famílias de tipo do pacote: o que precisa dar o MESMO
 * resultado na API e no navegador mora aqui. As funções no fim do arquivo
 * (agrupamento por período, rótulo de duração, código de reserva) são usadas
 * pelos dois lados — o servidor decide os horários, o cliente só os desenha, e
 * nenhum dos dois inventa a sua própria versão da regra.
 */

import type { AppointmentStatus } from './enums';

// ── Página pública `/{slug}` ────────────────────────────────────────────────

export interface PublicServiceSummary {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  category: string | null;
  isCombo: boolean;
  /** Serviços-base que este combo substitui (vazio quando não é combo). */
  comboPartIds: string[];
  /** Barbeiros que atendem — vazio significa "ninguém habilitado". */
  barberIds: string[];
}

export interface PublicBarberSummary {
  id: string;
  name: string;
  specialty: string | null;
  /** Nota em centésimos (490 = 4.9★) — `null` quando não há avaliação. */
  ratingBps: number | null;
  avatarUrl: string | null;
  serviceIds: string[];
}

export interface PublicBusinessHour {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** Minutos desde a meia-noite, no fuso do tenant. */
  opensAt: number;
  closesAt: number;
  closed: boolean;
}

export interface PublicClientPlanSummary {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingDay: number;
  isPopular: boolean;
  items: Array<{ serviceId: string; serviceName: string; quota: number }>;
  /** Quanto o plano economiza por mês contra o preço avulso, em centavos. */
  savingsCents: number;
}

export interface PublicReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string | null;
  barberName: string | null;
  /** ISO — o "há 3 dias" é formatado no cliente, com o fuso de quem lê. */
  createdAt: string;
}

/** Assinatura ativa do cliente logado NESTA barbearia. */
export interface PublicSubscriptionSummary {
  id: string;
  planName: string;
  /** ISO do fim do ciclo corrente — a "próxima cobrança" da tela. */
  currentPeriodEnd: string;
  usages: Array<{
    serviceId: string;
    serviceName: string;
    quota: number;
    used: number;
  }>;
}

export interface PublicBarbershop {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  logoUrl: string | null;
  coverUrl: string | null;
  about: string | null;
  instagram: string | null;
  /** Telefone de WhatsApp em E.164, pronto para `wa.me`. */
  whatsapp: string | null;
  address: string | null;
  /** Texto para o `?q=` do mapa/rota. */
  addressQuery: string | null;
  /** Seções que o dono decidiu exibir (`TenantSettings.show*`). */
  sections: {
    services: boolean;
    team: boolean;
    about: boolean;
    reviews: boolean;
  };
  /** `false` desliga o wizard: a barbearia só quer ser vitrine. */
  allowOnlineBooking: boolean;
  policy: {
    /** Antecedência mínima para agendar, em minutos. */
    minLeadMinutes: number;
    /** Janela de cancelamento/remarcação sem penalidade, em horas. */
    cancelWindowHours: number;
    /** Faltas que bloqueiam o agendamento online. */
    noShowBlockCount: number;
  };
  rating: { averageBps: number; count: number } | null;
  businessHours: PublicBusinessHour[];
  services: PublicServiceSummary[];
  barbers: PublicBarberSummary[];
  plans: PublicClientPlanSummary[];
  reviews: PublicReview[];
  /** Preenchido só quando há sessão de cliente no cabeçalho da requisição. */
  subscription: PublicSubscriptionSummary | null;
}

// ── Disponibilidade ─────────────────────────────────────────────────────────

export const SlotPeriod = {
  MORNING: 'MORNING',
  AFTERNOON: 'AFTERNOON',
  EVENING: 'EVENING',
} as const;
export type SlotPeriod = (typeof SlotPeriod)[keyof typeof SlotPeriod];

export const SLOT_PERIOD_LABEL: Record<SlotPeriod, string> = {
  MORNING: 'MANHÃ',
  AFTERNOON: 'TARDE',
  EVENING: 'NOITE',
};

export interface AvailabilitySlot {
  /** `HH:mm` no fuso do tenant. */
  time: string;
  /** Instante exato do início, em ISO/UTC — é o que a reserva envia de volta. */
  startsAt: string;
  period: SlotPeriod;
  /**
   * Barbeiros livres neste horário. Com barbeiro escolhido tem um elemento só;
   * em "Sem preferência" é a lista de quem pode assumir.
   */
  barberIds: string[];
}

export interface AvailabilityDay {
  /** `YYYY-MM-DD` no fuso do tenant. */
  date: string;
  weekday: number;
  /** Barbearia (ou o barbeiro escolhido) sem expediente no dia. */
  closed: boolean;
  /** Aberto, porém sem nenhum horário livre — o ponto vermelho do chip. */
  soldOut: boolean;
  availableCount: number;
}

export interface AvailabilityResponse {
  timezone: string;
  /** Duração total da seleção, já com o combo resolvido. */
  totalDurationMin: number;
  /** Serviços efetivamente reservados (a seleção depois do combo). */
  resolvedServiceIds: string[];
  days: AvailabilityDay[];
  /** Dia cujos horários vieram em `slots`. */
  selectedDate: string;
  slots: AvailabilitySlot[];
  /** Próximo dia com vaga a partir do selecionado — atalho do estado vazio. */
  nextAvailableDate: string | null;
  /** Primeiro horário livre desse próximo dia, `HH:mm`. */
  nextAvailableTime: string | null;
}

// ── Cotação da seleção (preço, combo e cobertura de assinatura) ─────────────

export interface QuotedService {
  serviceId: string;
  name: string;
  durationMin: number;
  /** Preço de tabela. */
  priceCents: number;
  /** Preço efetivo — `0` quando a assinatura cobre. */
  chargedCents: number;
  coveredBySubscription: boolean;
  /** Assinatura existe mas o ciclo acabou — vira a dica cinza do wizard. */
  subscriptionExhausted: boolean;
}

export interface BookingQuote {
  /** Ids após aplicar o combo (pode diferir do que foi enviado). */
  resolvedServiceIds: string[];
  /** `true` quando o combo entrou no lugar das peças — dispara o toast. */
  comboApplied: boolean;
  comboServiceName: string | null;
  services: QuotedService[];
  totalDurationMin: number;
  totalPriceCents: number;
  /** Soma do que a assinatura absorveu, em centavos. */
  coveredCents: number;
  /** Barbeiros compatíveis com a seleção inteira. */
  eligibleBarberIds: string[];
  /** Por que cada barbeiro incompatível ficou de fora ("não realiza X"). */
  ineligibleBarbers: Array<{ barberId: string; reason: string }>;
}

// ── Criação, cancelamento e remarcação ──────────────────────────────────────

export interface AppointmentSummary {
  id: string;
  bookingCode: string;
  status: AppointmentStatus;
  /** ISO/UTC. */
  startsAt: string;
  endsAt: string;
  timezone: string;
  barber: { id: string; name: string; avatarUrl: string | null };
  services: Array<{ id: string; name: string; durationMin: number; priceCents: number }>;
  totalPriceCents: number;
  coveredBySubscription: boolean;
  clientName: string;
  notes: string | null;
  /** Política vigente, lida do tenant — nenhuma tela repete "3h" no texto. */
  cancelWindowHours: number;
  /** `false` quando já passou da janela de cancelamento. */
  cancelable: boolean;
}

/**
 * Resposta de `POST /public/:slug/appointments`.
 *
 * Ou o agendamento nasceu (`confirmed`), ou o telefone caiu numa regra de risco
 * e precisa confirmar por código (`otp-required`) — nesse caso o agendamento
 * fica guardado no desafio e só nasce depois do `/appointments/confirm`.
 */
export type CreateAppointmentResult =
  | { kind: 'confirmed'; appointment: AppointmentSummary }
  | {
      kind: 'otp-required';
      challengeId: string;
      destinationMasked: string;
      expiresInSeconds: number;
      resendInSeconds: number;
    };

// ── Helpers compartilhados ──────────────────────────────────────────────────

/** Aviso de escassez do wizard: "⚡ Últimos N horários neste dia". */
export const LAST_SLOTS_THRESHOLD = 3;

/** Faixa do dia a que um horário pertence (MANHÃ < 12h ≤ TARDE < 18h ≤ NOITE). */
export function periodOfMinutes(minutesFromMidnight: number): SlotPeriod {
  if (minutesFromMidnight < 12 * 60) return SlotPeriod.MORNING;
  if (minutesFromMidnight < 18 * 60) return SlotPeriod.AFTERNOON;
  return SlotPeriod.EVENING;
}

/** `45` → `45 min`; `70` → `1h10`; `120` → `2h` (o `formatDuration` do wizard). */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
}

// `minutesToTime`/`timeToMinutes` já existem em `onboarding.ts` (o horário de
// funcionamento usa a mesma representação) — a agenda reaproveita de lá em vez
// de manter uma segunda conversão que pode divergir.

/** Valor que o wizard manda quando o cliente não escolhe barbeiro. */
export const NO_PREFERENCE_BARBER = 'none';

/** Nota em centésimos → `4.9` (o `★ 4.9` das telas). */
export function formatRatingBps(ratingBps: number): string {
  return (ratingBps / 100).toFixed(1);
}
