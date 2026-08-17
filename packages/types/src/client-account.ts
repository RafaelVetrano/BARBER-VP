/**
 * Contratos da área do cliente (fase 05) — `MinhaConta` e `AssinaturaCliente`.
 *
 * Tudo aqui é escopado à barbearia da URL (`/{slug}`), como o resto do booking:
 * o `Client` é global, mas agendamento e assinatura pertencem a um tenant, e a
 * `MinhaConta` mostra sempre a barbearia corrente — nunca um consolidado
 * cross-tenant (isso quebraria a regra 3, mesmo sendo "os dados do próprio
 * cliente": a barbearia B não tem por que saber que o cliente também é
 * assinante da barbearia A).
 */

import type { AppointmentStatus, PaymentMethod, PaymentStatus, SubscriptionStatus } from './enums';

// ── Agendamentos ─────────────────────────────────────────────────────────────

export interface ClientAppointmentReview {
  id: string;
  rating: number;
  comment: string | null;
}

/** Uma linha de "Próximos" ou "Histórico" — o `AppointmentSummary` do booking
 * mais o que só faz sentido dentro da conta (a nota já dada). */
export interface ClientAppointmentItem {
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
  /** Política vigente do tenant — nenhuma tela repete o número em texto fixo. */
  cancelWindowHours: number;
  /** Vale para remarcar E cancelar — a mesma janela das duas ações. */
  cancelable: boolean;
  /** Presente quando `status = DONE` e o cliente já avaliou este atendimento. */
  review: ClientAppointmentReview | null;
}

export interface ClientAppointmentsResponse {
  upcoming: ClientAppointmentItem[];
  history: ClientAppointmentItem[];
}

export interface RateAppointmentInput {
  rating: number;
  comment?: string;
}

// ── Assinatura ───────────────────────────────────────────────────────────────

export interface ClientPlanDetail {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  /** Dia do mês da cobrança recorrente. */
  billingDay: number;
  isPopular: boolean;
  items: Array<{ serviceId: string; serviceName: string; quota: number }>;
  /** Quanto o plano economiza por mês contra pagar os serviços avulso. */
  savingsCents: number;
}

export interface ClientSubscriptionUsageLine {
  serviceId: string;
  serviceName: string;
  quota: number;
  used: number;
}

export interface ClientSubscriptionDetail {
  id: string;
  planId: string;
  planName: string;
  priceCents: number;
  status: SubscriptionStatus;
  /** ISO — fim do ciclo corrente (a "próxima cobrança" quando ativa). */
  currentPeriodEnd: string;
  nextChargeAt: string | null;
  usages: ClientSubscriptionUsageLine[];
}

export interface BillingHistoryEntry {
  id: string;
  amountCents: number;
  status: PaymentStatus;
  method: PaymentMethod;
  /** ISO — `null` quando a cobrança ainda não foi confirmada. */
  paidAt: string | null;
  createdAt: string;
}

/** `GET .../account/subscription` — a assinatura, se houver, mais o histórico. */
export interface ClientSubscriptionAccount {
  /** `false` quando o tenant não tem `fidelidadeAssinaturas` no plano do SaaS —
   * o frontend usa isto para nem mostrar a aba "Assinatura". */
  enabled: boolean;
  subscription: ClientSubscriptionDetail | null;
  billingHistory: BillingHistoryEntry[];
}

export type SubscribePaymentMethod = 'CREDIT_CARD' | 'PIX';

export interface SubscribeCardInput {
  /** Só os 4 últimos dígitos sobrevivem ao servidor — o resto nunca é persistido. */
  number: string;
  expiry: string;
  cvv: string;
  holderName: string;
}

export interface SubscribeInput {
  planId: string;
  paymentMethod: SubscribePaymentMethod;
  card?: SubscribeCardInput;
}

// ── Perfil, segurança e LGPD (globais — `client-auth`) ──────────────────────

export interface UpdateClientProfileInput {
  name?: string;
  email?: string;
  notifyWhatsapp?: boolean;
  notifyEmail?: boolean;
}

export interface ChangeClientPasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/** JSON completo devolvido por "Exportar meus dados" (LGPD, art. 18 IV/V). */
export interface ExportedClientData {
  exportedAt: string;
  profile: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    birthDate: string | null;
    createdAt: string;
    consentAt: string | null;
    consentVersion: string | null;
    marketingOptIn: boolean;
    notifyWhatsapp: boolean;
    notifyEmail: boolean;
  };
  appointments: Array<{
    tenantName: string;
    bookingCode: string;
    status: AppointmentStatus;
    startsAt: string;
    services: string[];
    totalPriceCents: number;
  }>;
  subscriptions: Array<{
    tenantName: string;
    planName: string;
    status: SubscriptionStatus;
    startedAt: string;
    canceledAt: string | null;
  }>;
  reviews: Array<{
    tenantName: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  }>;
}
