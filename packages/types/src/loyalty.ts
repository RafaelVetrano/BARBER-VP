/**
 * Fidelidade — programa de pontos e planos de assinatura vendidos pela casa.
 *
 * A aba "Fidelidade" do painel mostra **só Assinaturas** desde a revisão do
 * protótipo (agente 21): as sub-abas "Pontos" e "Sorteios" saíram do desenho.
 * Os PONTOS continuam vivos como recurso (a comanda resgata, a aba Clientes
 * mostra o saldo), por isso `LoyaltyProgramConfig` fica — o que sumiu foi a
 * TELA de configuração, não o recurso. Sorteios saíram por inteiro.
 */

import type { SubscriptionStatus } from './enums';

// ── Programa de pontos (sem tela própria — ver nota acima) ───────────────

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
  /** `false` = arquivado — some da vitrine do cliente, mantém quem já assina. */
  active: boolean;
  items: ClientPlanItemDto[];
  /** Assinantes não cancelados — o "N assinantes" do card. */
  subscriberCount: number;
  /** Receita recorrente do plano: preço × assinantes que ainda faturam. */
  mrrCents: number;
  /**
   * `true` quando NENHUMA assinatura (nem cancelada) aponta para o plano —
   * a única situação em que excluir de verdade é possível. Com histórico, o
   * caminho é arquivar, e é isso que o diálogo de exclusão oferece.
   */
  canDelete: boolean;
}

export interface UpsertClientPlanDto {
  name: string;
  description?: string | null;
  priceCents: number;
  billingDay?: number;
  isPopular?: boolean;
  items: Array<{ serviceId: string; quota: number }>;
}

// ── Assinantes ───────────────────────────────────────────────────────────

/**
 * Coluna "Pagamento" do protótipo (l.1567). É derivada — não há campo no
 * banco: nasce do `Payment` do ciclo corrente cruzado com `nextChargeAt`.
 * `PAUSED` não está no desenho porque os dados de exemplo não têm assinatura
 * pausada; existe aqui porque o menu da própria tabela cria esse estado.
 */
export const SubscriptionPaymentStatus = {
  PAID: 'PAID',
  PENDING: 'PENDING',
  OVERDUE: 'OVERDUE',
  PAUSED: 'PAUSED',
} as const;
export type SubscriptionPaymentStatus =
  (typeof SubscriptionPaymentStatus)[keyof typeof SubscriptionPaymentStatus];

export interface SubscriberItem {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  paymentStatus: SubscriptionPaymentStatus;
  usages: Array<{ serviceName: string; used: number; quota: number }>;
  /** Soma dos usos do ciclo — o `3/4` e a barrinha da coluna "Usos no mês". */
  usedTotal: number;
  quotaTotal: number;
  nextChargeAt: string | null;
}
