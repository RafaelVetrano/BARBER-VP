/** Comissões e vales — fase 07. */

import type { CommissionRuleType } from './enums';

export interface CommissionTierDto {
  /** `null` na última faixa (acima de tudo). */
  upToCents: number | null;
  percentBps: number;
}

export interface CommissionRuleItem {
  id: string;
  name: string;
  type: CommissionRuleType;
  percentBps: number | null;
  tiers: CommissionTierDto[];
  active: boolean;
  barberIds: string[];
}

export interface UpsertCommissionRuleDto {
  name: string;
  type: CommissionRuleType;
  percentBps?: number | null;
  tiers?: CommissionTierDto[];
  barberIds?: string[];
}

export interface CommissionExtractEntry {
  date: string;
  clientName: string;
  serviceName: string;
  amountCents: number;
}

export interface CommissionBarberSummary {
  barberId: string;
  barberName: string;
  ruleName: string | null;
  faturadoServicosCents: number;
  faturadoProdutosCents: number;
  valeCents: number;
  comissaoCents: number;
  totalCents: number;
  atendimentos: number;
  status: 'PENDING' | 'PAID';
  extrato: CommissionExtractEntry[];
}

export interface CommissionPeriodQuery {
  /** `YYYY-MM`. */
  month: string;
}

export interface CommissionPeriodResponse {
  month: string;
  closed: boolean;
  barbers: CommissionBarberSummary[];
}

export interface ClosePeriodDto {
  month: string;
}

// ── Vales ────────────────────────────────────────────────────────────────

export interface ValeItem {
  id: string;
  barberId: string;
  barberName: string;
  amountCents: number;
  referenceMonth: string;
  description: string | null;
  settled: boolean;
}

export interface CreateValeDto {
  barberId: string;
  amountCents: number;
  /** `YYYY-MM-DD` — o dia do adiantamento; o mês de competência é derivado dele. */
  date: string;
  description?: string | null;
}
