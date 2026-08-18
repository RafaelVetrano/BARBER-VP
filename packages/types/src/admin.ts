/**
 * Super Admin (fase 08) — gestão da plataforma. Sem tela de referência no
 * bundle (`agente-08-super-admin.md`): fidelidade aqui é ao SISTEMA de
 * design (packages/ui, fase 02), não a um layout específico.
 */

import type { FeatureKey } from './features';
import type { Paginated, PaginationQuery } from './http';

// ── Planos do SaaS ───────────────────────────────────────────────────────

export interface AdminPlanItem {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  tier: number;
  maxBarbers: number | null;
  features: Record<FeatureKey, boolean>;
  isPopular: boolean;
  active: boolean;
  sortOrder: number;
  tenantCount: number;
}

export interface UpsertAdminPlanDto {
  code: string;
  name: string;
  priceCents: number;
  tier: number;
  maxBarbers?: number | null;
  features: Record<FeatureKey, boolean>;
  isPopular?: boolean;
  sortOrder?: number;
}

// ── Tenants ──────────────────────────────────────────────────────────────

export interface AdminTenantListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  planName: string | null;
  barberCount: number;
  appointmentsThisMonth: number;
  createdAt: string;
}

export interface AdminTenantListQuery extends PaginationQuery {
  search?: string;
  status?: string;
  planId?: string;
}
export type AdminTenantListResponse = Paginated<AdminTenantListItem>;

export interface AdminTenantMembership {
  userId: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export interface AdminTenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  plan: { id: string; name: string; priceCents: number } | null;
  subscription: { status: string; currentPeriodEnd: string; failedAttempts: number } | null;
  metrics: {
    barberCount: number;
    clientCount: number;
    appointmentsThisMonth: number;
    revenueThisMonthCents: number;
  };
  memberships: AdminTenantMembership[];
}

export interface ChangeTenantPlanDto {
  planId: string;
}

export interface ImpersonateResultDto {
  accessToken: string;
  expiresIn: number;
  tenantId: string;
  tenantSlug: string;
  ownerName: string;
}

// ── Billing ──────────────────────────────────────────────────────────────

export interface AdminInvoiceItem {
  id: string;
  tenantId: string;
  tenantName: string;
  planName: string;
  amountCents: number;
  status: string;
  issuedAt: string;
  paidAt: string | null;
}

export interface AdminInvoiceListQuery extends PaginationQuery {
  status?: string;
}
export type AdminInvoiceListResponse = Paginated<AdminInvoiceItem>;

export interface RunBillingCycleResult {
  charged: number;
  failed: number;
  suspended: number;
}

// ── Métricas ─────────────────────────────────────────────────────────────

export interface AdminMetricsResponse {
  mrrCents: number;
  activeTenants: number;
  tenantsByPlan: Array<{ planName: string; count: number }>;
  churn: { period: { from: string; to: string }; canceled: number; rate: number };
  newTenantsThisMonth: number;
}
