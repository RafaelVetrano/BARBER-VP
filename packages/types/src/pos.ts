/**
 * Comandas (POS) — fase 07.
 *
 * O catálogo do POS é o MESMO `Service`/`Product` administrado em
 * "Serviços & Produtos" (fase 06) — aqui só o formato de leitura muda (preço
 * fotografado por item, não link vivo para o catálogo).
 */

import type { DiscountType, OrderItemKind, OrderStatus, PaymentMethod } from './enums';
import type { Paginated, PaginationQuery } from './http';

// ── Catálogo do balcão ──────────────────────────────────────────────────

export interface PosCatalogService {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  category: string | null;
  barberIds: string[];
}

export interface PosCatalogProduct {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
  category: string | null;
}

export interface PosCatalogResponse {
  services: PosCatalogService[];
  products: PosCatalogProduct[];
  barbers: Array<{ id: string; name: string }>;
  /**
   * Número que a PRÓXIMA comanda deve receber — o `#N` do cabeçalho de "Nova
   * comanda" (l.3130), mostrado antes de a comanda existir. É uma previsão: se
   * outro caixa abrir uma comanda no meio, o número real (do `OrderDetail`)
   * sai diferente e é ele que vale.
   */
  nextNumber: number;
}

// ── Comanda ──────────────────────────────────────────────────────────────

export interface OrderItemDetail {
  id: string;
  kind: OrderItemKind;
  serviceId: string | null;
  productId: string | null;
  barberId: string | null;
  barberName: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  coveredBySubscription: boolean;
}

export interface OrderPaymentDetail {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  paidAt: string | null;
}

export interface OrderDetail {
  id: string;
  number: number;
  status: OrderStatus;
  clientId: string | null;
  clientName: string | null;
  barberId: string | null;
  barberName: string | null;
  appointmentId: string | null;
  items: OrderItemDetail[];
  payments: OrderPaymentDetail[];
  subtotalCents: number;
  discountType: DiscountType | null;
  discountValue: number;
  discountCents: number;
  useLoyalty: boolean;
  loyaltyPointsUsed: number;
  loyaltyDiscountCents: number;
  loyaltyBalance: number;
  /**
   * Prévia do resgate — o card de fidelidade do protótipo (l.3283) mostra
   * "— R$ X · usa N pts" ANTES de o toggle ser ligado. Sem estes três campos
   * a tela teria que adivinhar quanto vale um resgate, ou sumir com o bloco.
   */
  loyaltyEnabled: boolean;
  loyaltyPointsRequired: number;
  loyaltyRewardCents: number;
  totalCents: number;
  paidCents: number;
  /**
   * Fechada por cortesia: o motivo que o balcão registrou (agente 31).
   * `null` em toda comanda que cobrou alguma coisa.
   */
  courtesyReason: string | null;
  /** Quanto a cortesia perdoou. `0` quando a comanda já não tinha valor. */
  courtesyCents: number;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  canceledAt: string | null;
}

/** Uma linha do resumo "2× Corte · 1× Pomada" do card de comanda aberta. */
export interface OrderListLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderListItem {
  id: string;
  number: number;
  status: OrderStatus;
  clientName: string | null;
  barberName: string | null;
  subtotalCents: number;
  totalCents: number;
  paymentMethods: PaymentMethod[];
  /** O card da comanda aberta resume os itens; a tabela de fechadas ignora. */
  lines: OrderListLine[];
  /** Cortesia: a linha da tabela mostra o selo em vez do método de pagamento. */
  courtesyReason: string | null;
  openedAt: string;
  closedAt: string | null;
  canceledAt: string | null;
}

/**
 * Contagem das abas (l.6315). Como nos chips da aba Clientes, respeita a busca
 * e IGNORA a aba escolhida — senão a aba ativa seria a única diferente de zero.
 */
export interface OrderListCounts {
  abertas: number;
  fechadasHoje: number;
}

export interface OrderListQuery extends PaginationQuery {
  status?: OrderStatus;
  /** Aba "Fechadas hoje" — recorte do dia no fuso da barbearia, não do servidor. */
  closedToday?: boolean;
  search?: string;
  barberId?: string;
}
export type OrderListResponse = Paginated<OrderListItem> & { counts: OrderListCounts };

export interface OpenOrderDto {
  clientId?: string | null;
  walkIn?: { name: string; phone: string } | null;
  barberId?: string | null;
  appointmentId?: string | null;
}

/**
 * Troca de cliente/barbeiro numa comanda aberta — o "trocar" do cabeçalho.
 * Campo ausente = não mexe; `barberId: null` = tira o barbeiro.
 */
export interface AssignOrderDto {
  clientId?: string;
  walkIn?: { name: string; phone: string };
  barberId?: string | null;
}

export interface AddOrderItemDto {
  kind: OrderItemKind;
  serviceId?: string;
  productId?: string;
  barberId?: string | null;
  quantity?: number;
}

export interface UpdateOrderItemDto {
  quantity: number;
}

export interface ApplyOrderDiscountDto {
  discountType: DiscountType | null;
  /** Basis points quando `PERCENT` (1000 = 10%), centavos quando `FIXED`. `0`/`null` remove o desconto. */
  discountValue: number;
}

export interface RedeemOrderLoyaltyDto {
  useLoyalty: boolean;
}

export interface OrderPaymentSplitDto {
  method: PaymentMethod;
  amountCents: number;
}

export interface CloseOrderDto {
  payments: OrderPaymentSplitDto[];
  /**
   * Obrigatório (5–200 chars) quando a comanda fecha sem cobrar: total zero,
   * ou algum pagamento `COURTESY`. Sem ele o fechamento é recusado com 400
   * `COURTESY_REASON_REQUIRED` — a regra do agente 31 é registrar o R$ 0, não
   * impedi-lo.
   */
  courtesyReason?: string;
}

/**
 * O fechamento por cortesia — o único corpo aceito quando a comanda não cobra.
 * Existe como helper porque o modal e os testes montam o mesmo objeto.
 */
export function courtesyPayments(): OrderPaymentSplitDto[] {
  return [{ method: 'COURTESY', amountCents: 0 }];
}

export interface ReopenOrderDto {
  reason: string;
}

/**
 * Rótulo do método de pagamento em pt-BR.
 *
 * Vive aqui porque comanda, relatório e o histórico do cliente mostram a
 * MESMA palavra — três cópias do mapa é como "Débito" vira "Cartão" só numa
 * das telas.
 */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  PIX: 'Pix',
  SUBSCRIPTION: 'Assinatura',
  LOYALTY: 'Fidelidade',
  COURTESY: 'Cortesia',
};
