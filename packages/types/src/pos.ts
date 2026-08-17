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
  totalCents: number;
  paidCents: number;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface OrderListItem {
  id: string;
  number: number;
  status: OrderStatus;
  clientName: string | null;
  barberName: string | null;
  totalCents: number;
  paymentMethods: PaymentMethod[];
  openedAt: string;
  closedAt: string | null;
}

export interface OrderListQuery extends PaginationQuery {
  status?: OrderStatus;
  search?: string;
  barberId?: string;
}
export type OrderListResponse = Paginated<OrderListItem>;

export interface OpenOrderDto {
  clientId?: string | null;
  walkIn?: { name: string; phone: string } | null;
  barberId?: string | null;
  appointmentId?: string | null;
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
}

export interface ReopenOrderDto {
  reason: string;
}
