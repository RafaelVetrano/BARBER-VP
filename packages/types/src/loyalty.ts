/** Fidelidade — pontos, sorteios e planos de assinatura administrados pela barbearia. Fase 07. */

import type { RaffleStatus, SubscriptionStatus } from './enums';

// ── Programa de pontos ───────────────────────────────────────────────────

export interface LoyaltyProgramConfig {
  active: boolean;
  gastoPorPonto: number;
  pontosParaDesconto: number;
  valorDesconto: number;
  expiracaoMeses: number | null;
}

export interface UpdateLoyaltyProgramDto {
  active?: boolean;
  gastoPorPonto?: number;
  pontosParaDesconto?: number;
  valorDesconto?: number;
  expiracaoMeses?: number | null;
}

export interface LoyaltyClientBalance {
  clientId: string;
  name: string;
  balance: number;
  lastEarnedAt: string | null;
  lastRedeemedAt: string | null;
}

// ── Sorteios ─────────────────────────────────────────────────────────────

export interface RaffleItem {
  id: string;
  name: string;
  description: string | null;
  prize: string;
  status: RaffleStatus;
  pointsPerEntry: number;
  startsAt: string;
  endsAt: string;
  participants: number;
  winnerClientId: string | null;
  winnerName: string | null;
  drawnAt: string | null;
}

export interface CreateRaffleDto {
  name: string;
  prize: string;
  description?: string | null;
  pointsPerEntry?: number;
  endsAt: string;
  /** Espelha o `avisarWhatsapp` do protótipo — dispara o template de aviso ao criar. */
  notifyWhatsapp?: boolean;
}

export interface DrawRaffleResult {
  raffleId: string;
  winnerClientId: string;
  winnerName: string;
}

// ── Planos de assinatura (lado da barbearia) ───────────────────────────

export interface ClientPlanItemDto {
  serviceId: string;
  serviceName: string;
  quota: number;
}

export interface ClientPlanAdminItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingDay: number;
  isPopular: boolean;
  active: boolean;
  items: ClientPlanItemDto[];
  subscriberCount: number;
}

export interface UpsertClientPlanDto {
  name: string;
  description?: string | null;
  priceCents: number;
  billingDay?: number;
  isPopular?: boolean;
  items: Array<{ serviceId: string; quota: number }>;
}

export interface SubscriberItem {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  planName: string;
  status: SubscriptionStatus;
  usages: Array<{ serviceName: string; used: number; quota: number }>;
  nextChargeAt: string | null;
}
