/**
 * Configurações (Barbearia/Unidades/Plano/Preferências) e Minha Página —
 * fase 07.
 */

import type { OnboardingBusinessHour } from './onboarding';

// ── Barbearia ────────────────────────────────────────────────────────────

export interface BarbershopSettings {
  name: string;
  document: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  businessHours: OnboardingBusinessHour[];
}

export interface UpdateBarbershopSettingsDto {
  name?: string;
  document?: string | null;
  address?: string | null;
  phone?: string | null;
  timezone?: string;
  businessHours?: OnboardingBusinessHour[];
}

// ── Unidades (multi-unidade — Avançado) ──────────────────────────────────

export interface UnitItem {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  active: boolean;
  barberCount: number;
}

export interface UpsertUnitDto {
  name: string;
  address?: string | null;
  phone?: string | null;
}

// ── Plano do SaaS ────────────────────────────────────────────────────────

export interface SaasPlanOption {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  tier: number;
  maxBarbers: number | null;
  isPopular: boolean;
  features: Record<string, boolean>;
}

export interface SaasInvoiceItem {
  id: string;
  amountCents: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
  issuedAt: string;
  paidAt: string | null;
}

export interface CurrentPlanResponse {
  plan: SaasPlanOption;
  renewsAt: string;
  status: string;
  invoices: SaasInvoiceItem[];
  availablePlans: SaasPlanOption[];
  barbersInUse: number;
}

export interface ChangePlanDto {
  planId: string;
}

// ── Preferências ─────────────────────────────────────────────────────────

export interface PreferencesSettings {
  bloquearFaltasAtivo: boolean;
  bloquearFaltasQtd: number;
  antecedenciaMinima: number;
  cancelamentoHoras: number;
  /**
   * Meta de faturamento do mês, em centavos. `null` = sem meta — o gráfico do
   * Dashboard não desenha a linha tracejada (fase 13).
   */
  monthlyGoalCents: number | null;
}

export interface UpdatePreferencesDto {
  bloquearFaltasAtivo?: boolean;
  bloquearFaltasQtd?: number;
  antecedenciaMinima?: number;
  cancelamentoHoras?: number;
  /** `null` limpa a meta. */
  monthlyGoalCents?: number | null;
}

// ── Calculadora de preço inteligente (Avançado) ──────────────────────────

export interface PriceCalculatorDto {
  custoCents: number;
  margemPercent: number;
  custosFixosCents: number;
  atendimentosMes: number;
  comissaoPercent: number;
}

export interface PriceCalculatorResult {
  custoVariavelPorAtendimentoCents: number;
  precoSugeridoCents: number;
}

// ── Minha Página ─────────────────────────────────────────────────────────

export interface TenantPhotoItem {
  id: string;
  url: string;
  sortOrder: number;
}

export interface MyPageSettings {
  slug: string;
  publicUrl: string;
  sobre: string | null;
  instagram: string | null;
  address: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  showServices: boolean;
  showReviews: boolean;
  showPhotos: boolean;
  showBusinessHours: boolean;
  photos: TenantPhotoItem[];
}

export interface UpdateMyPageDto {
  slug?: string;
  sobre?: string | null;
  instagram?: string | null;
  address?: string | null;
  showServices?: boolean;
  showReviews?: boolean;
  showPhotos?: boolean;
  showBusinessHours?: boolean;
}

export interface AddTenantPhotoDto {
  url: string;
}
